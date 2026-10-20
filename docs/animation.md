# 动画演示:设计与实现

> 状态:**web 侧 M0–M4 已落地(M5 自由操作 / 对照演出未做);Python 侧的 BST 静态示例
> 已落地(§15)**。本文是这套功能的**设计与实现说明**:表现、数据契约、镜头数学、剧本、
> 文件分工、测试与分期都在这里;实际文件与验收方式见 §19。业务背景与现有分层见根
> `README.md`。

目标:在现有的中性 JSON 画布上,按步骤演示 **二叉搜索树(BST)的原理**,再演示
**红黑树(RBT)的插入 / 删除**。现有的「定位」与自动布局、性质检查都复用,镜头移动
做成非线性的缓动。

## 0. 交接速览(会话可能被删,先读这段)

- **目标**:背景画布上按步演示 BST 原理 -> 旋转 -> 退化 -> RBT 插入 / 删除;复用现有
  「定位 / 布局 / 检查」,镜头加非线性缓动。
- **核心决定**:动画 = 回放一条 **JSON 轨迹**(每步一份完整中性 document + 叙述 +
  高亮 / 镜头 / 锚定);不是手 K 关键帧,算法只 `yield` 事件(§2、§4)。
- **四层**:轨迹生成(纯逻辑)/ 场景形变 / 镜头 / 播放器与演示 UI;文件与职责见 §10。
- **已确认**:旋转是 BST 的前置知识,排在第 9 章(§7.1);Python demo 已有 BST 静态示例
  (§15);叙事顺序 BST -> 旋转 -> 退化 -> RBT。
- **已拍板**:§14 的四个问题按下述口径实现 —— 演示入口放**任务栏**「演示」动作、RBT 删除本轮
  已做、JSON 编辑器默认不跟随(写回 JSON 未做)、自由操作沙盒留到 M5。
- **现状**:M0–M4 已实现并有测试(全仓 282 项通过);演示可播放 / 暂停 / 单步 /
  回退 / 拖进度条 / 变速 / 跟随镜头开关 / 键盘控制。
- **下一步**:M5(自由操作沙盒、BST/RBT 对照、章节跳转打磨);可选「把当前帧写回 JSON」。

---

## 1. 用户看到什么

```text
┌──────────────────────────────────────────────────────────────────────┐
│  JSON / 实体 / 检查配置 / 诊断 / 帮助 窗口最小化,只留「检查」窗口    │
│                                                                      │
│                        ● 10                                          │
│                       /    \                                         │
│                    ● 5      ○ 15        ← 背景平面就是演示区          │
│                   /   \                                              │
│                 ○ 1   ● 8                                            │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 红黑树 · 插入            7/18   [◀][⏸][▶]  1×  [跟随镜头][退出] │  │
│  │ 叔叔是红色 → 父 / 叔染黑,祖父染红,把祖父当作新的当前节点         │  │
│  │ ●──────────○──────○──○───●──────────●──────●───●──○──○──○──○    │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

行为约定:

- 一次演示 = **一个剧本**(结构 + 操作序列),被切成若干**步骤**;每一步有一句标题 /
  一句解释、一个当前处理节点(高亮)、一段可选的镜头移动。
- 步骤之间自动播放,也可以单步、回退、跳章;回退与拖动进度条是**瞬移**(直接切到那一
  步的完成态),只有前进播放才走过渡动画。理由见 §3。
- 每一帧都是一份**合法中性场景 JSON**:背景画布、实体列表、检查窗口全部按这一帧重算。
  红黑树演示到"暂时违反红孩子规则"时,检查窗口当场变 FAIL,修完再变回 PASS —— 这是
  教学里最值钱的一屏,不用另写一套"不变量面板"。
- 镜头跟随当前步骤:先看位置,再动;距离远时先拉远、再飞、再推近(§6)。
  用户拖动 / 滚轮时**只取消当前这段镜头动画**,不影响演示;「跟随镜头」关掉后演示
  不再抢镜头。
- 退出演示回到原来的六窗口布局,JSON 编辑器内容**不被演示改动**(可选「把当前帧写回
  JSON」,见 §9.4)。

---

## 2. 核心决定:先有轨迹,再谈动画

**动画不是算法的副作用,而是"轨迹"的回放。** 算法在纯逻辑层运行,产出步骤数组;
播放器只负责把第 i 步画出来、在第 i-1 与第 i 步之间插值。

```text
初始结构 + 操作序列
    │  datastruct/bst | rbt 的模拟器(纯函数,不碰 DOM)
    ▼
SceneTrace = [ { document, title, detail, focus|frame, anchor, marks, motion, hold } ... ]
    │            每帧 document 都是一份中性场景 JSON
    ├─ visual/layout 逐帧布局(现有 layoutScene)
    ├─ scene_check 逐帧跑检查(现有 runSceneChecks)
    ▼
播放器:虚拟时钟 + 场景插值 + 镜头插值 + 列表同步
```

只把"下一步长什么样"做成快照,而不是"下一步对 DOM 做什么",换来四件事:

| 想要的能力 | 快照轨迹为什么免费 |
| --- | --- |
| 回退 / 拖进度条 | 重放到第 i 步即可,不需要反向动画 |
| 暂停 / 变速 | 冻结或缩放虚拟时钟;不依赖 CSS 动画的当前状态 |
| 自动化测试 | 纯逻辑层断言"第几步的树长什么样、检查是否 PASS" |
| 复用现有渲染 | 每帧照旧走 `layoutScene -> VisualScene -> SVG` |

反过来,在算法里边改 DOM 边播、或者给每一步手写 CSS keyframes,都会把"结构是否正确"
与"画面是否对"耦在一起,回退和测试都无从下手。

### 2.1 不采用的几种做法

| 做法 | 为什么不 |
| --- | --- |
| 手 K 关键帧 / 给每一步写 CSS animation | 结构一变就要重画;回退与拖进度条没有"真相";测试只能靠截图 |
| 算法里边跑边改 DOM | 结构与画面耦合;不能暂停 / 回退;纯逻辑层无法单测 |
| 逐元素用 Web Animations API `animate()` | 连线端点、箭头路径、布局重排不是 CSS `transform` 能表达的;多元素时序会爆炸 |
| 每帧把整幅图重建成 SVG 字符串 | 元素没有稳定身份,浏览器没有"上一帧"可插值;`getBBox()` 每帧抖动 |
| 力导向 / 物理弹簧动画 | 结果依赖随机初值与时间,不可复现;教学演示必须同输入同画面 |

采用"快照轨迹 + 程序化插值"的代价也要说清楚:每一帧的 `document` 是完整快照(小树
几十个节点,内存与序列化都不是问题),换来的是确定性、可回退、可测试。

---

## 3. 三套时间必须分开

| 层 | 管什么 | 实现 | 时长量级 |
| --- | --- | --- | --- |
| **结构动画** | 节点位移、连线重接、进入 / 离开、染色 | 每个节点按稳定 id 复用元素,逐帧写属性 | 240–520ms |
| **镜头动画** | 世界层 `transform`(`x` / `y` / `k`) | 在视口层对 `PlaneViewState` 插值 | 280–900ms,距离自适应 |
| **叙述** | 步骤停留,让人读得完 | 虚拟时钟的 `hold` | `clamp(700 + 24×字数, 700, 1800)`ms |

三条时间线的顺序:**镜头先动,结构跟上,叙述收尾**。镜头与结构可以重叠:镜头用前
60% 到位,结构在 20% 后开始变形,人眼先到、再看变化。旋转这类"看几何"的步骤例外:
镜头保持不动(§5.4、§7.1)。

播放器状态机:

```text
idle ──play──> playing ──pause──> paused ──play──> playing
  ▲                │                                    │
  └──── 播完最后一步 / 退出 ◄────────────────────────────┘

next():  从当前步过渡到下一步,过渡完自动暂停
prev():  直接切到上一步完成态(不做反向动画)
seek(i): 直接切到第 i 步完成态(拖进度条 / 跳章)
```

回退不做反向动画是刻意的:反向插值要重新决定"哪些节点该退场",还会让刚删除的节点
反向出现;对教学没有帮助,还多一倍状态。要看上一步,瞬移过去再单步即可。

---

## 4. 轨迹的数据契约

放在 `src/datastruct/trace/`(纯逻辑,不碰 DOM):

```ts
/** 一步 = 一帧完整结构 + 一句叙述 + 这一帧的高亮 / 镜头 / 形变提示 */
interface TraceStep {
    /** 这一帧的完整结构,中性场景 JSON 的形状(与编辑器里那份同一套字段) */
    readonly document: SceneDocument;
    readonly title: string;
    readonly detail: string;
    /** 镜头对准的节点 key;不给 = 保持当前镜头 */
    readonly focus?: number;
    /** 镜头框住的一组节点 key(优先于 focus):局部手术 / 旋转要一次看全 α β γ */
    readonly frame?: readonly number[];
    /** 镜头策略:点 / 整幅适应 / 不动(默认 point) */
    readonly framing?: 'point' | 'fit' | 'hold';
    /**
     * 帧间锚定:这一帧里的 `anchor` 节点,尽量落在上一帧 `anchorAt` 节点的位置
     * (`anchorAt` 不给 = 取上一帧的同名节点)。布局每次都会按包围盒重新归零,
     * 不锚定的话整棵树会跟着平移,真正变化的那几个节点反而看不清。细则见 §5.4。
     */
    readonly anchor?: number;
    readonly anchorAt?: number;
    readonly marks?: TraceMarks;
    /** 从上一帧过渡到这一帧时的几何提示(旋转 / 子树平移) */
    readonly motion?: TraceMotion;
    /** 覆盖默认停留时间(ms),快的机械步骤可以短一点 */
    readonly holdMs?: number;
    /**
     * 这一拍直接硬切,不做帧间插值:章节之间换成完全无关的一棵树时,从上一帧插值过去
     * 会得到"所有节点乱飞"的中间态.播放器看到它就直接落定(docs/animation.md §7.1).
     * 这是实现时对原契约的补充:轨迹仍然只是数据,不引入时间轴.
     */
    readonly cut?: boolean;
}

interface TraceMarks {
    readonly nodes?: readonly { readonly key: number; readonly state: NodeState }[];
    readonly links?: readonly { readonly from: number; readonly to: number; readonly state: LinkState }[];
}

type NodeState = 'active' | 'path' | 'visited' | 'found' | 'ghost' | 'fresh';
type LinkState = 'path' | 'ghost';

type TraceMotion =
    // 绕"旧 from–to 边"的中点做极坐标插值;from = 下沉的那个(x),to = 上位的那个(y)
    | { readonly kind: 'rotate'; readonly from: number; readonly to: number }
    | { readonly kind: 'subtree'; readonly root: number };  // 子树整体平移

interface SceneTrace {
    readonly title: string;
    readonly checkIds: readonly string[];   // 每帧顺带跑的性质检查
    readonly steps: readonly TraceStep[];
}
```

约定:

- **节点身份 = `nodes[].key`**。算法内部给每个节点一个稳定 key(= 创建序号),`label`
  才是值。删除两个孩子的节点时用**物理移植**(把后继节点整个接到被删位置),而不是
  "复制值再删后继":这样颜色、key、高亮都跟着节点走,画面不会出现"值瞬移 + 颜色跳变"。
- **`pointers` 顺序承载左右语义**(`docs/checks.md` 已写明),算法输出孩子时必须
  **按 key 升序**,否则自动布局会把左右子树画反。
- 每帧 `document` 都能被现有 `parseSceneDocument` 解析,也能直接喂给
  `runSceneChecks`;测试逐帧跑一遍即可证明轨迹合法。
- 高亮状态**不进 `attrs`**:红黑颜色是结构语义(`visual-node--red`),高亮是动画词汇
  (`visual-state--active`),两者可叠加。见 §5.2。
- `motion` 只描述"怎么过渡",不改变这一帧的布局结果;没有提示就按直线插值。
- **轨迹不进中性 JSON**:一份 JSON 仍然只描述"一个结构";轨迹是展示层产物,由初始
  结构 + 操作序列现算。否则 Python 写出的静态 JSON 会和 web 的动画状态互相污染,
  "同一份 JSON 打开应当看到同一个结构"这条契约就破了。
- **标签必须是十进制数**:BST / RBT 的检查器走 `src/scene/label_value.ts`,把 `label`
  按十进制读;演示剧本的 `label` 只能是 `"5"` 这类,不能是 `"5a"` / `"节点5"`。

操作序列也用简单数据描述(剧本文件里直接写):

```ts
type TreeOp =
    | { kind: 'search'; key: number }
    | { kind: 'insert'; key: number }
    | { kind: 'delete'; key: number }
    | { kind: 'traverse'; order: 'in' | 'pre' | 'post' }
    // 显式旋转:BST 旋转章节 / 自由操作沙盒直接指定"绕哪个节点往哪边转"
    | { kind: 'rotate'; direction: 'left' | 'right'; key: number };
```

### 4.1 一段轨迹长什么样(插入 5)

轨迹就是**一个 JSON 数组**,每一步的 `document` 都是一份完整的中性文档(下面省略了
重复的节点 / 指针,只保留会变的部分和元信息):

```json
[
  {
    "document": {
      "nodes": [
        {"key": 0, "label": "8"}, {"key": 1, "label": "4"}, {"key": 2, "label": "2"},
        {"key": 3, "label": "6"}, {"key": 4, "label": "12"}, {"key": 5, "label": "10"},
        {"key": 6, "label": "14"}
      ],
      "pointers": [
        {"from": 0, "to": 1}, {"from": 1, "to": 2}, {"from": 1, "to": 3},
        {"from": 0, "to": 4}, {"from": 4, "to": 5}, {"from": 4, "to": 6}
      ],
      "edges": []
    },
    "title": "从根开始",
    "detail": "要插入 5,先和根 8 比较",
    "focus": 0,
    "marks": {"nodes": [{"key": 0, "state": "active"}]}
  },
  {
    "document": { "...": "结构不变,省略" },
    "title": "5 < 8",
    "detail": "去左子树",
    "focus": 1,
    "marks": {
      "nodes": [{"key": 0, "state": "path"}, {"key": 1, "state": "active"}]
    }
  },
  {
    "document": { "...": "在上面那份基础上加一个节点和一条指针" },
    "title": "挂到 6 的左孩子",
    "detail": "5 < 6,左孩子为空,插入完成;中序仍是升序",
    "focus": 7,
    "anchor": 3,
    "marks": {
      "nodes": [{"key": 3, "state": "path"}, {"key": 7, "state": "fresh"}]
    }
  }
]
```

三个要点:

- **没有坐标、没有 keyframes**:节点画在哪由 web 用这一帧的 `document` 重新布局;
- **没有"动画指令"**:`focus / marks / anchor` 是给播放器的提示,不是时间轴。真正
  怎么动(多快、什么曲线、先动谁)由视觉层统一决定;
- 这份轨迹**可以落盘、可以 diff、可以用 Python 生成**,因为它只是数据。哪天想把算法
  挪到 Python 侧,输出格式不用变。

### 4.2 "做一段动画" = 写产生帧的函数,不是写关键帧

制作流程固定为五步,每步只改一层:

```text
① 写算法事件          datastruct:每发生一件事 yield 一个 TraceStep
② 每帧算布局 / 检查    visual/layout + scene_check:输入 document,输出坐标 / PASS-FAIL
③ 帧间锚定 + 插值      visual/anchor + motion:两帧 -> 任意 t 的一帧(位置 / 连线 / 透明度)
④ 落笔 + 镜头          visual/painter + viewport:写 SVG 属性、插值 PlaneViewState
⑤ 节奏与叙述          ui/demo_player:hold / 速度 / 单步;标题与解释来自 ①
```

①是最像"写动画"的一步,但它只是普通算法,加几行 `yield`:

```ts
// datastruct/bst/bst.ts(示意)
function* insert(root: BstNode, key: number): Generator<TraceStep> {
    let current: BstNode | null = root;
    let parent: BstNode | null = null;
    while (current !== null) {
        yield {
            document: snapshot(root),              // 这一拍的结构(完整快照)
            title: `比较 ${key} 与 ${current.key}`,
            detail: key < current.key ? '比当前节点小,走左子树' : '比当前节点大,走右子树',
            focus: current.key,                    // 镜头看这里
            anchor: current.key,                   // 帧间锚定:这个节点别在画面上乱跳
            marks: { nodes: [{ key: current.key, state: 'active' }] },
        };
        parent = current;
        current = key < current.key ? current.left : current.right;
    }
    // ...挂到 parent 的空孩子上,再 yield 两拍:插入 + 验证中序
}
```

②~⑤由框架做一次、所有结构复用。所以"制作"一个新的结构调整的是:

| 想改什么 | 改哪里 |
| --- | --- |
| 演示里出现哪些步骤 / 怎么叙述 | ① 算法事件与 `title / detail` |
| 哪几个节点高亮、什么颜色 | ① `marks`(状态词表)+ ② CSS |
| 镜头看哪里、要不要动 | ① `focus / frame / framing` |
| 转得快不快、停留多久 | ① `holdMs` / ⑤ 播放器参数 |
| 移动的弧线 / 缓动 / 缩放 | ③④ 视觉层统一参数(不逐段手调) |
| 每帧是否合法 | ② 现有 `parseSceneDocument` + `runSceneChecks` |

这就是"程序化动画"和"手 K 关键帧"的区别:**内容变,帧自动重算**。红黑树插入换一组
序列、加一个情形,不需要重画任何一条时间轴;改一个缓动常数,所有结构的动作一起变。

三种"制作"粒度,按需要选:

| 粒度 | 做法 | 适合 |
| --- | --- | --- |
| 剧本 | 固定初始结构 + `TreeOp[]`,一次性生成整条轨迹 | 教学演示(BST / RBT 各章) |
| 自由操作 | 用户每插一个值就 `ops.push()` 并重算轨迹(小树毫秒级) | 沙盒 / 课堂问答 |
| 单帧 | 只替换当前帧的 `document` / `marks`,不做过渡 | 断点、对比、调试 |

> 现状:Python 侧已经在 `python/examples/bst.py` 提供了 BST 的静态中性 JSON(见 §15),
> 轨迹生成与播放器仍未实现;上面是落地时的形状与分工。

---

## 5. 场景形变:现有渲染差在哪,怎么补

现状:`renderScene()` 每轮**整批重建**世界层,节点按位置摆放,没有跨轮身份。用于
静态重绘是对的,用于动画不够:元素被换掉时浏览器没有"上一帧",无法插值。

### 5.1 稳定身份 + 增量落笔

新增 `ScenePainter`(visual/render.ts 扩展,或独立 `visual/painter.ts`):

- 内部两张表:`Map<nodeKey, { group, shape, text }>`、`Map<linkId, { line, arrow }>`;
  连线 id = `${from}->${to}#${同序对出现序号}`。
- `apply(frame, t)`:
  - 只出现 / 只消失的元素挂 `visual-state--entering` / `--leaving`,淡入淡出 + 缩放;
  - 两帧都有的元素更新 `transform` 与端点;
  - 落笔完成(t = 1)时移除退场元素、把属性写成精确值,并**只在这里量一次 `getBBox()`**
    报给视口(动画中途不量,见 §5.1、§13.1)。
- 静态路径(`RUN` / 示例)保留现在的 `renderScene` 一次性重建;动画路径才走
  `ScenePainter`。两条路径共用同一套节点 / 连线构造,避免观感分叉。

### 5.2 高亮用"状态类",不抢颜色变体

- 结构色仍是 `visual-node--red` / `--black`(结构自己的样式表);
- 动画状态追加 `visual-state--active` / `--path` / `--visited` / `--found` / `--ghost` /
  `--fresh`,由 `visual/visual.css` 统一接住:外圈描边、呼吸、透明度、虚线。
- 染色(红 ↔ 黑)只切 class,CSS 写 `transition: fill 200ms`;不需要逐帧插值颜色。
  红色变黑是红黑树里最常见的动作,200ms 足够看清,又不拖节奏。
- 「当前节点」加一圈**静态**描边(不呼吸):呼吸动画会跟滚轮缩放抢眼睛,也会让连续
  单步显得晃;只有"等待用户确认"的暂停态才允许轻微呼吸(可选)。

### 5.3 连线必须跟着节点走

不能只对连线的两个端点线性插值:节点在动时,端点会脱开圆边。做法是把端点公式从
`layout.ts` 提成可复用的纯函数:

```ts
linkEndpoints(from: VisualPoint, to: VisualPoint, laneOffset: number): { start, end }
```

- `layout.ts` 静态布局继续用它(行为不变);
- 动画每帧先用插值后的节点坐标,再对 `laneOffset` 插值(平行边 / 反向指针分道数变化
  时不会瞬跳),最后重算端点;
- 进出场连线的透明度单独插值;需要"生长"效果时用 `stroke-dasharray` + `pathLength`
  (可选,不做也不影响正确性)。

### 5.4 布局变化的插值

**先锚定,再插值。** 现有布局把每个分量的包围盒归零,任何一次插入 / 删除 / 旋转都会
让整棵树的坐标平移一段(哪怕只是加了一个最左叶子)。直接把两帧布局插值,画面上是
"所有节点一起滑",真正变化的那几个节点反而看不清。

所以每一步先对整帧布局做一次**纯平移**:让 `anchor` 节点落在上一帧 `anchorAt` 节点的
位置(`anchorAt` 缺省取上一帧的同名节点),再在平移后的两帧之间插值。锚点取法:

| 步骤 | `anchor` / `anchorAt` |
| --- | --- |
| 查找 / 比较 | 当前节点(两帧同一个 key) |
| 插入 | 新节点的父节点 |
| 删除 | 被删节点的父节点(删根时取后继) |
| **旋转** | 新子树根 `y` / 旧子树根 `x`(y 顶到 x 原来的位置) |
| 整幅适应 / 章节开场 | 不锚定,直接 `fit` |

平移量是纯算术,整条轨迹可以预先算好;测试能断言"锚点前后像素级不动"。

- 一般情况:节点坐标从上一帧布局线性插值到这一帧布局,`easeInOutCubic`。
- **旋转**用 `motion: { kind: 'rotate', from: x, to: y }`:
  - x、y 绕"旧 x–y 边的中点"做**极坐标插值**(半径线性、角度取最短弧),看起来是
    绕轴转,而不是两个圆擦肩而过;
  - 被移交的 β 子树以**新父节点 x** 为圆心走一条短弧(它是"换爹"的主角);
  - α / γ 各自跟随父节点平移;
  - 相机 `framing: 'hold'` 不动,并提前用 `frame: [p, x, y, α, β, γ]` 框好。
- **单孩子删除**的子树整体上移用 `motion: { kind: 'subtree', root }`,只做平移,避免
  直线插值把子树拉成斜的。
- 左右孩子顺序:布局按 `pointers` 顺序排左右,算法输出时按 key 排序即可。

**旋转的中间态不是树。** 左旋的三次指针改写(x→y 变 y→x、y→β 变 x→β、p→x 变 p→y)
是同一帧内的原子操作;轨迹里不能把"β 已换父、y 还没上位"这种半成品当成一帧,它甚至
不是一棵合法的 BST。教学上的分解放在叙述、连线动画和单步节奏里,不放在 `document` 里。

指针改写的观感:

- 旧连接(x→y、y→β)冻结在上一帧端点淡出(≤ 220ms),新连接(y→x、x→β)从新端点
  画出(320ms,延迟 80ms);"哪三根指针变了"一眼可见;
- 方向翻转的 `x→y ↔ y→x` 视为同一条线:线跟着两个移动的圆走,箭头从一端滑到另一端;
- β 的换父用另一种状态色(如 `--ghost` -> `--active` 的一瞬)强调,因为它是旋转里
  唯一一块"换了归属的子树"。

---

## 6. 镜头:复用「定位」,再加缓动

现有 `focusPoint(x, y)` 已经定义了"镜头目标"的全部口径:把某个世界点放到可用区的
正中,缩放取 `max(当前 k, VISUAL_FOCUS_MIN_ZOOM)`。动画要做的只是:

1. 把目标计算提成纯函数(不改变现有行为);
2. 从当前 `PlaneViewState` **插值**到目标,而不是瞬间赋值;
3. 让用户手势能打断;
4. 给演示控制窗口留出 `bottomInset`(贴底时扣;现在只有顶部任务栏的 `topInset`)。

```ts
// visual/viewport.ts —— 实际签名(取景数学都是纯函数,句柄方法负责动画)
export interface PlaneInsets { readonly top: number; readonly bottom: number }

export function focusPlaneView(
    current: PlaneViewState,          // 缩放取 max(current.k, minZoom)
    point: VisualPoint,
    viewport: PlaneBox,
    insets: PlaneInsets,
    minZoom: number,
): PlaneViewState;

/** 框住一组点(旋转要一次看全 p / x / y / α / β / γ),取包围盒 + 圆半径余量再适应 */
export function framePlaneView(
    current: PlaneViewState,
    points: readonly VisualPoint[],
    viewport: PlaneBox,
    insets: PlaneInsets,
    maxZoom: number,
): PlaneViewState;

/** 中心线性 + 缩放对数插值;t 由 tween 缓动后传入 */
export function interpolatePlaneView(
    from: PlaneViewState, to: PlaneViewState,
    viewport: PlaneBox, insets: PlaneInsets, t: number,
): PlaneViewState;

/** 280 + 0.5×屏幕距离 + 260×|log2(k1/k0)|,夹在 280~900ms */
export function viewAnimationDurationMs(...): number;

// PlaneViewportHandle 上的方法(动画由视口自己用注入的时钟驱动)
interface PlaneViewportHandle {
    animateTo(target: PlaneViewState, options?: { animated?: boolean; duration?: number }): void;
    cancelAnimation(): void;
    getView(): PlaneViewState;
    setInsets(insets: PlaneInsets): void;
    focusPoint(x: number, y: number, options?: { animated?: boolean }): void; // 缺省立即到位
    framePoints(points: readonly VisualPoint[], options?: { animated?: boolean }): void;
}
```

- 实体行 / FAIL 行的「定位」改为调用 `animateViewTo(focusPlaneView(...))`:
  **同一个目标,只是加了过渡**;`prefers-reduced-motion` 或测试环境直接赋值。
- 演示每一步的镜头也用同一个函数:`focus` 走点目标,`frame` 走一组节点的包围盒,
  `framing: 'hold'` 则完全不动(旋转、指针改写这类"看局部几何"的步骤用它)。
- `framePlaneView` 是 `fitPlaneView` 的特例:把节点中心按半径 + 留白扩成包围盒再调用它,
  没有必要另写一套取景数学。

### 6.1 插值的是"中心 + 对数缩放"

`x / y` 是"世界原点画在哪",直接线性插值 `x / y / k` 会让缩放和位移各走各的。改成:

```text
状态 = (中心世界点 c, 缩放 k),c 对到可用区正中
x = cx - c.x * k
y = cy - c.y * k

e  = ease(t)
k  = k0 * (k1 / k0) ** e        // 对数空间插值:0.2 -> 1 和 1 -> 5 的手感一致
c  = c0 + (c1 - c0) * e
```

这样即使 `e` 是线性的,画面也是"一边飞一边推拉";再叠非线性 `e`,就有明显的
"起步慢、中段快、收尾稳"。

### 6.2 非线性:两层,必做 + 可选

**必做——缓动曲线。** 相机用 `easeInOutCubic`,**不做过冲**(过冲会让人晕):

```ts
const easeInOutCubic = (t: number): number =>
    t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
```

时长随距离与缩放变化,避免"近处慢吞吞、远处来不及":

```text
d = 两个中心在 min(k0, k1) 下的屏幕距离(px)
duration = clamp(280 + 0.5 * d + 260 * |log2(k1 / k0)|, 280, 900)   // ms
```

**可选——远距离"拉远再飞"路径。** 当目标不在当前视口内,或
`d > 0.55 × min(可用宽, 可用高)` 时,用三段关键帧代替直线:

| 段 | 时间 | 动作 |
| --- | --- | --- |
| ① 拉远 | 0–35% | 中心略向中点移动,`k -> k_mid`(能同时看见起终点的比例) |
| ② 平移 | 35–65% | 保持 `k_mid`,中心移到目标 |
| ③ 推近 | 65–100% | 中心落定,`k_mid -> k1` |

三段内部各自 `easeInOutCubic`,在段边界速度归零,拼起来是连续的。红黑树旋转 / 删除
这类步骤距离通常很近,走不到这条路径;跨子树、整幅适应时才用得上。

### 6.3 打断与所有权

| 事件 | 行为 |
| --- | --- |
| 用户拖动 / 滚轮 / 双指 | `cancelViewAnimation()`,停在当前插值位置;演示的结构动画继续 |
| 用户按「回正视图」 | 取消动画,立即 `fitViewport()` |
| 「跟随镜头」关 | 演示不再发镜头目标,结构动画照旧 |
| 下一步 | 若跟随开着,重新发目标(用户刚才的手动视角被覆盖,这是看演示的预期) |
| `prefers-reduced-motion: reduce` | 镜头与结构过渡都变成瞬移;步骤仍可自动 / 手动前进 |

视口现有的 `manual` 标志(用户挪过就退出自动适应)继续保留:动画里每次发目标都会
`manual = true`,这样每帧内容变化不会触发自动 fit;退出演示后点「回正视图」恢复。
**不要**用 `manual = false` 硬切自动模式,否则镜头会和 `contentChanged` 抢。

---

## 7. 剧本一:二叉搜索树(先把原理讲透)

原则:每一步只做一件事,画面上只强调一个节点 / 一条路径。

| 章 | 操作 / 序列 | 画面重点 | 顺带跑 |
| --- | --- | --- | --- |
| 1. 形状与不变量 | 初始树 `8,4,12,2,6,10,14` | 依次点亮每个节点的左右关系;中序访问顺序 = 升序 | `checkBstOrder` |
| 2. 查找命中 | `search 6` | 路径 `8 -> 4 -> 6`;每次比较标注"6 < 8 → 左",到的节点描边 | `checkBstOrder` |
| 3. 查找失败 | `search 5` | 走到空位;用虚线圈表示"将插在这里" | — |
| 4. 插入 | `insert 5` | 沿路径走到空位,新节点淡入 + 放大;布局重排后父节点移到中间 | `checkBstOrder` |
| 5. 删除·叶子 | `delete 2` | 路径高亮,节点缩小淡出,父节点连线消失 | `checkBstOrder` |
| 6. 删除·单孩子 | `delete 4` | 孩子子树整体上移(`motion: subtree`),父指针改接 | `checkBstOrder` |
| 7. 删除·双孩子 | `delete 12` | 先找右子树最小(后继)并高亮;后继物理移植到被删位置;被删节点淡出 | `checkBstOrder` |
| 8. 遍历 | `traverse in` | 按访问顺序逐个点亮,底部叙述累加 `2 4 5 6 8 ...` | — |
| 9. **旋转** | 左旋 / 右旋 / 之字形(见 §7.1) | 保序、局部改形;只动三根指针 | `checkBstOrder` |
| 10. 退化 | 空树依次 `insert 1..7`(升序) | 相机逐渐拉远,树长成一条链;层数从 2 长到 7 | `checkBstOrder` |
| 11. 转折 | 定格在链上 | 叙述:"BST 自己不会用旋转;要有人替它决定何时转、转几次" -> 接 RBT 剧本 | — |

第 10 章是整段演示的钩子:同一组升序插入,在 BST 上退化成链表,下一段用同样的序列
看红黑树如何保持高度 —— 观众立刻知道为什么要学红黑树。第 9 章必须先讲透:红黑树的
fixup 里只剩"什么时候转、转谁",旋转本身应当是已经学会的工具。

### 7.1 第 9 章:旋转,BST 的局部手术

BST 的查找 / 插入 / 删除都不需要旋转。旋转是另一个方向的问题:**能不能不改变中序、
只改变形状?** 能,而且只动三根指针。先把它讲清楚,红黑树就少一半新概念。

这一章不引入颜色,只讲几何。

| 拍 | 操作 | 画面 |
| --- | --- | --- |
| 0 动机 | 念一句 | "要换形状,但不能破坏 `α < x < β < y < γ`" |
| 1 认轴 | 框住 p / x / y / α / β / γ | 边 x–y 亮成轴;三块子树各给一个淡色标签 α / β / γ |
| 2 左旋 | `motion: rotate(from=x, to=y)` | y 顶到 x 原来的位置、x 下沉;β 从 y 的左子树改挂到 x 的右子树;p→x 变 p→y(x 是根时是"根变了") |
| 3 验证中序 | 前后各点亮一次中序 | 底部并排两行 `3 5 7 10 12 15 18`,完全相同 |
| 4 看高度 | 标层数(根算第 1 层) | 线形右重时左旋把层数从 4 降到 3;β 比 γ 高时也可能不降反升 —— 旋转只重分配高度,不保证降 |
| 5 右旋 | 镜像 | 在 `y` 上右旋,回到第 2 拍之前的样子(左旋 / 右旋互逆) |
| 6 之字形 | 30–10–20 | 先对 `30` 右旋:之字形被**镜像**成 `10 -> 30 -> 20`,层数仍是 3;复位后做双旋(左旋 `10`,再右旋 `30`),层数 3 -> 2 |
| 7 边界 | 根旋转 / 单侧空 | 根指针改写;"要转的那一侧没有孩子"时不是旋转(只讲解,不生成帧) |

演出数据:

- 线形(右重):根 `10`,左孩子 `5`,右孩子 `20`(左 `15`,右 `30`,而 `30` 的右孩子 `40`);
  在 `10` 上左旋,层数 4 -> 3;再在 `20` 上右旋,复原;
- 之字形:根 `30`,左 `10`,`10` 的右孩子 `20`。先右旋 `30` 看层数不变(只是镜像);
  复位(硬切,不做动画)后做双旋:左旋 `10` -> 再右旋 `30`。

这一章的落点直接喂给下一章:第 6 拍的"双旋第一下"就是红黑树插入情形 2 里
"把内侧孩子转成外侧"的那一步;情形 3 的单旋就是第 2 拍。到了 RBT,旋转动作、
高亮词、连线改写完全复用,只需再加一层染色。

---

## 8. 剧本二:红黑树(插入优先,删除次之)

### 8.1 入口:五条性质

开局用检查窗口当"不变量面板",一条一条亮:颜色合法 / 根黑 / 红孩子黑 / 黑高相等 /
BST 有序。每点亮一条,画面上对应位置闪一下(根、一对红父子、一条路径的黑节点数),
比纯文字定义直观。

### 8.2 插入的叙述结构

新节点一律**先染红**,所以只可能违反"红孩子"这一条:

```text
插入 z(红)
  ├─ z 是根                     → 染黑,结束
  └─ 父 p 是黑                  → 结束
     └─ 父 p 是红(必有祖父 g)
        ├─ 叔 u 是红             → 情形 1: p、u 染黑,g 染红,z := g 继续
        └─ 叔 u 是黑 / 空
           ├─ z 是内侧孩子       → 情形 2: 旋转 p,转成外侧(不改色)
           └─ z 是外侧孩子       → 情形 3: p 染黑,g 染红,旋转 g,结束
```

每一步的镜头 / 高亮:

| 情形 | 镜头 | 高亮 | 叙述示例 |
| --- | --- | --- | --- |
| 情形 1 | 保持,框住 p / u / g | p、u、g 三节点 | 叔叔是红色 → 只染色,并把祖父当作新的当前节点 |
| 情形 2 | 保持,`frame` 框住 p / z / 相关子树 | p、z + 两条指针 | 当前节点是内侧孩子 → 先绕父节点旋转,把它变成外侧(同 BST 第 9 章的双旋第一下) |
| 情形 3 | **不动**(`framing: 'hold'`) | p、g + 三条指针 | 外侧孩子 → 父染黑、祖父染红,绕祖父旋转(同 BST 第 9 章的单旋) |
| 根染黑 | 不动 | 根 | 根必须是黑色 |

旋转动作**完全复用 BST 第 9 章的词汇**:同样的 `motion: rotate(from, to)`、同样的
旧线淡出 / 新线画出、同样的绕轴极坐标插值;区别只是这一章节点带颜色,而且染色与旋转
可能落在同一拍或相邻两拍。讲 RBT 时不再解释"什么是旋转",只解释"为什么要在这里转"。

### 8.3 演出用的序列(已核对覆盖所有情形)

| 剧本 | 初始 / 操作 | 覆盖 |
| --- | --- | --- |
| 入门 | 空树,依次 `10, 20, 30` | 情形 3(左旋) |
| 生根 | 空树,依次 `10, 5, 15, 1` | 情形 1,且祖父是根 -> 根由红染黑 |
| 综合插入 | 空树,依次 `7, 3, 18, 10, 22, 8, 11, 26, 2, 6, 13` | 情形 1 / 2 / 3 全出现(含一次先旋转成外侧再接情形 3) |
| 对照 | 与 BST 第 10 章同一组升序 `1..7` | 层数 4 vs 7,黑高一致;结尾回到"平衡"这个主题 |

> 序列在实现时由轨迹测试保证:断言"至少各出现一次情形 1/2/3"与"最后一帧五条检查
> 全 PASS"。改算法时测试会挡住"演示里再也看不到某个情形"这种退化。

### 8.4 删除(已实现)

删除是红黑树最难讲的部分,放在插入之后单独一章,允许更长、更慢:

- 被删节点有 0/1 个孩子:物理移植;若被删的是黑色,出现"双黑";
- 被删节点有 2 个孩子:找后继,记录后继颜色,移植后继;
- 双黑修复四情形(sibling 红 / sibling 黑且两孩子黑 / sibling 黑且近端红 /
  sibling 黑且远端红),用 `--ghost` 状态表示"双黑挂在这个位置";
- 每一步的检查窗口就是"现在违反了哪条",修完转 PASS。

删除的步骤数大约是插入的两倍,播放器需要「单步」和 0.5× 速度;自动播放默认在
删除章的 `hold` 加长(约 1.5×)。

### 8.5 可选:对照演出

同一份文档里放两棵互不相连的树(BST + RBT),现有的自动布局会把两个连通分量并排。
用同一组插入序列同时推进,镜头 `framing: 'fit'` 框住两棵,高度差一眼可见。这一步
可以放到最后做,纯数据组合,不需要新的视觉图元。

---

## 9. 界面:演示模式

### 9.1 入口

- 任务栏动作区新增「演示」动作(库的 `DockActionSpec`,排在「回正视图」左边),
  点开是分组菜单:`二叉搜索树` / `红黑树`,每项一个剧本;选中即:
  1. 停掉正在跑的静态流程(演示期间静态重绘不接管画布);
  2. 把剧本的 `checkIds` 写进「检查配置」窗口(与载入示例同一套做法,退出时还原);
  3. 生成轨迹,进入演示模式。
- JSON 窗口标题栏仍然只放「示例 / RUN」:演示是**桌面级模式入口**,与「回正视图」同属
  任务栏动作区;但**播放控制**不进任务栏:控制条装在一扇独立的演示窗口里(高度固定、
  宽度可拖,标题栏可拖,见 §9.3)。

### 9.2 演示模式的窗口处理

- 最小化 `JSON` / `检查配置` / `诊断` / `帮助`,保留 `检查`(不变量是教学的一部分),
  `实体` 可保留也可收起(默认最小化,减少干扰);
- 退出时恢复进入前的窗口状态(用 `desktop.windows.setMinimized(id, before)`);
- 背景画布 **不换 DOM**,只把可见区让出来;顶部任务栏始终占 `insets.top`,演示控制
  窗口贴桌面下沿时占 `insets.bottom`(拖离下沿后不再占,见 §9.3);
- 控制窗口**不进**窗口清单 / 任务栏,也不参与最小化 /「全部还原」:它随演示会话
  现建现拆(用库公开的 `createWindowFrame` + `bindDragGesture`,库本身不改)。

### 9.3 演示控制窗口

控制条装进一扇**独立窗口**(库的窗口外壳 `createWindowFrame`):高度固定、宽度可拖、
标题栏可拖,只随演示会话存在。它不进桌面窗口清单 / 任务栏,也不参与最小化 /「全部还原」;
不挂 min / max 按钮,手柄只留东西两根(纵向没有缩放入口):高度固定取 `config.ts` 的常量,
宽度在常量下限与桌面宽之间可调。

```text
演示                                   ← 窗口标题栏:拖动起手区(纵向固定,横向可拖)
[剧本名]        [3 / 18]   [◀ 上一步][⏸ 播放/暂停][下一步 ▶]   [0.5×|1×|2×]  [跟随镜头]  [退出]
步骤标题(粗体,一行)
步骤说明(常规,最多两行;过长省略,悬浮显示全文)
进度条:按步骤等分,章与章之间留缺口,可点击跳转
```

- **高度固定 / 宽度可调**:高度 180 固定(没有上下手柄);宽度初始 880,可拖东西两边在
  `VIEWER_DEMO_WINDOW_MIN_WIDTH`(520px)与桌面宽之间调;桌面更窄时创建期用库的
  `fitGeometry` 收一次;
- **可拖**:标题栏拖动,几何走库的 `moveGeometry` / `writeGeometry`,夹取常量取
  `DEFAULT_DESKTOP_CONFIG` 那一份(与常驻窗口同源);初始位置贴桌面左下;
- **镜头避让**:窗口贴桌面下沿时 `bottomInset = 桌面高 − 窗口顶`(当前节点因此不会被
  压住);拖离下沿超过容差(32px)后不再扣底部,避免给不存在的遮挡留白;
- 键盘(仅演示模式,且焦点不在输入框):`Space` 播放/暂停,`←/→` 上一步/下一步,
  `Home/End` 首尾,`Esc` 退出;
- 自动播放时,最后一步播完停在完成态并暂停,不循环;再按播放从第一步重放。

### 9.4 与现有功能的边界

| 现有动作 | 演示模式下 |
| --- | --- |
| RUN / `Ctrl+Enter` / 载入示例 | 先退出演示,再照原逻辑运行(不静默吞掉) |
| 实体行 / FAIL 行「定位」 | 照常可点,镜头平滑过去;不推进演示 |
| 检查配置窗口 | 已最小化;演示用剧本自带的检查集 |
| 拖动 / 滚轮 | 可自由看;当前镜头动画被打断,下一步会重新跟随(可关) |
| 「回正视图」 | 可用:中止镜头动画并整幅适应,下一步重新跟随 |

JSON 编辑器默认**不被改写**:演示是"看",编辑器是"改",两者混在一起会让人以为
播放改了自己的输入。「把当前帧写回 JSON」是**可选项,本轮未做**:暂停时接一根
「写回」按钮只需要把 `TraceStep.document` 序列化进编辑器,留到 M5 一起做。

---

## 10. 文件与分层

依赖方向保持 `ui -> datastruct`、`ui -> visual`,datastruct 与 visual 互不认识。

| 层 | 文件(已落地) | 职责 |
| --- | --- | --- |
| datastruct | `trace/trace.ts` | `TraceStep` / `SceneTrace` / 状态枚举 / `TraceBuilder` / `TreeOp`(纯类型 + 小工具) |
| datastruct | `bst/bst.ts` | `TreeModel`(稳定 key / 快照)+ search/insert/delete/traverse/**rotateLeft/rotateRight**,产出 `TraceFrame` |
| datastruct | `rbt/rbt_ops.ts` | 红黑树插入 / 删除模型 + fixup,产出轨迹(复用 BST 的旋转与稳定 key) |
| visual | `tween.ts` | 可注入时钟(`TweenClock`)+ 缓动 + `tween()`;单帧 delta 夹取 |
| visual | `anchor.ts` | 帧间锚定:按 `anchor / anchorAt` 平移整帧布局(纯算术);另有 `autoAnchorLayout` 兜底 |
| visual | `motion.ts` | 两帧场景 -> 插值帧:节点位置、分道偏移、高亮状态、进入/离开;旋转的极坐标插值 |
| visual | `elements.ts` | 节点 / 连线的构造与就地写入 + `getBBox` 测量(静态与动画两条路径共用) |
| visual | `painter.ts` | `ScenePainter`:稳定 id 的增量落笔,落定帧才移除退场元素 / 量包围盒 |
| visual | `viewport.ts`(扩展) | `focusPlaneView` / `framePlaneView` / `interpolatePlaneView` / `animateTo` / `cancelAnimation`;`insets` 上下两条 |
| visual | `layout.ts`(小改) | 抽出 `linkEndpoints()` / `assignLinkLanes()`,布局与动画共用端点公式 |
| ui | `viewer/demo_scenarios.ts` | 7 个剧本(初始结构 + 操作序列 + 检查 id + 章节标题) |
| ui | `viewer/demo_player.ts` | 播放器状态机:步骤 / 虚拟时钟 / 镜头请求 / 检查与列表同步 |
| ui | `viewer/demo_window.ts` | 演示控制窗口:库的窗口外壳 + 标题栏拖动 + 横向缩放 / 镜头避让几何 |
| ui | `viewer/demo_views.ts` | 控制条标记 + 按章进度条 + 键盘绑定 |
| ui | `viewer/viewer.ts`(扩展) | 「演示」菜单接线、模式进出、窗口状态恢复、RUN 冲突处理 |
| ui | `viewer/viewer_chrome.ts` + `config.ts` | 标题栏节点表 / 任务栏「演示」动作 / 剧本菜单面板 / DOM 契约 |
| 样式 | `visual/visual.css` + `tokens.css` | 状态类、染色过渡、reduced-motion |
| 样式 | `ui/viewer/viewer.css` + `tokens.css` | 控制窗口正文、步骤文本、进度条 |

`ui` 侧不 import 算法,只 import 轨迹类型与剧本生成入口:`demo_player` 拿到
`SceneTrace` 之后不再关心这是 BST 还是红黑树。

---

## 11. 测试

| 层 | 测试 | 断言 |
| --- | --- | --- |
| 纯逻辑 | `bst.test.ts` | 每帧解析通过;每帧 `checkBstOrder` PASS;删除三情形各出现;升序插入层数 = n |
| 纯逻辑 | `bst_rotation.test.ts` | 左旋 / 右旋前后**中序序列完全相同**;连续两次反向旋转回到原结构;之字形单旋层数不变、双旋降 1;右重线形左旋降 1;根旋转后根 key 正确;旋转帧全部是合法 BST |
| 纯逻辑 | `rbt_ops.test.ts` | 最后一帧五条检查全 PASS;情形 1/2/3 各至少一次;根最终为黑;黑高相等 |
| 纯逻辑 | `trace.test.ts` | 轨迹确定性(同输入逐字节同输出);每步 `document` 节点 key 唯一、引用有效 |
| 纯数学 | `tween.test.ts` | e(0)=0 / e(1)=1 / 单调;手动时钟推进;单帧 delta 夹取;cancel / abort;duration=0 |
| 纯数学 | `viewport.test.ts` 扩展 | 中心 + 对数插值端点精确;定位 / 框组取景;时长夹在 280~900;`animateTo` 在虚拟时钟上插值;用户拖动立即打断 |
| 纯数学 | `anchor.test.ts` | 锚点节点平移前后坐标完全相等;anchorAt 缺省取同名节点;节点缺失时的回退规则;自动锚定取最小共同 key |
| 纯数学 | `motion.test.ts` | 直线 / 极坐标 / 子树平移;连线端点始终在圆边;进入/离开透明度;旋转半径线性、路径不回摆 |
| DOM(happy-dom) | `painter.test.ts` | 两次落笔复用同一批 DOM;状态类 / 变体类叠加与切换;settled 才移除退场元素并量包围盒 |
| DOM(happy-dom) | `demo_player.test.ts` | 构造落第 0 拍;单步 / 回退 / seek;自动播放播完暂停;速度换算;reduce-motion / `cut` 硬切;镜头 hold / 跟随开关 |
| DOM | `viewer.test.ts` 扩展 | 「定位」平滑镜头接线;窗口 / 回正 |
| DOM | `demo_mode.test.ts` | 任务栏「演示」按钮与菜单;进入后窗口让位 / 控制窗口出现 / 第 0 拍落笔;单步与进度点;键盘 Esc / Space;退出恢复窗口与静态画面;RUN 先退出演示 |
| 纯逻辑 | `demo_scenarios.test.ts` | 7 个剧本每帧可解析、章节连续、检查已登记;BST 每帧有序;RBT 末帧五条全 PASS;情形 1/2/3、双黑四情形、退化层数等教学路径覆盖 |

约定:

- 轨迹测试不碰 DOM;播放器测试用注入的时钟,不 `setTimeout`。
- 所有"演示里应当出现的情形"由测试断言,避免以后改算法把教学路径改没了。
- `happy-dom` 没有排版,`getBBox()` 恒空 —— 与现有渲染测试同一口径:量不到就不动镜头,
  播放器逻辑仍可测。

---

## 12. 分期

| 期 | 内容 | 产出 | 状态 |
| --- | --- | --- | --- |
| **M0** | 镜头缓动:提 `focusPlaneView` / `framePlaneView`、`animateTo`、打断、上下 insets;「定位」改平滑 | 现有功能立刻受益,不引入演示模式 | **已完成** |
| **M1** | 动画地基:tween 时钟、`ScenePainter` 增量落笔、`motion` 插值、控制条 + 播放器 | 能播放 / 暂停 / 单步 / 回退 | **已完成** |
| **M2** | BST 引擎 + 全套剧本(查找/插入/删除三情形/遍历/**旋转**/退化),含锚定与旋转几何 | BST 原理完整演示 | **已完成** |
| **M3** | RBT 插入:模型 + fixup + 情形 1/2/3(复用 M2 的旋转)+ 每帧检查 | RBT 插入演示 | **已完成** |
| **M4** | RBT 删除:物理移植 + 双黑 + 四情形 | RBT 删除演示 | **已完成** |
| **M5** | 打磨:自由操作(输入任意插入/删除并重算轨迹)、BST/RBT 对照、章节跳转、参数微调、「写回 JSON」 | 可交互沙盒 + 对照 | 未做 |

M0 独立价值最高、风险最低;之后每一期都能独立演示、独立测试。当前 M0–M4 全部落地,
M5 是下一轮的可选项。

---

## 13. 坑与取舍

1. **`getBBox()` 不能每帧量。** 现有代码已经踩过"入场动画 0.9 倍导致包围盒偏小";动画
   期间量包围盒会得到中间态,自动适应会跟着抖。只在每步落定后量一次,并且演示期间
   视口 `manual = true`,不触发自动 fit。
2. **不能整批重建。** 元素一换就没有"上一帧";增量落笔是动画的前提。静态路径保持重建
   (简单、无残影),两条路径共用节点构造。
3. **节点的 CSS `transform` 属于位置属性。** 现有入场动画挂在形状 / 文字上而不是组上,
   正是这个原因;动画移动节点时也只改组 `transform` 属性,形状的 scale 归 CSS。
4. **`pointers` 顺序 = 左右。** 红黑树旋转后如果孩子顺序没按 key 排,布局会把左右画反,
   而且检查全 PASS —— 这是最隐蔽的一类错。轨迹测试里加"中序序列升序"的断言。
5. **删除双孩子用物理移植。** 复制值再删后继会让"被删节点的颜色 / 高亮"留在原位而
   值瞬移,红黑树尤其乱;物理移植才能看到"后继接替了它的位置和颜色"。
6. **镜头所有权。** 演示的跟随与用户的拖动必须有一方说了算:用户手势只打断**当前**
   动画,「跟随镜头」开关决定下一步是否重新接管;不要靠 `manual` 开关硬切。
7. **控制窗口遮画布。** 镜头可用区要扣掉贴底的演示窗口,否则当前节点会被窗口压住
   (`focusPoint` 除 topInset 外还要按窗口位置给底部 inset)。
8. **减少动态效果。** `prefers-reduced-motion` 下所有过渡瞬移、相机直接切;不要连
   自动前进也关掉 —— 单步仍然是可用的。
9. **后台标签页。** RAF 暂停后再回来,`performance.now()` 的差值可能极大;时钟 delta
   夹到 50ms,避免一帧跳完整个过渡。
10. **步骤爆炸。** 删除一章可能十几步;播放器要支持 0.5× 和跳章,自动 `hold` 不要
    低于 700ms,否则像快进。
11. **中间帧是"故意非法"的。** 红黑树 fixup 过程中检查会 FAIL,这是教学内容;诊断窗口
    不要因为检查 FAIL 就报错,检查窗口照常显示 PASS/FAIL 即可。
12. **空树 / 单节点 / 删到空。** 轨迹要覆盖这些边界,相机 `fit` 在内容为空时已有兜底
    (恒等视角),播放器不要假设每步都有 `focus`。
13. **旋转必须锚定,不然整棵树都在滑。** 布局按包围盒归零,一次旋转会改变分量宽度;
    不把新子树根 y 锚到旧子树根 x 的位置,插值出来的画面是"所有人都在动",旋转轴反而
    看不见。锚定后再插值,再让 x / y 绕旧边中点走弧。
14. **旋转的中间态不能进 `document`。** 三次指针改写是一帧内的原子操作;拆成"β 已换父、
    y 还没上位"之类的中途帧不是合法 BST,检查会炸、布局也会乱。分解只发生在叙述、
    连线动画和节奏上。
15. **旋转那一步相机别动。** 一边转一边推镜头,观众既看不清谁绕谁转,也看不出高度
    变化;旋转 / 双旋统一 `framing: 'hold'`,转完再走下一步镜头。

---

## 14. 拍板结果(原问题与结论)

| 问题 | 结论 |
| --- | --- |
| 演示入口放任务栏「演示」动作 + 演示控制窗口、进入时最小化部分窗口? | **采用(后调整)**。按钮在任务栏动作区(与「回正视图」并排),剧本菜单挂在任务栏按钮下;JSON 标题栏只留示例 / RUN |
| RBT 删除是否这一轮做? | **做了**。物理移植后继 + 双黑四情形,剧本的删除序 `26,22,18,13,11` 覆盖四情形 |
| JSON 编辑器要不要跟随 / 提供「写回」? | 不跟随(演示不改 JSON);「把当前帧写回 JSON」**本轮未做**,留到 M5 |
| 自由操作沙盒? | 本轮不做,留到 M5。`TreeOp` 词表与 `framesFor` 形状已经为它留好 |

---

## 15. 已经落地的准备:Python 侧的 BST 示例

演示需要"起手就有一棵 BST"。Python demo 已经补上(早于 web 动画落地):

| 位置 | 内容 |
| --- | --- |
| `python/examples/bst.py` | `BstNode(key, left, right)` + `bst_registry` + `sample_tree()` |
| `python/demo.py` | 第 3 段输出 BST 的中性 JSON;`--out` 写出 `bst.json` |
| `python/tests/test_examples.py` | 7 节点 / 6 指针 / 无 attrs;JSON 与 web 内置示例逐字段对照 |

写出的 `bst.json` 与 web「示例」菜单里的「二叉搜索树」同形(8 / 4 / 12 / 2 / 6 / 10 / 14),
可以直接粘进 JSON 窗口;它只是**静态结构**,不含轨迹、不含坐标、不含检查结论。

为什么轨迹生成暂时放在 web 侧而不是 Python:

- 每帧都要跑 `layoutScene` 与 `runSceneChecks`,这两件事已经只在 web 侧有一份实现;
- 轨迹的 `focus / marks / anchor` 是视觉词汇,和布局 / 检查同属 web 的展示层;
- Python 侧继续只负责"结构长什么样",保持"两半不是前后端"的分工不变。

如果以后希望 Python 也能产出轨迹,格式已经定成可序列化的 `SceneTrace`(§4),不需要
改 web 的读取端。

---

## 16. 现状接缝:哪些直接复用,哪些改了

实现时**实际**接到哪一块、改了什么。依赖方向不变:`ui -> datastruct`、`ui -> visual`。

| 现有 | 位置 | 动画怎么用 | 改动 |
| --- | --- | --- | --- |
| 文档解析 / 类型 | `src/scene/scene_document_parse.ts`、`scene_document.ts` | 每帧 `document` 都按它校验与持有 | 不改 |
| 自动布局 | `src/visual/layout.ts` 的 `layoutScene` | 每帧从连接关系算坐标;连线端点公式抽成 `linkEndpoints()` 供逐帧复用 | 小改(抽纯函数,行为不变) |
| 渲染 | `src/visual/render.ts` 的 `renderScene` / `clearScene` | 静态 RUN 路径保留;动画新增 `ScenePainter` 增量落笔 | 新增,不改旧行为 |
| 视觉场景模型 | `src/visual/scene.ts` 的 `VisualScene` / `VisualNode` / `VisualLink` | 静态路径不变;动画路径用 `visual/motion.ts` 的 `MotionScene`(带节点 key / 连线 id) | **不改** `scene.ts`,另开动画场景模型 |
| 平面视口 | `src/visual/viewport.ts` 的 `mountPlaneViewport`、`fitPlaneView`、`focusPoint`、`manual` | 提 `focusPlaneView` / `framePlaneView` / `interpolatePlaneView` / `viewAnimationDurationMs`;句柄新增 `animateTo` / `cancelAnimation` / `getView` / `setInsets`;`insets` 加 bottom | 中等(`focusPoint` 保留旧的立即到位语义,加 `{animated:true}` 才走缓动) |
| 性质检查 | `src/scene/scene_check.ts` 的 `runSceneChecks` | 每步跑一次,检查窗口实时 PASS / FAIL | 不改 |
| 实体 / 检查列表 | `src/ui/viewer/viewer_items.ts` 的 `EntityItem` / `CheckItem`,库的 `RowList` | 每步 `sync`;行末「定位」改走平滑镜头(演示中按**锚定后的布局**定位) | 小改(定位回调) |
| 桌面窗口 | `mountDesktop(...).windows`(`WindowManager`) | 进演示用 `setMinimized` / `getState`,退出恢复;「全部还原」保留 | 不改库(API 已有) |
| 菜单 | 库的 `createMenu` | 任务栏「演示」按钮的剧本菜单:把库建的按钮包进 `.menu-anchor`,面板挂在同一锚点 | 改库:`.menu-anchor` 变零盒子(`display:contents`),浮层落点收进 `Popover` |
| 代码编辑器 | 库的 `createCodeEditor` | 演示不写 JSON 编辑器;进入时把剧本的检查 id 写进「检查配置」编辑器 | 接线(不改库) |
| 库的动画能力 | `miko_ui` | **没有 tween / 动画助手**;rAF 只在 `EditorHighlight` / `MenuItem` 里用于合并重绘 | 新增 `src/visual/tween.ts` |
| 样式 | `src/visual/visual.css`、`tokens.css` | 新增状态类、染色 transition、reduced-motion;保留现有 220ms 入场动画 | 小改 |
| 取景常数 | `src/visual/config.ts` | 复用 `VISUAL_FOCUS_MIN_ZOOM`(0.8)/ `VISUAL_FIT_MAX_ZOOM`(1)/ `VISUAL_MIN_ZOOM` / `VISUAL_MAX_ZOOM` | 不改 |
| 测试环境 | `happy-dom` | `getBBox()` 恒空;rAF 由测试 fake timer / 注入时钟驱动 | 播放器注入 `ManualClock`;视口镜头动画注入时钟;量不到就不动镜头 |
| 值口径 | `src/scene/label_value.ts` | BST / RBT 剧本的 `label` 必须是十进制数,检查器按它读数 | 遵守 |

菜单那一格是**本轮唯一的库改动**:`.menu-anchor` 一律不许影响触发按钮的布局 —— 它生成盒子
就是父容器(`line box` / flex item)里的一员,高度、基线、父级 `align-items` 都会先分给它,
按钮的矩形就可能与"没有这层 div"不同(默认 `block` 按继承的 `line-height` 撑行盒:锚点
24.39px、按钮 22.39px,按钮比同排按钮低 1px)。所以库把它改成 `display: contents`:锚点
不生成盒子,按钮就是 `.dock-actions` 的直接布局参与者,包不包这层 div 量出来的矩形一致。
没有盒子就当不了绝对定位的包含块,于是浮层落点从 CSS 移进 `Popover`:打开时量触发件,写
`left/top/min-width`,视口边上翻转 / 夹取(`overlayPlacement.ts`);动画、示例、任务栏的
接线代码一个字没改。部署仍吃 npm 的 `miko_ui@0.1.18`(锚点还是 block):任务栏菜单按钮会
退回"比同排低 1px"(浮层仍能开合),`viewer.css` 里 `0.1.18 过渡`那条 `.menu-popover`
规则要在库发版 + 升依赖后删掉。

两条已有的硬约束(实现时最容易踩,已写进 §5 / §13):

- `renderScene` 是**整批重建**,动画必须有稳定元素身份;
- 入场动画挂在**形状 / 文字**上而不是节点组上,因为组的 `transform` 属性就是位置。

---

## 17. 交接:这次会话产出了什么

### 17.1 文件

| 文件 | 状态 | 内容 |
| --- | --- | --- |
| `docs/animation.md` | 修改 | 状态改为"已实现";补 `cut` 字段、实现现状、拍板结果、实际文件与测试 |
| `README.md` | 修改 | 动画不再是"尚未实现";结构表补新文件;历史追加本轮 |
| `src/datastruct/trace/trace.ts` | 新增 | 轨迹契约 + `TraceBuilder` + `TreeOp` |
| `src/datastruct/bst/bst.ts` | 新增 | `TreeModel` + BST 操作 / 旋转,产出 `TraceFrame` |
| `src/datastruct/rbt/rbt_ops.ts` | 新增 | RBT 插入 / 删除 / 五条性质讲解帧 |
| `src/visual/tween.ts` | 新增 | 可注入时钟 + 缓动 + `tween()` |
| `src/visual/anchor.ts` | 新增 | 帧间锚定(显式 + 自动兜底) |
| `src/visual/motion.ts` | 新增 | 两帧场景插值(直线 / 极坐标 / 子树平移;连线端点重算) |
| `src/visual/elements.ts` | 新增 | 图元构造 / 就地写入 / 包围盒测量(静态路径也改用它) |
| `src/visual/painter.ts` | 新增 | `ScenePainter` 增量落笔 + 两个图层 |
| `src/visual/layout.ts` | 修改 | 抽出 `linkEndpoints()` / `assignLinkLanes()`,行为不变 |
| `src/visual/viewport.ts` | 修改 | 取景纯函数 + 镜头缓动 / 打断 / 上下 insets |
| `src/visual/render.ts` | 修改 | 等价重构为调用 `elements.ts`,静态行为与 DOM 结构不变 |
| `src/visual/visual.css` / `tokens.css` | 修改 | 状态类、染色过渡、reduced-motion |
| `src/ui/viewer/demo_scenarios.ts` | 新增 | 7 个剧本(3 BST + 4 RBT) |
| `src/ui/viewer/demo_player.ts` | 新增 | 播放器状态机 + 虚拟时钟 + 镜头请求 |
| `src/ui/viewer/demo_views.ts` | 新增 | 控制条 / 章节进度 / 键盘 |
| `src/ui/viewer/demo_window.ts` | 新增 | 库窗口外壳 + 标题栏拖动 + 横向缩放(纵向固定) |
| `src/ui/viewer/viewer.ts` | 修改 | 演示模式进出、窗口状态恢复、RUN 冲突 |
| `src/ui/viewer/viewer_chrome.ts` / `config.ts` | 修改 | 任务栏「演示」动作 / 剧本菜单面板 / DOM 契约 |
| `src/ui/viewer/viewer.css` / `tokens.css` | 修改 | 控制窗口正文样式 |
| `src/test_support/manual_clock.ts` | 新增 | 测试用手动时钟 |
| 测试 | 新增 / 扩展 | `tween` / `anchor` / `motion` / `painter` / `demo_player` / `demo_mode` / `demo_scenarios` / `bst` / `bst_rotation` / `rbt_ops` / `trace`;`viewport` / `render` / `viewer` / `viewer_views` 扩展 |

### 17.2 已经核对过的事实

- **web**:`npm test` = 282 项通过;`npm run typecheck` 通过;`npm run build` 通过。
- **浏览器实测**(headful Chromium + Vite dev):进入「BST · 查找 / 插入 / 删除」控制窗口为 29 步、
  第 0 拍整棵树;单步后标题 / 计数 / 检查行同步;RBT 综合插入 57 步,情形 2 / 3 帧上
  检查窗口当场 FAIL / PASS;退出演示恢复 6 窗口与 5 节点静态红黑树;RUN 先退出演示。
- **教学路径**:RBT 综合序列 `7,3,18,10,22,8,11,26,2,6,13` 情形 1/2/3 全出现;删除序
  `26,22,18,13,11` 双黑四情形全出现;升序 `1..7` BST 层数 7、RBT 层数 4(黑高一致)。
- **确定性**:同一剧本两次生成轨迹逐字节相同;删除双孩子用物理移植(节点 key 不变)。
- **Python**:`python3 -m unittest discover -s tests -t .` 57 项通过;`bst.json` 与 web
  「二叉搜索树」示例同形(本轮未改 Python)。

### 17.3 验收方式

```bash
npm test           # 282 项:纯逻辑 / 纯数学 / happy-dom 行为
npm run typecheck  # tsc --noEmit(含 noUnusedLocals / noUnusedParameters)
npm run build      # clean -> test -> typecheck -> vite build
# 浏览器: npm run dev 后打开 http://localhost:5173/miko_datastruct/
#   任务栏「演示」-> 选剧本 -> 控制窗口(可拖)/ 空格 / ← → / Home End / Esc
```

### 17.4 会话删除后怎么继续

1. 读本文 §0(速览)-> §10(文件分工)-> §12(分期)-> §16(接缝)-> §19(实现现状);
2. `git status` 看工作区;`git log --oneline -5` 看上次提交;
3. `npm test` / `npm run typecheck` 自检;
4. 从 M5 开始:自由操作沙盒(`TreeOp` + `framesFor` 已就绪)、BST/RBT 对照、写回 JSON;
5. 改算法后先跑 `demo_scenarios.test.ts`:它会挡住"教学情形消失"这类退化。

---

## 18. 术语表

| 术语 | 含义 |
| --- | --- |
| **轨迹** `SceneTrace` | 一次演示的全部步骤(数组);可序列化成 JSON |
| **步骤** `TraceStep` | 一拍:完整 `document` + 叙述 + 高亮 / 镜头 / 锚定 / 形变提示 |
| **帧** | 步骤里的 `document`(一份完整中性 JSON);也是插值后的任意中间画面 |
| **拍** | 叙述上的最小教学单位,通常等于一个步骤;一个操作可以拆成多拍 |
| **剧本** | 初始结构 + `TreeOp[]` + 检查 id + 章节标题,如"BST · 旋转" |
| **锚定** | 每步先平移整帧布局,让 `anchor` 节点落在上一帧 `anchorAt` 的位置 |
| **分道** | 同一对节点之间多条连线时的横向偏移(现有 `layout.ts` 已实现) |
| **状态类** | `visual-state--active / path / visited / found / fresh / ghost`,动画高亮用,与结构色变体叠加 |
| **演示模式** | 最小化部分窗口 + 演示控制窗口 + 键盘控制的整屏观看状态;退出后恢复 |
| **剧本生成 / 播放器** | 生成 = 纯逻辑产出步骤;播放器 = 虚拟时钟 + 插值 + 镜头 + 列表同步 |

---

## 19. 实现现状(对照设计)

| 设计点 | 落地情况 |
| --- | --- |
| 轨迹 = 每步完整 document + 叙述 + 提示 | `trace.ts`;`TraceBuilder` 在 yield 时取快照;额外加了 `cut`(章节硬切) |
| 快照轨迹支持回退 / 拖进度条 / 暂停 / 变速 / 自动测试 | `demo_player.ts` + `ManualClock`;回退与 seek 是瞬移,不反向动画 |
| 三套时间分开 | 结构过渡 420ms(常量 `DEMO_TRANSITION_MS`)、镜头 280〜900ms(按距离 / 缩放)、叙述 `700 + 24×字数` 夹 700〜1800 |
| 稳定身份增量落笔 | `elements.ts` + `painter.ts`;节点按 key、连线按 `from->to#序号`;只有落定帧删除退场元素并量一次 `getBBox` |
| 高亮与结构色分离 | `visual-state--*` 状态类叠在 `visual-node--<variant>` 上,只改描边 / 透明度 / 虚线 |
| 连线跟着节点走 | 每帧用插值后的节点坐标 + 插值后的分道偏移,调 `linkEndpoints()` 重算端点 |
| 先锚定再插值 | `anchor.ts`;算法显式给 `anchor / anchorAt`(插入 / 删除 / 旋转),机械步骤自动锚到最小共同 key |
| 旋转绕轴、β 子树短弧 | `motion.ts` 极坐标插值;α / γ 直线跟随;旋转帧 `framing:'hold'` |
| 镜头中心 + 对数缩放、非线性缓动、打断 | `interpolatePlaneView` + `easeInOutCubic` + tween;拖动 / 滚轮立即 `cancelAnimation` |
| 演示模式:任务栏入口、控制窗口、窗口让位、退出恢复 | `viewer.ts` + `demo_window.ts` + `demo_views.ts`;检查窗口保留,控制窗口排在检查窗口左侧、高度固定 / 横向可拖,贴底时算进镜头 bottom inset |
| 检查窗口就是"不变量面板" | 每帧 `runSceneChecks`;fixup 中间态 FAIL 是教学内容,不报错 |
| reduced-motion | 结构与镜头瞬移,步骤仍可自动 / 手动前进 |
| 7 个剧本 | `demo_scenarios.ts`:BST 原理 / 旋转 / 退化;RBT 入门 / 生根 / 综合插入 / 删除 |
| **未做(M5)** | 自由操作沙盒、BST/RBT 对照演出、章节跳转按钮(进度条按章分组已可点)、「写回 JSON」 |
