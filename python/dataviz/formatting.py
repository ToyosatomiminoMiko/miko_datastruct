"""属性值的格式化:Scene 的标签与 attrs 共用同一套口径.

规则:

1. Enum 取 `.value`(用户定义的语义值,如 `"red"`),而不是 `str(Enum)` 的 `Color.RED`;
   value 不是 JSON 标量时退回 `.name`,保证总能写出一个标量;
2. `attrs` 用 `scalar_json`,保留 JSON 原生类型(int 仍是 number、bool 仍是 boolean);
3. 标签 / 展示文字用 `format_scalar`,`None` 写成空串,其余 `str()`.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, TypeAlias

__all__ = ["JsonScalar", "format_scalar", "scalar_json"]

#: 能直接进 JSON 的属性值(Enum 会被折成这几种)
JsonScalar: TypeAlias = str | int | float | bool | None

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
    """把一个属性值格式化成人类可读文本(Scene 标签用)."""
    if value is None:
        return ""
    if isinstance(value, Enum):
        # Enum 的语义在 value(用户定义成 "red" / "black"),不是 Python 成员名
        raw = scalar_json(value)
        return "" if raw is None else str(raw)
    return str(value)
