/*
红黑树工具的**桌面视图组件**(声明式).

整块界面按 config.ts 的声明在这里生成,由 src/rbt/rbt.ts 的 `mountRBT` 交给库的
`mountDesktop` 装配.这一层不认识窗口系统:它只产出三样东西 -- 一块**桌面背景**
(那棵 `<svg>` 树)和两扇窗口的**正文节点**,再由 `content()` 按窗口 id 交回去
(与库 `mountDesktop` 的分工一致:库建容器并把节点搬进去,消费者只管内容).

桌面化(2026-10)之前这里是 `createRbtPanel()`:一颗 `createPanel` 的框体,提示区 /
编辑器 / 输出区 / 树按顺序堆在同一个正文里.现在同一个内容分成两扇窗口,那棵树
**搬出窗口、成为桌面背景**:

  #rbtTree(桌面背景,所有窗口之下,铺满整块桌面)
  ├── 窗口 "表达式":提示区 + 编辑器宿主 #rbtEditor
  └── 窗口 "性质检查":唯一输出区 #treeOutput

这样做的理由与 miko_graphcalc 把 3D 视口当桌面背景是同一条:树是**结果**,窗口是
**操作**;把结果铺在桌面上、操作浮在上面,改表达式时不用在"输入框"和"看树"之间
来回切窗口,窗口没盖住的地方就是树本身.

**表达式输入是 miko_ui 的 `createCodeEditor`,不是裸 `<textarea>`**:
库交回的是一整块外框 `.code-editor`,里面仍是**真 textarea**(光标 / 选区 / 撤销栈 /
IME 照旧是浏览器原生的,高亮只是一层 pointer-events: none 的背景),外加行号槽与
高亮层.高亮用什么词法、什么颜色由我们注入:分词在 ui/rbt_highlight.ts,类名在
config.ts,配色在 src/rbt/tokens.css 的 `--rbt-token-*`.

**为什么要自带一格宿主 `#rbtEditor`**:库的编辑器**自己不滚** -- 外框的宽高都由内容
给出(高亮内容那个 `white-space: pre` 的 `<pre>`),滚动归装它的那一层.桌面化之前那
一层是宿主自己;现在是两扇窗口的正文根(`#rbtEditorPanel` / `#rbtOutputPanel`),
宿主只剩外边距与最小高度(见 miko_ui 的 styles/editor.css 的"滚动归属"与 rbt.css).
宿主由我们建、我们命名:库的元素上一个 id 都不加,那会把消费者的 id 变成库的公开
API;而且宿主在 CSS 里还有别的活干(外边距 / 最小高度,见 rbt.css).

**树是一棵 `<svg>`,不是一个 `<canvas>`**(2026-10 起):节点与连线都是文档里的真
元素,所以命中检测 / pointer 事件 / CSS transition / CSS 令牌着色全部由浏览器给,
不必自己写 `ctx` 那一套.标记里只放**空的 `<svg>` 根**:每轮要画什么由 rbt.ts 按
布局结果重建(整批换掉根的子节点),这一层不认识树,只认识"这里有一块画树的背景".

`<svg>` 归 `create_svg_element` 建(库的 SVG 命名空间原语)而不是 `create_element`:
两条路都建得出 `<svg>`,但只有前者给的是 `SVGSVGElement`(命名空间也确定是 SVG,
不靠 HTML 解析器"按上下文收编"的特例),拿到的类型才对得上后面要往上挂的几何节点
(见 miko_ui 的 `widgets/svg/dom.ts` 文件头).

`preserveAspectRatio` + CSS 的 `width/height: 100%` 让整棵树按桌面尺寸等比缩放:
viewBox 是 1200×640 的逻辑坐标,窗口与窄屏上都不会溢出,也不需要 `devicePixelRatio`
那一套(canvas 时代必须手算 dpr,否则高分辨率屏上是糊的).

背景只画树:一切文案(空输入 / 空树提示,解析错误,性质结论)都写进**同一个**输出区
#treeOutput,颜色 / 字号 / 折行交给 CSS,截图与选中复制也才正常.

本模块是纯函数:不读页面,不改全局,不绑业务事件,只把"描述"变成元素并把行为
代码要用的引用一起交回;装配桌面与绑事件都是 rbt.ts 的事.
*/

import {
    create_element,
    create_svg_element,
    createCodeEditor,
    type Child,
    type CodeEditorHandle,
    type WindowContentSpec,
} from 'miko_ui';
import {
    RBT_DOM,
    RBT_EDITOR_GUTTER_MIN_WIDTH,
    RBT_HINT_COLOR_LEGEND,
    RBT_HINT_SHORTHAND,
    RBT_INPUT_PLACEHOLDER,
    RBT_VIEW_BOX,
    RBT_VIEW_BOX_HEIGHT,
    RBT_VIEW_BOX_WIDTH,
    RBT_WINDOW_EDITOR,
    RBT_WINDOW_PROPERTIES,
    type RbtWindowId,
} from '@/rbt/config';
import { highlightRbtExpression } from '@/rbt/ui/rbt_highlight';

/** 树这块画布的读屏标签(它不是纯装饰:画的是这一轮解析出来的树). */
const RBT_TREE_LABEL = '红黑树结构图';

/** 红黑树桌面视图:桌面背景 + 两扇窗口的正文 + 行为代码要用的元素引用 */
export interface RbtViews {
    /**
     * 桌面背景:那棵空的 `<svg>` 根 #rbtTree.
     *
     * 这里只给一块**空的**画布:子节点(连线 / 节点)由 rbt.ts 每轮 `replaceChildren`
     * 整批重建,所以这一层与布局无关.它由 `mountDesktop` 直接 append 到桌面根上,
     * **不在任何窗口里** -- 这就是"树是背景"这句话在 DOM 上的全部含义.
     */
    readonly tree: SVGSVGElement;
    /**
     * 逐窗口内容:库的 `mountDesktop` 按窗口 id 现取一次.
     *
     * 未知 id 给空内容而不是 undefined:库传进来的是不透明字符串,窗口清单将来增删
     * 一扇而这张表没跟上时,坏的应该只是那一扇窗口,不是整个装配.
     */
    readonly content: (id: string) => WindowContentSpec;
    /**
     * 表达式编辑器句柄(库的 `CodeEditorHandle`).
     *
     * 行为代码只从它拿两样东西:`textarea`(值的唯一真相源,读 `value` / 绑 `input`)
     * 与 `refresh()`(程序化改写 `value` 之后重算行号与高亮 -- 直接赋值不派发 input
     * 事件,装饰层不会自己更新).拆掉的 `dispose()` 也只有一处会调:同一颗宿主被
     * 重复挂载时(见 rbt.ts).
     */
    readonly editor: CodeEditorHandle;
    /** 唯一输出区 #treeOutput(初始 hidden,内容由 rbt.ts 每次整批重建) */
    readonly output: HTMLElement;
}

/** 按 config.ts 的声明式模型生成桌面背景与逐窗口内容 */
export function createRbtViews(): RbtViews {
    /*
      表达式编辑器:库的外框 + 行号 + 高亮层,挂在我们自己那一格宿主 `#rbtEditor` 里.

      三件由这里给、库不给的事:
      - `highlight`:分词是我们的(库不认识红黑树表达式);
      - `gutterMinWidth`:槽宽下限是我们的字号口径,库不替消费者选;
      - `placeholder`:库没有这个选项,建完再写回 textarea 上(见 config 的说明).
      初值留空:示例由 mountRBT 用库的 `seedTextareaSource` 种进去(启动时编辑器本来是
      空的,没有撤销历史要保),那样"标记生成"与"载入示例"仍各归各的那一层.
    */
    const editor = createCodeEditor({
        spellcheck: false,
        highlight: highlightRbtExpression,
        gutterMinWidth: RBT_EDITOR_GUTTER_MIN_WIDTH,
    });
    editor.textarea.setAttribute('placeholder', RBT_INPUT_PLACEHOLDER);

    // 编辑器宿主:外边距与最小高度挂在它上面,滚动归窗口正文根(见文件头)
    const editorHost = create_element({ tag: 'div' }, { id: RBT_DOM.editorId }, editor.element);

    // 唯一输出区:提示 / 错误 / 性质清单都塞进这一个元素(理由见下面 outputPanel 的说明).
    // 容器只认 id(`#treeOutput` 是 CSS 与冒烟脚本的定位契约),自己不挂类名:
    // 每一行 / 抬头各有自己的类,样式只认它们.初始 hidden 只是挂载前的默认态,
    // 挂载时 rbt.ts 立刻会写入第一轮内容.
    const output = create_element({ tag: 'div' }, { id: RBT_DOM.outputId, hidden: 'hidden' });

    /*
      树这块画布:空的 `<svg>` 根,也是**桌面背景**.

      `width` / `height` 与 viewBox 同值,只为给出宽高比(1.875)让背景层"等比铺满"
      有据可依(见 rbt.css 的 `#rbtTree`:宽高都是 100%,比例由 viewBox +
      preserveAspectRatio 管).`preserveAspectRatio` 是 SVG 默认值,写出来是因为
      它决定了"缩放时不裁切"这件事,改 CSS 尺寸的人得看得见这条前提.
    */
    const tree = create_svg_element(
        { tag: 'svg' },
        {
            id: RBT_DOM.treeId,
            viewBox: RBT_VIEW_BOX,
            preserveAspectRatio: 'xMidYMid meet',
            width: String(RBT_VIEW_BOX_WIDTH),
            height: String(RBT_VIEW_BOX_HEIGHT),
            role: 'img',
            'aria-label': RBT_TREE_LABEL,
        },
    );

    /*
      提示区:两行 span 各自以 <br> 结束.

      它在表达式窗口正文的最前:改表达式时眼睛在编辑器上,提示就贴在它上面
      (与"输出区排在树旁边"同一条:视线不用跨窗口)。
    */
    const hints = create_element(
        { tag: 'div' },
        {},
        create_element({ tag: 'span' }, {}, RBT_HINT_SHORTHAND),
        create_element({ tag: 'br' }),
        create_element({ tag: 'span' }, {}, RBT_HINT_COLOR_LEGEND),
        create_element({ tag: 'br' }),
    );

    /*
      两扇窗口的正文根:各自就是自己的**滚动容器**(`ui-scrollbar` 是库的滚动条类,
      见库的 styles/scrollbar.css -- 滚动条外观是独立的一条规定,组件与它互不认识,
      要不要用由消费者决定).

      为什么正文根就是滚动容器而不是再套一层:库的 `.window-body` 已经把高度裁好,
      窗口边上那圈描边就是内容的框;再套一层"卡片"会多出一圈边框与内边距(与库里
      其余窗口同一条口径,见 miko_ui 的 README "编辑器不滚,宿主滚").
    */
    const editorPanel = create_element(
        { tag: 'div' },
        { class: 'ui-scrollbar', id: RBT_DOM.editorPanelId },
        hints,
        editorHost,
    );
    const outputPanel = create_element(
        { tag: 'div' },
        { class: 'ui-scrollbar', id: RBT_DOM.outputPanelId },
        output,
    );

    const bodies: Readonly<Record<RbtWindowId, readonly Child[]>> = {
        [RBT_WINDOW_EDITOR]: [editorPanel],
        [RBT_WINDOW_PROPERTIES]: [outputPanel],
    };

    /** 窗口 id 守卫:库传进来的是不透明字符串,未知 id 给空内容. */
    const isRbtWindowId = (id: string): id is RbtWindowId => id in bodies;

    return {
        tree,
        content: (id) => (isRbtWindowId(id) ? { body: bodies[id] } : {}),
        editor,
        output,
    };
}
