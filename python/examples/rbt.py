"""红黑树:指针全部由类型标注定死,三个钩子各管一件事.

- `left: "RbtNode | None"` / `right: "RbtNode | None"` -> 两条 0..1 的**有向指针**;
  不再写 `roles=` —— 标注本身就是声明.
- `label`:节点标签就是 key(不显示 `key=13` 这种默认写法);
- `variant`:红 / 黑变成视觉层的 `red` / `black` 两个变体(颜色是普通属性,不是角色);
- `term`:结构专属简写,产出**和 web 现有表达式输入完全一致**的写法
  `13B(8R(1B,11R),17R(15B,25B))`,可以直接粘进 web 的表达式编辑器.

这里**没有** `parent` 字段:加上它就会多出从子指向父的有向指针,Scene 里的树会变成
带反向指针的图,Term 也会走 id/ref,不再是上面那行简写.想要父指针就自己加,那是另一张图.
"""

from __future__ import annotations

from dataclasses import dataclass

from dataviz import Registry

rbt_registry = Registry("rbt-demo")

RED = "R"
BLACK = "B"


def _rbt_term(node: "RbtNode", parts: list[str]) -> str:
    """结构专属简写:叶子写成 `13B`,有孩子写成 `13B(左,右)`.

    `parts` 是各字段**已经写好的片段**,顺序与 spec.fields 一致(这里:key, color, left, right).
    钩子只改写法,不改语义:它拿到的还是要写进 Term 的那几个参数.
    """
    key, color, left, right = parts
    if left == "nil" and right == "nil":
        return f"{key}{color}"
    return f"{key}{color}({left},{right})"


@rbt_registry.structure(
    name="rbt",
    label=lambda node: str(node.key),
    variant=lambda node: "red" if node.color == RED else "black",
    term=_rbt_term,
)
@dataclass
class RbtNode:
    key: int
    color: str = BLACK
    left: "RbtNode | None" = None
    right: "RbtNode | None" = None


def _node(key: int, color: str, left: RbtNode | None = None, right: RbtNode | None = None) -> RbtNode:
    return RbtNode(key=key, color=color, left=left, right=right)


def sample_tree() -> RbtNode:
    """与 web 首屏示例同构的一棵小树:`13B(8R(1B,11R),17R(15B,25B))`."""
    return _node(
        13,
        BLACK,
        _node(8, RED, _node(1, BLACK), _node(11, RED)),
        _node(17, RED, _node(15, BLACK), _node(25, BLACK)),
    )
