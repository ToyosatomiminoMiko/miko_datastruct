"""Scene 写端:节点 scene key / attrs / 有向指针 / 无向边 / 错误包装."""

from __future__ import annotations

import json
import unittest
from dataclasses import dataclass, field
from enum import Enum

from dataviz import Registry, RenderContext, RenderError, Scene, SceneNode, SceneWriter, TraversalError


@dataclass
class SNode:
    key: str
    value: int = 0
    left: "SNode | None" = None
    right: "SNode | None" = None


@dataclass
class IdNode:
    id: int
    value: int = 0


@dataclass
class ValueNode:
    value: int = 3


@dataclass
class BareNode:
    count: int = 0
    note: str = ""
    next: "BareNode | None" = None


@dataclass
class MaybeKeyNode:
    key: "str | None" = None


class Hue(Enum):
    RED = "red"
    BLACK = "black"


@dataclass
class EnumNode:
    key: str
    color: Hue = Hue.RED


@dataclass
class MixedNode:
    key: str
    count: int = 3
    flag: bool = True
    note: "str | None" = None
    color: Hue = Hue.BLACK


@dataclass
class Place:
    key: str


@dataclass
class Bridge:
    a: Place
    b: Place
    name: str = ""


@dataclass
class Graph:
    nodes: list[Place] = field(default_factory=list)
    edges: list[Bridge] = field(default_factory=list)


@dataclass
class EdgeKind:
    a: Place
    b: Place


@dataclass
class NodeToEdge:
    key: str
    edge: "EdgeKind | None" = None


class Unknown:
    pass


class SceneTest(unittest.TestCase):
    def test_scene_key_comes_from_key_field_and_value_becomes_attr(self):
        reg = Registry()
        reg.structure(SNode)
        root = SNode(key="A", left=SNode(key="B"))
        scene = reg.to_scene(root)
        # 节点 key 就是数据键,不再是输出编号;来源字段 key 不进 attrs
        self.assertEqual([node.key for node in scene.nodes], ["A", "B"])
        self.assertEqual(scene.nodes[0].attrs, {"value": 0})
        self.assertNotIn("key", scene.nodes[0].attrs)
        self.assertEqual([(pointer.from_, pointer.to) for pointer in scene.pointers], [("A", "B")])

    def test_key_falls_back_to_id_then_value(self):
        reg = Registry()
        reg.structure(IdNode)
        reg.structure(ValueNode)
        id_scene = reg.to_scene(IdNode(id=7, value=5))
        self.assertEqual(id_scene.nodes[0].key, 7)
        self.assertEqual(id_scene.nodes[0].attrs, {"value": 5})
        value_scene = reg.to_scene(ValueNode(value=9))
        # value 被当 key:它自己不重复进 attrs,所以节点没有 attrs
        self.assertEqual(value_scene.nodes[0].key, 9)
        self.assertEqual(value_scene.nodes[0].attrs, {})

    def test_node_without_key_field_uses_traversal_index(self):
        reg = Registry()
        reg.structure(BareNode)
        root = BareNode(next=BareNode())
        scene = reg.to_scene(root)
        # 没有 key / id / value:退回遍历序号(按遍历顺序只数 node)
        self.assertEqual([node.key for node in scene.nodes], [0, 1])
        # 没有来源字段要排除,所有 Attr 都进 attrs(空字符串也是值)
        self.assertEqual(scene.nodes[0].attrs, {"count": 0, "note": ""})
        self.assertEqual([(pointer.from_, pointer.to) for pointer in scene.pointers], [(0, 1)])

    def test_enum_attr_uses_enum_value(self):
        reg = Registry()
        reg.structure(EnumNode)
        scene = reg.to_scene(EnumNode(key="A"))
        self.assertEqual(scene.nodes[0].key, "A")
        self.assertEqual(scene.nodes[0].attrs, {"color": "red"})

    def test_enum_key_is_normalized_to_enum_value(self):
        scene = Scene(nodes=(SceneNode(Hue.BLACK),), pointers=(), edges=())
        self.assertEqual(scene.nodes[0].key, "black")
        self.assertEqual(scene.to_dict()["nodes"], [{"key": "black"}])

    def test_attrs_keep_json_scalars_and_omit_none(self):
        reg = Registry()
        reg.structure(MixedNode)
        scene = reg.to_scene(MixedNode(key="A"))
        # int / bool / Enum 都是 JSON 标量;None 不进 attrs
        self.assertEqual(scene.nodes[0].attrs, {"count": 3, "flag": True, "color": "black"})

    def test_duplicate_key_is_rejected(self):
        reg = Registry()
        reg.structure(SNode)
        root = SNode(key="A", left=SNode(key="A"))
        with self.assertRaises(RenderError) as caught:
            reg.to_scene(root)
        self.assertEqual(caught.exception.code, "duplicate-key")

    def test_mixed_key_types_are_rejected(self):
        with self.assertRaises(RenderError) as caught:
            Scene(nodes=(SceneNode("A"), SceneNode(0)), pointers=(), edges=())
        self.assertEqual(caught.exception.code, "bad-key")

    def test_bad_key_type_is_rejected(self):
        # bool 是 int 的子类,但不是数值键;None / tuple / 空串 / 非有限数都不行
        for bad_key in (True, None, ("A",), "", float("inf"), float("nan")):
            with self.subTest(bad_key=bad_key):
                with self.assertRaises(RenderError) as caught:
                    SceneNode(bad_key)  # type: ignore[arg-type]
                self.assertEqual(caught.exception.code, "bad-key")

    def test_none_key_value_is_rejected_with_path(self):
        reg = Registry()
        reg.structure(MaybeKeyNode)
        with self.assertRaises(RenderError) as caught:
            reg.to_scene(MaybeKeyNode(key=None))
        # 来源字段存在但值为 None:报错而不是悄悄退回序号
        self.assertEqual(caught.exception.code, "bad-key")
        self.assertEqual(caught.exception.path, "root.key")

    def test_pointers_are_directed_and_only_carry_endpoint_keys(self):
        reg = Registry()
        reg.structure(SNode)
        root = SNode(key="A", left=SNode(key="B"), right=SNode(key="C"))
        scene = reg.to_scene(root)
        self.assertEqual(
            [(pointer.from_, pointer.to) for pointer in scene.pointers],
            [("A", "B"), ("A", "C")],
        )
        # 字段名(left / right)不是中性场景的一部分:方向已经由 from -> to 表达
        self.assertFalse(hasattr(scene.pointers[0], "variant"))

    def test_graph_scene_has_nodes_and_edges_but_no_pointers(self):
        reg = Registry()
        reg.structure(Place)
        reg.structure(Bridge, as_="edge")
        reg.structure(Graph, as_="container")
        a, b, c = Place(key="K"), Place(key="N"), Place(key="S")
        graph = Graph(nodes=[a, b, c], edges=[Bridge(a=a, b=b), Bridge(a=b, b=c)])
        scene = reg.to_scene(graph)
        self.assertEqual([node.key for node in scene.nodes], ["K", "N", "S"])
        self.assertEqual([node.attrs for node in scene.nodes], [{}, {}, {}])
        self.assertEqual(scene.pointers, ())
        self.assertEqual([(edge.a, edge.b) for edge in scene.edges], [("K", "N"), ("N", "S")])

    def test_edge_attrs_from_attributes(self):
        reg = Registry()
        reg.structure(Place)
        reg.structure(Bridge, as_="edge")
        reg.structure(Graph, as_="container")
        a, b = Place(key="A"), Place(key="B")
        graph = Graph(nodes=[a, b], edges=[Bridge(a=a, b=b, name="桥1")])
        scene = reg.to_scene(graph)
        self.assertEqual(scene.edges[0].attrs, {"name": "桥1"})
        # 边没有展示字段:文案只由 attrs 决定
        self.assertFalse(hasattr(scene.edges[0], "label"))

    def test_edge_missing_endpoint_is_error(self):
        reg = Registry()
        reg.structure(Place)
        reg.structure(Bridge, as_="edge")
        reg.structure(Graph, as_="container")
        a = Place(key="A")
        graph = Graph(nodes=[a], edges=[Bridge(a=a, b=None)])  # type: ignore[arg-type]
        with self.assertRaises(RenderError) as caught:
            reg.to_scene(graph)
        self.assertEqual(caught.exception.code, "bad-edge")

    def test_node_pointer_to_non_node_is_error(self):
        reg = Registry()
        reg.structure(Place)
        reg.structure(EdgeKind, as_="edge")
        reg.structure(NodeToEdge)
        edge = EdgeKind(a=Place(key="A"), b=Place(key="B"))
        with self.assertRaises(RenderError) as caught:
            reg.to_scene(NodeToEdge(key="X", edge=edge))
        self.assertEqual(caught.exception.code, "bad-pointer")

    def test_unknown_type_raises(self):
        reg = Registry()
        with self.assertRaises(TraversalError) as caught:
            RenderContext(reg, Unknown()).traverse()
        self.assertEqual(caught.exception.code, "unknown-type")

    def test_opaque_mode(self):
        reg = Registry()
        graph = RenderContext(reg, Unknown(), on_unknown="opaque").traverse()
        scene = SceneWriter(graph).write()
        # opaque 对象没有字段表:只能退回遍历序号,也没有 attrs
        self.assertEqual(scene.nodes[0].key, 0)
        self.assertEqual(scene.nodes[0].attrs, {})
        self.assertFalse(hasattr(scene.nodes[0], "label"))

    def test_json_has_keys_and_attrs_no_shape(self):
        reg = Registry()
        reg.structure(Place)
        reg.structure(Bridge, as_="edge")
        reg.structure(Graph, as_="container")
        a, b = Place(key="A"), Place(key="B")
        data = json.loads(
            reg.to_scene(Graph(nodes=[a, b], edges=[Bridge(a=a, b=b, name="桥1")])).dumps(),
        )
        # 场景不标树 / 图:布局由渲染端从内容推
        self.assertNotIn("shape", data)
        # 节点 key 是数据键;连接图元自己不需要 key
        self.assertEqual(data["nodes"][0], {"key": "A"})
        self.assertEqual(
            data["edges"][0],
            {"a": "A", "b": "B", "attrs": {"name": "桥1"}},
        )
        self.assertEqual(data["pointers"], [])
        for node in data["nodes"]:
            self.assertNotIn("label", node)

    def test_pointer_json_is_just_from_and_to(self):
        reg = Registry()
        reg.structure(SNode)
        data = reg.to_scene(SNode(key="A", left=SNode(key="B"))).to_dict()
        self.assertEqual(data["pointers"], [{"from": "A", "to": "B"}])


if __name__ == "__main__":
    unittest.main()
