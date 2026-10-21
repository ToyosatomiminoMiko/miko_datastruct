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
    VIEWER_DEMO_OUTLINE_WINDOW_ID,
    VIEWER_DEMO_OUTLINE_WINDOW_MIN_HEIGHT,
    VIEWER_DEMO_OUTLINE_WINDOW_MIN_WIDTH,
    VIEWER_DEMO_OUTLINE_WINDOW_TITLE,
    VIEWER_DEMO_OUTLINE_WINDOW_WIDTH,
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

          +1 是给目录窗口让位:两扇浮窗没有 z-order 状态机(不像 WindowManager 会
          在聚焦时提层),用户把控制窗口往上拖、压到目录上时,控制条应当留在最上层
          (目录是参考面板,不是操作入口).
        */
        zIndex: DEFAULT_DESKTOP_CONFIG.z.windowLayer * 10 + 1,
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

/** `createDemoOutlineWindow()` 的输入 */
export interface DemoOutlineWindowOptions {
    /** 库的窗口层:与控制窗口同一层,由 z-index 决定叠放 */
    readonly layer: HTMLElement;
    /** 正文节点:目录列表根元素 */
    readonly content: HTMLElement;
}

/** 目录窗口句柄:元素 + 显隐 + 拆卸 */
export interface DemoOutlineWindowHandle {
    readonly element: HTMLElement;
    readonly visible: boolean;
    /** 显示 / 隐藏;隐藏时同时置 inert,键盘 Tab 不会落进不可见窗口 */
    setVisible(visible: boolean): void;
    dispose(): void;
}

/**
 * 建一扇左侧「步骤」目录窗口:从任务栏下沿一直排到控制窗口上沿.
 *
 * 为什么是独立窗口而不是更长一条控制条:
 * - 控制窗口高度固定 180,纵向塞不进一份 57 步的目录;要强行塞就得把窗口拉高,
 *   而控制条与目录的刷新节奏不同(目录只在当前步变化时动),分开后各自可拖 / 可收;
 * - 目录是"讲解时的板书",演示中常常要一边看画布一边扫下一步:贴左列正好填上
 *   演示模式里被最小化的那三扇窗口让出的空位,中间画布不受影响.
 *
 * 几何:高度写成 `h: { from: 'bottom', inset: 控制窗高 + 两个间距 }` —— 底边落在
 * 控制窗口上方 16px,顶边从任务栏下沿 + 16px 起,与屏幕高度无关;桌面变矮时库的
 * `fitGeometry` 会把它整体夹回来,最小尺寸兜底.宽度可拖,纵向也可拖(目录行数固定,
 * 但用户可以按屏幕/字号调高矮).
 *
 * 显隐用库的 `.is-hidden`(opacity + pointer-events: none)而不是 `display: none`:
 * 与常驻窗口的最小化同一套观感;隐藏期间目录的滚动位置与高亮都保留,再打开接着看.
 * `inert` 另加,保证隐藏窗口里的按钮拿不到键盘焦点(只靠 opacity 是拿得到的).
 */
export function createDemoOutlineWindow(options: DemoOutlineWindowOptions): DemoOutlineWindowHandle {
    const windowHandle = mountFloatingWindow(options.layer, {
        id: VIEWER_DEMO_OUTLINE_WINDOW_ID,
        title: VIEWER_DEMO_OUTLINE_WINDOW_TITLE,
        geometry: {
            x: { at: VIEWER_DEMO_WINDOW_GAP },
            y: { at: VIEWER_DEMO_WINDOW_GAP },
            w: { at: VIEWER_DEMO_OUTLINE_WINDOW_WIDTH },
            h: {
                from: 'bottom',
                inset: VIEWER_DEMO_WINDOW_SIZE.h + VIEWER_DEMO_WINDOW_GAP * 2,
            },
        },
        minSize: {
            w: VIEWER_DEMO_OUTLINE_WINDOW_MIN_WIDTH,
            h: VIEWER_DEMO_OUTLINE_WINDOW_MIN_HEIGHT,
        },
        resize: 'both',
        content: [options.content],
        // 与演示控制窗口一样没有 min / max:它随演示会话现建现拆
        controls: [],
        // 比控制窗口低一层(见 createDemoWindow 的 +1):控制条永远压得住目录
        zIndex: DEFAULT_DESKTOP_CONFIG.z.windowLayer * 10,
        /*
          目录窗口不该抢走控制窗口的聚焦态:它是常驻在旁边的参考面板,不是用户刚
          操作的那扇窗.不接管 focus,标题栏拖动 / 缩放照常可用(那两条不依赖聚焦).
        */
        focus: false,
    });
    const element = windowHandle.element;
    element.classList.add('demo-outline-window');

    let visible = true;
    const setVisible = (next: boolean): void => {
        visible = next;
        element.classList.toggle('is-hidden', !next);
        element.inert = !next;
    };

    return {
        element,
        get visible(): boolean {
            return visible;
        },
        setVisible,
        dispose(): void {
            windowHandle.dispose();
        },
    };
}
