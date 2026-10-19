/**
 * 视觉层落笔(visual/render.ts)的契约(进程内,跑在 happy-dom 里).
 *
 * 只验视觉层自己的事:场景里的节点 / 连线被落成什么类名的 SVG、有向指针带箭头而
 * 无向边不带、文档顺序(先连线后节点)、语义变体挂成修饰类,以及包围盒从 `getBBox()`
 * 量得、量不到就交 null(不猜).
 *
 * 用**手写的场景**而不是任何一种数据结构:layout -> 场景的翻译各归各的结构,这里不 import
 * datastruct(依赖方向只有 ui -> visual).
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { create_svg_element } from 'miko_ui';

import {
    VISUAL_ARROW_HALF_WIDTH,
    VISUAL_ARROW_LENGTH,
    VISUAL_LINK_CLASS,
    VISUAL_LINK_EDGE_CLASS,
    VISUAL_LINK_POINTER_CLASS,
    VISUAL_NODE_CLASS,
    VISUAL_NODE_LABEL_CLASS,
    VISUAL_NODE_RADIUS,
    VISUAL_NODE_SHAPE_CLASS,
    VISUAL_POINTER_ARROW_CLASS,
    VISUAL_WORLD_CLASS,
    visualNodeVariantClass,
} from '@/visual/config';
import { clearScene, renderScene } from '@/visual/render';
import type { VisualScene } from '@/visual/scene';

/** 世界层 `<g>`(与 visual/surface.ts 建的同形) */
function createWorld(): SVGGElement {
    return create_svg_element({ tag: 'g' }, { class: VISUAL_WORLD_CLASS });
}

/** 两个节点 + 一条有向指针的最小场景:值 / 变体 / 坐标都不同,便于断言 */
function smallScene(): VisualScene {
    return {
        nodes: [
            { at: { x: 0, y: 0 }, label: '10', variant: 'black' },
            { at: { x: 70, y: 70 }, label: '5', variant: 'red' },
        ],
        links: [{ from: { x: 0, y: 0 }, to: { x: 70, y: 70 }, directed: true }],
    };
}

/** 给世界层种一个假的 getBBox(真实浏览器里由渲染引擎给) */
function stubBBox(world: SVGGElement, box: { x: number; y: number; width: number; height: number }): void {
    Object.defineProperty(world, 'getBBox', { value: () => box, configurable: true });
}

/** 从箭头的 `d`("M x y L x y L x y Z")里取出三个顶点:尖端 / 左底角 / 右底角 */
function arrowPoints(d: string): [number, number][] {
    const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    return [[numbers[0], numbers[1]], [numbers[2], numbers[3]], [numbers[4], numbers[5]]];
}

describe('视觉层:场景落笔与内容测量', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('落笔:节点组带位置 / 变体 / 形状 / 值文字,连线带两端坐标', () => {
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

        const link = world.querySelector(`.${VISUAL_LINK_CLASS}`);
        expect(link?.tagName.toLowerCase()).toBe('line');
        expect(link?.classList.contains(VISUAL_LINK_POINTER_CLASS)).toBe(true);
        expect(link?.classList.contains(VISUAL_LINK_EDGE_CLASS)).toBe(false);
        // 线段起点 = 指针起点;终点在箭头底边(尖端往回退一个箭头长度),不是尖端
        const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2']
            .map((name) => Number(link?.getAttribute(name)));
        expect([x1, y1]).toEqual([0, 0]);
        expect(x2).toBeCloseTo(70 - VISUAL_ARROW_LENGTH / Math.SQRT2, 6);
        expect(y2).toBeCloseTo(70 - VISUAL_ARROW_LENGTH / Math.SQRT2, 6);

        // 形状半径由 TS 常量写进 r 属性(不是 CSS)
        expect(world.querySelector(`.${VISUAL_NODE_SHAPE_CLASS}`)?.getAttribute('r'))
            .toBe(String(VISUAL_NODE_RADIUS));
    });

    it('有向指针:末端一枚箭头,尖端落在终点,线段收在箭头底边', () => {
        const world = createWorld();
        stubBBox(world, { x: 0, y: 0, width: 100, height: 100 });

        renderScene(world, smallScene());

        const arrow = world.querySelector(`.${VISUAL_POINTER_ARROW_CLASS}`);
        expect(arrow?.tagName.toLowerCase()).toBe('path');
        const [tip, left, right] = arrowPoints(arrow?.getAttribute('d') ?? '');
        expect(tip).toEqual([70, 70]);
        // 线段终点 = 底边中点(不是尖端):否则线头会从三角形靠近尖端的窄处戳出来
        const link = world.querySelector(`.${VISUAL_LINK_CLASS}`);
        expect(Number(link?.getAttribute('x2'))).toBeCloseTo((left[0] + right[0]) / 2, 6);
        expect(Number(link?.getAttribute('y2'))).toBeCloseTo((left[1] + right[1]) / 2, 6);
        // 从线段终点到尖端正好一个箭头长度
        expect(Math.hypot(tip[0] - Number(link?.getAttribute('x2')),
            tip[1] - Number(link?.getAttribute('y2')))).toBeCloseTo(VISUAL_ARROW_LENGTH, 6);
        // 有向指针 = 1 条线 + 1 枚箭头
        expect(world.querySelectorAll(`.${VISUAL_LINK_CLASS}`)).toHaveLength(1);
        expect(world.querySelectorAll(`.${VISUAL_POINTER_ARROW_CLASS}`)).toHaveLength(1);
    });

    it('连线比箭头还短时:线段不退到起点之后,整条线就是那枚箭头', () => {
        const world = createWorld();
        stubBBox(world, { x: 0, y: 0, width: 100, height: 100 });

        // 5px 的连线 < 10px 的箭头:底边最多退到起点,不能反向画
        renderScene(world, {
            nodes: [
                { at: { x: 0, y: 0 }, label: 'A' },
                { at: { x: 5, y: 0 }, label: 'B' },
            ],
            links: [{ from: { x: 0, y: 0 }, to: { x: 5, y: 0 }, directed: true }],
        });

        const link = world.querySelector(`.${VISUAL_LINK_CLASS}`);
        expect([Number(link?.getAttribute('x2')), Number(link?.getAttribute('y2'))]).toEqual([0, 0]);
        expect(world.querySelector(`.${VISUAL_POINTER_ARROW_CLASS}`)?.getAttribute('d'))
            .toContain('M 5 0');
    });

    it('箭头是尖的:底宽小于长度(张角不到 90°)', () => {
        // 底宽 = 长度时是一枚等腰直角三角形,放大后像鼠标指针而不是箭头;这条锁住
        // VISUAL_ARROW_HALF_WIDTH / VISUAL_ARROW_LENGTH 的比例意图,数值可以调,比例不能反.
        expect(VISUAL_ARROW_HALF_WIDTH * 2).toBeLessThan(VISUAL_ARROW_LENGTH);
    });

    it('无向边:只有线段,不画箭头', () => {
        const world = createWorld();
        stubBBox(world, { x: 0, y: 0, width: 100, height: 100 });

        renderScene(world, {
            nodes: [
                { at: { x: 0, y: 0 }, label: 'A' },
                { at: { x: 70, y: 0 }, label: 'B' },
            ],
            links: [{ from: { x: 26, y: 0 }, to: { x: 44, y: 0 }, directed: false }],
        });

        const link = world.querySelector(`.${VISUAL_LINK_CLASS}`);
        expect(link?.classList.contains(VISUAL_LINK_EDGE_CLASS)).toBe(true);
        expect(link?.classList.contains(VISUAL_LINK_POINTER_CLASS)).toBe(false);
        expect(world.querySelectorAll(`.${VISUAL_POINTER_ARROW_CLASS}`)).toHaveLength(0);
    });

    it('文档顺序:先连线后节点(节点盖在线上)', () => {
        const world = createWorld();
        stubBBox(world, { x: 0, y: 0, width: 100, height: 100 });

        renderScene(world, smallScene());

        expect([...world.children].map((child) => child.tagName.toLowerCase()))
            .toEqual(['line', 'path', 'g', 'g']);
    });

    it('没有变体的节点只挂基础类(变体是可选语义,不是必填)', () => {
        const world = createWorld();
        stubBBox(world, { x: 0, y: 0, width: 100, height: 100 });

        renderScene(world, { nodes: [{ at: { x: 1, y: 2 }, label: 'x' }], links: [] });

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
        expect(world.querySelectorAll(`.${VISUAL_LINK_CLASS}`)).toHaveLength(1);
        expect(world.querySelectorAll(`.${VISUAL_POINTER_ARROW_CLASS}`)).toHaveLength(1);
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
