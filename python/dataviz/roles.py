"""字段角色:只剩两种.

`node` 里一个字段只有两种身份:

1. **属性 `Attr`**:一个标量,进节点标签 / Term 的 atom;
2. **指针 `Pointer`**:从本对象指向另一个已注册对象,是**有向**的.

引用用**类型标注**定死,不再有手写 `roles=`:

- `T | None` / `T`          -> `Pointer(target=T, many=False)`,0..1 条;
- `list[T]` / `Sequence[T]` -> `Pointer(target=T, many=True)`,0..n 条.

注意这里只有"有向指针",没有"无向边":无向边是另一种**结构类型**
(`as_="edge"` 的 Edge 对象),不是字段角色,见 registry.py 与 scene.py.
"""

from __future__ import annotations

from dataclasses import dataclass

__all__ = ["Role", "Attr", "Pointer"]


class Role:
    """字段角色的基类:只是标记,不含行为."""

    __slots__ = ()


@dataclass(frozen=True)
class Attr(Role):
    """属性:标量值(含 key / id 这类全局唯一的标识),进标签与 Term 参数."""


@dataclass(frozen=True)
class Pointer(Role):
    """一条有向指针:本对象 -> target 类型的一个已注册对象.

    - `many=False`:0..1 条(`T | None`)或恰好 1 条(`T`);
    - `many=True`:0..n 条(`list[T]` / `tuple[T, ...]`).

    `target` 是注解里解析出来的类,遍历时用来做运行时类型检查.
    """

    target: type
    many: bool = False
