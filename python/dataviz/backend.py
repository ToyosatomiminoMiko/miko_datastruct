"""后端:把 `Diagram` 渲染成某一种具体产物.

库只内置两个**文本**后端,它们只是把 `Diagram` 里已经算好的东西取出来:

- `TermBackend` -> 通用项字面量文本(给"读结构"的一端);
- `JsonBackend` -> 中性 Scene 的 JSON(给渲染后端).

SVG / Graphviz / Matplotlib 都是后端的事,不进核心;布局(像素坐标)也在后端,不在
Python 这一层.`Backend` 只是给"用户自己的后端"一个可以照着写的 Protocol.
"""

from __future__ import annotations

from typing import Any, Protocol

from .diagram import Diagram

__all__ = ["Backend", "TermBackend", "JsonBackend"]


class Backend(Protocol):
    """后端的唯一方法:吃一个 Diagram,交回某种产物."""

    def render(self, diagram: Diagram) -> Any: ...


class TermBackend:
    """输出 Diagram 里已经写好的 Term 文本."""

    def render(self, diagram: Diagram) -> str:
        return diagram.term


class JsonBackend:
    """输出中性 Scene 的 JSON 文本(缩进可配)."""

    def __init__(self, *, indent: int = 2) -> None:
        self.indent = indent

    def render(self, diagram: Diagram) -> str:
        return diagram.scene.dumps(indent=self.indent)
