"""柯尼斯堡七桥:4 块陆地 + 7 座**无向**桥.

这是"图"的最小例子,同时演示结构种类与无向边:

- `Place`(`as_="node"`,默认):4 块陆地,只有 `key` 属性;
- `Bridge`(`as_="edge"`):一座桥,恰好两个端点 `a` / `b` —— 无向边不是字段角色,
  而是另一种结构;
- `Graph`(`as_="container"`):整张图,自己不出现在画面里,只是 `nodes` / `edges`
  两个 0..n 指针的聚合根.

七座桥(与史实对应):

    K-N  ×2   Krämerbrücke / Schmiedebrücke
    K-S  ×2   Grüne Brücke / Köttelbrücke
    K-E  ×1   Honigbrücke
    N-E  ×1   Holzbrücke
    S-E  ×1   Hohe Brücke

度数 K=5、N=3、S=3、E=3,全是奇数 —— 所以不存在欧拉回路,这正是欧拉 1736 年的结论.

这段结论**不在 JSON 里**:web 侧注册了 `checkEulerCircuit`,在「检查配置」窗口里填上它
就会在载入时现算并显示在检查窗口.本文件只负责描述图.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from dataviz import Registry

graph_registry = Registry("konigsberg-demo")


@graph_registry.structure
@dataclass
class Place:
    """一块陆地;key 是显示用的标识(K / N / S / E)."""

    key: str


@graph_registry.structure(as_="edge")
@dataclass
class Bridge:
    """一座**无向**桥:两个端点,没有方向、没有权重(权重以后再加)."""

    a: Place
    b: Place


@graph_registry.structure(as_="container")
@dataclass
class Graph:
    """整张图:自己不出现在画面里;两个字段都是 0..n 条指针."""

    nodes: list[Place] = field(default_factory=list)
    edges: list[Bridge] = field(default_factory=list)


def sample_graph() -> Graph:
    """柯尼斯堡的 4 块陆地与 7 座桥."""
    kneiphof = Place(key="K")  # Kneiphof 岛(市中心)
    north = Place(key="N")  # 北岸
    south = Place(key="S")  # 南岸
    east = Place(key="E")  # 东岸

    bridges = [
        Bridge(a=kneiphof, b=north),  # Krämerbrücke
        Bridge(a=kneiphof, b=north),  # Schmiedebrücke
        Bridge(a=kneiphof, b=south),  # Grüne Brücke
        Bridge(a=kneiphof, b=south),  # Köttelbrücke
        Bridge(a=kneiphof, b=east),  # Honigbrücke
        Bridge(a=north, b=east),  # Holzbrücke
        Bridge(a=south, b=east),  # Hohe Brücke
    ]
    return Graph(nodes=[kneiphof, north, south, east], edges=bridges)
