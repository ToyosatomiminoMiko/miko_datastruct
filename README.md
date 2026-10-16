# miko_datastruct

数据结构工具.目前只有一种结构:**红黑树**(输入表达式 -> 解析 -> 四项性质检查 -> 画成 SVG).

表达式输入是 **`miko_ui` 的 `CodeEditor`**(行号槽 + 词法高亮层):外框 / 字距对齐 /
"编辑器自己不滚,滚动归宿主"归库;分词与配色归本项目(`src/rbt/ui/rbt_highlight.ts`
产出类名,颜色在 `src/rbt/tokens.css` 的 `--rbt-token-*`).

界面是 **`miko_ui` 的桌面**(`mountDesktop`:背景 + 窗口层 + 任务栏),不是一颗面板:

```text
#rbtTree                 桌面背景 —— 那棵 SVG 树铺满整块桌面,所有窗口都浮在它上面
├─ 窗口 "表达式"          只有编辑器宿主 #rbtEditor
└─ 窗口 "性质检查"        两行静态提示 + 唯一输出区 #treeOutput(提示 / 错误 / 四项性质)
```

这样分工的理由是与 `miko_graphcalc` 把 3D 视口当桌面背景同一条:树是**结果**,窗口是
**操作**;结果铺在桌面上,改表达式时不必在输入框与树之间切来切去,窗口没盖住的地方
就是树本身.两扇窗口内部再按"输入 / 说明 + 结果"分:编辑器独占一扇(整高都是输入区),
两行说明(简写语法 / 配色图例)与本轮输出同处一栏,说明在上、结果在下.

这个目录是**从主站拆出来的**([ToyosatomiminoMiko.github.io](../../)):`src/rbt/` 下的
源码与测试搬自主站的 `src/rbt/`,拆出来时**没有改任何功能** —— 只是把"长在主站标签页
窗格里"改成"长在自己页面的一颗宿主上".之后的两次功能改动是表达式输入换成库的
`CodeEditor`(裸 textarea -> 行号 + 高亮层,见上),以及面板换成桌面(见
`RBT_DESKTOP_WINDOWS` 与 `src/rbt/ui/rbt_views.ts`);解析与性质检查的行为契约一直没变.

## 跑起来

```bash
npm install
npm run dev        # http://localhost:5173/miko_datastruct/(dev server 也认 vite.config.ts 的 base)
npm test           # vitest:纯逻辑 + 标记契约(happy-dom,进程内)
npm run typecheck  # tsc --noEmit
npm run build      # clean -> test -> typecheck -> vite build(产物在 dist/)
npm run preview    # 预览 dist/
```

`vite.config.ts` 的 `base` 是部署路径的**唯一开关**(现在写成 `/miko_datastruct/`,
与仓库名一致);换仓库名或换子路径只改那一处.

## 结构

```text
index.html              页面上只有一颗手写宿主 #app
src/main.ts             入口:引库样式 + 应用样式,再 mountRBT(#app)
css/app.css             应用层:页面基线 + 一条从主站继承的令牌(--font-code)
src/rbt/config.ts       声明式模型:文案 / DOM 契约 id / 窗口清单 / 布局几何 / 结构类名 / 词法类名 / 性质清单
src/rbt/rbt_tree.ts     解析(格式检查)与性质检查(纯逻辑,可单测)
src/rbt/rbt.ts          布局 + SVG 落笔 + mountRBT(建内容 -> mountDesktop -> 行为)
src/rbt/ui/rbt_views.ts 桌面视图(纯函数:背景树 + 两扇窗口的正文;编辑器是库的 createCodeEditor)
src/rbt/ui/rbt_highlight.ts 表达式分词 -> 高亮 HTML(纯函数,注入给编辑器的高亮层)
src/rbt/tokens.css      设计令牌(--rbt-*:窗口正文内边距 / 编辑器尺寸 / 输出区与树 / 词法着色)
src/rbt/rbt.css         观感(桌面背景那棵树 / 窗口正文滚动区 / 编辑器宿主 / 输出区 / 词法着色)
src/test_support/       标记契约测试的两个小助手(renderHost / expectNoDuplicateIds)
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
