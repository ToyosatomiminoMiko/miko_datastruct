/**
 * 视觉层落笔(visual/render.ts)的契约(进程内,跑在 happy-dom 里).
 *
 * 只验视觉层自己的事:场景里的节点 / 指针被落成什么类名的 SVG、文档顺序(先指针后节点)、
 * 语义变体挂成修饰类,以及包围盒从 `getBBox()` 量得、量不到就交 null(不猜).
 *
 * 用**手写的场景**而不是任何一种数据结构:layout -> 场景的翻译各归各的结构,这里不 import
 * datastruct(依赖方向只有 ui -> visual).
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { create_svg_element } from 'miko_ui';

import {
    VISUAL_NODE_CLASS,
    VISUAL_NODE_LABEL_CLASS,
    VISUAL_NODE_SHAPE_CLASS,
    VISUAL_POINTER_CLASS,
    VISUAL_WORLD_CLASS,
    visualNodeVariantClass,
} from '@/visual/config';
import { clearScene, renderScene } from '@/visual/render';
import type { VisualScene } from '@/visual/scene';

/** 世界层 `<g>`(与 visual/surface.ts 建的同形) */
function createWorld(): SVGGElement {
    return create_svg_element({ tag: 'g' }, { class: VISUAL_WORLD_CLASS });
}

/** 两个节点 + 一条指针的最小场景:值 / 变体 / 坐标都不同,便于断言 */
function smallScene(): VisualScene {
    return {
        nodes: [
            { at: { x: 0, y: 0 }, label: '10', variant: 'black' },
            { at: { x: 70, y: 70 }, label: '5', variant: 'red' },
        ],
        pointers: [{ from: { x: 0, y: 0 }, to: { x: 70, y: 70 } }],
    };
}

/** 给世界层种一个假的 getBBox(真实浏览器里由渲染引擎给) */
function stubBBox(world: SVGGElement, box: { x: number; y: number; width: number; height: number }): void {
    Object.defineProperty(world, 'getBBox', { value: () => box, configurable: true });
}

describe('视觉层:场景落笔与内容测量', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('落笔:节点组带位置 / 变体 / 形状 / 值文字,指针带两端坐标', () => {
        const world = createWorld();
        stubBBox(world, { x: 0, y: 0, width: 100, height: 100 });

        renderScene(world, smallScene());

        const nodes = [...world.querySelectorAll(`.${VISUAL_NODE_CLASS}`)];
        expect(nodes).toHaveLength(2);
        expect(nodes.map((node) => node.getAttribute('transform'))).toEqual([
            'translate(0,0)',
            'translate(70,70)',
        ]);
        // 变体挂在节点组上(组是"这个节点"的语义单位),形状 / 值文字是它的两个孩子
        expect(nodes[0].classList.contains(visualNodeVariantClass('black'))).toBe(true);
        expect(nodes[1].classList.contains(visualNodeVariantClass('red'))).toBe(true);
        expect(nodes[0].querySelector(`.${VISUAL_NODE_SHAPE_CLASS}`)).not.toBeNull();
        expect([...world.querySelectorAll(`.${VISUAL_NODE_LABEL_CLASS}`)].map((label) => label.textContent))
            .toEqual(['10', '5']);

        const pointer = world.querySelector(`.${VISUAL_POINTER_CLASS}`);
        expect(pointer?.tagName.toLowerCase()).toBe('line');
        expect(['x1', 'y1', 'x2', 'y2'].map((name) => pointer?.getAttribute(name)))
            .toEqual(['0', '0', '70', '70']);
    });

    it('文档顺序:先指针后节点(节点盖在线上)', () => {
        const world = createWorld();
        stubBBox(world, { x: 0, y: 0, width: 100, height: 100 });

        renderScene(world, smallScene());

        expect([...world.children].map((child) => child.tagName.toLowerCase()))
            .toEqual(['line', 'g', 'g']);
    });

    it('没有变体的节点只挂基础类(变体是可选语义,不是必填)', () => {
        const world = createWorld();
        stubBBox(world, { x: 0, y: 0, width: 100, height: 100 });

        renderScene(world, { nodes: [{ at: { x: 1, y: 2 }, label: 'x' }], pointers: [] });

        const node = world.querySelector(`.${VISUAL_NODE_CLASS}`);
        expect(node?.getAttribute('class')).toBe(VISUAL_NODE_CLASS);
    });

    it('量到的包围盒原样换成平面矩形(getBBox 的 x / y 就是 minX / minY)', () => {
        const world = createWorld();
        stubBBox(world, { x: 10, y: 20, width: 300, height: 200 });

        expect(renderScene(world, smallScene())).toEqual({ minX: 10, minY: 20, width: 300, height: 200 });
    });

    it('每轮整批换掉上一轮:不会留下陈旧节点 / 指针', () => {
        const world = createWorld();
        stubBBox(world, { x: 0, y: 0, width: 100, height: 100 });

        renderScene(world, smallScene());
        renderScene(world, smallScene());

        expect(world.querySelectorAll(`.${VISUAL_NODE_CLASS}`)).toHaveLength(2);
        expect(world.querySelectorAll(`.${VISUAL_POINTER_CLASS}`)).toHaveLength(1);
    });

    it('量不出尺寸(happy-dom 的空矩形)就交 null:调用方据此不动视角,不猜一个包围盒', () => {
        const world = createWorld();
        // 不种假 getBBox:happy-dom 的实现恒为空 DOMRect
        expect(renderScene(world, smallScene())).toBeNull();

        stubBBox(world, { x: 5, y: 5, width: 0, height: 80 });
        expect(renderScene(world, smallScene())).toBeNull();
    });

    it('clearScene 之后世界层里一个节点 / 一条指针都不剩', () => {
        const world = createWorld();
        stubBBox(world, { x: 0, y: 0, width: 100, height: 100 });
        renderScene(world, smallScene());

        clearScene(world);

        expect(world.children).toHaveLength(0);
    });
});
