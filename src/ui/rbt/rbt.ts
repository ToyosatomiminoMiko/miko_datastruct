/*
2026.05.01.00:00:00
红黑树桌面:**装配 + 每轮输入的全流程**.

本文件只剩"挂载与串联",三层分工各不相同:

- **核心**(src/datastruct/rbt/):数据结构的形状 / 四条性质检查 / 表达式解析.纯逻辑,
  不碰 DOM,不引用任何显示常量,也不写一句给人看的文案;
- **显示**(src/ui/rbt/ 与 src/ui/rbt/config.ts):布局(ui/rbt/rbt_layout.ts)、SVG 落笔
  (ui/rbt/rbt_render.ts)、中文文案(ui/rbt/rbt_format.ts)、桌面视图(ui/rbt/rbt_views.ts)、
  平面视口(ui/rbt/rbt_viewport.ts);
- **挂载**(本文件):用库的 `mountDesktop` 立起桌面(背景 = 那棵树,两扇窗口 =
  表达式与性质检查),把"格式检查 -> 性质检查 -> 重绘"接到编辑器 textarea 的
  input 事件上.

装配顺序与 miko_graphcalc 同形:先建内容(背景 + 逐窗口正文),再 `mountDesktop`
建桌面三层与窗口外壳.

**树画在"平面"里,平面由一块可拖动缩放的视口看着**(2026-10 起):布局算出来的
x / y 是**平面坐标**(单位 = 屏幕像素 @ 缩放 1),平面本身无限大 -- 布局只保证同层节点
彼此不撞(见 ui/rbt/rbt_layout.ts),不预设画布多大.树上的东西全部落进世界层
`<g class="rbt-world">`,视口只改这一层的 `transform`(见 ui/rbt/rbt_viewport.ts);
画完一次把内容的**包围盒**交给视口,由它决定"装进视口并居中"(用户没手动挪过视角
时).

输入控件是 miko_ui 的 CodeEditor:值仍然只从 textarea 读,行号与高亮是库按注入的
分词器自己维护的装饰层 -- 本文件只多做一件程序化写入的事:载入示例走库的
`seedTextareaSource`,再显式 `refresh()` 一次(直接赋值不派发 input 事件,装饰层
不会自己更新).

文案全部写进 HTML 的唯一输出区 #treeOutput(提示 / 错误 / 性质清单共用它),这样
颜色 / 字号 / 折行由 CSS 决定;SVG 里只画结构与节点值,一个字都不多写.

每轮 input 的结果是四选一(见 renderTree):
1. 没输入 -> 输出区一行提示(#treeOutput .tree-hint),树清空;
2. 解析成空树(nil) -> 输出区一行提示(同上),树清空;
3. 格式检查不过 -> 输出区一行错误(#treeOutput .tree-error),树清空;
4. 解析成功 -> 输出区性质清单 + 画出树.
*/

/*
样式:`tokens.css`(设计令牌)与 `rbt.css`(编辑器 / 输出区 / 背景那棵树 / 桌面根)在
本模块引入(与 SETTING 页 / 地铁车窗同一条做法).
*/
import '@/ui/rbt/rbt.css';

import {
    RBT_DESKTOP_INSET,
    RBT_DESKTOP_WINDOWS,
    RBT_DIAGNOSTICS_ROW_CLASS,
    RBT_DIAGNOSTICS_STATE_CLASS,
    RBT_DIAGNOSTICS_SUMMARY_CLASS,
    RBT_EMPTY_HINT_TEXT,
    RBT_EMPTY_TREE_HINT_TEXT,
    RBT_ERROR_UI_PREFIX,
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
import { clearTree, drawTree } from './rbt_render';
import { createRbtViews } from './rbt_views';
import {
    mountPlaneViewport,
    type RbtViewportHandle,
} from './rbt_viewport';
import {
    DEFAULT_DESKTOP_CONFIG,
    create_element,
    mountDesktop,
    seedTextareaSource,
    type ButtonHandle,
    type CodeEditorHandle,
    type DesktopHandle,
} from 'miko_ui';

// ============================================================
// 输出区:提示 / 错误 / 性质清单共用这一个元素
// ============================================================

/** 输出区里的一行纯文本(提示 / 错误),类名决定颜色 */
function textLine(className: string, text: string): HTMLElement {
    const line = create_element({ tag: 'div' }, { class: className }, text);
    return line;
}

/**
 * 性质清单:抬头 + 四条,每条是
 * `<div class="tree-property">性质名: <span class="tree-property-state">PASS / FAIL</span> 出错位置</div>`.
 *
 * 条数与文案都由 config 的 RBT_PROPERTIES 决定(顺序又是核心层的 RBT_PROPERTY_IDS),
 * 逐条建完交给 renderOutput 整批换掉.性质名与出错说明都是显示层文本:核心层交回的
 * 是结构化结论(见 datastruct/rbt/rbt_tree.ts),句子由 ui/rbt/rbt_format.ts 拼.
 */
function propertyLines(report: RbtPropertyReport): HTMLElement[] {
    const rows = RBT_PROPERTIES.map((spec) => {
        const result = findPropertyResult(report, spec.id);
        // 这个类名是行为测试数行数的锚点(见 config.ts 的同名常量)
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

// ============================================================
// 原生 TS 挂载模块
// ============================================================

/**
 * 已挂载的一次桌面(按宿主记).
 *
 * 为什么需要:库的 CodeEditor 在 textarea 上挂着 input / scroll 监听与一个
 * `ResizeObserver`(行号与高亮各一个),`dispose()` 才会拆掉;桌面那边的窗口外壳
 * 与三层容器(`.window-layer` / `.snap-preview` / `.dock`)也归 `DesktopHandle`.
 * 标记可以靠 `replaceChildren` 整块换掉,但**观察者与 window 上的监听不会随节点
 * 离场自动消失** -- 同一颗宿主重复挂载时要先把上一份桌面、编辑器、视口与按钮拆掉,否则每挂
 * 一次就多留一套窗口、一个观察者与一条 resize 通道(旧节点已不在文档里,泄漏的是
 * 内存与回调,不报错也看不出来).
 *
 * 键是宿主而不是模块级单例:同一页挂两块桌面时各挂各的,互不干扰.
 */
interface MountedRbt {
    readonly desktop: DesktopHandle;
    readonly editor: CodeEditorHandle;
    /** 平面视口:拖动 / 滚轮监听与尺寸观察者都在它手里(见 ui/rbt/rbt_viewport.ts) */
    readonly viewport: RbtViewportHandle;
    /** 回正按钮(库的 `ButtonHandle`):点击分发监听归它的 `dispose()` 拆 */
    readonly fitButton: ButtonHandle;
}

const mounted = new WeakMap<HTMLElement, MountedRbt>();

/**
 * 把红黑树桌面挂到宿主(页面那唯一一颗手写宿主 `#app`)上.
 *
 * 分两步(与 ui/rbt/rbt_views.ts 的分工一致):先建内容(平面视口 + 树 + 逐窗口正文),
 * 再交给库的 `mountDesktop` 建三层容器与窗口外壳.所以这里只按引用操作元素,
 * 不查 DOM,也没有"找不到元素"的失败路径;落笔在 ui/rbt/rbt_render.ts,布局在
 * ui/rbt/rbt_layout.ts,平面视口在 ui/rbt/rbt_viewport.ts,核心逻辑在 src/datastruct/rbt/.
 */
export function mountRBT(host: HTMLElement): void {
    // 重复挂载同一颗宿主:先拆掉上一份桌面、编辑器、视口与按钮(见 MountedRbt)
    const previous = mounted.get(host);
    previous?.desktop.dispose();
    previous?.editor.dispose();
    previous?.viewport.dispose();
    previous?.fitButton.dispose();
    mounted.delete(host);

    // 宿主由本模块独占:清空之后整体接管(桌面三层是 append 进来的,不清会叠两份)
    host.replaceChildren();

    const views = createRbtViews();
    /*
      平面视口:绑在那颗背景节点上,改的是世界层的 transform(见 ui/rbt/rbt_viewport.ts).
      `topInset` 传库的任务栏高度:适应视口时内容居中在这条带之下,树顶不会被任务栏
      压住(那个数只有库的桌面配置一个来源,这里不抄一遍 40).
    */
    const viewport = mountPlaneViewport(views.viewport, views.world, {
        topInset: DEFAULT_DESKTOP_CONFIG.dockReserve,
    });
    /*
      回正按钮:控件归 ui/rbt/rbt_views.ts 建,点击行为在这里接到视口句柄 -- 这是本应用
      唯一的"回到看得见"入口(以前是双击,已删;理由见 ui/rbt/rbt_viewport.ts 文件头).
      按钮的拆卸随 `fitButton.dispose()` 走(见上面的重复挂载分支).
    */
    views.fitButton.onClick(() => viewport.fitViewport());
    /*
      立起桌面:库一律用默认值(窗口动作 / 边缘余量 / 标题栏高度 / z / 吸附),
      应用只覆盖两处 --
      - `windows`:窗口清单(应用特有的,库不预设);
      - `edgeGap`:与窗口几何里的 `inset` 是同一个数(见 config 的 RBT_DESKTOP_INSET),
        改成库的默认值会让"默认离边多远"和"能贴多近"各说各话.
      背景是那**块平面视口**(不是里面的 `<svg>`):它由库 append 到桌面根上,窗口层与
      任务栏都压在它上面.视口的指针手势在它被 append 之前就绑好了,所以顺序无关.
    */
    const desktop = mountDesktop(host, {
        ...DEFAULT_DESKTOP_CONFIG,
        edgeGap: RBT_DESKTOP_INSET,
        windows: RBT_DESKTOP_WINDOWS,
        background: [views.viewport],
        content: views.content,
    });

    const editor = views.editor;
    // 值只从 textarea 读:行号 / 高亮是库按它自己维护的装饰层,不参与解析
    const input = editor.textarea;
    const outputEl = views.output;
    const worldEl = views.world;
    mounted.set(host, { desktop, editor, viewport, fitButton: views.fitButton });

    /**
     * 输出区的写入口:整批替换 #treeOutput 的子节点,空数组就整块 hidden.
     *
     * 提示行 / 错误行 / 性质清单都走这一条路 -- 它们只是"这一轮要显示的内容",
     * 没有 stdout 与 stderr 那种必须分流的语义;整批替换也让"上一轮的东西残留"
     * 变成不可能(行数很少,不是性能路径).
     */
    const renderOutput = (children: readonly HTMLElement[]): void => {
        outputEl.replaceChildren(...children);
        outputEl.hidden = children.length === 0;
    };

    const renderTree = (): void => {
        const expr = input.value.trim();

        if (expr === '') {
            // 没输入:说清桌面上为什么没有树
            renderOutput([textLine(RBT_OUTPUT_HINT_CLASS, RBT_EMPTY_HINT_TEXT)]);
            clearTree(worldEl);
            return;
        }

        try {
            // 第 1 步:格式检查(解析).过了才有树可查性质
            const rootNode = buildTreeFromExpression(expr);
            if (rootNode === null) {
                // 表达式非空但解析成空树(nil):没有节点可画,也没有性质可查
                renderOutput([textLine(RBT_OUTPUT_HINT_CLASS, RBT_EMPTY_TREE_HINT_TEXT)]);
                clearTree(worldEl);
                return;
            }
            // 第 2 步:性质检查写进输出区,平面里只画这棵树
            renderOutput(propertyLines(checkTreeProperties(rootNode)));
            // 第 3 步:布局 -> 落笔 -> 把落笔后量到的实际包围盒报给视口(用户没手动挪过
            // 视角时,视口按它适应并居中).量不到(测试环境)就不动视角.
            const layout = layoutTree(rootNode);
            const bounds = drawTree(worldEl, layout);
            if (bounds !== null) {
                viewport.contentChanged(bounds);
            }
        } catch (err) {
            // 格式检查没过:输出区出一行错误(性质检查的输入都还没有);
            // 背景清空而不写错误文案 -- 文案一律归 HTML
            renderOutput([
                textLine(RBT_OUTPUT_ERROR_CLASS, `${RBT_ERROR_UI_PREFIX}${formatParseError(err)}`),
            ]);
            clearTree(worldEl);
        }
    };

    input.addEventListener('input', renderTree);

    /*
      打开页面时自动加载示例.

      走库的 `seedTextareaSource` 而不是直接赋值:它是"首屏种子"那条路(编辑器本来
      是空的,没有撤销历史要保,也不抢焦点),语义比 `input.value = ...` 清楚;
      赋值本身不会派发 input 事件,所以装饰层与输出区都得自己叫一次:
      先 `editor.refresh()`(重算行号 + 重绘高亮,见 ui/rbt/rbt_views.ts 的 editor 说明),
      再 renderTree().
    */
    seedTextareaSource(input, RBT_TREE_EXAMPLE);
    editor.refresh();
    renderTree();
}
