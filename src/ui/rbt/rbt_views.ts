/*
红黑树工具的**桌面视图组件**(声明式):按 config.ts 的声明产出桌面背景(平面视口 + 树
的 `<svg>` + 世界层)与两扇窗口的正文节点,由 src/ui/rbt/rbt.ts 的 `mountRBT` 交给库的
`mountDesktop` 装配.

本模块是纯函数:不读页面,不改全局,不绑业务事件,只把"描述"变成元素并把行为代码要用
的引用一起交回;装配桌面、绑视口手势都是 rbt.ts 的事.
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
    RBT_HINT_BOX_CLASS,
    RBT_HINT_COLOR_LEGEND,
    RBT_HINT_SHORTHAND,
    RBT_HINT_VIEWPORT,
    RBT_INPUT_PLACEHOLDER,
    RBT_WINDOW_EDITOR,
    RBT_WINDOW_PROPERTIES,
    RBT_WORLD_CLASS,
    type RbtWindowId,
} from '@/ui/rbt/config';
import { highlightRbtExpression } from '@/ui/rbt/rbt_highlight';

/** 树那块画布的读屏标签(它不是纯装饰:画的是这一轮解析出来的树). */
const RBT_TREE_LABEL = '红黑树结构图';

/** 红黑树桌面视图:桌面背景 + 两扇窗口的正文 + 行为代码要用的元素引用 */
export interface RbtViews {
    /**
     * 平面视口 #rbtViewport:交给库当**桌面背景**的那颗节点(挂 `.desktop-background`).
     *
     * 它**不在任何窗口里**,由 `mountDesktop` 直接 append 到桌面根上 -- 这就是"树是
     * 背景"这句话在 DOM 上的全部含义.裁切 / 光标 / 指针手势(拖动平移、滚轮缩放)都
     * 归这一层.
     */
    readonly viewport: HTMLElement;
    /**
     * 那棵树的 `<svg>` 根 #rbtTree(1:1 的像素画布,没有 viewBox).
     *
     * 它长在视口里,自己**不做缩放**:世界坐标 -> 屏幕像素的缩放全归世界层的
     * `transform`.树上的结构(节点 / 连线)不在这里,见 `world`.
     */
    readonly tree: SVGSVGElement;
    /**
     * 世界层 `<g class="rbt-world">`:树上一切(连线 / 节点)的父节点,也是视口唯一
     * 改动的那一层(`transform = translate(x y) scale(k)`).
     *
     * 行为代码每轮 `replaceChildren` 整批重建它的子节点;视口句柄改它的 transform.
     * 这里只给一个**空的** `<g>`:标记里不带任何结构,画什么由 rbt.ts 按布局结果给.
     */
    readonly world: SVGGElement;
    /**
     * 逐窗口内容:库的 `mountDesktop` 按窗口 id 现取一次.
     *
     * 未知 id 给空内容而不是 undefined:库传进来的是不透明字符串,窗口清单增删一扇
     * 而这张表没跟上时,坏的应该只是那一扇窗口,不是整个装配.
     */
    readonly content: (id: string) => WindowContentSpec;
    /**
     * 表达式编辑器句柄(库的 `CodeEditorHandle`).
     *
     * 行为代码只从它拿两样东西:`textarea`(值的唯一真相源,读 `value` / 绑 `input`)
     * 与 `refresh()`(程序化改写 `value` 之后重算行号与高亮 -- 直接赋值不派发 input
     * 事件,装饰层不会自己更新).`dispose()` 只在同一颗宿主被重复挂载时由 rbt.ts 调.
     */
    readonly editor: CodeEditorHandle;
    /** 唯一输出区 #treeOutput(初始 hidden,内容由 rbt.ts 每次整批重建) */
    readonly output: HTMLElement;
}

/** 按 config.ts 的声明式模型生成桌面背景与逐窗口内容 */
export function createRbtViews(): RbtViews {
    /*
      表达式编辑器:库的外框 + 行号 + 高亮层,挂在我们自己那一格宿主 `#rbtEditor` 里.

      三件由这里给、库不给的事:`highlight`(分词是我们的,库不认识红黑树表达式)、
      `gutterMinWidth`(槽宽下限是我们的字号口径)、`placeholder`(库没有这个选项,
      建完再写回 textarea 上).初值留空:示例由 mountRBT 用库的 `seedTextareaSource`
      种进去,那样"标记生成"与"载入示例"各归各的那一层.
    */
    const editor = createCodeEditor({
        spellcheck: false,
        highlight: highlightRbtExpression,
        gutterMinWidth: RBT_EDITOR_GUTTER_MIN_WIDTH,
    });
    editor.textarea.setAttribute('placeholder', RBT_INPUT_PLACEHOLDER);

    // 编辑器宿主:占满窗口正文的高度,滚动归窗口正文根
    const editorHost = create_element({ tag: 'div' }, { id: RBT_DOM.editorId }, editor.element);

    // 唯一输出区:提示 / 错误 / 性质清单都塞进这一个元素.容器只认 id(`#treeOutput`
    // 是 CSS 与冒烟脚本的定位契约),自己不挂类名:每一行 / 抬头各有自己的类.初始
    // hidden 只是挂载前的默认态,挂载时 rbt.ts 立刻会写入第一轮内容.
    const output = create_element({ tag: 'div' }, { id: RBT_DOM.outputId, hidden: 'hidden' });

    /*
      桌面背景:平面视口(#rbtViewport)→ 画布(svg#rbtTree)→ 世界层(g.rbt-world).

      三层各只有一件事:**视口**铺满桌面、裁切、收指针事件(定位与底色来自库的
      `.desktop-background`,画什么与尺寸归我们);**画布**是 1:1 的像素面 -- 没有
      viewBox,也没有 width/height 属性(尺寸由 CSS 给 100%,一个用户单位就是一个
      CSS 像素),所以布局算出来的坐标就是屏幕像素;**世界层**是树上一切的父节点,
      世界坐标只在这一层的 transform 里被换算.空着建出来,是因为"层"属于标记结构
      (视口要长期引用它),而"画什么"属于每轮重建的内容.

      `role` / `aria-label` 挂在整颗背景 svg 上:视口是可交互的(拖动 / 缩放),而它
      画的是这一轮解析出来的树,读屏该说清"这里是什么".
    */
    const world = create_svg_element({ tag: 'g' }, { class: RBT_WORLD_CLASS });
    const tree = create_svg_element(
        { tag: 'svg' },
        {
            id: RBT_DOM.treeId,
            role: 'img',
            'aria-label': RBT_TREE_LABEL,
        },
        world,
    );
    const viewport = create_element(
        { tag: 'div' },
        { id: RBT_DOM.viewportId, class: 'desktop-background' },
        tree,
    );

    /*
      提示区:静态说明,外框认 config 的 RBT_HINT_BOX_CLASS.

      它排在**性质检查窗口**正文的最前(输出区之上):三行说明与这一轮的输入无关,
      跟"结果"放同一栏,表达式窗口因此只剩编辑器,整窗高度都是输入区.第三行(平面
      怎么动)也在这里:拖动 / 滚轮没有控件,回正按钮在任务栏里,文案点了它的名并
      说清位置.
    */
    const hints = create_element(
        { tag: 'div' },
        { class: RBT_HINT_BOX_CLASS },
        create_element({ tag: 'span' }, {}, RBT_HINT_SHORTHAND),
        create_element({ tag: 'br' }),
        create_element({ tag: 'span' }, {}, RBT_HINT_COLOR_LEGEND),
        create_element({ tag: 'br' }),
        create_element({ tag: 'span' }, {}, RBT_HINT_VIEWPORT),
        create_element({ tag: 'br' }),
    );

    /*
      两扇窗口的正文根:各自就是自己的**滚动容器**(`ui-scrollbar` 是库的滚动条类,
      见库的 styles/scrollbar.css -- 滚动条外观是独立的一条规定,要不要用由消费者
      决定).

      不套一层"卡片":库的 `.window-body` 已经把高度裁好,窗口边上那圈描边就是内容
      的框,再套一层会多出一圈边框与内边距.两扇窗口各一根正文根,不合并:库按窗口 id
      分别 append,而"一扇窗口一条滑条"要求滑条就在窗口边上(见 rbt.css 的"窗口正文").
    */
    const editorPanel = create_element(
        { tag: 'div' },
        { class: 'ui-scrollbar', id: RBT_DOM.editorPanelId },
        editorHost,
    );
    const outputPanel = create_element(
        { tag: 'div' },
        { class: 'ui-scrollbar', id: RBT_DOM.outputPanelId },
        hints,
        output,
    );

    const bodies: Readonly<Record<RbtWindowId, readonly Child[]>> = {
        [RBT_WINDOW_EDITOR]: [editorPanel],
        [RBT_WINDOW_PROPERTIES]: [outputPanel],
    };

    /** 窗口 id 守卫:库传进来的是不透明字符串,未知 id 给空内容. */
    const isRbtWindowId = (id: string): id is RbtWindowId => id in bodies;

    return {
        viewport,
        tree,
        world,
        content: (id) => (isRbtWindowId(id) ? { body: bodies[id] } : {}),
        editor,
        output,
    };
}
