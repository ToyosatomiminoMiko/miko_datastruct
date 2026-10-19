# Python 侧:用普通类生成中性 JSON

> 状态:**demo**(两种字段角色 / 三种结构种类 / 遍历 / Scene / JSON 输出已实现)。
> 纯标准库,不需要安装。

这一半回答的问题是:**用户怎样用普通 Python 类描述一种结构,库怎样把它变成 web 直接消费的
中性 JSON**。它不画图、不算布局、不碰像素,也不跑服务。性质检查也不在这一半:JSON 只写
结构内容;要跑哪些检查由 web 侧「检查配置」窗口单独选。

## 两半的分工:不是前后端

```text
用户写的 Python 对象                dataviz                    输出
┌─────────────────────┐  遍历   ┌──────────┐  写端   ┌─────────────────────────────┐
│ @reg.structure 的类 │ ──────> │ 中性图    │ ──────> │ 中性 JSON                    │
│ 属性 / 有向指针      │  身份   │ 记录/指针 │         │ nodes / pointers / edges    │
└─────────────────────┘  共享/环 └──────────┘         │                             │
                                                       └──────────────┬──────────────┘
                                                                      │ 文件 / 剪贴板
                                                                      ▼
                                                    ┌─────────────────────────────────┐
                                                    │ web:按检查配置跑检查              │
                                                    │     + 布局 + SVG 落笔            │
                                                    └─────────────────────────────────┘
```

- **没有 HTTP、没有进程间调用**:Python 写出一份 JSON(文件或剪贴板),web 读这份 JSON。
- **只有一种输出**:web 读的**中性 JSON**。`Scene` 是其中的可视化部分(节点 / 有向指针 /
  无向边,**没有像素坐标**);`Diagram` 就是 web 的完整输入文档。
- **检查结论与结构名都不在 JSON 里**:JSON 只描述结构;要跑哪些性质检查由 web 侧
  「检查配置」窗口按函数名选择、载入后现算。
- Scene **不标树 / 图**:那是内容本身的性质,由 web 从图元推出来,不进中性表示。
- 两半共用同一套词汇:**属性 / 指针 / 边 / 聚合根**。

## 快速开始

```bash
cd python
python3 demo.py                          # node / 柯尼斯堡七桥 / 二叉搜索树 / 红黑树
python3 demo.py --out /tmp/dataviz       # 顺便把 JSON 写成文件
python3 -m unittest discover -s tests -t .
```

柯尼斯堡那段的 JSON(节选):

```json
{
  "nodes": [{"key": 0, "label": "K"}, "...": "..."],
  "pointers": [],
  "edges": [{"a": 0, "b": 1}, "...": "..."]
}
```

二叉搜索树那段(与 web 内置的「二叉搜索树」示例同形,可直接对照):

```json
{
  "nodes": [
    {"key": 0, "label": "8"},
    {"key": 1, "label": "4"},
    {"key": 2, "label": "2"}
  ],
  "pointers": [{"from": 0, "to": 1}, {"from": 1, "to": 2}],
  "edges": []
}
```

红黑树那段:

```json
{
  "nodes": [
    {"key": 0, "label": "13", "attrs": {"color": "black"}},
    {"key": 1, "label": "8", "attrs": {"color": "red"}}
  ],
  "pointers": [{"from": 0, "to": 1}],
  "edges": []
}
```

`python3 demo.py --out <目录>` 写出的 `<name>.json` 可以直接粘进 web;字段口径与根目录
README 的"输入:中性场景 JSON"一节一致。

## 模型:一个字段只有两种角色

### 字段角色

| 角色 | 写法(类型标注) | 基数 | 输出 |
| --- | --- | --- | --- |
| **属性** `Attr` | `key: str` / `value: int = 0` | 标量 | 进 label / `attrs` |
| **指针** `Pointer` | `left: "Node \| None"` / `T` | 0..1 | 一条有向指针 |
| **指针** `Pointer` | `children: list[T]` / `Sequence[T]` | 0..n | 多条有向指针 |

- 指针**由类型标注定死**,没有手写 `roles=`:
  `T | None` / `T` 是 0..1 条,`list[T]` / `Sequence[T]` 是 0..n 条;
- 推断不出来就报错:无注解的 `left = None` 会被拒绝,而不是猜;
- 字段顺序 = 定义顺序 = Scene 里节点 / 边的顺序。

### 有向指针 ≠ 无向边

这是两种**不同的类型**,不能混:

- **pointer**(字段角色):有向,属于某个 node,`A.left -> B` 与 `B.parent -> A` 是两条
  不同的指针,各自照画,不合并、不去重;
- **edge**(结构种类 `as_="edge"`):无向,一条边连接两个 node,有自己的对象身份
  (柯尼斯堡的多重边就要靠这个),可选属性做边标签;
- 有向带权边以后再加,它是第三种连接类型(`arc` + 权重),不要用 `directed` 布尔开关去
  冒充类型。

所以红黑树的 `left` / `right` / `parent` 是**三条有向指针**;如果给 `RbtNode` 加
`parent`,Scene 里就是 12 条指针(6 条向左下、6 条反向),那是图语义,不是 bug。

### 结构种类 `as_`

| `as_` | 是什么 | 输出 |
| --- | --- | --- |
| `"node"`(默认) | 一个圆节点 | `nodes` |
| `"edge"` | 一条无向边;恰好两个端点指针(顺序 = a / b),其余字段是属性 | `edges` |
| `"container"` | 聚合根(如整张图),自己不出现在画面里 | 不输出自己;它的指针只用于遍历 |

三种图元已经足以表达树 / 图;Scene 不再另标 `shape`(布局由 web 从内容推)。

### 身份与 key

- 身份是 **`id(obj)`**:同一个对象第二次遇到只加指针;值相等的两个对象是两个节点;
- `key` / `id` 属性只影响**标签**(默认优先用它),**不代表唯一性约束**;库不会按 key 合并。
- 场景里的 `nodes[].key` 是**输出编号**,与数据对象的 `key` / `id` 属性无关:前者按遍历
  顺序从 0 开始,后者只影响标签。

## 输出契约

### 中性 JSON

```json
{
  "nodes": [
    { "key": 0, "label": "13", "attrs": { "color": "black" } },
    { "key": 1, "label": "8",  "attrs": { "color": "red" } }
  ],
  "pointers": [{ "from": 0, "to": 1 }],
  "edges": [{ "a": 0, "b": 1, "label": "name=桥1", "attrs": { "name": "桥1" } }]
}
```

- `nodes` / `pointers` / `edges` 是三种图元,方向语义严格区分;
- JSON 里**没有结构名、没有检查结论**:要跑哪些检查由 web 侧「检查配置」窗口单独给;
- `nodes[].key` 是**整数**,按遍历顺序从 0 开始,在 nodes 内唯一;
- `pointers[].from` / `to`、`edges[].a` / `b` 都引用节点 key;
- pointer / edge **自己不带 key**:现在没有别的图元引用它们,`n0` / `e0` 这种前缀也因此
  是多余的(角色已经由数组区分);将来需要选中边 / 给边挂东西时再加;
- `pointers` 的方向就是 `from -> to`:**没有 `variant`**,`left` / `right` 这类字段名是
  数据结构语义,不属于中性场景;树布局需要左右顺序时按 pointers 数组顺序即可;
- **没有 `shape`**:树 / 图 / 链是内容本身的性质,由 web 从 nodes / pointers / edges 推
  (度数、是否有环、有没有无向边),不靠一个自报的标签;
- **`attrs` 是差异化入口**:节点 / 边的通用槽(`key` / `label`、`a` / `b`)之外的所有
  `Attr` 字段都进 `attrs`,键就是字段名;值用原生 JSON 标量,Enum 取 `.value`;
- `label` 来源:节点的 `label="字段名"`,没写就按 `key` -> `id` -> `value` 找;这个字段
  只进 `label`,不再重复进 `attrs`;
- 边 `label` 是展示文字;`attrs` 里放它的其余属性;
- `None` 不当成值,不进 `attrs`(JSON 里省略);空 attrs 也省略。

### 和 web 侧的一一对应

| Python 侧 | web 侧 |
| --- | --- |
| `nodes` / `nodes[].key` | 节点与节点引用 |
| `Attr` | 节点 label / `attrs` |
| `Pointer` | 有向连接(画布上目前是无线段) |
| `as_="edge"` | 无向边(画布上目前是无线段) |
| `attrs` | 各结构自己的渲染 / 样式映射(没有 `variant` 字段) |
| `label` 钩子 | 节点的展示文字 |

**关键差异**:web 的 `VisualScene` 带世界坐标,Python 的 Scene **不带**。布局由 web 侧从
内容推形状(有 `edges` -> 图;只有 `pointers` 且入度 ≤ 1 / 无环 -> 树),Python 不参与。

## 用法

### L0:一个只有属性的 node

```python
from dataclasses import dataclass
from dataviz import Registry

reg = Registry()

@reg.structure
@dataclass
class Node:
    key: str
    value: int = 0

diagram = reg.diagram(Node(key="A", value=5))
print(diagram.dumps())   # web 读的 JSON
```

### L1:二叉搜索树(只有指针,没有额外 attrs)

```python
@reg.structure(name="bst", label="key")
@dataclass
class BstNode:
    key: int
    left: "BstNode | None" = None
    right: "BstNode | None" = None
```

- 两个 `T | None` 字段就是两条有向指针,不需要 `roles=`;没有 `parent`,Scene 就是一棵
  干净的有向树;
- 节点只有 `key` / `label`,没有 attrs —— 写出的 JSON 是最小形状;
- "有序"不是类能声明的约束,不进 JSON:由 web 的 `checkBstOrder` 在载入时现算。
- 与 `examples/rbt.py` 的关系:红黑树在同样的字段上多一个 `color` 属性,BST 是没有
  颜色的那一半;先跑通 BST,再加颜色与检查就是 RBT。
- 这棵 BST 同时是 web 动画演示的起手结构:演示设计见根目录 `docs/animation.md`。

### L2:红黑树(标注即指针 + Enum + label 钩子)

```python
from enum import Enum

class Color(Enum):
    RED = "red"
    BLACK = "black"

@reg.structure(
    name="rbt",
    label="key",
)
@dataclass
class RbtNode:
    key: int
    color: Color = Color.BLACK
    left: "RbtNode | None" = None
    right: "RbtNode | None" = None
```

- `color` 是普通 `Attr`(Enum),Scene 里就是 `attrs.color = "red" / "black"`;没有
  `variant` 字段,渲染端按 `attrs` 决定观感;
- `label="key"`: `key` 是节点的通用展示槽,进 `label`,并从 `attrs` 排除。

### 图:柯尼斯堡七桥(node / edge / container)

```python
@reg.structure
@dataclass
class Place:
    key: str

@reg.structure(as_="edge")
@dataclass
class Bridge:
    a: Place
    b: Place

@reg.structure(as_="container")
@dataclass
class Graph:
    nodes: list[Place] = field(default_factory=list)
    edges: list[Bridge] = field(default_factory=list)
```

4 块陆地、7 座桥(其中 K-N、K-S 各两座,多重边靠不同的 Bridge 对象表达),度数
K=5、N=3、S=3、E=3.在 web 的「检查配置」窗口里填上 `checkEulerCircuit`,载入时就会
算出"不存在欧拉回路".

## 目录结构

```text
python/
  dataviz/__init__.py      公开 API
  dataviz/errors.py        三类错误(注册 / 遍历 / 渲染),都带稳定错误码
  dataviz/roles.py         Attr / Pointer(只有两种字段角色)
  dataviz/spec.py          StructureSpec / FieldSpec(字段表延迟解析)
  dataviz/registry.py      注册表 + 字段发现 + 角色推断 + 输出出口
  dataviz/traversal.py     遍历:身份 / 共享 / 环 / 方向 / 上限 / 路径
  dataviz/scene.py         Scene 写端(节点 / 有向指针 / 无向边)+ JSON
  dataviz/diagram.py       Diagram(scene)+ 完整 JSON
  dataviz/backend.py       JsonBackend / Backend 协议
  dataviz/formatting.py    属性值格式化(标签 / JSON 标量)
  examples/                node / 柯尼斯堡七桥 / 二叉搜索树 / 红黑树
  demo.py                  演示入口
  tests/                   unittest
```

## 现状

**已实现**

- `Registry` / `StructureSpec` / `FieldSpec` / 两种角色 `Attr` / `Pointer` / 装饰器;
- 字段发现:dataclass、`__annotations__`、普通类属性、`Annotated` 外壳、前向引用;
- 推断与歧义报错(注册期能报的报,注解解析延迟到 `finalize()` / 第一次遍历);
- 结构种类:`node` / `edge`(恰好两端点)/ `container`;
- 遍历:身份 / 共享 / 环 / 路径 / 深度与节点数上限 / 指针运行时类型检查 / `on_unknown="opaque"`;
- Scene 写端:节点 key / label / `attrs` / 有向指针(`from -> to`)/ 无向边 / JSON;
- `Diagram.dumps()`:一份 JSON 只含三种图元,不含结构名 / 检查结论;
- `describe()`、`snapshot()`、`finalize()`、`subclasses=True`;
- 四个端到端例子 + unittest。

**未实现(下一步)**

- **权重 / 有向带权边**:按约定先不做;以后加 `arc`(有向边 + 权重)作为第三种连接类型,
  不要把 `directed` 布尔塞进 `edge`;
- **数组 / 内存块**:`list[int]` 目前明确报 `unsupported-list`,以后作为单独的结构种类加;
- `scene=` 完全接管(矩阵 / 多重图这类默认图元拼不出来的结构);
- SVG / Graphviz / Matplotlib 后端,以及**布局**(像素坐标);
- web 视觉层的"有向箭头 / 无向边"两个图元(当前 `pointers` 与 `edges` 都画成无线段)。

## 测试

```bash
cd python
python3 -m unittest discover -s tests -t .
```

测试按层分布:`test_registry.py`(注册 / 查询 / 覆盖 / 快照 / 参数校验)、
`test_fields.py`(字段发现 / 角色推断 / edge 与 container 校验 / 报错码)、
`test_scene.py`(标签 / attrs / 有向指针 / 无向边 / 错误)、`test_examples.py`
(三个例子的 Scene / JSON 端到端结果)。
