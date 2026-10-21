"""属性值的 JSON 标量化:Scene 的 attrs 与节点 key 共用同一套口径.

规则:

1. Enum 取 `.value`(用户定义的语义值,如 `"red"`),而不是 `str(Enum)` 的 `Color.RED`;
   value 不是 JSON 标量时退回 `.name`,保证总能写出一个标量;
2. 保留 JSON 原生类型:int 仍是 number、bool 仍是 boolean、str 仍是 string;
3. `None` 原样返回,由 Scene 决定"不写进 attrs",不进 JSON.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, TypeAlias

__all__ = ["JsonScalar", "scalar_json"]

#: 能直接进 JSON 的属性值(Enum 会被折成这几种)
JsonScalar: TypeAlias = str | int | float | bool | None

# 已经是 JSON 标量的类型;bool 是 int 的子类,但 isinstance 判断不区分顺序也行
_JSON_SCALARS = (bool, int, float, str)


def scalar_json(value: Any) -> JsonScalar:
    """属性值 -> JSON 标量:Enum 取 value(非标量退回 name),其余原样返回.

    attrs 与 scene key 都要求保留原类型:`int` 要留成 number,不能变成字符串 `"5"`,
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
