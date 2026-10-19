"""Scene 写端:节点标签 / attrs / 有向指针 / 无向边 / 错误包装."""

from __future__ import annotations

import json
import unittest
from dataclasses import dataclass, field
from enum import Enum

from dataviz import Registry, RenderContext, RenderError, SceneWriter, TraversalError


@dataclass
class SNode:
    key: str
    value: int = 0
    left: "SNode | None" = None
    right: "SNode | None" = None


@dataclass
class NamedNode:
    label: str = "x"


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


def _boom_label(instance: object) -> str:
    raise RuntimeError("boom")


class SceneTest(unittest.TestCase):
    def test_node_label_prefers_key_and_value_becomes_attr(self):
        reg = Registry()
        reg.structure(SNode)
        root = SNode(key="A", left=SNode(key="B"))
        scene = reg.to_scene(root)
        self.assertEqual([node.key for node in scene.nodes], [0, 1])
        self.assertEqual([node.label for node in scene.nodes], ["A", "B"])
        # value 不是 label 来源,作为结构属性进 attrs;int 保持 number
        self.assertEqual(scene.nodes[0].attrs, {"value": 0})

    def test_node_label_without_generic_field_joins_attributes(self):
        reg = Registry()
        reg.structure(NamedNode)
        scene = reg.to_scene(NamedNode(label="hello"))
        self.assertEqual(scene.nodes[0].label, "label=hello")

    def test_enum_attr_uses_enum_value(self):
        reg = Registry()
        reg.structure(EnumNode)
        scene = reg.to_scene(EnumNode(key="A"))
        self.assertEqual(scene.nodes[0].label, "A")
        self.assertEqual(scene.nodes[0].attrs, {"color": "red"})

    def test_label_field_is_excluded_from_attrs(self):
        reg = Registry()
        reg.structure(EnumNode, label="color")
        scene = reg.to_scene(EnumNode(key="A"))
        # label 指向 color:color 进 label,key 反而成了普通属性
        self.assertEqual(scene.nodes[0].label, "red")
        self.assertEqual(scene.nodes[0].attrs, {"key": "A"})

    def test_label_hook_overrides_default(self):
        reg = Registry()
        reg.structure(EnumNode, label=lambda node: f"{node.key}!")
        scene = reg.to_scene(EnumNode(key="A"))
        self.assertEqual(scene.nodes[0].label, "A!")
        # 可调用钩子可能消费任意字段,库不知道消费了谁:attrs 保留全部属性
        self.assertEqual(scene.nodes[0].attrs, {"key": "A", "color": "red"})

    def test_label_hook_exception_is_wrapped_with_path(self):
        reg = Registry()
        reg.structure(EnumNode, label=_boom_label)
        with self.assertRaises(RenderError) as caught:
            reg.to_scene(EnumNode(key="A"))
        self.assertEqual(caught.exception.code, "hook-failed")
        self.assertEqual(caught.exception.path, "root")

    def test_attrs_keep_json_scalars_and_omit_none(self):
        reg = Registry()
        reg.structure(MixedNode)
        scene = reg.to_scene(MixedNode(key="A"))
        # int / bool / Enum 都是 JSON 标量;None 不进 attrs
        self.assertEqual(scene.nodes[0].attrs, {"count": 3, "flag": True, "color": "black"})

    def test_pointers_are_directed_and_only_carry_endpoint_keys(self):
        reg = Registry()
        reg.structure(SNode)
        root = SNode(key="A", left=SNode(key="B"), right=SNode(key="C"))
        scene = reg.to_scene(root)
        self.assertEqual(
            [(pointer.from_, pointer.to) for pointer in scene.pointers],
            [(0, 1), (0, 2)],
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
        self.assertEqual([node.key for node in scene.nodes], [0, 1, 2])
        self.assertEqual([node.label for node in scene.nodes], ["K", "N", "S"])
        self.assertEqual(scene.pointers, ())
        self.assertEqual([(edge.a, edge.b) for edge in scene.edges], [(0, 1), (1, 2)])

    def test_edge_label_and_attrs_from_attributes(self):
        reg = Registry()
        reg.structure(Place)
        reg.structure(Bridge, as_="edge")
        reg.structure(Graph, as_="container")
        a, b = Place(key="A"), Place(key="B")
        graph = Graph(nodes=[a, b], edges=[Bridge(a=a, b=b, name="桥1")])
        scene = reg.to_scene(graph)
        self.assertEqual(scene.edges[0].label, "name=桥1")
        self.assertEqual(scene.edges[0].attrs, {"name": "桥1"})

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
        self.assertEqual(scene.nodes[0].attrs, {})
        self.assertIn("Unknown object", scene.nodes[0].label)

    def test_json_has_integer_keys_no_shape_and_attrs(self):
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
        # 节点 key 是整数,不再有 "n0" / "e0" 前缀;连接图元自己不需要 key
        self.assertEqual(data["nodes"][0], {"key": 0, "label": "A"})
        self.assertEqual(
            data["edges"][0],
            {"a": 0, "b": 1, "label": "name=桥1", "attrs": {"name": "桥1"}},
        )
        self.assertEqual(data["pointers"], [])

    def test_pointer_json_is_just_from_and_to(self):
        reg = Registry()
        reg.structure(SNode)
        data = reg.to_scene(SNode(key="A", left=SNode(key="B"))).to_dict()
        self.assertEqual(data["pointers"], [{"from": 0, "to": 1}])


if __name__ == "__main__":
    unittest.main()
