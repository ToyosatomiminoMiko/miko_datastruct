/**
 * JSON 查看器的标记契约(happy-dom):createViewerViews() 的标记(挂载之前).
 *
 * 钉窗口正文分几件、编辑器是不是库的 CodeEditor、实体 / 检查两个列表窗口的初始态、
 * 提示行挂在哪扇窗口、帮助内容、以及平面绘制面三层.逐字文案来自 config,不在这里再抄.
 *
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';

import {
    VIEWER_DESKTOP_WINDOWS,
    VIEWER_DOM,
    VIEWER_EDITOR_PLACEHOLDER,
    VIEWER_HELP_ENTRIES,
    VIEWER_WINDOW_CHECK,
    VIEWER_WINDOW_ENTITY,
    VIEWER_WINDOW_HELP,
    VIEWER_WINDOW_JSON,
} from '@/ui/viewer/config';
import { createViewerViews, type ViewerViews } from '@/ui/viewer/viewer_views';
import {
    VISUAL_SURFACE_CLASS,
    VISUAL_VIEWPORT_CLASS,
    VISUAL_WORLD_CLASS,
} from '@/visual/config';

/** 建一次视图,顺手取四扇窗口的正文根 */
function buildViews(): {
    views: ViewerViews;
    editorPanel: HTMLElement;
    entityPanel: HTMLElement;
    checkPanel: HTMLElement;
    helpPanel: HTMLElement;
} {
    const views = createViewerViews();
    return {
        views,
        editorPanel: views.content(VIEWER_WINDOW_JSON).body?.[0] as HTMLElement,
        entityPanel: views.content(VIEWER_WINDOW_ENTITY).body?.[0] as HTMLElement,
        checkPanel: views.content(VIEWER_WINDOW_CHECK).body?.[0] as HTMLElement,
        helpPanel: views.content(VIEWER_WINDOW_HELP).body?.[0] as HTMLElement,
    };
}

describe('JSON 查看器:视图标记(挂载之前)', () => {
    it('四扇窗口各交回一根正文根,未知 id 交回空内容', () => {
        const { views, editorPanel, entityPanel, checkPanel, helpPanel } = buildViews();
        expect(editorPanel.id).toBe(VIEWER_DOM.editorPanelId);
        expect(entityPanel.id).toBe(VIEWER_DOM.entityPanelId);
        expect(checkPanel.id).toBe(VIEWER_DOM.checkPanelId);
        expect(helpPanel.id).toBe(VIEWER_DOM.helpPanelId);
        expect(views.content('nope')).toEqual({});
    });

    it('JSON 编辑器是库的 CodeEditor:宿主里是外框 + textarea + 行号 + 高亮层', () => {
        const { views, editorPanel } = buildViews();
        const host = editorPanel.querySelector(`#${VIEWER_DOM.editorId}`);

        expect(host).not.toBeNull();
        expect(host).toBe(editorPanel.children[0]);
        expect(host).toBe(views.editor.element.parentElement);
        expect(views.editor.element.className).toBe('code-editor');
        expect(views.editor.textarea.getAttribute('placeholder')).toBe(VIEWER_EDITOR_PLACEHOLDER);
        // 行号槽与高亮层缺一不可,否则编辑器退化成裸 textarea
        expect(host?.querySelector('.code-editor-lines')?.textContent).toBe('1');
        expect(host?.querySelector('.code-editor-highlight-code')).toBe(views.editor.highlightCode);
        expect(views.editor.textarea.classList.contains('is-highlighted')).toBe(true);
    });

    it('提示 / 错误行挂在 JSON 窗口编辑器下方(输入的问题归输入窗口)', () => {
        const { views, editorPanel } = buildViews();
        expect(editorPanel.children).toHaveLength(2);
        expect(editorPanel.children[1]).toBe(views.message);
        expect(views.message.hidden).toBe(true);
    });

    it('实体窗口:数量行 + 实体列表 + 空状态', () => {
        const { views, entityPanel } = buildViews();

        expect(entityPanel.children).toHaveLength(3);
        expect(entityPanel.children[0]).toBe(views.entityCount);
        expect(views.entityList.id).toBe(VIEWER_DOM.entityListId);
        expect(views.entityList.children).toHaveLength(0);
        expect(views.entityCount.hidden).toBe(true);
        expect(views.entityEmpty.hidden).toBe(true);
        expect(views.message.parentElement).not.toBe(entityPanel);
    });

    it('检查窗口:抬头 + 检查列表 + 空状态', () => {
        const { views, checkPanel } = buildViews();

        expect(checkPanel.children).toHaveLength(3);
        expect(checkPanel.children[0]).toBe(views.checkSummary);
        expect(views.checkList.id).toBe(VIEWER_DOM.checkListId);
        expect(views.checkList.children).toHaveLength(0);
        expect(views.checkSummary.id).toBe(VIEWER_DOM.checkSummaryId);
        expect(views.checkSummary.textContent).toBe('');
        expect(views.checkSummary.hidden).toBe(true);
        expect(views.checkEmpty.hidden).toBe(true);
        expect(views.message.parentElement).not.toBe(checkPanel);
    });

    it('帮助窗口:每一条帮助都有一个标题和若干行说明', () => {
        const { helpPanel } = buildViews();
        const sections = [...helpPanel.querySelectorAll('.viewer-help-section')];
        expect(sections).toHaveLength(VIEWER_HELP_ENTRIES.length);
        expect(sections.map((section) => section.querySelector('h2')?.textContent))
            .toEqual(VIEWER_HELP_ENTRIES.map((entry) => entry.title));
        expect(sections.map((section) => section.querySelectorAll('.viewer-help-line').length))
            .toEqual(VIEWER_HELP_ENTRIES.map((entry) => entry.lines.length));
    });

    it('背景是 视口 div > svg#viewerTree > 世界层 g,绘制面没有 viewBox / 宽高', () => {
        const { views } = buildViews();

        expect(views.viewport.classList.contains('desktop-background')).toBe(true);
        expect(views.viewport.classList.contains(VISUAL_VIEWPORT_CLASS)).toBe(true);
        expect(views.viewport.children).toHaveLength(1);
        expect(views.viewport.children[0]).toBe(views.tree);
        expect(views.tree.tagName.toLowerCase()).toBe('svg');
        expect(views.tree.classList.contains(VISUAL_SURFACE_CLASS)).toBe(true);
        expect(views.tree.getAttribute('viewBox')).toBeNull();
        expect(views.tree.children).toHaveLength(1);
        expect(views.world.classList.contains(VISUAL_WORLD_CLASS)).toBe(true);
        expect(views.world.children).toHaveLength(0);
    });

    it('窗口清单按 config 声明:四扇窗口的标题与 id 一一对应', () => {
        expect(VIEWER_DESKTOP_WINDOWS.map((window) => window.id)).toEqual([
            VIEWER_WINDOW_JSON,
            VIEWER_WINDOW_ENTITY,
            VIEWER_WINDOW_CHECK,
            VIEWER_WINDOW_HELP,
        ]);
    });
});
