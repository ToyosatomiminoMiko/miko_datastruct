"""红黑树:指针全部由类型标注定死;颜色用 Enum 表达,差异进 Scene 的 attrs.

- `left: "RbtNode | None"` / `right: "RbtNode | None"` -> 两条 0..1 的**有向指针**;
  不再写 `roles=` —— 标注本身就是声明.
- `color: Color` -> 普通属性(Enum).Scene 的节点通用槽是 key / label,其余属性进
  `attrs`:所以红黑树的颜色就是 `"attrs": {"color": "black"}`,没有单独的 variant 字段.
- `label="key"` -> `key` 是节点的通用展示槽:进 Scene 的 `label`,并从 `attrs` 里排除.
- `term` -> 结构专属简写,产出**和 web 现有表达式输入完全一致**的写法
  `13B(8R(1B,11R),17R(15B,25B))`,可以直接粘进 web 的表达式编辑器.

这里**没有** `parent` 字段:加上它就会多出从子指向父的有向指针,Scene 里的树会变成
带反向指针的图,Term 也会走 id/ref,不再是上面那行简写.想要父指针就自己加,那是另一张图.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from dataviz import Registry

rbt_registry = Registry("rbt-demo")


class Color(Enum):
    """节点颜色:值就是给人看的语义(`"red"` / `"black"`),Term 的 R / B 是简写."""

    RED = "red"
    BLACK = "black"


# Term 简写里的颜色标记:R / B 是红黑树自己的输入语法,不是 Enum 的通用表示
_COLOR_MARK = {Color.RED: "R", Color.BLACK: "B"}


def _rbt_term(node: "RbtNode", parts: list[str]) -> str:
    """结构专属简写:叶子写成 `13B`,有孩子写成 `13B(左,右)`.

    `parts` 是各字段**已经写好的片段**,顺序与 spec.fields 一致(这里:key, color, left, right).
    钩子只改写法,不改语义:它拿到的还是要写进 Term 的那几个参数.
    颜色片段本身是 Enum 的 value(`red` / `black`),简写里换回 `R` / `B`.
    """
    key, _color, left, right = parts
    mark = _COLOR_MARK[node.color]
    if left == "nil" and right == "nil":
        return f"{key}{mark}"
    return f"{key}{mark}({left},{right})"


@rbt_registry.structure(
    name="rbt",
    label="key",
    term=_rbt_term,
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
    """与 web 首屏示例同构的一棵小树:`13B(8R(1B,11R),17R(15B,25B))`."""
    return _node(
        13,
        Color.BLACK,
        _node(8, Color.RED, _node(1, Color.BLACK), _node(11, Color.RED)),
        _node(17, Color.RED, _node(15, Color.BLACK), _node(25, Color.BLACK)),
    )
