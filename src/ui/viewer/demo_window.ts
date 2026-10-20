/*
 * 演示控制窗口:库的窗口外壳(`createWindowFrame`)+ 本项目的拖动 / 横向缩放接线.
 *
 * 为什么不用 `mountDesktop` 的窗口清单:演示窗口**只在演示模式存在**,不该进任务栏,
 * 也不该参与「全部还原」/ 最小化状态机 -- 它是模式级控件.用库公开的
 * `createWindowFrame` 建壳、`bindDragGesture` / `bindWindowResize` 接交互,就不必给
 * 桌面配置加一扇常驻窗口,也不必改库.
 *
 * 尺寸:**高度固定,宽度可拖**.只保留东 / 西两根缩放手柄(纵向没有手柄),也不给
 * min / max 控制按钮;库的 `WindowManager` 会额外接"双击标题栏最大化",这里没有
 * 管理器,自然没有那条路.
 *
 * 几何规则不另写一份:平移 / 缩放 / 夹取 / 初始收位都用库的 `moveGeometry` /
 * `resizeGeometry` / `fitGeometry` / `writeGeometry`,常量取
 * `DEFAULT_DESKTOP_CONFIG` 与 config.ts 的演示窗口尺寸.
 */
import {
    DEFAULT_DESKTOP_CONFIG,
    bindDragGesture,
    bindWindowResize,
    createWindowFrame,
    fitGeometry,
    moveGeometry,
    resizeGeometry,
    writeGeometry,
    type AbsoluteGeometry,
    type Desktop,
    type Limits,
} from 'miko_ui';
import {
    VIEWER_DEMO_WINDOW_DOCK_SLOP,
    VIEWER_DEMO_WINDOW_GAP,
    VIEWER_DEMO_WINDOW_ID,
    VIEWER_DEMO_WINDOW_MIN_WIDTH,
    VIEWER_DEMO_WINDOW_SIZE,
    VIEWER_DESKTOP_INSET,
} from '@/ui/viewer/config';

/** `createDemoWindow()` 的输入 */
export interface DemoWindowOptions {
    /** 桌面根:窗口坐标与尺寸的参照(窗口层铺满它) */
    readonly host: HTMLElement;
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
 * 量桌面尺寸:与库的 `WindowManager._measureDesktop` 同口径.
 *
 * `dockReserve` 让窗口的 y 从任务栏下沿起算;`edgeGap` 是默认几何的底边余量.
 */
function measureDesktop(host: HTMLElement): Desktop {
    return {
        w: host.clientWidth,
        h: host.clientHeight,
        dockReserve: DEFAULT_DESKTOP_CONFIG.dockReserve,
        edgeGap: VIEWER_DESKTOP_INSET,
    };
}

/** 夹取上下文:高度固定,宽度只有一个下限(上限由桌面宽给) */
function limitsOf(desktop: Desktop): Limits {
    return {
        desktop,
        min: { w: VIEWER_DEMO_WINDOW_MIN_WIDTH, h: VIEWER_DEMO_WINDOW_SIZE.h },
        edgeKeep: DEFAULT_DESKTOP_CONFIG.edgeKeep,
        headerMinVisible: DEFAULT_DESKTOP_CONFIG.headerMinVisible,
    };
}

/**
 * 建一扇演示控制窗口:高度固定、横向可拖宽,初始贴桌面左下,标题栏可拖.
 *
 * 窗口挂进 `layer` 而不是 `host` 的直接子节点:窗口层是库给窗口准备的定位上下文,
 * 常驻窗口都在里面,叠放顺序与 z 值只在同一层里比较.
 */
export function createDemoWindow(options: DemoWindowOptions): DemoWindowHandle {
    const { host, layer } = options;
    const abort = new AbortController();

    /*
      桌面尺寸只在创建与浏览器 resize 时量一次:拖动每帧都会写几何,下一帧再读
      clientWidth/Height 会强制重排(窗口是绝对定位,尺寸本身没变,这次读纯属浪费).
    */
    let desktop = measureDesktop(host);
    const limits = (): Limits => limitsOf(desktop);

    /** 按当前桌面尺寸把几何收进合法区(初始位置 / 拖动松手 / 视口变小共用) */
    const fit = (geometry: AbsoluteGeometry): AbsoluteGeometry => fitGeometry(geometry, limits());

    const initial = fit({
        x: VIEWER_DEMO_WINDOW_GAP,
        // 贴左下:窗口底边离桌面下沿一条 gap(窗口要等 h 算完才知道 y)
        y: desktop.h - VIEWER_DEMO_WINDOW_SIZE.h - VIEWER_DEMO_WINDOW_GAP,
        w: VIEWER_DEMO_WINDOW_SIZE.w,
        h: VIEWER_DEMO_WINDOW_SIZE.h,
    });

    const frame = createWindowFrame({
        id: VIEWER_DEMO_WINDOW_ID,
        title: options.title,
        slots: {},
        // 没有 min / max:大小固定是这扇窗的定义的一部分,不是状态
        controls: [],
        geometry: initial,
    });
    frame.element.classList.add('demo-window');
    /*
      窗口层在 DEFAULT_DESKTOP_CONFIG 里 z=100,Dock 是 200;层内的 z-index 不会
      越过层的层叠上下文,所以这里取一个远高于窗口管理器起始号的常数就够了 --
      演示窗口不该被演示中唯一保留的「检查」窗口盖住.
    */
    frame.element.style.zIndex = String(DEFAULT_DESKTOP_CONFIG.z.windowLayer * 10);

    /*
      尺寸:高度固定、宽度可拖.八根手柄只留东 / 西两根,其余摘掉 -- 纵向没有
      缩放入口,双击标题栏也没有最大化(这里没有 WindowManager).
    */
    const horizontalHandles = frame.handles.filter(
        (handle) => handle.direction === 'e' || handle.direction === 'w',
    );
    for (const handle of frame.handles) {
        if (handle.direction !== 'e' && handle.direction !== 'w') handle.element.remove();
    }
    frame.body.append(options.content);
    layer.append(frame.element);

    // 当前几何(唯一真相源;拖动中逐帧更新,DOM 只是它的投影)
    let geometry = initial;

    const commit = (next: AbsoluteGeometry): void => {
        geometry = next;
        writeGeometry(frame.element, geometry);
    };

    // 点窗口任意处把焦点描边挪过来:库的管理器只认它自己的窗口,这里补一版
    frame.element.addEventListener('pointerdown', () => {
        for (const focused of layer.querySelectorAll('.window.is-focused')) {
            focused.classList.remove('is-focused');
        }
        frame.element.classList.add('is-focused');
    }, { signal: abort.signal });

    // 点到窗口外面(例如去操作「检查」窗口)时摘掉本窗口的聚焦描边.
    // 用捕获阶段:库的窗口监听在自己的元素上,冒泡到这里时两边都会亮.
    host.ownerDocument.addEventListener('pointerdown', (event) => {
        const target = event.target;
        if (target instanceof Node && frame.element.contains(target)) return;
        frame.element.classList.remove('is-focused');
    }, { capture: true, signal: abort.signal });

    /*
      标题栏拖动:整体平移.增量交给库的 `moveGeometry`(拖动中的夹取规则与常驻窗口
      同一份:允许挂出桌面边缘);松手时再用 `fitGeometry` 整体收进桌面,免得窗口
      一半在视口外、标题栏抓不回来.取消 / 解绑不落地几何:下次进入演示会重新建一扇.
    */
    bindDragGesture(frame.title, abort.signal, {
        onStart: () => {
            frame.element.classList.add('is-dragging');
        },
        onDelta: (deltaX, deltaY) => {
            commit(moveGeometry(geometry, deltaX, deltaY, limits()));
        },
        onEnd: (reason) => {
            frame.element.classList.remove('is-dragging');
            if (reason !== 'pointerup') return;
            commit(fit(geometry));
            options.onGeometryChange?.(geometry);
        },
    });

    // 桌面尺寸变化:先重量尺寸,再把窗口整体收回来;镜头避让带跟着重算
    host.ownerDocument.defaultView?.addEventListener('resize', () => {
        desktop = measureDesktop(host);
        commit(fit(geometry));
        options.onGeometryChange?.(geometry);
    }, { signal: abort.signal });

    /*
      横向缩放:只有东 / 西两根手柄.几何解释与夹取走库的 `resizeGeometry`(按指针
      相对起手的总位移,不是增量);高度在 limits 里被钉死,所以这条手势只能改宽度.
      收尾与拖动一致:整体收进桌面,并上报一次几何.
    */
    for (const handle of horizontalHandles) {
        let anchor: AbsoluteGeometry | null = null;
        let fromX = 0;
        bindWindowResize(handle.element, abort.signal, handle.direction, {
            onStart: (event) => {
                anchor = geometry;
                fromX = event.clientX;
                frame.element.classList.add('is-dragging');
            },
            onResize: (direction, pointer) => {
                if (anchor === null) return;
                commit(resizeGeometry(anchor, direction, pointer.x - fromX, 0, limits()));
            },
            onEnd: () => {
                anchor = null;
                frame.element.classList.remove('is-dragging');
                commit(fit(geometry));
                options.onGeometryChange?.(geometry);
            },
        });
    }

    options.onGeometryChange?.(geometry);

    return {
        element: frame.element,
        get geometry(): AbsoluteGeometry {
            return geometry;
        },
        dispose(): void {
            abort.abort();
            frame.dispose();
        },
    };
}

/** 判定窗口是否还停在桌面下沿(镜头底部避让带只在贴底时生效) */
export function demoWindowDocked(geometry: AbsoluteGeometry, desktopHeight: number): boolean {
    return desktopHeight > 0
        && geometry.y + geometry.h >= desktopHeight - VIEWER_DEMO_WINDOW_GAP - VIEWER_DEMO_WINDOW_DOCK_SLOP;
}
