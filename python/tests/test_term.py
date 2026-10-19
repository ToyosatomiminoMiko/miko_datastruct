"""Term 写端:内联 / nil / 共享与环的编号 / 简写 / 有向指针与无向边."""

from __future__ import annotations

import unittest
from dataclasses import dataclass, field

from dataviz import Registry, TermOptions, TraversalError
from examples import rbt as rbt_example


@dataclass
class TNode:
    value: int = 0
    left: "TNode | None" = None
    right: "TNode | None" = None


@dataclass
class Group:
    children: list[TNode] = field(default_factory=list)


@dataclass
class Empty:
    pass


@dataclass
class TextNode:
    text: str = ""


@dataclass
class BaseNode:
    value: int = 0
    child: "BaseNode | None" = None


class SubNode(BaseNode):
    extra = 1


@dataclass
class GNode:
    key: str


@dataclass
class GEdge:
    a: GNode
    b: GNode


@dataclass
class GGraph:
    nodes: list[GNode] = field(default_factory=list)
    edges: list[GEdge] = field(default_factory=list)


def _node(value: int, left: TNode | None = None, right: TNode | None = None) -> TNode:
    return TNode(value=value, left=left, right=right)


class TermTest(unittest.TestCase):
    def _tree_registry(self) -> Registry:
        reg = Registry()
        reg.structure(TNode)
        return reg

    def test_inline_children(self):
        reg = self._tree_registry()
        root = _node(1, _node(2))
        self.assertEqual(reg.to_term(root), "t_node(1, t_node(2, nil, nil), nil)")

    def test_empty_root_children_are_nil(self):
        reg = self._tree_registry()
        self.assertEqual(reg.to_term(_node(5)), "t_node(5, nil, nil)")

    def test_zero_field_structure(self):
        reg = Registry()
        reg.structure(Empty)
        self.assertEqual(reg.to_term(Empty()), "empty()")

    def test_value_atom_quoting(self):
        reg = Registry()
        reg.structure(TextNode)
        node = TextNode(text="a b")
        self.assertEqual(reg.to_term(node), 'text_node("a b")')
        node.text = "nil"
        self.assertEqual(reg.to_term(node), 'text_node("nil")')
        node.text = "plain"
        self.assertEqual(reg.to_term(node), "text_node(plain)")

    def test_many_pointer_uses_children_wrapper(self):
        reg = Registry()
        reg.structure(TNode)
        reg.structure(Group)
        group = Group(children=[_node(1), _node(2)])
        self.assertEqual(
            reg.to_term(group),
            "group(children(t_node(1, nil, nil), t_node(2, nil, nil)))",
        )

    def test_shared_child_gets_id_and_ref(self):
        reg = self._tree_registry()
        shared = _node(7)
        root = _node(1, shared, shared)
        self.assertEqual(reg.to_term(root), "t_node(1, t_node(id(1), 7, nil, nil), ref(1))")

    def test_cycle_gets_id(self):
        reg = self._tree_registry()
        first = _node(1)
        second = _node(2)
        first.left = second
        second.left = first
        self.assertEqual(reg.to_term(first), "t_node(id(0), 1, t_node(id(1), 2, ref(0), nil), nil)")

    def test_always_ids_option(self):
        reg = self._tree_registry()
        root = _node(1, _node(2))
        self.assertEqual(
            reg.to_term(root, options=TermOptions(always_ids=True)),
            "t_node(id(0), 1, t_node(id(1), 2, nil, nil), nil)",
        )

    def test_graph_term_has_container_pointers_and_edges(self):
        reg = Registry()
        reg.structure(GNode)
        reg.structure(GEdge, as_="edge")
        reg.structure(GGraph, as_="container")
        graph = GGraph(nodes=[GNode(key="A"), GNode(key="B")])
        graph.edges = [GEdge(a=graph.nodes[0], b=graph.nodes[1])]
        self.assertEqual(
            reg.to_term(graph),
            "g_graph(children(g_node(id(1), A), g_node(id(2), B)), children(g_edge(ref(1), ref(2))))",
        )

    def test_shorthand_can_be_disabled(self):
        root = rbt_example.sample_tree()
        shorthand = rbt_example.rbt_registry.to_term(root)
        generic = rbt_example.rbt_registry.to_term(root, options=TermOptions(shorthand=False))
        self.assertEqual(shorthand, "13B(8R(1B,11R),17R(15B,25B))")
        self.assertTrue(generic.startswith("rbt(13, black, rbt(8, red,"))
        self.assertNotEqual(shorthand, generic)

    def test_subclass_lookup_when_enabled(self):
        reg = Registry()
        reg.structure(BaseNode, subclasses=True)
        subclass = SubNode(value=5)
        self.assertEqual(reg.to_term(subclass), "base_node(5, nil)")

    def test_subclass_lookup_when_disabled(self):
        reg = Registry()
        reg.structure(BaseNode)
        with self.assertRaises(TraversalError) as caught:
            reg.to_term(SubNode())
        self.assertEqual(caught.exception.code, "unknown-type")


if __name__ == "__main__":
    unittest.main()
