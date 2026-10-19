/**
 * 中性场景自动布局(纯几何,node 环境)的契约.
 *
 * 钉的是"从连接关系推形状"的几条不变量:树按层排、父在子正中、同层不撞;有边 / 有环
 * 走环形布局;多个连通分量并排;同一输入永远给同一坐标.
 */
import { describe, expect, it } from 'vitest';

import {
    layoutScene,
    type SceneLayout,
    type SceneLayoutInput,
} from '@/visual/layout';
import {
    VISUAL_LAYOUT_COMPONENT_GAP,
    VISUAL_LAYOUT_GRAPH_MIN_RADIUS,
    VISUAL_LAYOUT_TREE_LAYER_STEP,
    VISUAL_LAYOUT_TREE_MIN_GAP,
    VISUAL_LINK_LANE_GAP,
    VISUAL_LINK_NODE_GAP,
    VISUAL_NODE_RADIUS,
} from '@/visual/config';

/** 按 key 取布局出来的坐标(取不到直接抛错,而不是让断言读 undefined) */
function point(layout: SceneLayout, key: number): { x: number; y: number } {
    const node = layout.nodes.find((candidate) => candidate.key === key);
    if (!node) throw new Error(`布局里没有节点 ${key}`);
    return { x: node.x, y: node.y };
}

/** 一份只有节点和指针的输入 */
function treeInput(
    nodeKeys: readonly number[],
    pointers: readonly { from: number; to: number }[],
): SceneLayoutInput {
    return {
        nodes: nodeKeys.map((key) => ({ key })),
        pointers,
        edges: [],
    };
}

describe('布局:树形', () => {
    it('按层距往下走:根在 y = 0,深一层加一个层距', () => {
        const layout = layoutScene(treeInput([0, 1, 2, 3, 4], [
            { from: 0, to: 1 },
            { from: 0, to: 2 },
            { from: 1, to: 3 },
            { from: 1, to: 4 },
        ]));

        expect(point(layout, 0).y).toBe(0);
        expect(point(layout, 1).y).toBe(VISUAL_LAYOUT_TREE_LAYER_STEP);
        expect(point(layout, 2).y).toBe(VISUAL_LAYOUT_TREE_LAYER_STEP);
        expect(point(layout, 3).y).toBe(VISUAL_LAYOUT_TREE_LAYER_STEP * 2);
        expect(point(layout, 4).y).toBe(VISUAL_LAYOUT_TREE_LAYER_STEP * 2);
    });

    it('父节点在左右孩子正中,同层节点至少隔一个最小中心距', () => {
        const layout = layoutScene(treeInput([0, 1, 2, 3, 4, 5, 6], [
            { from: 0, to: 1 },
            { from: 0, to: 2 },
            { from: 1, to: 3 },
            { from: 1, to: 4 },
            { from: 2, to: 5 },
            { from: 2, to: 6 },
        ]));

        const root = point(layout, 0);
        expect(root.x).toBeCloseTo((point(layout, 1).x + point(layout, 2).x) / 2);
        expect(point(layout, 1).x).toBeCloseTo((point(layout, 3).x + point(layout, 4).x) / 2);
        expect(point(layout, 2).x).toBeCloseTo((point(layout, 5).x + point(layout, 6).x) / 2);

        // 第 2 层 3/4 与 5/6 都排开,相邻中心距不小于 GAP
        for (const [left, right] of [[3, 4], [4, 5], [5, 6]] as const) {
            expect(point(layout, right).x - point(layout, left).x)
                .toBeGreaterThanOrEqual(VISUAL_LAYOUT_TREE_MIN_GAP - 1e-9);
        }
    });

    it('单链:每个节点在父节点正下方,层距逐层累加', () => {
        const layout = layoutScene(treeInput([0, 1, 2, 3], [
            { from: 0, to: 1 },
            { from: 1, to: 2 },
            { from: 2, to: 3 },
        ]));

        expect(point(layout, 0).x).toBe(point(layout, 1).x);
        expect(point(layout, 1).x).toBe(point(layout, 2).x);
        expect(point(layout, 2).x).toBe(point(layout, 3).x);
        expect(point(layout, 3).y).toBe(VISUAL_LAYOUT_TREE_LAYER_STEP * 3);
    });

    it('森林:多个分量从左到右并排,分量间留出固定间隙', () => {
        const layout = layoutScene(treeInput([0, 1, 2], [{ from: 1, to: 2 }]));

        const first = point(layout, 0);
        const second = point(layout, 1);
        expect(first.x).toBe(0);
        expect(second.x - first.x).toBe(VISUAL_LAYOUT_COMPONENT_GAP);
        expect(point(layout, 2).x).toBe(second.x);
    });

    it('连线顺序 = 指针输入顺序,节点坐标按输入顺序交回', () => {
        const layout = layoutScene(treeInput([2, 0, 1], [
            { from: 2, to: 0 },
            { from: 2, to: 1 },
        ]));
        expect(layout.links.map((link) => ({ from: link.from, to: link.to, directed: link.directed })))
            .toEqual([
                { from: 2, to: 0, directed: true },
                { from: 2, to: 1, directed: true },
            ]);
        expect(layout.nodes.map((node) => node.key)).toEqual([2, 0, 1]);
    });
});

describe('布局:连线端点(圆边 + 平行 / 反向分道)', () => {
    /** 一条连线的中点(端点的平均) */
    function midpoint(link: { start: { x: number; y: number }; end: { x: number; y: number } }): { x: number; y: number } {
        return { x: (link.start.x + link.end.x) / 2, y: (link.start.y + link.end.y) / 2 };
    }

    it('树指针:端点收进节点圆边界,方向标记为有向', () => {
        const layout = layoutScene(treeInput([0, 1], [{ from: 0, to: 1 }]));
        const root = point(layout, 0);
        const child = point(layout, 1);
        const link = layout.links[0];
        if (!link) throw new Error('布局没有给出连线');

        expect(link.directed).toBe(true);
        expect(Math.hypot(link.start.x - root.x, link.start.y - root.y))
            .toBeCloseTo(VISUAL_NODE_RADIUS + VISUAL_LINK_NODE_GAP, 6);
        expect(Math.hypot(link.end.x - child.x, link.end.y - child.y))
            .toBeCloseTo(VISUAL_NODE_RADIUS + VISUAL_LINK_NODE_GAP, 6);
    });

    it('平行无向边(柯尼斯堡 K-N ×2):两条线横向分道,不再重叠', () => {
        const layout = layoutScene({
            nodes: [{ key: 0 }, { key: 1 }],
            pointers: [],
            edges: [{ a: 0, b: 1 }, { a: 0, b: 1 }],
        });
        const [first, second] = layout.links;
        if (!first || !second) throw new Error('布局没有给出两条连线');

        expect(first.directed).toBe(false);
        expect(second.directed).toBe(false);
        expect(Math.hypot(first.start.x - second.start.x, first.start.y - second.start.y))
            .toBeCloseTo(VISUAL_LINK_LANE_GAP, 6);
        expect(Math.hypot(
            midpoint(first).x - midpoint(second).x,
            midpoint(first).y - midpoint(second).y,
        )).toBeCloseTo(VISUAL_LINK_LANE_GAP, 6);
    });

    it('反向指针 a->b 与 b->a:两条线分到法向两侧,各有自己的方向', () => {
        const layout = layoutScene({
            nodes: [{ key: 0 }, { key: 1 }],
            pointers: [{ from: 0, to: 1 }, { from: 1, to: 0 }],
            edges: [],
        });
        const [forward, backward] = layout.links;
        if (!forward || !backward) throw new Error('布局没有给出两条连线');

        expect(forward.from).toBe(0);
        expect(backward.from).toBe(1);
        expect(forward.directed).toBe(true);
        expect(backward.directed).toBe(true);
        // 两条线的起点分别在两个节点上,直接比起点会掺进方向差;比中点只知道横向分道
        expect(Math.hypot(
            midpoint(forward).x - midpoint(backward).x,
            midpoint(forward).y - midpoint(backward).y,
        )).toBeCloseTo(VISUAL_LINK_LANE_GAP, 6);
    });

    it('只有一对一条线时不偏移', () => {
        const layout = layoutScene(treeInput([0, 1], [{ from: 0, to: 1 }]));
        const root = point(layout, 0);
        const child = point(layout, 1);
        const link = layout.links[0];
        if (!link) throw new Error('布局没有给出连线');
        // 中点应落在两节点圆心的连线上
        expect(midpoint(link).x).toBeCloseTo((root.x + child.x) / 2, 6);
        expect(midpoint(link).y).toBeCloseTo((root.y + child.y) / 2, 6);
    });
});

describe('布局:图(环形)', () => {
    it('有边就走环形布局:节点都在圆周上,坐标确定且不重叠', () => {
        const layout = layoutScene({
            nodes: [{ key: 0 }, { key: 1 }, { key: 2 }, { key: 3 }],
            pointers: [],
            edges: [
                { a: 0, b: 1 },
                { a: 0, b: 2 },
                { a: 0, b: 3 },
                { a: 1, b: 2 },
                { a: 2, b: 3 },
            ],
        });

        expect(layout.links).toHaveLength(5);
        // 4 个节点均匀排在半径 >= 最小半径的圆上
        const positions = layout.nodes.map((node) => point(layout, node.key));
        expect(new Set(positions.map((position) => `${position.x},${position.y}`)).size).toBe(4);
        const center = {
            x: positions.reduce((sum, position) => sum + position.x, 0) / positions.length,
            y: positions.reduce((sum, position) => sum + position.y, 0) / positions.length,
        };
        for (const position of positions) {
            const radius = Math.hypot(position.x - center.x, position.y - center.y);
            expect(radius).toBeCloseTo(VISUAL_LAYOUT_GRAPH_MIN_RADIUS, 6);
        }
    });

    it('有环或有自指针的指针图不走树布局(退到环形)', () => {
        const cycle = layoutScene(treeInput([0, 1], [
            { from: 0, to: 1 },
            { from: 1, to: 0 },
        ]));
        expect(point(cycle, 0).y).not.toBe(point(cycle, 1).y - VISUAL_LAYOUT_TREE_LAYER_STEP);

        const selfLoop = layoutScene(treeInput([0], [{ from: 0, to: 0 }]));
        expect(selfLoop.links.map((link) => ({ from: link.from, to: link.to, directed: link.directed })))
            .toEqual([{ from: 0, to: 0, directed: true }]);
        // 自环没有可收的方向:端点就是节点本身(渲染层画不出可见线段)
        expect(selfLoop.links[0]?.start).toEqual(selfLoop.links[0]?.end);
        expect(selfLoop.nodes).toHaveLength(1);
    });

    it('指针与边混在一起时也走环形,连线顺序先是 pointers 再是 edges', () => {
        const layout = layoutScene({
            nodes: [{ key: 0 }, { key: 1 }, { key: 2 }],
            pointers: [{ from: 0, to: 1 }],
            edges: [{ a: 1, b: 2 }],
        });
        expect(layout.links.map((link) => ({ from: link.from, to: link.to, directed: link.directed })))
            .toEqual([
                { from: 0, to: 1, directed: true },
                { from: 1, to: 2, directed: false },
            ]);
        // 环形布局的 y 是圆上的,不会像树那样把根固定在 y = 0
        expect(layout.nodes.some((node) => node.y > VISUAL_LAYOUT_TREE_MIN_GAP)).toBe(true);
    });

    it('图的多个连通分量也并排:第二个分量的节点整体在第一个分量右侧', () => {
        const layout = layoutScene({
            nodes: [{ key: 0 }, { key: 1 }, { key: 2 }],
            pointers: [],
            edges: [{ a: 0, b: 1 }],
        });
        // 分量 {0,1} 是一个圆,节点 2 是孤立分量,排到它右边
        const componentRight = Math.max(point(layout, 0).x, point(layout, 1).x);
        expect(point(layout, 2).x).toBeGreaterThan(componentRight);
    });
});

describe('布局:输入校验', () => {
    it('节点 key 重复直接抛错(解析器已经挡过一次,这里防直接调用)', () => {
        expect(() => layoutScene({
            nodes: [{ key: 0 }, { key: 0 }],
            pointers: [],
            edges: [],
        })).toThrow('重复');
    });
});
