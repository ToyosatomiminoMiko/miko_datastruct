"""最小例子:一个只有属性的 node,零配置.

对应"用户怎样用普通类描述结构"的最省事形态:

- 不继承基类、不用元类,`@registry.structure` 原样返回类;
- 字段顺序 = 类体里的定义顺序 = Scene 里节点的顺序;
- `key` / `value` 都是标量,自动推成**属性**;`key` 优先当节点标签,`value` 进 attrs.

Scene: 一个圆,label `A`,attrs `{"value": 5}`;`diagram.dumps()` 是 web 读的 JSON.
"""

from __future__ import annotations

from dataclasses import dataclass

from dataviz import Registry

registry = Registry("node-demo")


@registry.structure
@dataclass
class Node:
    """只有属性、没有指针的节点;key 是显示用的标识(身份仍然是 id(obj))."""

    key: str
    value: int = 0


def make() -> Node:
    """按文档里的写法建实例."""
    return Node(key="A", value=5)
