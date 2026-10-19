/*
 * 补间(补间 / tween)的最小引擎:虚拟时钟 + 缓动函数 + 一段属性插值的驱动.
 *
 * 为什么自己写而不是用 CSS animation / Web Animations API:
 * - 动画的真相是"每帧的完整场景"(见 docs/animation.md §2),相机插值、节点坐标、
 *   连线端点都要在 JS 里算,不是一条 CSS 属性;
 * - 测试要能注入时钟、同步推进,不能依赖浏览器的帧调度;
 * - 后台标签页回来后 `performance.now()` 的差可能极大,这里把单帧 delta 夹到
 *   {@link TWEEN_MAX_DELTA_MS},避免一帧跳完整个过渡.
 *
 * 时钟接口很小(now / request / cancel),真实浏览器走 requestAnimationFrame,
 * 测试给一个手动时钟即可:这是"演示逻辑不依赖 setTimeout"的前提.
 */

/** 缓动:吃 0..1 的线性进度,交回 0..1 的缓动进度(必须 e(0)=0 / e(1)=1) */
export type Easing = (t: number) => number;

/** 线性(机械步骤 / 测试用) */
export const linearEasing: Easing = (t) => t;

/**
 * 相机与结构动画共用的默认曲线:起步慢、中段快、收尾稳.
 *
 * 刻意**不做过冲**(没有回弹 / overshoot):镜头过冲会让人晕,而且旋转帧里
 * 节点越过目标位置再弹回来会让人误以为结构错了一下.
 */
export const easeInOutCubic: Easing = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** 出场 / 淡出用:起步快、收尾慢 */
export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3;

/**
 * 单帧最大时间差(ms):后台标签页的 RAF 暂停再回来时,两帧可能差几秒.
 *
 * 夹住之后最坏是动画慢半拍,而不是"一帧跳完整个过渡"(那和瞬移没区别,还会让
 * 帧间插值里"先拉远再飞"的路径整段被跳过).
 */
export const TWEEN_MAX_DELTA_MS = 50;

/**
 * 补间用的时钟:`now()` 单调毫秒,`request()` 在下一帧回调,`cancel()` 撤销.
 *
 * 真实环境请用 {@link createRafClock};测试自己实现一个手动时钟(推进时间 +
 * 触发回调),播放器的全部时间行为就都能同步断言.
 */
export interface TweenClock {
    now(): number;
    request(callback: (now: number) => void): number;
    cancel(handle: number): void;
}

/** 浏览器时钟:`performance.now()` + `requestAnimationFrame`(两者都挂在 window 上) */
export function createRafClock(): TweenClock {
    return {
        now: () => performance.now(),
        request: (callback) => requestAnimationFrame(callback),
        cancel: (handle) => cancelAnimationFrame(handle),
    };
}

/** 一段补间的句柄;`cancel()` 之后不再回调(已经回调过 onDone 的也算结束) */
export interface TweenHandle {
    cancel(): void;
}

/** `tween()` 的输入 */
export interface TweenOptions {
    /** 时长(ms);<= 0 时下一帧直接落到终态 */
    readonly duration: number;
    /** 缓动曲线,缺省 easeInOutCubic */
    readonly easing?: Easing;
    /** 每帧回调:参数是**缓动后**的进度,第一帧同步收到 e(0)=0 */
    readonly onUpdate: (progress: number) => void;
    /** 进度到 1 后回调一次(在最后一次 onUpdate 之后) */
    readonly onDone?: () => void;
    readonly clock: TweenClock;
    /** 外部取消信号(用户拖动 / 退出演示):abort 等价于 cancel() */
    readonly signal?: AbortSignal;
}

/**
 * 驱动一段补间:立即回调 onUpdate(e(0)),之后每帧按**累计时间**算进度.
 *
 * 累计时间而不是"now - start":单帧 delta 被夹到 {@link TWEEN_MAX_DELTA_MS},
 * 所以后台标签页回来时动画会继续走完剩下的时长,而不是一步跳完.夹的是 delta,
 * 不是总时长:连续几帧都慢时动画整体变慢,这是可接受的兜底(不会瞬移).
 *
 * 返回句柄**总是**可 cancel 的(即使 duration <= 0).
 */
export function tween(options: TweenOptions): TweenHandle {
    const { duration, clock, signal } = options;
    const easing = options.easing ?? easeInOutCubic;
    let cancelled = false;
    let handle: number | null = null;
    let last = clock.now();
    let elapsed = 0;

    const stop = (): void => {
        if (cancelled) return;
        cancelled = true;
        if (handle !== null) {
            clock.cancel(handle);
            handle = null;
        }
        signal?.removeEventListener('abort', stop);
    };

    const finish = (): void => {
        if (cancelled) return;
        options.onUpdate(1);
        if (cancelled) return;
        stop();
        options.onDone?.();
    };

    const frame = (now: number): void => {
        if (cancelled) return;
        const delta = Math.min(Math.max(now - last, 0), TWEEN_MAX_DELTA_MS);
        last = now;
        elapsed += delta;
        const progress = duration <= 0 ? 1 : Math.min(elapsed / duration, 1);
        options.onUpdate(easing(progress));
        if (cancelled) return;
        if (progress >= 1) finish();
        else handle = clock.request(frame);
    };

    // 第一帧同步给出 e(0):调用方在 tween() 返回前就能把起始状态落好,
    // 不必等下一帧(测试里也就不需要"先手动推一帧"的仪式)
    options.onUpdate(easing(0));
    if (duration <= 0) {
        finish();
        return { cancel: stop };
    }
    if (signal?.aborted) {
        stop();
        return { cancel: stop };
    }
    signal?.addEventListener('abort', stop, { once: true });
    handle = clock.request(frame);
    return { cancel: stop };
}

/**
 * 系统是否要求"减少动态效果".
 *
 * 只看 `matchMedia`,没有 `window`(node 测试)时视为否:演示逻辑在测试里仍然
 * 走过渡,需要瞬移的测试显式传 `reducedMotion` 选项.不要在这里读全局 document,
 * 播放器会把它作为显式参数注入.
 */
export function prefersReducedMotion(win: Window | null = typeof window === 'undefined' ? null : window): boolean {
    if (win === null || typeof win.matchMedia !== 'function') return false;
    return win.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
