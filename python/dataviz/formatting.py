"""字段值的格式化:Term 的 atom 与 Scene 的标签共用同一套口径.

规则:
1. `None` 写成 `nil`;
2. Enum 取 `name`(而不是 `str(Enum)` 的 `Color.R`);
3. 其余 `str()`.

Term 的 atom 还多一步:含空白 / 括号 / 逗号 / 引号、或者本身等于保留字 `nil` 时,必须
写成双引号字符串并转义,否则读回来就不是一个 atom 了.
"""

from __future__ import annotations

import re
from enum import Enum
from typing import Any

__all__ = ["format_scalar", "atom"]

# atom 里不允许出现的字符(通用项字面量的语法:1+ 个非 `( ) , " 空白` 的字符)
_ATOM_FORBIDDEN = re.compile(r'[\s(),"]')

# 这些词在 Term 里有专门含义,作为字符串值时必须加引号
_RESERVED_ATOMS = frozenset({"nil"})


def format_scalar(value: Any) -> str:
    """把一个属性值格式化成人类可读文本(Scene 标签与 Term atom 的共同前半段)."""
    if value is None:
        return "nil"
    if isinstance(value, Enum):
        return value.name
    return str(value)


def atom(text: str) -> str:
    """把一段文本写成 Term 的 atom:必要时加引号并转义."""
    if text and text not in _RESERVED_ATOMS and not _ATOM_FORBIDDEN.search(text):
        return text
    escaped = (
        text.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\t", "\\t")
        .replace("\r", "\\r")
    )
    return f'"{escaped}"'
