"""Diagram:一次完整输出 = Term 文本 + 中性 Scene + 可选 checks 结论.

调用方通常只拿 `Diagram` 给后端(`backend.py`)或者各取所需;`Registry.diagram()` 是它的
唯一构造点.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .scene import Scene

__all__ = ["CheckResult", "Diagram"]


@dataclass(frozen=True)
class CheckResult:
    """一条结构检查的结论.

    `checks` 里的可调用对象按下面的规则交回结果:
    - `None` / `True` -> PASS;
    - `False` -> FAIL(没有细节);
    - `str` -> FAIL,字符串是细节;
    - 直接返回 `CheckResult` -> 原样采用(可用自定义名字).
    """

    name: str
    passed: bool
    detail: str = ""


@dataclass(frozen=True)
class Diagram:
    """一次输出的全部产物:中性表示 + 两种可选的给人看的形态."""

    root: Any
    term: str
    scene: Scene
    checks: tuple[CheckResult, ...] = ()

    @property
    def shape(self) -> str | None:
        """布局提示(tree / graph),来自根结构的 spec."""
        return self.scene.shape
