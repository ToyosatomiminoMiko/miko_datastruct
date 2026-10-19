"""Term 写端:把遍历出来的图写成**通用项字面量**文本.

语法只有一份(通用项字面量,这里只实现写侧):

    source := term EOF
    term   := atom [ '(' [ term (',' term)* ] ')' ]

本模块只负责"写";解析(reader + codec)在 web 侧,不在这个 demo 里.

三个写法约定:

- **树 / 只被引用一次**:子项**内联**(可读性最好),例如红黑树 `rbt(13, B, ...)`;
- **共享 / 成环**:给节点分配编号,第一次出现写 `构造子(id(n), 字段...)`,之后再遇到
  写 `ref(n)`.编号取遍历顺序,与 Scene 里的编号不一定一致(有 container 时会更明显);
- **结构专属简写**:`spec.term_hook(obj, parts)` 可以改写一个节点的写法,但只能改写
  **写法**,不能改变字段语义(它拿到的是各字段已经写好的片段,按 spec.fields 顺序).

指针字段:`T | None` 写 `nil` 或子项;`list[T]` 写 `children(...)`.
"""

from __future__ import annotations

from dataclasses import dataclass

from .formatting import atom, format_scalar
from .roles import Attr, Pointer
from .traversal import FieldValue, Graph, NodeRecord

__all__ = ["TermOptions", "TermWriter"]

# 深度优先搜索的三种颜色
_WHITE = 0
_GRAY = 1
_BLACK = 2


@dataclass(frozen=True)
class TermOptions:
    """写 Term 时的开关.

    - `always_ids`:每个节点都带编号(调试 / 往返测试用);
    - `shorthand`:是否使用 `spec.term_hook` 的结构专属简写(关掉就是通用写法).
    """

    always_ids: bool = False
    shorthand: bool = True


class TermWriter:
    """一次 Term 写出的状态:哪几个节点需要编号、哪些已经写过."""

    def __init__(self, graph: Graph, options: TermOptions | None = None) -> None:
        self.graph = graph
        self.options = options or TermOptions()
        self._needs_id = _nodes_needing_id(graph)
        if self.options.always_ids:
            self._needs_id |= set(graph.records)
        self._written: set[int] = set()

    # 出口

    def write(self) -> str:
        return self._object(self.graph.root_oid)

    # 对象节点

    def _object(self, oid: int) -> str:
        record = self.graph.records[oid]
        if record.opaque:
            return self._opaque(oid, record)

        needs_id = oid in self._needs_id
        if needs_id:
            if oid in self._written:
                return f"ref({record.nid})"
            self._written.add(oid)
            prefix = [f"id({record.nid})"]
        else:
            if oid in self._written:
                # 只有"被引用两次"的节点才会走到这里;正常都在 _needs_id 里,兜底成 ref
                return f"ref({record.nid})"
            self._written.add(oid)
            prefix = []

        parts = [self._field_term(record, field_value) for field_value in record.values]
        if not needs_id and self.options.shorthand and record.spec is not None and record.spec.term_hook is not None:
            return record.spec.term_hook(record.obj, parts)

        name = record.spec.name if record.spec is not None else "node"
        return f"{name}({', '.join(prefix + parts)})"

    def _opaque(self, oid: int, record: NodeRecord) -> str:
        needs_id = oid in self._needs_id
        if needs_id:
            if oid in self._written:
                return f"ref({record.nid})"
            self._written.add(oid)
            return f"opaque(id({record.nid}), {atom(repr(record.obj))})"
        return f"opaque({atom(repr(record.obj))})"

    # 单个字段

    def _field_term(self, record: NodeRecord, field_value: FieldValue) -> str:
        role = field_value.field.role
        value = field_value.value

        if isinstance(role, Attr):
            return atom(format_scalar(value))

        if isinstance(role, Pointer):
            if role.many:
                children = [] if value is None else list(value)
                inner = ", ".join(self._object(id(child)) for child in children if child is not None)
                return f"children({inner})"
            if value is None:
                return "nil"
            return self._object(id(value))

        raise AssertionError(f"未处理的角色: {type(role).__name__}")


# 哪些节点需要编号


def _nodes_needing_id(graph: Graph) -> set[int]:
    """共享(入度 > 1)或参与环的节点需要编号.

    入度把根算作一次引用:根自身再被别的节点引用(自环 / 指回根)时,根也需要编号.
    """
    in_degree: dict[int, int] = {graph.root_oid: 1}
    for edge in graph.ref_edges:
        in_degree[edge.to_oid] = in_degree.get(edge.to_oid, 0) + 1
    return {oid for oid, degree in in_degree.items() if degree > 1} | _cyclic_nodes(graph)


def _cyclic_nodes(graph: Graph) -> set[int]:
    """找出参与环的节点(DFS:遇到灰色节点时,当前栈上从它开始的那一段就是环)."""
    adjacency: dict[int, list[int]] = {}
    for edge in graph.ref_edges:
        adjacency.setdefault(edge.from_oid, []).append(edge.to_oid)

    colors: dict[int, int] = {}
    cyclic: set[int] = set()
    for start_oid in graph.records:
        if colors.get(start_oid, _WHITE) != _WHITE:
            continue
        colors[start_oid] = _GRAY
        # 显式栈,避免深树触发 Python 递归上限
        stack: list[tuple[int, int, list[int]]] = [(start_oid, 0, adjacency.get(start_oid, []))]
        path: list[int] = [start_oid]
        while stack:
            oid, index, children = stack[-1]
            if index >= len(children):
                colors[oid] = _BLACK
                stack.pop()
                path.pop()
                continue
            stack[-1] = (oid, index + 1, children)
            child = children[index]
            color = colors.get(child, _WHITE)
            if color == _GRAY:
                cyclic.update(path[path.index(child):])
            elif color == _WHITE:
                colors[child] = _GRAY
                stack.append((child, 0, adjacency.get(child, [])))
                path.append(child)
    return cyclic
