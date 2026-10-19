/*
 * JSON 查看器桌面:装配 + 每轮输入的全流程.
 *
 * 本文件只做挂载与串联:文档解析 / 校验在 datastruct/scene,性质检查的注册与运行在
 * datastruct/checks(含「检查配置」窗口的函数名列表),自动布局在 visual/layout,行内容在
 * ui/viewer/viewer_items,窗口标记在 ui/viewer/viewer_views.装配顺序:先建内容,再
 * mountDesktop 建桌面三层与窗口外壳.
 *
 * 输入与运行是分开的两步(与 graphcalc 的「源码 / RUN」同一条口径):
 *
 * ```text
 * 打字 / 粘贴 JSON            -> 不重绘(只改编辑器里的文本)
 * 点 RUN 或 Ctrl/Cmd+Enter    -> run()
 *                                   -> parseSceneDocument  (语法 / 结构校验,失败则只显示一行错误)
 *                                   -> currentDocument 记住这一轮结构
 *                                   -> applyCheckConfig  (按「检查配置」窗口里的函数名列表跑检查)
 *                                        -> layoutScene         (树形 / 环形,分量并排)
 *                                        -> 文档 + 布局 -> VisualScene (节点变体来自 attrs)
 *                                        -> renderScene         (整批重建世界层,量包围盒给视口)
 *                                        -> RowList.sync        (实体行 + 检查行,按内容键增量复用)
 * 改「检查配置」               -> applyCheckConfig  (只重算检查,结构仍是最后一次 RUN 的那份)
 * 选中「示例」菜单里的一项     -> 同时写两个编辑器,再 run()
 * ```
 *
 * 检查结论**不是输入**:JSON 只描述结构,要跑哪些检查由「检查配置」窗口单独给;
 * 换一份 JSON 不会出现"手写结论"和"真实结构"对不上的情况.
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
    VIEWER_ERROR_UI_PREFIX,
    VIEWER_EXAMPLE_CHECK_CONFIG,
    VIEWER_EXAMPLE_JSON,
    VIEWER_EXAMPLE_MENU_LABEL,
    VIEWER_FIT_ACTION_ID,
} from '@/ui/viewer/config';
import { parseSceneDocument } from '@/datastruct/scene/scene_document_parse';
import type { SceneDocument, SceneDocumentNode } from '@/datastruct/scene/scene_document';
import type { SceneCheckResult } from '@/datastruct/scene/scene_check';
import { runSceneChecks } from '@/datastruct/checks';
import { layoutScene, type SceneLayout } from '@/visual/layout';
import type { VisualScene } from '@/visual/scene';
import { clearScene, renderScene } from '@/visual/render';
import { mountPlaneViewport, type PlaneViewportHandle } from '@/visual/viewport';
import { dumpCheckConfig, parseCheckConfig } from '@/ui/viewer/check_config';
import {
    DEFAULT_VIEWER_EXAMPLE,
    findViewerExample,
    viewerExampleMenuGroups,
} from '@/ui/viewer/examples';
import {
    formatCheckConfigError,
    formatCheckSummary,
    formatDocumentError,
    formatUnknownChecks,
    nodeVariant,
} from '@/ui/viewer/viewer_format';
import { CheckItem, EntityItem } from '@/ui/viewer/viewer_items';
import { createViewerViews } from '@/ui/viewer/viewer_views';
import {
    DEFAULT_DESKTOP_CONFIG,
    RowList,
    createMenu,
    mountDesktop,
    seedTextareaSource,
    type CodeEditorHandle,
    type DesktopHandle,
    type MenuHandle,
    type MessageLevel,
} from 'miko_ui';

/** 已挂载的一次桌面(按宿主记):dispose 才会摘掉编辑器 / 视口 / 示例菜单挂上的监听 */
interface MountedViewer {
    readonly desktop: DesktopHandle;
    readonly editor: CodeEditorHandle;
    readonly checkEditor: CodeEditorHandle;
    readonly viewport: PlaneViewportHandle;
    readonly menu: MenuHandle<string>;
}

const mounted = new WeakMap<HTMLElement, MountedViewer>();

/** 检查行在 RowList 里的唯一标识:同名检查可能重复出现,所以带上它在数组里的下标 */
interface CheckRowItem {
    readonly id: string;
    readonly check: SceneCheckResult;
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
        // 端点由布局算好(收进圆边界 + 同对连线分道);这里只把 key 换成坐标并保留方向语义
        links: layout.links.map((link) => ({
            from: link.start,
            to: link.end,
            directed: link.directed,
        })),
    };
}

/**
 * 把 JSON 查看器挂到宿主(页面那唯一一颗手写宿主 `#app`)上.
 *
 * 重复挂载同一块宿主时先拆上一份:节点可以靠 replaceChildren 换掉,但编辑器的
 * ResizeObserver / input 监听、视口的 window 监听与示例菜单的 Popover 监听不会随节点
 * 离场消失.
 */
export function mountViewer(host: HTMLElement): void {
    const previous = mounted.get(host);
    previous?.desktop.dispose();
    previous?.editor.dispose();
    previous?.checkEditor.dispose();
    previous?.viewport.dispose();
    previous?.menu.dispose();
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

    const chrome = views.chrome;
    const editor = views.editor;
    const input = editor.textarea;
    const checkEditor = views.checkSetupEditor;
    const checkInput = checkEditor.textarea;
    const worldEl = views.world;
    // 最近一次布局里"节点 key -> 平面坐标":「定位」按它移视口
    const positions = new Map<number, { x: number; y: number }>();
    // 「示例」按钮的浮层菜单:数据是 examples.ts 的分组,选中回调在下面接
    const menu = createMenu<string>({
        groups: viewerExampleMenuGroups(),
        ariaLabel: VIEWER_EXAMPLE_MENU_LABEL,
        trigger: chrome.exampleButton,
        panel: chrome.exampleMenu,
    });
    menu.bind(host);
    mounted.set(host, { desktop, editor, checkEditor, viewport, menu });

    /** 最后一次 RUN 解析通过的结构;没跑过 / 跑失败时为 null(检查配置不重算) */
    let currentDocument: SceneDocument | null = null;

    const entityList = new RowList<SceneDocumentNode, EntityItem>(views.entityList);
    const checkList = new RowList<CheckRowItem, CheckItem>(views.checkList);

    /** 「定位」:把视口移到某个节点(没有布局位置时什么都不做,例如被清空之后) */
    const locate = (key: number): void => {
        const point = positions.get(key);
        if (point === undefined) return;
        viewport.focusPoint(point.x, point.y);
    };

    /** 诊断窗口:一条消息(警告 / 错误两级由库的消息条目配色) */
    const showDiagnostics = (level: MessageLevel, text: string): void => {
        views.diagnostics.list.render([{ level, message: text }]);
    };

    /** 清空诊断窗口 */
    const clearDiagnostics = (): void => {
        views.diagnostics.list.render([]);
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
    const updateListMeta = (document: SceneDocument, checks: readonly SceneCheckResult[]): void => {
        views.entityCount.hidden = false;
        views.entityCount.textContent = `共 ${document.nodes.length} 个节点`;
        views.entityEmpty.hidden = document.nodes.length > 0;
        views.checkSummary.hidden = false;
        views.checkEmpty.hidden = checks.length > 0;
        const failed = checks.filter((check) => !check.passed).length;
        views.checkSummary.textContent = formatCheckSummary(checks.length, failed);
    };

    /** 检查行:每轮按内容键增量同步;展开态从同名旧行搬过来 */
    const renderChecks = (checks: readonly SceneCheckResult[]): void => {
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

    /** 画布 + 列表:吃一份已经解析好的文档与本轮检查结论(解析归 run) */
    const paint = (document: SceneDocument, checks: readonly SceneCheckResult[]): void => {
        /*
          布局 / 落笔 / 列表是"解析通过之后"的事.解析器已经保证了引用与 key,这一步
          理论上不该抛;真抛了(例如将来布局加上节点数上限)也只显示一行错误,不把
          异常丢进事件处理里炸掉整个页面.
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
            renderChecks(checks);
            updateListMeta(document, checks);
        } catch (error) {
            clearContent();
            showDiagnostics('error', `${VIEWER_ERROR_UI_PREFIX}渲染失败: ${formatDocumentError(error)}`);
        }
    };

    /**
     * 按「检查配置」窗口对最后一次 RUN 的结构重算检查并重绘.
     *
     * 配置本身错 / 有未注册的名字都不影响画图:配置错 -> 这次不跑检查并报错;
     * 名字错 -> 已注册的照跑并警告.当前没有可检查的结构时什么都不做(诊断里那行
     * 解析错误 / 空输入提示保持原样).
     */
    const applyCheckConfig = (): void => {
        const document = currentDocument;
        if (document === null) return;

        let checkIds: readonly string[] = [];
        let checkConfigError: unknown = null;
        try {
            checkIds = parseCheckConfig(checkInput.value);
        } catch (error) {
            checkConfigError = error;
        }
        const checkRun = runSceneChecks(document, checkIds);

        clearDiagnostics();
        if (checkConfigError !== null) {
            showDiagnostics('error', `${VIEWER_ERROR_UI_PREFIX}${formatCheckConfigError(checkConfigError)}`);
        } else if (checkRun.unknownIds.length > 0) {
            showDiagnostics('warning', formatUnknownChecks(checkRun.unknownIds));
        }

        paint(document, checkRun.checks);
    };

    /** RUN:解析 JSON 编辑器里的内容,成为"当前结构",再按检查配置跑检查并重绘 */
    const run = (): void => {
        const source = input.value.trim();

        if (source === '') {
            currentDocument = null;
            clearContent();
            showDiagnostics('warning', VIEWER_EMPTY_HINT_TEXT);
            return;
        }

        let document: SceneDocument;
        try {
            document = parseSceneDocument(source);
        } catch (error) {
            currentDocument = null;
            clearContent();
            showDiagnostics('error', `${VIEWER_ERROR_UI_PREFIX}${formatDocumentError(error)}`);
            return;
        }

        // 没有节点:画布与检查都没有对象可看,提示一句就结束(不跑检查,避免空的 PASS 行)
        if (document.nodes.length === 0) {
            currentDocument = null;
            clearContent();
            showDiagnostics('warning', VIEWER_EMPTY_DOCUMENT_HINT_TEXT);
            return;
        }

        currentDocument = document;
        applyCheckConfig();
    };

    /**
     * 载入一份内置示例:JSON 与检查配置一起换,然后运行.
     *
     * 选中示例是**明确的操作**,所以直接跑;这与"改 JSON 不自动跑"不冲突 -- 后者防的是
     * 打字过程中每敲一个字符就重解析重布局.
     */
    const loadExample = (id: string): void => {
        const example = findViewerExample(id);
        if (example === undefined) return;

        seedTextareaSource(input, example.json);
        editor.refresh();
        seedTextareaSource(checkInput, dumpCheckConfig(example.checkIds));
        checkEditor.refresh();
        menu.setActive(id);
        run();
    };

    // RUN:解析 + 检查 + 重绘;JSON 编辑本身不触发任何重算
    chrome.runButton.addEventListener('click', run);
    // 与 graphcalc 同一条快捷键:编辑器里单独回车是换行,Ctrl/Cmd+Enter 才是运行
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            run();
        }
    });
    // 检查配置窗口仍即时生效:只重算检查,结构沿用最后一次 RUN 的结果
    checkInput.addEventListener('input', applyCheckConfig);
    menu.onSelect(loadExample);

    /*
      打开页面时自动加载默认示例并跑一次.

      走库的 `seedTextareaSource`(不抢焦点,也没有撤销历史要保);它不派发 input
      事件,所以装饰层与画布都得自己叫一次:先 refresh(重算行号 + 重绘高亮),再 run.

      检查配置也预置一份与默认 JSON 匹配的 rbt 检查;换 JSON 时用户自己改这份数组,
      或者用「示例」菜单整组换.
    */
    seedTextareaSource(input, VIEWER_EXAMPLE_JSON);
    editor.refresh();
    seedTextareaSource(checkInput, VIEWER_EXAMPLE_CHECK_CONFIG);
    checkEditor.refresh();
    menu.setActive(DEFAULT_VIEWER_EXAMPLE.id);
    run();
}
