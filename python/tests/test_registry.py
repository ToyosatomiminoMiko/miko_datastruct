"""注册表:装饰器 / 查询 / 重名 / 覆盖 / 快照 / 建实例 / 参数校验."""

from __future__ import annotations

import unittest
from dataclasses import dataclass

from dataviz import Registry, RegistrationError


@dataclass
class DataNode:
    key: int = 0
    value: int = 1


@dataclass
class LinkedNode:
    key: int = 0
    left: "LinkedNode | None" = None


class PlainNode:
    key = 0
    value = 1


class RegistryTest(unittest.TestCase):
    def test_decorator_returns_original_class(self):
        reg = Registry()

        @reg.structure
        class Node:
            key = 0

        self.assertIsInstance(Node, type)
        self.assertEqual(Node.__name__, "Node")
        self.assertIs(reg.get(Node), reg.by_name("node"))

    def test_decorator_with_options(self):
        reg = Registry()

        @reg.structure(name="rbt", label="key")
        @dataclass
        class RbtNode:
            key: int = 0

        spec = reg.get(RbtNode)
        self.assertEqual(spec.name, "rbt")
        self.assertEqual(spec.as_, "node")
        self.assertEqual(spec.label, "key")

    def test_get_accepts_instance(self):
        reg = Registry()
        reg.structure(PlainNode)
        self.assertEqual(reg.get(PlainNode()).name, "plain_node")

    def test_duplicate_name_rejected(self):
        reg = Registry()

        @reg.structure(name="node")
        class First:
            key = 0

        with self.assertRaises(RegistrationError) as caught:

            @reg.structure(name="node")
            class Second:
                key = 0

        self.assertEqual(caught.exception.code, "duplicate")
        self.assertIn("First", str(caught.exception))
        self.assertIn("Second", str(caught.exception))

    def test_duplicate_class_rejected(self):
        reg = Registry()
        reg.structure(PlainNode)
        with self.assertRaises(RegistrationError) as caught:
            reg.structure(PlainNode)
        self.assertEqual(caught.exception.code, "duplicate")

    def test_override_replaces(self):
        reg = Registry()

        @reg.structure(name="node")
        class First:
            key = 0

        @reg.structure(name="node", override=True)
        class Second:
            key = 0

        self.assertIs(reg.by_name("node").cls, Second)
        self.assertEqual(len(reg.structures), 1)
        with self.assertRaises(RegistrationError):
            reg.get(First)

    def test_reset(self):
        reg = Registry()
        reg.structure(PlainNode)
        reg.reset()
        self.assertEqual(reg.structures, ())
        with self.assertRaises(RegistrationError):
            reg.by_name("plain_node")

    def test_describe_lists_fields(self):
        reg = Registry("demo")
        reg.structure(PlainNode)
        text = reg.describe()
        self.assertIn("plain_node", text)
        self.assertIn("key", text)
        self.assertIn("Attr", text)

    def test_snapshot_is_stable_and_ordered(self):
        reg = Registry()
        reg.structure(DataNode)
        snapshot = reg.snapshot()
        entry = snapshot["data_node"]
        self.assertEqual([field["name"] for field in entry["fields"]], ["key", "value"])
        self.assertEqual(entry["as_"], "node")
        # 布局提示不属于注册信息:Scene 的形状由内容推
        self.assertNotIn("shape", entry)
        self.assertEqual(len(entry["fingerprint"]), 16)

    def test_new_dataclass(self):
        reg = Registry()
        reg.structure(DataNode)
        built = reg.new(DataNode, key=5, value=1)
        self.assertEqual((built.key, built.value), (5, 1))

    def test_new_plain_class(self):
        reg = Registry()
        reg.structure(PlainNode)
        built = reg.new(PlainNode, key=5)
        self.assertEqual(built.key, 5)

    def test_new_rejects_unregistered_class(self):
        reg = Registry()
        with self.assertRaises(RegistrationError):
            reg.new(PlainNode, key=1)

    def test_bad_name_rejected(self):
        reg = Registry()
        with self.assertRaises(RegistrationError) as caught:
            reg.structure(PlainNode, name="a b")
        self.assertEqual(caught.exception.code, "bad-name")

    def test_reserved_nil_name_rejected(self):
        reg = Registry()
        with self.assertRaises(RegistrationError) as caught:
            reg.structure(PlainNode, name="nil")
        self.assertEqual(caught.exception.code, "bad-name")

    def test_bad_as_rejected(self):
        reg = Registry()
        with self.assertRaises(RegistrationError) as caught:
            reg.structure(PlainNode, as_="cell")
        self.assertEqual(caught.exception.code, "bad-as")

    def test_shape_is_not_a_registration_option(self):
        reg = Registry()
        with self.assertRaises(TypeError):
            reg.structure(PlainNode, shape="tree")  # type: ignore[call-arg]

    def test_variant_is_not_a_registration_option(self):
        reg = Registry()
        with self.assertRaises(TypeError):
            reg.structure(PlainNode, variant="color")  # type: ignore[call-arg]

    def test_label_field_must_exist(self):
        reg = Registry()
        reg.structure(PlainNode, label="missing")
        with self.assertRaises(RegistrationError) as caught:
            reg.finalize()
        self.assertEqual(caught.exception.code, "bad-label")

    def test_label_must_point_to_attr(self):
        reg = Registry()
        reg.structure(LinkedNode, label="left")
        with self.assertRaises(RegistrationError) as caught:
            reg.finalize()
        self.assertEqual(caught.exception.code, "bad-label")

    def test_bad_check_rejected(self):
        reg = Registry()
        with self.assertRaises(RegistrationError) as caught:
            reg.structure(PlainNode, checks=(1,))
        self.assertEqual(caught.exception.code, "bad-check")


if __name__ == "__main__":
    unittest.main()
