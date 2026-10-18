/**
 * 显示层**平面布局**(ui/rbt/rbt_layout.ts)的契约:纯几何,默认 node 环境.
 *
 * 这一层钉三件事:
 *
 * 1. **树形 -> 坐标**:每个节点都拿到坐标(根在顶、层距固定、左右子树分列两侧),
 *    连线两端就是父子两个节点,节点数 = 连线数 + 1;
 * 2. **不重叠**:同层任意两节点的中心距都不小于 RBT_MIN_HORIZONTAL_GAP(从前那版
 *    "区间递归"在不平衡的树上会算出 20px 的中心距、圆直接叠在一起,这条用例盯的就是
 *    那个回归);
 * 3. **父节点居中于孩子**:双孩子节点的 x 正好是左右孩子 x 的中点,单孩子节点与孩子
 *    同 x(父子连线是竖线).
 *
 * 内容包围盒**不在这一层**:布局不知道节点半径,实际占多大由渲染层落笔后向浏览器要
 * `getBBox()`(见 ui/rbt/rbt_render.test.ts).真机上的像素观感更不在这一层验;树在 DOM 里
 * 的形状在 rbt.test.ts.表达式解析在 datastruct/rbt/rbt_parse.test.ts.
 */
import { describe, expect, it } from 'vitest';

import { buildTreeFromExpression } from '@/datastruct/rbt/rbt_parse';
import { type RbtNode } from '@/datastruct/rbt/rbt_tree';
import { RBT_MIN_HORIZONTAL_GAP, RBT_TREE_EXAMPLE, RBT_Y_STEP } from '@/ui/rbt/config';
import { layoutTree, type RbtPlacedNode, type RbtTreeLayout } from '@/ui/rbt/rbt_layout';

/** 表达式 -> 布局(解析成空树就说明测试写错了,直接抛) */
function laidOut(expression: string): RbtTreeLayout {
    const root = buildTreeFromExpression(expression);
    if (root === null) throw new Error(`表达式 "${expression}" 解析成了空树`);
    return layoutTree(root);
}

/** 布局结果按"核心节点 -> 它在平面上的位置"建索引 */
function placedByNode(layout: RbtTreeLayout): ReadonlyMap<RbtNode, RbtPlacedNode> {
    return new Map(layout.nodes.map((placed) => [placed.node, placed]));
}

/** 同一层的节点(按 y 分组,行内按 x 排好) */
function levelRows(layout: RbtTreeLayout): RbtPlacedNode[][] {
    const rows = new Map<number, RbtPlacedNode[]>();
    for (const placed of layout.nodes) {
        const row = rows.get(placed.y);
        if (row === undefined) rows.set(placed.y, [placed]);
        else row.push(placed);
    }
    return [...rows.values()].map((row) => [...row].sort((a, b) => a.x - b.x));
}

describe('红黑树:平面布局', () => {
    it('三节点树:先序交回节点,根在顶、左右子树分列两侧', () => {
        const layout = laidOut('10B(5R,15R)');

        expect(layout.nodes.map((placed) => placed.node.value)).toEqual(['10', '5', '15']);
        expect(layout.edges).toHaveLength(2);

        const [root, left, right] = layout.nodes;
        // 根在 y = 0,深一层加一个层距
        expect(root.y).toBe(0);
        expect(left.y).toBe(RBT_Y_STEP);
        expect(right.y).toBe(RBT_Y_STEP);
        // 左子树在根左边,右子树在根右边
        expect(left.x).toBeLessThan(root.x);
        expect(right.x).toBeGreaterThan(root.x);
        // 父节点居中于两个孩子:根 x 正好是左右孩子的中点
        expect(root.x).toBeCloseTo((left.x + right.x) / 2, 9);
    });

    it('连线两端就是父子节点的同一份坐标(渲染不用再算一遍)', () => {
        const layout = laidOut('10B(5R,15R)');
        const root = layout.nodes[0];

        expect(layout.edges.map((edge) => edge.to.node.value)).toEqual(['5', '15']);
        for (const edge of layout.edges) {
            expect(edge.from).toBe(root);
            expect(edge.from.x).toBe(root.x);
            expect(edge.from.y).toBe(root.y);
        }
    });

    it('单节点:一个节点、零条连线,根在原点', () => {
        const layout = laidOut('5R');

        expect(layout.nodes).toHaveLength(1);
        expect(layout.edges).toHaveLength(0);
        expect(layout.nodes[0].x).toBe(0);
        expect(layout.nodes[0].y).toBe(0);
    });

    it('示例满树(根到叶 4 步):31 个节点、30 条连线、五层 y 各差一个层距', () => {
        const layout = laidOut(RBT_TREE_EXAMPLE);

        expect(layout.nodes).toHaveLength(31);
        expect(layout.edges).toHaveLength(31 - 1);
        // 31 = 2^5 - 1,根到叶 4 步 => 5 层;每层一个 y,层与层之间正好一个 RBT_Y_STEP
        const levels = [...new Set(layout.nodes.map((placed) => placed.y))].sort((a, b) => a - b);
        expect(levels).toEqual([0, 1, 2, 3, 4].map((depth) => depth * RBT_Y_STEP));
        // 16 片叶子横向铺开:内容比它高得多
        const xs = layout.nodes.map((placed) => placed.x);
        const ys = layout.nodes.map((placed) => placed.y);
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(Math.max(...ys) - Math.min(...ys));
    });

    it('满树:每层相邻节点的间距相等(整齐布局把满树排成规整的三角)', () => {
        const layout = laidOut(RBT_TREE_EXAMPLE);

        for (const row of levelRows(layout)) {
            const gaps = row.slice(1).map((placed, index) => placed.x - row[index].x);
            // 同一层里每个间距都相等(允许一次减法带来的浮点尾数)
            for (const gap of gaps) {
                expect(gap).toBeCloseTo(gaps[0], 9);
            }
        }
        // 最深一层是 16 片叶子,间距就是配置的最小中心距
        const rows = levelRows(layout);
        const leaves = rows[rows.length - 1];
        expect(leaves).toHaveLength(16);
        expect(leaves[1].x - leaves[0].x).toBeCloseTo(RBT_MIN_HORIZONTAL_GAP, 9);
    });

    it('不平衡的树:同层节点不重叠(中心距 >= 最小间距)', () => {
        /*
          从前那版"区间递归分配 + 越界钳制"在这棵左重树上会把 1B / 2B 算到只差 20px
          (圆半径 22,直接叠住),而钳制看的是"整棵树有没有跑出平面",兜不住局部塌缩.
          轮廓合并法里 shift 是每层轮廓算出来的最小可行值,所以这条对任何形状都成立.
        */
        const layout = laidOut('10B(5R(3B(1B,2B),4B),15R)');

        for (const row of levelRows(layout)) {
            for (let index = 1; index < row.length; index++) {
                expect(row[index].x - row[index - 1].x).toBeGreaterThanOrEqual(RBT_MIN_HORIZONTAL_GAP);
            }
        }
    });

    it('双孩子节点总在左右孩子正中:整棵树逐节点验证', () => {
        const root = buildTreeFromExpression('10B(5R(3B(1B,2B),4B),15R)');
        if (root === null) throw new Error('解析成了空树');
        const layout = layoutTree(root);
        const byNode = placedByNode(layout);

        const verify = (node: RbtNode): void => {
            const placed = byNode.get(node)!;
            if (node.left !== null && node.right !== null) {
                const left = byNode.get(node.left)!;
                const right = byNode.get(node.right)!;
                expect(placed.x).toBeCloseTo((left.x + right.x) / 2, 9);
                // 父节点在两个孩子中间(不是和其中一个重合)
                expect(left.x).toBeLessThan(placed.x);
                expect(placed.x).toBeLessThan(right.x);
            }
            if (node.left !== null) verify(node.left);
            if (node.right !== null) verify(node.right);
        };
        verify(root);
    });

    it('单孩子(另一边写 nil):孩子直接位于父节点正下方', () => {
        const root = buildTreeFromExpression('10B(5R,15R(12B,nil))');
        if (root === null) throw new Error('解析成了空树');
        const layout = layoutTree(root);
        const byNode = placedByNode(layout);

        // 15R 只有左孩子 12B:父子同 x,连线是竖线
        const parent = byNode.get(root.right!)!;
        const child = byNode.get(root.right!.left!)!;
        expect(parent.x).toBe(child.x);
        expect(child.y - parent.y).toBe(RBT_Y_STEP);
    });

    it('坐标非负且根在 y = 0:布局出口已经把整棵树平移到平面第一象限', () => {
        const layout = laidOut('10B(5R(3B(1B,2B),4B),15R)');

        expect(Math.min(...layout.nodes.map((placed) => placed.x))).toBe(0);
        expect(Math.min(...layout.nodes.map((placed) => placed.y))).toBe(0);
        expect(layout.nodes[0].y).toBe(0);
    });

    it('叶子越多,树越宽', () => {
        const extent = (layout: RbtTreeLayout): { width: number; height: number } => {
            const xs = layout.nodes.map((placed) => placed.x);
            const ys = layout.nodes.map((placed) => placed.y);
            return {
                width: Math.max(...xs) - Math.min(...xs),
                height: Math.max(...ys) - Math.min(...ys),
            };
        };

        const small = extent(laidOut('10B(5R,15R)'));
        const large = extent(laidOut(RBT_TREE_EXAMPLE));

        expect(large.width).toBeGreaterThan(small.width);
        expect(large.height).toBeGreaterThan(small.height);
    });

    it('不往核心节点上写坐标:布局结果与数据结构是两份东西', () => {
        const root = buildTreeFromExpression('10B(5R,15R)');
        if (root === null) throw new Error('解析成了空树');

        const layout = layoutTree(root);

        // 节点本身上没有显示状态:坐标只在布局结果里
        expect('x' in root).toBe(false);
        expect('y' in root).toBe(false);
        expect(layout.nodes[0].node).toBe(root);
        expect(typeof layout.nodes[0].x).toBe('number');
        expect(typeof layout.nodes[0].y).toBe('number');
    });
});
