"""后端:把 `Diagram` 渲染成某一种具体产物.

库只内置一个**文本**后端:`JsonBackend` 把 `Diagram` 里已经算好的中性 Scene 与 checks
写成一份 JSON(web 的输入契约).SVG / Graphviz / Matplotlib 都是后端的事,不进核心;
布局(像素坐标)也在渲染端,不在 Python 这一层.`Backend` 只是给"用户自己的后端"一个
可以照着写的 Protocol.
"""

from __future__ import annotations

from typing import Any, Protocol

from .diagram import Diagram

__all__ = ["Backend", "JsonBackend"]


class Backend(Protocol):
    """后端的唯一方法:吃一个 Diagram,交回某种产物."""

    def render(self, diagram: Diagram) -> Any: ...


class JsonBackend:
    """输出中性文档的 JSON 文本(缩进可配)."""

    def __init__(self, *, indent: int = 2) -> None:
        self.indent = indent

    def render(self, diagram: Diagram) -> str:
        return diagram.dumps(indent=self.indent)
