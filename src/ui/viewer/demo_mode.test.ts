/*
 * 演示模式(ui/viewer/viewer.ts 的「演示」菜单 + 浮条 + 播放器接线)的行为契约.
 *
 * 用 reduce-motion(matchMedia 返回 true)让镜头 / 结构过渡瞬移:测试只验"进入模式 ->
 * 换帧 -> 单步 -> 退出恢复"这条接线,逐帧缓动在 visual/*.test.ts 里单独验.
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VIEWER_DOM } from '@/ui/viewer/config';
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

/** 演示浮条里的步骤进度点 */
function progressTicks(): HTMLElement[] {
    return [...byId<HTMLElement>(VIEWER_DOM.demoBarId).querySelectorAll<HTMLElement>('.demo-bar__tick')];
}

/** 点浮条上的按钮 / 进度点 */
function clickBar(selector: string): void {
    const element = byId<HTMLElement>(VIEWER_DOM.demoBarId).querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`浮条里找不到 ${selector}`);
    element.click();
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
function mountPanel(): void {
    vi.spyOn(SVGGraphicsElement.prototype, 'getBBox')
        .mockReturnValue(new DOMRect(0, 0, 200, 100));
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
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
    it('任务栏有「演示」按钮与剧本菜单;进入后窗口让位、浮条出现、画布换成第 0 拍', () => {
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

        // 浮条出现,步骤数 = 轨迹步数
        const bar = byId<HTMLElement>(VIEWER_DOM.demoBarId);
        expect(bar).toBeTruthy();
        expect(progressTicks()).toHaveLength(trace.steps.length);
        expect(bar.querySelector('.demo-bar__step-title')?.textContent).toBe(trace.steps[0]?.title);

        // JSON / 实体 / 检查配置 / 诊断 / 帮助让位,检查窗口保留
        expect(windowHidden(JSON_WINDOW)).toBe(true);
        expect(windowHidden(CHECK_WINDOW)).toBe(false);

        // 画布是第 0 拍的完整结构,由增量落笔器画出;静态世界层的直接子节点换成了两个图层
        expect(renderedNodes()).toHaveLength(trace.steps[0]?.document.nodes.length ?? 0);
        expect(document.querySelector(`#${VIEWER_DOM.treeId} .${VISUAL_PAINTER_LINKS_CLASS}`)).not.toBeNull();
        expect(document.querySelector(`#${VIEWER_DOM.treeId} .${VISUAL_PAINTER_NODES_CLASS}`)).not.toBeNull();
        expectNoDuplicateIds();
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
        expect(windowHidden(JSON_WINDOW)).toBe(false);
        expect(renderedNodes()).toHaveLength(5);
    });

    it('浮条「跟随镜头」开关可切换;速度档切换后 aria-pressed 跟着变', () => {
        mountPanel();
        selectScenario('BST · 查找');
        const bar = byId<HTMLElement>(VIEWER_DOM.demoBarId);

        const follow = bar.querySelector<HTMLInputElement>('.demo-bar__follow input');
        if (!follow) throw new Error('浮条里找不到跟随镜头开关');
        expect(follow.checked).toBe(true);
        follow.checked = false;
        follow.dispatchEvent(new Event('change', { bubbles: true }));
        expect(follow.checked).toBe(false);

        const speedButtons = [...bar.querySelectorAll<HTMLButtonElement>('.demo-bar__speed-button')];
        expect(speedButtons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
        speedButtons[2]?.click();
        expect(speedButtons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
    });
});
