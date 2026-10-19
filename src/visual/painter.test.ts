/**
 * 视觉层增量落笔(visual/painter.ts)的契约(进程内,跑在 happy-dom 里).
 *
 * 只验 painter 自己的事:同一个 key / id 跨帧复用同一批 DOM 元素、消失的元素在落定前
 * 留着画退场、状态类与结构变体类叠加且切换时清旧值、透明度写到元素、有向指针的箭头
 * 仍然收在底边、包围盒只在落定帧从 `getBBox()` 量一次、清理后两个图层为空.
 *
 * 用手写帧而不是任何一种数据结构:轨迹 -> 帧的翻译归结构侧,这里不 import datastruct
 * (依赖方向只有 ui -> visual).
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { create_svg_element } from 'miko_ui';

import {
    VISUAL_LINK_CLASS,
    VISUAL_LINK_EDGE_CLASS,
    VISUAL_LINK_POINTER_CLASS,
    VISUAL_NODE_CLASS,
    VISUAL_NODE_LABEL_CLASS,
    VISUAL_POINTER_ARROW_CLASS,
    VISUAL_WORLD_CLASS,
    visualNodeVariantClass,
} from '@/visual/config';
import {
    ScenePainter,
    VISUAL_PAINTER_LINKS_CLASS,
    VISUAL_PAINTER_NODES_CLASS,
    VISUAL_STATE_CLASS_PREFIX,
} from '@/visual/painter';
import type { PaintLink, PaintNode } from '@/visual/painter';
import type { VisualPoint } from '@/visual/scene';

/** 世界层 `<g>`(与 visual/surface.ts 建的同形) */
function createWorld(): SVGGElement {
    return create_svg_element({ tag: 'g' }, { class: VISUAL_WORLD_CLASS });
}

/** 给世界层种一个假的 getBBox(真实浏览器里由渲染引擎给) */
function stubBBox(world: SVGGElement, box: { x: number; y: number; width: number; height: number }): void {
    Object.defineProperty(world, 'getBBox', { value: () => box, configurable: true });
}

/** 世界层里的节点组(文档顺序 = 落笔顺序) */
function nodeGroups(world: SVGGElement): SVGGElement[] {
    return [...world.querySelectorAll<SVGGElement>(`.${VISUAL_NODE_CLASS}`)];
}

/** 一个最小节点帧;要改哪个字段由调用方覆盖 */
function nodeOf(key: number, x: number, y: number, patch: Partial<PaintNode> = {}): PaintNode {
    return { key, at: { x, y }, label: String(key), ...patch };
}

/** 一条最小连线帧 */
function linkOf(id: string, start: VisualPoint, end: VisualPoint, patch: Partial<PaintLink> = {}): PaintLink {
    return { id, start, end, directed: true, ...patch };
}

/** 从箭头的 `d`("M x y L x y L x y Z")里取出三个顶点:尖端 / 左底角 / 右底角 */
function arrowPoints(d: string): [number, number][] {
    const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    return [[numbers[0], numbers[1]], [numbers[2], numbers[3]], [numbers[4], numbers[5]]];
}

/** 状态类全名:`visual-state--<state>` */
function stateClass(state: string): string {
    return `${VISUAL_STATE_CLASS_PREFIX}${state}`;
}

describe('场景增量落笔:稳定身份与状态', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('两次 apply 同一个节点 key:复用同一个 DOM 元素,位置 / 文字 / 变体就地更新', () => {
        const world = createWorld();
        const painter = new ScenePainter(world);

        painter.apply({ nodes: [nodeOf(1, 10, 20, { label: '10', variant: 'black' })], links: [] }, { settled: false });
        const first = nodeGroups(world)[0];

        painter.apply({ nodes: [nodeOf(1, 30, 40, { label: '12', variant: 'red' })], links: [] }, { settled: true });
        const second = nodeGroups(world)[0];

        expect(second).toBe(first);
        expect(second.getAttribute('transform')).toBe('translate(30,40)');
        expect(second.querySelector(`.${VISUAL_NODE_LABEL_CLASS}`)?.textContent).toBe('12');
        expect(second.classList.contains(visualNodeVariantClass('red'))).toBe(true);
        expect(second.classList.contains(visualNodeVariantClass('black'))).toBe(false);
        expect(nodeGroups(world)).toHaveLength(1);
    });

    it('新节点挂 entering,消失节点在落定前保留并挂 leaving,落定后移除', () => {
        const world = createWorld();
        const painter = new ScenePainter(world);
        const keep = nodeOf(2, 70, 0);

        painter.apply({ nodes: [nodeOf(1, 0, 0), keep], links: [] }, { settled: false });
        const [fresh, kept] = nodeGroups(world);
        expect(fresh.classList.contains(stateClass('entering'))).toBe(true);
        expect(kept.classList.contains(stateClass('entering'))).toBe(true);

        // 第二帧只剩 key 2:key 1 先留着画退场,key 2 仍是"还没落定"的新元素
        painter.apply({ nodes: [keep], links: [] }, { settled: false });
        expect(nodeGroups(world)).toHaveLength(2);
        expect(fresh.classList.contains(stateClass('leaving'))).toBe(true);
        expect(kept.classList.contains(stateClass('entering'))).toBe(true);

        // 落定帧:移除退场元素,留下的元素不能残留 entering / leaving
        painter.apply({ nodes: [keep], links: [] }, { settled: true });
        const remaining = nodeGroups(world);
        expect(remaining).toHaveLength(1);
        expect(remaining[0]).toBe(kept);
        expect(remaining[0].classList.contains(stateClass('entering'))).toBe(false);
        expect(remaining[0].classList.contains(stateClass('leaving'))).toBe(false);
    });

    it('落定帧里第一次出现的元素直接是最终态,不带 entering / leaving', () => {
        const world = createWorld();
        const painter = new ScenePainter(world);

        painter.apply({ nodes: [nodeOf(1, 0, 0)], links: [linkOf('1->2#0', { x: 0, y: 0 }, { x: 70, y: 0 })] }, { settled: true });

        const group = nodeGroups(world)[0];
        const line = world.querySelector(`.${VISUAL_LINK_CLASS}`);
        expect(group.classList.contains(stateClass('entering'))).toBe(false);
        expect(group.classList.contains(stateClass('leaving'))).toBe(false);
        expect(line?.classList.contains(stateClass('entering'))).toBe(false);
        expect(line?.classList.contains(stateClass('leaving'))).toBe(false);
    });

    it('状态类与结构变体类叠加,状态切换清旧类', () => {
        const world = createWorld();
        const painter = new ScenePainter(world);
        const baseNode = nodeOf(1, 0, 0, { label: '7', variant: 'red', state: 'active' });
        const baseLink = linkOf('1->2#0', { x: 0, y: 0 }, { x: 70, y: 0 }, {
            directed: false,
            state: 'ghost',
        });

        painter.apply({ nodes: [baseNode], links: [baseLink] }, { settled: false });
        const group = nodeGroups(world)[0];
        const line = world.querySelector(`.${VISUAL_LINK_CLASS}`);
        expect(group.classList.contains(visualNodeVariantClass('red'))).toBe(true);
        expect(group.classList.contains(stateClass('active'))).toBe(true);
        expect(line?.classList.contains(stateClass('ghost'))).toBe(true);

        painter.apply({
            nodes: [{ ...baseNode, state: 'found' }],
            links: [{ ...baseLink, state: 'path' }],
        }, { settled: true });

        // 旧状态清掉、新状态挂上,结构变体与方向变体都不受影响
        expect(group.classList.contains(stateClass('active'))).toBe(false);
        expect(group.classList.contains(stateClass('found'))).toBe(true);
        expect(group.classList.contains(visualNodeVariantClass('red'))).toBe(true);
        expect(line?.classList.contains(stateClass('ghost'))).toBe(false);
        expect(line?.classList.contains(stateClass('path'))).toBe(true);
        expect(line?.classList.contains(VISUAL_LINK_EDGE_CLASS)).toBe(true);
    });

    it('透明度写到元素:节点组 / 线段 / 箭头,缺省 1', () => {
        const world = createWorld();
        const painter = new ScenePainter(world);

        painter.apply({
            nodes: [nodeOf(1, 0, 0, { opacity: 0.4 })],
            links: [linkOf('1->2#0', { x: 0, y: 0 }, { x: 100, y: 0 }, { opacity: 0.5 })],
        }, { settled: false });

        const group = nodeGroups(world)[0];
        const line = world.querySelector(`.${VISUAL_LINK_CLASS}`);
        const arrow = world.querySelector(`.${VISUAL_POINTER_ARROW_CLASS}`);
        expect(group.getAttribute('opacity')).toBe('0.4');
        expect(line?.getAttribute('opacity')).toBe('0.5');
        expect(arrow?.getAttribute('opacity')).toBe('0.5');

        // 省略 opacity = 1,并且动画中途写进去的值在落定帧被精确覆盖
        painter.apply({
            nodes: [nodeOf(1, 0, 0)],
            links: [linkOf('1->2#0', { x: 0, y: 0 }, { x: 100, y: 0 })],
        }, { settled: true });
        expect(group.getAttribute('opacity')).toBe('1');
        expect(line?.getAttribute('opacity')).toBe('1');
        expect(arrow?.getAttribute('opacity')).toBe('1');
    });

    it('连线复用:同一个 id 是同一个线段 / 箭头,端点就更新,线仍收在箭头底边', () => {
        const world = createWorld();
        const painter = new ScenePainter(world);

        painter.apply({
            nodes: [],
            links: [linkOf('1->2#0', { x: 0, y: 0 }, { x: 100, y: 0 })],
        }, { settled: false });
        const line = world.querySelector(`.${VISUAL_LINK_CLASS}`);
        const arrow = world.querySelector(`.${VISUAL_POINTER_ARROW_CLASS}`);
        expect(line?.classList.contains(VISUAL_LINK_POINTER_CLASS)).toBe(true);

        painter.apply({
            nodes: [],
            links: [linkOf('1->2#0', { x: 0, y: 0 }, { x: 100, y: 50 })],
        }, { settled: true });

        expect(world.querySelector(`.${VISUAL_LINK_CLASS}`)).toBe(line);
        expect(world.querySelector(`.${VISUAL_POINTER_ARROW_CLASS}`)).toBe(arrow);
        const current = world.querySelector(`.${VISUAL_LINK_CLASS}`);
        expect([Number(current?.getAttribute('x1')), Number(current?.getAttribute('y1'))]).toEqual([0, 0]);
        // 线段终点 = 箭头底边中点(不是尖端):否则线头会从三角形靠近尖端的窄处戳出来
        const [tip, left, right] = arrowPoints(arrow?.getAttribute('d') ?? '');
        expect(tip).toEqual([100, 50]);
        expect(Number(current?.getAttribute('x2'))).toBeCloseTo((left[0] + right[0]) / 2, 6);
        expect(Number(current?.getAttribute('y2'))).toBeCloseTo((left[1] + right[1]) / 2, 6);
        expect(world.querySelectorAll(`.${VISUAL_LINK_CLASS}`)).toHaveLength(1);
        expect(world.querySelectorAll(`.${VISUAL_POINTER_ARROW_CLASS}`)).toHaveLength(1);
    });

    it('无向边:线段画到终点,没有箭头', () => {
        const world = createWorld();
        const painter = new ScenePainter(world);

        painter.apply({
            nodes: [],
            links: [linkOf('1->2#0', { x: 26, y: 0 }, { x: 44, y: 0 }, { directed: false })],
        }, { settled: true });

        const line = world.querySelector(`.${VISUAL_LINK_CLASS}`);
        expect(line?.classList.contains(VISUAL_LINK_EDGE_CLASS)).toBe(true);
        expect(line?.classList.contains(VISUAL_LINK_POINTER_CLASS)).toBe(false);
        expect([Number(line?.getAttribute('x2')), Number(line?.getAttribute('y2'))]).toEqual([44, 0]);
        expect(world.querySelector(`.${VISUAL_POINTER_ARROW_CLASS}`)).toBeNull();
    });

    it('连线也只出现 / 只消失时挂类,落定后移除', () => {
        const world = createWorld();
        const painter = new ScenePainter(world);
        const keep = linkOf('1->2#0', { x: 0, y: 0 }, { x: 70, y: 0 }, { directed: false });

        painter.apply({ nodes: [], links: [linkOf('2->3#0', { x: 0, y: 0 }, { x: 70, y: 70 }, { directed: false })] }, { settled: false });
        const gone = world.querySelector(`.${VISUAL_LINK_CLASS}`);
        expect(gone?.classList.contains(stateClass('entering'))).toBe(true);

        painter.apply({ nodes: [], links: [keep] }, { settled: false });
        expect(world.querySelectorAll(`.${VISUAL_LINK_CLASS}`)).toHaveLength(2);
        expect(gone?.classList.contains(stateClass('leaving'))).toBe(true);
        const kept = [...world.querySelectorAll(`.${VISUAL_LINK_CLASS}`)][1];
        expect(kept.classList.contains(stateClass('entering'))).toBe(true);

        painter.apply({ nodes: [], links: [keep] }, { settled: true });
        expect(world.querySelectorAll(`.${VISUAL_LINK_CLASS}`)).toHaveLength(1);
        expect(world.querySelector(`.${VISUAL_LINK_CLASS}`)).toBe(kept);
        expect(kept.classList.contains(stateClass('entering'))).toBe(false);
    });

    it('settled 帧返回 getBBox 量到的 PlaneBox,动画中途不量(返回 null)', () => {
        const world = createWorld();
        stubBBox(world, { x: 10, y: 20, width: 300, height: 200 });
        const painter = new ScenePainter(world);
        const scene = { nodes: [nodeOf(1, 0, 0)], links: [] };

        expect(painter.measure()).toEqual({ minX: 10, minY: 20, width: 300, height: 200 });
        expect(painter.apply(scene, { settled: false })).toBeNull();
        expect(painter.apply(scene, { settled: true })).toEqual({ minX: 10, minY: 20, width: 300, height: 200 });
    });

    it('量不出尺寸(happy-dom 的空矩形)就交 null:不猜一个包围盒', () => {
        const world = createWorld();
        const painter = new ScenePainter(world);

        expect(painter.measure()).toBeNull();
        expect(painter.apply({ nodes: [nodeOf(1, 0, 0)], links: [] }, { settled: true })).toBeNull();
    });

    it('构造时接管世界层:只剩"先连线层、后节点层"两层,clear 后两层清空', () => {
        const world = createWorld();
        world.append(create_svg_element({ tag: 'g' }, { class: 'stale-static-scene' }));
        const painter = new ScenePainter(world);

        // z 序:连线层在前(下),节点层在后(上),节点永远盖在线上
        expect([...world.children].map((child) => child.getAttribute('class')))
            .toEqual([VISUAL_PAINTER_LINKS_CLASS, VISUAL_PAINTER_NODES_CLASS]);

        painter.apply({
            nodes: [nodeOf(1, 0, 0)],
            links: [linkOf('1->2#0', { x: 0, y: 0 }, { x: 70, y: 0 })],
        }, { settled: false });

        const linksLayer = world.querySelector(`.${VISUAL_PAINTER_LINKS_CLASS}`);
        const nodesLayer = world.querySelector(`.${VISUAL_PAINTER_NODES_CLASS}`);
        expect(linksLayer?.querySelectorAll(`.${VISUAL_LINK_CLASS}`)).toHaveLength(1);
        expect(nodesLayer?.querySelectorAll(`.${VISUAL_NODE_CLASS}`)).toHaveLength(1);

        painter.clear();
        expect(linksLayer?.children).toHaveLength(0);
        expect(nodesLayer?.children).toHaveLength(0);
        // 图层本身保留:下一次 apply 继续复用
        expect(world.children).toHaveLength(2);

        painter.dispose();
        expect(world.children).toHaveLength(0);
    });
});
