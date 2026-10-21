"""二叉搜索树:两条 0..1 有向指针,没有颜色、没有额外 attrs.

这是"树"的最小例子,也是红黑树之前的一步:

- `left` / `right` 的类型标注就是两条有向指针(`T | None` -> 0..1 条);
- 没有 `parent` 字段,Scene 就是一棵干净的有向树;加了 `parent` 会多出反向指针,
  那是图的画法,不是这里要的树;
- `key` 字段就是节点的数据键:Scene 的 nodes[].key 直接输出 8 / 4 / 2 / …,渲染端显示
  与检查定位都用它;它不重复进 attrs,所以节点没有 attrs;
- 形状与 web 内置的「二叉搜索树」示例同形(8 / 4 / 12 / 2 / 6 / 10 / 14),
  写出的 JSON 可以直接粘进 web 对照.

BST 的"有序"不是 Python 类能声明的约束,也不该写进 JSON:它由 web 侧注册的
`checkBstOrder` 在载入时现算.
"""

from __future__ import annotations

from dataclasses import dataclass

from dataviz import Registry

bst_registry = Registry("bst-demo")


@bst_registry.structure(name="bst")
@dataclass
class BstNode:
    key: int
    left: "BstNode | None" = None
    right: "BstNode | None" = None


def _node(key: int, left: BstNode | None = None, right: BstNode | None = None) -> BstNode:
    return BstNode(key=key, left=left, right=right)


def sample_tree() -> BstNode:
    """一棵合法的 7 节点二叉搜索树(层数 3);PASS 由 web 的 `checkBstOrder` 给出."""
    return _node(
        8,
        _node(4, _node(2), _node(6)),
        _node(12, _node(10), _node(14)),
    )
