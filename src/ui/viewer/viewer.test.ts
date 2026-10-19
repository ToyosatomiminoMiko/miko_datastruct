/**
 * JSON 查看器行为层(ui/viewer/viewer.ts 的 mountViewer)的契约(happy-dom,进程内).
 *
 * 钉四件事:
 * 1. 首屏默认示例真的走完"解析 -> 布局 -> 画布 -> 两段列表";
 * 2. 输入换一份 JSON 后,画布与列表跟着换;非法 JSON 只显示一行错误,上一轮内容清干净;
 * 3. 实体列表 / 检查列表的行数与状态、FAIL 定位按钮;
 * 4. 「定位」与「回正视图」分别落到视口的 focusPoint / fitViewport.
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    VIEWER_DOM,
    VIEWER_EMPTY_DOCUMENT_HINT_TEXT,
    VIEWER_EMPTY_HINT_TEXT,
    VIEWER_ERROR_UI_PREFIX,
    VIEWER_EXAMPLE_JSON,
    VIEWER_FIT_BUTTON_TEXT,
} from '@/ui/viewer/config';
import { mountViewer } from '@/ui/viewer/viewer';
import {
    VISUAL_NODE_CLASS,
    VISUAL_NODE_LABEL_CLASS,
    VISUAL_POINTER_CLASS,
    VISUAL_WORLD_CLASS,
} from '@/visual/config';
import { DEFAULT_DESKTOP_CONFIG } from 'miko_ui';
import { expectNoDuplicateIds } from '@/test_support/desktop_test_helpers';

/** 按 id 取刚挂载出来的元素(取不到直接抛错,而不是让断言读 null) */
function byId<T extends Element>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`桌面上找不到 #${id}`);
    return element as unknown as T;
}

/** 取编辑器里的真 textarea */
function editorTextarea(): HTMLTextAreaElement {
    const textarea = byId<HTMLElement>(VIEWER_DOM.editorId).querySelector('textarea');
    if (!textarea) throw new Error(`#${VIEWER_DOM.editorId} 里找不到 textarea`);
    return textarea;
}

/** 往编辑器喂一段源码并派发 input(与用户敲键盘走同一条链路) */
function setSource(input: HTMLTextAreaElement, source: string): void {
    input.value = source;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 诊断窗口里某一级的消息(库的条目文案形如 `[error] ...`) */
function diagnosticMessages(level: 'warning' | 'error'): string[] {
    return [...document.querySelectorAll(`#${VIEWER_DOM.diagnosticsPanelId} .diagnostic-${level}`)]
        .map((node) => node.textContent ?? '');
}

/** 挂一次查看器,交回输入框 / 世界层 / 那棵 SVG */
function mountPanel(): {
    input: HTMLTextAreaElement;
    world: SVGGElement;
    tree: SVGSVGElement;
} {
    const host = document.createElement('div');
    document.body.append(host);
    mountViewer(host);
    const tree = byId<SVGSVGElement>(VIEWER_DOM.treeId);
    const world = tree.querySelector<SVGGElement>(`.${VISUAL_WORLD_CLASS}`);
    if (!world) throw new Error('树里找不到世界层');
    return { input: editorTextarea(), world, tree };
}

/** 世界层里的节点 / 连线 */
function treeNodes(tree: SVGSVGElement): Element[] {
    return [...tree.querySelectorAll(`.${VISUAL_NODE_CLASS}`)];
}

function treePointers(tree: SVGSVGElement): Element[] {
    return [...tree.querySelectorAll(`.${VISUAL_POINTER_CLASS}`)];
}

/** 节点值(按文档顺序) */
function treeLabels(tree: SVGSVGElement): string[] {
    return [...tree.querySelectorAll(`.${VISUAL_NODE_LABEL_CLASS}`)].map((label) => label.textContent ?? '');
}

/**
 * 从 transform 里拆出平移与缩放.
 *
 * 世界层是 `translate(x y) scale(k)`(视口写的),节点组是 `translate(x,y)`(渲染层写的,
 * 没有缩放),两种写法都收;没有 scale 时 k 取 1.
 */
function parseTransform(transform: string): { x: number; y: number; k: number } {
    const match = /^translate\((-?[\d.]+)[ ,](-?[\d.]+)\)(?: scale\((-?[\d.]+)\))?$/.exec(transform);
    if (!match) throw new Error(`transform 形状不对: ${transform}`);
    return { x: Number(match[1]), y: Number(match[2]), k: match[3] === undefined ? 1 : Number(match[3]) };
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('查看器:首屏默认示例', () => {
    it('默认 JSON 种进编辑器,画布画出 5 个节点 / 4 条指针,两段列表就位', () => {
        const { input, tree } = mountPanel();

        expect(input.value).toBe(VIEWER_EXAMPLE_JSON);
        // 合法输入没有诊断消息
        expect(diagnosticMessages('warning')).toEqual([]);
        expect(diagnosticMessages('error')).toEqual([]);
        expect(treeNodes(tree)).toHaveLength(5);
        expect(treePointers(tree)).toHaveLength(4);
        expect(treeLabels(tree).sort()).toEqual(['1', '10', '15', '5', '8']);

        // 实体与检查在两个窗口里:实体列表与检查列表各挂在各自的面板下
        expect(byId<HTMLElement>(VIEWER_DOM.entityListId).closest(`#${VIEWER_DOM.entityPanelId}`)).not.toBeNull();
        expect(byId<HTMLElement>(VIEWER_DOM.checkListId).closest(`#${VIEWER_DOM.checkPanelId}`)).not.toBeNull();
        expect(byId<HTMLElement>(VIEWER_DOM.editorPanelId).children).toHaveLength(1);

        // 实体:每个节点一行,行末都有「定位」
        expect(document.querySelectorAll('.entity-row')).toHaveLength(5);
        expect(document.querySelectorAll('.entity-row .row-locate-btn')).toHaveLength(5);
        // 检查:4 条,PASS 3 / FAIL 1;抬头由总数与失败数拼出来
        expect(document.querySelectorAll('.check-row')).toHaveLength(4);
        expect(document.querySelectorAll('.check-row .is-pass')).toHaveLength(3);
        expect(document.querySelectorAll('.check-row .is-fail')).toHaveLength(1);
        expect(byId<HTMLElement>(VIEWER_DOM.checkSummaryId).textContent).toBe('4 条中 1 条 FAIL');
        // 只有 FAIL 行有「定位」
        expect(document.querySelectorAll('.check-row .row-locate-btn')).toHaveLength(1);

        // 红 / 黑语义变体来自 JSON 的 attrs.color
        expect(tree.querySelectorAll('.visual-node--red')).toHaveLength(2);
        expect(tree.querySelectorAll('.visual-node--black')).toHaveLength(3);
    });

    it('编辑器行号 / 高亮层随首屏示例刷新(程序化写值不派发 input 的坑)', () => {
        mountPanel();
        const host = byId<HTMLElement>(VIEWER_DOM.editorId);
        expect(host.querySelector('.code-editor-lines')?.textContent).not.toBe('1');
        expect(host.querySelector('.code-editor-highlight-code')?.textContent).toBe(VIEWER_EXAMPLE_JSON);
    });

    it('文档里没有重复 id,桌面只有一套(重复挂载同一块宿主不会叠第二套)', () => {
        const host = document.createElement('div');
        document.body.append(host);
        mountViewer(host);
        mountViewer(host);

        expectNoDuplicateIds();
        expect(host.querySelectorAll('.window-layer')).toHaveLength(1);
        expect(host.querySelectorAll('.window')).toHaveLength(5);
        expect(host.querySelectorAll('.dock .dock-btn')).toHaveLength(5);
        expect(host.querySelectorAll(`.${VISUAL_NODE_CLASS}`)).toHaveLength(5);
    });
});

describe('查看器:输入变化', () => {
    it('换成图 JSON:4 个节点排在圆周上,7 条边画成 7 条线段', () => {
        const { input, tree } = mountPanel();
        setSource(input, JSON.stringify({
            nodes: [
                { key: 0, label: 'K' },
                { key: 1, label: 'N' },
                { key: 2, label: 'S' },
                { key: 3, label: 'E' },
            ],
            edges: [
                { a: 0, b: 1 }, { a: 0, b: 1 },
                { a: 0, b: 2 }, { a: 0, b: 2 },
                { a: 0, b: 3 }, { a: 1, b: 3 }, { a: 2, b: 3 },
            ],
        }));

        expect(treeLabels(tree).sort()).toEqual(['E', 'K', 'N', 'S']);
        expect(treePointers(tree)).toHaveLength(7);
        // 图分量是一个圆:节点 y 不全相同(不是树那样按层排)
        const transforms = treeNodes(tree).map((node) => parseTransform(node.getAttribute('transform') ?? ''));
        expect(new Set(transforms.map((position) => position.y)).size).toBeGreaterThan(1);
        // 实体 / 检查跟着换
        expect(document.querySelectorAll('.entity-row')).toHaveLength(4);
        expect(document.querySelectorAll('.check-row')).toHaveLength(0);
        expect(byId<HTMLElement>(VIEWER_DOM.checkSummaryId).textContent).toBe('0 条中 0 条 FAIL');
    });

    it('空输入:只留一行提示,画布与两段列表都清空', () => {
        const { input, tree } = mountPanel();
        setSource(input, '   ');

        expect(diagnosticMessages('warning')).toEqual([`[warning] ${VIEWER_EMPTY_HINT_TEXT}`]);
        expect(diagnosticMessages('error')).toEqual([]);
        expect(treeNodes(tree)).toHaveLength(0);
        expect(document.querySelectorAll('.entity-row')).toHaveLength(0);
        expect(document.querySelectorAll('.check-row')).toHaveLength(0);
    });

    it('非法 JSON / 悬空引用:只显示一行错误,上一轮内容清干净', () => {
        const { input, tree } = mountPanel();
        setSource(input, '{"nodes":[{"key":0,"label":"A"}],"pointers":[{"from":0,"to":9}]}');

        expect(diagnosticMessages('error')).toEqual([
            `[error] ${VIEWER_ERROR_UI_PREFIX}pointers[0].to: 引用了不存在的节点 key: 9`,
        ]);
        expect(diagnosticMessages('warning')).toEqual([]);
        expect(treeNodes(tree)).toHaveLength(0);
        expect(document.querySelectorAll('.entity-row')).toHaveLength(0);
        expect(document.querySelectorAll('.check-row')).toHaveLength(0);
    });

    it('没有节点也没有检查的空文档:提示"没有东西可画"', () => {
        const { input } = mountPanel();
        setSource(input, '{}');
        expect(diagnosticMessages('warning')).toEqual([`[warning] ${VIEWER_EMPTY_DOCUMENT_HINT_TEXT}`]);
        expect(diagnosticMessages('error')).toEqual([]);
    });

    it('只有检查、没有节点的文档:检查列表照常展示', () => {
        const { input } = mountPanel();
        setSource(input, JSON.stringify({
            nodes: [],
            checks: [{ name: '空结构也是结构', passed: true }],
        }));
        expect(document.querySelectorAll('.entity-row')).toHaveLength(0);
        expect(document.querySelectorAll('.check-row')).toHaveLength(1);
        expect(byId<HTMLElement>(VIEWER_DOM.checkSummaryId).textContent).toBe('1 条中 0 条 FAIL');
    });
});

describe('查看器:列表交互', () => {
    it('FAIL 行可展开详情;换一份内容后重建行,展开态仍保留', () => {
        const { input } = mountPanel();
        const details = () => document.querySelector<HTMLDetailsElement>('.check-row .viewer-details');
        expect(details()?.open).toBe(false);
        details()!.open = true;

        // 改一句话(内容键变化 -> 行重建),但"用户展开了"该跟着走
        setSource(input, VIEWER_EXAMPLE_JSON.replace('两侧黑高不同', '两侧黑高不一致'));
        expect(details()).not.toBeNull();
        expect(details()?.open).toBe(true);
    });

    it('「定位」把对应节点移到视口中心;「回正视图」再回到适应视角', () => {
        const bbox = vi.spyOn(SVGGraphicsElement.prototype, 'getBBox')
            .mockReturnValue(new DOMRect(0, 0, 200, 100));
        // 视口尺寸必须在挂载前就位:自动适应在 contentChanged 那一刻就算,之后再改尺寸
        // 不会自动重算(happy-dom 的 ResizeObserver 不会像浏览器那样补一次).
        const widthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
        const heightSpy = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
        try {
            const { tree } = mountPanel();
            const viewport = byId<HTMLElement>(VIEWER_DOM.viewportId);
            expect(viewport.clientWidth).toBe(800);

            const world = tree.querySelector<SVGGElement>(`.${VISUAL_WORLD_CLASS}`);
            if (!world) throw new Error('树里找不到世界层');
            const fitted = parseTransform(world.getAttribute('transform') ?? '');

            // 根节点(实体列表第一行,label 10)的世界坐标
            const firstRow = document.querySelector<HTMLElement>('.entity-row');
            const nodeLabel = firstRow?.querySelector('.object-name')?.textContent;
            const node = treeNodes(tree).find((candidate) =>
                candidate.querySelector(`.${VISUAL_NODE_LABEL_CLASS}`)?.textContent === nodeLabel);
            if (!node) throw new Error('画布上找不到实体行对应的节点');
            const nodePosition = parseTransform(node.getAttribute('transform') ?? '');

            firstRow?.querySelector<HTMLButtonElement>('.row-locate-btn')?.click();

            const focused = parseTransform(world.getAttribute('transform') ?? '');
            const expectedZoom = Math.max(fitted.k, 0.8);
            const centerX = 800 / 2;
            const centerY = DEFAULT_DESKTOP_CONFIG.dockReserve
                + (600 - DEFAULT_DESKTOP_CONFIG.dockReserve) / 2;
            expect(focused.k).toBeCloseTo(expectedZoom, 2);
            expect(focused.x).toBeCloseTo(centerX - nodePosition.x * expectedZoom, 2);
            expect(focused.y).toBeCloseTo(centerY - nodePosition.y * expectedZoom, 2);

            // 回正:回到挂载时那套适应视角
            const fitButton = [...document.querySelectorAll<HTMLButtonElement>('.dock button')]
                .find((button) => button.textContent === VIEWER_FIT_BUTTON_TEXT);
            if (!fitButton) throw new Error('任务栏里找不到回正按钮');
            fitButton.click();
            const restored = parseTransform(world.getAttribute('transform') ?? '');
            expect(restored.x).toBeCloseTo(fitted.x, 2);
            expect(restored.y).toBeCloseTo(fitted.y, 2);
            expect(restored.k).toBeCloseTo(fitted.k, 2);
        } finally {
            widthSpy.mockRestore();
            heightSpy.mockRestore();
            bbox.mockRestore();
        }
    });
});
