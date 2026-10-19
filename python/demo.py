"""demo:用普通 Python 类描述三种结构,生成 Term 文本与中性 Scene JSON.

运行(在 `python/` 目录下,纯标准库,不用装任何东西):

    python3 demo.py
    python3 demo.py --out /tmp/dataviz        # 顺便把产物写成文件

三个例子:

1. node      只有属性的最小节点;
2. graph     柯尼斯堡七桥(4 块陆地 + 7 座无向桥);
3. rbt       红黑树(有向指针 + 简写钩子).

这个 demo 演示的是"生成可视化表示法"这一半:Python 只产出**中性表示**
(项字面量文本 + 没有坐标的 Scene JSON).布局与像素在 web / 渲染后端那一半,
两边通过文本 / JSON 衔接,不是前后端关系.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Sequence

from dataviz import CheckResult, Diagram, RegistrationError, Registry, Scene, TermOptions
from examples import graph as graph_example
from examples import node as node_example
from examples import rbt as rbt_example


def _section(title: str) -> None:
    print(f"\n=== {title} ===")


def _print_term(term: str) -> None:
    print("term:")
    print(f"  {term}")


def _print_scene(scene: Scene) -> None:
    print("scene:")
    for line in scene.dumps(indent=2).splitlines():
        print(f"  {line}")


def _print_checks(checks: Sequence[CheckResult]) -> None:
    if not checks:
        return
    print("checks:")
    for check in checks:
        state = "PASS" if check.passed else "FAIL"
        detail = f"  {check.detail}" if check.detail else ""
        print(f"  {check.name}: {state}{detail}")


def _print_diagram(diagram: Diagram) -> None:
    _print_term(diagram.term)
    _print_scene(diagram.scene)
    _print_checks(diagram.checks)


def _write(out_dir: Path, name: str, diagram: Diagram, *, generic_term: str | None = None) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    term_path = out_dir / f"{name}.term.txt"
    scene_path = out_dir / f"{name}.scene.json"
    term_path.write_text(diagram.term + "\n", encoding="utf-8")
    scene_path.write_text(diagram.scene.dumps() + "\n", encoding="utf-8")
    print(f"  写入 {term_path} / {scene_path}")
    if generic_term is not None:
        generic_path = out_dir / f"{name}.generic-term.txt"
        generic_path.write_text(generic_term + "\n", encoding="utf-8")
        print(f"  写入 {generic_path}")


class BrokenNode:
    """反例:有标量字段,也有一个 `left = None` —— 空值还是指针?库不猜."""

    key = 0
    left = None


def _show_inference_error() -> None:
    """演示最重要的约定:字段角色推断不出来时,注册期就报错,而不是渲染时乱猜."""
    _section("4. 约定:推断不出来就报错")
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
    parser = argparse.ArgumentParser(description="dataviz demo:Python 类 -> Term / Scene")
    parser.add_argument("--out", type=Path, default=None, help="把 term / scene 写成文件的目录")
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

    # 3. 红黑树:有向指针 + Enum + label / term 钩子
    rbt_root = rbt_example.sample_tree()
    rbt_diagram = rbt_example.rbt_registry.diagram(rbt_root)
    rbt_generic = rbt_example.rbt_registry.to_term(rbt_root, options=TermOptions(shorthand=False))
    _section("3. 红黑树:标注即指针 + label / attrs / term")
    print("term(结构专属简写,可以直接粘进 web 的表达式输入):")
    print(f"  {rbt_diagram.term}")
    print("term(通用写法):")
    print(f"  {rbt_generic}")
    _print_scene(rbt_diagram.scene)

    # 4. 推断失败的错误形态
    _show_inference_error()

    if args.out is not None:
        _section(f"5. 写出文件到 {args.out}")
        _write(args.out, "node", node_diagram)
        _write(args.out, "graph", graph_diagram)
        _write(args.out, "rbt", rbt_diagram, generic_term=rbt_generic)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
