"""dataviz:用普通 Python 类描述一种结构,生成 web 直接消费的中性 JSON.

一个字段只有两种角色:

- **属性 `Attr`**:标量 / Enum,进节点的 `label`,其余进 `attrs`(结构特有属性);
- **指针 `Pointer`**:有向地指向另一个已注册对象,由类型标注定死:
  `T | None` / `T` 是 0..1 条,`list[T]` / `Sequence[T]` 是 0..n 条.

结构种类 `as_`: `node`(圆节点,默认)/ `edge`(无向边)/ `container`(聚合根,不画).

输出只有一种:web 读的**中性 JSON**.

- `Registry.to_scene()` / `Diagram.scene`:节点 / 有向指针 / 无向边的中性场景(没有像素
  坐标;结构特有的属性在 `attrs`);
- `Registry.diagram()` 额外跑 `checks`,并把检查结论一起放进 JSON;`Diagram.dumps()` 就是
  一份可以直接粘进 web 的文档(`nodes` / `pointers` / `edges` / `checks`).

典型用法:

    from dataviz import Registry

    reg = Registry()

    @reg.structure
    @dataclass
    class Node:
        key: str
        left: "Node | None" = None
        right: "Node | None" = None

    root = Node(key="A")
    print(reg.diagram(root).dumps())

核心只有标准库依赖;布局与像素归 web,不在这一层.
"""

from __future__ import annotations

from .backend import Backend, JsonBackend
from .diagram import CheckResult, Diagram
from .errors import DatavizError, RegistrationError, RenderError, TraversalError
from .roles import Attr, Pointer, Role
from .scene import Scene, SceneEdge, SceneNode, ScenePointer, SceneWriter
from .spec import MISSING, FieldSpec, StructureSpec
from .registry import Registry, default_registry, structure
from .traversal import Graph, RenderContext

__version__ = "0.3.0-demo"

__all__ = [
    # 注册
    "Registry",
    "default_registry",
    "structure",
    "StructureSpec",
    "FieldSpec",
    "MISSING",
    # 字段角色
    "Role",
    "Attr",
    "Pointer",
    # 输出
    "Diagram",
    "CheckResult",
    "Scene",
    "SceneNode",
    "ScenePointer",
    "SceneEdge",
    "SceneWriter",
    "Backend",
    "JsonBackend",
    # 遍历
    "Graph",
    "RenderContext",
    # 错误
    "DatavizError",
    "RegistrationError",
    "TraversalError",
    "RenderError",
]
