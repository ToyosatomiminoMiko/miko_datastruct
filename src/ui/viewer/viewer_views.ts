/*
 * JSON 查看器的**桌面视图组件**(声明式):按 config.ts 的声明产出桌面背景(平面绘制面
 * 由视觉层 visual/surface.ts 建)与四扇窗口的正文节点,由 ui/viewer/viewer.ts 的
 * `mountViewer` 交给库的 `mountDesktop` 装配.
 *
 * 本模块是纯函数:不读页面,不改全局,不绑业务事件;列表行内容的装配在 viewer_items.ts,
 * 解析 / 布局 / 每轮重绘在 viewer.ts.
 *
 * 四扇窗口各装一件事:JSON 输入(含解析提示 / 错误行)、实体列表、检查列表、帮助.
 * 实体与检查拆成两扇而不是一扇里两段:两件事的列表长度互不相干,拆开之后各自滚动、
 * 各自最小化,一栏不会被另一栏挤掉.
 */

import {
    create_element,
    createCodeEditor,
    type Child,
    type CodeEditorHandle,
    type WindowContentSpec,
} from 'miko_ui';
import {
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
    VIEWER_WINDOW_ENTITY,
    VIEWER_WINDOW_HELP,
    VIEWER_WINDOW_JSON,
    type ViewerWindowId,
} from '@/ui/viewer/config';
import { highlightJson } from '@/ui/viewer/viewer_highlight';
import { createVisualSurface } from '@/visual/surface';

/** 结构图那块绘制面的读屏标签(它不是纯装饰:画的是这一份 JSON 的结构) */
const VIEWER_TREE_LABEL = '结构图';

/** JSON 查看器的桌面视图:桌面背景 + 四扇窗口正文 + 行为代码要用的引用 */
export interface ViewerViews {
    /** 平面视口(交给库当桌面背景,挂 `.desktop-background`) */
    readonly viewport: HTMLElement;
    /** 绘制面 `<svg>`:1:1 的像素面,没有 viewBox */
    readonly tree: SVGSVGElement;
    /** 世界层 `<g>`:场景里的一切都挂在这里,视口只改它的 transform */
    readonly world: SVGGElement;
    /** 逐窗口内容:库的 `mountDesktop` 按窗口 id 现取一次 */
    readonly content: (id: string) => WindowContentSpec;
    /** JSON 编辑器句柄(值的唯一真相源 + refresh) */
    readonly editor: CodeEditorHandle;
    /** 解析提示 / 错误行(中性提示与错误共用;挂在 JSON 窗口编辑器下方) */
    readonly message: HTMLElement;
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

    /*
      提示 / 错误行:挂在 JSON 窗口的编辑器下方 -- "输入不对"这句话属于输入窗口,
      不该让两个结果窗口各说一遍.同一颗元素靠类名区分中性提示 / 解析错误.
    */
    const message = create_element({ tag: 'p' }, { id: VIEWER_DOM.messageId });
    message.hidden = true;

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
      四扇窗口的正文根各自是滚动容器(`ui-scrollbar` 是库的滚动条类):滑条贴着窗口边.
      不套"卡片":库的 `.window-body` 已经裁好高度,窗口描边就是内容框.
    */
    const editorPanel = create_element(
        { tag: 'div' },
        { class: 'ui-scrollbar', id: VIEWER_DOM.editorPanelId },
        editorHost,
        message,
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
        [VIEWER_WINDOW_CHECK]: [check.panel],
        [VIEWER_WINDOW_HELP]: [helpPanel],
    };

    /** 窗口 id 守卫:库传进来的是不透明字符串,未知 id 给空内容 */
    const isViewerWindowId = (id: string): id is ViewerWindowId => id in bodies;

    return {
        viewport,
        tree,
        world,
        content: (id) => (isViewerWindowId(id) ? { body: bodies[id] } : {}),
        editor,
        message,
        entityList: entity.list,
        checkList: check.list,
        entityCount,
        checkSummary,
        entityEmpty,
        checkEmpty,
    };
}
