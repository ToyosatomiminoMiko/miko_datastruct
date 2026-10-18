/**
 * 红黑树行为层(ui/rbt/rbt.ts 的 mountRBT)的契约(进程内,跑在 happy-dom 里).
 *
 * 钉三条:SVG 里只有节点值(提示 / 错误 / 性质结论一律不进 SVG);#treeOutput 每轮只装一种
 * 内容(一行提示 / 一行错误 / 性质清单);节点数 = 连线数 + 1,红黑修饰类按表达式挂上.
 *
 * CodeEditor 的坑:程序化写 `textarea.value` 不派发 input 事件,行号与高亮层要显式刷新.
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    RBT_DIAGNOSTICS_ROW_CLASS,
    RBT_DIAGNOSTICS_STATE_CLASS,
    RBT_DIAGNOSTICS_SUMMARY_CLASS,
    RBT_DOM,
    RBT_EDGE_CLASS,
    RBT_EMPTY_HINT_TEXT,
    RBT_EMPTY_TREE_HINT_TEXT,
    RBT_ERROR_UI_PREFIX,
    RBT_FIT_BUTTON_TEXT,
    RBT_NODE_BLACK_CLASS,
    RBT_NODE_CLASS,
    RBT_NODE_LABEL_CLASS,
    RBT_NODE_RED_CLASS,
    RBT_NODE_SHAPE_CLASS,
    RBT_OUTPUT_ERROR_CLASS,
    RBT_OUTPUT_HINT_CLASS,
    RBT_PROPERTIES,
    RBT_TOKEN_VALUE_CLASS,
    RBT_TREE_EXAMPLE,
    RBT_WORLD_CLASS,
} from '@/ui/rbt/config';
import { mountRBT } from '@/ui/rbt/rbt';

/** 按 id 取刚挂载出来的元素(取不到说明标记契约变了,直接抛错而不是让断言读 null) */
function byId<T extends Element>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`桌面上找不到 #${id}`);
    return element as unknown as T;
}

/** 编辑器里的真 textarea(库建的,我们的宿主里只有这一颗;取不到同样是契约变了) */
function editorTextarea(): HTMLTextAreaElement {
    const textarea = byId<HTMLElement>(RBT_DOM.editorId).querySelector('textarea');
    if (!textarea) throw new Error(`#${RBT_DOM.editorId} 里找不到编辑器的 textarea`);
    return textarea;
}

/** 往编辑器里喂一个表达式并派发 input 事件(与用户敲键盘走的是同一条链路) */
function typeExpression(input: HTMLTextAreaElement, expression: string): void {
    input.value = expression;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * 挂一次桌面(与真页面同形:一颗宿主 + `mountRBT`),交回输入框 / 输出区 / 那棵 SVG.
 * 树画在桌面背景那块平面里(视口 -> svg -> 世界层),输出区在性质窗口的正文里,两者不在
 * 同一颗框体里 -- 取它们一律按 id,不按面板结构.
 */
function mountPanel(): { input: HTMLTextAreaElement; output: HTMLElement; tree: SVGSVGElement } {
    const host = document.createElement('div');
    document.body.append(host);
    mountRBT(host);
    return {
        input: editorTextarea(),
        output: byId<HTMLElement>(RBT_DOM.outputId),
        tree: byId<SVGSVGElement>(RBT_DOM.treeId),
    };
}

/** 树里当前画着的节点(按文档顺序) */
function treeNodes(tree: SVGSVGElement): Element[] {
    return [...tree.querySelectorAll(`.${RBT_NODE_CLASS}`)];
}

/** 树里当前画着的连线 */
function treeEdges(tree: SVGSVGElement): Element[] {
    return [...tree.querySelectorAll(`.${RBT_EDGE_CLASS}`)];
}

/** 树上所有节点值(按文档顺序) */
function treeLabels(tree: SVGSVGElement): string[] {
    return [...tree.querySelectorAll(`.${RBT_NODE_LABEL_CLASS}`)].map((label) => label.textContent ?? '');
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('红黑树:挂载后的树与唯一输出区', () => {
    it('示例树自动加载:输出区是性质清单,树里只写节点值', () => {
        const { input, output, tree } = mountPanel();

        expect(input.value).toBe(RBT_TREE_EXAMPLE);
        expect(output.hidden).toBe(false);
        expect(output.querySelectorAll(`.${RBT_OUTPUT_HINT_CLASS}`)).toHaveLength(0);
        expect(output.querySelectorAll(`.${RBT_OUTPUT_ERROR_CLASS}`)).toHaveLength(0);
        expect(output.querySelectorAll(`.${RBT_DIAGNOSTICS_SUMMARY_CLASS}`)).toHaveLength(1);
        expect(output.querySelectorAll(`.${RBT_DIAGNOSTICS_ROW_CLASS}`))
            .toHaveLength(RBT_PROPERTIES.length);
        /*
          站点默认示例是一棵合法红黑树:四条全 PASS.

          "示例本身合法"只能在这里从 DOM 上钉:核心层测试不 import 显示层的示例(依赖方向
          只有显示 -> 核心).
        */
        expect(output.querySelectorAll(`.${RBT_DIAGNOSTICS_STATE_CLASS}.is-fail`)).toHaveLength(0);
        expect(output.querySelectorAll(`.${RBT_DIAGNOSTICS_STATE_CLASS}.is-pass`))
            .toHaveLength(RBT_PROPERTIES.length);

        // 深度 4 的满树 31 个节点 => 31 个节点组,每个都是一颗圆 + 一个节点值;
        // 每颗圆都带 .rbt-node__shape(半径 / 颜色由 CSS 给)
        const nodes = treeNodes(tree);
        expect(nodes).toHaveLength(31);
        expect(tree.querySelectorAll(`.${RBT_NODE_SHAPE_CLASS}`)).toHaveLength(31);
        expect(treeLabels(tree).every((label) => /^\d+$/.test(label))).toBe(true);
    });

    it('树有 n 个节点就有 n-1 条连线(每条连线对应一个非根节点)', () => {
        const { tree } = mountPanel();

        expect(treeEdges(tree)).toHaveLength(31 - 1);
    });

    it('示例是种进编辑器的,行号与高亮层一起被刷新(程序化写值不派发 input)', () => {
        const { input } = mountPanel();
        const host = byId<HTMLElement>(RBT_DOM.editorId);

        expect(input.value).toBe(RBT_TREE_EXAMPLE);
        // 单行表达式:行号只有一行(直接赋值后没 refresh 的话这里还是初值)
        expect(host.querySelector('.code-editor-lines')?.textContent).toBe('1');
        // 高亮层里就是那段示例,而且真的分了词
        const code = host.querySelector('.code-editor-highlight-code');
        expect(code?.textContent).toBe(RBT_TREE_EXAMPLE);
        expect(code?.querySelectorAll(`.${RBT_TOKEN_VALUE_CLASS}`).length).toBeGreaterThan(0);
    });

    it('节点与连线的坐标来自布局,不是全挤在原点', () => {
        const { tree } = mountPanel();

        const transforms = treeNodes(tree).map((node) => node.getAttribute('transform') ?? '');
        expect(transforms.every((transform) => /^translate\([\d.]+,[\d.]+\)$/.test(transform))).toBe(true);
        expect(new Set(transforms).size).toBe(31);

        // 连线两端读的就是父子节点的坐标,所以端点也不该是同一个点
        for (const edge of treeEdges(tree)) {
            const x1 = edge.getAttribute('x1');
            const y1 = edge.getAttribute('y1');
            expect(x1).not.toBeNull();
            expect(y1).not.toBeNull();
            expect(`${x1},${y1}`).not.toBe(`${edge.getAttribute('x2')},${edge.getAttribute('y2')}`);
        }
    });

    it('树画在世界层里,而且视口给这一层写了 transform(平面 -> 屏幕的换算只有这一处)', () => {
        const { tree } = mountPanel();
        const world = tree.querySelector(`.${RBT_WORLD_CLASS}`);

        expect(world).not.toBeNull();
        // 节点与连线都在世界层里:世界坐标 = 布局坐标,画布自己不再缩放
        expect(world?.querySelectorAll(`.${RBT_NODE_CLASS}`)).toHaveLength(31);
        expect(world?.querySelectorAll(`.${RBT_EDGE_CLASS}`)).toHaveLength(31 - 1);
        /*
          世界层的 transform 由视口句柄写.

          happy-dom 不做排版:`world.getBBox()` 恒为空矩形,drawTree 交回 null,rbt.ts
          因此不报包围盒;就算报了,host.clientWidth 也是 0. 两层兜底叠在一起,世界层停在
          视口挂载时写的恒等视角上 -- 这里钉的是"属性一定被写过、格式就是 translate +
          scale",真机上的适应比例不在这里验.
        */
        expect(world?.getAttribute('transform')).toBe('translate(0 0) scale(1)');
    });

    it('红黑修饰类按表达式里的颜色挂上(根黑,两个孩子红)', () => {
        const { input, tree } = mountPanel();

        typeExpression(input, '10B(5R,15R)');

        const nodes = treeNodes(tree);
        expect(nodes).toHaveLength(3);
        // 文档顺序是先根后子树(先序遍历),所以第一颗是根
        expect(nodes[0].classList.contains(RBT_NODE_BLACK_CLASS)).toBe(true);
        expect(nodes[0].classList.contains(RBT_NODE_RED_CLASS)).toBe(false);
        expect(nodes[1].classList.contains(RBT_NODE_RED_CLASS)).toBe(true);
        expect(nodes[2].classList.contains(RBT_NODE_RED_CLASS)).toBe(true);
        expect(nodes.filter((node) => node.classList.contains(RBT_NODE_BLACK_CLASS))).toHaveLength(1);
    });

    it('清空输入:输出区换成一行提示,树上一个节点 / 一条线都不留', () => {
        const { input, output, tree } = mountPanel();

        typeExpression(input, '');

        expect(treeNodes(tree)).toHaveLength(0);
        expect(treeEdges(tree)).toHaveLength(0);
        expect(treeLabels(tree)).toEqual([]);
        const hints = output.querySelectorAll(`.${RBT_OUTPUT_HINT_CLASS}`);
        expect(hints).toHaveLength(1);
        expect(hints[0].textContent).toBe(RBT_EMPTY_HINT_TEXT);
        // 整批替换:上一轮的性质清单一点都不剩
        expect(output.querySelectorAll(`.${RBT_DIAGNOSTICS_ROW_CLASS}`)).toHaveLength(0);
        expect(output.querySelectorAll(`.${RBT_OUTPUT_ERROR_CLASS}`)).toHaveLength(0);
    });

    it('输入 nil(合法空树):提示与空输入不同,树同样清空', () => {
        const { input, output, tree } = mountPanel();

        typeExpression(input, 'nil');

        expect(treeNodes(tree)).toHaveLength(0);
        expect(treeEdges(tree)).toHaveLength(0);
        const hints = output.querySelectorAll(`.${RBT_OUTPUT_HINT_CLASS}`);
        expect(hints).toHaveLength(1);
        expect(hints[0].textContent).toBe(RBT_EMPTY_TREE_HINT_TEXT);
        expect(output.querySelectorAll(`.${RBT_DIAGNOSTICS_ROW_CLASS}`)).toHaveLength(0);
    });

    it('解析失败:输出区换成一行错误,树里不写错误文案', () => {
        const { input, output, tree } = mountPanel();

        typeExpression(input, '5B(1B 2B)');

        expect(treeNodes(tree)).toHaveLength(0);
        expect(treeLabels(tree)).toEqual([]);
        const errors = output.querySelectorAll(`.${RBT_OUTPUT_ERROR_CLASS}`);
        expect(errors).toHaveLength(1);
        expect(errors[0].textContent).toContain(RBT_ERROR_UI_PREFIX);
        expect(errors[0].textContent).toContain('缺少逗号');
        expect(output.querySelectorAll(`.${RBT_OUTPUT_HINT_CLASS}`)).toHaveLength(0);
        expect(output.querySelectorAll(`.${RBT_DIAGNOSTICS_ROW_CLASS}`)).toHaveLength(0);
    });

    it('合法小树:树上只有节点值,节点数 = 表达式里的节点数', () => {
        const { input, output, tree } = mountPanel();

        typeExpression(input, '10B(5R,15R)');

        expect([...treeLabels(tree)].sort()).toEqual(['10', '15', '5']);
        expect(output.querySelectorAll(`.${RBT_OUTPUT_HINT_CLASS}`)).toHaveLength(0);
        expect(output.querySelectorAll(`.${RBT_OUTPUT_ERROR_CLASS}`)).toHaveLength(0);
        expect(output.querySelectorAll(`.${RBT_DIAGNOSTICS_ROW_CLASS}`))
            .toHaveLength(RBT_PROPERTIES.length);
    });

    it('重复挂载同一块宿主不会叠出第二套桌面(窗口 / 任务栏 / 树都只有一份)', () => {
        const host = document.createElement('div');
        document.body.append(host);
        mountRBT(host);
        mountRBT(host);

        // 上一份桌面被拆掉:窗口外壳与任务栏按钮不叠加,三层容器也只剩一套
        expect(host.querySelectorAll('.window-layer')).toHaveLength(1);
        expect(host.querySelectorAll('.window')).toHaveLength(2);
        expect(host.querySelectorAll('.dock .dock-btn')).toHaveLength(2);
        // 标记同样只有一份(宿主由本模块独占)
        expect(host.querySelectorAll(`#${RBT_DOM.treeId}`)).toHaveLength(1);
        expect(host.querySelectorAll(`#${RBT_DOM.editorId}`)).toHaveLength(1);
        expect(host.querySelectorAll(`.${RBT_NODE_CLASS}`)).toHaveLength(31);
        // 回正按钮也只有一枚:动作由库按上一份桌面的 dockActions 建,随旧任务栏一起离场
        expect([...host.querySelectorAll('.dock button')]
            .filter((button) => button.textContent === RBT_FIT_BUTTON_TEXT)).toHaveLength(1);
    });
});

/**
 * 回正按钮是唯一的"回到看得见"入口:这里钉的是 rbt.ts 的接线 -- 按钮的 click 最终落到
 * 视口句柄的 `fitViewport()`.按钮本身在任务栏的动作区里(桌面级动作),所以这里按文案从
 * `.dock` 的按钮里取它,而不是按某扇窗口的正文结构.
 *
 * happy-dom 不做布局:视口 `clientWidth` 为 0,`fitPlaneView` 因此给恒等视角;`getBBox()`
 * 默认是空矩形,渲染层量不到内容就不会向视口报包围盒.两条都不影响本用例 -- 把
 * `getBBox` 桩成一块正尺寸,让"内容报上来"这条链路成立,然后看点按钮前后的 transform:
 * 初始(自动适应)= 恒等,滚轮之后 = 缩放,点按钮之后 = 回到恒等.
 */
describe('红黑树:回正按钮', () => {
    it('手动缩放后点「回正视图」:世界层回到适应视角(按钮 -> fitViewport 接线)', () => {
        const bbox = vi.spyOn(SVGGraphicsElement.prototype, 'getBBox')
            .mockReturnValue(new DOMRect(0, 0, 200, 100));
        try {
            const { tree } = mountPanel();
            const world = tree.querySelector(`.${RBT_WORLD_CLASS}`);
            if (!world) throw new Error('树里找不到世界层');
            const fitted = world.getAttribute('transform');

            // 滚轮缩放(真实的 wheel 事件链路):进入手动模式,视角离开适应位置
            const viewport = byId<HTMLElement>(RBT_DOM.viewportId);
            const wheelEvent = new WheelEvent('wheel', {
                deltaY: -100,
                deltaMode: 0,
                bubbles: true,
                cancelable: true,
            });
            Object.defineProperty(wheelEvent, 'clientX', { value: 100 });
            Object.defineProperty(wheelEvent, 'clientY', { value: 100 });
            viewport.dispatchEvent(wheelEvent);
            expect(world.getAttribute('transform')).not.toBe(fitted);

            // 回正按钮在任务栏的动作区里:任务栏另一枚按钮是库的「全部还原」,按文案认它
            const button = [...document.querySelectorAll<HTMLButtonElement>('.dock button')]
                .find((candidate) => candidate.textContent === RBT_FIT_BUTTON_TEXT);
            if (!button) throw new Error('任务栏里找不到回正按钮');
            button.click();

            expect(world.getAttribute('transform')).toBe(fitted);
        } finally {
            bbox.mockRestore();
        }
    });
});
