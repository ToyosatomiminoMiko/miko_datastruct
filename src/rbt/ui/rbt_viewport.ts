/*
平面视口:那棵树所在的"平面空间"里,一块可以拖动 / 缩放的取景框.

## 它是什么

树的世界坐标(布局算出来的 x / y,单位 = 屏幕像素 @ 缩放 1)是**内容自己的坐标**:
叶子多就宽,层数多就高,与"桌面多大"无关 -- 所以平面是无限大的.视口是平面上的一个
矩形窗口,屏幕上看到的是"把这块窗口里的东西画到视口那一块像素上",这件事只有一个
数学形式:

    screen = world × k + (x, y)          k = 缩放,x / y = 视口左上角对应的世界点

落笔方式:树上所有东西挂在一层 `<g class="rbt-world">` 里,视口只改这一层的
`transform = translate(x y) scale(k)`(见 planeViewTransform).为什么不改 `<svg>` 的
viewBox:viewBox 会连带把"用户单位"也缩放掉,于是 `stroke-width` / `r` / `font-size`
这些以用户单位计的几何量与屏幕像素脱钩,而 `clientWidth` 反算又得自己写一遍;挂在
`<g>` 上则 svg 永远是 1:1 的像素画布,想量什么就量什么.

**没有坐标系**:不画网格 / 轴 / 刻度,平面的底色就是桌面底色(见 rbt.css).图的语义
是树的结构,给用户一个"我在平面的哪一格"没有意义,反而把背景弄花.

## 交互(三种,都没有控件)

| 手势 | 行为 | 为什么这么定 |
| --- | --- | --- |
| 左键 / 中键拖动 | 平移 | 桌面空白处本来没有别的左键动作,拖动是最直接的"推平面";中键是同一条约定的另一条路 |
| 滚轮 | 以**指针为锚**缩放 | 锚点不动才叫"放大这里",否则内容会从视野里跑掉;指数缩放(乘性)才能让 0.1 与 2 两档手感一致 |
| 左键双击 | 适应视口(复位并回到自动适应) | 缩放自由之后必然要有"回到看得见"的路;判定复用库的 `canStart` 路子(见下) |

拖动**复用库的 `bindDragGesture`**(miko_ui 的 shared/dragGesture.ts,库内唯一一份拖动
实现):指针捕获、拖动态光标、`is-dragging` 类、收尾复位都在它里面,本项目不再写第二
份.它对光标的口径是"读 handle 自己的计算样式",所以抓 / 抓取中的两个光标写在 CSS
(rbt.css 的 `#rbtViewport` 与 `.is-dragging`).

双击**不在 `dblclick` 事件上判**:拖动实现会在 pointerdown 里 `preventDefault`,而
preventDefault 掉的是那串兼容鼠标事件(dblclick 正在其中,能不能收到要看浏览器).
判定放进 `canStart`:两次按下的间隔够近就是双击 -- 与库的窗口标题栏双击同一个位置、
同一条口径(见 dragGesture.ts 的 `canStart` 文档):决定"这次不起手",于是既不拖动,
也不 preventDefault.

## 自动适应(manual 状态机)

首屏 / 每次重绘之后,内容都在视野里是默认期望,但"用户自己挪过"之后还强行拉回来就是
抢方向盘.所以只有一个布尔量 `manual`:

- `manual === false`(自动):`contentChanged()` 报来新包围盒就 `fit()`;
- 一旦**真的动了**(拖动产生了位移 / 滚轮缩放),`manual` 置真,之后重绘不再动视角;
- 双击"适应"把 `manual` 复位成假,下一轮重绘重新自动.

只看"位移与缩放",不看"按下了" :按一下没拖(手滑的单击)不该退出自动模式,所以
`manual` 在 `onDelta` / wheel 里置,不在 `canStart` / `onStart` 里置.

## 分工与不做的事

本模块不认识树:它只认识"一块内容包围盒 + 一块视口矩形 + 三种手势".包围盒由 rbt.ts
的布局给,`<g>` 由 ui/rbt_views.ts 建,绑在谁身上、什么时候拆由 rbt.ts 的 mountRBT 管.

不做(留作后续,真要时再加):触摸双指捏合(需要自己管多指针,库的拖动是单指针)、
小地图 / 比例尺、缩放到某个节点、惯性滑动.
*/

import { bindDragGesture } from 'miko_ui';
import {
    RBT_DOUBLE_PRESS_MS,
    RBT_FIT_MAX_ZOOM,
    RBT_MAX_ZOOM,
    RBT_MIN_ZOOM,
    RBT_PLANE_FIT_PADDING,
    RBT_WHEEL_LINE_PIXELS,
    RBT_WHEEL_PAGE_PIXELS,
    RBT_WHEEL_ZOOM_SENSITIVITY,
} from '@/rbt/config';

// ============================================================
// 状态与变换(纯函数:数字进,数字出,可单测)
// ============================================================

/**
 * 视角状态:世界坐标 -> 屏幕像素的仿射变换 `screen = world × k + (x, y)`.
 *
 * x / y 是**视口左上角对应的世界点换算来的屏幕偏移**(世界原点画在屏幕的哪个位置),
 * 不是"世界点的平移量":两者的区别在缩放时看得出来 -- 我们保持的是"变换右乘缩放",
 * 所以 k 变了 x / y 跟着变(见 zoomPlaneView).
 */
export interface RbtViewState {
    /** 缩放:1 = 世界单位与 CSS 像素 1:1 */
    readonly k: number;
    /** 世界原点在视口里的屏幕 x(px) */
    readonly x: number;
    /** 世界原点在视口里的屏幕 y(px) */
    readonly y: number;
}

/**
 * 平面上的一块矩形(世界坐标或屏幕像素,由调用方决定;本模块只用它的算术).
 *
 * 三种用途共用同一形状:内容的包围盒(布局给)、视口可用区(视口给)、适应计算的输入.
 * 视口那块的 `minX` / `minY` 恒为 0(它的原点就是它自己).
 */
export interface RbtPlaneBox {
    readonly minX: number;
    readonly minY: number;
    readonly width: number;
    readonly height: number;
}

/** 世界层的 `<g>` 要的 transform 属性值 */
export function planeViewTransform(view: RbtViewState): string {
    /*
      三位小数足够(亚像素级别看不出来),属性值因此短而稳定:
      这个字符串每帧都在写,长的浮点尾数(0.30000000000000004 那种)既难看也难比对.
      `-0` 归一成 `0`:两者数值相等但在字符串里不同,归一之后属性值只有一个写法.
    */
    const round = (value: number): number => {
        const rounded = Math.round(value * 1000) / 1000;
        return rounded === 0 ? 0 : rounded;
    };
    return `translate(${round(view.x)} ${round(view.y)}) scale(${round(view.k)})`;
}

/** 平移:屏幕像素增量直接加到偏移上(k 不变) */
export function panPlaneView(view: RbtViewState, deltaX: number, deltaY: number): RbtViewState {
    return { k: view.k, x: view.x + deltaX, y: view.y + deltaY };
}

/**
 * 以屏幕点 `(cursorX, cursorY)` 为锚缩放 `factor` 倍.
 *
 * 锚点下那个世界点必须**原地不动**,这是滚轮缩放不"跑偏"的全部内容:
 *
 *     c = w × k + p        锚点在世界坐标 w 处(缩放前)
 *     c = w × k' + p'      缩放后同一点还在 c
 *     => p' = c - w × k' = c - (c - p) × (k' / k)
 *
 * `factor` 先与当前 k 相乘再夹到 [min, max],比率用**夹过之后**的 k 算:到上下限时
 * 比率是 1,锚点一样不动,不会出现"缩不动了但画面还在漂".
 */
export function zoomPlaneView(
    view: RbtViewState,
    factor: number,
    cursorX: number,
    cursorY: number,
): RbtViewState {
    const k = clamp(view.k * factor, RBT_MIN_ZOOM, RBT_MAX_ZOOM);
    const ratio = k / view.k;
    return {
        k,
        x: cursorX - (cursorX - view.x) * ratio,
        y: cursorY - (cursorY - view.y) * ratio,
    };
}

/**
 * 适应:把内容整块装进视口并居中(缩放取"装得下"与"不放大"里小的那个).
 *
 * 两个留白:
 * - `padding` 四周都算,内容不贴视口边缘;
 * - `topInset` 只从上沿扣(库的任务栏压在桌面顶上,树顶不该藏在它后面).
 *
 * 内容为空 / 视口还没量出尺寸(`clientWidth` 为 0,如 happy-dom 里)时给不出"装得下"
 * 的比例,直接回一个恒等视角:调用方不必先判断,拿到的一定是能用的状态.
 */
export function fitPlaneView(
    content: RbtPlaneBox,
    viewport: RbtPlaneBox,
    topInset: number,
): RbtViewState {
    const usableWidth = viewport.width - RBT_PLANE_FIT_PADDING * 2;
    const usableHeight = viewport.height - topInset - RBT_PLANE_FIT_PADDING * 2;
    if (content.width <= 0 || content.height <= 0 || usableWidth <= 0 || usableHeight <= 0) {
        return { k: RBT_FIT_MAX_ZOOM, x: 0, y: 0 };
    }

    const k = clamp(
        Math.min(usableWidth / content.width, usableHeight / content.height, RBT_FIT_MAX_ZOOM),
        RBT_MIN_ZOOM,
        RBT_MAX_ZOOM,
    );
    // 居中:内容中心对到可用区中心;两项都减去 content 起点 × k,把世界坐标的原点
    // 从"内容左上角"挪到"视口左上角"(否则 minX / minY 不为 0 的内容会整体偏出去)
    const centerX = (viewport.width - content.width * k) / 2;
    const centerY = topInset + (viewport.height - topInset - content.height * k) / 2;
    return { k, x: centerX - content.minX * k, y: centerY - content.minY * k };
}

/**
 * wheel 事件 -> 缩放倍数(`e^(-像素delta × 灵敏度)`,指数即乘性).
 *
 * `deltaMode` 必须归一:Chrome 给像素(`0`),Firefox 给行(`1`),少数设备给页(`2`),
 * 三者的数值量级差两个数量级,不折的话同一台机器换个浏览器就等于滚轮失灵.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
    const pixels = deltaMode === 1
        ? deltaY * RBT_WHEEL_LINE_PIXELS
        : deltaMode === 2
            ? deltaY * RBT_WHEEL_PAGE_PIXELS
            : deltaY;
    return Math.exp(-pixels * RBT_WHEEL_ZOOM_SENSITIVITY);
}

/** 夹到区间里(缩放上下限共用;写成一处,免得两处各写一遍三元) */
function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

// ============================================================
// 绑定:把三种手势接到视口上
// ============================================================

/** `mountPlaneViewport()` 的输入 */
export interface RbtPlaneViewportOptions {
    /**
     * 视口上沿要避开的固定带(px),适应时内容居中在这条带之下.
     *
     * 传库的 `DEFAULT_DESKTOP_CONFIG.dockReserve`(任务栏高度):唯一来源是库的桌面
     * 配置,这里不抄那个 40.
     */
    readonly topInset: number;
}

/** 挂好的视口:内容报账 + 拆卸 */
export interface RbtViewportHandle {
    /**
     * 内容重画之后报一次它的包围盒(世界坐标).
     *
     * 自动模式下按它重新适应视口;手动模式(用户挪过)下**一个字都不动** -- 视角是
     * 用户的,重绘不该把它拉回来.
     */
    contentChanged(bounds: RbtPlaneBox): void;
    /** 拆掉监听与观察者(同一颗宿主重复挂载时由 rbt.ts 调) */
    dispose(): void;
}

/**
 * 把平面视口挂到宿主上.
 *
 * @param host  视口元素(桌面背景那一层:铺满桌面、裁切、收指针事件)
 * @param world 世界层 `<g>`:所有节点 / 连线在它里面,本模块只改它的 transform
 * @param options 见 `RbtPlaneViewportOptions`
 */
export function mountPlaneViewport(
    host: HTMLElement,
    world: SVGGElement,
    options: RbtPlaneViewportOptions,
): RbtViewportHandle {
    // 初值恒等:首屏那块内容还没画,任何视角都一样;第一次 contentChanged 就会换成适应
    let view: RbtViewState = { k: 1, x: 0, y: 0 };
    /** 最近一次报来的内容包围盒(双击"适应"要用它,所以留一份) */
    let content: RbtPlaneBox | null = null;
    /** 用户是否手动挪过视角(见文件头的状态机) */
    let manual = false;
    /** 上一次左键按下的时间戳,用来判双击 */
    let lastPress = Number.NEGATIVE_INFINITY;

    // 解绑信号:拖动 / 滚轮监听都挂在它上面,dispose 一次全摘(库的 bindDragGesture
    // 也吃这个信号,而且会在 abort 时把正在进行的拖动收尾)
    const abort = new AbortController();
    const { signal } = abort;

    const apply = (): void => {
        world.setAttribute('transform', planeViewTransform(view));
    };

    /** 视口自己的矩形(它自己的原点就是 minX / minY = 0) */
    const viewportBox = (): RbtPlaneBox => ({
        minX: 0,
        minY: 0,
        width: host.clientWidth,
        height: host.clientHeight,
    });

    const fit = (): void => {
        if (!content) return;
        view = fitPlaneView(content, viewportBox(), options.topInset);
        apply();
    };

    /**
     * 指针位置 -> 视口坐标.
     *
     * 不直接用 `offsetX` / `clientX`:前者以事件目标为准(指针落在子元素上时换算到子
     * 元素的坐标系),后者以视口为准.用 `getBoundingClientRect` 换算,宿主嵌在页面
     * 任何位置都对.
     */
    const hostPoint = (event: MouseEvent): { x: number; y: number } => {
        const rect = host.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    // ---- 拖动平移(库的唯一一份拖动实现) ----
    bindDragGesture(host, signal, {
        canStart(event) {
            // 左右键之外的按下(右键菜单等)不起手
            if (event.button !== 0 && event.button !== 1) return false;
            // 左键连按两下 = 双击"适应":不起手、不 preventDefault,并把自动模式接回来
            if (event.button === 0 && event.timeStamp - lastPress <= RBT_DOUBLE_PRESS_MS) {
                lastPress = Number.NEGATIVE_INFINITY;
                manual = false;
                fit();
                return false;
            }
            lastPress = event.timeStamp;
            return true;
        },
        onStart: () => {
            // 拖动本身没有什么要起手的(光标由库按 CSS 换)
        },
        onDelta(deltaX, deltaY) {
            // 真的产生位移了才算"用户挪过":单击(手滑)不该退出自动模式
            manual = true;
            view = panPlaneView(view, deltaX, deltaY);
            apply();
        },
        onEnd: () => {
            // 位移是增量式的,松手时没有待落地的结果
        },
    });

    // ---- 滚轮缩放(以指针为锚) ----
    host.addEventListener('wheel', (event: WheelEvent) => {
        /*
          必须 preventDefault,而且要 passive: false:

          - 桌面铺满整页,滚轮在背景上不该滚页面(现在没有可滚的东西,但嵌入别处时
            会滚到页面上去);
          - Ctrl + 滚轮(触控板捏合的等价物)在浏览器里默认是"页面缩放",不拦下来
            就会连整个界面一起放大.
          浏览器把背景上的滚轮监听默认视作 passive(性能优化),那个默认值下
          preventDefault 无效并会在控制台告警,所以显式写 passive: false.
        */
        event.preventDefault();
        manual = true;
        const point = hostPoint(event);
        view = zoomPlaneView(view, wheelZoomFactor(event.deltaY, event.deltaMode), point.x, point.y);
        apply();
    }, { passive: false, signal });

    /*
      视口尺寸变了(浏览器窗口缩放、桌面被嵌进别的布局):自动模式下跟着重新适应.

      手动模式下一动不动:用户摆好的视角不该被一次窗口缩放改掉(平面是无限的,视口
      变大只是多看到一点).
    */
    const observer = typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            if (!manual) fit();
        })
        : null;
    observer?.observe(host);

    // 属性先写一次:世界层的 transform 由本模块独占,初值恒等也让"属性一直有值"
    // 成为可断言的事实(测试不必区分"没挂"与"挂在恒等位置")
    apply();

    return {
        contentChanged(bounds: RbtPlaneBox): void {
            content = bounds;
            if (!manual) fit();
        },
        dispose(): void {
            observer?.disconnect();
            abort.abort();
        },
    };
}
