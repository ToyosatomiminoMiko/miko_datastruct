/*
 * 演示模式(ui/viewer/viewer.ts 的「演示」菜单 + 控制窗口 + 播放器接线)的行为契约.
 *
 * 用 reduce-motion(matchMedia 返回 true)让镜头 / 结构过渡瞬移:测试只验"进入模式 ->
 * 换帧 -> 单步 -> 退出恢复"这条接线,逐帧缓动在 visual/*.test.ts 里单独验.
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    VIEWER_DEMO_OUTLINE_WINDOW_ID,
    VIEWER_DEMO_WINDOW_ID,
    VIEWER_DEMO_WINDOW_SIZE,
    VIEWER_DEMO_WINDOW_TITLE,
    VIEWER_DOM,
} from '@/ui/viewer/config';
import {
    DEMO_OUTLINE_CURRENT_CLASS,
    DEMO_OUTLINE_STEP_CLASS,
} from '@/ui/viewer/demo_outline';
import { findDemoScenario } from '@/ui/viewer/demo_scenarios';
import { mountViewer } from '@/ui/viewer/viewer';
import { VISUAL_NODE_CLASS } from '@/visual/config';
import { VISUAL_PAINTER_LINKS_CLASS, VISUAL_PAINTER_NODES_CLASS } from '@/visual/painter';
import { renderHost, expectNoDuplicateIds } from '@/test_support/desktop_test_helpers';

/** 按 id 取元素(取不到直接抛错) */
function byId<T extends Element>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`桌面上找不到 #${id}`);
    return element as unknown as T;
}

/** 当前世界层里的节点组(静态与演示两条路径都画成 .visual-node) */
function renderedNodes(): Element[] {
    return [...document.querySelectorAll(`#${VIEWER_DOM.treeId} .${VISUAL_NODE_CLASS}`)];
}

/** 演示控制窗口里的步骤进度点 */
function progressTicks(): HTMLElement[] {
    return [...byId<HTMLElement>(VIEWER_DOM.demoBarId).querySelectorAll<HTMLElement>('.demo-bar__tick')];
}

/** 点控制条上的按钮 / 进度点 */
function clickBar(selector: string): void {
    const element = byId<HTMLElement>(VIEWER_DOM.demoBarId).querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`控制条里找不到 ${selector}`);
    element.click();
}

/** 演示控制窗口(库的窗口外壳;`data-window` 由 demo_window.ts 写) */
function demoWindow(): HTMLElement {
    const element = document.querySelector<HTMLElement>(`[data-window="${VIEWER_DEMO_WINDOW_ID}"]`);
    if (!element) throw new Error('桌面上找不到演示控制窗口');
    return element;
}

/** 步骤目录窗口(与控制窗口并列的另一扇演示专用浮窗) */
function outlineWindow(): HTMLElement {
    const element = document.querySelector<HTMLElement>(`[data-window="${VIEWER_DEMO_OUTLINE_WINDOW_ID}"]`);
    if (!element) throw new Error('桌面上找不到步骤目录窗口');
    return element;
}

/** 目录里的步骤行(顺序 = 播放顺序) */
function outlineSteps(): HTMLElement[] {
    return [...outlineWindow().querySelectorAll<HTMLElement>(`.${DEMO_OUTLINE_STEP_CLASS}`)];
}

/** 任务栏里的「演示」按钮(库按 VIEWER_DOCK_ACTIONS 建) */
function dockDemoButton(): HTMLButtonElement {
    const button = document.querySelector<HTMLButtonElement>('[data-dock-action="demo"]');
    if (!button) throw new Error('任务栏里找不到「演示」按钮');
    return button;
}

/** 演示菜单里按标题点一个剧本 */
function selectScenario(titlePart: string): void {
    const item = [...document.querySelectorAll<HTMLButtonElement>(`#${VIEWER_DOM.demoMenuId} .menu-item`)]
        .find((candidate) => candidate.textContent?.includes(titlePart));
    if (!item) throw new Error(`演示菜单里找不到「${titlePart}」`);
    item.click();
}

/** 窗口是否被最小化(is-hidden 是库的最小化状态类) */
function windowHidden(id: string): boolean {
    const element = document.querySelector(`[data-window="${id}"]`);
    return element?.classList.contains('is-hidden') ?? false;
}

const JSON_WINDOW = 'json';
const CHECK_WINDOW = 'check';

/** 挂载查看器并种好视口尺寸 / 包围盒 / reduce-motion */
function mountPanel(width = 800, height = 600): void {
    vi.spyOn(SVGGraphicsElement.prototype, 'getBBox')
        .mockReturnValue(new DOMRect(0, 0, 200, 100));
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height);
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    renderHost((host) => mountViewer(host));
}

beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    // happy-dom 的 window.matchMedia 默认存在;restoreAllMocks 之后重新种一次
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
});

describe('演示模式:入口与进入', () => {
    it('任务栏有「演示」按钮与剧本菜单;进入后窗口让位、控制窗口出现、画布换成第 0 拍', () => {
        mountPanel();
        const button = dockDemoButton();
        expect(button.textContent).toBe('演示');
        expect(button.getAttribute('aria-haspopup')).toBe('true');
        // 点开菜单:面板由 Popover 写 .is-open
        button.click();
        expect(document.getElementById(VIEWER_DOM.demoMenuId)?.classList.contains('is-open')).toBe(true);
        const items = [...document.querySelectorAll(`#${VIEWER_DOM.demoMenuId} .menu-item`)];
        expect(items.length).toBeGreaterThanOrEqual(6);

        const scenario = findDemoScenario('bst-basics');
        if (!scenario) throw new Error('缺少 bst-basics 剧本');
        const trace = scenario.build();
        selectScenario('BST · 查找');

        // 控制窗口出现,步骤数 = 轨迹步数
        const bar = byId<HTMLElement>(VIEWER_DOM.demoBarId);
        expect(bar).toBeTruthy();
        expect(progressTicks()).toHaveLength(trace.steps.length);
        expect(bar.querySelector('.demo-bar__step-title')?.textContent).toBe(trace.steps[0]?.title);
        expect(demoWindow().contains(bar)).toBe(true);

        // JSON / 实体 / 检查配置 / 诊断 / 帮助让位,检查窗口保留
        expect(windowHidden(JSON_WINDOW)).toBe(true);
        expect(windowHidden(CHECK_WINDOW)).toBe(false);

        // 画布是第 0 拍的完整结构,由增量落笔器画出;静态世界层的直接子节点换成了两个图层
        expect(renderedNodes()).toHaveLength(trace.steps[0]?.document.nodes.length ?? 0);
        expect(document.querySelector(`#${VIEWER_DOM.treeId} .${VISUAL_PAINTER_LINKS_CLASS}`)).not.toBeNull();
        expect(document.querySelector(`#${VIEWER_DOM.treeId} .${VISUAL_PAINTER_NODES_CLASS}`)).not.toBeNull();
        expectNoDuplicateIds();
    });

    it('控制条装进库的窗口外壳:纵向固定 / 横向可调、无 min max,标题栏可拖', () => {
        mountPanel(1400, 700);
        selectScenario('BST · 查找');

        const windowEl = demoWindow();
        // 外壳来自库的 createWindowFrame:在窗口层里,带 .window 类与标题栏
        expect(windowEl.classList.contains('window')).toBe(true);
        expect(windowEl.parentElement?.classList.contains('window-layer')).toBe(true);
        expect(windowEl.querySelector('.window-title')?.textContent).toContain(VIEWER_DEMO_WINDOW_TITLE);
        // 横向可调、纵向固定:只留东 / 西两根手柄,没有 min / max 按钮
        const resizeDirections = [...windowEl.querySelectorAll('.resize-handle')]
            .map((handle) => handle.getAttribute('data-window-resize'))
            .sort();
        expect(resizeDirections).toEqual(['e', 'w']);
        expect(windowEl.querySelectorAll('.window-controls button')).toHaveLength(0);
        expect(windowEl.style.width).toBe(`${VIEWER_DEMO_WINDOW_SIZE.w}px`);
        expect(windowEl.style.height).toBe(`${VIEWER_DEMO_WINDOW_SIZE.h}px`);
        // 窄桌面下正文可滚:滚动容器挂库的 ui-scrollbar(而不是浏览器默认滑条)
        expect(windowEl.querySelector('.window-body')?.classList.contains('ui-scrollbar')).toBe(true);

        // 标题栏拖动:窗口整体平移(夹取走库的窗口几何,与常驻窗口同一份规则)
        const left = Number.parseFloat(windowEl.style.left);
        const top = Number.parseFloat(windowEl.style.top);
        const title = windowEl.querySelector<HTMLElement>('.window-title');
        if (title === null) throw new Error('演示窗口没有标题栏');
        title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100, pointerId: 1 }));
        title.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 220, clientY: 80, pointerId: 1 }));
        title.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 220, clientY: 80, pointerId: 1 }));
        expect(Number.parseFloat(windowEl.style.left)).toBe(left + 120);
        expect(Number.parseFloat(windowEl.style.top)).toBe(top - 20);

        // 拖东边:宽度 +120,高度不变(缩放走库的 resizeGeometry,按总位移解释)
        const eastHandle = windowEl.querySelector<HTMLElement>('.resize-handle[data-window-resize="e"]');
        if (eastHandle === null) throw new Error('演示窗口没有东侧缩放手柄');
        const width = Number.parseFloat(windowEl.style.width);
        const height = Number.parseFloat(windowEl.style.height);
        eastHandle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 600, clientY: 300, pointerId: 2 }));
        eastHandle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 720, clientY: 300, pointerId: 2 }));
        eastHandle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 720, clientY: 300, pointerId: 2 }));
        expect(Number.parseFloat(windowEl.style.width)).toBe(width + 120);
        expect(Number.parseFloat(windowEl.style.height)).toBe(height);
    });
});

describe('演示模式:播放控制', () => {
    it('演示中可以从任务栏菜单换一个剧本:旧会话先退出,再按新轨迹落到第 0 拍', () => {
        mountPanel();
        selectScenario('BST · 查找');
        const firstLength = progressTicks().length;

        dockDemoButton().click();
        selectScenario('RBT · 插入(入门)');
        expect(progressTicks().length).not.toBe(firstLength);
        expect(byId(VIEWER_DOM.demoBarId).querySelector('.demo-bar__count')?.textContent)
            .toBe(`1 / ${progressTicks().length}`);
        expect(windowHidden(JSON_WINDOW)).toBe(true);
    });

    it('下一步 / 上一步 / 进度点:标题、计数、检查列表跟着当前拍走', () => {
        mountPanel();
        const scenario = findDemoScenario('bst-basics');
        if (!scenario) throw new Error('缺少 bst-basics 剧本');
        const trace = scenario.build();
        selectScenario('BST · 查找');

        clickBar('[data-demo-action="next"]');
        expect(byId(VIEWER_DOM.demoBarId).querySelector('.demo-bar__count')?.textContent)
            .toBe(`2 / ${trace.steps.length}`);
        expect(byId(VIEWER_DOM.demoBarId).querySelector('.demo-bar__step-title')?.textContent)
            .toBe(trace.steps[1]?.title);

        // 检查窗口按这一帧重算:bst-basics 每帧都跑 checkBstOrder
        expect(document.querySelectorAll('.check-row')).toHaveLength(1);

        clickBar('[data-demo-action="prev"]');
        expect(byId(VIEWER_DOM.demoBarId).querySelector('.demo-bar__count')?.textContent)
            .toBe(`1 / ${trace.steps.length}`);

        // 进度点跳转
        clickBar('.demo-bar__tick[data-step="5"]');
        expect(byId(VIEWER_DOM.demoBarId).querySelector('.demo-bar__count')?.textContent)
            .toBe(`6 / ${trace.steps.length}`);
    });

    it('键盘:Esc 退出演示;Space 播放 / 暂停', () => {
        mountPanel();
        selectScenario('RBT · 插入(入门)');
        expect(document.getElementById(VIEWER_DOM.demoBarId)).not.toBeNull();

        const toggle = byId<HTMLElement>(VIEWER_DOM.demoBarId)
            .querySelector<HTMLElement>('[data-demo-action="toggle"]');
        expect(toggle?.textContent).toBe('播放');

        document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        expect(toggle?.textContent).toBe('暂停');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        expect(toggle?.textContent).toBe('播放');

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.getElementById(VIEWER_DOM.demoBarId)).toBeNull();
    });
});

describe('演示模式:步骤目录', () => {
    it('进入演示后左侧有目录窗口:按章列出全部步骤,当前步高亮', () => {
        mountPanel(1400, 700);
        const scenario = findDemoScenario('bst-basics');
        if (!scenario) throw new Error('缺少 bst-basics 剧本');
        const trace = scenario.build();
        selectScenario('BST · 查找');

        const windowEl = outlineWindow();
        expect(windowEl.classList.contains('window')).toBe(true);
        expect(windowEl.parentElement?.classList.contains('window-layer')).toBe(true);
        expect(windowEl.querySelector('.window-title')?.textContent).toContain('步骤');
        expect(outlineSteps()).toHaveLength(trace.steps.length);
        expect(windowEl.querySelector('.demo-outline__summary')?.textContent)
            .toBe(`${trace.chapters.length} 章 · ${trace.steps.length} 步`);

        const current = windowEl.querySelectorAll(`.${DEMO_OUTLINE_CURRENT_CLASS}`);
        expect(current).toHaveLength(1);
        expect(current[0]?.getAttribute('aria-current')).toBe('step');
        expect(current[0]?.textContent).toContain(trace.steps[0]?.title ?? '');
        expectNoDuplicateIds();
    });

    it('点步骤 / 点章头跳到那一步;单步后目录高亮跟着动', () => {
        mountPanel();
        const scenario = findDemoScenario('bst-basics');
        if (!scenario) throw new Error('缺少 bst-basics 剧本');
        const trace = scenario.build();
        const chapter = trace.chapters[2];
        if (chapter === undefined) throw new Error('剧本至少要有三章');
        selectScenario('BST · 查找');

        const rows = outlineSteps();
        rows[7]?.click();
        expect(byId(VIEWER_DOM.demoBarId).querySelector('.demo-bar__count')?.textContent)
            .toBe(`8 / ${trace.steps.length}`);
        expect(rows[7]?.classList.contains(DEMO_OUTLINE_CURRENT_CLASS)).toBe(true);
        expect(rows[6]?.classList.contains('is-past')).toBe(true);

        outlineWindow()
            .querySelectorAll<HTMLElement>('.demo-outline__chapter-head')[2]
            ?.click();
        expect(byId(VIEWER_DOM.demoBarId).querySelector('.demo-bar__count')?.textContent)
            .toBe(`${chapter.firstStep + 1} / ${trace.steps.length}`);

        clickBar('[data-demo-action="next"]');
        expect(rows[chapter.firstStep + 1]?.classList.contains(DEMO_OUTLINE_CURRENT_CLASS)).toBe(true);
        expect(rows[chapter.firstStep]?.classList.contains('is-past')).toBe(true);
    });

    it('「步骤」开关与目录里的「收起」双向同步;隐藏走库的 is-hidden', () => {
        mountPanel();
        selectScenario('BST · 查找');
        const windowEl = outlineWindow();
        // 与「跟随镜头」一样是库的 createSwitch(.switch > input + .slider)
        expect(
            byId<HTMLElement>(VIEWER_DOM.demoBarId).querySelector('.demo-bar__outline .switch'),
        ).not.toBeNull();
        const checkbox = byId<HTMLElement>(VIEWER_DOM.demoBarId)
            .querySelector<HTMLInputElement>('.demo-bar__outline input');
        if (!checkbox) throw new Error('控制条里找不到「步骤」开关');
        expect(checkbox.checked).toBe(true);

        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        expect(windowEl.classList.contains('is-hidden')).toBe(true);
        expect(windowEl.inert).toBe(true);

        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        expect(windowEl.classList.contains('is-hidden')).toBe(false);
        expect(windowEl.inert).toBe(false);

        // 从目录自己的「收起」关掉:控制条开关必须回去,否则两处状态分叉
        windowEl.querySelector<HTMLElement>('.demo-outline__collapse')?.click();
        expect(windowEl.classList.contains('is-hidden')).toBe(true);
        expect(checkbox.checked).toBe(false);
    });

    it('退出演示时目录窗口一起拆掉', () => {
        mountPanel();
        selectScenario('BST · 查找');
        expect(document.querySelector(`[data-window="${VIEWER_DEMO_OUTLINE_WINDOW_ID}"]`)).not.toBeNull();

        clickBar('[data-demo-action="exit"]');
        expect(document.querySelector(`[data-window="${VIEWER_DEMO_OUTLINE_WINDOW_ID}"]`)).toBeNull();
    });
});

describe('演示模式:退出与 RUN 冲突', () => {
    it('退出后恢复进入前的窗口状态,并把最后一次静态结构画回来', () => {
        mountPanel();
        // 首屏默认示例是 5 节点红黑树
        expect(renderedNodes()).toHaveLength(5);
        const defaultCheckConfig = document
            .querySelector<HTMLTextAreaElement>(`#${VIEWER_DOM.checkSetupEditorId} textarea`)?.value;

        selectScenario('BST · 查找');
        expect(renderedNodes()).toHaveLength(7);

        clickBar('[data-demo-action="exit"]');
        expect(document.getElementById(VIEWER_DOM.demoBarId)).toBeNull();
        expect(document.querySelector(`[data-window="${VIEWER_DEMO_WINDOW_ID}"]`)).toBeNull();
        expect(windowHidden(JSON_WINDOW)).toBe(false);
        // 演示没有改 JSON:画回来的仍是首屏那份 5 节点红黑树
        expect(renderedNodes()).toHaveLength(5);
        // 演示借用的检查配置也还原了(否则静态检查配置与画面对不上)
        expect(document.querySelector<HTMLTextAreaElement>(`#${VIEWER_DOM.checkSetupEditorId} textarea`)?.value)
            .toBe(defaultCheckConfig);
    });

    it('演示中点 RUN:先退出演示,再按静态流程重绘(不静默吞掉)', () => {
        mountPanel();
        selectScenario('BST · 查找');
        expect(document.getElementById(VIEWER_DOM.demoBarId)).not.toBeNull();

        byId<HTMLButtonElement>(VIEWER_DOM.runButtonId).click();
        expect(document.getElementById(VIEWER_DOM.demoBarId)).toBeNull();
        expect(document.querySelector(`[data-window="${VIEWER_DEMO_WINDOW_ID}"]`)).toBeNull();
        expect(windowHidden(JSON_WINDOW)).toBe(false);
        expect(renderedNodes()).toHaveLength(5);
    });

    it('控制窗口「跟随镜头」开关可切换;速度档切换后 aria-pressed 跟着变', () => {
        mountPanel();
        selectScenario('BST · 查找');
        const bar = byId<HTMLElement>(VIEWER_DOM.demoBarId);

        // 开关是库的 createSwitch:根是 .switch,视觉在 .slider 上,原生 checkbox 只留交互
        const followBox = bar.querySelector<HTMLElement>('.demo-bar__follow .switch');
        expect(followBox).not.toBeNull();
        expect(followBox?.querySelector('.slider')).not.toBeNull();
        const follow = bar.querySelector<HTMLInputElement>('.demo-bar__follow input');
        if (!follow) throw new Error('控制窗口里找不到跟随镜头开关');
        expect(follow.checked).toBe(true);
        follow.checked = false;
        follow.dispatchEvent(new Event('change', { bubbles: true }));
        expect(follow.checked).toBe(false);

        // 速度档是库的 segmented:单选,当前档由 .active + aria-pressed 表达
        const speedGroup = bar.querySelector<HTMLElement>('.demo-bar__speed');
        expect(speedGroup?.classList.contains('segmented')).toBe(true);
        const speedButtons = [...(speedGroup?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
        expect(speedButtons.map((button) => button.textContent)).toEqual(['0.5×', '1×', '2×']);
        expect(speedButtons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
        speedButtons[2]?.click();
        expect(speedButtons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
        expect(speedButtons[2]?.classList.contains('active')).toBe(true);
    });
});
