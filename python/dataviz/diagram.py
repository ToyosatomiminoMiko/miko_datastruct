"""Diagram:一次完整输出 = 中性 Scene + 可选 checks 结论.

调用方通常只拿 `Diagram` 给后端(`backend.py`)或者各取所需;`Registry.diagram()` 是它的
唯一构造点.`to_dict()` / `dumps()` 交出的是 web 直接消费的**一份 JSON**:
`nodes` / `pointers` / `edges` 三种图元 + `checks` 结论.
"""

from __future__ import annotations

import json
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

    def to_dict(self) -> dict[str, Any]:
        """转成 JSON 对象;PASS 且没有细节时只写 name / passed."""
        data: dict[str, Any] = {"name": self.name, "passed": self.passed}
        if self.detail:
            data["detail"] = self.detail
        return data


@dataclass(frozen=True)
class Diagram:
    """一次输出的全部产物:中性 Scene + 检查结论,共同组成一份 JSON 文档."""

    root: Any
    scene: Scene
    checks: tuple[CheckResult, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        """转成可以 json.dumps 的 dict(键按 nodes / pointers / edges / checks 的固定顺序)."""
        data = self.scene.to_dict()
        if self.checks:
            data["checks"] = [check.to_dict() for check in self.checks]
        return data

    def dumps(self, *, indent: int = 2) -> str:
        """转成 JSON 文本(中文不转义,方便人读)."""
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=indent)
