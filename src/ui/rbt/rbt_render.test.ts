/**
 * 世界层落笔(ui/rbt/rbt_render.ts)的契约(进程内,跑在 happy-dom 里).
 *
 * 只验两件:落笔整批重建(不留陈旧节点 / 连线),以及包围盒从 `getBBox()` 量得、量不到就
 * 交 null(不猜).节点半径只写在 CSS;happy-dom 不做排版也不量,所以测试自己给 `<g>` 种一个
 * 假的 `getBBox()`.
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { create_svg_element } from 'miko_ui';

import {
    RBT_EDGE_CLASS,
    RBT_NODE_CLASS,
    RBT_WORLD_CLASS,
} from '@/ui/rbt/config';
import { buildTreeFromExpression } from '@/datastruct/rbt/rbt_parse';
import { layoutTree } from '@/ui/rbt/rbt_layout';
import { clearTree, drawTree } from '@/ui/rbt/rbt_render';

/** 世界层 `<g>`(与 ui/rbt/rbt_views.ts 建的同形) */
function createWorld(): SVGGElement {
    return create_svg_element({ tag: 'g' }, { class: RBT_WORLD_CLASS });
}

/** 三节点树的布局(解析成空树就说明测试写错了) */
function smallLayout() {
    const root = buildTreeFromExpression('10B(5R,15R)');
    if (root === null) throw new Error('表达式解析成了空树');
    return layoutTree(root);
}

/** 给世界层种一个假的 getBBox(真实浏览器里由渲染引擎给) */
function stubBBox(world: SVGGElement, box: { x: number; y: number; width: number; height: number }): void {
    Object.defineProperty(world, 'getBBox', { value: () => box, configurable: true });
}

describe('红黑树:世界层落笔与内容测量', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('落笔:整批重建世界层的子节点(先连线后节点),量到的包围盒原样换成平面矩形', () => {
        const world = createWorld();
        stubBBox(world, { x: 10, y: 20, width: 300, height: 200 });

        const bounds = drawTree(world, smallLayout());

        expect(world.querySelectorAll(`.${RBT_NODE_CLASS}`)).toHaveLength(3);
        expect(world.querySelectorAll(`.${RBT_EDGE_CLASS}`)).toHaveLength(2);
        // getBBox 的 x / y 就是 minX / minY:视口适应用的是"哪一块",不是"多宽多高"
        expect(bounds).toEqual({ minX: 10, minY: 20, width: 300, height: 200 });
    });

    it('每轮整批换掉上一轮:不会留下陈旧节点 / 连线', () => {
        const world = createWorld();
        stubBBox(world, { x: 0, y: 0, width: 100, height: 100 });

        drawTree(world, smallLayout());
        drawTree(world, smallLayout());

        expect(world.querySelectorAll(`.${RBT_NODE_CLASS}`)).toHaveLength(3);
        expect(world.querySelectorAll(`.${RBT_EDGE_CLASS}`)).toHaveLength(2);
    });

    it('量不出尺寸(happy-dom 的空矩形)就交 null:调用方据此不动视角,不猜一个包围盒', () => {
        const world = createWorld();
        // 不种假 getBBox:happy-dom 的实现恒为空 DOMRect
        expect(drawTree(world, smallLayout())).toBeNull();

        stubBBox(world, { x: 5, y: 5, width: 0, height: 80 });
        expect(drawTree(world, smallLayout())).toBeNull();
    });

    it('clearTree 之后世界层里一个节点 / 一条线都不剩', () => {
        const world = createWorld();
        stubBBox(world, { x: 0, y: 0, width: 100, height: 100 });
        drawTree(world, smallLayout());

        clearTree(world);

        expect(world.children).toHaveLength(0);
    });
});
