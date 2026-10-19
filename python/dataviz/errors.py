"""库的错误类型:所有失败都带稳定的错误码,调用方 / 测试按码判断,不解析文案.

错误分三类,对应"三层不要混":
- `RegistrationError`:注册表 / 字段角色的问题(重名、角色歧义、注解解析失败);
- `TraversalError`:遍历用户对象时的问题(未注册类型、缺字段、指针类型不对、层数超限);
- `RenderError`:写 Term / Scene 阶段的问题(钩子抛错、边的端点缺失 / 指向非节点).

文案是给人看的,可能改;错误码是契约,加新码时不要复用旧码.
"""

from __future__ import annotations

__all__ = ["DatavizError", "RegistrationError", "TraversalError", "RenderError"]


class DatavizError(Exception):
    """所有库错误的基类:错误码 + 人可读消息 + 可选的出错路径(如 `root.left[2]`)."""

    def __init__(self, code: str, message: str, *, path: str | None = None) -> None:
        self.code = code
        self.message = message
        self.path = path
        where = f" (在 {path})" if path else ""
        super().__init__(f"[{code}] {message}{where}")


class RegistrationError(DatavizError):
    """注册 / 字段解析阶段的错误:能早报就早报,不要拖到渲染时才炸."""


class TraversalError(DatavizError):
    """遍历阶段的错误:带对象路径,方便定位是哪个字段下的对象出了问题."""


class RenderError(DatavizError):
    """写输出阶段的错误:钩子抛错、边的端点缺失 / 指向非节点等."""
