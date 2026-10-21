"""四个例子的端到端结果:Scene 结构与 web 读的 JSON.

节点 key 就是数据键:BST / RBT 是 number,node / graph 是 string;显示与引用都用它.
JSON 里没有检查结论,也没有结构名:要跑哪些检查由 web 侧「检查配置」窗口单独给.
"""

from __future__ import annotations

import json
import unittest

from examples import bst as bst_example
from examples import graph as graph_example
from examples import node as node_example
from examples import rbt as rbt_example


class NodeExampleTest(unittest.TestCase):
    def test_scene(self):
        diagram = node_example.registry.diagram(node_example.make())
        self.assertEqual([node.key for node in diagram.scene.nodes], ["A"])
        self.assertEqual([node.attrs for node in diagram.scene.nodes], [{"value": 5}])
        self.assertEqual(diagram.scene.pointers, ())
        self.assertEqual(diagram.scene.edges, ())

    def test_json_is_the_web_document(self):
        diagram = node_example.registry.diagram(node_example.make())
        data = json.loads(diagram.dumps())
        self.assertEqual(data["nodes"], [{"key": "A", "attrs": {"value": 5}}])
        self.assertEqual(data["pointers"], [])
        self.assertEqual(data["edges"], [])
        self.assertNotIn("checks", data)


class GraphExampleTest(unittest.TestCase):
    def setUp(self) -> None:
        self.diagram = graph_example.graph_registry.diagram(graph_example.sample_graph())

    def test_scene_nodes(self):
        scene = self.diagram.scene
        self.assertEqual([node.key for node in scene.nodes], ["K", "N", "S", "E"])
        self.assertEqual([node.attrs for node in scene.nodes], [{}, {}, {}, {}])
        self.assertEqual(scene.pointers, ())

    def test_scene_edges_reference_node_keys(self):
        edges = [(edge.a, edge.b) for edge in self.diagram.scene.edges]
        self.assertEqual(len(edges), 7)
        self.assertEqual(edges.count(("K", "N")), 2)  # K-N 两座桥
        self.assertEqual(edges.count(("K", "S")), 2)  # K-S 两座桥
        self.assertEqual(edges.count(("K", "E")), 1)  # K-E
        self.assertEqual(edges.count(("N", "E")), 1)  # N-E
        self.assertEqual(edges.count(("S", "E")), 1)  # S-E

    def test_json_has_only_scene_graphics(self):
        # 结构名与检查结论都不进 JSON:检查由 web 的「检查配置」窗口选择
        data = json.loads(self.diagram.dumps())
        self.assertEqual(data["nodes"][0], {"key": "K"})
        self.assertEqual(len(data["edges"]), 7)
        self.assertEqual(data["edges"][0], {"a": "K", "b": "N"})
        self.assertNotIn("checks", data)


class BstExampleTest(unittest.TestCase):
    def test_scene_nodes_and_pointers(self):
        root = bst_example.sample_tree()
        scene = bst_example.bst_registry.to_scene(root)
        self.assertEqual(len(scene.nodes), 7)
        self.assertEqual(len(scene.pointers), 6)
        self.assertEqual(scene.edges, ())
        # key 就是数据键,直接用于显示与引用
        self.assertEqual([node.key for node in scene.nodes], [8, 4, 2, 6, 12, 10, 14])
        # BST 没有 attrs:key 来源字段不进 attrs,JSON 里就不会出现空的 attrs
        self.assertEqual([node.attrs for node in scene.nodes], [{}] * 7)
        self.assertEqual(
            [(pointer.from_, pointer.to) for pointer in scene.pointers],
            [
                (8, 4),
                (4, 2),
                (4, 6),
                (8, 12),
                (12, 10),
                (12, 14),
            ],
        )

    def test_json_is_the_web_bst_example(self):
        # 与 web 内置「二叉搜索树」示例同形:节点与指针可以直接对照
        data = json.loads(bst_example.bst_registry.diagram(bst_example.sample_tree()).dumps())
        self.assertEqual(data["nodes"], [
            {"key": 8},
            {"key": 4},
            {"key": 2},
            {"key": 6},
            {"key": 12},
            {"key": 10},
            {"key": 14},
        ])
        self.assertEqual(data["pointers"], [
            {"from": 8, "to": 4},
            {"from": 4, "to": 2},
            {"from": 4, "to": 6},
            {"from": 8, "to": 12},
            {"from": 12, "to": 10},
            {"from": 12, "to": 14},
        ])
        self.assertNotIn("checks", data)


class RbtExampleTest(unittest.TestCase):
    def test_scene_nodes_and_pointers(self):
        root = rbt_example.sample_tree()
        scene = rbt_example.rbt_registry.to_scene(root)
        self.assertEqual(len(scene.nodes), 7)
        self.assertEqual(len(scene.pointers), 6)
        self.assertEqual(scene.edges, ())
        self.assertEqual([node.key for node in scene.nodes], [13, 8, 1, 11, 17, 15, 25])
        # 颜色是 Enum 的 value,进 attrs;key 来源字段不再重复进 attrs
        self.assertEqual(
            [node.attrs for node in scene.nodes],
            [
                {"color": "black"},
                {"color": "red"},
                {"color": "black"},
                {"color": "black"},
                {"color": "red"},
                {"color": "black"},
                {"color": "black"},
            ],
        )
        self.assertEqual(
            [(pointer.from_, pointer.to) for pointer in scene.pointers],
            [
                (13, 8),
                (8, 1),
                (8, 11),
                (13, 17),
                (17, 15),
                (17, 25),
            ],
        )

    def test_json_nodes_carry_color_attrs(self):
        data = json.loads(rbt_example.rbt_registry.diagram(rbt_example.sample_tree()).dumps())
        self.assertEqual(data["nodes"][0], {"key": 13, "attrs": {"color": "black"}})
        self.assertEqual(data["nodes"][1], {"key": 8, "attrs": {"color": "red"}})


if __name__ == "__main__":
    unittest.main()
