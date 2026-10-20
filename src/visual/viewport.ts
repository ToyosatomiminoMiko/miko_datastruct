/*
 * 平面视口:无限平面上的一块可取景窗口,屏幕上的内容由世界坐标经一层仿射变换得来.
 *
 * 这一层是**所有结构共用**的取景器:它只管"世界坐标 -> 屏幕像素",不认识节点 / 指针 /
 * 内存块.场景里所有东西挂在 `<g class="visual-world">` 里,视口只改这一层的
 * `transform = translate(x y) scale(k)`;不改 `<svg>` 的 viewBox,否则用户单位一起被缩放,
 * stroke-width / r 等几何量就与屏幕像素脱钩.拖动复用 miko_ui 的 bindDragGesture,
 * 抓取光标写在 src/visual/visual.css 的 `.visual-viewport` 与 `.is-dragging`(库读
 * handle 的计算样式).
 *
 * 两套时间线(见 docs/animation.md §6):
 * - 静态路径:内容重画后 `contentChanged()` 直接适应;
 * - 动画路径:「定位」/ 演示镜头调 `animateTo()`(或 `focusPoint(..., { animated: true })`),
 *   在虚拟时钟上插值,**用户手势立即打断**并停在当前插值位置.
 *   插值的状态是"中心 + 对数缩放",不是 x / y / k 各自线性:见 `interpolatePlaneView`.
 */

import { bindDragGesture } from 'miko_ui';
import {
    VISUAL_FIT_MAX_ZOOM,
    VISUAL_FOCUS_MIN_ZOOM,
    VISUAL_MAX_ZOOM,
    VISUAL_MIN_ZOOM,
    VISUAL_NODE_RADIUS,
    VISUAL_PLANE_FIT_PADDING,
    VISUAL_WHEEL_LINE_PIXELS,
    VISUAL_WHEEL_PAGE_PIXELS,
    VISUAL_WHEEL_ZOOM_SENSITIVITY,
} from '@/visual/config';
import {
    createRafClock,
    easeInOutCubic,
    prefersReducedMotion,
    tween,
    type Easing,
    type TweenClock,
    type TweenHandle,
} from '@/visual/tween';

// 状态与变换(纯函数:数字进,数字出,可单测)

/**
 * 视角状态:世界坐标 -> 屏幕像素的仿射变换 `screen = world × k + (x, y)`.
 *
 * x / y 是**世界原点画在屏幕上的位置**,不是世界点的平移量:变换保持"右乘缩放",
 * 所以 k 变了 x / y 跟着变(见 zoomPlaneView).
 */
export interface PlaneViewState {
    /** 缩放:1 = 世界单位与 CSS 像素 1:1 */
    readonly k: number;
    readonly x: number;
    readonly y: number;
}

/**
 * 平面上的一块矩形(世界坐标或屏幕像素,由调用方决定;本模块只用它的算术).
 * 作为视口输入时 minX / minY 恒为 0(它的原点就是它自己).
 */
export interface PlaneBox {
    readonly minX: number;
    readonly minY: number;
    readonly width: number;
    readonly height: number;
}

/**
 * 视口上下要避开的固定带(px):顶部任务栏 + 演示窗口占用的底部带.
 *
 * 镜头把"可用区"的正中当成世界点的落点:只扣掉上沿的话,当前节点会被演示窗口
 * 压住(docs/animation.md §13.7).
 */
export interface PlaneInsets {
    readonly top: number;
    readonly bottom: number;
}

/** 世界层的 `<g>` 要的 transform 属性值 */
export function planeViewTransform(view: PlaneViewState): string {
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
export function panPlaneView(view: PlaneViewState, deltaX: number, deltaY: number): PlaneViewState {
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
    view: PlaneViewState,
    factor: number,
    cursorX: number,
    cursorY: number,
): PlaneViewState {
    const k = clamp(view.k * factor, VISUAL_MIN_ZOOM, VISUAL_MAX_ZOOM);
    const ratio = k / view.k;
    return {
        k,
        x: cursorX - (cursorX - view.x) * ratio,
        y: cursorY - (cursorY - view.y) * ratio,
    };
}

// 取景数学:适应 / 定位 / 框住一组点 / 中间帧

/** 保持 k 夹在上下限之内 */
function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * 可用区(扣掉上下固定带)的屏幕中心.
 *
 * 镜头目标都往这里放:内容不会藏在任务栏或演示窗口后面.
 */
export function planeViewUsableCenter(viewport: PlaneBox, insets: PlaneInsets): { x: number; y: number } {
    return {
        x: viewport.width / 2,
        y: insets.top + (viewport.height - insets.top - insets.bottom) / 2,
    };
}

/** 视角的"中心世界点" `c` + 缩放 `k`(x = cx - c.x * k) */
export interface PlaneViewCenter {
    readonly centerX: number;
    readonly centerY: number;
}

/** 由视角反解出它正中的世界点(可用区中心对着的那个点) */
export function planeViewCenter(
    view: PlaneViewState,
    viewport: PlaneBox,
    insets: PlaneInsets,
): PlaneViewCenter {
    const center = planeViewUsableCenter(viewport, insets);
    if (!(view.k > 0)) return { centerX: 0, centerY: 0 };
    return {
        centerX: (center.x - view.x) / view.k,
        centerY: (center.y - view.y) / view.k,
    };
}

/** 由"中心世界点 + 缩放"组装视角 */
export function planeViewFromCenter(
    center: PlaneViewCenter,
    k: number,
    viewport: PlaneBox,
    insets: PlaneInsets,
): PlaneViewState {
    const screen = planeViewUsableCenter(viewport, insets);
    return { k, x: screen.x - center.centerX * k, y: screen.y - center.centerY * k };
}

/**
 * 把一块内容装进可用区并居中(缩放取"装得下"与 `maxZoom` 里小的那个).
 *
 * `padding` 四周都算;`insets` 上下各扣一次(任务栏 / 演示窗口).
 * 内容为空 / 视口还没量出尺寸(`clientWidth` 为 0,如 happy-dom 里)时给不出比例,
 * 直接回一个恒等视角:调用方不必先判断,拿到的一定是能用的状态.
 */
function fitBox(
    content: PlaneBox,
    viewport: PlaneBox,
    insets: PlaneInsets,
    maxZoom: number,
): PlaneViewState {
    const usableWidth = viewport.width - VISUAL_PLANE_FIT_PADDING * 2;
    const usableHeight = viewport.height - insets.top - insets.bottom - VISUAL_PLANE_FIT_PADDING * 2;
    if (content.width <= 0 || content.height <= 0 || usableWidth <= 0 || usableHeight <= 0) {
        return { k: VISUAL_FIT_MAX_ZOOM, x: 0, y: 0 };
    }

    const k = clamp(
        Math.min(usableWidth / content.width, usableHeight / content.height, maxZoom),
        VISUAL_MIN_ZOOM,
        VISUAL_MAX_ZOOM,
    );
    return planeViewFromCenter(
        { centerX: content.minX + content.width / 2, centerY: content.minY + content.height / 2 },
        k,
        viewport,
        insets,
    );
}

/**
 * 适应:把内容整块装进视口并居中(缩放取"装得下"与"不放大"里小的那个).
 *
 * `topInset` 为兼容旧调用保留;需要同时扣底部带时用第 4 个参数或 `fitBox` 的
 * `insets` 版本(演示模式会传).
 */
export function fitPlaneView(
    content: PlaneBox,
    viewport: PlaneBox,
    topInset: number,
    bottomInset = 0,
): PlaneViewState {
    return fitBox(content, viewport, { top: topInset, bottom: bottomInset }, VISUAL_FIT_MAX_ZOOM);
}

/**
 * 镜头对准一个世界点:点落在可用区正中,缩放取 `max(当前 k, minZoom)`.
 *
 * 这是「定位」原来的口径(静态实现)提成纯函数:动画只是把"得到的目标"
 * 从瞬间赋值改成插值过去.用户已经放大过就保持自己的缩放,只移动中心.
 */
export function focusPlaneView(
    current: PlaneViewState,
    point: { readonly x: number; readonly y: number },
    viewport: PlaneBox,
    insets: PlaneInsets,
    minZoom: number,
): PlaneViewState {
    const k = clamp(Math.max(current.k, minZoom), VISUAL_MIN_ZOOM, VISUAL_MAX_ZOOM);
    return planeViewFromCenter({ centerX: point.x, centerY: point.y }, k, viewport, insets);
}

/** 框住一组点时,每个节点中心外再留的余量(px):圆半径 + 一圈呼吸空间 */
const FRAME_NODE_MARGIN = VISUAL_NODE_RADIUS + 24;

/**
 * 框住一组世界点(旋转要一次看全 p / x / y / α / β / γ):取节点中心包围盒,
 * 按节点半径 + 留白扩一圈,再适应.
 *
 * 这是 `fitPlaneView` 的特例:没有必要另写一套取景数学.
 * `maxZoom` 给"局部手术"的放大上限;空数组 / 视口量不出尺寸时原样返回当前视角.
 */
export function framePlaneView(
    current: PlaneViewState,
    points: readonly { readonly x: number; readonly y: number }[],
    viewport: PlaneBox,
    insets: PlaneInsets,
    maxZoom: number,
): PlaneViewState {
    if (points.length === 0) return current;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const point of points) {
        if (point.x < minX) minX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.x > maxX) maxX = point.x;
        if (point.y > maxY) maxY = point.y;
    }
    const content: PlaneBox = {
        minX: minX - FRAME_NODE_MARGIN,
        minY: minY - FRAME_NODE_MARGIN,
        width: maxX - minX + FRAME_NODE_MARGIN * 2,
        height: maxY - minY + FRAME_NODE_MARGIN * 2,
    };
    return fitBox(content, viewport, insets, Math.min(maxZoom, VISUAL_MAX_ZOOM));
}

/**
 * 两个视角之间的中间帧:**中心线性、缩放取对数**.
 *
 * 直接线性插值 x / y / k 会让缩放和位移各走各的(视觉上"先飞到位再突然推近");
 * 在 (中心 c, 对数 k) 空间插值,即使 t 是线性的,画面也是"一边飞一边推拉":
 *
 * ```text
 * k  = k0 * (k1 / k0) ** t        // 0.2 -> 1 与 1 -> 5 的手感一致
 * c  = c0 + (c1 - c0) * t
 * x  = 可用区中心.x - c.x * k
 * ```
 *
 * `t` 由调用方缓动后传入(tween 的 onUpdate 已经是缓动后的进度).
 */
export function interpolatePlaneView(
    from: PlaneViewState,
    to: PlaneViewState,
    viewport: PlaneBox,
    insets: PlaneInsets,
    t: number,
): PlaneViewState {
    if (!(from.k > 0) || !(to.k > 0)) return t <= 0 ? from : to;
    const clamped = Math.min(Math.max(t, 0), 1);
    const centerFrom = planeViewCenter(from, viewport, insets);
    const centerTo = planeViewCenter(to, viewport, insets);
    const k = from.k * (to.k / from.k) ** clamped;
    return planeViewFromCenter(
        {
            centerX: centerFrom.centerX + (centerTo.centerX - centerFrom.centerX) * clamped,
            centerY: centerFrom.centerY + (centerTo.centerY - centerFrom.centerY) * clamped,
        },
        k,
        viewport,
        insets,
    );
}

/**
 * 镜头动画时长:距离越远、缩放变化越大越久,夹在 280~900ms.
 *
 * ```text
 * d = 两个中心在 min(k0, k1) 下的屏幕距离(px)
 * duration = clamp(280 + 0.5 * d + 260 * |log2(k1 / k0)|, 280, 900)
 * ```
 *
 * 不按距离自适应会"近处慢吞吞、远处来不及";上限 900ms 保证跨子树也不会拖节奏.
 */
export function viewAnimationDurationMs(
    from: PlaneViewState,
    to: PlaneViewState,
    viewport: PlaneBox,
    insets: PlaneInsets,
): number {
    if (!(from.k > 0) || !(to.k > 0)) return 280;
    const centerFrom = planeViewCenter(from, viewport, insets);
    const centerTo = planeViewCenter(to, viewport, insets);
    const distance = Math.hypot(centerTo.centerX - centerFrom.centerX, centerTo.centerY - centerFrom.centerY)
        * Math.min(from.k, to.k);
    const zoomTerm = 260 * Math.abs(Math.log2(to.k / from.k));
    return clamp(280 + 0.5 * distance + zoomTerm, 280, 900);
}

/**
 * wheel 事件 -> 缩放倍数(`e^(-像素delta × 灵敏度)`,指数即乘性).
 *
 * `deltaMode` 必须归一:Chrome 给像素(`0`),Firefox 给行(`1`),少数设备给页(`2`),
 * 三者的数值量级差两个数量级,不折的话同一台机器换个浏览器就等于滚轮失灵.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
    const pixels = deltaMode === 1
        ? deltaY * VISUAL_WHEEL_LINE_PIXELS
        : deltaMode === 2
            ? deltaY * VISUAL_WHEEL_PAGE_PIXELS
            : deltaY;
    return Math.exp(-pixels * VISUAL_WHEEL_ZOOM_SENSITIVITY);
}

// 绑定:把手势接到视口上

/** `mountPlaneViewport()` 的输入 */
export interface PlaneViewportOptions {
    /**
     * 视口上沿要避开的固定带(px),适应时内容居中在这条带之下.
     *
     * 传库的 `DEFAULT_DESKTOP_CONFIG.dockReserve`(任务栏高度),不在本模块抄成常量.
     * 与 `insets` 二选一:同时给时以 `insets` 为准.
     */
    readonly topInset?: number;
    /** 上下两条固定带(演示窗口出现时底部也要扣);缺省只有 `topInset` */
    readonly insets?: PlaneInsets;
    /** 时钟:测试注入手动时钟,生产用 rAF */
    readonly clock?: TweenClock;
    /** 减少动态效果:镜头动画直接瞬移(测试也可显式传) */
    readonly reducedMotion?: boolean;
}

/** 镜头的目标描述 */
export interface PlaneCameraTargetOptions {
    /** false = 直接瞬移;缺省 true(演示 / 定位的默认口径) */
    readonly animated?: boolean;
    /** 覆盖按距离算出的时长 */
    readonly duration?: number;
    readonly easing?: Easing;
}

/** 挂好的视口句柄:内容报账 + 镜头 + 拆卸 */
export interface PlaneViewportHandle {
    /**
     * 内容重画之后报一次它的包围盒(世界坐标).
     * 自动模式下按它重新适应;手动模式(用户挪过 / 演示在跟随)下**一个字都不动**.
     */
    contentChanged(bounds: PlaneBox): void;
    /**
     * 回正:取消镜头动画,把 `manual` 复位成假,再按最近一次的内容包围盒适应.
     * 内容还没报过(如场景为空 / 测试环境量不到包围盒)时什么都不做.
     */
    fitViewport(): void;
    /**
     * 定位到世界坐标里的一个点:把它移到可用区的正中.
     *
     * 缩放取"用户当前缩放"与 `VISUAL_FOCUS_MIN_ZOOM` 的较大者.定位是用户显式动作,
     * 所以进入手动模式(`manual = true`),之后重绘不再自动把视角拉走.
     *
     * `animated` 缺省 false:保留旧调用(测试 / 程序化)的"立即到位"语义;查看器的
     * 「定位」按钮传 true,走平滑镜头.
     */
    focusPoint(x: number, y: number, options?: { readonly animated?: boolean }): void;
    /** 框住一组世界点(旋转 / 局部手术):一次看全,带缓动 */
    framePoints(points: readonly { readonly x: number; readonly y: number }[], options?: PlaneCameraTargetOptions): void;
    /** 把镜头插值到一个具体目标;`animated: false` 或 reduce-motion 时立即赋值 */
    animateTo(target: PlaneViewState, options?: PlaneCameraTargetOptions): void;
    /** 取消当前镜头动画(用户拖动 / 滚轮 / 退出演示时),停在当前插值位置 */
    cancelAnimation(): void;
    /** 当前视角(测试 / 调试 / 播放器同步用) */
    getView(): PlaneViewState;
    /** 换上下固定带(演示窗口出现 / 退出时);手动模式下不重新适应,只影响下一次镜头 */
    setInsets(insets: PlaneInsets): void;
    getInsets(): PlaneInsets;
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
    options: PlaneViewportOptions,
): PlaneViewportHandle {
    // 初值恒等:首屏内容还没画;第一次 contentChanged 才按内容适应
    let view: PlaneViewState = { k: 1, x: 0, y: 0 };
    /** 最近一次报来的内容包围盒(回正要它) */
    let content: PlaneBox | null = null;
    /** 用户是否手动挪过视角:自动模式下重绘会重新适应 */
    let manual = false;
    let insets: PlaneInsets = options.insets
        ?? { top: options.topInset ?? 0, bottom: 0 };
    const clock = options.clock ?? createRafClock();
    const reducedMotion = options.reducedMotion ?? prefersReducedMotion();
    let animation: TweenHandle | null = null;

    // 拖动 / 滚轮监听共用这个信号,dispose 一次全摘;bindDragGesture 收到 abort 时会
    // 把进行中的拖动收尾
    const abort = new AbortController();
    const { signal } = abort;

    const apply = (): void => {
        world.setAttribute('transform', planeViewTransform(view));
    };

    /** 视口矩形(原点即 minX / minY = 0) */
    const viewportBox = (): PlaneBox => ({
        minX: 0,
        minY: 0,
        width: host.clientWidth,
        height: host.clientHeight,
    });

    const fit = (): void => {
        if (!content) return;
        view = fitBox(content, viewportBox(), insets, VISUAL_FIT_MAX_ZOOM);
        apply();
    };

    /** 停掉当前镜头动画(保留 view 的当前值) */
    const cancelAnimation = (): void => {
        animation?.cancel();
        animation = null;
    };

    /**
     * 镜头动画的唯一入口:取消上一段 -> 记手动 -> 插值到目标.
     *
     * 目标在动画期间可能被下一次 `animateTo` 覆盖(自动播放的下一步),所以每段动画
     * 都从**当前 view** 起算,不会从上一段的目标起算.
     */
    const animateTo = (target: PlaneViewState, targetOptions: PlaneCameraTargetOptions = {}): void => {
        cancelAnimation();
        manual = true;
        const box = viewportBox();
        const animated = (targetOptions.animated ?? true)
            && !reducedMotion
            && box.width > 0
            && box.height > 0;
        if (!animated) {
            view = target;
            apply();
            return;
        }
        const from = view;
        const duration = targetOptions.duration
            ?? viewAnimationDurationMs(from, target, box, insets);
        animation = tween({
            duration,
            easing: targetOptions.easing ?? easeInOutCubic,
            clock,
            onUpdate: (progress) => {
                view = interpolatePlaneView(from, target, viewportBox(), insets, progress);
                apply();
            },
            onDone: () => {
                animation = null;
                view = target;
                apply();
            },
        });
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
            // 用户手势只打断**当前这段**镜头动画,停在当前插值位置;结构动画照旧
            cancelAnimation();
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
        cancelAnimation();
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
        contentChanged(bounds: PlaneBox): void {
            content = bounds;
            if (!manual) fit();
        },
        fitViewport(): void {
            // 手动挪过的视角由这次点击交回自动适应:先复位,再按最近内容装
            cancelAnimation();
            manual = false;
            fit();
        },
        focusPoint(x, y, focusOptions): void {
            const target = focusPlaneView(
                view,
                { x, y },
                viewportBox(),
                insets,
                VISUAL_FOCUS_MIN_ZOOM,
            );
            animateTo(target, { animated: focusOptions?.animated ?? false });
        },
        framePoints(points, targetOptions): void {
            const target = framePlaneView(
                view,
                points,
                viewportBox(),
                insets,
                VISUAL_FIT_MAX_ZOOM,
            );
            animateTo(target, targetOptions);
        },
        animateTo,
        cancelAnimation,
        getView(): PlaneViewState {
            return view;
        },
        setInsets(next: PlaneInsets): void {
            insets = next;
            if (!manual) fit();
        },
        getInsets(): PlaneInsets {
            return insets;
        },
        dispose(): void {
            cancelAnimation();
            observer?.disconnect();
            abort.abort();
        },
    };
}
