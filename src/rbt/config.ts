// ================================================================
// 红黑树工具(rbt/rbt.ts)常量配置
//
// 集中 rbt/rbt.ts 里所有"设计参数":DOM 契约,布局几何,结构类名与文案.
// **不再有配色与字体**:树从 canvas 换成 SVG 之后,每一笔都是文档里的元素,颜色 /
// 字号 / 线宽全部回到 CSS(src/rbt/tokens.css 的 `--rbt-*` 令牌 +
// src/rbt/rbt.css 的 `#rbtTree` 区块).从前 `ctx.fillStyle` 读不到 CSS 变量,
// 这套配色只能写死在这里,那是 canvas 的固有代价.
//
// 桌面化(2026-10)之后这里还多一节**窗口清单**:哪些窗口 / 标题叫什么 / 默认几何.
// 那份数据是库的 `mountDesktop` 的构造参数(类型 `WindowConfigEntry`),所以本文件
// 只做一次 type-only 导入 -- 类型归库,值归应用,运行时没有依赖.
// ================================================================

import type { WindowConfigEntry } from 'miko_ui';


// ---------- DOM 契约(id,src/rbt/rbt.css 按它命中) ----------

/**
 * 红黑树控件用到的 DOM 元素 id.
 * 标记由 src/rbt/ui/rbt_views.ts 按本文件的声明生成(id 写入元素再由组件
 * 交回引用);这些常量同时给样式(src/rbt/rbt.css 的 `#rbtEditor` /
 * `#treeOutput` / `#rbtTree` 等)与组件共用.
 *
 * 五个 id 里只有 `#rbtEditor` 是**库组件的宿主**:表达式输入从裸 textarea 换成
 * miko_ui 的 CodeEditor 之后,输入框那一格由库的元素组成(外框 / 行号槽 / 高亮层),
 * 而库的外框自己不滚(宽高都随内容长,滚动归装它的那一层),所以我们的样式命中的是
 * 自己那一格宿主,不是库里面的 textarea -- 库的元素上一个 id 都不加,那会把
 * 消费者的 id 变成库的公开 API(见 miko_ui 的 styles/styles.css 文件头).
 *
 * 另外两个 `*PanelId` 是**窗口正文根**:桌面化之后滚动归窗口正文
 * (见 src/rbt/rbt.css 的"滚动归属"一节),它们是各自窗口里唯一会滚的那一层.
 */
export const RBT_DOM = {
    /**
     * 表达式编辑器宿主 `#rbtEditor`(库的 `.code-editor` 外框长在它里面).
     *
     * 它承担两件事:库不给的外边距与最小高度.滚动**不在**这里 -- 桌面化之后滚的是
     * 窗口正文根(`editorPanelId`),行号槽 `position: sticky; left: 0` 钉在那个滚动区
     * 左边,这正是库要的宿主形态(见 miko_ui 的 styles/editor.css 的"滚动归属").
     */
    editorId: 'rbtEditor',
    /**
     * 唯一输出区的 id:提示 / 错误 / 性质检查清单都写进这一个元素.
     *
     * 不按"提示一个元素,错误一个元素,清单一个元素"分成三块:它们只是同一件事的
     * 不同内容(这一轮要显示什么),没有 stdout / stderr 那种必须分流的语义,
     * 分开写只会多出"谁该显示,谁该隐藏"的互斥维护.现在整块内容每次重建,
     * 行 / 结论 / 抬头的颜色由类名决定(见下面的 RBT_OUTPUT_*_CLASS 与
     * RBT_DIAGNOSTICS_*_CLASS).
     */
    outputId: 'treeOutput',
    /**
     * 树绘制 `<svg>` 根的 id.
     *
     * 从前这里是 `rbCanvas`(canvas 2D).换成 SVG 之后树是**文档里的元素**:
     * 命中检测 / pointer 事件 / CSS transition 全部由浏览器给,颜色能直接引 CSS
     * 令牌(见 src/rbt/tokens.css 的 `--rbt-node-*`),`canvas` 那条路整个不要了.
     * id 由 `canvasId` 改成 `treeId`:名字跟着它现在是什么走,不留一个名不副实的旧 id.
     *
     * 桌面化之后它还是**桌面背景**(见 RBT_DESKTOP_WINDOWS 上方的说明):
     * 这棵 `<svg>` 是所有窗口之下那一层,不再属于任何窗口.
     */
    treeId: 'rbtTree',
    /**
     * 表达式窗口正文根的 id:提示区 + 编辑器宿主都在它里面,滚动也归它.
     *
     * 桌面化之前滚动归 `#rbtEditor`(宿主自己 `overflow-x: auto`);现在窗口正文根
     * 是滚动容器(与库的 `styles/editor.css` 的"滚动归属"一致:编辑器自己不滚),
     * 所以 `#rbtEditor` 只剩外边距与最小高度.
     */
    editorPanelId: 'rbtEditorPanel',
    /**
     * 性质窗口正文根的 id:唯一输出区 #treeOutput 在它里面,滚动归它.
     *
     * 与 `editorPanelId` 分开命名而不是复用同一个 id:同一页只该有一次 id,而这是
     * 两扇窗口各自的正文根,库要按窗口 id 分别 append.
     */
    outputPanelId: 'rbtOutputPanel',
} as const;

// ---------- 桌面窗口(miko_ui 的 mountDesktop) ----------
//
// 从前整块界面是一颗 `createPanel` 的框体:提示 / 编辑器 / 输出区 / 树按顺序堆在
// 同一个正文里.现在同一个内容分成两扇窗口,那棵树搬出窗口、成为**桌面背景** --
// 与 miko_graphcalc 把 3D 视口当桌面背景是同一条做法(见库 `mountDesktop` 的
// `background` 参数):窗口层浮在背景之上,背景铺满整块桌面,窗口没盖住的地方
// 看到的就是它.
//
// 这里声明的是**库的** `DesktopConfig.windows` 要的窗口清单(类型
// `WindowConfigEntry`):id / 标题栏与任务栏文案 / 默认几何 / 最小尺寸.几何用的是
// 库的锚点词汇(x / y / w / h 每轴一个锚点),锚点 -> 绝对像素是库的
// `resolveRelativeGeometries` 纯函数的事,本文件只声明"哪扇窗口大概在哪一栏".
//
// 两扇窗口各占一栏的左右两条边,中间留给背景那棵树:表达式在左(改表达式时眼睛
// 在左边),性质检查在右(结论与树同屏).

/** 表达式窗口的 id(库只把它当 Map 的键,值本身在本文件里当字面量用) */
export const RBT_WINDOW_EDITOR = 'editor';

/** 性质检查窗口的 id(与 RBT_WINDOW_EDITOR 成对,见 ui/rbt_views.ts 的 content) */
export const RBT_WINDOW_PROPERTIES = 'properties';

/** 应用自己的窗口 id 联合:窗口内容表按它收口,漏一扇窗口编译期就报错 */
export type RbtWindowId = typeof RBT_WINDOW_EDITOR | typeof RBT_WINDOW_PROPERTIES;

/**
 * 窗口与桌面上 / 右 / 下边缘的间隙(px).
 *
 * **只有一份**:窗口几何的锚点(`inset`)与库的 `DesktopConfig.edgeGap`(窗口夹取
 * 与边缘吸附用的余量)引的是同一个数 -- 写成两处的话,拖动到边上时"窗口能贴多近"
 * 与"默认离边多远"会各说各话.
 */
export const RBT_DESKTOP_INSET = 16;

/** 窗口默认宽度(px):左右各一栏,中间那条留给桌面背景上的树 */
export const RBT_WINDOW_WIDTH = 420;

/**
 * 两扇窗口的声明(数组顺序 = 任务栏按钮顺序 = 初始 z 序).
 *
 * 高度用的是两种锚点,各有理由:
 * - 表达式窗口按工作区高度的比例(`fraction`):编辑器铺满窗口(见 rbt.css 的
 *   `#rbtEditorPanel`),但整栏高度会把左下方那片桌面背景全盖掉,取一半多一点;
 * - 性质窗口贴到桌面下沿(`from: 'bottom'`):四条性质是固定长度清单,给它"到边"
 *   的高度,清单再长也不出内部滚动条.
 */
export const RBT_DESKTOP_WINDOWS = [
    {
        id: RBT_WINDOW_EDITOR,
        title: '表达式',
        dock: { label: '表达式' },
        defaultGeometry: {
            x: { at: RBT_DESKTOP_INSET },
            y: { at: RBT_DESKTOP_INSET },
            w: { at: RBT_WINDOW_WIDTH },
            h: { fraction: 0.55, of: 'usableHeight' },
        },
        minSize: { w: 300, h: 200 },
    },
    {
        id: RBT_WINDOW_PROPERTIES,
        title: '性质检查',
        dock: { label: '性质' },
        defaultGeometry: {
            x: { from: 'right', inset: RBT_DESKTOP_INSET },
            y: { at: RBT_DESKTOP_INSET },
            w: { at: RBT_WINDOW_WIDTH },
            // h = 桌面高 - inset - y:底边与桌面下沿对齐(同一条规则,不另算一遍)
            h: { from: 'bottom', inset: RBT_DESKTOP_INSET },
        },
        minSize: { w: 300, h: 180 },
    },
] as const satisfies readonly WindowConfigEntry[];

/** 提示区第一行:简写叶子节点说明(可见文本) */
export const RBT_HINT_SHORTHAND = '支持简写叶子节点 (例如 "5R" 等价于 "5R(nil,nil)")';

/**
 * 提示区第二行:配色图例(可见文本).
 * 颜色说明用汉字(红色 / 黒色)而不是彩色圆点:全站不用 emoji.
 * 分隔符两侧是 HTML 的 `&nbsp;`(Unicode 不换行空格 U+00A0),必须原样保留:
 * 这里直接写 `\u00a0` 而不是普通空格,免得不换行语义在纯文本里丢失.
 */
export const RBT_HINT_COLOR_LEGEND = 'R 红色 \u00a0|\u00a0 B 黒色';

/**
 * 表达式编辑器的占位文案(可见文本).
 *
 * 库的 `createCodeEditor` 没有 placeholder 选项(它只认 value / spellcheck /
 * highlight / gutterMinWidth),所以这条由 ui/rbt_views.ts 写在库交回的 textarea 上
 * (`setAttribute`):换掉的是输入控件,提示文案不变.
 */
export const RBT_INPUT_PLACEHOLDER =
    '例: 10B(5R(1B,8R),15R(12B,20B))  或深度4满树示例自动加载';

/**
 * 编辑器行号槽的宽度下限(px),交给 CodeEditor 的 `gutterMinWidth`.
 *
 * 槽的实际宽度由库算("最大行号位数 × 当前字体下的数字宽 + 内边距 / 边框",
 * 且不小于这个下限),所以这里给的是**下限**而不是目标宽度:库的样式表里还有一条
 * 同名的 `--code-gutter-width: 32px` 只是"量出来之前"的初值(见 miko_ui 的
 * styles/tokens.css).表达式通常写成单行,行号只有一位,所以下限就是它的实际宽度.
 */
export const RBT_EDITOR_GUTTER_MIN_WIDTH = 32;

/**
 * 树绘制 `<svg>` 的 viewBox 尺寸(逻辑坐标,单位同 CSS px).
 *
 * 布局算出来的 x / y 就是 **viewBox 坐标系**里的坐标,SVG 自己按
 * `preserveAspectRatio` 缩放进**整块桌面**(见 src/rbt/rbt.css 的 `#rbtTree`),
 * 所以改这两个值 = 换一块更宽 / 更高的画布,不用动任何布局代码.
 */
export const RBT_VIEW_BOX_WIDTH = 1200;
export const RBT_VIEW_BOX_HEIGHT = 640;

/** `<svg>` 的 viewBox 属性值(`min-x min-y width height`,固定从原点起) */
export const RBT_VIEW_BOX = `0 0 ${RBT_VIEW_BOX_WIDTH} ${RBT_VIEW_BOX_HEIGHT}`;

// ---------- 布局几何(单位:viewBox 坐标) ----------

/**
 * 节点圆半径.
 *
 * **与 CSS 里的 `--rbt-node-radius` 必须相等**:半径同时是两件事的输入 --
 * 布局(下面的最小间距 / 安全边距都从它推)与画出来的圆(`<circle r>` 由 CSS 给,
 * 见 src/rbt/rbt.css 的 `#rbtTree .rbt-node__shape`).TS 侧算的是位置,CSS 侧画的是大小,
 * 两边不一致的表现是节点之间该留的空没留够(而不是报错).
 */
export const RBT_NODE_RADIUS = 22;

/** 相邻两层的垂直步长(像素) */
export const RBT_Y_STEP = 70;

/** 根节点所在的 y 坐标(像素,顶部留白) */
export const RBT_START_Y = 65;

/** 最小水平间距 = 半径 × 2.2(≈ 48px),避免节点圆重叠 */
export const RBT_MIN_HORIZONTAL_GAP = RBT_NODE_RADIUS * 2.2;

/** 画布左右安全边距 = 半径 + 16px */
export const RBT_SIDE_MARGIN = RBT_NODE_RADIUS + 16;

/** 单侧子树预留的最小宽度系数(× minHorizontalGap) */
export const RBT_MIN_CHILD_WIDTH_FACTOR = 0.8;

/** 单孩子节点偏向另一侧的收缩系数(× minHorizontalGap) */
export const RBT_SINGLE_CHILD_GAP_FACTOR = 0.6;

/** 位置钳制的容差(像素):允许节点略微越出安全边距 */
export const RBT_CLAMP_TOLERANCE = 5;

// ---------- 节点与连线:类名契约(观感全在 CSS) ----------
//
// 从 canvas 换成 SVG 之后,**树的每一笔都是文档里的元素**,于是配色 / 字号 / 线宽
// 全部回到 CSS(引 src/rbt/tokens.css 的 `--rbt-*` 令牌),TS 侧一个色值都不留 --
// 这正是不用 canvas 的最大收益:`ctx.fillStyle` 读不到 CSS 变量,从前那套红黑配色
// 只能写死在 config 里.现在 config 只声明**类名**(选择器锚点),观感去样式表改.
//
// 类名同时是跨语言契约:scripts/smoke_home.mjs 在真浏览器里按 `.rbt-node--red`
// 数红节点,按 `.rbt-edge` 数连线,所以它们不能只因为"CSS 里看着没用"就删.

/** 一个节点的组(位置在它的 `transform` 上;圆与文字是它的两个孩子) */
export const RBT_NODE_CLASS = 'rbt-node';

/** 节点圆的类名(半径 / 描边 / 填充 / 进入动画都在它上面) */
export const RBT_NODE_SHAPE_CLASS = 'rbt-node__shape';

/** 节点值的类名(字体 / 字号 / 对齐 / 文字色) */
export const RBT_NODE_LABEL_CLASS = 'rbt-node__label';

/** 红节点的修饰类(挂在节点组上,不挂在圆上:组是"这个节点"的语义单位) */
export const RBT_NODE_RED_CLASS = 'rbt-node--red';

/** 黑节点的修饰类(与红色成对,见 RBT_NODE_RED_CLASS) */
export const RBT_NODE_BLACK_CLASS = 'rbt-node--black';

/** 父子连线的类名(`<line>` 的描边与线宽在 CSS) */
export const RBT_EDGE_CLASS = 'rbt-edge';

// ---------- 表达式词法着色:类名契约(样式在 src/rbt/rbt.css) ----------
//
// 表达式编辑器的高亮 HTML 由 ui/rbt_highlight.ts 产出,注入给 miko_ui 的 CodeEditor.
// 库的高亮层只做一件事:把注入的 `highlight(source)` 产物显示在透明 textarea 背后
// (见 miko_ui 的 editor/EditorHighlight 文件头)-- 它不认识任何语言的词法,也知道
// 自己不该认识,所以"哪个词是什么"与"它是什么颜色"都在我们这一侧:类名在这里声明,
// 配色在 src/rbt/tokens.css 的 `--rbt-token-*`.
//
// 这几个类名是**跨语言契约**:rbt_highlight.ts 产出它们,rbt.css 按它们命中,
// rbt_highlight.test.ts 断言它们,改名要三处一起改(没有编译期保护).

/** 节点值的类名(表达式里 `10B` 的那个 `10`) */
export const RBT_TOKEN_VALUE_CLASS = 'rbt-token--value';

/** 红色节点标记 `R` 的类名 */
export const RBT_TOKEN_RED_CLASS = 'rbt-token--red';

/** 黑色节点标记 `B` 的类名 */
export const RBT_TOKEN_BLACK_CLASS = 'rbt-token--black';

/** 空树写法 `nil` 的类名(大小写不敏感,解析器三种写法都收) */
export const RBT_TOKEN_NIL_CLASS = 'rbt-token--nil';

/** 结构符号 `(` / `)` / `,` 的类名 */
export const RBT_TOKEN_PUNCT_CLASS = 'rbt-token--punct';

// ---------- 输出区(提示 / 错误 / 性质清单共用一套类名) ----------
//
// 表达式先过**格式检查**(解析器):过了才有树可查性质,没过就在输出区出一行错误.
// 输出区只有一个(#treeOutput),下面这些类名决定每一行的角色与颜色.

/** 中性提示行的类名(空输入 / 空树;颜色见 src/rbt/rbt.css 的 .tree-hint) */
export const RBT_OUTPUT_HINT_CLASS = 'tree-hint';

/** 错误行的类名(解析失败;颜色见 src/rbt/rbt.css 的 .tree-error) */
export const RBT_OUTPUT_ERROR_CLASS = 'tree-error';

// ---------- 性质检查(清单行) ----------

/**
 * 单条性质的类名(行为代码每渲染一次清单就整批重建这些节点).
 * 消费方是 scripts/smoke_home.mjs:它在真浏览器里按 `#treeOutput .tree-property`
 * 数行数,所以这个类名是**跨语言契约**,不能只按"CSS 里没用到"就删.
 */
export const RBT_DIAGNOSTICS_ROW_CLASS = 'tree-property';

/** 单条性质里"结论"那一段的类名(状态色挂在它上面) */
export const RBT_DIAGNOSTICS_STATE_CLASS = 'tree-property-state';

/** 清单抬头那一段的类名(样式见 src/rbt/rbt.css 的 `#treeOutput`) */
export const RBT_DIAGNOSTICS_SUMMARY_CLASS = 'tree-property-summary';

/**
 * 清单抬头模板(可见文本).
 *
 * `{total}` 换成性质总条数,`{failed}` 换成FAIL 的条数 -- 两处都在代码里算,
 * 所以"加一条性质"或"改文案"都只动这一个地方,不会出现抬头写着 4 条,
 * 清单里其实 5 行这种对不上的情况.
 */
export const RBT_PROPERTY_SUMMARY = '红黑树性质检查: {total} 条中 {failed} 条 FAIL';

/** 单条性质 PASS 时的结论文本 */
export const RBT_PROPERTY_STATE_PASS = 'PASS';

/** 单条性质 FAIL 时的结论文本 */
export const RBT_PROPERTY_STATE_FAIL = 'FAIL';

// ---------- 性质检查:逐条的出错文案 ----------
//
// 这几条是**出错位置**的模板,由 rbt_tree.ts 填占位符后显示在清单里.
// 占位符有两种:`{node}` 换成"值+颜色"(如 `11R`),数字占位符换成算出来的数.

/** 根节点是红色 */
export const RBT_ROOT_RED_DETAIL = '根节点 {node} 是红色';

/** 红节点底下挂了红孩子 */
export const RBT_RED_CHILD_DETAIL = '红节点 {node} 的孩子是红色';

/**
 * 各路径黑高不一致.
 * `{expected}` 是较浅那侧的黑高,`{actual}` 是较深那侧(含多出来的那层).
 */
export const RBT_BLACK_HEIGHT_DETAIL =
    '节点 {node} 两侧黑高不同: 较浅一侧 {expected},较深一侧 {actual}';

/** 二叉搜索树有序性不成立 */
export const RBT_BST_ORDER_DETAIL = '以 {node} 为根的子树不满足左小右大';

/** 性质定义(清单顺序 = 检查顺序 = 界面顺序) */
export interface RbtPropertySpec {
    /** 稳定 id,行为代码按它取对应的检查函数(见 rbt_tree.ts 的 PROPERTY_CHECKS) */
    readonly id: string;
    /** 界面上的性质名(可见文本) */
    readonly label: string;
}

/**
 * 四条性质,顺序即检查顺序.
 *
 * 前三条是红黑树的定义(CLRS 那五条里会被表达式破坏的那些),第四条是"红黑树"
 * 这名字里的另一半:
 *
 * 1. 根是黑色;
 * 2. 红节点的孩子都是黑色(含"红节点直接接 nil" -- nil 是黑的,但那样这条路径
 *    上红节点底下没有黑节点,形状上已经不对);
 * 3. 任一节点到其后代 nil 叶子的所有路径上黑节点数相同(黑高一致);
 * 4. 二叉搜索树有序(左子树全部小于节点,右子树全部大于节点).
 *
 * 第 4 条不是红黑性质,是手打表达式最常见的错(层级对了而值乱序);单独列一条,
 * 文案写的是"二叉搜索树有序",不混进上面那三条.
 *
 * 少了 CLRS 里另外两条,原因不是"没实现"而是**结构上不可能违反**:
 * - "每个节点非红即黑":颜色写在表达式里,解析器只收 R / B;
 * - "nil 叶子是黑色":解析器不建 nil 节点(用 null 表示),颜色恒为黑;
 * - "每个节点要么两个子节点都不是 nil,要么都是":括号表达式必须写两个子树
 *   (`5B(1B,2B)`),单孩子写法 `5B(1B)` 在解析阶段就报"缺少逗号",到不了性质检查.
 * 列一条永远 PASS 的条目只会让清单看着更长,所以不列;哪天支持了单孩子写法,
 * 再把那条加回来.
 *
 * `as const` 让 id 收窄成字面量联合:`rbt_tree.ts` 的 PROPERTY_CHECKS 用
 * `Record<id 联合, 检查函数>` 收口,清单增删一条而检查函数没跟上会**编译报错**,
 * 而不是等到某个输入把它变成 undefined 调用.
 */
export const RBT_PROPERTIES = [
    { id: 'root-black', label: '根节点为黑色' },
    { id: 'red-no-red-child', label: '红色节点不可相邻' },
    { id: 'black-height', label: '各路径黑色节点数量相同' },
    { id: 'bst-order', label: '二叉搜索树有序' },
] as const satisfies readonly RbtPropertySpec[];

/**
 * 二叉搜索树有序性的比较容差.
 *
 * 只用来兜住浮点写法(如 `0.1 + 0.2` 那类值在字符串里看不出误差)与整数写法
 * 混用时的边界;相等值(左右子树出现和祖先同一个值)仍然判 FAIL,所以容差取
 * 极小值,不会把"值重复"放过.
 */
export const RBT_COMPARISON_TOLERANCE = 1e-9;

// ---------- 占位文案 ----------

/** 空输入时的提示文案(可见文本,全站不用 emoji;写成 #treeOutput 里的提示行) */
export const RBT_EMPTY_HINT_TEXT =
    '请输入红黑树表达式 (例如: 13B(8R(1B,11R),17R(15B,25B)))';

/**
 * 表达式解析成空树(`nil`)时的提示文案(同上,写成 #treeOutput 里的提示行).
 *
 * 与"没输入"分开一条:用户确实敲了东西(`nil` 是合法空树),再回一句
 * "请输入红黑树表达式"会答非所问;画布上那时是空的,得说清为什么空.
 */
export const RBT_EMPTY_TREE_HINT_TEXT = '表达式是空树 (nil),画布上没有节点';

/** 错误提示在 UI 上显示时的前缀(不用符号 / 表情,直接用字说明) */
export const RBT_ERROR_UI_PREFIX = '错误: ';

// ---------- 默认示例 ----------

/** 打开页面时自动加载的深度为 4 的满二叉树示例(挂载函数写进输入框) */
export const RBT_TREE_EXAMPLE =
    "15B(7R(3B(1R(0B,2B),5R(4B,6B)),11B(9R(8B,10B),13R(12B,14B))),23R(19B(17R(16B,18B),21R(20B,22B)),27B(25R(24B,26B),29R(28B,30B))))";

// ---------- 解析器使用的字符与哨兵 ----------

/** 表示空节点的字符串(小写) */
export const RBT_NIL = 'nil';

/** R/B 颜色标记字符(红) */
export const RBT_COLOR_RED = 'R';

/** R/B 颜色标记字符(黑) */
export const RBT_COLOR_BLACK = 'B';

/** 节点表达式里的左括号 */
export const RBT_LEFT_PAREN = '(';

/** 节点表达式里的右括号 */
export const RBT_RIGHT_PAREN = ')';

/** 左右子树的分隔逗号 */
export const RBT_COMMA = ',';

/** 简写叶子自动补全的后缀:值+颜色(nil,nil) */
export const RBT_LEAF_SUFFIX = '(nil,nil)';

/** 节点简写的最小长度(至少 1 位值 + 1 位颜色) */
export const RBT_MIN_SHORTHAND_LENGTH = 2;

// ---------- 可见文案(解析错误信息,与界面一字不差) ----------

/** 简写节点过短时的错误文案前缀 */
export const RBT_ERR_SHORTHAND_TOO_SHORT = '无效节点简写: "';

/** 简写节点过短时的错误文案后缀 */
export const RBT_ERR_SHORTHAND_TOO_SHORT_SUFFIX = '",需要例如 "5R" 或 "13B"';

/** 简写节点缺少 R/B 结尾时的错误文案前缀 */
export const RBT_ERR_SHORTHAND_NO_COLOR = '简写节点必须用 R/B 结尾,错误: "';

/** 节点格式错误时的错误文案前缀 */
export const RBT_ERR_NODE_FORMAT = '节点格式错误: 至少包含值和颜色(如 13B), 实际: ';

/** 颜色标记错误时的错误文案前缀 */
export const RBT_ERR_COLOR_MARK = '颜色标记必须是 R 或 B, 错误部分: ';

/** 括号不匹配时的错误文案前缀 */
export const RBT_ERR_UNBALANCED = '括号不匹配: ';

/**
 * 括号表达式配平之后还有多余字符时的错误文案前缀.
 *
 * 为什么要单列一条:括号配平只说明"这一段括号对上了",不说明"整串就是这一个
 * 表达式".少了这条检查,`5B(1B,2B)junk` 会被当成合法的 5B 树,多余输入静默丢弃.
 */
export const RBT_ERR_TRAILING = '表达式末尾有多余内容: ';

/** 缺少逗号时的错误文案前缀 */
export const RBT_ERR_NO_COMMA = '子树格式错误: 缺少逗号分隔左右子树, 内部: ';

/** 解析失败时的错误文案前缀 */
export const RBT_ERR_PARSE_FAILED = '解析失败: ';
