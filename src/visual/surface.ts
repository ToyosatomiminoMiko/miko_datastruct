/*
 * 平面**绘制面**的标记:一幅结构图在 DOM 上固定是三层(`visual/viewport.ts` 与
 * `visual/render.ts` 都按这个形状找节点):
 *
 *     div.visual-viewport         铺满宿主、裁切、收指针手势
 *     └─ svg.visual-surface       1:1 的像素面(没有 viewBox,一个用户单位 = 一个 CSS 像素)
 *        └─ g.visual-world        场景的父节点,视口只改这一层的 transform
 *
 * **没有 HTML `<canvas>`**:节点 / 指针都是 SVG 命名空间里的文档元素,命中检测、CSS、
 * 可访问性都由浏览器按 DOM 给.这里叫"绘制面"(surface)是为了避开 `canvas` 在 Web 里
 * 特指 `<canvas>` 元素的歧义;它就是那块 `<svg>`.
 *
 * 这个模块只**建标记**,不挂行为(拖动 / 缩放 / 落笔各归各的模块):纯函数式装配,
 * 挂载前就能拿去做标记契约测试.
 *
 * 两个 id 由调用方给:同一页可能有不止一幅图,而 id 是那个结构的 DOM 契约(样式 / 测试
 * 按它定位),不属于视觉层.`svgLabel` 是读屏标签,也是调用方的可见文案.
 */
import { create_element, create_svg_element } from 'miko_ui';
import {
    VISUAL_SURFACE_CLASS,
    VISUAL_VIEWPORT_CLASS,
    VISUAL_WORLD_CLASS,
} from '@/visual/config';

/** `createVisualSurface()` 的输入 */
export interface VisualSurfaceOptions {
    /** 视口元素的 id(调用方的 DOM 契约) */
    readonly viewportId: string;
    /** 绘制面 `<svg>` 的 id(调用方的 DOM 契约) */
    readonly svgId: string;
    /** 绘制面的读屏标签(这块图是什么) */
    readonly svgLabel: string;
    /**
     * 视口上额外要挂的类名(空格分隔),由调用方决定.
     *
     * 例:挂在桌面背景上的图,视口要加库的 `desktop-background`(定位与底色归库),
     * 视觉层不替调用方假设"图一定长在桌面上".
     */
    readonly viewportClass?: string;
}

/** 一幅平面绘制面的三层元素 */
export interface VisualSurface {
    /** 视口(交给 `mountPlaneViewport` 当宿主) */
    readonly viewport: HTMLElement;
    /** 绘制面 `<svg>`(只建一次,显示尺寸由 CSS 给) */
    readonly svg: SVGSVGElement;
    /** 世界层 `<g>`(空着建出来,每轮画什么由 `renderScene` 给) */
    readonly world: SVGGElement;
}

/**
 * 建一幅平面绘制面的标记.
 *
 * `<svg>` **没有 viewBox 也没有 width / height 属性**:一个用户单位就是一个 CSS 像素,
 * 世界坐标 -> 屏幕的缩放只由世界层 transform 表达;组件的尺寸由 CSS 的 `100%` 给.
 * `role` / `aria-label` 挂在 `<svg>` 上:视口是可交互的(拖动 / 缩放),读屏该说清
 * "这里是什么".
 */
export function createVisualSurface(options: VisualSurfaceOptions): VisualSurface {
    const world = create_svg_element({ tag: 'g' }, { class: VISUAL_WORLD_CLASS });
    const svg = create_svg_element(
        { tag: 'svg' },
        {
            id: options.svgId,
            class: VISUAL_SURFACE_CLASS,
            role: 'img',
            'aria-label': options.svgLabel,
        },
        world,
    );

    const viewportClasses = options.viewportClass === undefined
        ? VISUAL_VIEWPORT_CLASS
        : `${VISUAL_VIEWPORT_CLASS} ${options.viewportClass}`;
    const viewport = create_element(
        { tag: 'div' },
        { id: options.viewportId, class: viewportClasses },
        svg,
    );

    return { viewport, svg, world };
}
