"""字段发现与角色推断:属性 / 指针、前向引用、结构种类校验、报错约定."""

from __future__ import annotations

import unittest
from dataclasses import dataclass, field
from typing import ClassVar

from dataviz import Attr, Pointer, Registry, RegistrationError, TraversalError


@dataclass
class DcNode:
    key: int = 0
    left: "DcNode | None" = None
    right: "DcNode | None" = None


@dataclass
class DcGroup:
    members: list[DcNode] = field(default_factory=list)


class ForwardA:
    b: "ForwardB | None" = None


class ForwardB:
    a: "ForwardA | None" = None


class PlainAmbiguous:
    key = 0
    left = None


class ScalarDefaults:
    key = 0
    title = "x"


class WithMeta:
    LIMIT: ClassVar[int] = 10
    value = 1
    _cache = None

    def helper(self) -> int:
        return 1


class ScalarList:
    values: list[int] = field(default_factory=list)


class Unregistered:
    pass


class UnknownAnnotation:
    other: "Unregistered | None" = None


@dataclass
class Place:
    key: str


@dataclass
class EdgeThree:
    a: Place
    b: Place
    c: Place


@dataclass
class EdgeMany:
    a: list[Place] = field(default_factory=list)
    b: Place = field(default_factory=Place)


@dataclass
class EdgeWithName:
    a: Place
    b: Place
    name: str = ""


@dataclass
class GraphContainer:
    nodes: list[Place] = field(default_factory=list)


class FieldsTest(unittest.TestCase):
    def test_dataclass_attributes_and_pointers(self):
        reg = Registry()
        reg.structure(DcNode)
        roles = {field.name: field.role for field in reg.get(DcNode).fields}
        self.assertIsInstance(roles["key"], Attr)
        self.assertIsInstance(roles["left"], Pointer)
        self.assertEqual(roles["left"].target, DcNode)
        self.assertFalse(roles["left"].many)

    def test_list_of_registered_is_many_pointer(self):
        reg = Registry()
        reg.structure(DcNode)
        reg.structure(DcGroup)
        roles = {field.name: field.role for field in reg.get(DcGroup).fields}
        self.assertIsInstance(roles["members"], Pointer)
        self.assertTrue(roles["members"].many)
        self.assertEqual(roles["members"].target, DcNode)

    def test_plain_scalar_defaults_are_attrs(self):
        reg = Registry()
        reg.structure(ScalarDefaults)
        self.assertEqual([field.name for field in reg.get(ScalarDefaults).fields], ["key", "title"])
        self.assertTrue(all(isinstance(field.role, Attr) for field in reg.get(ScalarDefaults).fields))

    def test_none_without_annotation_is_ambiguous(self):
        reg = Registry()
        reg.structure(PlainAmbiguous)
        with self.assertRaises(RegistrationError) as caught:
            reg.finalize()
        self.assertEqual(caught.exception.code, "ambiguous-role")
        self.assertIn("left", str(caught.exception))

    def test_forward_reference_resolves_after_finalize(self):
        reg = Registry()
        reg.structure(ForwardA)
        reg.structure(ForwardB)
        reg.finalize()
        self.assertIsInstance(reg.get(ForwardA).fields[0].role, Pointer)
        self.assertEqual(reg.get(ForwardA).fields[0].role.target, ForwardB)

    def test_classvar_method_and_private_skipped(self):
        reg = Registry()
        reg.structure(WithMeta)
        self.assertEqual([field.name for field in reg.get(WithMeta).fields], ["value"])

    def test_scalar_list_is_rejected(self):
        reg = Registry()
        reg.structure(ScalarList)
        with self.assertRaises(RegistrationError) as caught:
            reg.finalize()
        self.assertEqual(caught.exception.code, "unsupported-list")

    def test_unregistered_target_is_rejected(self):
        reg = Registry()
        reg.structure(UnknownAnnotation)
        with self.assertRaises(RegistrationError) as caught:
            reg.finalize()
        self.assertEqual(caught.exception.code, "ambiguous-role")

    def test_edge_requires_exactly_two_pointers(self):
        reg = Registry()
        reg.structure(Place)
        reg.structure(EdgeThree, as_="edge")
        with self.assertRaises(RegistrationError) as caught:
            reg.finalize()
        self.assertEqual(caught.exception.code, "bad-edge")

    def test_edge_endpoint_cannot_be_list(self):
        reg = Registry()
        reg.structure(Place)
        reg.structure(EdgeMany, as_="edge")
        with self.assertRaises(RegistrationError) as caught:
            reg.finalize()
        self.assertEqual(caught.exception.code, "bad-edge")

    def test_edge_can_have_attr_fields(self):
        # 边只有两个端点指针 + 若干普通属性;属性进 attrs,没有单独的展示文字字段
        reg = Registry()
        reg.structure(Place)
        reg.structure(EdgeWithName, as_="edge")
        reg.finalize()
        self.assertEqual([field.name for field in reg.get(EdgeWithName).fields], ["a", "b", "name"])

    def test_container_accepts_many_pointers(self):
        reg = Registry()
        reg.structure(Place)
        reg.structure(GraphContainer, as_="container")
        reg.finalize()
        self.assertEqual(reg.get(GraphContainer).as_, "container")

    def test_pointer_runtime_type_is_checked(self):
        reg = Registry()
        reg.structure(DcNode)
        root = DcNode()
        root.left = "not a node"  # type: ignore[assignment]
        with self.assertRaises(TraversalError) as caught:
            reg.to_scene(root)
        self.assertEqual(caught.exception.code, "bad-pointer")
        self.assertIn("root.left", caught.exception.path)


if __name__ == "__main__":
    unittest.main()
