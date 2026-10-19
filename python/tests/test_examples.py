"""三个例子的端到端结果:Scene 结构、checks 结论,以及 web 读的 JSON."""

from __future__ import annotations

import json
import unittest

from examples import graph as graph_example
from examples import node as node_example
from examples import rbt as rbt_example


class NodeExampleTest(unittest.TestCase):
    def test_scene(self):
        diagram = node_example.registry.diagram(node_example.make())
        self.assertEqual([node.label for node in diagram.scene.nodes], ["A"])
        self.assertEqual(diagram.scene.pointers, ())
        self.assertEqual(diagram.scene.edges, ())

    def test_json_is_the_web_document(self):
        diagram = node_example.registry.diagram(node_example.make())
        data = json.loads(diagram.dumps())
        self.assertEqual(data["nodes"], [{"key": 0, "label": "A", "attrs": {"value": 5}}])
        self.assertEqual(data["pointers"], [])
        self.assertEqual(data["edges"], [])
        self.assertNotIn("checks", data)


class GraphExampleTest(unittest.TestCase):
    def setUp(self) -> None:
        self.diagram = graph_example.graph_registry.diagram(graph_example.sample_graph())

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

    def test_json_carries_checks(self):
        data = json.loads(self.diagram.dumps())
        self.assertEqual(data["nodes"][0], {"key": 0, "label": "K"})
        self.assertEqual(len(data["edges"]), 7)
        self.assertEqual(len(data["checks"]), 1)
        self.assertFalse(data["checks"][0]["passed"])
        self.assertIn("奇数度节点", data["checks"][0]["detail"])


class RbtExampleTest(unittest.TestCase):
    def test_scene_nodes_and_pointers(self):
        root = rbt_example.sample_tree()
        scene = rbt_example.rbt_registry.to_scene(root)
        self.assertEqual(len(scene.nodes), 7)
        self.assertEqual(len(scene.pointers), 6)
        self.assertEqual(scene.edges, ())
        self.assertEqual([node.label for node in scene.nodes], ["13", "8", "1", "11", "17", "15", "25"])
        # 颜色是 Enum 的 value,进 attrs;label 用的 key 不再重复进 attrs
        self.assertEqual(
            [node.attrs for node in scene.nodes],
            [
                {"color": "black"},
                {"color": "red"},
                {"color": "black"},
                {"color": "red"},
                {"color": "red"},
                {"color": "black"},
                {"color": "black"},
            ],
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
