"""红黑树:指针全部由类型标注定死;颜色用 Enum 表达,差异进 Scene 的 attrs.

- `left: "RbtNode | None"` / `right: "RbtNode | None"` -> 两条 0..1 的**有向指针**;
  不再写 `roles=` —— 标注本身就是声明.
- `color: Color` -> 普通属性(Enum).Scene 的节点通用槽是 key / label,其余属性进
  `attrs`:所以红黑树的颜色就是 `"attrs": {"color": "black"}`,没有单独的 variant 字段.
- `label="key"` -> `key` 是节点的通用展示槽:进 Scene 的 `label`,并从 `attrs` 里排除.

这里**没有** `parent` 字段:加上它就会多出从子指向父的有向指针,Scene 里的树会变成
带反向指针的图.想要父指针就自己加,那是另一张图.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from dataviz import Registry

rbt_registry = Registry("rbt-demo")


class Color(Enum):
    """节点颜色:值就是给人看的语义(`"red"` / `"black"`)."""

    RED = "red"
    BLACK = "black"


@rbt_registry.structure(
    name="rbt",
    label="key",
)
@dataclass
class RbtNode:
    key: int
    color: Color = Color.BLACK
    left: "RbtNode | None" = None
    right: "RbtNode | None" = None


def _node(key: int, color: Color, left: RbtNode | None = None, right: RbtNode | None = None) -> RbtNode:
    return RbtNode(key=key, color=color, left=left, right=right)


def sample_tree() -> RbtNode:
    """与 web 首屏示例同构的一棵小树."""
    return _node(
        13,
        Color.BLACK,
        _node(8, Color.RED, _node(1, Color.BLACK), _node(11, Color.RED)),
        _node(17, Color.RED, _node(15, Color.BLACK), _node(25, Color.BLACK)),
    )
