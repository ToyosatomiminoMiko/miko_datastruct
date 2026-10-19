"""三个例子的端到端结果:Term 文本、Scene 结构、checks 结论."""

from __future__ import annotations

import unittest

from dataviz import TermOptions
from examples import graph as graph_example
from examples import node as node_example
from examples import rbt as rbt_example


class NodeExampleTest(unittest.TestCase):
    def test_term_and_scene(self):
        diagram = node_example.registry.diagram(node_example.make())
        self.assertEqual(diagram.term, "node(A, 5)")
        self.assertEqual([node.label for node in diagram.scene.nodes], ["A"])
        self.assertEqual(diagram.scene.pointers, ())
        self.assertEqual(diagram.scene.edges, ())


class GraphExampleTest(unittest.TestCase):
    def setUp(self) -> None:
        self.diagram = graph_example.graph_registry.diagram(graph_example.sample_graph())

    def test_term(self):
        self.assertEqual(
            self.diagram.term,
            "graph(children(place(id(1), K), place(id(2), N), place(id(3), S), place(id(4), E)), "
            "children(bridge(ref(1), ref(2)), bridge(ref(1), ref(2)), bridge(ref(1), ref(3)), "
            "bridge(ref(1), ref(3)), bridge(ref(1), ref(4)), bridge(ref(2), ref(4)), "
            "bridge(ref(3), ref(4))))",
        )

    def test_scene_nodes(self):
        scene = self.diagram.scene
        self.assertEqual([node.label for node in scene.nodes], ["K", "N", "S", "E"])
        self.assertEqual([node.key for node in scene.nodes], [0, 1, 2, 3])
        self.assertEqual(scene.pointers, ())

    def test_scene_edges(self):
        edges = [(edge.a, edge.b) for edge in self.diagram.scene.edges]
        self.assertEqual(len(edges), 7)
        self.assertEqual(edges.count((0, 1)), 2)  # K-N 两座桥
        self.assertEqual(edges.count((0, 2)), 2)  # K-S 两座桥
        self.assertEqual(edges.count((0, 3)), 1)  # K-E
        self.assertEqual(edges.count((1, 3)), 1)  # N-E
        self.assertEqual(edges.count((2, 3)), 1)  # S-E

    def test_euler_check_fails(self):
        self.assertEqual(len(self.diagram.checks), 1)
        check = self.diagram.checks[0]
        self.assertFalse(check.passed)
        self.assertIn("奇数度节点", check.detail)
        self.assertIn("K(度5)", check.detail)


class RbtExampleTest(unittest.TestCase):
    def test_shorthand_term_matches_web_expression(self):
        root = rbt_example.sample_tree()
        self.assertEqual(rbt_example.rbt_registry.to_term(root), "13B(8R(1B,11R),17R(15B,25B))")

    def test_generic_term(self):
        root = rbt_example.sample_tree()
        self.assertEqual(
            rbt_example.rbt_registry.to_term(root, options=TermOptions(shorthand=False)),
            "rbt(13, B, rbt(8, R, rbt(1, B, nil, nil), rbt(11, R, nil, nil)), "
            "rbt(17, R, rbt(15, B, nil, nil), rbt(25, B, nil, nil)))",
        )

    def test_scene_nodes_and_pointers(self):
        root = rbt_example.sample_tree()
        scene = rbt_example.rbt_registry.to_scene(root)
        self.assertEqual(len(scene.nodes), 7)
        self.assertEqual(len(scene.pointers), 6)
        self.assertEqual(scene.edges, ())
        self.assertEqual([node.label for node in scene.nodes], ["13", "8", "1", "11", "17", "15", "25"])
        self.assertEqual(
            [node.variant for node in scene.nodes],
            ["black", "red", "black", "red", "red", "black", "black"],
        )
        self.assertEqual([node.key for node in scene.nodes], [0, 1, 2, 3, 4, 5, 6])
        self.assertEqual(
            [(pointer.from_, pointer.to) for pointer in scene.pointers],
            [
                (0, 1),
                (1, 2),
                (1, 3),
                (0, 4),
                (4, 5),
                (4, 6),
            ],
        )


if __name__ == "__main__":
    unittest.main()
