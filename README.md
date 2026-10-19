# miko_datastruct

数据结构工具.这个仓库按**每个数据结构一份核心 + 一份界面 + 一份共用的视觉层**组织:

- `src/datastruct/` 放数据结构本身,按结构分目录(现在只有 `rbt/`):节点形状 / 四条性质
  检查 / 表达式解析.纯逻辑,不碰 DOM,不引用任何显示层常量;
- `src/visual/` 是**所有结构共用的视觉层**:场景模型(节点 / 指针 / 内存块怎么表示)+
  SVG 落笔 + 平面绘制面 + 视口,以及类名 / 令牌契约.它不认识任何数据结构,只依赖 `miko_ui`;
- `src/ui/` 放界面,同样按结构分目录(现在只有 `rbt/`):表达式输入 / 性质文案 / 桌面窗口 /
  这一种结构自己的布局与视觉翻译.依赖方向只有 **ui -> datastruct** 与 **ui -> visual**.

红黑树这一种结构的界面是:输入表达式 -> 解析 -> 四项性质检查 -> 布局 -> 翻译成视觉场景 ->
画成 SVG.视觉层的正式定义见下文「视觉层:节点 / 指针 / 内存块」.

表达式输入是 **`miko_ui` 的 `CodeEditor`**(行号槽 + 词法高亮层):外框 / 字距对齐 /
"编辑器自己不滚,滚动归宿主"归库;分词与配色归本项目(`src/ui/rbt/rbt_highlight.ts`
产出类名,颜色在 `src/ui/rbt/tokens.css` 的 `--rbt-token-*`).

界面是 **`miko_ui` 的桌面**(`mountDesktop`:背景 + 窗口层 + 任务栏),不是一颗面板:

```text
#rbtViewport            桌面背景 —— 平面视口(铺满桌面、裁切、收指针手势)
└─ svg#rbtTree          1:1 绘制面(svg,没有 viewBox:一个用户单位 = 一个 CSS 像素)
   └─ g.visual-world    世界层:场景里的一切都在这里,视口只改这一层的 transform

窗口层(压在背景之上)
├─ 窗口 "表达式"         只有编辑器宿主 #rbtEditor
└─ 窗口 "性质检查"       三行静态提示 + 唯一输出区 #treeOutput(提示 / 错误 / 四项性质)

任务栏(库的 .dock)
├─ 窗口按钮组           表达式 / 性质
└─ 桌面动作区           回正视图 + 全部还原(库的)
```

树是**一块平面空间**里的一份内容,不是一块定尺画布(2026-10 改):布局算出来的坐标就是
平面坐标(同层节点按最小中心距排开、父节点在左右孩子正中,垂直方向深一层往下走一步),
不再有"画布多大"这回事;看它的是一块**视口**——**左键拖动平移、滚轮以指针为锚缩放**,
"回到看得见"走任务栏右侧的**「回正视图」按钮**(2026-10 起不再用双击:双击只能靠
两次按下的时间间隔判定,不看位置、还跟中键 / 拖动共用计时,误触发多).没有坐标系
(不画网格 / 轴 / 刻度),平面的底色就是桌面底色.用户没手动挪过视角之前,每次重绘都会
自动适应;挪过之后重绘不再动视角,点一次「回正视图」回到自动.

这样分工的理由是与 `miko_graphcalc` 把 3D 视口当桌面背景同一条:树是**结果**,窗口是
**操作**;结果铺在桌面上,改表达式时不必在输入框与树之间切来切去,窗口没盖住的地方
就是平面本身.两扇窗口内部再按"输入 / 说明 + 结果"分:编辑器独占一扇(整高都是输入区),
三行说明(简写语法 / 配色图例 / 平面怎么动)与本轮输出同处一栏,说明在上、结果在下.
回正按钮不在这两栏里:它是**桌面级**动作(窗口最小化了背景仍然在),所以进库的任务栏、
与「全部还原」并排.动作清单在 `src/ui/rbt/config.ts` 的 `RBT_DOCK_ACTIONS`(库的
`DockActionSpec`:纯数据),交给 `mountDesktop` 的 `dockActions` 由库装配;点击在
`src/ui/rbt/rbt.ts` 的 `onDockAction` 里按 id 分派到视口的 `fitViewport()` -- 应用
不碰任务栏的 DOM 结构.

背景与桌面根的口径**由库定**(2026-10,与 `miko_graphcalc`、库的示例三方对齐):
`#rbtViewport` 挂库的 `.desktop-background`(铺满桌面根、压在三层容器之下、底色取
`--color-bg-desktop`),`#app` 的 `position: relative` 与 `overflow: hidden` 由库的
`.desktop-root` 给,应用侧不再各写一份定位样板.本应用只做三件事:树在世界层里的落笔,
视口的裁切 / 光标 / 手势,以及**覆盖桌面底色**(`css/app.css` 的
`--color-bg-desktop: #212529`,与主站同值)-- 覆盖库的 token,而不是再造一个
`--app-bg-page` 之类的名字.

这个目录是**从主站拆出来的**([ToyosatomiminoMiko.github.io](../../)):`src/rbt/` 下的
源码与测试搬自主站的 `src/rbt/`,拆出来时**没有改任何功能** —— 只是把"长在主站标签页
窗格里"改成"长在自己页面的一颗宿主上".之后的三次功能改动是:表达式输入换成库的
`CodeEditor`(裸 textarea -> 行号 + 高亮层,见上)、面板换成桌面(见
`RBT_DESKTOP_WINDOWS` 与 `src/ui/rbt/rbt_views.ts`)、背景那棵树换成平面视口(见
`src/visual/viewport.ts`);解析与性质检查的行为契约一直没变.2026-10 又做了一次纯
重构:把红黑树核心从显示层里拆出来(先是 `src/rbt/core/`,再按"将来不止一种结构"提到
`src/datastruct/` + `src/ui/` 两个顶层目录,见下节),行为一条没改.紧接着(2026-10)
借着视口已经能拖动缩放,把布局从"按叶子数推平面宽度 + 区间分配 + 越界钳制"换成了**整齐树
布局(轮廓合并)**:布局不再需要知道平面多大,只保证同层节点不重叠、父节点在左右孩子正中.
内容实际占多大改由渲染层落笔后向浏览器要 `getBBox()`(见 `src/visual/render.ts`),
再交给视口适应 -- 于是布局连节点半径都不知道,`--visual-node-radius` 只剩视觉层 CSS 一处.
最后一刀(2026-10)是把显示层里"所有结构共用"的部分(场景模型 / SVG 落笔 / 绘制面 / 视口)
提成 `src/visual/`,红黑树只留自己的布局与 `-> VisualScene` 翻译,行为仍然一条没改.

## 两个部分:web 展示 / python 生成表示法

仓库现在分两半,**不是前后端**:没有 HTTP、没有进程在跑,只有一份共享的中间表示.

- **web**(本目录其余部分):把结构图画出来 —— 场景模型 / SVG 落笔 / 平面视口 / 桌面窗口;
- **python**(`python/`):用普通 Python 类描述一种结构,遍历后生成**表示法** —— 通用
  Term 文本(项字面量)与中性 Scene JSON(节点 / 指针 / 边,**没有像素坐标**).

```text
Python 对象 ── dataviz 遍历 ──> Term 文本 / Scene JSON ──(文件 / 剪贴板)──> web 展示
                                       │
                                       └── 中性表示:布局与像素属于渲染端
```

两半通过文件 / 文本衔接,各自可以单独跑、单独测.设计约定见
[`python/README.md`](python/README.md):两种字段角色、三种结构种类、Term / Scene 的形状、
以及"布局归渲染端"这条边界.

已经打通的一条衔接:web 现有的红黑树表达式输入**就是 Term 语法的一个子集**,所以
`python/examples/rbt.py` 生成的简写 Term 可以原样粘进 web 的表达式编辑器.更通用的接班点
是 web 端再补一个"Scene JSON -> 排列 -> 视觉场景"的布局器(web 现在只有红黑树专用布局).

```bash
cd python && python3 demo.py                    # 三种结构的 Term / Scene / checks
cd python && python3 -m unittest discover -s tests -t .
```

## 跑起来

```bash
npm install
npm run dev        # http://localhost:5173/miko_datastruct/(dev server 也认 vite.config.ts 的 base)
npm test           # vitest:纯逻辑(node)+ 标记契约 / 行为(happy-dom,进程内)
npm run typecheck  # tsc --noEmit
npm run build      # clean -> test -> typecheck -> vite build(产物在 dist/)
npm run preview    # 预览 dist/
```

改库(`miko_ui`)时不必发版:本地把解析目标换成工作副本,与 `miko_graphcalc` 同一套
做法(同一份脚本,见 `scripts/dev_ui_link.py` 的模块说明):

```bash
npm run ui:link    # node_modules/miko_ui -> ../miko_ui(可用 MIKO_UI_DIR 覆盖)
npm run ui:status  # 看现在解析到 npm 版还是本地副本
npm run ui:unlink  # 还原成 npm 版(按 lock 重装)
```

两条都只动被忽略的 `node_modules/`,不碰 `package.json` 与 `package-lock.json`,所以
CI / 部署(`npm ci`)行为不变.链接之后:库的 `styles/` **零构建立即生效**;
库的 `src/` 要先编译进 `dist/`(`cd ../miko_ui && npm run build:dist`,或在库里常驻
`npx tsc -p tsconfig.build.json --watch`).

`vite.config.ts` 的 `base` 是部署路径的**唯一开关**(现在写成 `/miko_datastruct/`,
与仓库名一致);换仓库名或换子路径只改那一处.

## 分层:datastruct / visual / ui

依赖方向只有两条:**ui -> datastruct** 与 **ui -> visual**;`datastruct` 与 `visual` 互不
认识,顶层目录就是这条线的三段:

- **`src/datastruct/`** 是数据结构本身,按结构分目录(现在只有 `rbt/`).纯逻辑,不碰
  DOM,不引用显示层常量,也不写任何给人看的文案.`rbt/rbt_tree.ts` 是数据结构(节点 /
  颜色,字段只读)加四条性质检查,结论是**结构化**的(违规节点 / 两侧黑高,不是句子);
  `rbt/rbt_parse.ts` 是表达式解析,失败只给**错误码 + 出错片段**.核心节点**不挂坐标**:
  布局算的 x / y 存在显示层自己的 `RbtPlacedNode` 里.
- **`src/visual/`** 是视觉层:说的是"一幅结构图由哪些图元组成、图元长什么样、怎么落到
  屏幕上",不知道红黑树 / 链表 / 数组这些概念.`scene.ts` 是场景模型(下节),`render.ts`
  把场景落成 SVG,`surface.ts` 建"视口 -> 绘制面 svg -> 世界层"三层标记,`viewport.ts` 是拖动 /
  缩放 / 适应,`config.ts` 是类名与取景参数,`tokens.css` + `visual.css` 是图元通用观感.
- **`src/ui/<结构>/`** 是某一种结构的界面(现在只有 `rbt/`):表达式输入、性质文案、桌面
  窗口,以及**这一种结构自己的**布局与视觉翻译.红黑树这一份:`config.ts`(文案模板 / DOM
  契约 / 窗口清单 / 任务栏动作 / 布局几何 / 性质标签)、`rbt_layout.ts`(整齐树布局:
  轮廓合并 -> 坐标 / 连线)、`rbt_scene.ts`(布局 -> 视觉场景:红 / 黑变体、节点值、父子
  指针)、`rbt_format.ts`(结构化结果 -> 中文文案)、`rbt_views.ts`(桌面视图标记)、
  `rbt.ts`(装配 + 每轮输入的全流程)、`rbt.css` + `tokens.css`(红黑树的语义变体与观感).

按"结构"再分一层,而不是把文件直接摊在 `datastruct/` 与 `ui/` 根上:`datastruct/` 将来
会有不止一种树 / 结构,每种各有自己的节点形状、性质与解析;`ui/` 也一样(每种结构有自己
的输入、布局与文案).两个目录同名同构,加一种结构时"核心 + 界面"一对目录对应得上,不必
在一个大目录里靠文件名前缀区分.

**为什么视觉层要单独一层**:节点 / 指针 / 内存块怎么画、绘制面怎么缩放,是每一种结构都要
用、却与"数据是什么"无关的知识.留在 `ui/<结构>/` 里,加第二种结构时只能复制 render /
viewport / 节点 CSS,复制出来的每一份都会各自漂移.提成 `visual/` 之后,加结构的人只需要
写"我的数据长什么样"(布局 + 一个 `-> VisualScene` 的翻译函数),画法不必再写一遍.

## 视觉层:节点 / 指针 / 内存块

视觉层把"一幅结构图"正式定义成平面上的三种图元.当前实现到哪一条,`src/visual/scene.ts`
的文件头也写着同一份定义.

先澄清一个词:这里的**绘制面**就是那块 `<svg>` 元素(日常也叫画布).**视觉层没有用 HTML
`<canvas>`**:节点 / 指针都是 SVG 命名空间里的文档元素,命中检测 / CSS / 读屏都按 DOM 给;
`src/visual/surface.ts` 只是把"视口 div -> 绘制面 svg -> 世界层 g"这三层标记建出来.

| 图元 | 表示 | 状态 |
| --- | --- | --- |
| **节点 node** | 圆 + 居中的值文字,位置是平面坐标;语义差异用 `visual-node--<variant>` 变体类表达(如红黑树的 `red` / `black`) | 已实现 |
| **指针 pointer** | 两点之间的直线段(`visual-pointer`);方向由结构语义决定,树里画"父 -> 子"、不加箭头 | 已实现(无箭头线段) |
| **内存块 block** | 一段连续的存储格(下标 + 值),用于数组 / 栈 / 队列 / 哈希桶数组 | **未实现**:现在没有数组类结构,类型与渲染分支都不预埋 |

刻意不做的预留(等第一种真的需要它的结构出现时再加,不提前猜字段):

- 节点形状目前只有圆.方框 / 圆角矩形等形状不预留 `shape` 字段;
- 指针目前没有箭头 / 端点 / 绕线字段.链式结构要画箭头时再给 `VisualPointer` 一次按真需求
  定完端点与朝向;
- 内存块同理:等第一种数组类结构出现时再补 `VisualBlock` 与渲染分支.

坐标口径:场景里所有坐标都是**世界坐标**(平面坐标,单位 = 屏幕像素 @ 缩放 1),与视口 /
桌面多大无关;世界坐标 -> 屏幕像素只发生在世界层的 `transform` 上(见
`src/visual/viewport.ts`).内容实际占多大由渲染层落笔后向浏览器要 `getBBox()`
(`src/visual/render.ts`),布局与视觉层都不知道节点半径.

加一种结构时只落三处,画法不重写:

1. `src/datastruct/<结构>/`:数据结构本身 + 性质检查(纯逻辑);
2. `src/ui/<结构>/`:输入 / 布局 / 一个 `布局 -> VisualScene` 的翻译函数 / 文案与窗口声明;
3. 有**新图元**才动 `src/visual/`:先补 `scene.ts` 的类型与 `render.ts` 的分支,再让使用它
   的那个结构上色.

这样切线之后,"显示的办法"(间距 / 层距 / 半径 / 窗口几何 / 文案)要删要改:通用画法只
落在 `src/visual/`,红黑树的语义与布局只落在 `src/ui/rbt/`.核心层不知道树怎么画,删掉
某种画法也不必动性质检查与解析.界面变成可拖动缩放的平面之后,布局里那些"算高度 / 算
间距"的参数只影响首屏观感(用户可以自己缩放),而且收缩到两个数:层距、同层最小中心距 --
没有"画布多宽 / 安全边距 / 越界钳制"这一类为定尺画布服务的参数,它们集中在
`src/ui/rbt/config.ts` 的布局几何一节与 `rbt_layout.ts`,不再和树的定义混在一起.

## 结构

```text
index.html              页面上只有一颗手写宿主 #app
src/main.ts             入口:引库样式 + 应用样式,再 mountRBT(#app)
css/app.css             应用层:页面基线 + 一条从主站继承的令牌(--font-code)

src/datastruct/         核心:数据结构本身(纯逻辑,不碰 DOM、不引用显示层)
src/datastruct/rbt/rbt_tree.ts    数据结构(节点 / 颜色,字段只读)+ 四条性质检查(结构化:违规节点 / 两侧黑高)
src/datastruct/rbt/rbt_parse.ts   表达式解析(字符串 -> 节点;失败只给错误码 + 出错片段)

src/visual/             视觉层:所有结构共用(场景模型 / 落笔 / 绘制面 / 视口 / 类名与令牌)
src/visual/scene.ts        场景模型:节点 / 指针的正式表示(内存块等有结构用到再补,见上节)
src/visual/render.ts       场景 -> SVG:整批重建世界层,并用 getBBox 量内容实际占多大
src/visual/surface.ts      平面绘制面标记:视口 div -> 绘制面 svg -> 世界层 g
src/visual/viewport.ts     平面视口:世界坐标 -> 屏幕像素的变换数学 + 拖动 / 滚轮手势 + 回正
src/visual/config.ts       视觉层的类名契约与平面 / 视口取景参数
src/visual/tokens.css      视觉层令牌(--visual-*:节点半径 / 值文字 / 指针 / 进入动画)
src/visual/visual.css      视觉层观感(视口裁切与手势 / 绘制面 / 节点 / 指针 / 动画)

src/ui/                 界面:每个结构一份(输入 / 布局 / 视觉翻译 / 桌面 / 文案 / 样式)
src/ui/rbt/config.ts       红黑树的显示层声明:文案模板 / DOM 契约 id / 窗口清单 / 任务栏动作清单 / 布局几何 / 性质标签
src/ui/rbt/rbt.ts          挂载:内容装配 -> mountDesktop + 视口 + 回正动作接线,以及每轮输入的全流程(格式检查 -> 性质检查 -> 重绘)
src/ui/rbt/rbt_layout.ts   平面布局(纯几何:整齐树布局 / 轮廓合并 -> 坐标 / 连线;坐标不进核心节点)
src/ui/rbt/rbt_scene.ts    红黑树 -> 视觉场景(红 / 黑变体、节点值、父子指针);布局与视觉层之间唯一的翻译
src/ui/rbt/rbt_format.ts   核心结构化结果 -> 中文文案(解析错误 / 性质说明 / 抬头)
src/ui/rbt/rbt_views.ts 桌面视图(纯函数:平面绘制面 + 两扇窗口的正文;编辑器是库的 createCodeEditor)
src/ui/rbt/rbt_highlight.ts 表达式分词 -> 高亮 HTML(纯函数,注入给编辑器的高亮层)
src/ui/rbt/tokens.css      红黑树令牌(--rbt-*:窗口正文内边距 / 编辑器尺寸 / 输出区 / 词法着色 / 红黑节点填充色)
src/ui/rbt/rbt.css         红黑树观感(窗口正文滚动区 / 编辑器宿主 / 输出区 / 词法着色 / 红黑节点的语义变体)

src/test_support/       标记契约测试的两个小助手(renderHost / expectNoDuplicateIds)
scripts/dev_ui_link.py  本地联调:miko_ui 换成指向工作副本的软链(link / unlink / status)

python/                 表示法生成(纯标准库;与 web 不是前后端关系,见上文)
python/dataviz/         注册表 / 字段角色 / 遍历 / Term 写端 / Scene 写端 / 后端
python/examples/        三个例子:node / 柯尼斯堡七桥 / 红黑树
python/demo.py          演示入口:生成 Term 文本 + Scene JSON(可 --out 写文件)
python/tests/           unittest
python/README.md        两半的边界、输出契约与用法
```

跨目录导入一律用源码根别名 `@/`(`@/datastruct/rbt/rbt_tree`,`@/ui/rbt/config`,
`@/test_support/desktop_test_helpers`);别名一处定义两处生效:`tsconfig.json` 的
`paths` 与 `vite.config.ts` 的 `resolve.alias`.

## 依赖

- **`miko_ui`**:桌面窗口系统(`mountDesktop` + `DesktopConfig` / `WindowConfigEntry` /
  `DockActionSpec`:背景层 / 窗口外壳 / 任务栏(窗口按钮 + 应用动作) / 几何锚点,
  窗口清单与任务栏动作清单在 `src/ui/rbt/config.ts`)、DOM 原语
  (`create_element` / `create_svg_element` / `childNodes`)、表达式编辑器
  (`createCodeEditor`:行号槽 + 词法高亮层,分词与配色由本项目注入;`seedTextareaSource`:
  首屏种示例)、主题与字体(字体文件随库发布,本项目不自带 woff2).
- `css/app.css` 里的 `--font-code` 是主站**站点层**的一条令牌
  (`public/css/tokens.css`),本项目没有那一层,所以在这里补一份等价定义.
  它服务输出区与树上的节点值;编辑器那一格由库的 `--code-font-family` 自己给.
