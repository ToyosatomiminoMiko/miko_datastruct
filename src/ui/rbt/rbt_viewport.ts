/*
平面视口:无限平面上的一块可取景窗口,屏幕上的内容由世界坐标经一层仿射变换得来.

树上所有东西挂在 `<g class="rbt-world">` 里,视口只改这一层的 `transform = translate(x y)
scale(k)`;不改 `<svg>` 的 viewBox,否则用户单位一起被缩放,stroke-width / r 等几何量就与
屏幕像素脱钩.拖动复用 miko_ui 的 bindDragGesture,抓取光标写在 rbt.css 的 #rbtViewport
与 .is-dragging(库读 handle 的计算样式).
*/

import { bindDragGesture } from 'miko_ui';
import {
    RBT_FIT_MAX_ZOOM,
    RBT_MAX_ZOOM,
    RBT_MIN_ZOOM,
    RBT_PLANE_FIT_PADDING,
    RBT_WHEEL_LINE_PIXELS,
    RBT_WHEEL_PAGE_PIXELS,
    RBT_WHEEL_ZOOM_SENSITIVITY,
} from '@/ui/rbt/config';

// 状态与变换(纯函数:数字进,数字出,可单测)

/**
 * 视角状态:世界坐标 -> 屏幕像素的仿射变换 `screen = world × k + (x, y)`.
 *
 * x / y 是**世界原点画在屏幕上的位置**,不是世界点的平移量:变换保持"右乘缩放",
 * 所以 k 变了 x / y 跟着变(见 zoomPlaneView).
 */
export interface RbtViewState {
    /** 缩放:1 = 世界单位与 CSS 像素 1:1 */
    readonly k: number;
    readonly x: number;
    readonly y: number;
}

/**
 * 平面上的一块矩形(世界坐标或屏幕像素,由调用方决定;本模块只用它的算术).
 * 作为视口输入时 minX / minY 恒为 0(它的原点就是它自己).
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
      三位小数足够(亚像素看不出来),属性值短而稳定:这个字符串每帧都在写.
      `-0` 归一成 `0`:两者数值相等但字符串不同,归一之后只有一种写法.
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
 * `padding` 四周都算;`topInset` 只从上沿扣(库的任务栏压在桌面顶上,树顶不该藏在它后面).
 *
 * 内容为空 / 视口还没量出尺寸(`clientWidth` 为 0,如 happy-dom 里)时给不出比例,
 * 直接回一个恒等视角:调用方不必先判断,拿到的一定是能用的状态.
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

/** 夹到区间里(缩放上下限共用) */
function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

// 绑定:把手势接到视口上

/** `mountPlaneViewport()` 的输入 */
export interface RbtPlaneViewportOptions {
    /**
     * 视口上沿要避开的固定带(px),适应时内容居中在这条带之下.
     *
     * 传库的 `DEFAULT_DESKTOP_CONFIG.dockReserve`(任务栏高度),不在本模块抄成常量.
     */
    readonly topInset: number;
}

/** 挂好的视口句柄:内容报账 + 拆卸 */
export interface RbtViewportHandle {
    /**
     * 内容重画之后报一次它的包围盒(世界坐标).
     * 自动模式下按它重新适应;手动模式(用户挪过)下**一个字都不动**:视角是用户的.
     */
    contentChanged(bounds: RbtPlaneBox): void;
    /**
     * 回正:把 `manual` 复位成假,再按最近一次的内容包围盒适应.
     * 内容还没报过(如空输入 / 测试环境量不到包围盒)时什么都不做.
     */
    fitViewport(): void;
    /** 拆掉监听与观察者 */
    dispose(): void;
}

/**
 * 把平面视口挂到宿主上.
 *
 * @param host  视口元素(铺满桌面、裁切、收指针事件)
 * @param world 世界层 `<g>`,本模块只改它的 transform
 */
export function mountPlaneViewport(
    host: HTMLElement,
    world: SVGGElement,
    options: RbtPlaneViewportOptions,
): RbtViewportHandle {
    // 初值恒等:首屏内容还没画;第一次 contentChanged 才按内容适应
    let view: RbtViewState = { k: 1, x: 0, y: 0 };
    /** 最近一次报来的内容包围盒(回正要它) */
    let content: RbtPlaneBox | null = null;
    /** 用户是否手动挪过视角:自动模式下重绘会重新适应 */
    let manual = false;

    // 拖动 / 滚轮监听共用这个信号,dispose 一次全摘;bindDragGesture 收到 abort 时会
    // 把进行中的拖动收尾
    const abort = new AbortController();
    const { signal } = abort;

    const apply = (): void => {
        world.setAttribute('transform', planeViewTransform(view));
    };

    /** 视口矩形(原点即 minX / minY = 0) */
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
     * 不用 `offsetX`:它以事件目标为准,指针落在子元素上时会换算到子元素的坐标系.
     * 用 `getBoundingClientRect` 换算,宿主嵌在页面任何位置都对.
     */
    const hostPoint = (event: MouseEvent): { x: number; y: number } => {
        const rect = host.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    // 拖动平移
    bindDragGesture(host, signal, {
        canStart(event) {
            // 左右键之外的按下(右键菜单等)不起手
            return event.button === 0 || event.button === 1;
        },
        onStart: () => {
            // 光标由库按 CSS 切换,这里无需起手
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

    // 滚轮缩放(以指针为锚)
    host.addEventListener('wheel', (event: WheelEvent) => {
        /*
          必须 preventDefault 且 passive: false:

          - 桌面铺满整页,滚轮在背景上不该滚页面(嵌入别处时会滚到页面上去);
          - Ctrl + 滚轮(触控板捏合的等价物)默认是"页面缩放",不拦就会放大整个界面.
          浏览器默认把滚轮监听视作 passive,那个默认值下 preventDefault 无效并会告警.
        */
        event.preventDefault();
        manual = true;
        const point = hostPoint(event);
        view = zoomPlaneView(view, wheelZoomFactor(event.deltaY, event.deltaMode), point.x, point.y);
        apply();
    }, { passive: false, signal });

    /*
      视口尺寸变了(浏览器窗口缩放、被嵌进别的布局):自动模式下跟着重新适应;
      手动模式下一动不动 -- 平面是无限的,视口变大只是多看到一点.
    */
    const observer = typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            if (!manual) fit();
        })
        : null;
    observer?.observe(host);

    // 属性先写一次:世界层 transform 由本模块独占,初值恒等,测试不必区分"没挂"
    // 与"挂在恒等位置"
    apply();

    return {
        contentChanged(bounds: RbtPlaneBox): void {
            content = bounds;
            if (!manual) fit();
        },
        fitViewport(): void {
            // 手动挪过的视角由这次点击交回自动适应:先复位,再按最近内容装
            manual = false;
            fit();
        },
        dispose(): void {
            observer?.disconnect();
            abort.abort();
        },
    };
}
