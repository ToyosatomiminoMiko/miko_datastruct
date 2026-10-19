// JSON 查看器的显示层声明:DOM 契约、窗口清单、任务栏动作、默认 JSON 与帮助文案.
//
// 这里只放**显示值**:中性文档的解析与校验在 datastruct/scene,自动布局在
// visual/layout,本文件不含图元与布局算法.红黑树的语义色只作为"一个示例结构"出现
// (默认 JSON + 节点 red / black 变体的样式),查看器本身不认识红黑树.

import type { DockActionSpec, WindowConfigEntry } from 'miko_ui';

// DOM 契约(id 由 src/ui/viewer/viewer.css 命中)

/**
 * 查看器用到的 DOM id:标记由 ui/viewer/viewer_views.ts 按这里的声明生成,CSS 与
 * 冒烟脚本按同一份 id 定位.
 */
export const VIEWER_DOM = {
    /** 平面视口:桌面背景那一层(窗口层压在它上面) */
    viewportId: 'viewerViewport',
    /** 绘制面 `<svg>`:世界坐标的 1:1 像素面,没有 viewBox */
    treeId: 'viewerTree',
    /** JSON 编辑器宿主:库的 CodeEditor 外框长在它里面 */
    editorId: 'viewerEditor',
    /** JSON 编辑器窗口的正文根(滚动归它;这一扇里只有编辑器) */
    editorPanelId: 'viewerEditorPanel',
    /** 实体窗口的正文根(滚动归它) */
    entityPanelId: 'viewerEntityPanel',
    /** 检查窗口的正文根(滚动归它) */
    checkPanelId: 'viewerCheckPanel',
    /** 帮助窗口的正文根:静态说明,滚动归它 */
    helpPanelId: 'viewerHelpPanel',
    /** 诊断窗口的正文根:库的 `createMessageArea` 建的那颗容器(解析错误 / 提示) */
    diagnosticsPanelId: 'viewerDiagnosticsPanel',
    /** 实体列表容器(RowList 的宿主) */
    entityListId: 'viewerEntityList',
    /** 检查列表容器(RowList 的宿主) */
    checkListId: 'viewerCheckList',
    /** 检查抬头(几条中几条 FAIL) */
    checkSummaryId: 'viewerCheckSummary',
} as const;

// 桌面窗口

/** JSON 输入窗口的 id */
export const VIEWER_WINDOW_JSON = 'json';

/** 实体列表窗口的 id */
export const VIEWER_WINDOW_ENTITY = 'entity';

/** 检查列表窗口的 id */
export const VIEWER_WINDOW_CHECK = 'check';

/** 诊断窗口的 id:解析错误 / 空输入提示都走库的消息区 */
export const VIEWER_WINDOW_DIAGNOSTICS = 'diagnostics';

/** 帮助窗口的 id */
export const VIEWER_WINDOW_HELP = 'help';

/** 应用自己的窗口 id 联合:窗口内容表按它收口,漏一扇窗口编译期就报错 */
export type ViewerWindowId =
    | typeof VIEWER_WINDOW_JSON
    | typeof VIEWER_WINDOW_ENTITY
    | typeof VIEWER_WINDOW_CHECK
    | typeof VIEWER_WINDOW_DIAGNOSTICS
    | typeof VIEWER_WINDOW_HELP;

/** 窗口与桌面边缘的间隙(px):默认几何与库的 edgeGap 引同一个数 */
export const VIEWER_DESKTOP_INSET = 16;

/** 窗口默认宽度(px):左右各一栏,中间留给桌面背景上的结构图 */
export const VIEWER_WINDOW_WIDTH = 430;

/**
 * 五扇窗口的声明(数组顺序 = 任务栏按钮顺序 = 初始 z 序).
 *
 * 左右各一栏,中间留给背景那幅结构图:
 * - JSON 窗口在左上,占工作区高度的 42%;
 * - 诊断窗口在 JSON 下方(`after`),占 20%:解析错误 / 空输入提示走库的消息区;
 * - 帮助窗口在诊断下方(`after`),接到桌面下沿;
 * - 实体窗口在右上,占 42%;
 * - 检查窗口在实体下方(`after`),接到桌面下沿.
 *
 * 实体 / 检查 / 诊断各成一扇(而不是一扇里几段):三件事的列表长度互不相干,拆开之后
 * 各自滚动、各自最小化,一栏不会被另一栏挤掉;JSON 窗口因此只剩编辑器.
 */
export const VIEWER_DESKTOP_WINDOWS = [
    {
        id: VIEWER_WINDOW_JSON,
        title: 'JSON',
        dock: { label: 'JSON' },
        defaultGeometry: {
            x: { at: VIEWER_DESKTOP_INSET },
            y: { at: VIEWER_DESKTOP_INSET },
            w: { at: VIEWER_WINDOW_WIDTH },
            h: { fraction: 0.42, of: 'usableHeight' },
        },
        minSize: { w: 300, h: 200 },
    },
    {
        id: VIEWER_WINDOW_ENTITY,
        title: '实体',
        dock: { label: '实体' },
        defaultGeometry: {
            x: { from: 'right', inset: VIEWER_DESKTOP_INSET },
            y: { at: VIEWER_DESKTOP_INSET },
            w: { at: VIEWER_WINDOW_WIDTH },
            h: { fraction: 0.42, of: 'usableHeight' },
        },
        minSize: { w: 300, h: 160 },
    },
    {
        id: VIEWER_WINDOW_CHECK,
        title: '检查',
        dock: { label: '检查' },
        defaultGeometry: {
            // y 被 after 覆盖,按库的约定写占位值
            x: { from: 'right', inset: VIEWER_DESKTOP_INSET },
            y: { at: 0 },
            w: { at: VIEWER_WINDOW_WIDTH },
            h: { from: 'bottom', inset: VIEWER_DESKTOP_INSET },
            after: { id: VIEWER_WINDOW_ENTITY, gap: VIEWER_DESKTOP_INSET },
        },
        minSize: { w: 300, h: 160 },
    },
    {
        id: VIEWER_WINDOW_DIAGNOSTICS,
        title: '诊断',
        dock: { label: '诊断' },
        defaultGeometry: {
            // y 被 after 覆盖,按库的约定写占位值
            x: { at: VIEWER_DESKTOP_INSET },
            y: { at: 0 },
            w: { at: VIEWER_WINDOW_WIDTH },
            h: { fraction: 0.2, of: 'usableHeight' },
            after: { id: VIEWER_WINDOW_JSON, gap: VIEWER_DESKTOP_INSET },
        },
        minSize: { w: 300, h: 100 },
    },
    {
        id: VIEWER_WINDOW_HELP,
        title: '帮助',
        dock: { label: '帮助' },
        defaultGeometry: {
            // y 被 after 覆盖,按库的约定写占位值
            x: { at: VIEWER_DESKTOP_INSET },
            y: { at: 0 },
            w: { at: VIEWER_WINDOW_WIDTH },
            h: { from: 'bottom', inset: VIEWER_DESKTOP_INSET },
            after: { id: VIEWER_WINDOW_DIAGNOSTICS, gap: VIEWER_DESKTOP_INSET },
        },
        minSize: { w: 300, h: 160 },
    },
] as const satisfies readonly WindowConfigEntry[];

// 任务栏动作:回正视图

/** 回正按钮文案 */
export const VIEWER_FIT_BUTTON_TEXT = '回正视图';

/** 回正按钮的悬停说明 */
export const VIEWER_FIT_BUTTON_TITLE = '把整幅结构图装回视口并居中,之后重绘继续自动适应';

/** 回正动作 id:库只把它写进 `data-dock-action`,点击时原样交回 */
export const VIEWER_FIT_ACTION_ID = 'fit-viewport';

/** 任务栏动作清单:库按它建按钮并排在「全部还原」左边 */
export const VIEWER_DOCK_ACTIONS = [
    { id: VIEWER_FIT_ACTION_ID, text: VIEWER_FIT_BUTTON_TEXT, title: VIEWER_FIT_BUTTON_TITLE },
] as const satisfies readonly DockActionSpec[];

// 编辑器

/** JSON 编辑器的占位文案(库没有 placeholder 选项,建完写回 textarea) */
export const VIEWER_EDITOR_PLACEHOLDER =
    '粘贴一份中性场景 JSON:{"nodes":[{"key":0,"label":"A"}],"checks":[]}';

/** 编辑器行号槽的宽度下限(px),交给 CodeEditor 的 gutterMinWidth */
export const VIEWER_EDITOR_GUTTER_MIN_WIDTH = 32;

// 检查与提示文案

/** 解析失败的前缀(与旧界面的 "错误: " 同一口径,不用符号) */
export const VIEWER_ERROR_UI_PREFIX = '错误: ';

/** 空输入时的提示 */
export const VIEWER_EMPTY_HINT_TEXT = '粘贴一份中性场景 JSON 后开始展示 (例如默认的红黑树示例)';

/** 输入只有空白 / `{}` 时的提示 */
export const VIEWER_EMPTY_DOCUMENT_HINT_TEXT = '这份 JSON 里没有节点,画布上没有东西可画';

/** 没有节点时的占位说明 */
export const VIEWER_ENTITY_EMPTY_TEXT = '无节点';

/** 没有检查时的占位说明 */
export const VIEWER_CHECK_EMPTY_TEXT = '无检查';

/** 检查抬头模板(与旧界面同一句口径):`{total}` 条中 `{failed}` 条 FAIL */
export const VIEWER_CHECK_SUMMARY = '{total} 条中 {failed} 条 FAIL';

/** PASS / FAIL 的可见文字 */
export const VIEWER_CHECK_PASS_TEXT = 'PASS';
export const VIEWER_CHECK_FAIL_TEXT = 'FAIL';

/** 行末「定位」按钮的文案与可访问名前缀 */
export const VIEWER_LOCATE_BUTTON_TEXT = '定位';
export const VIEWER_LOCATE_BUTTON_LABEL = '在背景平面中定位';

// 类名契约
//
// 行外壳(`object-row` / `row-main` / `row-actions`)与徽章基线(`ui-badge`)归库;
// 下面这些是查看器自己的增量类名,只在 ui/viewer/viewer.css 里命中.

/** 实体行(每节点一行) */
export const VIEWER_ENTITY_ROW_CLASS = 'entity-row';

/** 检查行(每条检查一行) */
export const VIEWER_CHECK_ROW_CLASS = 'check-row';

/** 检查状态徽章上追加的变体类:is-pass / is-fail */
export const VIEWER_CHECK_STATE_CLASS = 'check-state';

/** 检查行第二行说明(行内可见的一句话) */
export const VIEWER_ROW_DETAIL_CLASS = 'viewer-row-detail';

/** 检查行折叠区块(<details>) */
export const VIEWER_DETAILS_CLASS = 'viewer-details';

/** 检查行摘要行(折叠态可见的那一行;没有折叠区块时也用它) */
export const VIEWER_SUMMARY_ROW_CLASS = 'viewer-summary-row';

/** 检查行折叠区块的 <summary>(只负责开合热区;两行内容在里面的 SummaryRow 里) */
export const VIEWER_SUMMARY_CLASS = 'viewer-summary';

/** 检查行折叠区块的正文 */
export const VIEWER_DETAILS_BODY_CLASS = 'viewer-details-body';

/** 折叠正文里的每一行 */
export const VIEWER_DETAIL_LINE_CLASS = 'viewer-detail-line';

/** 实体属性小徽章(key: value) */
export const VIEWER_ATTRIBUTE_CLASS = 'viewer-attr';

/** 颜色属性的"色块 + 明文值" */
export const VIEWER_COLOR_CLASS = 'viewer-color';
export const VIEWER_COLOR_SWATCH_CLASS = 'viewer-color-swatch';
export const VIEWER_COLOR_CODE_CLASS = 'viewer-color-code';

/** 帮助窗口里的分区标题 */
export const VIEWER_SECTION_TITLE_CLASS = 'viewer-section-title';

/** 实体窗口顶部的一行数量(`共 N 个节点`) */
export const VIEWER_LIST_COUNT_CLASS = 'viewer-list-count';

/** 列表的空状态说明 */
export const VIEWER_EMPTY_CLASS = 'viewer-empty';

/** 检查抬头 */
export const VIEWER_CHECK_SUMMARY_CLASS = 'viewer-check-summary';

/** 帮助窗口里的行 */
export const VIEWER_HELP_LINE_CLASS = 'viewer-help-line';

// JSON 词法着色:类名契约(样式在 ui/viewer/tokens.css)
//
// 高亮产物由 ui/viewer/viewer_highlight.ts 生成,颜色只在 tokens.css 里;
// 类名是跨文件契约(高亮器产出 / CSS 命中 / 测试断言),改名要三处一起改.

export const VIEWER_TOKEN_KEY_CLASS = 'viewer-token--key';
export const VIEWER_TOKEN_STRING_CLASS = 'viewer-token--string';
export const VIEWER_TOKEN_NUMBER_CLASS = 'viewer-token--number';
export const VIEWER_TOKEN_LITERAL_CLASS = 'viewer-token--literal';
export const VIEWER_TOKEN_PUNCT_CLASS = 'viewer-token--punct';

// 默认 JSON:一棵故意写错的 6 节点红黑树
//
// 选一棵**有一处 FAIL** 的树而不是全 PASS:检查列表要同时展示 PASS / FAIL 两种行,
// FAIL 行还要展示折叠详情与「定位」.这棵树的错在第三条(黑高):左子树多一层黑,
// 2 节点黑高的 10B 两侧不一样.树本身仍然画得出来.
//
// 字段口径与 python/README.md 的 Scene 输出一致,只多一个 `checks`;checks 里的
// `node` 是"这条结论指向哪个节点"(给「定位」用),`details` 是展开后的补充行.

export const VIEWER_EXAMPLE_JSON = `{
  "nodes": [
    { "key": 0, "label": "10",
      "attrs": { "color": "black" } },
    { "key": 1, "label": "5",
      "attrs": { "color": "red" } },
    { "key": 2, "label": "1",
      "attrs": { "color": "black" } },
    { "key": 3, "label": "8",
      "attrs": { "color": "black" } },
    { "key": 4, "label": "15",
      "attrs": { "color": "red" } }
  ],
  "pointers": [
    { "from": 0, "to": 1 },
    { "from": 1, "to": 2 },
    { "from": 1, "to": 3 },
    { "from": 0, "to": 4 }
  ],
  "edges": [],
  "checks": [
    { "name": "根节点为黑色", "passed": true },
    { "name": "红色节点的孩子都是黑色",
      "passed": true },
    {
      "name": "各路径黑色节点数量相同",
      "passed": false,
      "detail": "节点 10B 两侧黑高不同: 较浅一侧 1, 较深一侧 2",
      "details": [
        "黑高按「节点到 nil 叶子」计,含节点自身的黑",
        "左子树走 10B -> 5R -> 1B: 黑高 2",
        "右子树走 10B -> 15R -> nil: 黑高 1"
      ],
      "node": 0
    },
    { "name": "二叉搜索树有序", "passed": true }
  ]
}`;

// 帮助窗口:静态说明
//
// 原来的三行提示(表达式简写 / 配色图例 / 视口操作)随"输入换成 JSON"改写:
// 简写语法是自定义表示法,不再使用;配色与视口操作仍然要说明,所以留在帮助里.

/** 帮助窗口的条目:标题 + 若干行说明(纯文本) */
export interface ViewerHelpEntry {
    readonly title: string;
    readonly lines: readonly string[];
}

export const VIEWER_HELP_ENTRIES: readonly ViewerHelpEntry[] = [
    {
        title: '输入是什么',
        lines: [
            '一份中性场景 JSON = 一个结构:节点 (nodes)、有向指针 (pointers)、无向边 (edges)、检查结论 (checks)。',
            '节点按 key 相互引用;pointers 与 edges 都引用 nodes[].key。',
        ],
    },
    {
        title: '字段',
        lines: [
            'nodes: [{ key, label, attrs? }] -- attrs 是结构特有属性 (如红黑树的 color)。',
            'pointers: [{ from, to }] -- 有向;树就是父 -> 子。',
            'edges: [{ a, b, label?, attrs? }] -- 无向;图里的边。',
            'checks: [{ name, passed, detail?, details?, node? }] -- node 指向要定位的节点。',
        ],
    },
    {
        title: '画布怎么动',
        lines: [
            '背景平面: 拖动平移、滚轮缩放。',
            `点任务栏里的「${VIEWER_FIT_BUTTON_TEXT}」把整幅图装回视口。`,
            '检查行或实体行末的「定位」: 把视口移到对应节点并放大到可读比例。',
        ],
    },
    {
        title: '列表',
        lines: [
            '实体窗口: 每个节点一行, 显示 label 与 attrs。',
            '检查窗口: 每条结论一行; FAIL 行可展开详情, 并可按 node 定位。',
            '诊断窗口: JSON 解析失败 / 空输入提示走库的消息区 (错误 / 警告两级)。',
        ],
    },
];
