/*
2026.05.01.00:00:00
红黑树工具:SVG 绘制 + 挂载

解析与性质检查在 rbt_tree.ts(纯逻辑,可单测);本文件只剩两件事:
- 把布局结果画成一棵 `<svg>`:区间递归分配坐标 + 连线(`<line>`)+ 节点
  (`<g>` 里一颗 `<circle>` 与一个 `<text>`);
- mountRBT:接管宿主,用库的 `mountDesktop` 立起桌面(背景 = 那棵树,两扇窗口 =
  表达式与性质检查),把"格式检查 -> 性质检查 -> 重绘"接到编辑器 textarea 的
  input 事件上.

**树画在"平面"里,平面由一块可拖动缩放的视口看着**(2026-10 起):布局算出来的 x / y
就是**平面坐标**(单位 = 屏幕像素 @ 缩放 1),平面本身无限大 -- 水平跨度由叶子数推
(见 planeWidth),垂直方向深一层就往下走一步.树上的东西全部落进世界层
`<g class="rbt-world">`,视口只改这一层的 `transform`(见 ui/rbt_viewport.ts);画完
一次把内容的**包围盒**交给视口,由它决定"装进视口并居中"(用户没手动挪过视角时).

**界面是桌面,不是一个面板**(2026-10 起):从前整块界面是 `createPanel` 的一颗框体,
树是正文里最后一件;现在树是**桌面背景**,编辑器独占一扇窗口,提示 + 输出区在另一扇
(见 ui/rbt_views.ts 的文件头).装配顺序与 miko_graphcalc 同形:
先建内容(背景 + 逐窗口正文),再 `mountDesktop(host, spec)` 建桌面三层与窗口外壳.

输入控件是 miko_ui 的 CodeEditor(外框 + 行号 + 词法高亮,标记见 ui/rbt_views.ts):
**值仍然只从 textarea 读**,行号与高亮是库按注入的分词器自己维护的装饰层 -- 本文件
只多做一件程序化写入的事:载入示例走库的 `seedTextareaSource`,再显式 `refresh()`
一次(直接赋值不派发 input 事件,装饰层不会自己更新).

**为什么是 SVG 而不是 canvas**(2026-10 起):树的每一笔都成了文档里的元素,于是
- 配色 / 字号 / 线宽回到 CSS(引 src/rbt/tokens.css 的 `--rbt-*`),不再写死在 config 里
  (`ctx.fillStyle` 读不到 CSS 变量,那是 canvas 的死结);
- 将来要做的命中检测 / 节点拖动 / 结构变化动画由浏览器给:`pointerdown` 的
  `event.target` 就是命中的节点,位移与淡入走 CSS transition,不必自己写一遍
  坐标反算与逐帧重绘.

代价是每次输入都整批重建这棵 SVG(节点数很少,不走增量复用那一套):世界层上
`replaceChildren` 就行,不留陈旧节点,也不必维护"哪个元素对应哪个节点"的映射表.

文案全部写进 HTML 的唯一输出区 #treeOutput(提示 / 错误 / 性质清单共用它),
这样颜色 / 字号 / 折行由 CSS 决定,截图与选中复制也都正常;SVG 里只画结构与节点值,
一个字都不多写(与 canvas 时代同一条分工).

每轮 input 的结果是四选一(见 renderTree):
1. 没输入 -> 输出区一行提示(#treeOutput .tree-hint),树清空;
2. 解析成空树(nil) -> 输出区一行提示(同上),树清空;
3. 格式检查不过 -> 输出区一行错误(#treeOutput .tree-error),树清空;
4. 解析成功 -> 输出区性质清单 + 画出树.
*/

/*
样式:`tokens.css`(设计令牌)与 `rbt.css`(编辑器 / 输出区 / 背景那棵树 / 桌面根)在
本模块引入(与 SETTING 页 / 地铁车窗同一条做法).
*/
import '@/rbt/rbt.css';

import {
    RBT_CLAMP_TOLERANCE,
    RBT_DESKTOP_INSET,
    RBT_DESKTOP_WINDOWS,
    RBT_DIAGNOSTICS_ROW_CLASS,
    RBT_DIAGNOSTICS_STATE_CLASS,
    RBT_DIAGNOSTICS_SUMMARY_CLASS,
    RBT_EDGE_CLASS,
    RBT_EMPTY_HINT_TEXT,
    RBT_EMPTY_TREE_HINT_TEXT,
    RBT_ERROR_UI_PREFIX,
    RBT_LEAF_PITCH,
    RBT_MIN_CHILD_WIDTH_FACTOR,
    RBT_MIN_HORIZONTAL_GAP,
    RBT_NODE_BLACK_CLASS,
    RBT_NODE_CLASS,
    RBT_NODE_LABEL_CLASS,
    RBT_NODE_RADIUS,
    RBT_NODE_RED_CLASS,
    RBT_NODE_SHAPE_CLASS,
    RBT_OUTPUT_ERROR_CLASS,
    RBT_OUTPUT_HINT_CLASS,
    RBT_PROPERTIES,
    RBT_PROPERTY_STATE_FAIL,
    RBT_PROPERTY_STATE_PASS,
    RBT_SIDE_MARGIN,
    RBT_SINGLE_CHILD_GAP_FACTOR,
    RBT_START_Y,
    RBT_TREE_EXAMPLE,
    RBT_Y_STEP,
} from './config';
import {
    buildTreeFromExpression,
    checkTreeProperties,
    formatPropertySummary,
    type RbtNode,
    type RbtPropertyReport,
} from './rbt_tree';
import { createRbtViews } from './ui/rbt_views';
import {
    mountPlaneViewport,
    type RbtPlaneBox,
    type RbtViewportHandle,
} from './ui/rbt_viewport';
import {
    DEFAULT_DESKTOP_CONFIG,
    childNodes,
    create_element,
    create_svg_element,
    mountDesktop,
    seedTextareaSource,
    type CodeEditorHandle,
    type DesktopHandle,
} from 'miko_ui';

// ============================================================
// 布局 -- 区间递归分配法:每个节点占据一段水平区间并居中,左右子树各分得父节点
// 两侧的子区间;区间不够时先压到最小间距,再由位置钳制兜底
//
// 坐标写在节点的 x / y 上(单位 = **平面坐标**,落笔那一步只读它).这一段从 canvas
// 版本原样继承:它算的是"节点该在哪",与用什么画无关.
//
// 平面没有固定尺寸,所以这里先按**叶子数**推一块水平跨度(见 planeWidth):区间分配法
// 把水平空间按叶子分,叶子越多摊得越宽,于是"树有多宽"是内容自己决定的;垂直方向只
// 往下叠层,不给上限.画完之后再由 measureBounds 量出**实际包围盒**(含节点半径),
// 交给视口去适应 -- 布局不猜视口多大,视口也不猜内容多宽.
//
// 间距全部由 config 的几何常量推出来(半径 -> 最小间距 -> 安全边距),本文件不再另
// 取一份副本:两处半径不一致的表现是"布局按一份算,画出来的圆是另一份",而且不报错.
// ============================================================

/**
 * 叶子数:平面的水平跨度按它推(区间分配法把水平空间按叶子分).
 *
 * 单孩子节点算"1 片叶子"(它下面没别的了):解析器现在只吐双孩子,但布局不该跟着
 * 解析器的当前宽严走 -- 哪天支持单孩子写法,这里不用改.
 */
function countLeaves(node: RbtNode): number {
    const left = node.left ? countLeaves(node.left) : 0;
    const right = node.right ? countLeaves(node.right) : 0;
    return left + right === 0 ? 1 : left + right;
}

/**
 * 平面水平跨度(px):叶子各摊一节距,但不小于"叶子数 × 最小间距".
 *
 * 两个常量各管一头(见 config 的 RBT_LEAF_PITCH):节距是**观感**想要的间距(深度 4
 * 的示例树看着与从前那块 1200 宽的定尺画布一致),最小间距是**几何必须**的下限
 * (圆不重叠);叶子特别多时按后者兜底.
 */
function planeWidth(leaves: number): number {
    const span = Math.max((leaves - 1) * RBT_LEAF_PITCH, leaves * RBT_MIN_HORIZONTAL_GAP);
    return RBT_SIDE_MARGIN * 2 + span;
}

/**
 * 递归分配水平区间:节点居中于自己那段,左右子树分走两侧子区间.
 *
 * 三个分支(双孩子 / 只有左 / 只有右)都保留:解析器现在只吐双孩子(单孩子写法
 * `5B(1B)` 在解析阶段就报"缺少逗号"),但布局不该跟着解析器的当前宽严走 --
 * 哪天支持单孩子,这里不用改.
 */
function placeNodeRecursive(node: RbtNode, leftBound: number, rightBound: number, y: number): void {
    // 节点水平居中于可用区间
    const x = (leftBound + rightBound) / 2;
    node.x = x;
    node.y = y;

    const hasLeft = node.left !== null;
    const hasRight = node.right !== null;

    if (hasLeft && hasRight) {
        let leftRightBound = x - RBT_MIN_HORIZONTAL_GAP;
        let rightLeftBound = x + RBT_MIN_HORIZONTAL_GAP;

        const minChildWidth = RBT_MIN_HORIZONTAL_GAP * RBT_MIN_CHILD_WIDTH_FACTOR;
        if (leftRightBound - leftBound < minChildWidth) {
            leftRightBound = leftBound + minChildWidth;
        }
        if (rightBound - rightLeftBound < minChildWidth) {
            rightLeftBound = rightBound - minChildWidth;
        }
        if (leftRightBound >= rightLeftBound) {
            const mid = (leftRightBound + rightLeftBound) / 2;
            leftRightBound = mid - RBT_MIN_HORIZONTAL_GAP / 2;
            rightLeftBound = mid + RBT_MIN_HORIZONTAL_GAP / 2;
        }

        placeNodeRecursive(node.left!, leftBound, leftRightBound, y + RBT_Y_STEP);
        placeNodeRecursive(node.right!, rightLeftBound, rightBound, y + RBT_Y_STEP);
    }
    else if (hasLeft) {
        let leftRightBound = x - RBT_MIN_HORIZONTAL_GAP * RBT_SINGLE_CHILD_GAP_FACTOR;
        if (leftRightBound <= leftBound) leftRightBound = leftBound + RBT_MIN_HORIZONTAL_GAP * RBT_MIN_CHILD_WIDTH_FACTOR;
        placeNodeRecursive(node.left!, leftBound, leftRightBound, y + RBT_Y_STEP);
    }
    else if (hasRight) {
        let rightLeftBound = x + RBT_MIN_HORIZONTAL_GAP * RBT_SINGLE_CHILD_GAP_FACTOR;
        if (rightLeftBound >= rightBound) rightLeftBound = rightBound - RBT_MIN_HORIZONTAL_GAP * RBT_MIN_CHILD_WIDTH_FACTOR;
        placeNodeRecursive(node.right!, rightLeftBound, rightBound, y + RBT_Y_STEP);
    }
}

/** 位置钳制:允许节点略微越出安全边距,但不许整颗跑出这块平面(宽度由叶子数给) */
function clampNodePositions(node: RbtNode, width: number): void {
    const minX = RBT_SIDE_MARGIN - RBT_CLAMP_TOLERANCE;
    const maxX = width - RBT_SIDE_MARGIN + RBT_CLAMP_TOLERANCE;
    if (node.x !== undefined && node.x < minX) node.x = minX;
    if (node.x !== undefined && node.x > maxX) node.x = maxX;
    if (node.left) clampNodePositions(node.left, width);
    if (node.right) clampNodePositions(node.right, width);
}

/**
 * 量出这棵树在平面上的**实际包围盒**(先序遍历取 min / max,再各向外扩一个节点半径).
 *
 * 为什么不直接用布局给的平面宽度:"内容有多宽"与"给布局用的水平跨度"是两件事 --
 * 三节点的小树只占跨度中间一小段,视口适应该按**它自己**的包围盒居中,而不是按一个
 * 被撑大的空框.半径也要算进去:圆画在坐标点的四周,`x` 是圆心不是边缘.
 */
function measureBounds(root: RbtNode): RbtPlaneBox {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    walkTree(root, (node) => {
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    });

    return {
        minX: minX - RBT_NODE_RADIUS,
        minY: minY - RBT_NODE_RADIUS,
        width: maxX - minX + RBT_NODE_RADIUS * 2,
        height: maxY - minY + RBT_NODE_RADIUS * 2,
    };
}

/**
 * 给一棵树算坐标,交回它占的那块平面.
 *
 * 根居中于按叶子数推出来的水平跨度;量出来的包围盒是给视口适应用的(见 rbt_viewport
 * 的 fitPlaneView).
 */
function layoutTree(root: RbtNode): RbtPlaneBox {
    const width = planeWidth(countLeaves(root));
    const leftBoundary = RBT_SIDE_MARGIN;
    const rightBoundary = width - RBT_SIDE_MARGIN;
    if (leftBoundary < rightBoundary) {
        placeNodeRecursive(root, leftBoundary, rightBoundary, RBT_START_Y);
    }
    clampNodePositions(root, width);
    return measureBounds(root);
}

// ============================================================
// 落笔 -- 把一棵算好坐标的树建成 SVG 节点
//
// 每个节点一个 `<g>`:位置写在组的 `transform` 上,圆与文字是它的两个孩子.
// 为什么位置放组上而不是各自算:拖动一个节点时只改这一处 `transform`,圆与文字
// 自动跟着走;动画也只插值这一个属性.
//
// 颜色只给类名(`.rbt-node--red` / `--black`),不给 fill / stroke:观感全在 CSS,
// 换配色不用碰 TS(见 config 的类名契约一节).
// ============================================================

/** 一个节点组:位置 + 颜色修饰类 + 圆 + 节点值 */
function createNodeElement(node: RbtNode): SVGGElement {
    const group = create_svg_element(
        { tag: 'g' },
        {
            class: `${RBT_NODE_CLASS} ${node.color === 'R' ? RBT_NODE_RED_CLASS : RBT_NODE_BLACK_CLASS}`,
            transform: `translate(${node.x},${node.y})`,
        },
        create_svg_element({ tag: 'circle' }, { class: RBT_NODE_SHAPE_CLASS }),
        create_svg_element({ tag: 'text' }, { class: RBT_NODE_LABEL_CLASS }, node.value),
    );
    return group;
}

/** 一条父子连线(`x1/y1` 是父节点,`x2/y2` 是子节点) */
function createEdgeElement(from: RbtNode, to: RbtNode): SVGLineElement {
    return create_svg_element(
        { tag: 'line' },
        {
            class: RBT_EDGE_CLASS,
            x1: String(from.x),
            y1: String(from.y),
            x2: String(to.x),
            y2: String(to.y),
        },
    );
}

/** 先序遍历,每个节点调一次 `visit`(连线由 `visit` 自己按左右孩子建) */
function walkTree(node: RbtNode | null, visit: (node: RbtNode) => void): void {
    if (!node) return;
    visit(node);
    walkTree(node.left, visit);
    walkTree(node.right, visit);
}

/**
 * 画一棵树:整批重建**世界层**的子节点(先连线,后节点 -- 节点盖在线上),交回它占的
 * 那块平面(包围盒).
 *
 * 只接非空根:没有树可画时调用方走 clearTree().落笔的是世界坐标:圆与连线之间的距离
 * 就是布局给的距离,视口的缩放由整层的 transform 表达,所以这里一个坐标都不用换算.
 *
 * 名字刻意不与 mountRBT 里那个 `renderTree`(每轮输入的全流程:写输出区 + 画树)撞:
 * 同名的话局部闭包会**遮蔽**这个模块级函数,调用点就变成自己调自己(栈溢出,而且报错
 * 信息里只有一串一模一样的调用帧).
 */
export function drawTree(world: SVGGElement, root: RbtNode): RbtPlaneBox {
    const bounds = layoutTree(root);

    const edges: SVGLineElement[] = [];
    const nodes: SVGGElement[] = [];
    walkTree(root, (node) => {
        if (node.left) edges.push(createEdgeElement(node, node.left));
        if (node.right) edges.push(createEdgeElement(node, node.right));
        nodes.push(createNodeElement(node));
    });

    /*
      整批换掉世界层的子节点,而不是"往空层里 append 一批":

      - **不另包一层 `<g class="rbt-layer">`**:节点本来就带 `.rbt-node`,连线带
        `.rbt-edge`,样式与冒烟脚本都按类名命中,再套一层只是多一个不起作用的元素;
        世界层是唯一必要的那一层(视口要长期改它的 transform,见 rbt_viewport);
      - 连线排在节点之前:同一层里后画的盖在先画的上面,所以节点永远压在连线上
        (canvas 时代靠"先画线再画节点"保证同一件事);
      - 子节点走库的 `childNodes()`(与 `replaceChildren` 同一套"字符串落成文本节点,
        假值跳过"的规则),不自己拼 innerHTML.
    */
    world.replaceChildren(...childNodes([...edges, ...nodes], world));
    return bounds;
}

/** 清空世界层:一颗节点 / 一条线都不留(输入为空 / 空树 / 解析失败三种情况) */
export function clearTree(world: SVGGElement): void {
    world.replaceChildren();
}

// ============================================================
// 原生 TS 挂载模块
// ============================================================

/** 输出区里的一行纯文本(提示 / 错误),类名决定颜色 */
function textLine(className: string, text: string): HTMLElement {
    const line = create_element({ tag: 'div' }, { class: className }, text);
    return line;
}

/**
 * 性质清单:抬头 + 四条,每条是
 * `<div class="tree-property">性质名: <span class="tree-property-state">PASS / FAIL</span> 出错位置</div>`.
 *
 * 条数与文案都由 config 的 RBT_PROPERTIES 决定,逐条建完交给 renderOutput 整批换掉.
 */
function propertyLines(report: RbtPropertyReport): HTMLElement[] {
    const rows = RBT_PROPERTIES.map((spec, index) => {
        const result = report.results[index];
        // 这个类名是冒烟脚本数行数的锚点(见 config.ts 的同名常量)
        const row = create_element({ tag: 'div' }, { class: RBT_DIAGNOSTICS_ROW_CLASS });
        const state = create_element(
            { tag: 'span' },
            {
                class: result.pass
                    ? `${RBT_DIAGNOSTICS_STATE_CLASS} is-pass`
                    : `${RBT_DIAGNOSTICS_STATE_CLASS} is-fail`,
            },
            result.pass ? RBT_PROPERTY_STATE_PASS : RBT_PROPERTY_STATE_FAIL,
        );
        row.append(`${spec.label}: `, state);
        if (!result.pass && result.detail !== '') {
            row.append(` ${result.detail}`);
        }
        return row;
    });
    const summary = textLine(RBT_DIAGNOSTICS_SUMMARY_CLASS, formatPropertySummary(report));
    return [summary, ...rows];
}

/**
 * 已挂载的一次桌面(按宿主记).
 *
 * 为什么需要:库的 CodeEditor 在 textarea 上挂着 input / scroll 监听与一个
 * `ResizeObserver`(行号与高亮各一个),`dispose()` 才会拆掉;桌面那边的窗口外壳
 * 与三层容器(`.window-layer` / `.snap-preview` / `.dock`)也归 `DesktopHandle`.
 * 标记可以靠 `replaceChildren` 整块换掉,但**观察者与 window 上的监听不会随节点
 * 离场自动消失** -- 同一颗宿主重复挂载时要先把上一份桌面、编辑器与视口拆掉,否则每挂
 * 一次就多留一套窗口、一个观察者与一条 resize 通道(旧节点已不在文档里,泄漏的是
 * 内存与回调,不报错也看不出来).
 *
 * 键是宿主而不是模块级单例:同一页挂两块桌面时各挂各的,互不干扰.
 */
interface MountedRbt {
    readonly desktop: DesktopHandle;
    readonly editor: CodeEditorHandle;
    /** 平面视口:拖动 / 滚轮监听与尺寸观察者都在它手里(见 ui/rbt_viewport.ts) */
    readonly viewport: RbtViewportHandle;
}

const mounted = new WeakMap<HTMLElement, MountedRbt>();

/**
 * 把红黑树桌面挂到宿主(页面那唯一一颗手写宿主 `#app`)上.
 *
 * 分两步(与 ui/rbt_views.ts 的分工一致):先建内容(平面视口 + 树 + 逐窗口正文),
 * 再交给库的 `mountDesktop` 建三层容器与窗口外壳.所以这里只按引用操作元素,
 * 不查 DOM,也没有"找不到元素"的失败路径;落笔在 drawTree,平面视口在
 * ui/rbt_viewport.ts,解析与性质检查在 rbt_tree.ts.
 */
export function mountRBT(host: HTMLElement): void {
    // 重复挂载同一颗宿主:先拆掉上一份桌面、编辑器与视口(见 MountedRbt)
    const previous = mounted.get(host);
    previous?.desktop.dispose();
    previous?.editor.dispose();
    previous?.viewport.dispose();
    mounted.delete(host);

    // 宿主由本模块独占:清空之后整体接管(桌面三层是 append 进来的,不清会叠两份)
    host.replaceChildren();

    const views = createRbtViews();
    /*
      平面视口:绑在那颗背景节点上,改的是世界层的 transform(见 ui/rbt_viewport.ts).
      `topInset` 传库的任务栏高度:适应视口时内容居中在这条带之下,树顶不会被任务栏
      压住(那个数只有库的桌面配置一个来源,这里不抄一遍 40).
    */
    const viewport = mountPlaneViewport(views.viewport, views.world, {
        topInset: DEFAULT_DESKTOP_CONFIG.dockReserve,
    });
    /*
      立起桌面:库一律用默认值(窗口动作 / 边缘余量 / 标题栏高度 / z / 吸附),
      应用只覆盖两处 --
      - `windows`:窗口清单(应用特有的,库不预设);
      - `edgeGap`:与窗口几何里的 `inset` 是同一个数(见 config 的 RBT_DESKTOP_INSET),
        改成库的默认值会让"默认离边多远"和"能贴多近"各说各话.
      背景是那**块平面视口**(不是里面的 `<svg>`):它由库 append 到桌面根上,窗口层与
      任务栏都压在它上面.视口的指针手势在它被 append 之前就绑好了,所以顺序无关.
    */
    const desktop = mountDesktop(host, {
        ...DEFAULT_DESKTOP_CONFIG,
        edgeGap: RBT_DESKTOP_INSET,
        windows: RBT_DESKTOP_WINDOWS,
        background: [views.viewport],
        content: views.content,
    });

    const editor = views.editor;
    // 值只从 textarea 读:行号 / 高亮是库按它自己维护的装饰层,不参与解析
    const input = editor.textarea;
    const outputEl = views.output;
    const worldEl = views.world;
    mounted.set(host, { desktop, editor, viewport });

    /**
     * 输出区的写入口:整批替换 #treeOutput 的子节点,空数组就整块 hidden.
     *
     * 提示行 / 错误行 / 性质清单都走这一条路 -- 它们只是"这一轮要显示的内容",
     * 没有 stdout 与 stderr 那种必须分流的语义;整批替换也让"上一轮的东西残留"
     * 变成不可能(行数很少,不是性能路径).
     */
    const renderOutput = (children: readonly HTMLElement[]): void => {
        outputEl.replaceChildren(...children);
        outputEl.hidden = children.length === 0;
    };

    const renderTree = (): void => {
        const expr = input.value.trim();

        if (expr === '') {
            // 没输入:说清桌面上为什么没有树
            renderOutput([textLine(RBT_OUTPUT_HINT_CLASS, RBT_EMPTY_HINT_TEXT)]);
            clearTree(worldEl);
            return;
        }

        try {
            // 第 1 步:格式检查(解析).过了才有树可查性质
            const rootNode = buildTreeFromExpression(expr);
            if (rootNode === null) {
                // 表达式非空但解析成空树(nil):没有节点可画,也没有性质可查
                renderOutput([textLine(RBT_OUTPUT_HINT_CLASS, RBT_EMPTY_TREE_HINT_TEXT)]);
                clearTree(worldEl);
                return;
            }
            // 第 2 步:性质检查写进输出区,平面里只画这棵树
            renderOutput(propertyLines(checkTreeProperties(rootNode)));
            // 画完把这块内容的包围盒报给视口:用户没手动挪过视角时按它适应并居中
            viewport.contentChanged(drawTree(worldEl, rootNode));
        } catch (err) {
            // 格式检查没过:输出区出一行错误(性质检查的输入都还没有);
            // 背景清空而不写错误文案 -- 文案一律归 HTML
            renderOutput([
                textLine(RBT_OUTPUT_ERROR_CLASS, `${RBT_ERROR_UI_PREFIX}${(err as Error).message}`),
            ]);
            clearTree(worldEl);
        }
    };

    input.addEventListener('input', renderTree);

    /*
      打开页面时自动加载示例.

      走库的 `seedTextareaSource` 而不是直接赋值:它是"首屏种子"那条路(编辑器本来
      是空的,没有撤销历史要保,也不抢焦点),语义比 `input.value = ...` 清楚;
      赋值本身不会派发 input 事件,所以装饰层与输出区都得自己叫一次:
      先 `editor.refresh()`(重算行号 + 重绘高亮,见 ui/rbt_views.ts 的 editor 说明),
      再 renderTree()。
    */
    seedTextareaSource(input, RBT_TREE_EXAMPLE);
    editor.refresh();
    renderTree();
}
