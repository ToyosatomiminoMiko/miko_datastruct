"""dataviz:用普通 Python 类描述一种结构,生成中性的可视化表示法.

一个字段只有两种角色:

- **属性 `Attr`**:标量(含 `key` / `id` 这种标识),进标签;
- **指针 `Pointer`**:有向地指向另一个已注册对象,由类型标注定死:
  `T | None` / `T` 是 0..1 条,`list[T]` / `Sequence[T]` 是 0..n 条.

结构种类 `as_`: `node`(圆节点,默认)/ `edge`(无向边)/ `container`(聚合根,不画).

两段输出,对应两个消费者:

- `Registry.to_term()` / `Diagram.term`:通用项字面量文本(Term),给"读结构"的一端;
- `Registry.to_scene()` / `Diagram.scene`:节点 / 有向指针 / 无向边的中性场景(没有像素
  坐标),给渲染后端.

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
    print(reg.to_term(root))   # node(A, nil, nil)
    print(reg.to_scene(root))  # Scene(nodes=..., pointers=..., edges=...)

核心只有标准库依赖;布局与像素归后端,不在这一层.
"""

from __future__ import annotations

from .backend import Backend, JsonBackend, TermBackend
from .diagram import CheckResult, Diagram
from .errors import DatavizError, RegistrationError, RenderError, TraversalError
from .roles import Attr, Pointer, Role
from .scene import Scene, SceneEdge, SceneNode, ScenePointer, SceneWriter
from .spec import MISSING, FieldSpec, StructureSpec
from .term import TermOptions, TermWriter
from .registry import Registry, default_registry, structure
from .traversal import Graph, RenderContext

__version__ = "0.2.0-demo"

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
    "TermOptions",
    "TermWriter",
    "Scene",
    "SceneNode",
    "ScenePointer",
    "SceneEdge",
    "SceneWriter",
    "Backend",
    "TermBackend",
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
