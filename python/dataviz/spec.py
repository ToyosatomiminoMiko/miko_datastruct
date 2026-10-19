"""StructureSpec / FieldSpec:注册表里的"一种结构"与它的字段表.

字段表的**顺序就是 Term 参数顺序**,不是字母序、也不按字段名猜.顺序在字段解析时定下,
解析本身延迟到第一次访问 `spec.fields`(或 `Registry.finalize()`):

- 注册时只做能做的校验(重名、`as_` 取值、显式结构名);
- 注解里的前向引用(`class A: b: "B | None"`)要等 B 也被定义出来才能解析,所以不能
  在装饰器执行时急着求值.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, TYPE_CHECKING

from .roles import Role

if TYPE_CHECKING:  # 只用于类型提示,避免 spec <-> registry 的循环导入
    from .registry import Registry

__all__ = ["MISSING", "FieldSpec", "StructureSpec"]


class _Missing:
    """字段没有默认值时的哨兵;用单独的类型而不是 `None`,因为 `None` 本身是合法默认值."""

    __slots__ = ()

    def __repr__(self) -> str:
        return "MISSING"


#: 字段没有默认值
MISSING: Any = _Missing()


@dataclass(frozen=True)
class FieldSpec:
    """一个字段:名字 + 角色(属性 / 有向指针).

    `default` / `annotation` 不参与渲染,只用于诊断与错误信息:渲染一律读实例上的当前值.
    """

    name: str
    role: Role
    default: Any = MISSING
    annotation: Any = None


class StructureSpec:
    """一种结构的注册信息;字段表由 Registry 解析并缓存在 `_fields` 上.

    `as_` 是**结构种类**,与字段角色是两件不同的事:

    - `"node"`(默认):画成一个圆节点;
    - `"edge"`:一条无向边(恰好两个端点指针,可选若干属性);
    - `"container"`:聚合根,自己不出现在画面里(如整张图).
    """

    def __init__(
        self,
        *,
        registry: "Registry",
        cls: type,
        name: str,
        as_: str,
        label: Callable[[Any], str] | None,
        variant: Callable[[Any], str] | None,
        term_hook: Callable[[Any, list[str]], str] | None,
        shape: str | None,
        checks: tuple[Callable[[Any], Any], ...],
        subclasses: bool,
        doc: str,
    ) -> None:
        self.registry = registry
        self.cls = cls
        self.name = name
        self.as_ = as_
        self.label = label
        self.variant = variant
        self.term_hook = term_hook
        self.shape = shape
        self.checks = checks
        self.subclasses = subclasses
        self.doc = doc
        self._fields: tuple[FieldSpec, ...] | None = None
        self.fingerprint = ""

    @property
    def fields(self) -> tuple[FieldSpec, ...]:
        """解析好的字段表(顺序 = Term 参数顺序);首次访问时解析,失败不会缓存."""
        if self._fields is None:
            self._fields = self.registry._fields_for(self)
        return self._fields

    @property
    def pointer_fields(self) -> tuple[FieldSpec, ...]:
        """字段表里的指针字段(按定义顺序);边的两个端点就是这里的前两个."""
        from .roles import Pointer

        return tuple(spec_field for spec_field in self.fields if isinstance(spec_field.role, Pointer))

    @property
    def fqn(self) -> str:
        """类的全限定名(module.qualname),重名 / 未注册报错时用."""
        return f"{self.cls.__module__}.{self.cls.__qualname__}"

    def __repr__(self) -> str:
        return f"<StructureSpec {self.name!r} -> {self.fqn} as={self.as_!r}>"
