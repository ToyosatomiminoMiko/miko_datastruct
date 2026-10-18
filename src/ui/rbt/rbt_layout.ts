/*
平面布局:给一棵红黑树算每个节点在平面上的坐标,以及父子连线.

纯几何,不碰 DOM:层距与同层最小间距来自 config 的几何常量;坐标不写回核心节点,而是交回
一份 `RbtPlacedNode` 表,由 ui/rbt/rbt_scene.ts 翻译成视觉层场景再落笔.

算法是整齐树布局(轮廓合并):自底向上算每棵子树的左右轮廓,合并时按同层轮廓求最小错开量,
父节点放在左右孩子正中(推导见 placeSubtree).布局不管视口多大,也不管节点半径.
*/
import type { RbtNode } from '@/datastruct/rbt/rbt_tree';
import { RBT_MIN_HORIZONTAL_GAP, RBT_Y_STEP } from '@/ui/rbt/config';

// 布局结果的形状

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

/** 一棵树的完整布局:节点(先序)+ 父子连线 */
export interface RbtTreeLayout {
    /** 先序:根在前,左右子树随后(渲染顺序与测试的"第一颗是根"都靠它) */
    readonly nodes: readonly RbtPlacedNode[];
    /** 父子连线(先序,每条对应一个非根节点) */
    readonly edges: readonly RbtPlacedEdge[];
}

/** 放置期间可变的中间形状;出口按只读的 RbtPlacedNode 交回 */
interface MutablePlacedNode {
    node: RbtNode;
    x: number;
    y: number;
}

/**
 * 子树内部算出来的相对坐标:x 相对这棵子树的根(根 x = 0),depth 是层号.
 * 相对坐标是轮廓合并的前提:合并时只需把整棵子树平移一个量,不必回头改已算好的绝对坐标.
 */
interface RbtRelativeNode {
    readonly node: RbtNode;
    readonly x: number;
    readonly depth: number;
}

/**
 * 一棵子树的形状:相对坐标的节点 + 每一层的最左 / 最右 x.
 *
 * 两个轮廓数组的下标 = 层号(0 = 这棵子树的根所在层),值是那一层的 min / max x(相对
 * 子树根).合并左右子树时只比轮廓,不必逐个节点两两比较.
 */
interface RbtSubtreeShape {
    /** 先序:子树根在前 */
    readonly nodes: readonly RbtRelativeNode[];
    /** left[d] = 第 d 层最左节点的 x(相对子树根) */
    readonly left: readonly number[];
    /** right[d] = 第 d 层最右节点的 x(相对子树根) */
    readonly right: readonly number[];
}

// 放置:自底向上合并轮廓

/**
 * 算一棵子树:返回相对坐标(子树根 x = 0)与它的左右轮廓.
 *
 * - 叶子:x = 0,两个轮廓都只有一个 0.
 * - 单孩子:孩子放在正下方(x = 0).解析器允许一边写 `nil`(`5B(1B,nil)`),这条分支
 *   必须存在;父子同 x 的竖线也最好读.
 * - 双孩子:先递归拿到左右子树,再算它们至少错开多少:
 *
 *       shift 要满足每一层 d 都有  left.right[d] + GAP <= right.left[d] + shift
 *       => shift = max over d ( left.right[d] - right.left[d] + GAP )
 *
 *   只在两边都有节点的层上取(只有一边有节点时不可能撞).父节点放在 `shift / 2`:
 *   两个孩子分别从 0 与 shift 开始,中点就是父节点.最后把两棵子树的轮廓按同样的
 *   平移量合并成自己的轮廓.
 *
 * 全程只做加法 / 取最大最小,没有"放不下就压一压"的兜底:轮廓法算出来的 shift 就是
 * 最小可行间距,同层节点天然不会比 GAP 更近.
 */
function placeSubtree(node: RbtNode, depth: number): RbtSubtreeShape {
    const left = node.left === null ? null : placeSubtree(node.left, depth + 1);
    const right = node.right === null ? null : placeSubtree(node.right, depth + 1);

    if (left === null && right === null) {
        return {
            nodes: [{ node, x: 0, depth }],
            left: [0],
            right: [0],
        };
    }

    // 单孩子:孩子放到正下方(相对 x 都是 0),轮廓在顶上补一层父节点.
    // 判空用 `!`:上一个分支已排除"两边都没有",同一层里另一个一定存在(TSC 不会把
    // "前一个 if 的否定"和这一条合起来推,所以这里显式断言).
    if (left === null) {
        return {
            nodes: [{ node, x: 0, depth }, ...right!.nodes],
            left: [0, ...right!.left],
            right: [0, ...right!.right],
        };
    }
    if (right === null) {
        return {
            nodes: [{ node, x: 0, depth }, ...left.nodes],
            left: [0, ...left.left],
            right: [0, ...left.right],
        };
    }

    // 两棵子树的最小错开量.初值就是 GAP:第 0 层(两个子树的根)本来就相邻,
    // 循环里 d = 0 也会算出同一个约束,写出来只是为了不依赖循环一定覆盖 d = 0.
    let shift = RBT_MIN_HORIZONTAL_GAP;
    const sharedDepth = Math.min(left.right.length, right.left.length);
    for (let d = 0; d < sharedDepth; d++) {
        const required = left.right[d] - right.left[d] + RBT_MIN_HORIZONTAL_GAP;
        if (required > shift) shift = required;
    }

    const childOffset = shift / 2;
    const nodes: RbtRelativeNode[] = [{ node, x: 0, depth }];
    for (const item of left.nodes) {
        nodes.push({ node: item.node, x: item.x - childOffset, depth: item.depth });
    }
    for (const item of right.nodes) {
        nodes.push({ node: item.node, x: item.x + shift - childOffset, depth: item.depth });
    }

    // 合并轮廓:第 0 层是父节点自己,第 d + 1 层取两棵子树第 d 层轮廓的 min / max
    const leftContour: number[] = [0];
    const rightContour: number[] = [0];
    const leftDepth = Math.max(left.left.length, right.left.length);
    for (let d = 0; d < leftDepth; d++) {
        let min = Number.POSITIVE_INFINITY;
        if (d < left.left.length) min = Math.min(min, left.left[d] - childOffset);
        if (d < right.left.length) min = Math.min(min, right.left[d] + shift - childOffset);
        leftContour.push(min);
    }
    const rightDepth = Math.max(left.right.length, right.right.length);
    for (let d = 0; d < rightDepth; d++) {
        let max = Number.NEGATIVE_INFINITY;
        if (d < left.right.length) max = Math.max(max, left.right[d] - childOffset);
        if (d < right.right.length) max = Math.max(max, right.right[d] + shift - childOffset);
        rightContour.push(max);
    }

    return { nodes, left: leftContour, right: rightContour };
}

// 连线

/**
 * 先序遍历,给每条父子关系配一对已坐好标的节点(顺序:先根的两条,再左子树,再右子树).
 *
 * 连线不单独存第二份坐标:两端就是那两个节点的坐标,视口缩放整层时跟着一起缩放.
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
 * 给一棵树算坐标,交回节点与连线.
 *
 * 递归先算出相对坐标(根在 x = 0),出口再把整棵树平移到 x >= 0:平移不改变任何间距,
 * 但让"所有节点 x 非负"成为一条可断言的事实.y 是层号 × 层距,根在 0.
 *
 * 传空树是调用方的错(没有东西可画时挂载函数直接走清空分支),所以这里收非空根.
 */
export function layoutTree(root: RbtNode): RbtTreeLayout {
    const shape = placeSubtree(root, 0);
    const placed: MutablePlacedNode[] = shape.nodes.map((item) => ({
        node: item.node,
        x: item.x,
        y: item.depth * RBT_Y_STEP,
    }));

    let minX = Number.POSITIVE_INFINITY;
    for (const item of placed) {
        if (item.x < minX) minX = item.x;
    }
    for (const item of placed) {
        item.x -= minX;
    }

    const byNode = new Map<RbtNode, RbtPlacedNode>(placed.map((item) => [item.node, item]));
    return {
        nodes: placed,
        edges: collectEdges(root, byNode),
    };
}
