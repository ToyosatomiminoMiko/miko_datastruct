# miko_datastruct

数据结构工具.目前只有一种结构:**红黑树**(输入表达式 -> 解析 -> 四项性质检查 -> 画成 SVG).

表达式输入是 **`miko_ui` 的 `CodeEditor`**(行号槽 + 词法高亮层):外框 / 字距对齐 /
"编辑器自己不滚,滚动归宿主"归库;分词与配色归本项目(`src/rbt/ui/rbt_highlight.ts`
产出类名,颜色在 `src/rbt/tokens.css` 的 `--rbt-token-*`).

这个目录是**从主站拆出来的**([ToyosatomiminoMiko.github.io](../../)):`src/rbt/` 下的
源码与测试搬自主站的 `src/rbt/`,面板仍然是 `miko_ui` 的 `createPanel`(框体 +
标题栏 + 正文),拆出来时**没有改任何功能** —— 只是把"长在主站标签页窗格里"改成
"长在自己页面的一颗宿主上".之后唯一的功能改动是表达式输入换成库的 `CodeEditor`
(裸 textarea -> 行号 + 高亮层,见上),行为契约没变.

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
src/rbt/config.ts       声明式模型:文案 / DOM 契约 id / 布局几何 / 结构类名 / 词法类名 / 性质清单
src/rbt/rbt_tree.ts     解析(格式检查)与性质检查(纯逻辑,可单测)
src/rbt/rbt.ts          布局 + SVG 落笔 + mountRBT(挂载与行为)
src/rbt/ui/rbt_panel.ts 标记组件(纯函数,交回元素引用;表达式编辑器是库的 createCodeEditor)
src/rbt/ui/rbt_highlight.ts 表达式分词 -> 高亮 HTML(纯函数,注入给编辑器的高亮层)
src/rbt/tokens.css      设计令牌(--rbt-*:编辑器宿主的尺寸 / 输出区与树 / 词法着色)
src/rbt/rbt.css         观感(编辑器宿主 / 输出区 / 那棵 SVG 树 / 词法着色)
src/test_support/       标记契约测试的两个小助手(renderPanel / expectNoDuplicateIds)
```

跨目录导入一律用源码根别名 `@/`(`@/rbt/config`,`@/test_support/panel_test_helpers`);
别名一处定义两处生效:`tsconfig.json` 的 `paths` 与 `vite.config.ts` 的 `resolve.alias`.

## 依赖

- **`miko_ui`**:面板框体(`createPanel`)、DOM 原语(`create_element` / `create_svg_element`
  / `childNodes`)、表达式编辑器(`createCodeEditor`:行号槽 + 词法高亮层,分词与配色由
  本项目注入;`seedTextareaSource`:首屏种示例)、主题与字体(字体文件随库发布,
  本项目不自带 woff2).
- `css/app.css` 里的 `--font-code` 是主站**站点层**的一条令牌
  (`public/css/tokens.css`),本项目没有那一层,所以在这里补一份等价定义.
  它服务输出区与树上的节点值;编辑器那一格由库的 `--code-font-family` 自己给.
