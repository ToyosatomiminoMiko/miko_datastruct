/**
 * 红黑树**桌面视图**的标记契约(进程内,跑在 happy-dom 里).
 *
 * 这一层分两段,因为"标记长什么样"与"桌面装配成什么样"是两件事:
 *
 * 1. **视图标记**(`createRbtViews()` 的返回值,此时还没挂进任何文档):性质检查窗口里
 *    的提示区三行 + 初始 hidden 的输出区 `#treeOutput`、表达式窗口里唯一一件编辑器
 *    宿主 `#rbtEditor`、以及一块**空的**平面背景(视口 `#rbtViewport` → `<svg>`
 *    `#rbtTree` → 世界层 `.rbt-world`).这些是"标记里本来有什么",必须在挂载前断言 --
 *    一挂载,rbt.ts 就会种入示例并画出 31 个节点;
 * 2. **桌面装配**(`mountRBT()`,与 index.html 同形):桌面根里依次是 背景(视口)->
 *    窗口层 -> 吸附预览 -> 任务栏,`#rbtViewport` 是桌面根的直接子节点、**不在任何窗口
 *    里**(这就是"树是桌面背景"这句话的全部可断言内容),两扇窗口的正文根各挂库的
 *    `ui-scrollbar`,窗口标题与任务栏文案来自 config 的窗口清单.
 *
 * `src/rbt/rbt.css` 按 `#rbtViewport` / `#rbtTree` / `#rbtEditorPanel` /
 * `#rbtOutputPanel` / `#rbtEditor` / `#treeOutput` 命中;平面几何(叶子节距 / 视口参数)与
 * 窗口清单都来自 config.逐字文案(三行提示里的 U+00A0 与「黒」)一并钉住:顺手改掉就会
 * 变成静默的文案漂移.
 *
 * 表达式输入从裸 textarea 换成 miko_ui 的 CodeEditor(见 ui/rbt_views.ts)之后,这一层
 * 钉的是**装配契约**,不是库的内部结构:
 * - 我们那一格宿主 `#rbtEditor` 在正文里,库的外框 `.code-editor` 长在它里面;
 * - textarea 是库建的,但 spellcheck 与 placeholder 由我们给(库没有 placeholder 选项);
 * - 行号槽与高亮层都在,且高亮开关(`is-highlighted`)已经打开 -- 那个类同时控制
 *   "textarea 文字透明"与"高亮层显示",少一半的后果是编辑框一片空白;
 * - **分词不在这里测**:那是纯函数,见 rbt_highlight.test.ts.
 *
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';

import {
    RBT_DESKTOP_WINDOWS,
    RBT_DOM,
    RBT_HINT_BOX_CLASS,
    RBT_HINT_COLOR_LEGEND,
    RBT_HINT_SHORTHAND,
    RBT_HINT_VIEWPORT,
    RBT_INPUT_PLACEHOLDER,
    RBT_WINDOW_EDITOR,
    RBT_WINDOW_PROPERTIES,
    RBT_WORLD_CLASS,
} from '@/rbt/config';
import { mountRBT } from '@/rbt/rbt';
import { createRbtViews, type RbtViews } from '@/rbt/ui/rbt_views';
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

/** 按窗口 id 取那扇窗口的正文容器(取不到说明装配变了,直接抛错而不是让断言读 null) */
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
        // &nbsp; 在不换行语义上有意义,不能退化成普通空格
        expect(RBT_HINT_COLOR_LEGEND).toContain('\u00a0');
        expect(RBT_HINT_COLOR_LEGEND).toContain('黒');
        // 三行各自以 <br> 结束
        expect(hintBox?.querySelectorAll('br')).toHaveLength(3);
        // 表达式窗口一个字的说明都不留:那扇窗口只有编辑器一件
        expect(editorPanel.children).toHaveLength(1);
        expect(editorPanel.querySelector(`.${RBT_HINT_BOX_CLASS}`)).toBeNull();
    });

    it('表达式输入是库的 CodeEditor:宿主 #rbtEditor 里是外框 + textarea + 行号 + 高亮层', () => {
        const { views, editorPanel } = buildViews();
        const editorHost = editorPanel.querySelector(`#${RBT_DOM.editorId}`);

        // 宿主是我们的那一格,而且是正文根唯一的孩子(提示区已经搬去另一扇窗口);
        // 库的外框长在它里面(库的元素上一个 id 都没有)
        expect(editorHost).not.toBeNull();
        expect(editorHost).toBe(editorPanel.children[0]);
        expect(editorHost).toBe(views.editor.element.parentElement);
        expect(views.editor.element.className).toBe('code-editor');

        // textarea 就是库交回的那一颗,而且只有这一颗(值的唯一真相源)
        const textareas = editorHost?.querySelectorAll('.code-editor-textarea') ?? [];
        expect(textareas).toHaveLength(1);
        expect(textareas[0]).toBe(views.editor.textarea);

        // 拼写检查按库的布尔选项写成属性;占位文案由我们补(库没有 placeholder 选项)
        expect(views.editor.textarea.getAttribute('spellcheck')).toBe('false');
        expect(views.editor.textarea.getAttribute('placeholder')).toBe(RBT_INPUT_PLACEHOLDER);

        // 表达式是"代码",初始值由挂载函数种(标记里不带 value)
        expect(views.editor.textarea.value).toBe('');

        // 行号与高亮层缺一不可:没有它们编辑器就退化成裸 textarea
        expect(editorHost?.querySelector('.code-editor-lines')?.textContent).toBe('1');
        expect(editorHost?.querySelector('.code-editor-highlight-code')).toBe(views.editor.highlightCode);
        // 高亮开关:文字透明与着色层由同一个类控制,只开一半等于编辑框空白
        expect(views.editor.textarea.classList.contains('is-highlighted')).toBe(true);
    });

    it('唯一输出区初始隐藏且是空的(提示 / 错误 / 清单共用这一个元素)', () => {
        const { views, outputPanel } = buildViews();

        // 正文根里是 说明(提示区)-> 结果(输出区) 两件
        expect(outputPanel.children).toHaveLength(2);
        expect(outputPanel.children[1]).toBe(views.output);
        expect(views.output.id).toBe(RBT_DOM.outputId);
        // 容器只认 id(#treeOutput):自己不挂类名(类名契约只剩提示行 / 错误行 / 抬头的类)
        expect(views.output.className).toBe('');
        expect(views.output.hidden).toBe(true);
        expect(views.output.hasAttribute('hidden')).toBe(true);
        // 标记里不带任何输出内容:写什么由 rbt.ts 每轮重建
        expect(views.output.children).toHaveLength(0);
        expect(views.output.textContent).toBe('');
    });

    it('背景是 视口 div > svg#rbtTree > 世界层 g,画布不再有 viewBox / 宽高属性', () => {
        const { views } = buildViews();

        // 视口是库要的那颗背景节点(`.desktop-background` 给定位与底色,见 miko_ui)
        expect(views.viewport.tagName.toLowerCase()).toBe('div');
        expect(views.viewport.id).toBe(RBT_DOM.viewportId);
        expect(views.viewport.classList.contains('desktop-background')).toBe(true);
        expect(views.viewport.children).toHaveLength(1);

        // 标签名一起断言:换成 canvas 而只改 id 的话,这一条会红
        expect(views.viewport.children[0]).toBe(views.tree);
        expect(views.tree.tagName.toLowerCase()).toBe('svg');
        expect(views.tree.id).toBe(RBT_DOM.treeId);
        /*
          平面化的核心断言:画布是 **1:1 的像素面**.

          - 没有 `viewBox`:一个用户单位就是一个 CSS 像素,布局算出来的坐标不用换算,
            "世界坐标 -> 屏幕像素"的缩放只由世界层的 transform 表达;
          - 没有 `width` / `height` 属性:显示尺寸由 CSS 给 100%(铺满视口),SVG 自己
            不缩放 -- 这两条一起没掉,才叫"不再是定尺画布".
        */
        expect(views.tree.getAttribute('viewBox')).toBeNull();
        expect(views.tree.getAttribute('width')).toBeNull();
        expect(views.tree.getAttribute('height')).toBeNull();
        expect(views.tree.getAttribute('preserveAspectRatio')).toBeNull();

        // 世界层:SVG 里唯一一层,树的世界坐标只在这一层的 transform 里被换算
        expect(views.tree.children).toHaveLength(1);
        expect(views.world.tagName.toLowerCase()).toBe('g');
        expect(views.world.classList.contains(RBT_WORLD_CLASS)).toBe(true);
        // 空:每轮画什么由 rbt.ts 重建,这一层不认识树(视口句柄只改它的 transform)
        expect(views.world.children).toHaveLength(0);
    });

    it('content() 按窗口 id 交回正文:两扇窗口各一根,未知 id 交回空内容', () => {
        const { views, editorPanel, outputPanel } = buildViews();

        expect(views.content(RBT_WINDOW_EDITOR).body).toEqual([editorPanel]);
        expect(views.content(RBT_WINDOW_PROPERTIES).body).toEqual([outputPanel]);
        // 库传进来的是不透明字符串:清单外的 id 不该让装配炸掉
        expect(views.content('nope')).toEqual({});
    });
});

describe('红黑树:桌面装配(mountRBT)', () => {
    it('桌面根里依次是 背景视口 -> 窗口层 -> 吸附预览 -> 任务栏', () => {
        const { host } = renderHost(mountRBT);

        // 三层容器用类名(库的桌面层没有 id 选择器,也不要求消费者写宿主)
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
        // 窗口层压在它上面,而它不该被任何窗口收进去(收进去就退回"面板里的一块画布")
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

        // 任务栏每个窗口一枚按钮(文案与顺序都跟着窗口清单走)
        const buttons = [...host.querySelectorAll('.dock .dock-btn')];
        expect(buttons.map((button) => button.textContent))
            .toEqual(RBT_DESKTOP_WINDOWS.map((spec) => spec.dock.label));
        expect(buttons.map((button) => button.getAttribute('data-window')))
            .toEqual(RBT_DESKTOP_WINDOWS.map((spec) => spec.id));
    });

    it('两个正文根各归各的窗口,都是库的滚动容器(ui-scrollbar)', () => {
        const { host } = renderHost(mountRBT);

        const editorPanel = host.querySelector(`#${RBT_DOM.editorPanelId}`);
        const outputPanel = host.querySelector(`#${RBT_DOM.outputPanelId}`);

        expect(editorPanel?.parentElement).toBe(windowBody(host, RBT_WINDOW_EDITOR));
        expect(outputPanel?.parentElement).toBe(windowBody(host, RBT_WINDOW_PROPERTIES));
        // 滚动条外观是库的一条独立规定(见 miko_ui 的 styles/scrollbar.css),要显式挂类
        expect(editorPanel?.classList.contains('ui-scrollbar')).toBe(true);
        expect(outputPanel?.classList.contains('ui-scrollbar')).toBe(true);
    });

    it('文档里没有重复 id', () => {
        renderHost(mountRBT);
        expectNoDuplicateIds();
    });
});
