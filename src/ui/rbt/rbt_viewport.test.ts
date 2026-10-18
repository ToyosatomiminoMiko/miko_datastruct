/**
 * 平面视口(ui/rbt/rbt_viewport.ts)的契约:**变换数学**与**两种手势 + 回正**.
 *
 * 这一层分两段,因为"算得对"与"接得上"是两件事:
 *
 * 1. **变换数学**(纯函数,数字进数字出):适应(fit)、以指针为锚的缩放、平移、
 *    transform 属性值、滚轮 delta 的归一化.这里钉的是几条**算术事实**:
 *    - 适应把内容装进视口并居中,而且不放大超过 1(见 RBT_FIT_MAX_ZOOM);
 *    - 缩放时指针下那个世界点**原地不动**(滚轮缩放不跑偏的全部内容);
 *    - 到上下限时锚点仍然不动(比率用夹过之后的 k 算,不会出现"缩不动了画面还在漂");
 *    - 行 / 页两种 deltaMode 折算成像素后与 Chrome 的像素模式同量级(不然 Firefox
 *      上滚轮等于失灵).
 * 2. **手势绑定**(happy-dom 里挂一颗真视口):左键拖动改世界层 transform、滚轮以
 *    指针为锚缩放、`fitViewport()` 回正把自动模式接回来、dispose 之后手势全部失效.
 *    回正是**句柄方法**,不绑任何鼠标事件(双击判定已删,见用例"连续两次左键按下").
 *
 * `manual`(自动 / 手动适应)那台状态机单独测:它是"重绘要不要抢方向盘"的全部内容 --
 * 用户没动过时内容变了就重新适应,动过之后一个字都不动.
 *
 * happy-dom **不做布局**,所以视口的 `clientWidth` / `clientHeight` 要自己种
 * (Object.defineProperty):这正好也把"量不出尺寸时给恒等视角"这条兜底顺带钉住
 * (见下面最后一个用例,真机上的适应比例不在这一层验).
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { create_svg_element } from 'miko_ui';

import {
    RBT_FIT_MAX_ZOOM,
    RBT_MAX_ZOOM,
    RBT_MIN_ZOOM,
    RBT_WHEEL_LINE_PIXELS,
    RBT_WHEEL_PAGE_PIXELS,
    RBT_WHEEL_ZOOM_SENSITIVITY,
} from '@/ui/rbt/config';
import {
    fitPlaneView,
    mountPlaneViewport,
    panPlaneView,
    planeViewTransform,
    wheelZoomFactor,
    zoomPlaneView,
    type RbtPlaneBox,
    type RbtViewState,
    type RbtViewportHandle,
} from '@/ui/rbt/rbt_viewport';

// ============================================================
// 变换数学
// ============================================================

/** 一块内容包围盒(与布局交回的同一形状) */
function box(minX: number, minY: number, width: number, height: number): RbtPlaneBox {
    return { minX, minY, width, height };
}

/** 视口矩形(它自己的原点就是 minX / minY = 0) */
function viewportBox(width: number, height: number): RbtPlaneBox {
    return { minX: 0, minY: 0, width, height };
}

describe('平面视口:变换数学', () => {
    it('适应:内容装进视口并居中,不放大超过 1 倍', () => {
        // 内容高 350、视口可用高(扣任务栏 40 与上下留白 48×2)724:比例够大,但被 1 挡住
        const content = box(38, 43, 850, 350);
        const view = fitPlaneView(content, viewportBox(1400, 860), 40);

        expect(view.k).toBe(RBT_FIT_MAX_ZOOM);
        // 居中:内容中心落到可用区中心,再把世界原点换算成视口偏移(minX / minY 不为 0)
        expect(view.x).toBeCloseTo((1400 - 850) / 2 - 38, 6);
        expect(view.y).toBeCloseTo(40 + (860 - 40 - 350) / 2 - 43, 6);
    });

    it('适应:内容比视口大就缩小(装得下为准),上下限之内', () => {
        const view = fitPlaneView(box(0, 0, 4000, 400), viewportBox(1400, 860), 40);

        // min(1304/4000, 724/400, 1) -- 宽度是瓶颈
        expect(view.k).toBeCloseTo(1304 / 4000, 6);
        expect(view.k).toBeGreaterThan(RBT_MIN_ZOOM);
        expect(view.k).toBeLessThanOrEqual(RBT_MAX_ZOOM);
    });

    it('适应:内容为空 / 视口量不出尺寸时给恒等视角(调用方不必先判断)', () => {
        // happy-dom 那种 clientWidth 为 0 的视口
        expect(fitPlaneView(box(0, 0, 100, 100), viewportBox(0, 0), 0))
            .toEqual({ k: RBT_FIT_MAX_ZOOM, x: 0, y: 0 });
        // 空内容(理论上不会出现:调用方只画非空树)
        expect(fitPlaneView(box(0, 0, 0, 0), viewportBox(1000, 800), 0))
            .toEqual({ k: RBT_FIT_MAX_ZOOM, x: 0, y: 0 });
    });

    it('以指针为锚缩放:指针下那个世界点原地不动', () => {
        const before: RbtViewState = { k: 1, x: 0, y: 0 };
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
        // 从 1 倍一次冲到上限:夹到 RBT_MAX_ZOOM,但指针下那个世界点仍然原地不动
        const zoomed = zoomPlaneView({ k: 1, x: 10, y: 20 }, 1e9, 300, 200);
        expect(zoomed.k).toBe(RBT_MAX_ZOOM);
        const worldX = (300 - 10) / 1;
        expect(zoomed.x + worldX * zoomed.k).toBeCloseTo(300, 6);

        // 已经在限上再往同方向缩:比率是 1,偏移照旧(不会出现"缩不动了画面还在漂")
        expect(zoomPlaneView({ k: RBT_MAX_ZOOM, x: 10, y: 20 }, 1e9, 300, 200))
            .toEqual({ k: RBT_MAX_ZOOM, x: 10, y: 20 });
        expect(zoomPlaneView({ k: RBT_MIN_ZOOM, x: 10, y: 20 }, 1e-9, 300, 200))
            .toEqual({ k: RBT_MIN_ZOOM, x: 10, y: 20 });
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
        expect(pixelNotch).toBeCloseTo(Math.exp(-100 * RBT_WHEEL_ZOOM_SENSITIVITY), 9);
        expect(lineNotch).toBeCloseTo(Math.exp(-3 * RBT_WHEEL_LINE_PIXELS * RBT_WHEEL_ZOOM_SENSITIVITY), 9);
        // 都是"一格缩小百分之十上下",不会出现"滚了等于没滚"
        expect(pixelNotch).toBeGreaterThan(0.8);
        expect(pixelNotch).toBeLessThan(1);
        expect(lineNotch).toBeGreaterThan(0.9);
        expect(lineNotch).toBeLessThan(1);
        // 页模式与像素模式按各自的约定折算
        expect(wheelZoomFactor(1, 2))
            .toBeCloseTo(Math.exp(-RBT_WHEEL_PAGE_PIXELS * RBT_WHEEL_ZOOM_SENSITIVITY), 9);
        // 向下滚(deltaY 正)= 缩小,向上滚 = 放大
        expect(pixelNotch).toBeLessThan(1);
        expect(wheelZoomFactor(-100, 0)).toBeGreaterThan(1);
    });
});

// ============================================================
// 手势绑定(happy-dom 里的真视口)
// ============================================================

/** 视口组件 + 世界层 + 句柄,以及"量出尺寸"的那两颗数字 */
interface Fixture {
    readonly host: HTMLElement;
    readonly world: SVGGElement;
    readonly viewport: RbtViewportHandle;
}

/** 看世界层当前摆在哪(属性值 -> 数字;格式由 planeViewTransform 保证) */
function readTransform(world: SVGGElement): RbtViewState {
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
 *
 * `clientX` / `clientY` 是**补上去的**:happy-dom 的 `WheelEvent` 继承 UIEvent(没有鼠标
 * 坐标),而真浏览器里它继承 MouseEvent -- 指针位置正是"锚点"那条契约的输入,所以这里
 * 按真机形状补两个只读属性.真机上的锚点行为仍然只在浏览器里验.
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

        // 挂载那一刻世界层先落在恒等视角上(属性由视口写,不是"没挂")
        expect(readTransform(world)).toEqual({ k: 1, x: 0, y: 0 });

        viewport.contentChanged(box(0, 0, 400, 200));

        const view = readTransform(world);
        // 400×200 装进 1000×800(上沿留 40 + 四周 48)不会被放大超过 1
        expect(view.k).toBe(RBT_FIT_MAX_ZOOM);
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

          余量给到 0.5px 是因为属性值被 `planeViewTransform` 按三位小数取整(那是刻意的:
          每帧都在写这个属性,长的浮点尾数既难看也难比对),而 k 的取整误差会被 worldX
          放大 -- 算术本身是精确的,见上面"以指针为锚缩放"那条纯函数用例.
        */
        expect(Math.abs(after.x + worldX * after.k - 500)).toBeLessThan(0.5);
    });

    it('手动挪过之后重绘不再抢视角;fitViewport() 回正把自动模式接回来', () => {
        const { host, world, viewport } = mountViewport();
        viewport.contentChanged(box(0, 0, 400, 200));
        const fitted = readTransform(world);

        // 用滚轮进入手动模式:滚轮缩放也是"用户挪过视角"的一种
        wheel(host, 500, 400, -100);
        const zoomed = readTransform(world);
        expect(zoomed.k).toBeGreaterThan(fitted.k);

        // 内容变了也不动:视角是用户的
        viewport.contentChanged(box(0, 0, 40, 40));
        expect(readTransform(world)).toEqual(zoomed);

        // 回正(句柄方法,按钮点击最终落到这里):回到自动模式,并按最近那块内容适应
        viewport.fitViewport();

        const refitted = readTransform(world);
        expect(refitted.k).toBe(RBT_FIT_MAX_ZOOM);
        expect(refitted.x).toBeCloseTo((1000 - 40) / 2, 6);
        expect(refitted.y).toBeCloseTo(40 + (800 - 40 - 40) / 2, 6);

        // 自动模式真的回来了:下一次重绘又会跟着内容走
        viewport.contentChanged(box(0, 0, 200, 200));
        expect(readTransform(world).x).toBeCloseTo((1000 - 200) / 2, 6);
    });

    it('连续两次左键按下不再被当成回正(双击判定与计时已删)', () => {
        const { host, world, viewport } = mountViewport();
        viewport.contentChanged(box(0, 0, 400, 200));
        wheel(host, 500, 400, -100);
        const zoomed = readTransform(world);

        /*
          两次完整的按下 / 松手,中间没有位移:它们只是两次单击(同步派发,间隔为 0,
          按旧的计时口径正好落在双击窗口里).没有位移,所以既不平移也不回正;
          `manual` 也不该被复位(下面那次重绘不动视角).
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
