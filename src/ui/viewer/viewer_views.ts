/*
 * JSON 查看器的**桌面视图组件**(声明式):按 config.ts 的声明产出桌面背景(平面绘制面
 * 由视觉层 visual/surface.ts 建)与六扇窗口的正文节点,由 ui/viewer/viewer.ts 的
 * `mountViewer` 交给库的 `mountDesktop` 装配.
 *
 * 本模块是纯函数:不读页面,不改全局,不绑业务事件;列表行内容的装配在 viewer_items.ts,
 * RUN / 示例菜单的接线与每轮重绘在 viewer.ts,标题栏节点在 viewer_chrome.ts.
 *
 * 六扇窗口各装一件事:JSON 输入、实体列表、检查配置(编辑器)、检查列表、诊断消息、帮助.
 * 实体 / 检查配置 / 检查拆成独立窗口而不是一扇里几段:几件事的长度互不相干,拆开之后
 * 各自滚动、各自最小化,一栏不会被另一栏挤掉.
 */

import {
    create_element,
    createCodeEditor,
    createMessageArea,
    windowSlotsProvider,
    type Child,
    type CodeEditorHandle,
    type MessageAreaHandle,
    type WindowContentSpec,
} from 'miko_ui';
import {
    VIEWER_ADOPTED_NODES,
    VIEWER_CHECK_SETUP_EDITOR_LABEL,
    VIEWER_DOM,
    VIEWER_EDITOR_GUTTER_MIN_WIDTH,
    VIEWER_EDITOR_PLACEHOLDER,
    VIEWER_HELP_ENTRIES,
    VIEWER_HELP_LINE_CLASS,
    VIEWER_SECTION_TITLE_CLASS,
    VIEWER_LIST_COUNT_CLASS,
    VIEWER_EMPTY_CLASS,
    VIEWER_CHECK_SUMMARY_CLASS,
    VIEWER_CHECK_EMPTY_TEXT,
    VIEWER_ENTITY_EMPTY_TEXT,
    VIEWER_WINDOW_CHECK,
    VIEWER_WINDOW_CHECK_SETUP,
    VIEWER_WINDOW_DIAGNOSTICS,
    VIEWER_WINDOW_ENTITY,
    VIEWER_WINDOW_HELP,
    VIEWER_WINDOW_JSON,
    type ViewerWindowId,
} from '@/ui/viewer/config';
import { highlightJson } from '@/ui/viewer/viewer_highlight';
import { createViewerChrome, type ViewerChrome } from '@/ui/viewer/viewer_chrome';
import { createVisualSurface } from '@/visual/surface';

/** 结构图那块绘制面的读屏标签(它不是纯装饰:画的是这一份 JSON 的结构) */
const VIEWER_TREE_LABEL = '结构图';

/** JSON 查看器的桌面视图:桌面背景 + 六扇窗口正文 / 标题栏槽位 + 行为代码要用的引用 */
export interface ViewerViews {
    /** 平面视口(交给库当桌面背景,挂 `.desktop-background`) */
    readonly viewport: HTMLElement;
    /** 绘制面 `<svg>`:1:1 的像素面,没有 viewBox */
    readonly tree: SVGSVGElement;
    /** 世界层 `<g>`:场景里的一切都挂在这里,视口只改它的 transform */
    readonly world: SVGGElement;
    /** JSON 窗口标题栏上的三个节点(示例按钮 / RUN 按钮 / 示例菜单面板) */
    readonly chrome: ViewerChrome;
    /** 逐窗口内容:库的 `mountDesktop` 按窗口 id 现取一次 */
    readonly content: (id: string) => WindowContentSpec;
    /** JSON 编辑器句柄(值的唯一真相源 + refresh) */
    readonly editor: CodeEditorHandle;
    /**
     * 诊断窗口:库的消息区句柄(容器 + 条目接口).
     *
     * 不自己画提示行:`MessageList` 管 `aria-live`、增量渲染与错误 / 警告两级配色,
     * 应用只决定"往窗口里放什么".
     */
    readonly diagnostics: MessageAreaHandle;
    /** 实体列表容器(RowList 宿主) */
    readonly entityList: HTMLElement;
    /** 检查列表容器(RowList 宿主) */
    readonly checkList: HTMLElement;
    /** 实体窗口顶部的数量行(`共 N 个节点`) */
    readonly entityCount: HTMLElement;
    /** 检查窗口顶部的抬头(`n 条中 m 条 FAIL`) */
    readonly checkSummary: HTMLElement;
    /** 空状态说明 */
    readonly entityEmpty: HTMLElement;
    readonly checkEmpty: HTMLElement;
    /** 检查配置窗口的正文根(滚动归它) */
    readonly checkSetupPanel: HTMLElement;
    /** 检查配置编辑器:一段 JSON 数组,元素是检查函数名 */
    readonly checkSetupEditor: CodeEditorHandle;
}

/** 一个列表窗口的正文:顶部一行说明 + 列表容器 + 空状态;交回面板与列表两个句柄 */
function createListPanel(
    panelId: string,
    header: HTMLElement,
    listId: string,
    empty: HTMLElement,
): { readonly panel: HTMLElement; readonly list: HTMLElement } {
    const list = create_element({ tag: 'div' }, { class: 'viewer-list', id: listId });
    const panel = create_element(
        { tag: 'div' },
        { class: 'ui-scrollbar', id: panelId },
        header,
        list,
        empty,
    );
    return { panel, list };
}

/**
 * 按 config.ts 的声明式模型生成桌面背景与逐窗口内容.
 *
 * 走的是"脱离式建节点 + 交回句柄"的老路:窗口正文由库按 id 搬进去,行为层只按引用
 * 操作节点,不查 DOM.
 */
export function createViewerViews(): ViewerViews {
    // JSON 窗口标题栏:示例 / RUN 是两个按钮,菜单面板进标题栏浮层槽位
    const chrome = createViewerChrome();
    const slots = windowSlotsProvider(VIEWER_ADOPTED_NODES, chrome);

    // JSON 编辑器:库的外框 + 行号 + 高亮层;分词(JSON)与槽宽下限由这里给
    const editor = createCodeEditor({
        spellcheck: false,
        highlight: highlightJson,
        gutterMinWidth: VIEWER_EDITOR_GUTTER_MIN_WIDTH,
    });
    editor.textarea.setAttribute('placeholder', VIEWER_EDITOR_PLACEHOLDER);

    const editorHost = create_element({ tag: 'div' }, { id: VIEWER_DOM.editorId }, editor.element);

    // 桌面背景:平面视口 -> 绘制面 -> 世界层,标记由视觉层按正式定义建
    const { viewport, svg: tree, world } = createVisualSurface({
        viewportId: VIEWER_DOM.viewportId,
        svgId: VIEWER_DOM.treeId,
        svgLabel: VIEWER_TREE_LABEL,
        viewportClass: 'desktop-background',
    });

    // 实体窗口:数量行 + 列表 + 空状态
    const entityCount = create_element({ tag: 'p' }, { class: VIEWER_LIST_COUNT_CLASS });
    entityCount.hidden = true;
    const entityEmpty = create_element({ tag: 'p' }, { class: VIEWER_EMPTY_CLASS }, VIEWER_ENTITY_EMPTY_TEXT);
    entityEmpty.hidden = true;

    // 检查窗口:抬头 + 列表 + 空状态
    const checkSummary = create_element({ tag: 'p' }, { class: VIEWER_CHECK_SUMMARY_CLASS, id: VIEWER_DOM.checkSummaryId });
    checkSummary.hidden = true;
    const checkEmpty = create_element({ tag: 'p' }, { class: VIEWER_EMPTY_CLASS }, VIEWER_CHECK_EMPTY_TEXT);
    checkEmpty.hidden = true;

    /*
      诊断窗口:库的消息区**就是**窗口正文根(没有第二层宿主).容器给 `ui-scrollbar`
      挂滚动条外观;`message-area--unframed` 去掉它自带的框体 -- 窗口外壳那圈描边就是
      它的框,再套一层就是两层边框.错误 / 警告条目的配色与 `aria-live` 都归库.
    */
    const diagnostics = createMessageArea({
        modifier: 'message-area--unframed',
        class: 'ui-scrollbar',
    });
    diagnostics.element.id = VIEWER_DOM.diagnosticsPanelId;

    /*
      六扇窗口的正文根各自是滚动容器(`ui-scrollbar` 是库的滚动条类):滑条贴着窗口边.
      不套"卡片":库的 `.window-body` 已经裁好高度,窗口描边就是内容框. JSON 窗口
      只有编辑器(提示 / 错误在诊断窗口里).
    */
    const editorPanel = create_element(
        { tag: 'div' },
        { class: 'ui-scrollbar', id: VIEWER_DOM.editorPanelId },
        editorHost,
    );
    const entity = createListPanel(
        VIEWER_DOM.entityPanelId,
        entityCount,
        VIEWER_DOM.entityListId,
        entityEmpty,
    );
    const check = createListPanel(
        VIEWER_DOM.checkPanelId,
        checkSummary,
        VIEWER_DOM.checkListId,
        checkEmpty,
    );

    /*
      检查配置窗口:与 JSON 窗口共用同一套 CodeEditor + JSON 词法高亮.
      内容是一段 JSON 数组(元素 = 检查函数名);提示与可用函数名在帮助窗口里,
      这一扇只放编辑器,不摆说明 / 状态行 / 目录.
    */
    const checkSetupEditor = createCodeEditor({
        spellcheck: false,
        highlight: highlightJson,
        gutterMinWidth: VIEWER_EDITOR_GUTTER_MIN_WIDTH,
    });
    checkSetupEditor.textarea.setAttribute('aria-label', VIEWER_CHECK_SETUP_EDITOR_LABEL);
    const checkSetupEditorHost = create_element(
        { tag: 'div' },
        { id: VIEWER_DOM.checkSetupEditorId },
        checkSetupEditor.element,
    );
    const checkSetupPanel = create_element(
        { tag: 'div' },
        { class: 'ui-scrollbar', id: VIEWER_DOM.checkSetupPanelId },
        checkSetupEditorHost,
    );

    // 帮助窗口:静态说明,与这一轮的输入无关
    const helpLines: Child[] = [];
    for (const entry of VIEWER_HELP_ENTRIES) {
        helpLines.push(
            create_element(
                { tag: 'section' },
                { class: 'viewer-help-section' },
                create_element({ tag: 'h2' }, { class: VIEWER_SECTION_TITLE_CLASS }, entry.title),
                ...entry.lines.map((line) => create_element({ tag: 'p' }, { class: VIEWER_HELP_LINE_CLASS }, line)),
            ),
        );
    }
    const helpPanel = create_element(
        { tag: 'div' },
        { class: 'ui-scrollbar', id: VIEWER_DOM.helpPanelId },
        ...helpLines,
    );

    const bodies: Readonly<Record<ViewerWindowId, readonly Child[]>> = {
        [VIEWER_WINDOW_JSON]: [editorPanel],
        [VIEWER_WINDOW_ENTITY]: [entity.panel],
        [VIEWER_WINDOW_CHECK_SETUP]: [checkSetupPanel],
        [VIEWER_WINDOW_CHECK]: [check.panel],
        [VIEWER_WINDOW_DIAGNOSTICS]: [diagnostics.element],
        [VIEWER_WINDOW_HELP]: [helpPanel],
    };

    /** 窗口 id 守卫:库传进来的是不透明字符串,未知 id 给空内容 */
    const isViewerWindowId = (id: string): id is ViewerWindowId => id in bodies;

    return {
        viewport,
        tree,
        world,
        chrome,
        content: (id) => (isViewerWindowId(id) ? { slots: slots(id), body: bodies[id] } : {}),
        editor,
        diagnostics,
        entityList: entity.list,
        checkList: check.list,
        checkSetupPanel,
        checkSetupEditor,
        entityCount,
        checkSummary,
        entityEmpty,
        checkEmpty,
    };
}
