"""Diagram:一次完整输出 = 中性 Scene.

调用方通常只拿 `Diagram` 给后端(`backend.py`)或者各取所需;`Registry.diagram()` 是它的
唯一构造点.`to_dict()` / `dumps()` 交出的是 web 直接消费的**一份 JSON**:
`nodes` / `pointers` / `edges` 三种图元.

JSON 里**没有检查结论,也没有结构名**:要跑哪些性质检查由 web 侧「检查配置」窗口
单独给;生产数据的一方只负责描述结构,不手写 PASS / FAIL.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from .scene import Scene

__all__ = ["Diagram"]


@dataclass(frozen=True)
class Diagram:
    """一次输出的全部产物:中性 Scene(web 读的那份 JSON)."""

    root: Any
    scene: Scene

    def to_dict(self) -> dict[str, Any]:
        """转成可以 json.dumps 的 dict(键: nodes / pointers / edges)."""
        return self.scene.to_dict()

    def dumps(self, *, indent: int = 2) -> str:
        """转成 JSON 文本(中文不转义,方便人读)."""
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=indent)
