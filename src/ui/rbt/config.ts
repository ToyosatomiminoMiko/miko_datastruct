// 红黑树工具的显示层配置:DOM 契约、桌面窗口清单、提示文案、布局几何参数与输出区文案.
//
// 这里只放"显示"这一侧的值:性质 id 的顺序归核心层(src/datastruct/rbt/rbt_tree.ts),
// 本文件只为 id 配中文名;配色 / 字号 / 线宽在 src/ui/rbt/tokens.css 与 rbt.css 的
// `--rbt-*` 令牌里,本文件不含色值.

import type { DockActionSpec, WindowConfigEntry } from 'miko_ui';
import { RBT_PROPERTY_IDS, type RbtPropertyId } from '@/datastruct/rbt/rbt_tree';

// DOM 契约(id 由 src/ui/rbt/rbt.css 命中)

/**
 * 红黑树控件用到的 DOM 元素 id:标记由 src/ui/rbt/rbt_views.ts 按这里的声明生成,
 * 样式(rbt.css)与组件共用.
 *
 * `#rbtEditor` 是库 CodeEditor 的宿主:库的外框自己不滚(宽高随内容长),所以样式
 * 命中的是我们自己那一格宿主,不是库内部的元素 -- 库不往元素上加 id,那会把消费者
 * 的 id 变成库的公开 API.
 */
export const RBT_DOM = {
    /**
     * 平面视口 `#rbtViewport`:桌面背景那一层,里面只有那棵树的 `<svg>`.
     *
     * 裁切、光标、指针手势(拖动 / 滚轮)都归这一层,svg 则是 1:1 的绘制面:库要求
     * 背景节点挂 `.desktop-background`,而 div 的裁切与 `touch-action` 比 SVG 根更
     * 少歧义.
     */
    viewportId: 'rbtViewport',
    /**
     * 表达式编辑器宿主 `#rbtEditor`:库的 `.code-editor` 外框长在它里面.
     *
     * 它承担库不给的一件事:**占满窗口正文的高度**(库外框的 `min-height: 100%` 要有
     * 高度确定的宿主才解析得出).滚动归窗口正文根,行号槽 `position: sticky` 钉在
     * 那个滚动区左边.
     */
    editorId: 'rbtEditor',
    /**
     * 唯一输出区的 id:提示 / 错误 / 性质检查清单都写进这一个元素.
     *
     * 不分成三块:它们只是同一件事的不同内容,没有 stdout / stderr 那种必须分流的
     * 语义,分开写只会多出"谁该显示,谁该隐藏"的互斥维护.行 / 结论 / 抬头的颜色由
     * 类名决定(见 RBT_OUTPUT_*_CLASS 与 RBT_DIAGNOSTICS_*_CLASS).
     */
    outputId: 'treeOutput',
    /**
     * 树绘制 `<svg>` 根的 id:世界坐标的画布,不是视口.
     *
     * 没有 viewBox,宽高由视口那一层给(`100%`),一个用户单位就是一个 CSS 像素;树挂
     * 在里面唯一的世界层 `<g>` 上,视口改的是那一层的 transform(见 RBT_WORLD_CLASS).
     * 用 SVG 而不是 canvas:节点与连线是文档里的元素,命中检测 / pointer 事件 /
     * CSS transition 与令牌着色都由浏览器给.
     */
    treeId: 'rbtTree',
    /**
     * 表达式窗口正文根的 id:**只有**编辑器宿主 `#rbtEditor` 在它里面,滚动也归它.
     *
     * 编辑器自己不滚(与库的 styles/editor.css 的"滚动归属"一致),所以 `#rbtEditor`
     * 只负责占满窗口高度.提示区是静态说明,不在这一扇窗口里.
     */
    editorPanelId: 'rbtEditorPanel',
    /**
     * 性质窗口正文根的 id:提示区 + 唯一输出区 #treeOutput 都在它里面,滚动归它.
     *
     * 与 `editorPanelId` 分开命名:同一页只该有一次 id,而这是两扇窗口各自的正文根,
     * 库要按窗口 id 分别 append.
     */
    outputPanelId: 'rbtOutputPanel',
} as const;

// 桌面窗口(miko_ui 的 mountDesktop 的 windows 清单)
//
// 两扇窗口各装什么(见 ui/rbt/rbt_views.ts):表达式窗口只有编辑器宿主;性质检查
// 窗口是提示区在上、唯一输出区 #treeOutput 在下.树不在窗口里,它是桌面背景(库的
// `mountDesktop` 的 `background` 参数),窗口没盖住的地方看到的就是树.
//
// 几何用的是库的锚点词汇(x / y / w / h 每轴一个锚点),锚点 -> 绝对像素是库的
// `resolveRelativeGeometries` 纯函数的事,本文件只声明"哪扇窗口大概在哪一栏".两扇
// 窗口各占一栏的左右两条边,中间留给背景那棵树:表达式在左,性质检查在右.

/** 表达式窗口的 id(库只把它当 Map 的键,值本身在本文件里当字面量用) */
export const RBT_WINDOW_EDITOR = 'editor';

/** 性质检查窗口的 id */
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

// 任务栏里的回正按钮
//
// 回正是**显式按钮**,不是双击手势:双击判定只看两次按下的时间间隔 -- 不看位置、
// 中键也参与计时、拖动也会留下第一次按下 -- 误触发多,而且"回正"这种明确的动作
// 没有理由藏在一个不可见的手势里.
//
// 它挂在**库的任务栏**里:树是桌面背景,窗口只是压在它上面的操作框,被移开 /
// 最小化之后背景仍然在 -- "回到看得见"因此是**桌面级**动作,该和「全部还原」并排.
// 库的 `DesktopConfig.dockActions` 就是这类动作的正式入口:清单在本文件(纯数据),
// 点击由 ui/rbt/rbt.ts 的 `onDockAction` 按 id 分派,按钮与位置由库装配(整组排
// 在「全部还原」左边) -- 应用不按库的 DOM 结构自己塞按钮.

/**
 * 回正按钮的文案(可见文本).
 *
 * "回正"是应用层叫法,语义由 ui/rbt/rbt_viewport.ts 的 `fitViewport()` 定义:
 * 按最近一次内容包围盒重新适应视口,并把自动适应接回来.
 */
export const RBT_FIT_BUTTON_TEXT = '回正视图';

/** 回正按钮的 `title` / 悬停说明:按钮文案之外的第二层解释 */
export const RBT_FIT_BUTTON_TITLE = '把整棵树装回视口并居中,之后重绘继续自动适应';

/**
 * 回正动作的 id:库把它写成按钮的 `data-dock-action`,点击时原样交回
 * `onDockAction` -- 库不解释它,应用内唯一即可.
 */
export const RBT_FIT_ACTION_ID = 'fit-viewport';

/**
 * 任务栏动作清单:交给库 `mountDesktop` 的 `dockActions`.
 *
 * 清单是唯一真相源(顺序即显示顺序),库按它建按钮并整组排在「全部还原」左边;
 * 文案 / 悬停提示是上面的两个常量,id 是 `onDockAction` 的分派键.
 */
export const RBT_DOCK_ACTIONS = [
    { id: RBT_FIT_ACTION_ID, text: RBT_FIT_BUTTON_TEXT, title: RBT_FIT_BUTTON_TITLE },
] as const satisfies readonly DockActionSpec[];

// 提示区(性质检查窗口正文顶部那静态说明)
//
// 提示区是**静态文案**:简写语法与配色图例说的是"这套表达式怎么读",与这一轮的
// 输入无关,所以它不进 #treeOutput(那里每轮整批重建),而是排在性质检查窗口正文的
// 最前、输出区之上.表达式窗口只留编辑器,整扇窗口的高度都给输入区.

/**
 * 提示区外框的类名(样式见 src/ui/rbt/rbt.css 的 `.rbt-hints`).
 *
 * 不能复用 `RBT_OUTPUT_HINT_CLASS`(`tree-hint`):那个类名是"这一轮的输出是一行
 * 提示"的语义,行为测试按它数 #treeOutput 里的行数,挂到这块静态说明上会让
 * "空输入只有一行提示"这类断言多出两行.
 */
export const RBT_HINT_BOX_CLASS = 'rbt-hints';

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
 * 提示区第三行:背景平面的操作说明(可见文本).
 *
 * 平面视口的两条手势(拖动平移 / 滚轮缩放)**在界面上没有控件**,不写出来就只能
 * 靠用户乱试;回正虽然是按钮,也在任务栏里,所以文案要点出位置("任务栏"),否则
 * 读这几行说明的人会往窗口正文里找.
 */
export const RBT_HINT_VIEWPORT =
    `背景平面:拖动平移、滚轮缩放;点任务栏里的「${RBT_FIT_BUTTON_TEXT}」把树装回视口`;

/**
 * 表达式编辑器的占位文案(可见文本).
 *
 * 库的 `createCodeEditor` 没有 placeholder 选项(它只认 value / spellcheck /
 * highlight / gutterMinWidth),所以这条由 ui/rbt/rbt_views.ts 写在库交回的 textarea
 * 上(`setAttribute`).
 */
export const RBT_INPUT_PLACEHOLDER =
    '例: 10B(5R(1B,8R),15R(12B,20B))  或深度4满树示例自动加载';

/**
 * 编辑器行号槽的宽度下限(px),交给 CodeEditor 的 `gutterMinWidth`.
 *
 * 槽的实际宽度由库算("最大行号位数 × 当前字体下的数字宽 + 内边距 / 边框",且不小于
 * 这个下限),所以这里给的是**下限**;表达式通常写成单行,行号只有一位,下限就是它
 * 的实际宽度.
 */
export const RBT_EDITOR_GUTTER_MIN_WIDTH = 32;

// 平面与视口(世界坐标 -> 屏幕像素)
//
// 布局算出来的 x / y 就是平面坐标(单位 = 屏幕像素 @ k=1):`<svg>` 没有 viewBox,
// 1 用户单位 = 1 CSS 像素.树上的一切(连线 / 节点)挂在一层 `<g class="rbt-world">`
// 里,视口只改这一层的 `transform = translate(x y) scale(k)`;世界坐标是内容自己的
// 坐标,与"桌面多大"无关,所以平面是无限大的(裁剪由视口给).不画网格 / 轴 / 刻度,
// 平面的底色就是桌面底色(见 rbt.css).
//
// 布局**不需要知道平面多大**:它只保证"同层相邻节点的中心距不小于
// RBT_MIN_HORIZONTAL_GAP"(见 ui/rbt/rbt_layout.ts);内容实际占多大由渲染层落笔后
// 向浏览器要 `getBBox()`(见 ui/rbt/rbt_render.ts),视口再按它适应.

/** 适应视口时内容四周的留白(px,屏幕像素):树不贴着视口边缘 */
export const RBT_PLANE_FIT_PADDING = 48;

/**
 * 自动适应(fit)时允许的最大缩放:1 = 不放大.
 *
 * 三节点的小树,包围盒比视口小得多,不设上限的话首屏会把它吹成一屏大的三个圆.
 * 1:1 是这类结构图最自然的默认观感.
 *
 * 已知的坑:窗口是浮在背景上的,适应算不进窗口,所以"装得下"不等于"看得见" --
 * 放大到填满时,左右两端的节点会钻到两侧窗口底下;1:1 反而让整棵树落在两扇窗口
 * 中间那条可见带上.要看大就自己滚轮放大(手动缩放的窗口见 RBT_MIN_ZOOM /
 * RBT_MAX_ZOOM).
 */
export const RBT_FIT_MAX_ZOOM = 1;

/** 手动缩放的上下限:下限够看很深的树(256 片叶子 ≈ 0.08),上限够盯一个节点 */
export const RBT_MIN_ZOOM = 0.05;
export const RBT_MAX_ZOOM = 4;

/**
 * 滚轮灵敏度:像素 delta 每 1px,缩放 `e^(-delta × 这个值)` 倍.
 *
 * 用指数而不是加法:缩放是**乘性**的,同样一格滚轮在 0.1 与 2 两档下该放大同样的
 * 比例(加法在 0.1 档下一格跳一大截,在 2 档下几乎不动).0.0015 让一格 100px 的
 * 滚轮 ≈ 1.16 倍.
 */
export const RBT_WHEEL_ZOOM_SENSITIVITY = 0.0015;

/**
 * wheel 事件的 deltaMode 归一化:把"行 / 页"折算成像素.
 *
 * 为什么必须折:同一个滚轮在 Chrome 上是 `deltaMode = 0`(像素,一格约 100),在
 * Firefox 上是 `deltaMode = 1`(行,一格 3) -- 不折的话 Firefox 上一格只放大
 * 0.5%,等于不响应.两个数按各自的常见约定取值,不追求精确,只求量级一致.
 */
export const RBT_WHEEL_LINE_PIXELS = 16;
export const RBT_WHEEL_PAGE_PIXELS = 800;

/**
 * 世界层的类名:树上所有连线 / 节点都挂在这一层 `<g>` 里,视口只改它的 transform.
 *
 * 它是**跨语言契约**:ui/rbt/rbt_views.ts 建它,测试按它断言"结构与世界坐标对得
 * 上";样式表对世界层没有规则,那是刻意的.
 */
export const RBT_WORLD_CLASS = 'rbt-world';

// 布局几何(单位:平面坐标 = 屏幕像素 @ 缩放 1)
//
// 只有两个数:层距、同层最小中心距.没有画布尺寸 / 安全边距 / 越界钳制:布局只回答
// "节点彼此别撞";圆多大是 CSS(`--rbt-node-radius`)的事,内容实际占多大由渲染层
// 落笔后向浏览器要 `getBBox()`(见 ui/rbt/rbt_render.ts).

/** 相邻两层的垂直步长(px):根在 y = 0,深一层加一个步长 */
export const RBT_Y_STEP = 70;

/**
 * 同层相邻节点的最小中心距(px).
 *
 * 整齐布局(ui/rbt/rbt_layout.ts)拿它当**打包单位**:合并左右子树时,每一层都保证
 * 左子树最右节点与右子树最左节点至少差这么多;于是同层任意两节点的中心距都不小于
 * 它,圆不会相叠.它同时是"轮廓错开量"的唯一下限,所以越大树越疏、越小树越挤,
 * 没有第二个旋钮.
 *
 * **必须大于圆的直径**:圆的大小只写在 CSS(`--rbt-node-radius`,直径 44),布局
 * 已经不知道半径了,所以这是一条"改 CSS 时要回来看一眼"的约束.70 与 RBT_Y_STEP
 * 同值(水平 / 垂直留白一致:1:1 时圆与圆之间 26px 空气).
 */
export const RBT_MIN_HORIZONTAL_GAP = 70;

// 节点与连线:类名契约(观感全在 CSS)
//
// TS 侧只声明**类名**(选择器锚点):颜色 / 字号 / 线宽在 src/ui/rbt/tokens.css 的
// `--rbt-*` 令牌与 rbt.css 里,config 不含色值.
//
// 类名同时是跨语言契约:src/ui/rbt/rbt.test.ts 按 `.rbt-node--red` 数红节点、
// 按 `.rbt-edge` 数连线,所以它们不能只因为"CSS 里看着没用"就删.

/** 一个节点的组(位置在它的 `transform` 上;圆与文字是它的两个孩子) */
export const RBT_NODE_CLASS = 'rbt-node';

/** 节点圆的类名(半径 / 描边 / 填充 / 进入动画都在它上面) */
export const RBT_NODE_SHAPE_CLASS = 'rbt-node__shape';

/** 节点值的类名(字体 / 字号 / 对齐 / 文字色) */
export const RBT_NODE_LABEL_CLASS = 'rbt-node__label';

/** 红节点的修饰类(挂在节点组上,不挂在圆上:组是"这个节点"的语义单位) */
export const RBT_NODE_RED_CLASS = 'rbt-node--red';

/** 黑节点的修饰类 */
export const RBT_NODE_BLACK_CLASS = 'rbt-node--black';

/** 父子连线的类名(`<line>` 的描边与线宽在 CSS) */
export const RBT_EDGE_CLASS = 'rbt-edge';

// 表达式词法着色:类名契约(样式在 src/ui/rbt/rbt.css)
//
// 表达式编辑器的高亮 HTML 由 ui/rbt/rbt_highlight.ts 产出,注入给 miko_ui 的
// CodeEditor:库的高亮层只负责把产物显示在透明 textarea 背后,它不认识任何语言的
// 词法,所以"哪个词是什么"与"它是什么颜色"都在我们这一侧 -- 类名在这里声明,
// 配色在 src/ui/rbt/tokens.css 的 `--rbt-token-*`.
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

// 输出区(提示 / 错误 / 性质清单共用一套类名)
//
// 表达式先过**格式检查**(解析器):过了才有树可查性质,没过就在输出区出一行错误.
// 输出区只有一个(#treeOutput),下面这些类名决定每一行的角色与颜色.

/** 中性提示行的类名(空输入 / 空树;颜色见 src/ui/rbt/rbt.css 的 .tree-hint) */
export const RBT_OUTPUT_HINT_CLASS = 'tree-hint';

/** 错误行的类名(解析失败;颜色见 src/ui/rbt/rbt.css 的 .tree-error) */
export const RBT_OUTPUT_ERROR_CLASS = 'tree-error';

// 性质检查(清单行)

/**
 * 单条性质的类名(行为代码每渲染一次清单就整批重建这些节点).
 * 消费方是 src/ui/rbt/rbt.test.ts:它按 `#treeOutput .tree-property` 数行数,所以这个
 * 类名是**跨语言契约**,不能只按"CSS 里没用到"就删.
 */
export const RBT_DIAGNOSTICS_ROW_CLASS = 'tree-property';

/** 单条性质里"结论"那一段的类名(状态色挂在它上面) */
export const RBT_DIAGNOSTICS_STATE_CLASS = 'tree-property-state';

/** 清单抬头那一段的类名(样式见 src/ui/rbt/rbt.css 的 `#treeOutput`) */
export const RBT_DIAGNOSTICS_SUMMARY_CLASS = 'tree-property-summary';

/**
 * 清单抬头模板(可见文本).
 *
 * `{total}` 换成性质总条数,`{failed}` 换成 FAIL 的条数 -- 两处都在代码里算,
 * 所以"加一条性质"或"改文案"都只动这一个地方,不会出现抬头写着 4 条,
 * 清单里其实 5 行这种对不上的情况.
 */
export const RBT_PROPERTY_SUMMARY = '红黑树性质检查: {total} 条中 {failed} 条 FAIL';

/** 单条性质 PASS 时的结论文本 */
export const RBT_PROPERTY_STATE_PASS = 'PASS';

/** 单条性质 FAIL 时的结论文本 */
export const RBT_PROPERTY_STATE_FAIL = 'FAIL';

// 性质检查:逐条的出错文案
//
// 这几条是**出错位置**的模板,由 ui/rbt/rbt_format.ts 从核心层的结构化违规结果填
// 占位符后显示在清单里.占位符有两种:`{node}` 换成"值+颜色"(如 `11R`),数字占位符
// 换成算出来的数.核心层只给违规节点与两个黑高数字,不碰这些句子.

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

/** 一条性质在界面上的定义:核心层的稳定 id + 界面上的中文名 */
export interface RbtPropertySpec {
    /** 稳定 id,核心层的检查函数按它收口(见 datastruct/rbt/rbt_tree.ts 的 PROPERTY_CHECKS) */
    readonly id: RbtPropertyId;
    /** 界面上的性质名(可见文本) */
    readonly label: string;
}

/**
 * 性质 id -> 界面上的性质名(可见文本).
 *
 * 用 `Record<RbtPropertyId, string>` 收口:核心层增删一条性质而这里没跟上会**编译
 * 报错**(缺键 / 多键),不会出现"清单上少一行 / 多一行"却没人发现.
 */
const RBT_PROPERTY_LABELS: Readonly<Record<RbtPropertyId, string>> = {
    'root-black': '根节点为黑色',
    'red-no-red-child': '红色节点不可相邻',
    'black-height': '各路径黑色节点数量相同',
    'bst-order': '二叉搜索树有序',
};

/**
 * 界面上的性质清单(顺序 = 核心层 RBT_PROPERTY_IDS 的顺序 = 检查顺序).
 *
 * 顺序不在这里另写一遍:清单直接由核心层的 id 顺序生成,两边不可能对不上;性质
 * 到底查什么归数据结构那一侧,这里只负责"界面上叫它什么".
 */
export const RBT_PROPERTIES: readonly RbtPropertySpec[] = RBT_PROPERTY_IDS.map((id) => ({
    id,
    label: RBT_PROPERTY_LABELS[id],
}));

// 占位文案

/** 空输入时的提示文案(可见文本,全站不用 emoji;写成 #treeOutput 里的提示行) */
export const RBT_EMPTY_HINT_TEXT =
    '请输入红黑树表达式 (例如: 13B(8R(1B,11R),17R(15B,25B)))';

/**
 * 表达式解析成空树(`nil`)时的提示文案(同上,写成 #treeOutput 里的提示行).
 *
 * 与"没输入"分开一条:用户确实敲了东西(`nil` 是合法空树),再回一句
 * "请输入红黑树表达式"会答非所问;树上那时没有节点,得说清为什么空.
 */
export const RBT_EMPTY_TREE_HINT_TEXT = '表达式是空树 (nil),画布上没有节点';

/** 错误提示在 UI 上显示时的前缀(不用符号 / 表情,直接用字说明) */
export const RBT_ERROR_UI_PREFIX = '错误: ';

// 默认示例

/** 打开页面时自动加载的深度为 4 的满二叉树示例(挂载函数写进输入框) */
export const RBT_TREE_EXAMPLE =
    "15B(7R(3B(1R(0B,2B),5R(4B,6B)),11B(9R(8B,10B),13R(12B,14B))),23R(19B(17R(16B,18B),21R(20B,22B)),27B(25R(24B,26B),29R(28B,30B))))";

// 可见文案(解析错误信息,与界面一字不差)
//
// 解析器(datastruct/rbt/rbt_parse.ts)只抛错误码 + 出错片段,句子由
// ui/rbt/rbt_format.ts 用下面这些模板拼:改文案不碰核心逻辑.语法字符(`(`, `)`,
// `,`, R/B, nil)也不在这里 -- 那是输入格式的定义,在 datastruct/rbt/rbt_parse.ts.

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
