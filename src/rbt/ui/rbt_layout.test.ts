/**
 * 显示层**平面布局**(ui/rbt_layout.ts)的契约:纯几何,默认 node 环境.
 *
 * 这一层钉三件事:
 *
 * 1. **树形 -> 坐标**:每个节点都拿到坐标(根在顶、层距固定、左右子树分列两侧),
 *    连线两端就是父子两个节点,节点数 = 连线数 + 1;
 * 2. **内容包围盒**:按实际占位算(含节点半径),给视口适应用的就是它,不是被撑大的
 *    平面跨度;
 * 3. **不碰核心节点**:布局只交回一份 `RbtPlacedNode` 表,红黑树节点本身上没有
 *    x / y -- 这是"数据结构"与"怎么画"分开的直接证据.
 *
 * 真机上的像素观感(圆真的多大、间距好不好看)不在这一层验;树在 DOM 里的形状在
 * rbt.test.ts.表达式解析在 core/rbt_parse.test.ts.
 */
import { describe, expect, it } from 'vitest';

import { buildTreeFromExpression } from '@/rbt/core/rbt_parse';
import { RBT_NODE_RADIUS, RBT_START_Y, RBT_TREE_EXAMPLE, RBT_Y_STEP } from '@/rbt/config';
import { layoutTree } from '@/rbt/ui/rbt_layout';

/** 表达式 -> 布局(解析成空树就说明测试写错了,直接抛) */
function laidOut(expression: string) {
    const root = buildTreeFromExpression(expression);
    if (root === null) throw new Error(`表达式 "${expression}" 解析成了空树`);
    return layoutTree(root);
}

describe('红黑树:平面布局', () => {
    it('三节点树:先序交回节点,根在顶、左右子树分列两侧', () => {
        const layout = laidOut('10B(5R,15R)');

        expect(layout.nodes.map((placed) => placed.node.value)).toEqual(['10', '5', '15']);
        expect(layout.edges).toHaveLength(2);

        const [root, left, right] = layout.nodes;
        expect(root.y).toBe(RBT_START_Y);
        expect(left.y).toBe(RBT_START_Y + RBT_Y_STEP);
        expect(right.y).toBe(RBT_START_Y + RBT_Y_STEP);
        // 左子树在根左边,右子树在根右边
        expect(left.x).toBeLessThan(root.x);
        expect(right.x).toBeGreaterThan(root.x);
        // 左右孩子不重叠
        expect(left.x).toBeLessThan(right.x);
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

    it('包围盒按实际占位算(含节点半径),不是被撑大的平面跨度', () => {
        const layout = laidOut('10B(5R,15R)');
        const xs = layout.nodes.map((placed) => placed.x);
        const ys = layout.nodes.map((placed) => placed.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        // 圆画在坐标点的四周:x 是圆心不是边缘,所以四周各外扩一个半径
        expect(layout.bounds.minX).toBe(minX - RBT_NODE_RADIUS);
        expect(layout.bounds.minY).toBe(minY - RBT_NODE_RADIUS);
        expect(layout.bounds.width).toBe(maxX - minX + RBT_NODE_RADIUS * 2);
        expect(layout.bounds.height).toBe(maxY - minY + RBT_NODE_RADIUS * 2);
    });

    it('单节点:一个节点、零条连线,包围盒就是一个圆', () => {
        const layout = laidOut('5R');

        expect(layout.nodes).toHaveLength(1);
        expect(layout.edges).toHaveLength(0);
        expect(layout.bounds.width).toBe(RBT_NODE_RADIUS * 2);
        expect(layout.bounds.height).toBe(RBT_NODE_RADIUS * 2);
    });

    it('示例满树(根到叶 4 步):31 个节点、30 条连线、五层 y 各差一个层距', () => {
        const layout = laidOut(RBT_TREE_EXAMPLE);

        expect(layout.nodes).toHaveLength(31);
        expect(layout.edges).toHaveLength(31 - 1);
        // 31 = 2^5 - 1,根到叶 4 步 => 5 层;每层一个 y,层与层之间正好一个 RBT_Y_STEP
        const levels = [...new Set(layout.nodes.map((placed) => placed.y))].sort((a, b) => a - b);
        expect(levels).toEqual([0, 1, 2, 3, 4].map((depth) => RBT_START_Y + depth * RBT_Y_STEP));
        // 16 片叶子横向铺开:内容比它高得多
        expect(layout.bounds.width).toBeGreaterThan(layout.bounds.height);
    });

    it('叶子越多,平面越宽(水平跨度由叶子数推出来)', () => {
        const small = laidOut('10B(5R,15R)');
        const large = laidOut(RBT_TREE_EXAMPLE);

        expect(large.bounds.width).toBeGreaterThan(small.bounds.width);
        expect(large.bounds.height).toBeGreaterThan(small.bounds.height);
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
