"""demo:用普通 Python 类描述四种结构,生成 web 直接消费的中性 JSON.

运行(在 `python/` 目录下,纯标准库,不用装任何东西):

    python3 demo.py
    python3 demo.py --out /tmp/dataviz        # 顺便把 JSON 写成文件

四个例子:

1. node      只有属性的最小节点;
2. graph     柯尼斯堡七桥(4 块陆地 + 7 座无向桥);
3. bst       二叉搜索树(只有两条 0..1 有向指针,没有 attrs);
4. rbt       红黑树(有向指针 + Enum 属性).

这个 demo 演示的是"生成中性表示"这一半:Python 只产出**没有坐标的 JSON**
(`nodes` / `pointers` / `edges`).节点 JSON 里的 `key` 就是数据键(BST 是 8 / 4 / …,
图是 "K" / "N" / …),显示与排序都由它承担,没有额外的展示字段.布局、像素与性质检查
都在 web 那一半;检查由 web 的「检查配置」窗口按函数名选择,所以 JSON 里不带检查结论.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Sequence

from dataviz import Diagram, RegistrationError, Registry
from examples import bst as bst_example
from examples import graph as graph_example
from examples import node as node_example
from examples import rbt as rbt_example


def _section(title: str) -> None:
    print(f"\n=== {title} ===")


def _print_diagram(diagram: Diagram) -> None:
    for line in diagram.dumps(indent=2).splitlines():
        print(f"  {line}")


def _write(out_dir: Path, name: str, diagram: Diagram) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    scene_path = out_dir / f"{name}.json"
    scene_path.write_text(diagram.dumps() + "\n", encoding="utf-8")
    print(f"  写入 {scene_path}")


class BrokenNode:
    """反例:有标量字段,也有一个 `left = None` —— 空值还是指针?库不猜."""

    key = 0
    left = None


def _show_inference_error() -> None:
    """演示最重要的约定:字段角色推断不出来时,注册期就报错,而不是渲染时乱猜."""
    _section("5. 约定:推断不出来就报错")
    broken = Registry("broken-demo")
    broken.structure(BrokenNode)
    try:
        broken.finalize()
    except RegistrationError as exc:
        print(f"  {exc}")
        print("  修法:写类型标注 `left: BrokenNode | None = None`")
    else:  # pragma: no cover - 演示脚本,正常不应走到
        print("  (意外:没有报错)")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="dataviz demo:Python 类 -> 中性 JSON")
    parser.add_argument("--out", type=Path, default=None, help="把中性 JSON 写成文件的目录")
    args = parser.parse_args(argv)

    # 1. 最小节点:只有属性
    node_root = node_example.make()
    node_diagram = node_example.registry.diagram(node_root)
    _section("1. node:只有属性的最小节点")
    _print_diagram(node_diagram)

    # 2. 柯尼斯堡七桥:无向边 + 聚合根
    graph_root = graph_example.sample_graph()
    graph_diagram = graph_example.graph_registry.diagram(graph_root)
    _section("2. 柯尼斯堡七桥:4 块陆地 + 7 座无向桥")
    _print_diagram(graph_diagram)

    # 3. 二叉搜索树:只有两条 0..1 有向指针,没有 attrs
    bst_root = bst_example.sample_tree()
    bst_diagram = bst_example.bst_registry.diagram(bst_root)
    _section("3. 二叉搜索树:标注即指针 + key,没有 attrs")
    _print_diagram(bst_diagram)

    # 4. 红黑树:有向指针 + Enum + key/attrs
    rbt_root = rbt_example.sample_tree()
    rbt_diagram = rbt_example.rbt_registry.diagram(rbt_root)
    _section("4. 红黑树:标注即指针 + key / attrs")
    _print_diagram(rbt_diagram)

    # 5. 推断失败的错误形态
    _show_inference_error()

    if args.out is not None:
        _section(f"6. 写出文件到 {args.out}")
        _write(args.out, "node", node_diagram)
        _write(args.out, "graph", graph_diagram)
        _write(args.out, "bst", bst_diagram)
        _write(args.out, "rbt", rbt_diagram)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
