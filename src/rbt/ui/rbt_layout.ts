/*
**平面布局**:给一棵红黑树算每个节点在平面上的坐标,以及内容占的那块包围盒.

这是**显示层**的纯几何(数字进,数字出,不碰 DOM):间距 / 层距 / 节点半径都是从
src/rbt/config.ts 的几何常量推出来的观感参数,与"这棵树是什么"无关.所以坐标**不写回
核心节点**(core/rbt_tree.ts 的 `RbtNode` 只有结构、且字段只读):布局交回的是一份
`RbtPlacedNode` 表,渲染层(ui/rbt_render.ts)按这张表落笔.

为什么坐标不该挂在节点上:挂了之后"数据结构"里就混进了显示状态 -- 换一种画法(比如
环形布局)要在节点上再挂一批坐标字段,而核心逻辑(性质检查)却从不读它们.拆开之后
"这棵树是什么"与"这棵树画在哪"各归各的,删掉/换掉布局不影响核心.

布局算法 = **区间递归分配法**:每个节点占据一段水平区间并居中,左右子树各分得父节点
两侧的子区间;区间不够时先压到最小间距,再由位置钳制兜底.平面没有固定尺寸,所以先
按**叶子数**推一块水平跨度(见 planeWidth),垂直方向只往下叠层;放完之后量出实际
包围盒,交给视口去适应 -- 布局不猜视口多大,视口也不猜内容多宽.
*/
import type { RbtNode } from '@/rbt/core/rbt_tree';
import {
    RBT_CLAMP_TOLERANCE,
    RBT_LEAF_PITCH,
    RBT_MIN_CHILD_WIDTH_FACTOR,
    RBT_MIN_HORIZONTAL_GAP,
    RBT_NODE_RADIUS,
    RBT_SIDE_MARGIN,
    RBT_SINGLE_CHILD_GAP_FACTOR,
    RBT_START_Y,
    RBT_Y_STEP,
} from '@/rbt/config';
import type { RbtPlaneBox } from '@/rbt/ui/rbt_viewport';

// ============================================================
// 布局结果的形状
// ============================================================

/** 一个坐好标的节点:核心节点 + 平面坐标(单位 = 屏幕像素 @ 缩放 1) */
export interface RbtPlacedNode {
    readonly node: RbtNode;
    readonly x: number;
    readonly y: number;
}

/** 一条父子连线(两端都已经有坐标,渲染层只照着画) */
export interface RbtPlacedEdge {
    readonly from: RbtPlacedNode;
    readonly to: RbtPlacedNode;
}

/** 一棵树的完整布局:节点(先序)/ 连线 / 内容包围盒 */
export interface RbtTreeLayout {
    /** 先序:根在前,左右子树随后(渲染顺序与测试的"第一颗是根"都靠它) */
    readonly nodes: readonly RbtPlacedNode[];
    /** 父子连线(先序,每条对应一个非根节点) */
    readonly edges: readonly RbtPlacedEdge[];
    /** 内容在平面上的包围盒(含节点半径),给视口适应用 */
    readonly bounds: RbtPlaneBox;
}

/** 放置期间可变的中间形状;出口按只读的 RbtPlacedNode 交回 */
interface MutablePlacedNode {
    node: RbtNode;
    x: number;
    y: number;
}

// ============================================================
// 水平跨度:叶子数 -> 平面宽度
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

// ============================================================
// 放置:递归分配区间
// ============================================================

/**
 * 递归分配水平区间:节点居中于自己那段,左右子树分走两侧子区间.
 *
 * 三个分支(双孩子 / 只有左 / 只有右)都保留:解析器现在只吐双孩子(单孩子写法
 * `5B(1B)` 在解析阶段就报"缺少逗号"),但布局不该跟着解析器的当前宽严走 --
 * 哪天支持单孩子,这里不用改.
 */
function placeNodeRecursive(
    node: RbtNode,
    leftBound: number,
    rightBound: number,
    y: number,
    placed: MutablePlacedNode[],
): void {
    // 节点水平居中于可用区间
    const x = (leftBound + rightBound) / 2;
    placed.push({ node, x, y });

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

        placeNodeRecursive(node.left!, leftBound, leftRightBound, y + RBT_Y_STEP, placed);
        placeNodeRecursive(node.right!, rightLeftBound, rightBound, y + RBT_Y_STEP, placed);
    }
    else if (hasLeft) {
        let leftRightBound = x - RBT_MIN_HORIZONTAL_GAP * RBT_SINGLE_CHILD_GAP_FACTOR;
        if (leftRightBound <= leftBound) {
            leftRightBound = leftBound + RBT_MIN_HORIZONTAL_GAP * RBT_MIN_CHILD_WIDTH_FACTOR;
        }
        placeNodeRecursive(node.left!, leftBound, leftRightBound, y + RBT_Y_STEP, placed);
    }
    else if (hasRight) {
        let rightLeftBound = x + RBT_MIN_HORIZONTAL_GAP * RBT_SINGLE_CHILD_GAP_FACTOR;
        if (rightLeftBound >= rightBound) {
            rightLeftBound = rightBound - RBT_MIN_HORIZONTAL_GAP * RBT_MIN_CHILD_WIDTH_FACTOR;
        }
        placeNodeRecursive(node.right!, rightLeftBound, rightBound, y + RBT_Y_STEP, placed);
    }
}

/** 位置钳制:允许节点略微越出安全边距,但不许整颗跑出这块平面(宽度由叶子数给) */
function clampNodePositions(placed: readonly MutablePlacedNode[], width: number): void {
    const minX = RBT_SIDE_MARGIN - RBT_CLAMP_TOLERANCE;
    const maxX = width - RBT_SIDE_MARGIN + RBT_CLAMP_TOLERANCE;
    for (const item of placed) {
        if (item.x < minX) item.x = minX;
        if (item.x > maxX) item.x = maxX;
    }
}

// ============================================================
// 连线与包围盒
// ============================================================

/**
 * 先序遍历,给每条父子关系配一对已坐好标的节点(顺序:先根的两条,再左子树,再右
 * 子树 -- 与渲染"先线后节点"的落笔顺序一致).
 *
 * 连线不单独存第二份坐标:它两端就是那两个节点的坐标,视口缩放整层时跟着一起缩放.
 */
function collectEdges(
    root: RbtNode,
    byNode: ReadonlyMap<RbtNode, RbtPlacedNode>,
): RbtPlacedEdge[] {
    const edges: RbtPlacedEdge[] = [];
    const visit = (node: RbtNode): void => {
        const from = byNode.get(node);
        if (from === undefined) return;
        for (const child of [node.left, node.right]) {
            if (child === null) continue;
            const to = byNode.get(child);
            if (to !== undefined) edges.push({ from, to });
        }
        if (node.left !== null) visit(node.left);
        if (node.right !== null) visit(node.right);
    };
    visit(root);
    return edges;
}

/**
 * 量出这棵树在平面上的**实际包围盒**(先序遍历取 min / max,再各向外扩一个节点半径).
 *
 * 为什么不直接用布局给的平面宽度:"内容有多宽"与"给布局用的水平跨度"是两件事 --
 * 三节点的小树只占跨度中间一小段,视口适应该按**它自己**的包围盒居中,而不是按一个
 * 被撑大的空框.半径也要算进去:圆画在坐标点的四周,`x` 是圆心不是边缘.
 */
function measureBounds(placed: readonly MutablePlacedNode[]): RbtPlaneBox {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const { x, y } of placed) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }

    return {
        minX: minX - RBT_NODE_RADIUS,
        minY: minY - RBT_NODE_RADIUS,
        width: maxX - minX + RBT_NODE_RADIUS * 2,
        height: maxY - minY + RBT_NODE_RADIUS * 2,
    };
}

// ============================================================
// 入口
// ============================================================

/**
 * 给一棵树算坐标,交回它的完整布局(节点 / 连线 / 包围盒).
 *
 * 根居中于按叶子数推出来的水平跨度;跑完再钳一次位置.传空树是调用方的错(那时没有
 * 东西可画,挂载函数在解析成 null 时直接走清空分支),所以这里收非空根.
 */
export function layoutTree(root: RbtNode): RbtTreeLayout {
    const width = planeWidth(countLeaves(root));
    const placed: MutablePlacedNode[] = [];
    placeNodeRecursive(root, RBT_SIDE_MARGIN, width - RBT_SIDE_MARGIN, RBT_START_Y, placed);
    clampNodePositions(placed, width);
    const byNode = new Map<RbtNode, RbtPlacedNode>(placed.map((item) => [item.node, item]));
    return {
        nodes: placed,
        edges: collectEdges(root, byNode),
        bounds: measureBounds(placed),
    };
}
