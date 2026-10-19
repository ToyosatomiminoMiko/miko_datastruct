# miko_datastruct

数据结构工具.仓库按"一份中性的 **JSON 表示** + 一块**可拖动缩放的平面** + 一块**列表式的检查面板**"
组织:web 侧读 JSON 把结构画出来,并把节点属性与检查结论列成可展开的行;python 侧用普通
Python 类描述结构,生成同一份 JSON.两侧**不是前后端**:没有 HTTP、没有进程在跑,只有
一份共享的 JSON 契约.

```text
Python 对象 ── dataviz 遍历 ──> 中性场景 JSON (nodes / pointers / edges + checks)
                                        │ 文件 / 剪贴板
                                        ▼
                          web: JSON 查看器
                          解析 / 校验 -> 自动布局 -> SVG 落笔
                                     └─> 实体列表 + 检查列表
```

web 这一半现在只认 JSON:

- 输入是一份**中性场景 JSON**(一个结构 = 节点 + 有向指针 + 无向边 + 检查结论);
- 画布从连接关系自动推形状:只有指针且无环 -> 整齐树布局;有边 / 有环 -> 环形布局;
  多个连通分量并排;
- 右侧**实体**与**检查**两扇窗口按 graphcalc 的**实体列表 / 求值列表**样式渲染:每个节点
  一行属性,每条检查一行结论;FAIL 行可展开详情,并可「定位」到背景平面上的对应节点;
- 简写表达式(`13B(8R(...))`)与自定义 Term 表示已经**整套删除**:web 侧不再有表达式解析 /
  表达式高亮(JSON 编辑器自己的词法高亮保留),Python 侧也不再生成 Term;中性 JSON 是两侧
  唯一的契约.红黑树只作为默认示例 JSON 出现在首屏.

## 跑起来

```bash
npm install
npm run dev        # http://localhost:5173/miko_datastruct/(dev server 也认 vite.config.ts 的 base)
npm test           # vitest:纯逻辑(node)+ 标记契约 / 行为(happy-dom,进程内)
npm run typecheck  # tsc --noEmit
npm run build      # clean -> test -> typecheck -> vite build(产物在 dist/)
npm run preview     # 预览 dist/
```

改库(`miko_ui`)时不必发版:本地把解析目标换成工作副本,与 `miko_graphcalc` 同一套做法
(同一份脚本,见 `scripts/dev_ui_link.py` 的模块说明):

```bash
npm run ui:link    # node_modules/miko_ui -> ../miko_ui(可用 MIKO_UI_DIR 覆盖)
npm run ui:status  # 看现在解析到 npm 版还是本地副本
npm run ui:unlink  # 还原成 npm 版(按 lock 重装)
```

两条都只动被忽略的 `node_modules/`,不碰 `package.json` 与 `package-lock.json`,所以
CI / 部署(`npm ci`)行为不变.链接之后:库的 `styles/` **零构建立即生效**;库的 `src/` 要先
编译进 `dist/`(`cd ../miko_ui && npm run build:dist`,或在库里常驻
`npx tsc -p tsconfig.build.json --watch`).

`vite.config.ts` 的 `base` 是部署路径的**唯一开关**(现在写成 `/miko_datastruct/`,与仓库名
一致);换仓库名或换子路径只改那一处.

## 输入:中性场景 JSON

一份 JSON = 一个结构.`pointers` / `edges` / `checks` 可省略(默认空数组):

```json
{
  "nodes": [
    { "key": 0, "label": "10", "attrs": { "color": "black" } },
    { "key": 1, "label": "5",  "attrs": { "color": "red" } }
  ],
  "pointers": [{ "from": 0, "to": 1 }],
  "edges": [],
  "checks": [
    { "name": "根节点为黑色", "passed": true },
    {
      "name": "各路径黑色节点数量相同",
      "passed": false,
      "detail": "节点 10 两侧黑高不同",
      "details": ["较浅一侧 1", "较深一侧 2"],
      "node": 0
    }
  ]
}
```

| 字段 | 形状 | 说明 |
| --- | --- | --- |
| `nodes[].key` | 非负整数 | 文档内唯一;`pointers` / `edges` / `checks[].node` 都按它引用节点 |
| `nodes[].label` | 字符串 | 画在节点上、也是实体列表里的名字 |
| `nodes[].attrs` | 对象,值只能是字符串 / 数字 / 布尔 | 结构特有属性;实体列表逐条显示,`color` 还决定节点配色(见下) |
| `pointers[]` | `{ from, to }` | **有向**;树就是父 -> 子 |
| `edges[]` | `{ a, b, label?, attrs? }` | **无向**;图里的一条边 |
| `checks[]` | `{ name, passed, detail?, details?, node? }` | 检查结论;`node` 是「定位」的目标节点 |

- 未知字段被忽略:Python 侧以后加字段时,旧的 web 不会拒收整份文档;
- 解析器的错误带稳定错误码与路径(如 `pointers[0].to: 引用了不存在的节点 key: 9`),
  界面上显示成一行玫红文字;
- 节点配色约定:`attrs.color` 是 `red` / `black` 时,画布上的节点分别是红 / 黑;
  `attrs.variant` 可以显式给一个视觉变体名(如 `current`),优先级高于 `color`.
  其它颜色值原样进实体列表的"色块 + 明文值",没有对应样式时节点用基础填充色.

**和 Python 侧的对应**:`python/dataviz/scene.py` 输出 `nodes` / `pointers` / `edges`
(没有坐标),`checks` 由 `Diagram` 带着;`Diagram.dumps()` 把两者合并成**同一份 JSON**,
与上面的输入契约逐字段一致.`python3 demo.py --out <目录>` 写出的 `<name>.json` 可以直接
粘进 web(见 `python/README.md`).

## 界面:一个桌面,五扇窗口,一块平面

```text
#viewerViewport            桌面背景 —— 平面视口(铺满桌面、裁切、收指针手势)
└─ svg#viewerTree          1:1 绘制面(svg,没有 viewBox:一个用户单位 = 一个 CSS 像素)
   └─ g.visual-world       世界层:场景里的一切都在这里,视口只改这一层的 transform

窗口层(压在背景之上)
├─ 窗口 "JSON"           只有编辑器宿主 #viewerEditor
├─ 窗口 "实体"           实体列表 #viewerEntityList(每个节点一行)
├─ 窗口 "检查"           检查列表 #viewerCheckList(每条结论一行)
├─ 窗口 "诊断"           库的消息区 #viewerDiagnosticsPanel(解析错误 / 空输入提示)
└─ 窗口 "帮助"           JSON 字段说明 + 画布手势 + 回正 / 定位的用法

任务栏(库的 .dock)
├─ 窗口按钮组           JSON / 实体 / 检查 / 诊断 / 帮助
└─ 桌面动作区           回正视图 + 全部还原(库的)
```

- **树是背景,窗口是操作**:结构图铺在桌面上,JSON 窗口在左上、诊断 / 帮助依次在它下方,
  实体在右上、检查在右下;窗口没盖住的地方就是平面本身;
- 实体 / 检查 / 诊断各成一扇:几件事的列表长度互不相干,各自滚动 / 各自最小化,一栏不会
  被另一栏挤掉;JSON 窗口因此只有编辑器,解析错误与空输入提示走诊断窗口的库消息区;
- 平面**没有坐标系**(不画网格 / 轴 / 刻度):左键拖动平移、滚轮以指针为锚缩放;
- 「回正视图」是桌面级动作(窗口最小化了背景仍然在),所以进库的任务栏,与「全部还原」
  并排;用户没手动挪过视角之前,每次重绘都会自动适应,挪过之后重绘不再动视角;
- 「定位」是行级动作:实体行末的按钮把这个节点移到视口中心;FAIL 检查行末的按钮移到
  `checks[].node` 指向的节点.定位按当前缩放与"至少 0.8"的较大者执行(整幅图很大时
  自动适应会把视角压得很小),之后进入手动模式,要回自动适应就点「回正视图」.

列表行沿用 graphcalc 的对象行骨架(库的 `RowList` + `createObjectRow` + `ui-badge`):

- **实体行**:`label` + `attrs`(颜色画成"色块 + 明文值",其余是 `key: value` 小徽章),
  行末「定位」;窗口顶部一行 `共 N 个节点`;
- **检查行**:PASS / FAIL 徽章 + 检查名 + 一行 `detail`;有 `details` 时收进 `<details>`
  (默认收起,行重建时展开态保留),FAIL 且有 `node` 时行末「定位」;窗口顶部一行
  `n 条中 m 条 FAIL`.

## 分层:datastruct / visual / ui

依赖方向只有两条:**ui -> datastruct** 与 **ui -> visual**;`datastruct` 与 `visual` 互不
认识.

- **`src/datastruct/scene/`**:中性场景文档的**类型与解析 / 校验**.纯逻辑,不碰 DOM;
  输入来自人(或 Python),所以所有结构性问题(JSON 语法 / 字段形状 / 悬空引用)都收在
  这里,错误带稳定错误码与路径.
- **`src/visual/`**:所有结构共用的视觉层——
  - `scene.ts` 场景模型(节点 / 指针;内存块等有结构用到再补);
  - `render.ts` 场景 -> SVG,并用 `getBBox()` 量内容实际占多大;
  - `surface.ts` 视口 -> 绘制面 -> 世界层三层标记;
  - `viewport.ts` 拖动 / 缩放 / 适应 / 定位的变换数学与手势;
  - `layout.ts` **中性场景自动布局**:从连接关系推形状(树 / 环形 / 多分量并排);
  - `config.ts` / `tokens.css` / `visual.css` 类名契约、取景参数与图元通用观感.
- **`src/ui/viewer/`**:界面层——
  - `config.ts` 窗口清单 / DOM 契约 / 默认 JSON / 帮助文案 / 类名与令牌名;
  - `viewer_views.ts` 桌面背景与五扇窗口正文的标记(纯函数);其中诊断窗口正文就是库的 `createMessageArea` 容器;
  - `viewer_items.ts` 实体行 / 检查行(RowList 的两种行对象);
  - `viewer_format.ts` 解析错误文案 / 检查抬头 / `attrs` -> 视觉变体;
  - `viewer_highlight.ts` JSON 分词 -> 高亮 HTML;
  - `viewer.ts` 挂载:装配桌面 + 视口 + 每轮"解析 -> 布局 -> 画布 -> 列表"的全流程.

**为什么自动布局在视觉层**:它只吃"节点 / 指针 / 边"这三种中性连接,不认识红黑树 / 图 /
链表;换成任何一种结构,同一套规则都能画.真正与结构语义有关的只有 `attrs -> 视觉变体`
那一步,留在 `ui/viewer/viewer_format.ts`.

**为什么视觉层要单独一层**:节点 / 指针怎么画、绘制面怎么缩放,是每一种结构都要用、却与
"数据是什么"无关的知识.提成 `visual/` 之后,加结构的人只需要写 JSON,画法不必再写一遍.

## 自动布局:从连接推形状

- **树形**(只有 `pointers`、每个节点入度 <= 1、无环):整齐树布局(轮廓合并).自底向上
  算每棵子树的左右轮廓,相邻兄弟按"每一层都不撞"的最小错开量排开,父节点放在首尾孩子
  正中;层距与同层最小中心距在 `src/visual/config.ts`(`VISUAL_LAYOUT_TREE_*`);
- **环形**(有 `edges` / 有环 / 一个节点多条入边):每个连通分量的节点按输入顺序排在一个
  圆上,圆周长随节点数增长,边是圆内的弦;
- **多分量**:每个连通分量各自布局,再从左到右并排(统一上沿对齐,分量间留固定间隙);
- 同一输入永远给同一结果(节点顺序 / 分量顺序都按输入),测试可以逐字断言坐标关系.

布局不知道节点半径:同层间距的约束写在视觉层令牌旁边("`VISUAL_LAYOUT_TREE_MIN_GAP`
必须大于 `--visual-node-radius` 的 2 倍"),内容实际占多大由渲染后 `getBBox()` 量.

## 视觉层:节点 / 指针

| 图元 | 表示 | 状态 |
| --- | --- | --- |
| **节点 node** | 圆 + 居中的值文字;语义差异用 `visual-node--<variant>` 变体类表达 | 已实现 |
| **指针 pointer** | 两点之间的直线段(`visual-pointer`),当前画法无箭头 | 已实现 |
| **内存块 block** | 一段连续的存储格(下标 + 值),用于数组 / 栈 / 队列 / 哈希桶数组 | **未实现**:现在没有数组类结构,类型与渲染分支都不预埋 |

刻意不做的预留(等第一种真的需要它的结构出现时再加,不提前猜字段):

- 节点形状目前只有圆.方框 / 圆角矩形等形状不预留 `shape` 字段;
- 有向箭头 / 无向边的方向区分 / 端点 / 绕线:链式结构要画箭头时再给 `VisualPointer`
  一次按真需求定完端点与朝向.当前 `edges` 与 `pointers` 在画布上都是无箭头线段;
- 内存块同理:等第一种数组类结构出现时再补 `VisualBlock` 与渲染分支.

坐标口径:场景里所有坐标都是**世界坐标**(平面坐标,单位 = 屏幕像素 @ 缩放 1),与视口 /
桌面多大无关;世界坐标 -> 屏幕像素只发生在世界层的 `transform` 上.内容实际占多大由渲染层
落笔后向浏览器要 `getBBox()`,布局与视觉层都不知道节点半径.

## 结构

```text
index.html              页面上只有一颗手写宿主 #app
src/main.ts             入口:引库样式 + 应用样式,再 mountViewer(#app)
css/app.css             应用层:页面基线 + 从主站继承的令牌(--font-code / 桌面底色)

src/datastruct/scene/   中性场景文档:类型 + 解析 / 校验(纯逻辑)

src/visual/             视觉层:所有结构共用(场景模型 / 落笔 / 绘制面 / 视口 / 自动布局)
src/visual/scene.ts        场景模型:节点 / 指针的正式表示
src/visual/render.ts       场景 -> SVG:整批重建世界层,并用 getBBox 量内容实际占多大
src/visual/surface.ts      平面绘制面标记:视口 div -> 绘制面 svg -> 世界层 g
src/visual/viewport.ts     平面视口:变换数学 + 拖动 / 滚轮手势 + 回正 + 定位
src/visual/layout.ts       中性场景自动布局:树形(轮廓合并)/ 环形 / 多分量并排
src/visual/config.ts       视觉层的类名契约、取景参数与布局参数
src/visual/tokens.css      视觉层令牌(--visual-*:节点半径 / 值文字 / 指针 / 进入动画)
src/visual/visual.css      视觉层观感(视口裁切与手势 / 绘制面 / 节点 / 指针 / 动画)

src/ui/viewer/          界面:JSON 编辑 + 实体 / 检查列表 + 帮助
src/ui/viewer/config.ts         窗口清单 / DOM 契约 / 默认 JSON / 帮助文案 / 类名与令牌名
src/ui/viewer/viewer.ts         挂载:装配桌面 + 视口 + 每轮解析 / 布局 / 落笔 / 列表
src/ui/viewer/viewer_views.ts   桌面背景与五扇窗口正文(纯函数;诊断窗口用库的 createMessageArea)
src/ui/viewer/viewer_items.ts   实体行 / 检查行(RowList 的两种行对象)
src/ui/viewer/viewer_format.ts  解析错误 / 检查抬头 / attrs -> 视觉变体
src/ui/viewer/viewer_highlight.ts JSON 分词 -> 高亮 HTML(纯函数)
src/ui/viewer/tokens.css        查看器令牌(--viewer-*:列表 / 状态色 / 词法 / 示例节点色)
src/ui/viewer/viewer.css        查看器观感(窗口正文 / 列表行 / 检查详情 / JSON 词法)

src/test_support/       标记契约测试的两个小助手(renderHost / expectNoDuplicateIds)
scripts/dev_ui_link.py  本地联调:miko_ui 换成指向工作副本的软链(link / unlink / status)

python/                 中性 JSON 生成(纯标准库;与 web 不是前后端关系,见 python/README.md)
```

跨目录导入一律用源码根别名 `@/`(`@/datastruct/scene/scene_document_parse`,
`@/ui/viewer/config`,`@/test_support/desktop_test_helpers`);别名一处定义两处生效:
`tsconfig.json` 的 `paths` 与 `vite.config.ts` 的 `resolve.alias`.

## 依赖

- **`miko_ui`**:桌面窗口系统(`mountDesktop` + `DesktopConfig` / `WindowConfigEntry` /
  `DockActionSpec`:背景层 / 窗口外壳 / 任务栏 / 几何锚点)、行引擎(`RowList`)、行外壳与
  徽章(`createObjectRow` / `createRowActions` / `createButton` / `createBadge`)、DOM 原语
  (`create_element` / `childNodes`)、代码编辑器(`createCodeEditor`:行号槽 + 词法高亮层,
  分词与配色由本项目注入)、主题与字体.
- `css/app.css` 里的 `--font-code` 是主站**站点层**的一条令牌,本项目没有那一层,所以在这里
  补一份等价定义.它服务列表行与树上的节点值;编辑器那一格由库的 `--code-font-family` 自己给.

## 测试

```bash
npm test        # vitest
```

- 纯逻辑(node 环境):中性文档解析器 / 自动布局 / JSON 高亮 / 文案映射;
- 标记契约与行为(happy-dom):桌面装配、窗口清单、编辑器、实体 / 检查两个列表窗口、
  诊断消息区、定位 / 回正接线.

## 历史

这个目录最早是主站里的一颗红黑树工具:输入简写表达式 -> 解析 -> 四项性质检查 -> 布局 ->
SVG.之后依次做过:编辑器换成库的 `CodeEditor`、面板换成桌面窗口、背景换成可拖动缩放的
平面、把"画法"提成视觉层.2026-10 的这次改动把输入换成**中性 JSON**,并:

- 新增通用自动布局(树 / 图),web 不再只画红黑树;
- 原来的"性质检查"窗口拆成 graphcalc 风格的**实体** / **检查**两扇窗口,支持折叠详情与
  节点定位;
- 解析错误 / 空输入提示改用库的**消息区**(诊断窗口),JSON 窗口只剩下编辑器;
- 原来的三行提示挪进独立的"帮助"窗口;
- 之后删掉了旧的表达式解析 / 性质检查核心与 Python 侧的 Term 写端:两侧只剩 JSON 一种
  表示,Python 的 `Diagram.dumps()` 直接产出 web 读的同一份文档.
