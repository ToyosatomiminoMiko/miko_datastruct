/*
 * 帧间锚定(visual/anchor.ts)的契约:平移是纯算术、锚点前后像素级不动、缺省回退规则.
 *
 * 用手写布局而不是真实文档:锚定只吃布局,不认识节点语义.
 */
import { describe, expect, it } from 'vitest';

import type { SceneNodeKey } from '@/scene/scene_document';
import type { SceneLayout } from '@/visual/layout';
import {
    anchorLayout,
    anchorOffset,
    autoAnchorLayout,
    layoutPosition,
    translateLayout,
} from '@/visual/anchor';

/** 由 [key, x, y] 三元组建一份只有节点的布局 */
function layoutOf(entries: readonly (readonly [SceneNodeKey, number, number])[]): SceneLayout {
    return { nodes: entries.map(([key, x, y]) => ({ key, x, y })), links: [] };
}

describe('锚定:平移量', () => {
    it('anchor 对齐到上一帧 anchorAt 的位置', () => {
        const previous = layoutOf([[0, 100, 50], [1, 200, 150]]);
        const current = layoutOf([[0, 0, 0], [1, 40, 80]]);

        const offset = anchorOffset(current, previous, { anchor: 1, anchorAt: 0 });
        expect(offset).toEqual({ dx: 60, dy: -30 });
        const anchored = anchorLayout(current, previous, { anchor: 1, anchorAt: 0 });
        expect(layoutPosition(anchored, 1)).toMatchObject({ x: 100, y: 50 });
        // 另一个节点整体跟着平移,相对关系不变
        expect(layoutPosition(anchored, 0)).toMatchObject({ x: 60, y: -30 });
    });

    it('anchorAt 缺省取上一帧的同名 key', () => {
        const previous = layoutOf([[7, 10, 20]]);
        const current = layoutOf([[7, 30, 40]]);
        expect(anchorOffset(current, previous, { anchor: 7 })).toEqual({ dx: -20, dy: -20 });
    });

    it('回退规则:没有上一帧 / 没给 anchor / 节点缺失 / 上一帧没有目标 -> 返回 null(不锚)', () => {
        const previous = layoutOf([[0, 100, 100]]);
        const current = layoutOf([[0, 10, 10]]);
        expect(anchorOffset(current, null, { anchor: 0 })).toBeNull();
        expect(anchorOffset(current, previous, {})).toBeNull();
        expect(anchorOffset(current, previous, { anchor: 5 })).toBeNull();
        expect(anchorOffset(current, previous, { anchor: 0, anchorAt: 9 })).toBeNull();
    });

    it('translateLayout:节点与连线端点一起平移,拓扑 / 顺序不变', () => {
        const layout: SceneLayout = {
            nodes: [{ key: 0, x: 0, y: 0 }, { key: 1, x: 70, y: 70 }],
            links: [{
                from: 0,
                to: 1,
                directed: true,
                start: { x: 10, y: 10 },
                end: { x: 60, y: 60 },
            }],
        };
        const moved = translateLayout(layout, 5, -3);
        expect(moved.nodes).toEqual([{ key: 0, x: 5, y: -3 }, { key: 1, x: 75, y: 67 }]);
        expect(moved.links[0]?.start).toEqual({ x: 15, y: 7 });
        expect(moved.links[0]?.end).toEqual({ x: 65, y: 57 });
        // 原布局不变(纯函数)
        expect(layout.nodes[0]).toEqual({ key: 0, x: 0, y: 0 });
    });

    it('anchorLayout 在锚点对齐时返回原布局(不复制,省一次分配)', () => {
        const previous = layoutOf([[0, 10, 10]]);
        const current = layoutOf([[0, 10, 10]]);
        expect(anchorLayout(current, previous, { anchor: 0 })).toBe(current);
    });
});

describe('自动锚定', () => {
    it('没给 anchor 时取"上一帧里 key 最小的共同节点"', () => {
        const previous = layoutOf([[5, 100, 0], [3, 50, 0], [9, 150, 0]]);
        const current = layoutOf([[9, 0, 0], [5, 100, 0], [12, 200, 0]]);

        const anchored = autoAnchorLayout(current, previous);
        // key 3 只在上一帧,不算共同节点;共同节点里最小的是 5,按它对齐
        expect(layoutPosition(anchored, 5)).toMatchObject({ x: 100, y: 0 });
        expect(layoutPosition(anchored, 9)).toMatchObject({ x: 0, y: 0 });
    });

    it('没有共同节点 / 没有上一帧时原样返回', () => {
        const previous = layoutOf([[1, 0, 0]]);
        const current = layoutOf([[2, 10, 10]]);
        expect(autoAnchorLayout(current, previous)).toBe(current);
        expect(autoAnchorLayout(current, null)).toBe(current);
    });

    it('字符串 key 按字典序取最小共同节点(不能直接相减)', () => {
        const previous = layoutOf([['N', 70, 0], ['K', 50, 0], ['S', 150, 0]]);
        const current = layoutOf([['S', 0, 0], ['N', 100, 0], ['E', 200, 0]]);

        const anchored = autoAnchorLayout(current, previous);
        // 共同节点里 "N" < "S",以 N 对齐:整体左移 30
        expect(layoutPosition(anchored, 'N')).toMatchObject({ x: 70, y: 0 });
        expect(layoutPosition(anchored, 'S')).toMatchObject({ x: -30, y: 0 });
    });
});
