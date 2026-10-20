/*
 * JSON 查看器桌面:装配 + 每轮输入的全流程.
 *
 * 本文件只做挂载与串联:文档解析 / 校验在 scene,性质检查的注册与运行在
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
    VIEWER_DEMO_ACTION_ID,
    VIEWER_DEMO_MENU_LABEL,
    VIEWER_DEMO_WINDOW_TITLE,
    VIEWER_DESKTOP_INSET,
    VIEWER_DESKTOP_WINDOWS,
    VIEWER_DOCK_ACTIONS,
    VIEWER_DOM,
    VIEWER_EMPTY_DOCUMENT_HINT_TEXT,
    VIEWER_EMPTY_HINT_TEXT,
    VIEWER_ERROR_UI_PREFIX,
    VIEWER_EXAMPLE_CHECK_CONFIG,
    VIEWER_EXAMPLE_JSON,
    VIEWER_EXAMPLE_MENU_LABEL,
    VIEWER_FIT_ACTION_ID,
    VIEWER_WINDOW_CHECK,
    VIEWER_WINDOW_CHECK_SETUP,
    VIEWER_WINDOW_DIAGNOSTICS,
    VIEWER_WINDOW_ENTITY,
    VIEWER_WINDOW_HELP,
    VIEWER_WINDOW_JSON,
    type ViewerWindowId,
} from '@/ui/viewer/config';
import { parseSceneDocument } from '@/scene/scene_document_parse';
import type { SceneDocument, SceneDocumentNode } from '@/scene/scene_document';
import type { SceneCheckResult } from '@/scene/scene_check';
import { runSceneChecks } from '@/datastruct/checks';
import { layoutScene, type SceneLayout } from '@/visual/layout';
import type { VisualScene } from '@/visual/scene';
import { clearScene, renderScene } from '@/visual/render';
import { mountPlaneViewport, type PlaneViewportHandle } from '@/visual/viewport';
import { dumpCheckConfig, parseCheckConfig } from '@/ui/viewer/check_config';
import { ScenePainter } from '@/visual/painter';
import {
    createDemoPlayer,
    type DemoCameraRequest,
    type DemoPlayerHandle,
    type DemoPlayerPorts,
} from '@/ui/viewer/demo_player';
import { findDemoScenario, demoScenarioMenuGroups } from '@/ui/viewer/demo_scenarios';
import { bindDemoKeys, createDemoBar, type DemoBarHandle } from '@/ui/viewer/demo_views';
import {
    createDemoWindow,
    demoWindowDocked,
    type DemoWindowHandle,
} from '@/ui/viewer/demo_window';
import { createRafClock, prefersReducedMotion } from '@/visual/tween';
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
    create_element,
    mountDesktop,
    seedTextareaSource,
    type AbsoluteGeometry,
    type CodeEditorHandle,
    type DesktopHandle,
    type MenuHandle,
    type MessageLevel,
} from 'miko_ui';

/** 已挂载的一次桌面(按宿主记):dispose 才会摘掉编辑器 / 视口 / 菜单挂上的监听 */
interface MountedViewer {
    readonly desktop: DesktopHandle;
    readonly editor: CodeEditorHandle;
    readonly checkEditor: CodeEditorHandle;
    readonly viewport: PlaneViewportHandle;
    readonly menu: MenuHandle<string>;
    readonly demoMenu: MenuHandle<string>;
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
    previous?.demoMenu.dispose();
    mounted.delete(host);

    host.replaceChildren();

    const views = createViewerViews();
    // 平面视口绑在背景节点上:拖动 / 滚轮只改世界层的 transform
    const viewport = mountPlaneViewport(views.viewport, views.world, {
        insets: { top: DEFAULT_DESKTOP_CONFIG.dockReserve, bottom: 0 },
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

    /*
      「演示」按钮在任务栏动作区(库按 VIEWER_DOCK_ACTIONS 建),剧本菜单挂在它下面.

      库的动作按钮只给 `data-dock-action` 与点击上报,不提供"自定义触发元素"的入口;
      这里做两件事把菜单接上:
      1. 把按钮包进 `.menu-anchor`(库的浮层 DOM 分组:`display: contents`,零盒子,
         不参与布局 -- 包不包这层 div,按钮在 `.dock-actions` 里的矩形完全一样);
      2. 在同一锚点里放一份菜单面板,交给 createMenu 做开合 / 选中.
      落点不归应用:库的 `Popover` 打开时量触发件,写 `left/top/min-width`,视口边上
      自动翻转 / 夹取(见 `miko_ui/src/widgets/overlayPlacement.ts`).
      按钮本身仍是库建的 `createButton`,类名与点击语义不变;这只是把现成节点挪进
      一个 DOM 分组,不复制按钮.
    */
    const dockDemoButton = desktop.dock.querySelector<HTMLButtonElement>(
        `[data-dock-action="${VIEWER_DEMO_ACTION_ID}"]`,
    );
    if (dockDemoButton === null) throw new Error('任务栏里缺少「演示」动作按钮');
    dockDemoButton.setAttribute('aria-haspopup', 'true');
    const demoMenuAnchor = create_element({ tag: 'div' }, { class: 'menu-anchor' });
    dockDemoButton.parentElement?.insertBefore(demoMenuAnchor, dockDemoButton);
    demoMenuAnchor.append(dockDemoButton);
    const demoMenuPanel = create_element({ tag: 'div' }, { id: VIEWER_DOM.demoMenuId });
    demoMenuAnchor.append(demoMenuPanel);
    const demoMenu = createMenu<string>({
        groups: demoScenarioMenuGroups(),
        ariaLabel: VIEWER_DEMO_MENU_LABEL,
        trigger: dockDemoButton,
        panel: demoMenuPanel,
    });
    demoMenu.bind(host);
    mounted.set(host, { desktop, editor, checkEditor, viewport, menu, demoMenu });

    /** 最后一次 RUN 解析通过的结构;没跑过 / 跑失败时为 null(检查配置不重算) */
    let currentDocument: SceneDocument | null = null;
    /** 最后一次静态绘制的结构 / 检查:退出演示后要把它原样画回来 */
    let lastStaticDocument: SceneDocument | null = null;
    let lastStaticChecks: readonly SceneCheckResult[] = [];
    /** 当前演示会话;null = 静态模式 */
    let demoSession: DemoSession | null = null;

    /**
     * 一次演示会话:播放器 + 控制窗口 / 控制条 + 增量落笔器 + 进入前的窗口状态.
     *
     * 窗口状态在进入时快照,退出时按它恢复:演示只"临时让出画面",不改用户原来的
     * 六窗口布局(docs/animation.md §9.2).控制窗口不进那六扇的状态机,随会话现建现拆.
     */
    interface DemoSession {
        readonly player: DemoPlayerHandle;
        readonly bar: DemoBarHandle;
        /** 装控制条的窗口(固定大小、标题栏可拖;退出时随会话拆掉) */
        readonly window: DemoWindowHandle;
        readonly painter: ScenePainter;
        readonly savedWindows: ReadonlyMap<ViewerWindowId, 'normal' | 'maximized' | 'minimized'>;
        /** 进入前的「检查配置」编辑器内容:演示改了它,退出要还原(否则静态检查配置与画面对不上) */
        readonly savedCheckConfig: string;
        readonly keys: AbortController;
    }

    const entityList = new RowList<SceneDocumentNode, EntityItem>(views.entityList);
    const checkList = new RowList<CheckRowItem, CheckItem>(views.checkList);

    /** 「定位」:把视口平滑地移到某个节点(没有布局位置时什么都不做,例如被清空之后) */
    const locate = (key: number): void => {
        const point = positions.get(key);
        if (point === undefined) return;
        viewport.focusPoint(point.x, point.y, { animated: true });
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
        lastStaticDocument = null;
        lastStaticChecks = [];
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
        // 演示模式下画布归播放器;静态重绘(例如程序化改检查配置)不能把演示画面顶掉
        if (demoSession !== null) return;
        /*
          布局 / 落笔 / 列表是"解析通过之后"的事.解析器已经保证了引用与 key,这一步
          理论上不该抛;真抛了(例如将来布局加上节点数上限)也只显示一行错误,不把
          异常丢进事件处理里炸掉整个页面.
        */
        try {
            lastStaticDocument = document;
            lastStaticChecks = checks;
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
        // 演示期间检查窗口归播放器(每帧按剧本检查集算);此处的重算等退出后再来
        if (demoSession !== null) return;
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
        // RUN 是明确动作:先退出演示,再照原逻辑跑(不静默吞掉用户的运行请求)
        if (demoSession !== null) exitDemo();
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

    /**
     * 进入演示:保存并最小化部分窗口 -> 写检查配置 -> 建控制窗口 / 落笔器 / 播放器.
     *
     * 顺序上先起控制条与窗口再建播放器:播放器构造时会立刻发第 0 拍的 `state`,
     * 控制条必须已经在.进入演示**不改 JSON 编辑器**(演示是"看",编辑器是"改";
     * docs/animation.md §9.4),只把剧本的检查 id 写进检查配置窗口,让检查窗口按
     * 同一套口径算.
     */
    function enterDemo(id: string): void {
        const scenario = findDemoScenario(id);
        if (scenario === undefined) return;
        if (demoSession !== null) exitDemo();

        // ① 记下进入前的窗口状态,再让出画面:保留「检查」窗口(不变量是教学的一部分)
        const savedWindows = new Map<ViewerWindowId, 'normal' | 'maximized' | 'minimized'>();
        const windowIds: readonly ViewerWindowId[] = [
            VIEWER_WINDOW_JSON,
            VIEWER_WINDOW_ENTITY,
            VIEWER_WINDOW_CHECK_SETUP,
            VIEWER_WINDOW_CHECK,
            VIEWER_WINDOW_DIAGNOSTICS,
            VIEWER_WINDOW_HELP,
        ];
        for (const windowId of windowIds) savedWindows.set(windowId, desktop.windows.getState(windowId));
        for (const windowId of windowIds) {
            if (windowId !== VIEWER_WINDOW_CHECK) desktop.windows.setMinimized(windowId, true);
        }

        // ② 检查配置窗口换成剧本自带的检查集(与点「示例」同一条做法);原内容退出时还原
        const savedCheckConfig = checkInput.value;
        seedTextareaSource(checkInput, dumpCheckConfig(scenario.checkIds));
        checkEditor.refresh();

        // ③ 控制窗口 + 键盘.先建控制条与窗口,播放器构造时就能按快照刷新它.
        const trace = scenario.build();
        let playerRef: DemoPlayerHandle | null = null;
        const bar = createDemoBar({
            trace,
            onAction: (action) => {
                const player = playerRef;
                if (player === null) return;
                if (action === 'prev') player.prev();
                else if (action === 'next') player.next();
                else if (action === 'toggle') player.toggle();
                else exitDemo();
            },
            onSeek: (stepIndex) => playerRef?.seek(stepIndex),
            onSpeed: (speed) => playerRef?.setSpeed(speed),
            onFollow: (follow) => playerRef?.setFollow(follow),
        });
        bar.element.id = VIEWER_DOM.demoBarId;
        /*
          控制条装进一扇**独立窗口**(库的浮窗通用件:固定高度、宽度可拖、标题栏
          可拖).它只在演示模式存在,所以不进桌面窗口清单 / 任务栏;用
          `createDemoWindow` 现建现拆.

          镜头避让带按窗口**当前位置**算:贴桌面下沿时扣掉它占的底部高度;用户把窗口
          拖到画布中间后就不再扣(否则等于给一个不存在的遮挡留白).
        */
        const applyDemoInsets = (geometry: AbsoluteGeometry): void => {
            const desktopHeight = host.clientHeight;
            viewport.setInsets({
                top: DEFAULT_DESKTOP_CONFIG.dockReserve,
                bottom: demoWindowDocked(geometry, desktopHeight)
                    ? Math.max(0, desktopHeight - geometry.y)
                    : 0,
            });
        };
        const demoWindow = createDemoWindow({
            layer: desktop.windowLayer,
            title: VIEWER_DEMO_WINDOW_TITLE,
            content: bar.element,
            onGeometryChange: applyDemoInsets,
        });

        const keys = new AbortController();
        const painter = new ScenePainter(worldEl);

        /** 镜头请求:点 / 一组点 / 整幅适应,全部走视口的缓动(instant 时直接落位) */
        const applyCamera = (request: DemoCameraRequest, options: { readonly instant: boolean }): void => {
            const animated = !options.instant;
            if (request.kind === 'point') {
                viewport.focusPoint(request.point.x, request.point.y, { animated });
            } else {
                viewport.framePoints(request.points, { animated });
            }
        };

        const ports: DemoPlayerPorts = {
            paint(scene): void {
                painter.apply(scene, { settled: false });
            },
            settle(scene): void {
                // 演示期间视口必须一直是手动的:每拍镜头由播放器发.用户中途点「回正视图」
                // 会把 manual 复位,这里再按当前视角"发一次目标"把它接管回来(不移动画面),
                // 否则下一次 settle 的 contentChanged 会按完整内容自动 fit,把 framing:'hold'
                // 的旋转步骤也拉走.
                viewport.animateTo(viewport.getView(), { animated: false });
                const bounds = painter.apply(scene, { settled: true });
                // manual 下 contentChanged 只记包围盒,不会自动适应(退出演示后回正要它)
                if (bounds !== null) viewport.contentChanged(bounds);
            },
            showStep(_index, step, checks, layout): void {
                positions.clear();
                for (const node of layout.nodes) positions.set(node.key, { x: node.x, y: node.y });
                clearDiagnostics();
                renderEntities(step.document);
                renderChecks(checks);
                updateListMeta(step.document, checks);
                bar.setStepText(step.title, step.detail);
            },
            camera: applyCamera,
            state(snapshot): void {
                bar.update(snapshot);
            },
        };

        // 进入演示先接管镜头所有权:即便第 0 拍是 framing:'hold',之后的内容重画也不该自动 fit
        viewport.animateTo(viewport.getView(), { animated: false });
        const player = createDemoPlayer({
            trace,
            clock: createRafClock(),
            reducedMotion: prefersReducedMotion(),
            variantOf: nodeVariant,
            ports,
        });
        playerRef = player;
        bar.update(player.snapshot);
        demoMenu.setActive(id);

        bindDemoKeys(document, {
            toggle: () => playerRef?.toggle(),
            prev: () => playerRef?.prev(),
            next: () => playerRef?.next(),
            first: () => playerRef?.seek(0),
            last: () => playerRef?.seek((playerRef?.snapshot.total ?? 1) - 1),
            exit: () => exitDemo(),
        }, keys.signal);

        demoSession = { player, bar, window: demoWindow, painter, savedWindows, savedCheckConfig, keys };
    }

    /**
     * 退出演示:停播放器 / 拆控制窗口与落笔器 / 恢复窗口状态 / 把最后一次静态结构画回来.
     *
     * 恢复的是**进入前的窗口状态**(最小化 / 最大化都还原);JSON 编辑器内容从头到尾
     * 没被演示改过,所以画回来的仍是用户输入的那份结构.
     */
    function exitDemo(): void {
        const session = demoSession;
        if (session === null) return;
        demoSession = null;

        session.keys.abort();
        session.player.dispose();
        session.bar.dispose();
        session.window.dispose();
        session.painter.dispose();

        for (const [windowId, state] of session.savedWindows) {
            desktop.windows.setMinimized(windowId, state === 'minimized');
            desktop.windows.setMaximized(windowId, state === 'maximized');
        }
        viewport.setInsets({ top: DEFAULT_DESKTOP_CONFIG.dockReserve, bottom: 0 });
        // 检查配置编辑器也还原成进入前的内容(演示只是"借用"它跑剧本的检查集)
        seedTextareaSource(checkInput, session.savedCheckConfig);
        checkEditor.refresh();

        // 演示期间世界层被落笔器接管过:清掉它的两个图层,再按最后一次 RUN 的结构重绘.
        // 先把视口的 manual 复位(演示期间是手动的),静态重新落笔后 contentChanged 才会
        // 按新内容自动适应;顺序不能反,否则 fitViewport() 会按演示最后一帧的包围盒取景.
        clearScene(worldEl);
        const document = lastStaticDocument;
        if (document === null) {
            clearContent();
            viewport.fitViewport();
            return;
        }
        viewport.fitViewport();
        paint(document, lastStaticChecks);
    }

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
    demoMenu.onSelect(enterDemo);

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
