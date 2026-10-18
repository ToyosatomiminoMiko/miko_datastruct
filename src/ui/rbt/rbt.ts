/*
2026.05.01.00:00:00
红黑树桌面:装配 + 每轮输入的全流程.

本文件只做挂载与串联:布局 / 文案 / 红黑语义在 ui/rbt,场景落笔 / 平面视口 / 绘制面在
src/visual,树结构 / 性质检查 / 解析在 src/datastruct/rbt.装配顺序:先建内容,再
mountDesktop 建桌面三层与窗口外壳.
*/

// 本模块引入样式:视觉层(visual.css:绘制面 / 节点 / 指针的通用观感)与红黑树自己的
// tokens.css(设计令牌)与 rbt.css(编辑器 / 输出区 / 红黑变体).顺序即层叠顺序:
// 视觉层的通用规则在前,红黑树的变体规则在后.
import '@/visual/visual.css';
import '@/ui/rbt/rbt.css';

import {
    RBT_DESKTOP_INSET,
    RBT_DESKTOP_WINDOWS,
    RBT_DIAGNOSTICS_ROW_CLASS,
    RBT_DIAGNOSTICS_STATE_CLASS,
    RBT_DIAGNOSTICS_SUMMARY_CLASS,
    RBT_DOCK_ACTIONS,
    RBT_EMPTY_HINT_TEXT,
    RBT_EMPTY_TREE_HINT_TEXT,
    RBT_ERROR_UI_PREFIX,
    RBT_FIT_ACTION_ID,
    RBT_OUTPUT_ERROR_CLASS,
    RBT_OUTPUT_HINT_CLASS,
    RBT_PROPERTIES,
    RBT_PROPERTY_STATE_FAIL,
    RBT_PROPERTY_STATE_PASS,
    RBT_TREE_EXAMPLE,
} from './config';
import { buildTreeFromExpression } from '@/datastruct/rbt/rbt_parse';
import {
    checkTreeProperties,
    findPropertyResult,
    type RbtPropertyReport,
} from '@/datastruct/rbt/rbt_tree';
import { formatParseError, formatPropertyDetail, formatPropertySummary } from './rbt_format';
import { layoutTree } from './rbt_layout';
import { rbtScene } from './rbt_scene';
import { createRbtViews } from './rbt_views';
import { clearScene, renderScene } from '@/visual/render';
import {
    mountPlaneViewport,
    type PlaneViewportHandle,
} from '@/visual/viewport';
import {
    DEFAULT_DESKTOP_CONFIG,
    create_element,
    mountDesktop,
    seedTextareaSource,
    type CodeEditorHandle,
    type DesktopHandle,
} from 'miko_ui';

// 输出区:提示 / 错误 / 性质清单共用这一个元素

/** 输出区里的一行纯文本(提示 / 错误),类名决定颜色 */
function textLine(className: string, text: string): HTMLElement {
    const line = create_element({ tag: 'div' }, { class: className }, text);
    return line;
}

/**
 * 性质清单:抬头 + 每条一行(`性质名: PASS / FAIL 出错位置`).
 *
 * 条数与文案由 config 的 RBT_PROPERTIES 决定;核心层交回结构化结论,句子由
 * ui/rbt/rbt_format.ts 拼.
 */
function propertyLines(report: RbtPropertyReport): HTMLElement[] {
    const rows = RBT_PROPERTIES.map((spec) => {
        const result = findPropertyResult(report, spec.id);
        // 行类名是行为测试数行数的锚点
        const row = create_element({ tag: 'div' }, { class: RBT_DIAGNOSTICS_ROW_CLASS });
        const state = create_element(
            { tag: 'span' },
            {
                class: result.pass
                    ? `${RBT_DIAGNOSTICS_STATE_CLASS} is-pass`
                    : `${RBT_DIAGNOSTICS_STATE_CLASS} is-fail`,
            },
            result.pass ? RBT_PROPERTY_STATE_PASS : RBT_PROPERTY_STATE_FAIL,
        );
        row.append(`${spec.label}: `, state);
        const detail = formatPropertyDetail(result);
        if (detail !== '') {
            row.append(` ${detail}`);
        }
        return row;
    });
    const summary = textLine(RBT_DIAGNOSTICS_SUMMARY_CLASS, formatPropertySummary(report));
    return [summary, ...rows];
}

/**
 * 已挂载的一次桌面(按宿主记).
 *
 * 为什么要拆:`dispose()` 才会摘掉 CodeEditor 挂在 textarea 上的 input / scroll 监听与
 * `ResizeObserver`,以及桌面的窗口外壳与三层容器;节点可以靠 `replaceChildren` 换掉,
 * 但观察者与 window 上的监听不会随节点离场消失,重复挂载同一颗宿主会泄漏且不报错.
 *
 * 键是宿主而不是模块级单例:同一页挂两块桌面时各挂各的.
 */
interface MountedRbt {
    readonly desktop: DesktopHandle;
    readonly editor: CodeEditorHandle;
    /** 平面视口:拖动 / 滚轮监听与尺寸观察者都在它手里(见 src/visual/viewport.ts) */
    readonly viewport: PlaneViewportHandle;
}

const mounted = new WeakMap<HTMLElement, MountedRbt>();

/**
 * 把红黑树桌面挂到宿主(页面那唯一一颗手写宿主 `#app`)上.
 *
 * 先建内容(平面视口 + 树 + 逐窗口正文),再交给 `mountDesktop` 建三层容器与窗口外壳;
 * 全程只按引用操作元素,不查 DOM.
 */
export function mountRBT(host: HTMLElement): void {
    // 先拆掉上一份桌面、编辑器与视口(见 MountedRbt)
    const previous = mounted.get(host);
    previous?.desktop.dispose();
    previous?.editor.dispose();
    previous?.viewport.dispose();
    mounted.delete(host);

    // 宿主由本模块独占:桌面三层是 append 进来的,不清会叠两份
    host.replaceChildren();

    const views = createRbtViews();
    // 平面视口绑在背景节点上,改的是世界层的 transform
    // `topInset` 传库的任务栏高度:适应视口时内容居中在这条带之下,树顶不会被任务栏压住
    const viewport = mountPlaneViewport(views.viewport, views.world, {
        topInset: DEFAULT_DESKTOP_CONFIG.dockReserve,
    });
    /*
      立起桌面:库一律用默认值,应用只覆盖这几处 --
      - `windows` / `dockActions`:窗口清单与任务栏动作清单(库不预设);
      - `onDockAction`:这些动作的点击唯一接收入口,库里只交回 id;
      - `edgeGap`:与窗口几何里的 `inset` 是同一个数,改成库默认值会让"默认离边多远"
        和"能贴多近"不一致.
      背景是那块平面视口(不是里面的 `<svg>`),窗口层与任务栏都压在它上面.
    */
    const desktop = mountDesktop(host, {
        ...DEFAULT_DESKTOP_CONFIG,
        edgeGap: RBT_DESKTOP_INSET,
        windows: RBT_DESKTOP_WINDOWS,
        dockActions: RBT_DOCK_ACTIONS,
        onDockAction: (id) => {
            if (id === RBT_FIT_ACTION_ID) viewport.fitViewport();
        },
        background: [views.viewport],
        content: views.content,
    });

    const editor = views.editor;
    // 值只从 textarea 读:行号 / 高亮是库自己维护的装饰层,不参与解析
    const input = editor.textarea;
    const outputEl = views.output;
    const worldEl = views.world;
    mounted.set(host, { desktop, editor, viewport });

    /**
     * 输出区的写入口:整批替换子节点,空数组就整块 hidden.
     *
     * 提示 / 错误 / 性质清单都走这条路:它们只是"这一轮要显示的内容",没有 stdout 与
     * stderr 那种必须分流的语义;整批替换让上一轮的残留不可能出现.
     */
    const renderOutput = (children: readonly HTMLElement[]): void => {
        outputEl.replaceChildren(...children);
        outputEl.hidden = children.length === 0;
    };

    const renderTree = (): void => {
        const expr = input.value.trim();

        if (expr === '') {
            renderOutput([textLine(RBT_OUTPUT_HINT_CLASS, RBT_EMPTY_HINT_TEXT)]);
            clearScene(worldEl);
            return;
        }

        try {
            // 先解析:过了才有树可查性质
            const rootNode = buildTreeFromExpression(expr);
            if (rootNode === null) {
                renderOutput([textLine(RBT_OUTPUT_HINT_CLASS, RBT_EMPTY_TREE_HINT_TEXT)]);
                clearScene(worldEl);
                return;
            }
            // 性质检查写进输出区,平面里只画这棵树
            renderOutput(propertyLines(checkTreeProperties(rootNode)));
            // 落笔后把量到的实际包围盒报给视口;量不到(测试环境)就不动视角
            const layout = layoutTree(rootNode);
            const bounds = renderScene(worldEl, rbtScene(layout));
            if (bounds !== null) {
                viewport.contentChanged(bounds);
            }
        } catch (err) {
            // 解析失败:输出区出一行错误;背景清空而不写错误文案 -- 文案一律归 HTML
            renderOutput([
                textLine(RBT_OUTPUT_ERROR_CLASS, `${RBT_ERROR_UI_PREFIX}${formatParseError(err)}`),
            ]);
            clearScene(worldEl);
        }
    };

    input.addEventListener('input', renderTree);

    /*
      打开页面时自动加载示例.

      走库的 `seedTextareaSource`(首屏种子那条路:不抢焦点,也没有撤销历史要保);
      它不派发 input 事件,所以装饰层与输出区都得自己叫一次:先 `editor.refresh()`
      (重算行号 + 重绘高亮),再 renderTree().
    */
    seedTextareaSource(input, RBT_TREE_EXAMPLE);
    editor.refresh();
    renderTree();
}
