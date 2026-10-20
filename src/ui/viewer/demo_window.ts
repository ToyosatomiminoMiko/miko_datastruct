/*
 * 演示控制窗口:一扇**不进桌面窗口清单**的独立浮窗.
 *
 * 为什么不用 `mountDesktop` 的窗口清单:演示窗口只在演示模式存在,不该进任务栏,
 * 也不该参与「全部还原」/ 最小化状态机 -- 它是模式级控件.库的
 * `mountFloatingWindow` 正好覆盖这类临时窗口:建壳、标题栏拖动、按轴缩放、夹进
 * 桌面、聚焦,全部由库接线,消费者只声明几何与轴.
 *
 * 尺寸:**高度固定,宽度可拖**.`resize: 'horizontal'` 让库只建东 / 西两根手柄;
 * 纵向没有缩放入口,`minSize.h` 与初始高度相同,库会把固定轴钉在初始尺寸上,
 * 浏览器窗口变化时的 `fitGeometry` 也不会改高度.没有 min / max 按钮,也没有
 * 标题栏双击最大化(浮窗没有窗口管理器的状态机).
 */
import {
    DEFAULT_DESKTOP_CONFIG,
    mountFloatingWindow,
    type AbsoluteGeometry,
} from 'miko_ui';
import {
    VIEWER_DEMO_WINDOW_DOCK_SLOP,
    VIEWER_DEMO_WINDOW_GAP,
    VIEWER_DEMO_WINDOW_ID,
    VIEWER_DEMO_WINDOW_MIN_WIDTH,
    VIEWER_DEMO_WINDOW_SIZE,
} from '@/ui/viewer/config';

/** `createDemoWindow()` 的输入 */
export interface DemoWindowOptions {
    /** 库的窗口层:演示窗口与常驻窗口同一层,叠放顺序由 z-index 给 */
    readonly layer: HTMLElement;
    /** 标题栏文案 */
    readonly title: string;
    /** 正文节点:演示条根元素 */
    readonly content: HTMLElement;
    /**
     * 几何变化时上报(创建完成 / 拖动松手 / 浏览器窗口尺寸变化).
     *
     * 镜头用它决定底部避让带:窗口贴底时扣掉它的高度,拖到画布中间就不扣
     * (见 viewer.ts 的 `applyDemoInsets`).
     */
    readonly onGeometryChange?: (geometry: AbsoluteGeometry) => void;
}

/** 演示控制窗口句柄:元素 + 当前几何 + 拆卸 */
export interface DemoWindowHandle {
    readonly element: HTMLElement;
    /** 当前几何(只读快照;拖动中会变,读完即用) */
    readonly geometry: AbsoluteGeometry;
    dispose(): void;
}

/**
 * 建一扇演示控制窗口:高度固定、横向可拖宽,初始贴桌面左下,标题栏可拖.
 *
 * 初始几何写成锚点而不是手算 y:贴底由 `{ from: 'bottom', inset }` 表达,桌面
 * 尺寸在库内部量,这里不需要先读一次 `clientHeight` 再减窗口高.
 */
export function createDemoWindow(options: DemoWindowOptions): DemoWindowHandle {
    const windowHandle = mountFloatingWindow(options.layer, {
        id: VIEWER_DEMO_WINDOW_ID,
        title: options.title,
        geometry: {
            x: { at: VIEWER_DEMO_WINDOW_GAP },
            y: { from: 'bottom', inset: VIEWER_DEMO_WINDOW_GAP },
            w: { at: VIEWER_DEMO_WINDOW_SIZE.w },
            h: { at: VIEWER_DEMO_WINDOW_SIZE.h },
        },
        minSize: { w: VIEWER_DEMO_WINDOW_MIN_WIDTH, h: VIEWER_DEMO_WINDOW_SIZE.h },
        resize: 'horizontal',
        content: [options.content],
        // 没有 min / max:大小固定是这扇窗的定义的一部分,不是状态.
        controls: [],
        /*
          窗口层在 DEFAULT_DESKTOP_CONFIG 里 z=100,Dock 是 200;层内的 z-index 不会
          越过层的层叠上下文,所以这里取一个远高于窗口管理器起始号的常数就够了 --
          演示窗口不该被演示中唯一保留的「检查」窗口盖住.
        */
        zIndex: DEFAULT_DESKTOP_CONFIG.z.windowLayer * 10,
        onGeometryChange: options.onGeometryChange,
    });
    windowHandle.element.classList.add('demo-window');

    return {
        element: windowHandle.element,
        get geometry(): AbsoluteGeometry {
            return windowHandle.geometry;
        },
        dispose(): void {
            windowHandle.dispose();
        },
    };
}

/** 判定窗口是否还停在桌面下沿(镜头底部避让带只在贴底时生效) */
export function demoWindowDocked(geometry: AbsoluteGeometry, desktopHeight: number): boolean {
    return desktopHeight > 0
        && geometry.y + geometry.h >= desktopHeight - VIEWER_DEMO_WINDOW_GAP - VIEWER_DEMO_WINDOW_DOCK_SLOP;
}
