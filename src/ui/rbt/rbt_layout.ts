/*
**平面布局**:给一棵红黑树算每个节点在平面上的坐标,以及父子连线.

这是**显示层**的纯几何(数字进,数字出,不碰 DOM):层距 / 同层最小间距都是从
src/rbt/config.ts 的几何常量推出来的观感参数,与"这棵树是什么"无关.所以坐标**不写回
核心节点**(core/rbt_tree.ts 的 `RbtNode` 只有结构、且字段只读):布局交回的是一份
`RbtPlacedNode` 表,渲染层(ui/rbt_render.ts)按这张表落笔.

为什么坐标不该挂在节点上:挂了之后"数据结构"里就混进了显示状态 -- 换一种画法(比如
环形布局)要在节点上再挂一批坐标字段,而核心逻辑(性质检查)却从不读它们.拆开之后
"这棵树是什么"与"这棵树画在哪"各归各的,删掉/换掉布局不影响核心.

布局算法 = **整齐树布局(轮廓合并)**:自底向上算每棵子树"每一层最左 / 最右节点在哪
(轮廓)",合并左右子树时按同层轮廓求出两棵子树至少要错开多少(见 placeSubtree),
父节点再放到左右孩子正中间.三项性质是算出来的,不是靠事后钳:

1. 同层任意两节点的中心距 >= RBT_MIN_HORIZONTAL_GAP(圆不会叠);
2. 双孩子节点的 x 正好是左右孩子的中点(父节点总在两个孩子正中);
3. 子树之间不交叉:左子树的每个节点都在右子树对应层的左边.

这个算法里**没有"平面有多宽"这个概念**:布局不知道视口多大,也不需要一块定尺画布 --
它只回答"节点彼此别撞".内容实际占多大**不在这里算**:落笔之后由 ui/rbt_render.ts 向
浏览器要 `<g>` 的 `getBBox()`(见那里的 drawTree),再交给视口适应 -- 布局不必知道节点
半径,也就没有"TS 半径与 CSS 半径必须相等"那条跨语言契约.视口能拖动缩放,内容再宽再深
也只是看得见 / 看不见,不需要压进某块框.所以从前那套"按叶子数推水平跨度 -> 分配区间
-> 越界钳制"的参数与代码整体删掉了(见 README 的分层一节).
*/
import type { RbtNode } from '@/rbt/core/rbt_tree';
import { RBT_MIN_HORIZONTAL_GAP, RBT_Y_STEP } from '@/rbt/config';

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
 * 子树内部算出来的相对坐标:x 相对**这棵子树的根**(根 x = 0),depth 是层号.
 *
 * 相对坐标是轮廓合并的前提:合并时只需要把整棵子树平移一个量,不必回头改已经算好的
 * 绝对坐标.出到 layoutTree 才换成平面坐标(根不一定在 x = 0,见那里的归一化).
 */
interface RbtRelativeNode {
    readonly node: RbtNode;
    readonly x: number;
    readonly depth: number;
}

/**
 * 一棵子树的形状:相对坐标的节点 + 每一层的最左 / 最右 x.
 *
 * 两个轮廓数组的下标 = 层号(0 = 这棵子树的根所在层),值是那一层的 min / max x
 * (相对子树根).它们就是"这棵子树占了几何上的哪条边",合并左右子树时只比轮廓,
 * 不必逐个节点两两比较.
 */
interface RbtSubtreeShape {
    /** 先序:子树根在前 */
    readonly nodes: readonly RbtRelativeNode[];
    /** left[d] = 第 d 层最左节点的 x(相对子树根) */
    readonly left: readonly number[];
    /** right[d] = 第 d 层最右节点的 x(相对子树根) */
    readonly right: readonly number[];
}

// ============================================================
// 放置:自底向上合并轮廓
// ============================================================

/**
 * 算一棵子树:返回相对坐标(子树根 x = 0)与它的左右轮廓.
 *
 * 三种情况:
 *
 * - **叶子**:x = 0,两个轮廓都只有一个 0.
 * - **单孩子**:孩子放在正下方(x = 0,父节点正上方).解析器允许一边写 `nil`
 *   (`5B(1B,nil)`),所以这条分支必须存在;父子同 x 的竖线也最好读.
 * - **双孩子**:先递归拿到左右子树,再算它们至少错开多少:
 *
 *       shift 要满足每一层 d 都有  left.right[d] + GAP <= right.left[d] + shift
 *       => shift = max over d ( left.right[d] - right.left[d] + GAP )
 *
 *   只在**两边都有节点的层**上取(只有一边有节点时不可能撞).父节点放在
 *   `shift / 2`:两个孩子分别从 0 与 shift 开始,中点就是父节点 -- 这是"父节点居中
 *   于两个孩子"的全部内容.最后把两棵子树的轮廓按同样的平移量合并成自己的轮廓.
 *
 * 全程只做加法 / 取最大最小,没有"放不下就压一压"的兜底:轮廓法算出来的 shift 就是
 * **最小可行间距**,同层的节点天然不会比 GAP 更近.
 */
function placeSubtree(node: RbtNode, depth: number): RbtSubtreeShape {
    const left = node.left === null ? null : placeSubtree(node.left, depth + 1);
    const right = node.right === null ? null : placeSubtree(node.right, depth + 1);

    // 叶子:相对自己的 x 就是 0
    if (left === null && right === null) {
        return {
            nodes: [{ node, x: 0, depth }],
            left: [0],
            right: [0],
        };
    }

    // 单孩子:孩子放到正下方(相对 x 都是 0),轮廓在顶上补一层父节点.
    // 判空用 `!`:上一个分支已经排除了"两边都没有",同一层里另一个一定存在(TSC 不会
    // 把"前一个 if 的否定"和这一条合起来推,所以这里显式断言).
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

    /*
      两棵子树的最小错开量.初值就是 GAP:第 0 层(两个子树的根)本来就相邻,
      循环里 d = 0 也会算出同一个约束,这里写出来只是为了"不依赖下面循环一定覆盖 d=0".
    */
    let shift = RBT_MIN_HORIZONTAL_GAP;
    const sharedDepth = Math.min(left.right.length, right.left.length);
    for (let d = 0; d < sharedDepth; d++) {
        const required = left.right[d] - right.left[d] + RBT_MIN_HORIZONTAL_GAP;
        if (required > shift) shift = required;
    }

    // 父节点置于两个孩子正中:它的 x 是自己的 0,孩子分别在 ±shift/2
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

// ============================================================
// 连线
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

// ============================================================
// 入口
// ============================================================

/**
 * 给一棵树算坐标,交回节点与连线.
 *
 * 递归先算出相对坐标(根在 x = 0),出口再把整棵树平移到 x >= 0:布局交回的坐标只有
 * "彼此相对"的意思,平移不改变任何间距,但让"所有节点 x 非负"成为一条可断言的事实
 * (渲染属性里不会出现负号,测试也不必为符号分心).y 是层号 × 层距,根在 0.
 *
 * 传空树是调用方的错(那时没有东西可画,挂载函数在解析成 null 时直接走清空分支),
 * 所以这里收非空根.
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
