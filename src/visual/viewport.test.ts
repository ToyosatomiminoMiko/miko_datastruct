/**
 * 平面视口(visual/viewport.ts)的契约:变换数学的算术事实 + 两种手势与回正.
 * 手势层在 happy-dom 里挂真视口;manual(自动 / 手动适应)状态机单独验.
 * happy-dom 不做布局,视口尺寸要自己种,顺带钉住"量不出尺寸时给恒等视角"的兜底.
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { create_svg_element } from 'miko_ui';

import {
    VISUAL_FIT_MAX_ZOOM,
    VISUAL_FOCUS_MIN_ZOOM,
    VISUAL_MAX_ZOOM,
    VISUAL_MIN_ZOOM,
    VISUAL_WHEEL_LINE_PIXELS,
    VISUAL_WHEEL_PAGE_PIXELS,
    VISUAL_WHEEL_ZOOM_SENSITIVITY,
} from '@/visual/config';
import {
    fitPlaneView,
    focusPlaneView,
    framePlaneView,
    interpolatePlaneView,
    mountPlaneViewport,
    panPlaneView,
    planeViewCenter,
    planeViewTransform,
    viewAnimationDurationMs,
    wheelZoomFactor,
    zoomPlaneView,
    type PlaneBox,
    type PlaneInsets,
    type PlaneViewState,
    type PlaneViewportHandle,
} from '@/visual/viewport';
import { ManualClock } from '@/test_support/manual_clock';

// 变换数学

/** 一块内容包围盒(与布局交回的同一形状) */
function box(minX: number, minY: number, width: number, height: number): PlaneBox {
    return { minX, minY, width, height };
}

/** 视口矩形(原点即 minX / minY = 0) */
function viewportBox(width: number, height: number): PlaneBox {
    return { minX: 0, minY: 0, width, height };
}

describe('平面视口:变换数学', () => {
    it('适应:内容装进视口并居中,不放大超过 1 倍', () => {
        // 内容高 350、可用高 724(扣任务栏 40 与上下留白 48×2):比例够大,但被 1 挡住
        const content = box(38, 43, 850, 350);
        const view = fitPlaneView(content, viewportBox(1400, 860), 40);

        expect(view.k).toBe(VISUAL_FIT_MAX_ZOOM);
        // 居中:内容中心对到可用区中心,再减去 content 起点 × k 得到视口偏移
        expect(view.x).toBeCloseTo((1400 - 850) / 2 - 38, 6);
        expect(view.y).toBeCloseTo(40 + (860 - 40 - 350) / 2 - 43, 6);
    });

    it('适应:内容比视口大就缩小(装得下为准),上下限之内', () => {
        const view = fitPlaneView(box(0, 0, 4000, 400), viewportBox(1400, 860), 40);

        // min(1304/4000, 724/400, 1) -- 宽度是瓶颈
        expect(view.k).toBeCloseTo(1304 / 4000, 6);
        expect(view.k).toBeGreaterThan(VISUAL_MIN_ZOOM);
        expect(view.k).toBeLessThanOrEqual(VISUAL_MAX_ZOOM);
    });

    it('适应:内容为空 / 视口量不出尺寸时给恒等视角(调用方不必先判断)', () => {
        // happy-dom 那种 clientWidth 为 0 的视口
        expect(fitPlaneView(box(0, 0, 100, 100), viewportBox(0, 0), 0))
            .toEqual({ k: VISUAL_FIT_MAX_ZOOM, x: 0, y: 0 });
        // 空内容(调用方只画非空树,理论上不会出现)
        expect(fitPlaneView(box(0, 0, 0, 0), viewportBox(1000, 800), 0))
            .toEqual({ k: VISUAL_FIT_MAX_ZOOM, x: 0, y: 0 });
    });

    it('以指针为锚缩放:指针下那个世界点原地不动', () => {
        const before: PlaneViewState = { k: 1, x: 0, y: 0 };
        const cursor = { x: 100, y: 50 };
        // 锚点下的世界坐标(缩放前)
        const worldX = (cursor.x - before.x) / before.k;
        const worldY = (cursor.y - before.y) / before.k;

        const after = zoomPlaneView(before, 2, cursor.x, cursor.y);

        expect(after.k).toBe(2);
        expect(after.x).toBeCloseTo(-100, 6);
        expect(after.y).toBeCloseTo(-50, 6);
        // 同一个世界点换算回屏幕,还在指针下面
        expect(after.x + worldX * after.k).toBeCloseTo(cursor.x, 6);
        expect(after.y + worldY * after.k).toBeCloseTo(cursor.y, 6);
    });

    it('缩放夹在上下限里:顶到限上时锚点仍不动,已经在限上时一点都不动', () => {
        // 从 1 倍一次冲到上限:夹到 VISUAL_MAX_ZOOM,但锚点下的世界点仍不动
        const zoomed = zoomPlaneView({ k: 1, x: 10, y: 20 }, 1e9, 300, 200);
        expect(zoomed.k).toBe(VISUAL_MAX_ZOOM);
        const worldX = (300 - 10) / 1;
        expect(zoomed.x + worldX * zoomed.k).toBeCloseTo(300, 6);

        // 已在限上再往同方向缩:比率是 1,偏移照旧,画面不漂
        expect(zoomPlaneView({ k: VISUAL_MAX_ZOOM, x: 10, y: 20 }, 1e9, 300, 200))
            .toEqual({ k: VISUAL_MAX_ZOOM, x: 10, y: 20 });
        expect(zoomPlaneView({ k: VISUAL_MIN_ZOOM, x: 10, y: 20 }, 1e-9, 300, 200))
            .toEqual({ k: VISUAL_MIN_ZOOM, x: 10, y: 20 });
    });

    it('平移:屏幕像素增量直接加到偏移上,k 不变', () => {
        expect(panPlaneView({ k: 1.5, x: 10, y: -20 }, 30, 40))
            .toEqual({ k: 1.5, x: 40, y: 20 });
    });

    it('transform 属性值:translate + scale,三位小数,负零归一', () => {
        expect(planeViewTransform({ k: 1, x: 0, y: 0 })).toBe('translate(0 0) scale(1)');
        expect(planeViewTransform({ k: 1.23456, x: -0, y: 2.0004 }))
            .toBe('translate(0 2) scale(1.235)');
    });

    it('滚轮 delta 归一化:行 / 页折算成像素,与像素模式同量级', () => {
        // 一格 100px(Chrome)与一格 3 行(Firefox)应该落在同一个量级上
        const pixelNotch = wheelZoomFactor(100, 0);
        const lineNotch = wheelZoomFactor(3, 1);
        expect(pixelNotch).toBeCloseTo(Math.exp(-100 * VISUAL_WHEEL_ZOOM_SENSITIVITY), 9);
        expect(lineNotch).toBeCloseTo(Math.exp(-3 * VISUAL_WHEEL_LINE_PIXELS * VISUAL_WHEEL_ZOOM_SENSITIVITY), 9);
        // 一格缩小百分之十上下,不会滚了等于没滚
        expect(pixelNotch).toBeGreaterThan(0.8);
        expect(pixelNotch).toBeLessThan(1);
        expect(lineNotch).toBeGreaterThan(0.9);
        expect(lineNotch).toBeLessThan(1);
        expect(wheelZoomFactor(1, 2))
            .toBeCloseTo(Math.exp(-VISUAL_WHEEL_PAGE_PIXELS * VISUAL_WHEEL_ZOOM_SENSITIVITY), 9);
        // 向下滚(deltaY 正)= 缩小,向上滚 = 放大
        expect(pixelNotch).toBeLessThan(1);
        expect(wheelZoomFactor(-100, 0)).toBeGreaterThan(1);
    });
});

// 手势绑定(happy-dom 里的真视口)

/** 视口 + 世界层 + 句柄 */
interface Fixture {
    readonly host: HTMLElement;
    readonly world: SVGGElement;
    readonly viewport: PlaneViewportHandle;
}

/** 读世界层当前视角(属性值 -> 数字;格式由 planeViewTransform 保证) */
function readTransform(world: SVGGElement): PlaneViewState {
    const attribute = world.getAttribute('transform') ?? '';
    const matched = /^translate\((-?[\d.]+) (-?[\d.]+)\) scale\(([\d.]+)\)$/.exec(attribute);
    if (!matched) throw new Error(`世界层的 transform 不是视口写的形状: ${attribute}`);
    return { x: Number(matched[1]), y: Number(matched[2]), k: Number(matched[3]) };
}

/** 挂一块视口(尺寸自己种:happy-dom 不做布局) */
function mountViewport(width = 1000, height = 800): Fixture {
    document.body.innerHTML = '';

    const host = document.createElement('div');
    Object.defineProperty(host, 'clientWidth', { value: width, configurable: true });
    Object.defineProperty(host, 'clientHeight', { value: height, configurable: true });
    document.body.append(host);

    const world = create_svg_element({ tag: 'g' });
    return { host, world, viewport: mountPlaneViewport(host, world, { topInset: 40 }) };
}

/** 一次指针事件(与浏览器派发同形:冒泡 + 可取消) */
function pointerEvent(type: string, x: number, y: number, pointerId = 1, button = 0): PointerEvent {
    return new PointerEvent(type, {
        clientX: x,
        clientY: y,
        pointerId,
        button,
        bubbles: true,
        cancelable: true,
    });
}

/** 按下 - 移动 - 松手(拖动那个手势) */
function drag(host: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }): void {
    host.dispatchEvent(pointerEvent('pointerdown', from.x, from.y));
    host.dispatchEvent(pointerEvent('pointermove', to.x, to.y));
    host.dispatchEvent(pointerEvent('pointerup', to.x, to.y));
}

/**
 * 滚轮(以指针为锚的缩放).
 * `clientX` / `clientY` 补上去:happy-dom 的 WheelEvent 继承 UIEvent(没有鼠标坐标),
 * 真浏览器里继承 MouseEvent.真机上的锚点行为只在浏览器里验.
 */
function wheel(host: HTMLElement, x: number, y: number, deltaY: number): void {
    const event = new WheelEvent('wheel', { deltaY, deltaMode: 0, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clientX', { value: x });
    Object.defineProperty(event, 'clientY', { value: y });
    host.dispatchEvent(event);
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('平面视口:手势绑定', () => {
    it('内容报上来就适应(自动模式):装得下并居中,transform 由这里写', () => {
        const { world, viewport } = mountViewport();

        // 挂载那一刻世界层先落在恒等视角(属性由视口写,而不是没挂)
        expect(readTransform(world)).toEqual({ k: 1, x: 0, y: 0 });

        viewport.contentChanged(box(0, 0, 400, 200));

        const view = readTransform(world);
        // 400×200 装进 1000×800(上沿留 40)不会被放大超过 1
        expect(view.k).toBe(VISUAL_FIT_MAX_ZOOM);
        expect(view.x).toBeCloseTo((1000 - 400) / 2, 6);
        expect(view.y).toBeCloseTo(40 + (800 - 40 - 200) / 2, 6);
    });

    it('左键拖动平移:k 不变,偏移跟着指针走', () => {
        const { host, world, viewport } = mountViewport();
        viewport.contentChanged(box(0, 0, 400, 200));
        const before = readTransform(world);

        drag(host, { x: 500, y: 400 }, { x: 530, y: 380 });

        const after = readTransform(world);
        expect(after.k).toBe(before.k);
        expect(after.x).toBeCloseTo(before.x + 30, 6);
        expect(after.y).toBeCloseTo(before.y - 20, 6);
    });

    it('右键(与其它非主键)不起手:平面不动', () => {
        const { host, world, viewport } = mountViewport();
        viewport.contentChanged(box(0, 0, 400, 200));
        const before = readTransform(world);

        host.dispatchEvent(pointerEvent('pointerdown', 500, 400, 1, 2));
        host.dispatchEvent(pointerEvent('pointermove', 600, 500));
        host.dispatchEvent(pointerEvent('pointerup', 600, 500, 1, 2));

        expect(readTransform(world)).toEqual(before);
    });

    it('滚轮以指针为锚缩放:指针下那个世界点不动', () => {
        const { host, world, viewport } = mountViewport();
        viewport.contentChanged(box(0, 0, 400, 200));
        const before = readTransform(world);
        const worldX = (500 - before.x) / before.k;

        wheel(host, 500, 400, -100);

        const after = readTransform(world);
        expect(after.k).toBeGreaterThan(before.k);
        /*
          锚点不动:同一个世界点换算回屏幕还在指针下面.
          余量 0.5px 来自 transform 属性按三位小数取整,而 k 的取整误差会被 worldX 放大;
          算术本身是精确的(见上面"以指针为锚缩放"的纯函数用例).
        */
        expect(Math.abs(after.x + worldX * after.k - 500)).toBeLessThan(0.5);
    });

    it('手动挪过之后重绘不再抢视角;fitViewport() 回正把自动模式接回来', () => {
        const { host, world, viewport } = mountViewport();
        viewport.contentChanged(box(0, 0, 400, 200));
        const fitted = readTransform(world);

        // 滚轮缩放也算"用户挪过视角"
        wheel(host, 500, 400, -100);
        const zoomed = readTransform(world);
        expect(zoomed.k).toBeGreaterThan(fitted.k);

        // 内容变了也不动:视角是用户的
        viewport.contentChanged(box(0, 0, 40, 40));
        expect(readTransform(world)).toEqual(zoomed);

        // 回正(句柄方法):回到自动模式,并按最近那块内容适应
        viewport.fitViewport();

        const refitted = readTransform(world);
        expect(refitted.k).toBe(VISUAL_FIT_MAX_ZOOM);
        expect(refitted.x).toBeCloseTo((1000 - 40) / 2, 6);
        expect(refitted.y).toBeCloseTo(40 + (800 - 40 - 40) / 2, 6);

        // 自动模式真的回来了:下一次重绘又会跟着内容走
        viewport.contentChanged(box(0, 0, 200, 200));
        expect(readTransform(world).x).toBeCloseTo((1000 - 200) / 2, 6);
    });

    it('focusPoint:把世界点移到可用区正中;视角太小时抬到可读下限,之后重绘不再抢视角', () => {
        const { world, viewport } = mountViewport();
        // 4000×400 装进视口:靠宽度缩到 ~0.33,定位时按这个比例移过去节点只有几个像素
        viewport.contentChanged(box(0, 0, 4000, 400));
        const fitted = readTransform(world);
        expect(fitted.k).toBeLessThan(VISUAL_FOCUS_MIN_ZOOM);

        viewport.focusPoint(1234, 56);

        const focused = readTransform(world);
        expect(focused.k).toBe(VISUAL_FOCUS_MIN_ZOOM);
        // 可用区 = 视口扣掉顶部任务栏带(40)后的那块,点对到它的正中
        expect(focused.x).toBeCloseTo(1000 / 2 - 1234 * focused.k, 6);
        expect(focused.y).toBeCloseTo(40 + (800 - 40) / 2 - 56 * focused.k, 6);

        // 定位是用户显式动作:进入手动模式,内容再变也不把视角拉走
        viewport.contentChanged(box(0, 0, 10, 10));
        expect(readTransform(world)).toEqual(focused);
    });

    it('focusPoint:用户已经放大过就保持自己的缩放,只移动中心', () => {
        const { host, world, viewport } = mountViewport();
        viewport.contentChanged(box(0, 0, 200, 100));
        wheel(host, 500, 400, -100);
        const zoomed = readTransform(world);
        expect(zoomed.k).toBeGreaterThan(VISUAL_FOCUS_MIN_ZOOM);

        viewport.focusPoint(0, 0);
        expect(readTransform(world).k).toBeCloseTo(zoomed.k, 6);
    });

    it('连续两次左键按下不再被当成回正(双击判定与计时已删)', () => {
        const { host, world, viewport } = mountViewport();
        viewport.contentChanged(box(0, 0, 400, 200));
        wheel(host, 500, 400, -100);
        const zoomed = readTransform(world);

        /*
          两次完整的按下 / 松手、中间没有位移:只是两次单击(同步派发,间隔为 0).
          没有位移,所以既不平移也不回正,manual 也不该被复位(下面那次重绘不动视角).
        */
        host.dispatchEvent(pointerEvent('pointerdown', 300, 300, 1));
        host.dispatchEvent(pointerEvent('pointerup', 300, 300, 1));
        host.dispatchEvent(pointerEvent('pointerdown', 300, 300, 2));
        host.dispatchEvent(pointerEvent('pointerup', 300, 300, 2));

        expect(readTransform(world)).toEqual(zoomed);
        viewport.contentChanged(box(0, 0, 40, 40));
        expect(readTransform(world)).toEqual(zoomed);
    });

    it('dispose 之后拖动 / 滚轮都不再改世界层(监听随信号摘掉)', () => {
        const { host, world, viewport } = mountViewport();
        viewport.contentChanged(box(0, 0, 400, 200));
        viewport.dispose();
        const frozen = world.getAttribute('transform');

        drag(host, { x: 500, y: 400 }, { x: 620, y: 500 });
        wheel(host, 500, 400, -100);

        expect(world.getAttribute('transform')).toBe(frozen);
    });
});

// 镜头取景数学(纯函数)

describe('平面视口:镜头取景数学', () => {
    const insets: PlaneInsets = { top: 40, bottom: 120 };

    it('focusPlaneView:点落在可用区正中,缩放取 max(当前, 下限)', () => {
        const target = focusPlaneView(
            { k: 0.2, x: 0, y: 0 },
            { x: 1234, y: 56 },
            viewportBox(1000, 800),
            insets,
            VISUAL_FOCUS_MIN_ZOOM,
        );
        expect(target.k).toBe(VISUAL_FOCUS_MIN_ZOOM);
        // 可用区 = top 40 到 800-120,中点 y = 40 + 640/2 = 360
        expect(target.x).toBeCloseTo(500 - 1234 * target.k, 6);
        expect(target.y).toBeCloseTo(360 - 56 * target.k, 6);
        // 反解中心点就是目标点(浮点误差在 1e-9 内)
        const center = planeViewCenter(target, viewportBox(1000, 800), insets);
        expect(center.centerX).toBeCloseTo(1234, 9);
        expect(center.centerY).toBeCloseTo(56, 9);
    });

    it('framePlaneView:框住一组点,装进可用区并留出圆半径余量;空数组原样返回', () => {
        const current: PlaneViewState = { k: 3, x: 7, y: 9 };
        // 两个点相距 200:包围盒 + 半径余量后仍装得下,放大上限 1
        const target = framePlaneView(
            current,
            [{ x: 0, y: 0 }, { x: 200, y: 100 }],
            viewportBox(1000, 800),
            insets,
            VISUAL_FIT_MAX_ZOOM,
        );
        expect(target.k).toBe(VISUAL_FIT_MAX_ZOOM);
        // 包围盒中心 (100,50) 对到可用区中心
        expect(planeViewCenter(target, viewportBox(1000, 800), insets))
            .toEqual({ centerX: 100, centerY: 50 });

        expect(framePlaneView(current, [], viewportBox(1000, 800), insets, VISUAL_FIT_MAX_ZOOM))
            .toBe(current);
    });

    it('interpolatePlaneView:端点精确,缩放取对数(中点 = 几何平均),中心线性', () => {
        const from: PlaneViewState = { k: 0.25, x: 100, y: 50 };
        const to: PlaneViewState = { k: 1, x: -300, y: 250 };
        const viewport = viewportBox(1000, 800);
        const start = interpolatePlaneView(from, to, viewport, insets, 0);
        const end = interpolatePlaneView(from, to, viewport, insets, 1);
        expect(start.k).toBeCloseTo(from.k, 9);
        expect(start.x).toBeCloseTo(from.x, 6);
        expect(end.k).toBeCloseTo(to.k, 9);
        expect(end.x).toBeCloseTo(to.x, 6);

        const middle = interpolatePlaneView(from, to, viewport, insets, 0.5);
        expect(middle.k).toBeCloseTo(Math.sqrt(from.k * to.k), 9);
        const cFrom = planeViewCenter(from, viewport, insets);
        const cTo = planeViewCenter(to, viewport, insets);
        const cMiddle = planeViewCenter(middle, viewport, insets);
        expect(cMiddle.centerX).toBeCloseTo((cFrom.centerX + cTo.centerX) / 2, 6);
        expect(cMiddle.centerY).toBeCloseTo((cFrom.centerY + cTo.centerY) / 2, 6);
    });

    it('viewAnimationDurationMs:近处 ~280,远处 / 大缩放变化封顶 900', () => {
        const near = viewAnimationDurationMs(
            { k: 1, x: 0, y: 0 },
            { k: 1, x: 10, y: 0 },
            viewportBox(1000, 800),
            insets,
        );
        // 公式 280 + 0.5 * 10 = 285,仍在 280~300 的"近距离"区间
        expect(near).toBe(285);

        const far = viewAnimationDurationMs(
            { k: 1, x: 0, y: 0 },
            { k: 0.1, x: 20000, y: 20000 },
            viewportBox(1000, 800),
            insets,
        );
        expect(far).toBe(900);
    });
});

// 镜头动画(happy-dom 里的真视口 + 手动时钟)

describe('平面视口:镜头动画 / 打断', () => {
    function mountAnimated(): { world: SVGGElement; viewport: PlaneViewportHandle; clock: ManualClock } {
        document.body.innerHTML = '';
        const host = document.createElement('div');
        Object.defineProperty(host, 'clientWidth', { value: 1000, configurable: true });
        Object.defineProperty(host, 'clientHeight', { value: 800, configurable: true });
        document.body.append(host);
        const world = create_svg_element({ tag: 'g' });
        const clock = new ManualClock();
        const viewport = mountPlaneViewport(host, world, {
            insets: { top: 40, bottom: 120 },
            clock,
            reducedMotion: false,
        });
        return { world, viewport, clock };
    }

    it('animateTo 在虚拟时钟上插值:中间帧在动,推完落到目标', () => {
        const { world, viewport, clock } = mountAnimated();
        viewport.contentChanged(box(0, 0, 400, 200));
        const from = viewport.getView();
        const target = framePlaneView(
            from,
            [{ x: 0, y: 0 }, { x: 200, y: 100 }],
            viewportBox(1000, 800),
            { top: 40, bottom: 120 },
            1,
        );

        viewport.framePoints([{ x: 0, y: 0 }, { x: 200, y: 100 }]);
        const first = readTransform(world);
        // 第一帧同步写 e(0):还在出发视角
        expect(first.k).toBeCloseTo(from.k, 9);

        for (let index = 0; index < 5; index += 1) clock.advance(50);
        const middle = readTransform(world);
        // 这一段的缩放没变(1 -> 1),但中心在动:中间帧不是起点
        expect(middle.x).not.toBeCloseTo(from.x, 6);

        for (let index = 0; index < 40; index += 1) clock.advance(50);
        const settled = readTransform(world);
        expect(settled.k).toBeCloseTo(target.k, 9);
        expect(settled.x).toBeCloseTo(target.x, 6);
        expect(settled.y).toBeCloseTo(target.y, 6);
    });

    it('用户拖动立即打断镜头动画,停在当前位置;之后不再被动画接管', () => {
        const { world, viewport, clock } = mountAnimated();
        const host = document.querySelector('div') as HTMLElement;
        viewport.contentChanged(box(0, 0, 400, 200));

        viewport.framePoints([{ x: 0, y: 0 }, { x: 400, y: 300 }]);
        for (let index = 0; index < 3; index += 1) clock.advance(50);
        const beforeDrag = readTransform(world);

        drag(host, { x: 500, y: 400 }, { x: 520, y: 400 });
        const afterDrag = readTransform(world);
        expect(afterDrag.k).toBeCloseTo(beforeDrag.k, 9);
        expect(afterDrag.x).toBeCloseTo(beforeDrag.x + 20, 6);

        // 动画已经被打断:再推时钟不再变
        for (let index = 0; index < 30; index += 1) clock.advance(50);
        expect(readTransform(world)).toEqual(afterDrag);
    });

    it('reducedMotion / animated:false 直接瞬移,不排动画帧', () => {
        const { world, viewport, clock } = mountAnimated();
        viewport.contentChanged(box(0, 0, 400, 200));
        const target = focusPlaneView(
            viewport.getView(),
            { x: 500, y: 300 },
            viewportBox(1000, 800),
            { top: 40, bottom: 120 },
            VISUAL_FOCUS_MIN_ZOOM,
        );

        viewport.animateTo(target, { animated: false });
        expect(readTransform(world)).toEqual({
            k: Math.round(target.k * 1000) / 1000,
            x: Math.round(target.x * 1000) / 1000,
            y: Math.round(target.y * 1000) / 1000,
        });
        expect(clock.pendingCount).toBe(0);

        // setInsets 只影响下一次镜头;手动模式下不重新适应
        viewport.setInsets({ top: 40, bottom: 0 });
        expect(viewport.getInsets()).toEqual({ top: 40, bottom: 0 });
    });
});
