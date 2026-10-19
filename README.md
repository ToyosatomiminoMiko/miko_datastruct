# miko_datastruct

数据结构工具.仓库按"一份中性的 **JSON 表示** + 一块**可拖动缩放的平面** + 一块**列表式的检查面板**"
组织:web 侧读 JSON 把结构画出来,并按「检查配置」里选的函数名运行性质检查;python 侧
用普通 Python 类描述结构,生成同一份 JSON.两侧**不是前后端**:没有 HTTP、没有进程在跑,
只有一份共享的 JSON 契约.

```text
Python 对象 ── dataviz 遍历 ──> 中性场景 JSON (nodes / pointers / edges)
                                        │ 文件 / 剪贴板
                                        ▼
                          web: JSON 查看器
                          点 RUN(或选中示例) -> 解析 / 校验 -> 检查配置 -> 性质检查
                                              -> 自动布局 -> SVG 落笔
                                     └─> 实体列表 + 检查列表
```

web 这一半现在只认 JSON,并且**输入与运行是分开的**:

- 输入是一份**中性场景 JSON**(一个结构 = 节点 + 有向指针 + 无向边);
- 编辑 JSON **不会自动重绘**:点 JSON 窗口标题栏的 **RUN**,或在编辑器里按
  `Ctrl/Cmd+Enter` 才解析 / 布局 / 落笔(与 graphcalc 的「源码 / RUN」同一条口径);
- **检查结论和结构名都不在 JSON 里**:JSON 只描述结构内容;要跑哪些性质检查由「检查配置」
  窗口决定(一段 JSON 数组,元素是检查函数名),载入后现算;
- 标题栏的**示例**菜单内置多种结构(红黑树 / 二叉搜索树 / 最小堆 / 单链表 / 柯尼斯堡七桥),
  选中一份会同时换掉 JSON 与检查配置并运行;
- 画布从连接关系自动推形状:只有指针且无环 -> 整齐树布局;有边 / 有环 -> 环形布局;
  多个连通分量并排;
- 有向指针画成带箭头的线段,无向边是普通线段;同一对节点之间的多条线(平行边 / 反向指针)
  横向分道,不会叠成一条;
- 右侧**实体**与**检查**两扇窗口按 graphcalc 的**实体列表 / 求值列表**样式渲染:每个节点
  一行属性,每条检查一行结论;FAIL 行可展开详情,并可「定位」到背景平面上的对应节点;
- 简写表达式(`13B(8R(...))`)与自定义 Term 表示已经**整套删除**:web 侧不再有表达式解析 /
  表达式高亮(JSON 编辑器自己的词法高亮保留),Python 侧也不再生成 Term;中性 JSON 是两侧
  唯一的契约.红黑树是默认示例,默认的检查配置预置了 rbt 的五个检查函数名.

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

一份 JSON = 一个结构.`pointers` / `edges` 可省略(默认空数组):

```json
{
  "nodes": [
    { "key": 0, "label": "10", "attrs": { "color": "black" } },
    { "key": 1, "label": "5",  "attrs": { "color": "red" } }
  ],
  "pointers": [{ "from": 0, "to": 1 }],
  "edges": []
}
```

| 字段 | 形状 | 说明 |
| --- | --- | --- |
| `nodes[].key` | 非负整数 | 文档内唯一;`pointers` / `edges` 都按它引用节点 |
| `nodes[].label` | 字符串 | 画在节点上、也是实体列表里的名字 |
| `nodes[].attrs` | 对象,值只能是字符串 / 数字 / 布尔 | 结构特有属性;实体列表逐条显示,`color` 还决定节点配色(见下) |
| `pointers[]` | `{ from, to }` | **有向**;树就是父 -> 子 |
| `edges[]` | `{ a, b, label?, attrs? }` | **无向**;图里的一条边 |

- **JSON 里没有检查结论,也没有结构名**:像"根是黑色"这种结论由 web 侧注册的检查器算,
  不写在数据里;要跑哪些检查由「检查配置」窗口单独给;
- **编辑不等于运行**:改完 JSON 点窗口标题栏的 RUN(或 `Ctrl/Cmd+Enter`)才重新解析 / 布局;
  检查配置窗口仍即时生效,它只对最后一次 RUN 的结构重算检查;
- 未知字段被忽略:Python 侧以后加字段时,旧的 web 不会拒收整份文档;
- 解析器的错误带稳定错误码与路径(如 `pointers[0].to: 引用了不存在的节点 key: 9`),
  界面上显示成一行玫红文字;
- 节点配色约定:`attrs.color` 是 `red` / `black` 时,画布上的节点分别是红 / 黑;
  `attrs.variant` 可以显式给一个视觉变体名(如 `current`),优先级高于 `color`.
  其它颜色值原样进实体列表的"色块 + 明文值",没有对应样式时节点用基础填充色.

**和 Python 侧的对应**:`python/dataviz/scene.py` 输出 `nodes` / `pointers` / `edges`
(没有坐标),`python/dataviz/diagram.py` 的 `Diagram.dumps()` 就是 web 读的同一份 JSON.
`python3 demo.py --out <目录>` 写出的 `<name>.json` 可以直接粘进 web(见 `python/README.md`).

## 性质检查:由「检查配置」窗口选择

JSON 只写数据结构内容;性质检查属于"这种结构该满足什么"的知识,留在 web 侧:

| 文件 | 作用 |
| --- | --- |
| `src/scene/scene_check.ts` | 注册表:检查 id -> 运行函数;`runSceneChecks` 按 id 列表运行 |
| `src/datastruct/checks.ts` | 内置注册入口:模块加载时把 rbt / graph / heap / list 的检查登记进去 |
| `src/datastruct/rbt/rbt_checks.ts` | `rbt`:颜色合法 / 根黑 / 红孩子 / 黑高 / 搜索树有序(id 就是函数名) |
| `src/datastruct/graph/graph_checks.ts` | `graph`:欧拉回路存在性(`checkEulerCircuit`) |
| `src/datastruct/heap/heap_checks.ts` | `heap`:最小堆序(`checkHeapOrder`) |
| `src/datastruct/list/list_checks.ts` | `list`:单链表结构合法 / 值严格递增(`checkLinkedList` / `checkListSorted`) |
| `src/scene/label_value.ts` | label -> 数值的共用口径(rbt / heap / list 都用它) |
| `src/ui/viewer/check_config.ts` | 「检查配置」编辑器内容(JSON 数组)的解析 |
| `docs/checks.md` | **检查实现速查**:每个显示名 / id 对应哪个函数、判据是什么 |

- **「检查配置」窗口和 JSON 窗口一样是 CodeEditor**,内容是一段 JSON 数组,元素是检查
  函数名;默认示例预置了 rbt 的五个:`checkColors` / `checkRootBlack` /
  `checkRedChildrenBlack` / `checkBlackHeight` / `checkBstOrder`;
- 每个内置示例自带配套的检查函数名(见 `src/ui/viewer/examples.ts`),载入示例时一起换;
- 编辑器内容一变,检查窗口立刻按最后一次 RUN 的结构重算;清空成 `[]` 就是"这次不跑检查";
- 配置里写了没注册的函数名:已有检查照跑,诊断窗口警告"未找到的检查函数";
- 配置 JSON 语法错 / 顶层不是数组:诊断窗口报"检查配置: ...",图照画,这次不跑检查;
- 可用函数名在**帮助**窗口里列全;新增检查时写 `xxx_checks.ts` 导出
  `SceneCheckDefinition[]`(`{ id, run }`),在 `src/datastruct/checks.ts` 里
  `registerSceneChecks` 一行,再到帮助文案 / `docs/checks.md` 里补名字.

为什么这样分:同一份 JSON 用不同版本的工具打开,检查结论应当由**工具**给出,而不是由
生成数据的一方手写;检查是显式配置,不从数据里猜结构名,所以换 JSON 时检查不会被悄悄换掉.

每个检查窗口显示名对应的 id、实现函数与判据,见 [`docs/checks.md`](docs/checks.md).

## 界面:一个桌面,六扇窗口,一块平面

```text
#viewerViewport            桌面背景 —— 平面视口(铺满桌面、裁切、收指针手势)
└─ svg#viewerTree          1:1 绘制面(svg,没有 viewBox:一个用户单位 = 一个 CSS 像素)
   └─ g.visual-world       世界层:场景里的一切都在这里,视口只改这一层的 transform

窗口层(压在背景之上)
├─ 窗口 "JSON"           标题栏 示例 / RUN + 编辑器宿主 #viewerEditor
├─ 窗口 "实体"           实体列表 #viewerEntityList(每个节点一行)
├─ 窗口 "检查配置"       检查函数名 JSON 数组编辑器 #viewerCheckSetupEditor
├─ 窗口 "检查"           检查列表 #viewerCheckList(每条结论一行)
├─ 窗口 "诊断"           库的消息区 #viewerDiagnosticsPanel(解析错误 / 空输入 / 检查配置错误)
└─ 窗口 "帮助"           运行方式 + 内置示例 + 检查函数名 + 画布手势

任务栏(库的 .dock)
├─ 窗口按钮组           JSON / 实体 / 检查配置 / 检查 / 诊断 / 帮助
└─ 桌面动作区           回正视图 + 全部还原(库的)
```

- **树是背景,窗口是操作**:结构图铺在桌面上,JSON 窗口在左上、诊断 / 帮助依次在它下方,
  实体在右上、检查配置与检查在右下;窗口没盖住的地方就是平面本身;
- JSON 窗口的标题栏是**示例菜单 + RUN**:示例按钮开一份按结构分组的内置清单,选中即换
  JSON / 检查配置并运行;RUN 才解析编辑器里的内容(与 graphcalc 的标题栏动作同形);
- 实体 / 检查配置 / 检查 / 诊断各成一扇:几件事的列表长度互不相干,各自滚动 / 各自最小化,
  一栏不会被另一栏挤掉;JSON 窗口与检查配置窗口都只有编辑器,提示 / 错误走诊断或帮助窗口;
- 「检查配置」是显式的检查函数名数组,不进 JSON:手写 / 粘贴 JSON 不会清掉你写的配置,
  只有「示例」菜单会整组替换它;说明与可用函数名都收在**帮助**窗口,不在检查配置窗口里重复;
- 平面**没有坐标系**(不画网格 / 轴 / 刻度):左键拖动平移、滚轮以指针为锚缩放;
- 「回正视图」是桌面级动作(窗口最小化了背景仍然在),所以进库的任务栏,与「全部还原」
  并排;用户没手动挪过视角之前,每次重绘都会自动适应,挪过之后重绘不再动视角;
- 「定位」是行级动作:实体行末的按钮把这个节点移到视口中心;FAIL 检查行末的按钮移到
  检查结论里的 `node` 指向的节点.定位按当前缩放与"至少 0.8"的较大者执行(整幅图很大时
  自动适应会把视角压得很小),之后进入手动模式,要回自动适应就点「回正视图」.

列表行沿用 graphcalc 的对象行骨架(库的 `RowList` + `createObjectRow` + `ui-badge`):

- **实体行**:`label` + `attrs`(颜色画成"色块 + 明文值",其余是 `key: value` 小徽章),
  行末「定位」;窗口顶部一行 `共 N 个节点`;
- **检查行**:PASS / FAIL 徽章 + 检查名 + 一行 `detail`;有 `details` 时收进 `<details>`
  (默认收起,行重建时展开态保留),FAIL 且有 `node` 时行末「定位」;窗口顶部一行
  `n 条中 m 条 FAIL`.检查名与文案来自注册的检查器,不读 JSON.

## 分层:datastruct / visual / ui

依赖方向只有两条:**ui -> datastruct** 与 **ui -> visual**;`datastruct` 与 `visual` 互不
认识.

- **`src/datastruct/`**:纯逻辑,不碰 DOM.
  - `scene/` 中性场景文档的**类型与解析 / 校验**:输入来自人(或 Python),所以所有
    结构性问题(JSON 语法 / 字段形状 / 悬空引用)都收在这里,错误带稳定错误码与路径;
  - `scene/scene_check.ts` 性质检查的**注册表**:检查 id -> 运行函数,按配置列表运行;
  - `rbt/` / `graph/` / `heap/` / `list/` 各种结构各自的检查函数;`checks.ts` 是内置
    检查集的注册入口(与 Python 侧示例同名).
- **`src/visual/`**:所有结构共用的视觉层——
  - `scene.ts` 场景模型(节点 / 连线;内存块等有结构用到再补);
  - `render.ts` 场景 -> SVG,并用 `getBBox()` 量内容实际占多大;
  - `surface.ts` 视口 -> 绘制面 -> 世界层三层标记;
  - `viewport.ts` 拖动 / 缩放 / 适应 / 定位的变换数学与手势;
  - `layout.ts` **中性场景自动布局**:从连接关系推形状(树 / 环形 / 多分量并排);
  - `config.ts` / `tokens.css` / `visual.css` 类名契约、取景参数与图元通用观感.
- **`src/ui/viewer/`**:界面层——
  - `config.ts` 窗口清单 / DOM 契约 / 标题栏节点表 / 默认示例 / 帮助文案 / 类名与令牌名;
  - `examples.ts` 内置示例结构:JSON + 配套检查 id + 示例菜单分组(纯数据);
  - `viewer_chrome.ts` JSON 窗口标题栏的示例 / RUN 按钮与菜单面板;
  - `viewer_views.ts` 桌面背景与六扇窗口正文的标记(纯函数);其中诊断窗口正文就是库的 `createMessageArea` 容器;
  - `viewer_items.ts` 实体行 / 检查行(RowList 的两种行对象);
  - `viewer_format.ts` 解析错误 / 检查抬头 / 检查配置报错与未找到函数名的提示 / `attrs` -> 视觉变体;
  - `check_config.ts` 「检查配置」编辑器内容的解析(JSON 数组 -> 函数名数组);
  - `viewer_highlight.ts` JSON 分词 -> 高亮 HTML;
  - `viewer.ts` 挂载:装配桌面 + 视口 + RUN / 示例 / 检查配置的全流程;改 JSON 不自动跑.

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

节点半径是 `src/visual/config.ts` 的 `VISUAL_NODE_RADIUS`(TS 一处):渲染层用它写
`<circle r>`,布局用它把连线端点收进圆边界;同层最小中心距必须大于 2 × 半径.
内容实际占多大仍由渲染后 `getBBox()` 量.

## 视觉层:节点 / 连线

| 图元 | 表示 | 状态 |
| --- | --- | --- |
| **节点 node** | 圆 + 居中的值文字;语义差异用 `visual-node--<variant>` 变体类表达 | 已实现 |
| **有向指针 pointer** | 直线段 + 终点箭头(`visual-link--pointer` + `visual-pointer-arrow`) | 已实现 |
| **无向边 edge** | 只有直线段(`visual-link--edge`),不画箭头 | 已实现 |
| **内存块 block** | 一段连续的存储格(下标 + 值),用于数组 / 栈 / 队列 / 哈希桶数组 | **未实现**:现在没有数组类结构,类型与渲染分支都不预埋 |

- **端点**:布局把每条线从节点圆心方向收进 `半径 + 空隙` 处,箭头不会被圆盖住;线段在箭头
  **底边**处收住(尖端往回退一个箭头长度),不画到尖端 -- 线头不会从三角形的窄尖端戳出来;
- **平行边 / 反向指针**:按"无向节点对"分组,同组连线按 `VISUAL_LINK_LANE_GAP` 横向
  对称分道.柯尼斯堡的 K-N ×2 / K-S ×2 因此画成两条;`a->b` 与 `b->a` 分到两侧,
  两枚箭头都看得见;
- 箭头是渲染层算出来的填充三角形(显式 `<path>`),不用 SVG `<marker>`:少一份带 id 的
  `<defs>`,重绘与多实例都不用管 id 唯一.

刻意不做的预留(等第一种真的需要它的结构出现时再加,不提前猜字段):

- 节点形状目前只有圆.方框 / 圆角矩形等形状不预留 `shape` 字段;
- 绕线 / 曲线连接 / 自环的环状画法:自环目前是零长度线段(画不出可见线),等有结构
  真的用到再补;
- 内存块同理:等第一种数组类结构出现时再补 `VisualBlock` 与渲染分支.

坐标口径:场景里所有坐标都是**世界坐标**(平面坐标,单位 = 屏幕像素 @ 缩放 1),与视口 /
桌面多大无关;世界坐标 -> 屏幕像素只发生在世界层的 `transform` 上.连线端点由布局按
`VISUAL_NODE_RADIUS` 算好,内容实际占多大由渲染层落笔后向浏览器要 `getBBox()`.

## 结构

```text
index.html              页面上只有一颗手写宿主 #app
src/main.ts             入口:引库样式 + 应用样式,再 mountViewer(#app)
css/app.css             应用层:页面基线 + 从主站继承的令牌(--font-code / 桌面底色)

src/scene/              中性场景文档:类型 / 解析校验 / 检查注册表(与具体结构无关)
src/scene/scene_document.ts       文档类型(nodes / pointers / edges)
src/scene/scene_document_parse.ts 解析 / 校验(错误码 + 路径)
src/scene/scene_check.ts          检查注册表:检查 id -> 运行函数
src/scene/label_value.ts          label -> 数值的共用口径(rbt / heap / list)

src/datastruct/         纯逻辑:各数据结构的性质检查
src/datastruct/checks.ts                     内置检查集注册入口(rbt / graph / heap / list)
src/datastruct/rbt/rbt_checks.ts             红黑树性质检查
src/datastruct/graph/graph_checks.ts         图(欧拉回路)检查
src/datastruct/heap/heap_checks.ts           最小堆检查
src/datastruct/list/list_checks.ts           单链表检查

src/visual/             视觉层:所有结构共用(场景模型 / 落笔 / 绘制面 / 视口 / 自动布局)
src/visual/scene.ts        场景模型:节点 / 连线(有向指针 / 无向边)的正式表示
src/visual/render.ts       场景 -> SVG:整批重建世界层,并用 getBBox 量内容实际占多大
src/visual/surface.ts      平面绘制面标记:视口 div -> 绘制面 svg -> 世界层 g
src/visual/viewport.ts     平面视口:变换数学 + 拖动 / 滚轮手势 + 回正 + 定位
src/visual/layout.ts       中性场景自动布局:树形(轮廓合并)/ 环形 / 多分量并排
src/visual/config.ts       视觉层的类名契约、节点半径 / 箭头 / 分道参数、取景与布局参数
src/visual/tokens.css      视觉层令牌(--visual-*:颜色 / 线宽 / 字号 / 进入动画)
src/visual/visual.css      视觉层观感(视口裁切与手势 / 绘制面 / 节点 / 连线 / 箭头 / 动画)

src/ui/viewer/          界面:JSON 编辑 + 实体 / 检查列表 + 帮助
src/ui/viewer/config.ts         窗口清单 / DOM 契约 / 标题栏节点表 / 默认示例 / 帮助文案
src/ui/viewer/examples.ts        内置示例结构:JSON + 配套检查 id + 菜单分组
src/ui/viewer/viewer_chrome.ts   JSON 窗口标题栏:示例 / RUN 按钮 + 示例菜单面板
src/ui/viewer/viewer.ts         挂载:装配桌面 + 视口 + RUN / 示例 / 检查配置的全流程
src/ui/viewer/viewer_views.ts   桌面背景与六扇窗口正文(纯函数;诊断窗口用库的 createMessageArea)
src/ui/viewer/viewer_items.ts   实体行 / 检查行(RowList 的两种行对象)
src/ui/viewer/viewer_format.ts  解析错误 / 检查抬头 / 检查配置报错 / attrs -> 视觉变体
src/ui/viewer/viewer_highlight.ts JSON 分词 -> 高亮 HTML(纯函数)
src/ui/viewer/check_config.ts    检查配置(JSON 数组)的解析(纯函数)
src/ui/viewer/tokens.css        查看器令牌(--viewer-*:列表 / 状态色 / 词法 / 示例节点色)
src/ui/viewer/viewer.css        查看器观感(窗口正文 / 列表行 / 检查详情 / JSON 词法)

src/test_support/       标记契约测试的两个小助手(renderHost / expectNoDuplicateIds)
scripts/dev_ui_link.py  本地联调:miko_ui 换成指向工作副本的软链(link / unlink / status)
docs/checks.md          性质检查实现速查(显示名 / id / 函数位置 / 判据)
docs/animation.md       动画演示设计(轨迹 / 场景形变 / 镜头缓动 / BST 与 RBT 剧本;**尚未实现**)

python/                 中性 JSON 生成(纯标准库;与 web 不是前后端关系,见 python/README.md)
```

跨目录导入一律用源码根别名 `@/`(`@/scene/scene_document_parse`,
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

- 纯逻辑(node 环境):中性文档解析器 / 检查注册表 / 红黑树 / 图 / 堆 / 链表检查 /
  内置示例清单 / 自动布局 / JSON 高亮 / 文案映射;
- 标记契约与行为(happy-dom):桌面装配、六扇窗口清单、标题栏示例 / RUN、两个 CodeEditor、
  实体 / 检查两个列表窗口、输入不自动运行而 RUN / Ctrl+Enter 才运行、示例菜单整组换
  JSON + 检查配置、按检查配置重算、检查配置错误与未找到函数名的诊断提示、定位 / 回正接线.

## 历史

这个目录最早是主站里的一颗红黑树工具:输入简写表达式 -> 解析 -> 四项性质检查 -> 布局 ->
SVG.之后依次做过:编辑器换成库的 `CodeEditor`、面板换成桌面窗口、背景换成可拖动缩放的
平面、把"画法"提成视觉层.2026-10 的这次改动把输入换成**中性 JSON**,并:

- 新增通用自动布局(树 / 图),web 不再只画红黑树;
- 原来的"性质检查"窗口拆成 graphcalc 风格的**实体** / **检查**两扇窗口,支持折叠详情与
  节点定位;
- 检查结论从 JSON 里拿掉:JSON 只描述结构(三种图元),web 按检查配置现算;Python 侧不再
  输出 `checks`;
- 新增「检查配置」窗口:与 JSON 窗口同构的编辑器,内容是一段检查函数名的 JSON 数组;
  结构名也一并从 JSON 里删掉,检查完全由这份配置决定;
- 解析错误 / 空输入提示改用库的**消息区**(诊断窗口),JSON 窗口只剩下编辑器;
- 原来的三行提示挪进独立的"帮助"窗口;
- 之后删掉了旧的表达式解析 / 旧红黑树检查核心与 Python 侧的 Term 写端:两侧只剩 JSON 一种
  表示,Python 的 `Diagram.dumps()` 直接产出 web 读的同一份文档;
- 2026-10 补:JSON 窗口标题栏加**示例 / RUN** 两个动作(改 JSON 不再自动运行),示例菜单内置
  红黑树 / 二叉搜索树 / 最小堆 / 单链表 / 柯尼斯堡七桥,并新增堆 / 链表两个检查集;
- 2026-10 补:有向指针画成箭头、无向边保持普通线段;同一对节点之间的平行边 / 反向指针
  横向分道,柯尼斯堡七桥的 7 座桥不再叠成 5 条线.
- 2026-10 补:箭头收窄为底宽 7 / 长 10(原来底宽 = 长 = 10,张角 90°,放大后是一枚
  等腰直角三角形,像鼠标指针).线宽不变,指向仍然清楚.
- 2026-10 补:线段止于箭头底边,不再画到尖端;尖端的线头(2px 方头)不会再破坏箭头的尖角.
