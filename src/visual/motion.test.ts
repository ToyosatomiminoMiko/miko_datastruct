/*
 * 场景形变(visual/motion.ts)的契约:稳定 id、直线 / 极坐标 / 子树平移三种插值、
 * 进入 / 离开的透明度、连线端点始终贴着圆边.
 *
 * 用手写文档 + 手写布局:这一层不认识"红黑树 / BST",只认节点与连接.
 */
import { describe, expect, it } from 'vitest';

import type { SceneDocument, SceneNodeKey } from '@/scene/scene_document';
import {
    VISUAL_LINK_NODE_GAP,
    VISUAL_NODE_RADIUS,
} from '@/visual/config';
import type { SceneLayout } from '@/visual/layout';
import { assignLinkLanes, compareSceneNodeKeys, linkEndpoints } from '@/visual/layout';
import {
    interpolateScenes,
    linkIdsOfDocument,
    sceneFromLayout,
} from '@/visual/motion';

/** 由节点 key 与有向连接造一份最小文档 */
function documentOf(
    keys: readonly SceneNodeKey[],
    pointers: readonly (readonly [SceneNodeKey, SceneNodeKey])[] = [],
): SceneDocument {
    return {
        nodes: keys.map((key) => ({ key, attrs: {} })),
        pointers: pointers.map(([from, to]) => ({ from, to })),
        edges: [],
    };
}

/** 按给定坐标造一份布局(端点用布局层同一套公式,保证和真实布局同口径) */
function layoutOf(
    document: SceneDocument,
    positions: Readonly<Record<string, readonly [number, number]>>,
): SceneLayout {
    const nodes = document.nodes.map((node) => {
        const at = positions[String(node.key)] ?? [0, 0];
        return { key: node.key, x: at[0], y: at[1] };
    });
    const pointOf = (key: SceneNodeKey) => {
        const node = nodes.find((candidate) => candidate.key === key);
        if (node === undefined) throw new Error(`布局里没有节点 ${String(key)}`);
        return { x: node.x, y: node.y };
    };
    const raw = [
        ...document.pointers.map((pointer) => ({ from: pointer.from, to: pointer.to, directed: true })),
        ...document.edges.map((edge) => ({ from: edge.a, to: edge.b, directed: false })),
    ];
    const lanes = assignLinkLanes(raw);
    return {
        nodes,
        links: raw.map((link, index) => ({
            ...link,
            ...linkEndpoints(
                pointOf(link.from),
                pointOf(link.to),
                (lanes[index] ?? 0) * (compareSceneNodeKeys(link.from, link.to) <= 0 ? 1 : -1),
            ),
        })),
    };
}

/** 一个节点到某个世界点的距离 */
function distanceTo(x: number, y: number, point: { x: number; y: number }): number {
    return Math.hypot(point.x - x, point.y - y);
}

describe('落定场景:sceneFromLayout', () => {
    it('节点位置 / 文字 / 变体 / 高亮状态 / 连线 id 都来自文档与 marks', () => {
        const documentWithAttrs: SceneDocument = {
            nodes: [
                { key: 10, attrs: { color: 'black' } },
                { key: 5, attrs: { color: 'red' } },
            ],
            pointers: [{ from: 10, to: 5 }],
            edges: [],
        };
        const layout = layoutOf(documentWithAttrs, { 10: [0, 0], 5: [70, 70] });

        const scene = sceneFromLayout(documentWithAttrs, layout, {
            variantOf: (attrs) => (typeof attrs.color === 'string' ? attrs.color : undefined),
            marks: { nodes: [{ key: 5, state: 'active' }], links: [{ from: 10, to: 5, state: 'path' }] },
        });

        // 节点文字一律由 key 派生,文档里没有单独的值字段
        expect(scene.nodes.map((node) => node.text)).toEqual(['10', '5']);
        expect(scene.nodes[0]?.variant).toBe('black');
        expect(scene.nodes[1]).toMatchObject({ variant: 'red', state: 'active' });
        expect(scene.links[0]).toMatchObject({ id: '10->5#0', state: 'path', opacity: 1 });
    });

    it('字符串 key:显示文字 = String(key),连线按字符串 key 引用', () => {
        const document: SceneDocument = {
            nodes: [{ key: 'K', attrs: {} }, { key: 'N', attrs: {} }],
            pointers: [],
            edges: [{ a: 'K', b: 'N', attrs: {} }],
        };
        const layout = layoutOf(document, { K: [0, 0], N: [100, 0] });
        const scene = sceneFromLayout(document, layout);

        expect(scene.nodes.map((node) => node.text)).toEqual(['K', 'N']);
        expect(scene.links[0]).toMatchObject({ from: 'K', to: 'N', directed: false });
    });

    it('同一对节点之间的多条线各有稳定 id(反向 / 平行不撞)', () => {
        const document: SceneDocument = {
            nodes: [{ key: 0, attrs: {} }, { key: 1, attrs: {} }],
            pointers: [{ from: 0, to: 1 }, { from: 1, to: 0 }, { from: 0, to: 1 }],
            edges: [],
        };
        expect(linkIdsOfDocument(document)).toEqual(['0->1#0', '1->0#0', '0->1#1']);
        const layout = layoutOf(document, { 0: [0, 0], 1: [100, 0] });
        const scene = sceneFromLayout(document, layout);
        expect(scene.links.map((link) => link.id)).toEqual(['0->1#0', '1->0#0', '0->1#1']);
        // 分道:同对三条线按 -14 / 0 / +14 排开
        expect(scene.links.map((link) => link.laneOffset)).toEqual([-14, 0, 14]);
    });
});

describe('直线插值 / 进入离开', () => {
    const beforeDocument = documentOf([0, 1], [[0, 1]]);
    const before = sceneFromLayout(
        beforeDocument,
        layoutOf(beforeDocument, { 0: [0, 0], 1: [100, 0] }),
    );
    const afterDocument = documentOf([0, 2]);
    const after = sceneFromLayout(
        afterDocument,
        layoutOf(afterDocument, { 0: [0, 100], 2: [100, 100] }),
    );

    it('t=0 回到上一帧,t=1 落到这一帧,t=0.5 中点', () => {
        const start = interpolateScenes(before, after, 0);
        expect(start.nodes.find((node) => node.key === 0)?.at).toEqual({ x: 0, y: 0 });
        const end = interpolateScenes(before, after, 1);
        expect(end.nodes.find((node) => node.key === 0)?.at).toEqual({ x: 0, y: 100 });
        const middle = interpolateScenes(before, after, 0.5);
        expect(middle.nodes.find((node) => node.key === 0)?.at).toEqual({ x: 0, y: 50 });
    });

    it('只出现 / 只消失的节点:透明度按 t 淡入淡出,消失的节点仍留在中间帧里', () => {
        const middle = interpolateScenes(before, after, 0.25);
        const entering = middle.nodes.find((node) => node.key === 2);
        const leaving = middle.nodes.find((node) => node.key === 1);
        expect(entering?.opacity).toBeCloseTo(0.25, 9);
        expect(leaving?.opacity).toBeCloseTo(0.75, 9);
        // 中间帧顺序:这一帧的节点在前,离开的在后
        expect(middle.nodes.map((node) => node.key)).toEqual([0, 2, 1]);
    });

    it('连线端点跟着节点走,且始终收在节点圆边之外', () => {
        const middle = interpolateScenes(before, after, 0.5);
        // before 有连线 0->1;after 没有,所以中间帧是一条正在淡出的线
        const link = middle.links[0];
        expect(link?.id).toBe('0->1#0');
        const from = middle.nodes.find((node) => node.key === link?.from);
        const to = middle.nodes.find((node) => node.key === link?.to);
        if (link === undefined || from === undefined || to === undefined) throw new Error('缺少连线 / 节点');
        // 端点与圆心的距离 = 半径 + 空隙(单条线没有分道偏移)
        expect(distanceTo(from.at.x, from.at.y, link.start))
            .toBeCloseTo(VISUAL_NODE_RADIUS + VISUAL_LINK_NODE_GAP, 6);
        expect(distanceTo(to.at.x, to.at.y, link.end))
            .toBeCloseTo(VISUAL_NODE_RADIUS + VISUAL_LINK_NODE_GAP, 6);
    });
});

describe('旋转插值(极坐标)', () => {
    // 左旋:x(1) 的右孩子 y(2) 上位,β(3) 从 y 的左子树改挂到 x 的右子树,α(4) 跟着 x
    const beforeDocument = documentOf([1, 2, 3, 4], [[1, 4], [1, 2], [2, 3]]);
    const afterDocument = documentOf([1, 2, 3, 4], [[2, 1], [2, 3], [1, 4]]);
    const before = sceneFromLayout(
        beforeDocument,
        layoutOf(beforeDocument, { 1: [0, 0], 4: [-100, 100], 2: [100, 0], 3: [0, 100] }),
    );
    const after = sceneFromLayout(
        afterDocument,
        layoutOf(afterDocument, { 2: [0, 0], 1: [-100, 100], 4: [-200, 200], 3: [0, 200] }),
    );
    const motion = { kind: 'rotate', from: 1, to: 2 } as const;
    const nodePosition = (scene: ReturnType<typeof interpolateScenes>, key: number) => {
        const node = scene.nodes.find((candidate) => candidate.key === key);
        if (node === undefined) throw new Error(`缺少节点 ${String(key)}`);
        return node.at;
    };

    it('t=0 / t=1 与两帧布局一致', () => {
        const start = nodePosition(interpolateScenes(before, after, 0, motion), 1);
        expect(start.x).toBeCloseTo(0, 9);
        expect(start.y).toBeCloseTo(0, 9);
        const end = nodePosition(interpolateScenes(before, after, 1, motion), 2);
        expect(end.x).toBeCloseTo(0, 9);
        expect(end.y).toBeCloseTo(0, 9);
    });

    it('x / y 绕旧边的中点走弧:半径线性、角度连续', () => {
        const middle = interpolateScenes(before, after, 0.5, motion);
        const center = { x: 50, y: 0 };
        const xAt = nodePosition(middle, 1);
        const yAt = nodePosition(middle, 2);
        // 旧 x 半径 50、新 x 半径 hypot(150,100);t=0.5 时取平均
        const expectedXRadius = (50 + Math.hypot(150, 100)) / 2;
        expect(distanceTo(center.x, center.y, xAt)).toBeCloseTo(expectedXRadius, 6);
        // y 的旧 / 新位置到中点的距离都是 50(100,0) 与 (0,0) 对 (50,0)
        const expectedYRadius = 50;
        expect(distanceTo(center.x, center.y, yAt)).toBeCloseTo(expectedYRadius, 6);
        // 两个点不会在 t=0.5 时叠在一起(绕轴转而不是擦肩而过)
        expect(distanceTo(xAt.x, xAt.y, yAt)).toBeGreaterThan(1);
    });

    it('β 子树绕移动中的 x 走短弧,α / γ 保持直线', () => {
        const middle = interpolateScenes(before, after, 0.5, motion);
        const xAt = nodePosition(middle, 1);
        const beta = nodePosition(middle, 3);
        // β 从 (0,100) 绕移动中的 xAt,半径取"旧 β 到 xAt"与"新 β 到 xAt"的平均
        const oldBeta = { x: 0, y: 100 };
        const newBeta = { x: 0, y: 200 };
        const expectedRadius = (
            distanceTo(oldBeta.x, oldBeta.y, xAt)
            + distanceTo(newBeta.x, newBeta.y, xAt)
        ) / 2;
        expect(distanceTo(xAt.x, xAt.y, beta)).toBeCloseTo(expectedRadius, 6);
        // α 不是 β,走直线:(-100,100) -> (-200,200) 的中点是 (-150,150)
        expect(nodePosition(middle, 4)).toEqual({ x: -150, y: 150 });
    });
});

describe('子树平移', () => {
    it('整棵子树按根的位移一起平移,不是每个节点各自直线过去', () => {
        const beforeDocument = documentOf([1, 2, 3], [[1, 2], [2, 3]]);
        const afterDocument = documentOf([1, 3], [[1, 3]]);
        const before = sceneFromLayout(
            beforeDocument,
            layoutOf(beforeDocument, { 1: [0, 0], 2: [0, 100], 3: [0, 200] }),
        );
        // 布局把子树整体上移 100:根的位移是 (0,-100)
        const after = sceneFromLayout(
            afterDocument,
            layoutOf(afterDocument, { 1: [0, 0], 3: [0, 100] }),
        );

        const middle = interpolateScenes(before, after, 0.5, { kind: 'subtree', root: 3 });
        const node3 = middle.nodes.find((node) => node.key === 3);
        // 3 与根 2(已删除,不参与)的相对关系不是重点,重点是它按根的位移走
        expect(node3?.at).toEqual({ x: 0, y: 150 });
    });
});
