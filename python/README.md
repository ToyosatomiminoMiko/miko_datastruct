# Python 侧:用普通类生成可视化表示法

> 状态:**demo**(两种字段角色 / 三种结构种类 / 遍历 / Term / Scene / 钩子已实现,尚未接入
> web 渲染)。纯标准库,不需要安装。

这一半回答的问题是:**用户怎样用普通 Python 类描述一种结构,库怎样把它变成中性的可视化
表示法**。它不画图、不算布局、不碰像素,也不跑服务。

## 两半的分工:不是前后端

```text
用户写的 Python 对象                dataviz                    输出(文件 / 文本)
┌─────────────────────┐  遍历   ┌──────────┐  写端   ┌─────────────────────────────┐
│ @reg.structure 的类 │ ──────> │ 中性图    │ ──────> │ Term 文本(项字面量)         │
│ 属性 / 有向指针      │  身份   │ 记录/指针 │         │ Scene JSON(节点/指针/边)     │
└─────────────────────┘  共享/环 └──────────┘         └──────────────┬──────────────┘
                                                                     │ 文件 / 剪贴板
                                                                     ▼
                                                          ┌─────────────────────┐
                                                          │ web:布局 + SVG 落笔  │
                                                          └─────────────────────┘
```

- **没有 HTTP、没有进程间调用**:Python 生成文件(或一段文本),web 读文件或在别处使用。
- **Term 是数据表示**(通用项字面量),**Scene 是可视化表示**(节点 / 有向指针 / 无向边,
  **没有像素坐标**)。"画在哪、长什么样"只属于渲染端。
- Scene **不标树 / 图**:那是内容本身的性质,由渲染端从图元推出来,不进中性表示。
- 两半共用同一套词汇:**属性 / 指针 / 边 / 聚合根**。

## 快速开始

```bash
cd python
python3 demo.py                          # node / 柯尼斯堡七桥 / 红黑树
python3 demo.py --out /tmp/dataviz       # 顺便写成文件
python3 -m unittest discover -s tests -t .
```

柯尼斯堡那段的输出(节选):

```text
term:
  graph(children(place(id(1), K), ...), children(bridge(ref(1), ref(2)), ...))
scene:
  { "nodes":    [{"key": 0, "label": "K"}, ...],
    "pointers": [],
    "edges":    [{"a": 0, "b": 1}, ...] }
checks:
  _check_euler_circuit: FAIL  奇数度节点:K(度5), N(度3), S(度3), E(度3) -- 不存在欧拉回路
```

红黑树那段:

```text
term(简写): 13B(8R(1B,11R),17R(15B,25B))
term(通用): rbt(13, black, rbt(8, red, rbt(1, black, nil, nil), ...))
scene:      {"nodes":[{"key":0,"label":"13","attrs":{"color":"black"}},...],"pointers":[{"from":0,"to":1},...],"edges":[]}
```

`13B(8R(1B,11R),17R(15B,25B))` **就是 web 现有红黑树表达式输入的子集**:这一份输出现在
就能原样粘进 web 的表达式编辑器。

## 模型:一个字段只有两种角色

### 字段角色

| 角色 | 写法(类型标注) | 基数 | Term | Scene |
| --- | --- | --- | --- | --- |
| **属性** `Attr` | `key: str` / `value: int = 0` | 标量 | 一个 atom | 进 label / `attrs` |
| **指针** `Pointer` | `left: "Node \| None"` / `T` | 0..1 | 子项 / `nil` | 一条有向指针 |
| **指针** `Pointer` | `children: list[T]` / `Sequence[T]` | 0..n | `children(...)` | 多条有向指针 |

- 指针**由类型标注定死**,没有手写 `roles=`:
  `T | None` / `T` 是 0..1 条,`list[T]` / `Sequence[T]` 是 0..n 条;
- 推断不出来就报错:无注解的 `left = None` 会被拒绝,而不是猜;
- 字段顺序 = 定义顺序 = Term 参数顺序。

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

三种图元已经足以表达树 / 图;Scene 不再另标 `shape`(布局由渲染端从内容推)。

### 身份与 key

- 身份是 **`id(obj)`**:同一个对象第二次遇到只加指针;值相等的两个对象是两个节点;
- `key` / `id` 属性只影响**标签**(默认优先用它),**不代表唯一性约束**;库不会按 key 合并。
- 场景里的 `nodes[].key` 是**输出编号**,与数据对象的 `key` / `id` 属性无关:前者按遍历
  顺序从 0 开始,后者只影响标签。

## 输出契约

### Term:通用项字面量

语法只有一份(这里只实现写侧):

```text
source := term EOF
term   := atom [ '(' [ term (',' term)* ] ')' ]
atom   := 1+ 个非 '( ) , " 空白' 的字符 | 双引号字符串
```

写法约定:

| 情况 | 写法 |
| --- | --- |
| 树 / 只被引用一次 | 子项内联:`rbt(13, B, rbt(8, R, nil, nil), nil)` |
| 共享 / 成环 | 节点带编号:`t_node(id(1), 7, nil, nil)`,之后再遇到写 `ref(1)` |
| 0..n 条指针 | `children(...)` |
| 结构专属简写 | `term=` 钩子,如红黑树 `13B(8R(1B,11R),nil)` |
| 字符串 / 保留字 | 加引号转义:`"a b"`、`"nil"` |

- 构造子名 = `spec.name`(默认由类名转 snake_case);
- `term=` 钩子拿到的是各字段**已经写好的片段**,只准改写写法,不准改变字段语义;
  带编号的节点不走简写(否则编号拆不出来);
- 图这类"共享多"的结构,Term 会比较长;Scene 才是图的主要输出。

### Scene:中性场景 JSON

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
- `nodes[].key` 是**整数**,按遍历顺序从 0 开始,在 nodes 内唯一;
- `pointers[].from` / `to`、`edges[].a` / `b` 都引用节点 key;
- pointer / edge **自己不带 key**:现在没有别的图元引用它们,`n0` / `e0` 这种前缀也因此
  是多余的(角色已经由数组区分);将来需要选中边 / 给边挂东西时再加;
- `pointers` 的方向就是 `from -> to`:**没有 `variant`**,`left` / `right` 这类字段名是
  数据结构语义,不属于中性场景;树布局需要左右顺序时按 pointers 数组顺序即可;
- **没有 `shape`**:树 / 图 / 链是内容本身的性质,由渲染端从 nodes / pointers / edges 推
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
| `spec.name` + `fields` 顺序 | Term 构造子 + 参数顺序(codec 契约) |
| `Attr` | 节点 label / `attrs` |
| `Pointer` | 有向连接(web 侧要补箭头图元) |
| `as_="edge"` | 无向边(web 视觉层还没有这个图元) |
| `attrs` | 各结构自己的渲染 / 样式映射(不再有 `variant` 字段) |
| `label` / `term` 钩子 | `ui/<结构>/` 的翻译与文案 |

**关键差异**:web 的 `VisualScene` 带世界坐标,Python 的 Scene **不带**。所以 web 要直接
消费 Scene JSON,还需要一个"Scene -> 布局 -> VisualScene"的通用布局器:布局器按内容推
形状(有 `edges` -> 图;只有 `pointers` 且入度 ≤ 1 / 无环 -> 树;每个节点出度 ≤ 1 -> 链),
另外它的 `VisualPointer` 要补方向 / 箭头,无向边要新增图元。这些都是接 web 时的一次性工作。

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

reg.to_term(Node(key="A", value=5))    # node(A, 5)
reg.to_scene(Node(key="A"))            # 一个圆,label A,attrs {"value": 0}
```

### L1:红黑树(标注即指针 + Enum + 两个钩子)

```python
from enum import Enum

class Color(Enum):
    RED = "red"
    BLACK = "black"

@reg.structure(
    name="rbt",
    label="key",
    term=_rbt_term,
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
- `label="key"`: `key` 是节点的通用展示槽,进 `label`,并从 `attrs` 排除;
- `term=_rbt_term`:把 Enum 值 `red` / `black` 换回简写 `R` / `B`,产出
  `13B(8R(1B,11R),17R(15B,25B))`。

`checks=(callable,)` 可选:可调用对象吃根对象,返回 `None` / `True`(PASS)、
`False`(FAIL)、`str`(FAIL + 细节)或 `CheckResult`。

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

@reg.structure(as_="container", checks=(check_euler_circuit,))
@dataclass
class Graph:
    nodes: list[Place] = field(default_factory=list)
    edges: list[Bridge] = field(default_factory=list)
```

4 块陆地、7 座桥(其中 K-N、K-S 各两座,多重边靠不同的 Bridge 对象表达),度数
K=5、N=3、S=3、E=3,`check_euler_circuit` 返回 FAIL:不存在欧拉回路。

## 目录结构

```text
python/
  dataviz/__init__.py      公开 API
  dataviz/errors.py        三类错误(注册 / 遍历 / 渲染),都带稳定错误码
  dataviz/roles.py         Attr / Pointer(只有两种字段角色)
  dataviz/spec.py          StructureSpec / FieldSpec(字段表延迟解析)
  dataviz/registry.py      注册表 + 字段发现 + 角色推断 + 输出出口
  dataviz/traversal.py     遍历:身份 / 共享 / 环 / 方向 / 上限 / 路径
  dataviz/term.py          Term 写端(内联 / id-ref / children / 简写钩子)
  dataviz/scene.py         Scene 写端(节点 / 有向指针 / 无向边)+ JSON
  dataviz/diagram.py       Diagram(term + scene + checks)
  dataviz/backend.py       TermBackend / JsonBackend / Backend 协议
  dataviz/formatting.py    属性值格式化 + atom 引号转义
  examples/                node / 柯尼斯堡七桥 / 红黑树
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
- Term 写端:内联、`id` / `ref`、`children(...)`、atom 转义、`term=` 简写、
  `TermOptions(always_ids, shorthand)`;
- Scene 写端:节点 key / label / `attrs` / 有向指针(`from -> to`)/ 无向边 / JSON;
- `checks`、`describe()`、`snapshot()`、`finalize()`、`subclasses=True`;
- 三个端到端例子 + unittest。

**未实现(下一步)**

- **权重 / 有向带权边**:按约定先不做;以后加 `arc`(有向边 + 权重)作为第三种连接类型,
  不要把 `directed` 布尔塞进 `edge`;
- **数组 / 内存块**:`list[int]` 目前明确报 `unsupported-list`,以后作为单独的结构种类加;
- `scene=` 完全接管(矩阵 / 多重图这类默认图元拼不出来的结构);
- Term 的**反向解码**(Term -> Python)与显式 `encode`;往返测试 / 分享链接会需要;
- SVG / Graphviz / Matplotlib 后端,以及**布局**(像素坐标);
- web 端**通用 Scene 消费**:一个把 Scene JSON 布局成 `VisualScene` 的通用布局器 +
  读 JSON 的入口,以及视觉层补"有向箭头 / 无向边"两个图元。

## 测试

```bash
cd python
python3 -m unittest discover -s tests -t .
```

测试按层分布:`test_registry.py`(注册 / 查询 / 覆盖 / 快照 / 参数校验)、
`test_fields.py`(字段发现 / 角色推断 / edge 与 container 校验 / 报错码)、
`test_term.py`(写法 / 共享 / 环 / 简写 / 图)、`test_scene.py`(标签 / attrs / 有向指针 /
无向边 / 错误)、`test_examples.py`(三个例子的端到端结果)。
