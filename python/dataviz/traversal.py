"""遍历:把用户对象图读成一张中性的图(记录 / 有向指针边).

两条约定决定这里的一切:

1. **身份是 `id(obj)`**.共享节点、环都靠它:同一个对象第二次遇到只记一条边,不再展开.
   不用 `__eq__`:图里两个值相等的节点就是两个节点(柯尼斯堡的多重边也是同一个道理).
2. **字段顺序 = Term 参数顺序**.遍历按 `spec.fields` 的顺序走,所以 Term / Scene 的输出
   天然稳定,可以直接快照.

遇到指针字段就递归,并记一条"谁指向谁"的有向边;指针的目标类型在注解里已经定死,这里
按 `isinstance` 再校验一次.遍历是**只读**的:不写用户对象,不调用 property.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .errors import TraversalError
from .roles import Pointer
from .spec import FieldSpec, StructureSpec

__all__ = [
    "FieldValue",
    "NodeRecord",
    "RefEdge",
    "Graph",
    "RenderContext",
]


@dataclass
class FieldValue:
    """一个字段在实例上的当前值(已读出来,不再回读用户对象)."""

    field: FieldSpec
    value: Any


@dataclass
class NodeRecord:
    """图里的一个对象节点(id 是对象身份,不是输出里的编号)."""

    obj: Any
    spec: StructureSpec | None
    nid: int
    path: str
    values: tuple[FieldValue, ...] = ()
    opaque: bool = False


@dataclass(frozen=True)
class RefEdge:
    """一条有向指针边(Pointer 字段)."""

    from_oid: int
    to_oid: int
    field_name: str
    path: str


@dataclass
class Graph:
    """一次遍历的完整结果,TermWriter / SceneWriter 都只读它."""

    root_oid: int
    root: Any
    registry: Any
    records: dict[int, NodeRecord]
    order: list[NodeRecord]
    ref_edges: list[RefEdge]
    shape: str | None


class RenderContext:
    """一次遍历的上下文:身份映射 / 路径 / 上限 / 未注册类型的处理方式."""

    def __init__(
        self,
        registry: Any,
        root: Any,
        *,
        max_depth: int = 200,
        max_nodes: int = 10_000,
        on_unknown: str = "error",
    ) -> None:
        if on_unknown not in ("error", "opaque"):
            raise ValueError("on_unknown 只能是 'error' 或 'opaque'")
        self.registry = registry
        self.root = root
        self.max_depth = max_depth
        self.max_nodes = max_nodes
        self.on_unknown = on_unknown
        self._records: dict[int, NodeRecord] = {}
        self._order: list[NodeRecord] = []
        self._ref_edges: list[RefEdge] = []

    # 出口

    def traverse(self) -> Graph:
        """从根开始遍历,交回一张图.根是 None 时直接报错(调用方该先判空)."""
        if self.root is None:
            raise TraversalError("empty-root", "根是 None:没有可画的结构")
        root_record = self._visit(self.root, "root", 0)
        shape = root_record.spec.shape if root_record.spec is not None else None
        return Graph(
            root_oid=id(self.root),
            root=self.root,
            registry=self.registry,
            records=self._records,
            order=self._order,
            ref_edges=self._ref_edges,
            shape=shape,
        )

    # 单个对象

    def _visit(self, obj: Any, path: str, depth: int) -> NodeRecord:
        oid = id(obj)
        existing = self._records.get(oid)
        if existing is not None:
            return existing
        if depth > self.max_depth:
            raise TraversalError("max-depth", f"嵌套超过 {self.max_depth} 层,可能是误连成巨型图", path=path)

        spec = self.registry._lookup_spec(type(obj))
        if spec is None:
            if self.on_unknown == "opaque":
                record = NodeRecord(obj=obj, spec=None, nid=len(self._order), path=path, opaque=True)
                self._records[oid] = record
                self._order.append(record)
                return record
            raise TraversalError(
                "unknown-type",
                f"{type(obj).__module__}.{type(obj).__qualname__} 未注册;用 @reg.structure 注册,或 on_unknown='opaque'",
                path=path,
            )
        if len(self._order) >= self.max_nodes:
            raise TraversalError("max-nodes", f"节点数超过上限 {self.max_nodes}", path=path)

        record = NodeRecord(obj=obj, spec=spec, nid=len(self._order), path=path)
        self._records[oid] = record
        self._order.append(record)

        values: list[FieldValue] = []
        for spec_field in spec.fields:
            value = self._read(obj, spec_field, path)
            values.append(FieldValue(field=spec_field, value=value))
            if isinstance(spec_field.role, Pointer):
                self._follow_pointer(record, spec_field, spec_field.role, value, path, depth)
        record.values = tuple(values)
        return record

    def _follow_pointer(
        self,
        record: NodeRecord,
        spec_field: FieldSpec,
        role: Pointer,
        value: Any,
        path: str,
        depth: int,
    ) -> None:
        """指针字段:0..1 条就递归一个,0..n 条就按列表逐条递归."""
        child_path = f"{path}.{spec_field.name}"
        if value is None:
            # None 对两种基数都合法:0..1 条就是没有指针,0..n 条就是空列表
            return

        if role.many:
            if not isinstance(value, (list, tuple)):
                raise TraversalError(
                    "bad-pointer",
                    f"{spec_field.name} 标注为 0..n 条指针,值必须是 list / tuple,实际 {type(value).__name__}",
                    path=child_path,
                )
            for index, child in enumerate(value):
                if child is None:
                    continue
                item_path = f"{child_path}[{index}]"
                self._check_target(spec_field, role, child, item_path)
                self._ref_edges.append(RefEdge(id(record.obj), id(child), spec_field.name, item_path))
                self._visit(child, item_path, depth + 1)
            return

        self._check_target(spec_field, role, value, child_path)
        self._ref_edges.append(RefEdge(id(record.obj), id(value), spec_field.name, child_path))
        self._visit(value, child_path, depth + 1)

    def _check_target(self, spec_field: FieldSpec, role: Pointer, value: Any, path: str) -> None:
        if not isinstance(value, role.target):
            raise TraversalError(
                "bad-pointer",
                f"{spec_field.name} 标注指向 {role.target.__name__},实际是 {type(value).__name__}",
                path=path,
            )

    def _read(self, obj: Any, spec_field: FieldSpec, path: str) -> Any:
        child_path = f"{path}.{spec_field.name}"
        try:
            return getattr(obj, spec_field.name)
        except AttributeError as exc:
            raise TraversalError("missing-field", f"字段 {spec_field.name} 读不到:{exc}", path=child_path) from exc
