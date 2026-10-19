/*
 * JSON 查看器桌面:装配 + 每轮输入的全流程.
 *
 * 本文件只做挂载与串联:文档解析 / 校验在 datastruct/scene,自动布局在
 * visual/layout,行内容在 ui/viewer/viewer_items,窗口标记在 ui/viewer/viewer_views.
 * 装配顺序:先建内容,再 mountDesktop 建桌面三层与窗口外壳.
 *
 * 每轮输入(或首屏示例)的流程:
 *
 * ```text
 * textarea.value
 *   -> parseSceneDocument  (语法 / 结构校验,失败则只显示一行错误)
 *   -> layoutScene         (树形 / 环形,分量并排)
 *   -> 文档 + 布局 -> VisualScene (节点变体来自 attrs)
 *   -> renderScene         (整批重建世界层,量包围盒给视口)
 *   -> RowList.sync        (实体行 + 检查行,按内容键增量复用)
 * ```
 */

// 本模块引入样式:视觉层(visual.css:绘制面 / 节点 / 指针的通用观感)与查看器自己的
// tokens.css / viewer.css(窗口正文 / 列表行 / 检查徽章 / JSON 词法着色).顺序即层叠
// 顺序:视觉层的通用规则在前,查看器的增量规则在后.
import '@/visual/visual.css';
import '@/ui/viewer/viewer.css';

import {
    VIEWER_DESKTOP_INSET,
    VIEWER_DESKTOP_WINDOWS,
    VIEWER_DOCK_ACTIONS,
    VIEWER_EMPTY_DOCUMENT_HINT_TEXT,
    VIEWER_EMPTY_HINT_TEXT,
    VIEWER_ERROR_CLASS,
    VIEWER_ERROR_UI_PREFIX,
    VIEWER_EXAMPLE_JSON,
    VIEWER_FIT_ACTION_ID,
    VIEWER_HINT_CLASS,
} from '@/ui/viewer/config';
import { parseSceneDocument } from '@/datastruct/scene/scene_document_parse';
import type { SceneDocument, SceneDocumentCheck, SceneDocumentNode } from '@/datastruct/scene/scene_document';
import { layoutScene, type SceneLayout } from '@/visual/layout';
import type { VisualScene } from '@/visual/scene';
import { clearScene, renderScene } from '@/visual/render';
import { mountPlaneViewport, type PlaneViewportHandle } from '@/visual/viewport';
import { formatCheckSummary, formatDocumentError, nodeVariant } from '@/ui/viewer/viewer_format';
import { CheckItem, EntityItem } from '@/ui/viewer/viewer_items';
import { createViewerViews } from '@/ui/viewer/viewer_views';
import {
    DEFAULT_DESKTOP_CONFIG,
    RowList,
    mountDesktop,
    seedTextareaSource,
    type CodeEditorHandle,
    type DesktopHandle,
} from 'miko_ui';

/** 已挂载的一次桌面(按宿主记):dispose 才会摘掉编辑器与视口挂在 window / 元素上的监听 */
interface MountedViewer {
    readonly desktop: DesktopHandle;
    readonly editor: CodeEditorHandle;
    readonly viewport: PlaneViewportHandle;
}

const mounted = new WeakMap<HTMLElement, MountedViewer>();

/** 检查行在 RowList 里的唯一标识:同名检查可能重复出现,所以带上它在数组里的下标 */
interface CheckRowItem {
    readonly id: string;
    readonly check: SceneDocumentCheck;
}

/**
 * 文档 + 布局 -> 视觉层场景.
 *
 * 这是"中性文档"与"视觉词汇"唯一的接缝:文档层的 attrs 只在这里被翻译成视觉变体
 * (红黑树的 `color: "red"` -> `visual-node--red`),视觉层本身不认识 color.
 */
function buildVisualScene(document: SceneDocument, layout: SceneLayout): VisualScene {
    const positions = new Map(layout.nodes.map((node) => [node.key, node] as const));
    const pointOf = (key: number): { x: number; y: number } => {
        const node = positions.get(key);
        if (node === undefined) throw new Error(`布局里没有节点 ${key}`);
        return { x: node.x, y: node.y };
    };

    return {
        nodes: document.nodes.map((node) => {
            const at = pointOf(node.key);
            const variant = nodeVariant(node.attrs);
            return variant === undefined
                ? { at, label: node.label }
                : { at, label: node.label, variant };
        }),
        // 有向指针与无向边在视觉层都是"两点之间的线段"(箭头 / 边的区分以后再加)
        pointers: layout.links.map((link) => ({
            from: pointOf(link.from),
            to: pointOf(link.to),
        })),
    };
}

/**
 * 把 JSON 查看器挂到宿主(页面那唯一一颗手写宿主 `#app`)上.
 *
 * 重复挂载同一块宿主时先拆上一份:节点可以靠 replaceChildren 换掉,但编辑器的
 * ResizeObserver / input 监听与视口的 window 监听不会随节点离场消失.
 */
export function mountViewer(host: HTMLElement): void {
    const previous = mounted.get(host);
    previous?.desktop.dispose();
    previous?.editor.dispose();
    previous?.viewport.dispose();
    mounted.delete(host);

    host.replaceChildren();

    const views = createViewerViews();
    // 平面视口绑在背景节点上:拖动 / 滚轮只改世界层的 transform
    const viewport = mountPlaneViewport(views.viewport, views.world, {
        topInset: DEFAULT_DESKTOP_CONFIG.dockReserve,
    });

    const desktop = mountDesktop(host, {
        ...DEFAULT_DESKTOP_CONFIG,
        edgeGap: VIEWER_DESKTOP_INSET,
        windows: VIEWER_DESKTOP_WINDOWS,
        dockActions: VIEWER_DOCK_ACTIONS,
        onDockAction: (id) => {
            if (id === VIEWER_FIT_ACTION_ID) viewport.fitViewport();
        },
        background: [views.viewport],
        content: views.content,
    });

    const editor = views.editor;
    const input = editor.textarea;
    const worldEl = views.world;
    // 最近一次布局里"节点 key -> 平面坐标":「定位」按它移视口
    const positions = new Map<number, { x: number; y: number }>();
    mounted.set(host, { desktop, editor, viewport });

    const entityList = new RowList<SceneDocumentNode, EntityItem>(views.entityList);
    const checkList = new RowList<CheckRowItem, CheckItem>(views.checkList);

    /** 「定位」:把视口移到某个节点(没有布局位置时什么都不做,例如被清空之后) */
    const locate = (key: number): void => {
        const point = positions.get(key);
        if (point === undefined) return;
        viewport.focusPoint(point.x, point.y);
    };

    /** 提示 / 错误行:同一颗元素按类名切换语义 */
    const showMessage = (className: string, text: string): void => {
        views.message.className = className;
        views.message.textContent = text;
        views.message.hidden = false;
    };

    /** 清空画布与两个列表(空输入 / 解析失败 / 空文档三种情况共用) */
    const clearContent = (): void => {
        positions.clear();
        clearScene(worldEl);
        entityList.clear();
        checkList.clear();
        views.entityCount.hidden = true;
        views.entityCount.textContent = '';
        views.checkSummary.hidden = true;
        views.checkSummary.textContent = '';
        views.entityEmpty.hidden = true;
        views.checkEmpty.hidden = true;
    };

    /** 实体数量 / 检查抬头 / 空状态 */
    const updateListMeta = (document: SceneDocument): void => {
        views.entityCount.hidden = false;
        views.entityCount.textContent = `共 ${document.nodes.length} 个节点`;
        views.entityEmpty.hidden = document.nodes.length > 0;
        views.checkSummary.hidden = false;
        views.checkEmpty.hidden = document.checks.length > 0;
        const failed = document.checks.filter((check) => !check.passed).length;
        views.checkSummary.textContent = formatCheckSummary(document.checks.length, failed);
    };

    /** 检查行:每轮按内容键增量同步;展开态从同名旧行搬过来 */
    const renderChecks = (checks: readonly SceneDocumentCheck[]): void => {
        const items: CheckRowItem[] = checks.map((check, index) => ({ id: `check-${index}`, check }));
        checkList.sync(items, {
            name: (item) => item.id,
            key: (item) => CheckItem.cacheKey(item.check),
            build: (item, previous) => {
                const node = item.check.node;
                const onLocate = !item.check.passed && node !== null ? () => locate(node) : null;
                const row = new CheckItem(item.check, onLocate);
                if (previous !== null) row.preserveExpandedStateFrom(previous);
                return row;
            },
        });
    };

    /** 实体行:每个节点一行,行末「定位」 */
    const renderEntities = (document: SceneDocument): void => {
        entityList.sync(document.nodes, {
            name: (node) => String(node.key),
            key: EntityItem.cacheKey,
            build: (node) => new EntityItem(node, () => locate(node.key)),
        });
    };

    /** 一轮完整重绘:解析 -> 布局 -> 画布 -> 列表 */
    const render = (): void => {
        const source = input.value.trim();

        if (source === '') {
            clearContent();
            showMessage(VIEWER_HINT_CLASS, VIEWER_EMPTY_HINT_TEXT);
            return;
        }

        let document: SceneDocument;
        try {
            document = parseSceneDocument(source);
        } catch (error) {
            clearContent();
            showMessage(VIEWER_ERROR_CLASS, `${VIEWER_ERROR_UI_PREFIX}${formatDocumentError(error)}`);
            return;
        }

        // 既没有节点也没有检查:这份 JSON 是空的,画布与列表都没有内容可展示.
        // 只有检查、没有节点的文档是合法的(例如"空结构"的结论),照常展示检查列表.
        if (document.nodes.length === 0 && document.checks.length === 0) {
            clearContent();
            showMessage(VIEWER_HINT_CLASS, VIEWER_EMPTY_DOCUMENT_HINT_TEXT);
            return;
        }

        views.message.hidden = true;
        views.message.textContent = '';

        /*
          布局 / 落笔 / 列表是"解析通过之后"的事.解析器已经保证了引用与 key,这一步
          理论上不该抛;真抛了(例如将来布局加上节点数上限)也只显示一行错误,不把
          异常丢进 input 事件里炸掉整个页面.
        */
        try {
            const layout = layoutScene(document);
            // 先更新定位表,再建行:行里的「定位」回调读的是当前这一轮的位置
            positions.clear();
            for (const node of layout.nodes) positions.set(node.key, { x: node.x, y: node.y });

            // 落笔后把量到的实际包围盒报给视口;量不到(测试环境)就不动视角
            const bounds = renderScene(worldEl, buildVisualScene(document, layout));
            if (bounds !== null) viewport.contentChanged(bounds);

            renderEntities(document);
            renderChecks(document.checks);
            updateListMeta(document);
        } catch (error) {
            clearContent();
            showMessage(VIEWER_ERROR_CLASS, `${VIEWER_ERROR_UI_PREFIX}渲染失败: ${formatDocumentError(error)}`);
        }
    };

    input.addEventListener('input', render);

    /*
      打开页面时自动加载默认示例.

      走库的 `seedTextareaSource`(不抢焦点,也没有撤销历史要保);它不派发 input
      事件,所以装饰层与画布都得自己叫一次:先 refresh(重算行号 + 重绘高亮),
      再 render.
    */
    seedTextareaSource(input, VIEWER_EXAMPLE_JSON);
    editor.refresh();
    render();
}
