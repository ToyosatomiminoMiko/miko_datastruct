"""Scene 写端:把遍历出来的图写成**中性场景**,不带像素坐标.

三种图元,方向语义严格区分:

- **node**:一个圆节点(整数 key / 展示 label / 结构特有 attrs);
- **pointer**:一条**有向**指针,`from -> to`,两端都是节点 key;
- **edge**:一条**无向**边,来自 `as_="edge"` 的结构(两端节点 key / 可选 label / attrs).

没有 block / 数组:数组类结构以后作为单独种类再加.

JSON 形状(值为 None 的键省略,空 attrs 也省略):

    {
      "nodes": [
        {"key": 0, "label": "13", "attrs": {"color": "black"}}
      ],
      "pointers": [{"from": 0, "to": 1}],
      "edges": [
        {"a": 0, "b": 1, "label": "name=桥1", "attrs": {"name": "桥1"}}
      ]
    }

key 规则(稳定、可快照):

- `nodes[].key` 是**整数**,在 nodes 内唯一,按遍历顺序从 0 开始;
- `pointers[].from` / `to` 与 `edges[].a` / `b` 都引用节点 key;
- pointer / edge **自己不带 key**:现在没有任何图元引用它们,带了也没人读.

为什么不用 `"n0"` / `"e0"` 这种字符串编号:

- 三种图元已经各自住在三个数组里,角色由数组区分,前缀字母是重复信息;
- 引用端点需要的是"哪一个节点",整数 key 比再拼一个字符串直接;
- 没有前缀之后,`key` 也不必再叫 `id`:它只是本场景内的局部编号,与数据对象自己的
  `key` / `id` 属性不是一回事.

**attrs 是数据结构差异化的唯一入口**:通用槽(节点的 key / label、指针的 from / to、
边的 a / b / label)之外的所有 `Attr` 字段都进 attrs,键就是字段名,值用原生 JSON 标量
(Enum 取 `.value`).没有 `variant`:渲染端要区分红 / 黑,就自己读 `attrs.color` 并按
各结构的样式表处理.

- 节点:`attrs` = 除 label 来源字段之外的其余属性.`label` 来源由 `label="字段名"`
  指定;没指定时按 `key` -> `id` -> `value` 找;再找不到就用属性拼 `名字=值`.
- 边:`attrs` = 除两个端点指针之外的其余属性.边 label 是展示文字,不占用 attrs.
- `None` 不当成值,不进 attrs(JSON 里省略);空字符串是值,照常进 attrs.

场景**不标 shape**:树 / 图 / 链是内容本身的性质,由渲染端的布局器从 nodes / pointers /
edges 推出来(度数、是否有环、有没有无向边),不靠一个自报的标签.`as_` 只决定一个对象
被写成哪种图元.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any, Callable, Mapping

from .errors import RenderError
from .formatting import JsonScalar, format_scalar, scalar_json
from .roles import Attr
from .spec import StructureSpec
from .traversal import FieldValue, Graph, NodeRecord

__all__ = [
    "SceneNode",
    "ScenePointer",
    "SceneEdge",
    "Scene",
    "SceneWriter",
]


def _empty_attrs() -> Mapping[str, JsonScalar]:
    """空 attrs 的只读默认值:多个节点共用一个空映射,不各自建 dict."""
    return MappingProxyType({})


@dataclass(frozen=True)
class SceneNode:
    """一个圆节点:没有坐标,只有 key / 展示 label / 结构特有 attrs."""

    key: int
    label: str
    attrs: Mapping[str, JsonScalar] = field(default_factory=_empty_attrs)


@dataclass(frozen=True)
class ScenePointer:
    """一条**有向**指针:从 `from_` 指向 `to`,两端是节点 key.

    不带 `variant`:字段名(left / right / parent)是数据结构语义,不属于中性场景;方向
    已经由 `from -> to` 表达.将来真要在箭头上显示文字,再加 `label`.
    """

    from_: int
    to: int


@dataclass(frozen=True)
class SceneEdge:
    """一条**无向**边:两端是节点 key,label 是可选展示文字,attrs 是其余属性.

    不带 key:现在没有别的图元引用边,这个字段没有消费者.
    """

    a: int
    b: int
    label: str | None = None
    attrs: Mapping[str, JsonScalar] = field(default_factory=_empty_attrs)


@dataclass(frozen=True)
class Scene:
    """一幅中性场景:节点 / 有向指针 / 无向边;不标树或图,也不带坐标."""

    nodes: tuple[SceneNode, ...]
    pointers: tuple[ScenePointer, ...]
    edges: tuple[SceneEdge, ...]

    def to_dict(self) -> dict[str, Any]:
        """转成可以 json.dumps 的 dict(键按 nodes / pointers / edges 的固定顺序)."""
        return {
            "nodes": [
                _compact({
                    "key": node.key,
                    "label": node.label,
                    "attrs": _attrs_dict(node.attrs),
                })
                for node in self.nodes
            ],
            "pointers": [
                {"from": pointer.from_, "to": pointer.to}
                for pointer in self.pointers
            ],
            "edges": [
                _compact({
                    "a": edge.a,
                    "b": edge.b,
                    "label": edge.label,
                    "attrs": _attrs_dict(edge.attrs),
                })
                for edge in self.edges
            ],
        }

    def dumps(self, *, indent: int = 2) -> str:
        """转成 JSON 文本(中文不转义,方便人读)."""
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=indent)


def _compact(pairs: dict[str, Any]) -> dict[str, Any]:
    """去掉值为 None 的键:没 label / 没 attrs 就不写空字段."""
    return {key: value for key, value in pairs.items() if value is not None}


def _attrs_dict(attrs: Mapping[str, JsonScalar]) -> dict[str, JsonScalar] | None:
    """空 attrs 不写进 JSON(与 "可选字段省略" 同一口径)."""
    return dict(attrs) if attrs else None


class SceneWriter:
    """一次 Scene 写出的状态:节点输出 key 的分配.

    key 只在 nodes 内编号;pointer / edge 引用节点 key,自己不需要编号.
    """

    def __init__(self, graph: Graph) -> None:
        self.graph = graph
        self._node_keys: dict[int, int] = {}
        node_index = 0
        for record in graph.order:
            if record.opaque or (record.spec is not None and record.spec.as_ == "node"):
                self._node_keys[id(record.obj)] = node_index
                node_index += 1

    # 出口

    def write(self) -> Scene:
        return Scene(
            nodes=tuple(self._nodes()),
            pointers=tuple(self._pointers()),
            edges=tuple(self._edges()),
        )

    # 节点

    def _nodes(self) -> list[SceneNode]:
        nodes: list[SceneNode] = []
        for record in self.graph.order:
            if record.opaque:
                nodes.append(SceneNode(self._node_keys[id(record.obj)], _opaque_label(record.obj)))
                continue
            if record.spec is None or record.spec.as_ != "node":
                continue
            nodes.append(SceneNode(
                self._node_keys[id(record.obj)],
                _node_label(record),
                _node_attrs(record),
            ))
        return nodes

    # 边

    def _edges(self) -> list[SceneEdge]:
        edges: list[SceneEdge] = []
        for record in self.graph.order:
            if record.spec is None or record.spec.as_ != "edge":
                continue
            endpoints = record.spec.pointer_fields
            if len(endpoints) != 2:
                raise RenderError(
                    "bad-edge",
                    f"边 {record.spec.name} 需要恰好两个端点指针,实际 {len(endpoints)} 个",
                    path=record.path,
                )
            values = {field_value.field.name: field_value.value for field_value in record.values}
            endpoints_values = [values[endpoint.name] for endpoint in endpoints]
            node_keys: list[int] = []
            for endpoint, endpoint_value in zip(endpoints, endpoints_values):
                if endpoint_value is None:
                    raise RenderError(
                        "bad-edge",
                        f"边 {record.spec.name} 的端点 {endpoint.name} 是 None",
                        path=f"{record.path}.{endpoint.name}",
                    )
                target = self.graph.records.get(id(endpoint_value))
                if target is None or target.spec is None or target.spec.as_ != "node":
                    raise RenderError(
                        "bad-edge",
                        f"边 {record.spec.name} 的端点 {endpoint.name} 必须指向 node 结构",
                        path=f"{record.path}.{endpoint.name}",
                    )
                node_keys.append(self._node_keys[id(endpoint_value)])
            edges.append(SceneEdge(
                node_keys[0],
                node_keys[1],
                _edge_label(record),
                _edge_attrs(record),
            ))
        return edges

    # 指针

    def _pointers(self) -> list[ScenePointer]:
        pointers: list[ScenePointer] = []
        for edge in self.graph.ref_edges:
            source = self.graph.records[edge.from_oid]
            if source.spec is None or source.spec.as_ != "node":
                # container 的引用是聚合、edge 的两个指针是端点:都不画成 node 指针
                continue
            from_key = self._node_keys.get(edge.from_oid)
            to_key = self._node_keys.get(edge.to_oid)
            if from_key is None:
                continue
            if to_key is None:
                target = self.graph.records[edge.to_oid]
                target_name = target.spec.name if target.spec is not None else "未注册对象"
                raise RenderError(
                    "bad-pointer",
                    f"节点指针 {edge.field_name} 指向了 {target_name},它不是一个 node",
                    path=edge.path,
                )
            pointers.append(ScenePointer(from_key, to_key))
        return pointers


# 标签


def _node_label(record: NodeRecord) -> str:
    """节点展示文字:label 字段 / label 钩子 / 默认 key-id-value / 拼属性."""
    spec = record.spec
    assert spec is not None
    source = _label_source(spec, record.values)
    default = _default_node_label(spec, record.values, source)
    if spec.label is None:
        return default
    if isinstance(spec.label, str):
        return default
    result = _hook_text(spec.label, record.obj, default, record.path, "label")
    return default if result is None else result


def _default_node_label(
    spec: StructureSpec,
    values: tuple[FieldValue, ...],
    source: str | None,
) -> str:
    if source is not None:
        return format_scalar(_field_value(values, source))
    pairs = _attr_pairs(values)
    return ", ".join(pairs) if pairs else spec.name


def _label_source(spec: StructureSpec, values: tuple[FieldValue, ...]) -> str | None:
    """哪个属性字段是节点的通用展示槽(它不进 attrs)."""
    if isinstance(spec.label, str):
        return spec.label
    if spec.label is not None:
        # 可调用钩子可能组合任意字段,不知道它消费了谁:不排除任何 attrs
        return None
    for candidate in ("key", "id", "value"):
        if any(
            field_value.field.name == candidate and isinstance(field_value.field.role, Attr)
            for field_value in values
        ):
            return candidate
    return None


def _edge_label(record: NodeRecord) -> str | None:
    spec = record.spec
    assert spec is not None
    default = _default_edge_label(record.values)
    if spec.label is None:
        return default
    if isinstance(spec.label, str):
        value = _field_value(record.values, spec.label)
        return None if value is None else format_scalar(value)
    return _hook_text(spec.label, record.obj, default, record.path, "label")


# attrs


def _node_attrs(record: NodeRecord) -> Mapping[str, JsonScalar]:
    spec = record.spec
    assert spec is not None
    source = _label_source(spec, record.values)
    return _attrs(record.values, exclude=source)


def _edge_attrs(record: NodeRecord) -> Mapping[str, JsonScalar]:
    return _attrs(record.values)


def _attrs(values: tuple[FieldValue, ...], exclude: str | None = None) -> Mapping[str, JsonScalar]:
    """所有 `Attr` 字段 -> JSON 标量;`None` 不写,label 来源字段可排除."""
    attrs: dict[str, JsonScalar] = {}
    for field_value in values:
        if not isinstance(field_value.field.role, Attr):
            continue
        if field_value.value is None:
            continue
        if field_value.field.name == exclude:
            continue
        attrs[field_value.field.name] = scalar_json(field_value.value)
    return MappingProxyType(attrs)


# 默认观感


def _hook_text(
    hook: Callable[[Any], str] | None,
    obj: Any,
    default: str | None,
    path: str,
    name: str,
) -> str | None:
    if hook is None:
        return default
    try:
        result = hook(obj)
    except Exception as exc:  # 钩子是用户代码,异常要带路径再抛,不能吞
        raise RenderError("hook-failed", f"{name} 钩子抛错:{exc}", path=path) from exc
    return default if result is None else str(result)


def _field_value(values: tuple[FieldValue, ...], name: str) -> Any:
    for field_value in values:
        if field_value.field.name == name:
            return field_value.value
    # 注册期已经校验过 label 字段存在,走到这里说明字段表在遍历后被改过
    raise RenderError("bad-label", f"label 指向的字段 {name!r} 不在字段表里")


def _attr_pairs(values: tuple[FieldValue, ...]) -> list[str]:
    """把属性拼成 `名字=值`;None 与空字符串不参与拼接(避免 `name=` 这种噪声)."""
    pairs: list[str] = []
    for field_value in values:
        if not isinstance(field_value.field.role, Attr):
            continue
        if field_value.value is None:
            continue
        text = format_scalar(field_value.value)
        if text == "":
            continue
        pairs.append(f"{field_value.field.name}={text}")
    return pairs


def _default_edge_label(values: tuple[FieldValue, ...]) -> str | None:
    pairs = _attr_pairs(values)
    return ", ".join(pairs) if pairs else None


def _opaque_label(obj: Any) -> str:
    text = repr(obj)
    return text if len(text) <= 40 else text[:37] + "..."
