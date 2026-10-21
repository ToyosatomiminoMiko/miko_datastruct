"""Scene 写端:把遍历出来的图写成**中性场景**,不带像素坐标.

三种图元,方向语义严格区分:

- **node**:一个圆节点(`key` + 结构特有 attrs);`key` 就是数据键,也是渲染端显示的文字;
- **pointer**:一条**有向**指针,`from -> to`,两端都是节点 key;
- **edge**:一条**无向**边,来自 `as_="edge"` 的结构(两端节点 key / attrs).

没有 block / 数组:数组类结构以后作为单独种类再加.

JSON 形状(值为 None 的键省略,空 attrs 也省略):

    {
      "nodes": [
        {"key": 8, "attrs": {"color": "black"}},
        {"key": "K"}
      ],
      "pointers": [{"from": 8, "to": 4}],
      "edges": [{"a": "K", "b": "N", "attrs": {"name": "桥1"}}]
    }

key 规则(稳定、可快照):

- `nodes[].key` 是**数据键**:取节点对象上第一个存在的 `key` -> `id` -> `value` 属性
  (只认 `Attr` 角色字段)的值;没有这样的属性时退回遍历序号(按遍历顺序只数 node,
  从 0 开始).`as_="node"` 以外不产出 node,opaque 节点一律用遍历序号;
- key 只能是 JSON 标量里的 int / float / str(Enum 先取 `.value`);bool 是 int 的子类,
  但不是数值键,必须挡掉;数值必须是有限数(JSON 没有 Infinity / NaN),字符串不能为空
  (web 的解析器同样这么要求);来源字段存在而值不合法时直接报 `bad-key`,不悄悄退回序号;
- 同一份文档里 key 必须**唯一**且**同类型**(全 number 或全 string):渲染端拿它当节点
  身份与引用标识,重复或混淆都无解,分别报 `duplicate-key` / `bad-key`;
- `pointers[].from` / `to` 与 `edges[].a` / `b` 都引用节点 key;
- pointer / edge **自己不带 key**:现在没有任何图元引用它们,带了也没人读.

为什么不用 `"n0"` / `"e0"` 这种字符串编号:

- 三种图元已经各自住在三个数组里,角色由数组区分,前缀字母是重复信息;
- 引用端点需要的是"哪一个节点",直接引用数据键比再拼一个字符串直接;
- 没有前缀之后,`key` 也不必再叫 `id`:它就是数据对象的键值,渲染端显示与检查定位都
  直接用它,不需要额外的映射表.

**attrs 是数据结构差异化的唯一入口**:通用槽(节点的 key、指针的 from / to、边的 a / b)
之外的所有 `Attr` 字段都进 attrs,键就是字段名,值用原生 JSON 标量(Enum 取 `.value`).
没有 `variant`:渲染端要区分红 / 黑,就自己读 `attrs.color` 并按各结构的样式表处理.

- 节点:`attrs` = 被选作 scene key 的来源字段之外的其余属性(来源字段已经是 key,不重复);
- 边:`attrs` = 除两个端点指针之外的其余属性.
- `None` 不当成值,不进 attrs(JSON 里省略);空字符串是值,照常进 attrs.

场景**不标 shape**:树 / 图 / 链是内容本身的性质,由渲染端的布局器从 nodes / pointers /
edges 推出来(度数、是否有环、有没有无向边),不靠一个自报的 shape 标记.`as_` 只决定一个对象
被写成哪种图元.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from enum import Enum
from types import MappingProxyType
from typing import Any, Mapping

from .errors import RenderError
from .formatting import JsonScalar, scalar_json
from .roles import Attr
from .traversal import FieldValue, Graph, NodeRecord

__all__ = [
    "SceneNode",
    "ScenePointer",
    "SceneEdge",
    "Scene",
    "SceneWriter",
]

#: scene key 的合法类型:JSON 的 number / string
SceneKey = int | float | str

#: 找 scene key 时依次尝试的属性名;第一个存在且是 Attr 的字段胜出
_KEY_SOURCE_FIELDS = ("key", "id", "value")


def _empty_attrs() -> Mapping[str, JsonScalar]:
    """空 attrs 的只读默认值:多个节点共用一个空映射,不各自建 dict."""
    return MappingProxyType({})


def _scene_key(value: Any, *, path: str | None = None) -> SceneKey:
    """把候选值规整成 scene key:Enum 先取 `.value`,再要求 int / float / str.

    bool 必须在 int 判断之前挡掉:`True` 是 `int` 的子类,但 JSON 里 true 不是数值键.
    """
    if isinstance(value, Enum):
        value = scalar_json(value)
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise RenderError(
            "bad-key",
            f"scene key 只能是 int / float / str,实际 {value!r}({type(value).__name__})",
            path=path,
        )
    if isinstance(value, float) and not math.isfinite(value):
        raise RenderError("bad-key", f"scene key 必须是有限数,实际 {value!r}", path=path)
    if isinstance(value, str) and value == "":
        raise RenderError("bad-key", "scene key 不能是空字符串", path=path)
    return value


@dataclass(frozen=True)
class SceneNode:
    """一个圆节点:没有坐标,key 就是数据键与显示文字,attrs 是结构特有属性."""

    key: SceneKey
    attrs: Mapping[str, JsonScalar] = field(default_factory=_empty_attrs)

    def __post_init__(self) -> None:
        # frozen dataclass 里规整 Enum:Scene 之后只处理 JSON 原生标量,不再做类型转换
        object.__setattr__(self, "key", _scene_key(self.key))


@dataclass(frozen=True)
class ScenePointer:
    """一条**有向**指针:从 `from_` 指向 `to`,两端是节点 key.

    不带 `variant`:字段名(left / right / parent)是数据结构语义,不属于中性场景;方向
    已经由 `from -> to` 表达.将来真要在箭头上显示文字,再加字段.
    """

    from_: SceneKey
    to: SceneKey


@dataclass(frozen=True)
class SceneEdge:
    """一条**无向**边:两端是节点 key,attrs 是其余属性.

    不带 key:现在没有别的图元引用边,这个字段没有消费者.
    """

    a: SceneKey
    b: SceneKey
    attrs: Mapping[str, JsonScalar] = field(default_factory=_empty_attrs)


@dataclass(frozen=True)
class Scene:
    """一幅中性场景:节点 / 有向指针 / 无向边;不标树或图,也不带坐标."""

    nodes: tuple[SceneNode, ...]
    pointers: tuple[ScenePointer, ...]
    edges: tuple[SceneEdge, ...]

    def __post_init__(self) -> None:
        _validate_node_keys(self.nodes)

    def to_dict(self) -> dict[str, Any]:
        """转成可以 json.dumps 的 dict(键按 nodes / pointers / edges 的固定顺序)."""
        return {
            "nodes": [
                _compact({
                    "key": node.key,
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
                    "attrs": _attrs_dict(edge.attrs),
                })
                for edge in self.edges
            ],
        }

    def dumps(self, *, indent: int = 2) -> str:
        """转成 JSON 文本(中文不转义,方便人读)."""
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=indent)


def _validate_node_keys(nodes: tuple[SceneNode, ...]) -> None:
    """同一文档的 node key 必须唯一且同类型.

    重复没有消歧规则,场景写出来渲染端就无法把指针指回唯一节点;number 与 string 混在
    一起则连"同一种引用"都不成立.两者都在写出阶段报错,错误码区分.
    """
    kinds: set[str] = set()
    seen: dict[SceneKey, int] = {}
    for index, node in enumerate(nodes):
        kinds.add("number" if isinstance(node.key, (int, float)) else "string")
        # 8 与 8.0 在 JSON 数值语义里是同一个 key,Python 的 dict 也按相等归并
        if node.key in seen:
            raise RenderError(
                "duplicate-key",
                f"nodes[{index}].key = {node.key!r} 与 nodes[{seen[node.key]}] 重复;同一文档的 key 必须唯一",
            )
        seen[node.key] = index
    if len(kinds) > 1:
        raise RenderError(
            "bad-key",
            "同一文档的 node key 必须同类型(全 number 或全 string),实际混用了 number 与 string",
        )


def _compact(pairs: dict[str, Any]) -> dict[str, Any]:
    """去掉值为 None 的键:没 attrs 就不写空字段."""
    return {key: value for key, value in pairs.items() if value is not None}


def _attrs_dict(attrs: Mapping[str, JsonScalar]) -> dict[str, JsonScalar] | None:
    """空 attrs 不写进 JSON(与 "可选字段省略" 同一口径)."""
    return dict(attrs) if attrs else None


class SceneWriter:
    """一次 Scene 写出的状态:节点 scene key 的分配.

    key 只分配给 node;pointer / edge 引用节点 key,自己不需要编号.
    """

    def __init__(self, graph: Graph) -> None:
        self.graph = graph
        self._node_keys: dict[int, SceneKey] = {}
        self._key_sources: dict[int, str | None] = {}
        node_index = 0
        for record in graph.order:
            if not _is_node_record(record):
                continue
            source, value = _key_source(record)
            if source is None:
                # 没有可当 key 的属性:用遍历序号兜底,保证 Scene 仍可写出
                scene_key: SceneKey = node_index
            else:
                scene_key = _scene_key(value, path=f"{record.path}.{source}")
            self._node_keys[id(record.obj)] = scene_key
            self._key_sources[id(record.obj)] = source
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
            if not _is_node_record(record):
                continue
            key = self._node_keys[id(record.obj)]
            if record.opaque:
                # opaque 对象没有字段表,只有遍历序号可用
                nodes.append(SceneNode(key))
                continue
            nodes.append(SceneNode(key, _node_attrs(record, self._key_sources[id(record.obj)])))
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
            node_keys: list[SceneKey] = []
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


# 身份


def _is_node_record(record: NodeRecord) -> bool:
    """这个记录会不会写成 node:opaque 对象与 `as_="node"` 的结构是,container / edge 不是."""
    return record.opaque or (record.spec is not None and record.spec.as_ == "node")


def _key_source(record: NodeRecord) -> tuple[str | None, Any]:
    """节点 scene key 的来源字段与原始值;没有可用字段时返回 `(None, None)`.

    按 `key` -> `id` -> `value` 的优先级找,只认 `Attr` 角色:指针是关系,不能当身份.
    """
    for candidate in _KEY_SOURCE_FIELDS:
        for field_value in record.values:
            if field_value.field.name == candidate and isinstance(field_value.field.role, Attr):
                return candidate, field_value.value
    return None, None


# attrs


def _node_attrs(record: NodeRecord, key_source: str | None) -> Mapping[str, JsonScalar]:
    return _attrs(record.values, exclude=key_source)


def _edge_attrs(record: NodeRecord) -> Mapping[str, JsonScalar]:
    return _attrs(record.values)


def _attrs(values: tuple[FieldValue, ...], exclude: str | None = None) -> Mapping[str, JsonScalar]:
    """所有 `Attr` 字段 -> JSON 标量;`None` 不写,scene key 来源字段可排除."""
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
