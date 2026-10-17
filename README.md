# miko_datastruct

数据结构工具.目前只有一种结构:**红黑树**(输入表达式 -> 解析 -> 四项性质检查 -> 画成 SVG).
红黑树本身(数据结构 / 性质检查 / 表达式解析)在 `src/rbt/core/` 里,与怎么显示无关;
界面、布局、文案都在显示层(`src/rbt/config.ts`、`src/rbt/ui/`、`src/rbt/rbt.ts`).

表达式输入是 **`miko_ui` 的 `CodeEditor`**(行号槽 + 词法高亮层):外框 / 字距对齐 /
"编辑器自己不滚,滚动归宿主"归库;分词与配色归本项目(`src/rbt/ui/rbt_highlight.ts`
产出类名,颜色在 `src/rbt/tokens.css` 的 `--rbt-token-*`).

界面是 **`miko_ui` 的桌面**(`mountDesktop`:背景 + 窗口层 + 任务栏),不是一颗面板:

```text
#rbtViewport            桌面背景 —— 平面视口(铺满桌面、裁切、收指针手势)
└─ svg#rbtTree          1:1 画布(没有 viewBox:一个用户单位 = 一个 CSS 像素)
   └─ g.rbt-world       世界层:树的一切都在这里,视口只改这一层的 transform

窗口层(压在背景之上)
├─ 窗口 "表达式"         只有编辑器宿主 #rbtEditor
└─ 窗口 "性质检查"       三行静态提示 + 唯一输出区 #treeOutput(提示 / 错误 / 四项性质)
```

树是**一块平面空间**里的一份内容,不是一块定尺画布(2026-10 改):布局算出来的坐标就是
平面坐标(水平跨度由叶子数推出来,垂直方向深一层往下走一步),不再有"画布多大"这回事;
看它的是一块**视口**——**左键拖动平移、滚轮以指针为锚缩放、双击适应视口**.没有坐标系
(不画网格 / 轴 / 刻度),平面的底色就是桌面底色.用户没手动挪过视角之前,每次重绘都会
自动适应;挪过之后重绘不再动视角,双击"适应"回到自动.

这样分工的理由是与 `miko_graphcalc` 把 3D 视口当桌面背景同一条:树是**结果**,窗口是
**操作**;结果铺在桌面上,改表达式时不必在输入框与树之间切来切去,窗口没盖住的地方
就是平面本身.两扇窗口内部再按"输入 / 说明 + 结果"分:编辑器独占一扇(整高都是输入区),
三行说明(简写语法 / 配色图例 / 平面怎么动)与本轮输出同处一栏,说明在上、结果在下.

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
`RBT_DESKTOP_WINDOWS` 与 `src/rbt/ui/rbt_views.ts`)、背景那棵树换成平面视口(见
`src/rbt/ui/rbt_viewport.ts`);解析与性质检查的行为契约一直没变,布局的**算法**也没变
(变的只是"平面有多宽"从写死的画布宽度改成按叶子数推出来).2026-10 又做了一次纯重构:
把红黑树核心从显示层里拆到 `src/rbt/core/`(见下节),行为一条没改.

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

## 分层:核心 / 显示

`src/rbt/` 下分两层,依赖方向只有 **显示 -> 核心** 一个:

- **核心 `src/rbt/core/`**:红黑树本身.纯逻辑,不碰 DOM,不引用显示层常量,也不写
  任何给人看的文案.`rbt_tree.ts` 是数据结构(节点 / 颜色,字段只读)加四条性质检查,
  结论是**结构化**的(违规节点 / 两侧黑高,不是句子);`rbt_parse.ts` 是表达式解析,
  失败只给**错误码 + 出错片段**.核心节点**不挂坐标**:布局算的 x / y 存在显示层自己
  的 `RbtPlacedNode` 里.
- **显示层**:`config.ts`(文案模板 / DOM 契约 / 窗口清单 / 布局与视口参数 / 类名)、
  `ui/rbt_layout.ts`(叶子数 -> 平面宽度 -> 坐标 / 连线 / 包围盒)、
  `ui/rbt_render.ts`(世界层落笔)、`ui/rbt_format.ts`(结构化结果 -> 中文文案)、
  `ui/rbt_views.ts`(桌面视图标记)、`ui/rbt_viewport.ts`(拖动 / 缩放 / 适应)、
  `rbt.ts`(装配 + 每轮输入的全流程).

这样切线之后,"显示的办法"(间距 / 层距 / 半径 / 窗口几何 / 文案)要删要改都只落在
显示层:核心层不知道树怎么画,删掉某种画法也不必动性质检查与解析.界面变成可拖动缩放
的平面之后,布局里那些"算高度 / 算间距"的参数本来就只影响首屏观感(用户可以自己
缩放),它们集中在 `config.ts` 的布局几何一节与 `ui/rbt_layout.ts`,不再和树的定义
混在一起.

## 结构

```text
index.html              页面上只有一颗手写宿主 #app
src/main.ts             入口:引库样式 + 应用样式,再 mountRBT(#app)
css/app.css             应用层:页面基线 + 一条从主站继承的令牌(--font-code)
src/rbt/core/rbt_tree.ts    数据结构(节点 / 颜色,字段只读)+ 四条性质检查(结构化:违规节点 / 两侧黑高)
src/rbt/core/rbt_parse.ts   表达式解析(字符串 -> 节点;失败只给错误码 + 出错片段)
src/rbt/config.ts       显示层声明式模型:文案模板 / DOM 契约 id / 窗口清单 / 平面与视口参数 / 布局几何 / 类名 / 性质标签
src/rbt/rbt.ts          挂载:内容装配 -> mountDesktop + 视口,以及每轮输入的全流程(格式检查 -> 性质检查 -> 重绘)
src/rbt/ui/rbt_layout.ts   平面布局(纯几何:叶子数 -> 平面宽度 -> 坐标 / 连线 / 包围盒;坐标不进核心节点)
src/rbt/ui/rbt_render.ts   世界层落笔(SVG 节点 / 连线,每轮整批重建)
src/rbt/ui/rbt_format.ts   核心结构化结果 -> 中文文案(解析错误 / 性质说明 / 抬头)
src/rbt/ui/rbt_views.ts 桌面视图(纯函数:平面背景(视口 + 画布 + 世界层)+ 两扇窗口的正文;编辑器是库的 createCodeEditor)
src/rbt/ui/rbt_viewport.ts 平面视口:世界坐标 -> 屏幕像素的变换数学 + 拖动 / 滚轮 / 双击手势
src/rbt/ui/rbt_highlight.ts 表达式分词 -> 高亮 HTML(纯函数,注入给编辑器的高亮层)
src/rbt/tokens.css      设计令牌(--rbt-*:窗口正文内边距 / 编辑器尺寸 / 输出区与树 / 词法着色)
src/rbt/rbt.css         观感(平面视口的裁切与手势 / 世界层里那棵树 / 窗口正文滚动区 / 编辑器宿主 / 输出区 / 词法着色)
src/test_support/       标记契约测试的两个小助手(renderHost / expectNoDuplicateIds)
scripts/dev_ui_link.py  本地联调:miko_ui 换成指向工作副本的软链(link / unlink / status)
```

跨目录导入一律用源码根别名 `@/`(`@/rbt/config`,`@/test_support/desktop_test_helpers`);
别名一处定义两处生效:`tsconfig.json` 的 `paths` 与 `vite.config.ts` 的 `resolve.alias`.

## 依赖

- **`miko_ui`**:桌面窗口系统(`mountDesktop` + `DesktopConfig` / `WindowConfigEntry`:
  背景层 / 窗口外壳 / 任务栏 / 几何锚点,窗口清单在 `src/rbt/config.ts`)、DOM 原语
  (`create_element` / `create_svg_element` / `childNodes`)、表达式编辑器
  (`createCodeEditor`:行号槽 + 词法高亮层,分词与配色由本项目注入;`seedTextareaSource`:
  首屏种示例)、主题与字体(字体文件随库发布,本项目不自带 woff2).
- `css/app.css` 里的 `--font-code` 是主站**站点层**的一条令牌
  (`public/css/tokens.css`),本项目没有那一层,所以在这里补一份等价定义.
  它服务输出区与树上的节点值;编辑器那一格由库的 `--code-font-family` 自己给.
