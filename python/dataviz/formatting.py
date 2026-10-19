"""字段值的格式化:Term 的 atom、Scene 的标签与 attrs 共用同一套口径.

规则:

1. `None` 在 Term / label 里写成 `nil`,在 Scene 的 attrs 里是 JSON `null`;
2. Enum 取 `.value`(用户定义的语义值,如 `"red"`),而不是 `str(Enum)` 的 `Color.RED`;
   value 不是 JSON 标量时退回 `.name`,保证总能写出一个标量;
3. 其余标量 `str()`.

Term 的 atom 还多一步:含空白 / 括号 / 逗号 / 引号、或者本身等于保留字 `nil` 时,必须
写成双引号字符串并转义,否则读回来就不是一个 atom 了.
"""

from __future__ import annotations

import re
from enum import Enum
from typing import Any, TypeAlias

__all__ = ["JsonScalar", "format_scalar", "scalar_json", "atom"]

#: 能直接进 JSON 的属性值(Enum 会被折成这几种)
JsonScalar: TypeAlias = str | int | float | bool | None

# atom 里不允许出现的字符(通用项字面量的语法:1+ 个非 `( ) , " 空白` 的字符)
_ATOM_FORBIDDEN = re.compile(r'[\s(),"]')

# 这些词在 Term 里有专门含义,作为字符串值时必须加引号
_RESERVED_ATOMS = frozenset({"nil"})

# 已经是 JSON 标量的类型;bool 是 int 的子类,但 isinstance 判断不区分顺序也行
_JSON_SCALARS = (bool, int, float, str)


def scalar_json(value: Any) -> JsonScalar:
    """属性值 -> JSON 标量:Enum 取 value(非标量退回 name),其余原样返回.

    attrs 用这个而不是 `format_scalar`:`int` 要留成 number,不能变成字符串 `"5"`,
    否则渲染端拿到 `{"value": "5"}` 还得再 parse 一次.
    """
    if value is None or isinstance(value, _JSON_SCALARS):
        return value
    if isinstance(value, Enum):
        raw = value.value
        if raw is None or isinstance(raw, _JSON_SCALARS):
            return raw
        # value 是 tuple / 自定义对象之类:JSON 表示不了,退回成员名
        return value.name
    # Attr 角色只收标量 / Enum,这里只是兜底,不让 Scene 写出非 JSON 值
    return str(value)


def format_scalar(value: Any) -> str:
    """把一个属性值格式化成人类可读文本(Scene 标签与 Term atom 的共同前半段)."""
    if value is None:
        return "nil"
    if isinstance(value, Enum):
        # Enum 的语义在 value(用户定义成 "red" / "black"),不是 Python 成员名
        raw = scalar_json(value)
        return "nil" if raw is None else str(raw)
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
