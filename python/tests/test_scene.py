"""Scene 写端:节点标签 / 变体 / 有向指针 / 无向边 / 错误包装."""

from __future__ import annotations

import json
import unittest
from dataclasses import dataclass, field

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


@dataclass
class ColoredNode:
    key: str
    color: str = "R"


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


def _boom_variant(instance: object) -> str:
    raise RuntimeError("boom")


class SceneTest(unittest.TestCase):
    def test_node_label_prefers_key(self):
        reg = Registry()
        reg.structure(SNode)
        root = SNode(key="A", left=SNode(key="B"))
        scene = reg.to_scene(root)
        self.assertEqual([node.key for node in scene.nodes], [0, 1])
        self.assertEqual([node.label for node in scene.nodes], ["A", "B"])

    def test_node_label_without_key_joins_attributes(self):
        reg = Registry()
        reg.structure(NamedNode)
        scene = reg.to_scene(NamedNode(label="hello"))
        self.assertEqual(scene.nodes[0].label, "label=hello")

    def test_variant_hook(self):
        reg = Registry()
        reg.structure(ColoredNode, variant=lambda node: "red" if node.color == "R" else "black")
        scene = reg.to_scene(ColoredNode(key="A"))
        self.assertEqual(scene.nodes[0].variant, "red")

    def test_hook_exception_is_wrapped_with_path(self):
        reg = Registry()
        reg.structure(ColoredNode, variant=_boom_variant)
        with self.assertRaises(RenderError) as caught:
            reg.to_scene(ColoredNode(key="A"))
        self.assertEqual(caught.exception.code, "hook-failed")
        self.assertEqual(caught.exception.path, "root")

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

    def test_edge_label_from_attributes(self):
        reg = Registry()
        reg.structure(Place)
        reg.structure(Bridge, as_="edge")
        reg.structure(Graph, as_="container")
        a, b = Place(key="A"), Place(key="B")
        graph = Graph(nodes=[a, b], edges=[Bridge(a=a, b=b, name="桥1")])
        scene = reg.to_scene(graph)
        self.assertEqual(scene.edges[0].label, "name=桥1")

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
        self.assertEqual(scene.nodes[0].variant, "opaque")
        self.assertIn("Unknown object", scene.nodes[0].label)

    def test_json_has_integer_keys_and_no_shape(self):
        reg = Registry()
        reg.structure(Place)
        reg.structure(Bridge, as_="edge")
        reg.structure(Graph, as_="container")
        a, b = Place(key="A"), Place(key="B")
        data = json.loads(reg.to_scene(Graph(nodes=[a, b], edges=[Bridge(a=a, b=b)])).dumps())
        # 场景不标树 / 图:布局由渲染端从内容推
        self.assertNotIn("shape", data)
        # 节点 key 是整数,不再有 "n0" / "e0" 前缀;连接图元自己不需要 key
        self.assertEqual(data["nodes"][0], {"key": 0, "label": "A"})
        self.assertEqual(data["edges"][0], {"a": 0, "b": 1})
        self.assertEqual(data["pointers"], [])

    def test_pointer_json_is_just_from_and_to(self):
        reg = Registry()
        reg.structure(SNode)
        data = reg.to_scene(SNode(key="A", left=SNode(key="B"))).to_dict()
        self.assertEqual(data["pointers"], [{"from": 0, "to": 1}])


if __name__ == "__main__":
    unittest.main()
