/**
 * 红黑树桌面视图的标记契约:createRbtViews() 的标记(挂载前)与 mountRBT() 的桌面装配.
 *
 * rbt.css 按 #rbtViewport / #rbtTree / #rbtEditor 等 id 命中,平面几何与窗口清单都来自
 * config;逐字文案(三行提示里的 U+00A0 与「黒」)一并钉住,顺手改掉就是静默的文案漂移.
 * 编辑器只钉装配契约,不钉库的内部结构(分词是纯函数,不在这里测).
 *
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';

import {
    RBT_DESKTOP_WINDOWS,
    RBT_DOCK_ACTIONS,
    RBT_DOM,
    RBT_HINT_BOX_CLASS,
    RBT_HINT_COLOR_LEGEND,
    RBT_HINT_SHORTHAND,
    RBT_HINT_VIEWPORT,
    RBT_INPUT_PLACEHOLDER,
    RBT_WINDOW_EDITOR,
    RBT_WINDOW_PROPERTIES,
} from '@/ui/rbt/config';
import { VISUAL_SURFACE_CLASS, VISUAL_VIEWPORT_CLASS, VISUAL_WORLD_CLASS } from '@/visual/config';
import { mountRBT } from '@/ui/rbt/rbt';
import { createRbtViews, type RbtViews } from '@/ui/rbt/rbt_views';
import { expectNoDuplicateIds, renderHost } from '@/test_support/desktop_test_helpers';

/** 建一次视图并取好两扇窗口的正文根(还没挂进文档) */
function buildViews(): {
    views: RbtViews;
    editorPanel: HTMLElement;
    outputPanel: HTMLElement;
} {
    const views = createRbtViews();
    return {
        views,
        editorPanel: views.content(RBT_WINDOW_EDITOR).body?.[0] as HTMLElement,
        outputPanel: views.content(RBT_WINDOW_PROPERTIES).body?.[0] as HTMLElement,
    };
}

/** 按窗口 id 取正文容器(取不到直接抛错,而不是让断言读 null) */
function windowBody(host: HTMLElement, windowId: string): HTMLElement {
    const body = host.querySelector(`.window[data-window="${windowId}"] .window-body`);
    if (!body) throw new Error(`桌面里找不到窗口 ${windowId} 的正文`);
    return body as HTMLElement;
}

describe('红黑树:视图标记(createRbtViews,挂载之前)', () => {
    it('提示区是性质检查窗口正文的第一个孩子(输出区之上):三行逐字保留(含 U+00A0 与「黒」)', () => {
        const { editorPanel, outputPanel } = buildViews();
        const hintBox = outputPanel.children[0];

        expect(hintBox?.classList.contains(RBT_HINT_BOX_CLASS)).toBe(true);
        const spans = [...(hintBox?.querySelectorAll('span') ?? [])];
        expect(spans.map((span) => span.textContent))
            .toEqual([RBT_HINT_SHORTHAND, RBT_HINT_COLOR_LEGEND, RBT_HINT_VIEWPORT]);
        // &nbsp; 的换行语义有意义,不能退化成普通空格
        expect(RBT_HINT_COLOR_LEGEND).toContain('\u00a0');
        expect(RBT_HINT_COLOR_LEGEND).toContain('黒');
        expect(hintBox?.querySelectorAll('br')).toHaveLength(3);
        // 表达式窗口只有编辑器一件,一个字说明都不留
        expect(editorPanel.children).toHaveLength(1);
        expect(editorPanel.querySelector(`.${RBT_HINT_BOX_CLASS}`)).toBeNull();
    });

    it('表达式输入是库的 CodeEditor:宿主 #rbtEditor 里是外框 + textarea + 行号 + 高亮层', () => {
        const { views, editorPanel } = buildViews();
        const editorHost = editorPanel.querySelector(`#${RBT_DOM.editorId}`);

        // 宿主是我们的那一格,也是正文根唯一的孩子;库的外框长在它里面
        expect(editorHost).not.toBeNull();
        expect(editorHost).toBe(editorPanel.children[0]);
        expect(editorHost).toBe(views.editor.element.parentElement);
        expect(views.editor.element.className).toBe('code-editor');

        // 只有库交回的那一颗 textarea(值的唯一真相源)
        const textareas = editorHost?.querySelectorAll('.code-editor-textarea') ?? [];
        expect(textareas).toHaveLength(1);
        expect(textareas[0]).toBe(views.editor.textarea);

        // 占位文案由我们补(库没有 placeholder 选项)
        expect(views.editor.textarea.getAttribute('spellcheck')).toBe('false');
        expect(views.editor.textarea.getAttribute('placeholder')).toBe(RBT_INPUT_PLACEHOLDER);

        // 初始值由挂载函数种(标记里不带 value)
        expect(views.editor.textarea.value).toBe('');

        // 行号与高亮层缺一不可,否则编辑器退化成裸 textarea
        expect(editorHost?.querySelector('.code-editor-lines')?.textContent).toBe('1');
        expect(editorHost?.querySelector('.code-editor-highlight-code')).toBe(views.editor.highlightCode);
        // 高亮开关:文字透明与着色层由同一个类控制,只开一半等于编辑框空白
        expect(views.editor.textarea.classList.contains('is-highlighted')).toBe(true);
    });

    it('唯一输出区初始隐藏且是空的(提示 / 错误 / 清单共用这一个元素)', () => {
        const { views, outputPanel } = buildViews();

        // 正文根里是 提示区 -> 输出区 两件(回正按钮在任务栏)
        expect(outputPanel.children).toHaveLength(2);
        expect(outputPanel.children[1]).toBe(views.output);
        expect(views.output.id).toBe(RBT_DOM.outputId);
        // 容器只认 id(#treeOutput),自己不挂类名
        expect(views.output.className).toBe('');
        expect(views.output.hidden).toBe(true);
        expect(views.output.hasAttribute('hidden')).toBe(true);
        // 标记里不带任何输出内容:写什么由 rbt.ts 每轮重建
        expect(views.output.children).toHaveLength(0);
        expect(views.output.textContent).toBe('');
    });

    it('背景是 视口 div > svg#rbtTree > 世界层 g,绘制面不再有 viewBox / 宽高属性', () => {
        const { views } = buildViews();

        // 视口是库要的背景节点(`.desktop-background` 给定位与底色),同时挂视觉层的
        // 视口类(裁切 / 手势归视觉层的样式)
        expect(views.viewport.tagName.toLowerCase()).toBe('div');
        expect(views.viewport.id).toBe(RBT_DOM.viewportId);
        expect(views.viewport.classList.contains('desktop-background')).toBe(true);
        expect(views.viewport.classList.contains(VISUAL_VIEWPORT_CLASS)).toBe(true);
        expect(views.viewport.children).toHaveLength(1);

        // 标签名一起断言:换成 HTML `<canvas>` 而只改 id 的话,这一条会红
        expect(views.viewport.children[0]).toBe(views.tree);
        expect(views.tree.tagName.toLowerCase()).toBe('svg');
        expect(views.tree.id).toBe(RBT_DOM.treeId);
        expect(views.tree.classList.contains(VISUAL_SURFACE_CLASS)).toBe(true);
        /*
          绘制面(svg)是 1:1 的像素面:
          - 没有 `viewBox`:一个用户单位 = 一个 CSS 像素,世界坐标 -> 屏幕像素的缩放
            只由世界层 transform 表达;
          - 没有 `width` / `height`:显示尺寸由 CSS 给 100%,SVG 自己不缩放.
        */
        expect(views.tree.getAttribute('viewBox')).toBeNull();
        expect(views.tree.getAttribute('width')).toBeNull();
        expect(views.tree.getAttribute('height')).toBeNull();
        expect(views.tree.getAttribute('preserveAspectRatio')).toBeNull();

        // 世界层是 SVG 里唯一一层,树的坐标只在这里被 transform 换算
        expect(views.tree.children).toHaveLength(1);
        expect(views.world.tagName.toLowerCase()).toBe('g');
        expect(views.world.classList.contains(VISUAL_WORLD_CLASS)).toBe(true);
        // 空:每轮画什么由 rbt.ts 重建,这一层不认识树
        expect(views.world.children).toHaveLength(0);
    });

    it('content() 按窗口 id 交回正文:两扇窗口各一根,未知 id 交回空内容', () => {
        const { views, editorPanel, outputPanel } = buildViews();

        expect(views.content(RBT_WINDOW_EDITOR).body).toEqual([editorPanel]);
        expect(views.content(RBT_WINDOW_PROPERTIES).body).toEqual([outputPanel]);
        // 库传进来的是不透明字符串,清单外的 id 不该让装配炸掉
        expect(views.content('nope')).toEqual({});
    });
});

describe('红黑树:桌面装配(mountRBT)', () => {
    it('桌面根里依次是 背景视口 -> 窗口层 -> 吸附预览 -> 任务栏', () => {
        const { host } = renderHost(mountRBT);

        // 三层容器用类名(库的桌面层没有 id 选择器)
        expect([...host.children].map((child) => child.id || child.className))
            .toEqual([RBT_DOM.viewportId, 'window-layer', 'snap-preview', 'dock']);
    });

    it('视口是桌面背景:桌面根的直接子节点,树在里面,都不在任何窗口里', () => {
        const { host } = renderHost(mountRBT);
        const viewport = host.querySelector(`#${RBT_DOM.viewportId}`);
        const tree = host.querySelector(`#${RBT_DOM.treeId}`);

        expect(viewport).not.toBeNull();
        expect(viewport?.parentElement).toBe(host);
        expect(tree?.parentElement).toBe(viewport);
        // 窗口层压在它上面,而它不该被任何窗口收进去
        expect(viewport?.closest('.window')).toBeNull();
        expect(tree?.closest('.window')).toBeNull();
    });

    it('两扇窗口:表达式与性质检查,标题与任务栏文案来自 config 的窗口清单', () => {
        const { host } = renderHost(mountRBT);

        const windows = [...host.querySelectorAll('.window-layer .window')];
        expect(windows.map((window) => window.getAttribute('data-window')))
            .toEqual([RBT_WINDOW_EDITOR, RBT_WINDOW_PROPERTIES]);
        expect(windows.map((window) => window.querySelector('.window-title')?.textContent))
            .toEqual(RBT_DESKTOP_WINDOWS.map((spec) => spec.title));

        // 任务栏每个窗口一枚按钮,文案与顺序跟着窗口清单走
        const buttons = [...host.querySelectorAll('.dock .dock-btn')];
        expect(buttons.map((button) => button.textContent))
            .toEqual(RBT_DESKTOP_WINDOWS.map((spec) => spec.dock.label));
        expect(buttons.map((button) => button.getAttribute('data-window')))
            .toEqual(RBT_DESKTOP_WINDOWS.map((spec) => spec.id));
    });

    it('回正动作由库按 RBT_DOCK_ACTIONS 装配:在任务栏动作区里、排在「全部还原」左边', () => {
        const { host } = renderHost(mountRBT);
        const dock = host.querySelector('.dock');
        if (!dock) throw new Error('桌面里找不到任务栏');

        // 动作区 = config 的动作(按清单顺序)+ 库的「全部还原」
        const actionButtons = [...dock.querySelectorAll<HTMLButtonElement>('.dock-action')];
        expect(actionButtons.map((button) => button.textContent))
            .toEqual([...RBT_DOCK_ACTIONS.map((action) => action.text), '全部还原']);

        const [fit] = actionButtons;
        if (!fit) throw new Error('任务栏动作区里找不到回正按钮');
        // 按钮由库建:`data-dock-action` 就是 config 的 id
        expect(fit.classList.contains('ui-button')).toBe(true);
        expect(fit.classList.contains('dock-action')).toBe(true);
        expect(fit.getAttribute('data-dock-action')).toBe(RBT_DOCK_ACTIONS[0].id);
        expect(fit.title).toBe(RBT_DOCK_ACTIONS[0].title);
        // 桌面级动作:在任务栏里,不属于任何窗口(窗口最小化了它也还在)
        expect(fit.closest('.window')).toBeNull();
        expect(fit.closest('.dock')).toBe(dock);
    });

    it('两个正文根各归各的窗口,都是库的滚动容器(ui-scrollbar)', () => {
        const { host } = renderHost(mountRBT);

        const editorPanel = host.querySelector(`#${RBT_DOM.editorPanelId}`);
        const outputPanel = host.querySelector(`#${RBT_DOM.outputPanelId}`);

        expect(editorPanel?.parentElement).toBe(windowBody(host, RBT_WINDOW_EDITOR));
        expect(outputPanel?.parentElement).toBe(windowBody(host, RBT_WINDOW_PROPERTIES));
        // 滚动条外观由库的 ui-scrollbar 类给,要显式挂
        expect(editorPanel?.classList.contains('ui-scrollbar')).toBe(true);
        expect(outputPanel?.classList.contains('ui-scrollbar')).toBe(true);
    });

    it('文档里没有重复 id', () => {
        renderHost(mountRBT);
        expectNoDuplicateIds();
    });
});
