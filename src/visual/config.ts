// 视觉层的声明式配置:类名契约 + 平面 / 视口的数值参数.
//
// 这一层只认识"怎么画",不认识任何数据结构:哪个形状代表什么语义(红黑、已访问、空)
// 由使用它的结构(ui/<结构>/)决定,颜色等观感也落在那个结构的样式表里.
//
// 类名是**跨语言契约**:visual/surface.ts 与 visual/render.ts 产出它们,src/visual/visual.css
// 命中它们,测试按它们断言;改名要三处一起改(没有编译期保护).

// 平面上的三层容器(视口 -> 绘制面 -> 世界层)
//
// 这三层各只有一件事,谁都不能少:
// - 视口:裁切 + 收指针手势(拖动 / 滚轮);
// - 绘制面:1:1 的像素面(没有 viewBox,一个用户单位 = 一个 CSS 像素),就是那块 `<svg>`;
// - 世界层:场景的父节点,视口只改这一层的 transform.

/** 视口元素的类名(裁切 / 光标 / 手势归它) */
export const VISUAL_VIEWPORT_CLASS = 'visual-viewport';

/** 绘制面 `<svg>` 的类名(显示尺寸 / 裁切归它) */
export const VISUAL_SURFACE_CLASS = 'visual-surface';

/**
 * 世界层 `<g>` 的类名:场景里所有元素都挂在这一层,视口只改它的 transform.
 *
 * 样式表对它**没有规则**,这是刻意的:它是纯坐标层,不承载观感.
 */
export const VISUAL_WORLD_CLASS = 'visual-world';

// 场景里的图元:节点 / 连线
//
// 节点 = 一个组(位置在组的 transform 上)+ 形状 + 值文字;连线 = 一条线段,有向的
// 指针再在终点加一个箭头.
// 语义差异走**变体类**:节点组上再挂 `visual-node--<variant>`,由结构自己的样式
// 决定这个变体长什么样(例如红黑树的 red / black).

/** 一个节点的组(位置在它的 `transform` 上;形状与值文字是它的两个孩子) */
export const VISUAL_NODE_CLASS = 'visual-node';

/** 节点形状的类名(当前是圆:半径 / 填充 / 进入动画都在它上面) */
export const VISUAL_NODE_SHAPE_CLASS = 'visual-node__shape';

/** 节点值文字的类名(字体 / 字号 / 对齐 / 文字色) */
export const VISUAL_NODE_LABEL_CLASS = 'visual-node__label';

/**
 * 节点半径(px).几何量,由 TS 持有:渲染层用它写 `<circle r>`,布局用它把连线端点
 * 收进圆边界.颜色 / 填充 / 动画仍归 visual.css 与 tokens.css.
 */
export const VISUAL_NODE_RADIUS = 22;

/** 一条连线(有向指针 / 无向边)的线段类名 */
export const VISUAL_LINK_CLASS = 'visual-link';

/** 连线变体类:有向指针(线段终点带箭头) */
export const VISUAL_LINK_POINTER_CLASS = 'visual-link--pointer';

/** 连线变体类:无向边(只有线段,没有箭头) */
export const VISUAL_LINK_EDGE_CLASS = 'visual-link--edge';

/** 有向指针终点的箭头三角形类名 */
export const VISUAL_POINTER_ARROW_CLASS = 'visual-pointer-arrow';

/** 连线端点与节点圆之间的空隙(px):箭头尖不贴着圆 */
export const VISUAL_LINK_NODE_GAP = 4;

/**
 * 同一对节点之间有多条连线时的分道间距(px).
 *
 * 平行边(如柯尼斯堡七桥的 K-N ×2)与反向指针(a->b 且 b->a)都会落在同一条直线上:
 * 按无向节点对分组后给每条连线一个横向偏移,左右对称排开,两条箭头不会叠在一起.
 */
export const VISUAL_LINK_LANE_GAP = 14;

/** 有向指针箭头的长度(px,沿连线方向) */
export const VISUAL_ARROW_LENGTH = 10;

/** 有向指针箭头的半宽(px,垂直连线方向;底边总宽 = 2 倍) */
export const VISUAL_ARROW_HALF_WIDTH = 5;

/**
 * 节点的语义变体类名:`visualNodeVariantClass('red')` -> `visual-node--red`.
 *
 * `variant` 是 CSS 类名后缀,只收小写字母 / 数字 / 连字符这种安全字符;变体本身是什么
 * 意思(红节点 / 当前节点 / 已删除)由结构定义,视觉层不解释.
 */
export function visualNodeVariantClass(variant: string): string {
    return `${VISUAL_NODE_CLASS}--${variant}`;
}

// 平面与视口(世界坐标 -> 屏幕像素)
//
// 布局算出来的坐标就是平面坐标(单位 = 屏幕像素 @ k=1);世界坐标是内容自己的坐标,
// 与"桌面多大"无关,所以平面是无限大的(裁剪由视口给).这些参数描述的是**取景**,不是
// 任何一种数据结构:所有结构共用同一个平面视口.

/** 适应视口时内容四周的留白(px,屏幕像素):内容不贴着视口边缘 */
export const VISUAL_PLANE_FIT_PADDING = 48;

/**
 * 自动适应(fit)时允许的最大缩放:1 = 不放大.
 *
 * 小图(三个节点)的包围盒比视口小得多,不设上限的话首屏会被吹成一屏大的几个圆.
 * 1:1 是这类结构图最自然的默认观感.
 *
 * 已知的坑:窗口是浮在平面上的,适应算不进窗口,所以"装得下"不等于"看得见" --
 * 放大到填满时,左右两端的元素会钻到窗口底下;1:1 反而让整幅图落在窗口之间那条
 * 可见带上.要看大就自己滚轮放大(手动缩放见 VISUAL_MIN_ZOOM / VISUAL_MAX_ZOOM).
 */
export const VISUAL_FIT_MAX_ZOOM = 1;

/** 手动缩放的上下限:下限够看很深的树(256 片叶子 ≈ 0.08),上限够盯一个节点 */
export const VISUAL_MIN_ZOOM = 0.05;
export const VISUAL_MAX_ZOOM = 4;

/**
 * 滚轮灵敏度:像素 delta 每 1px,缩放 `e^(-delta × 这个值)` 倍.
 *
 * 用指数而不是加法:缩放是**乘性**的,同样一格滚轮在 0.1 与 2 两档下该放大同样的
 * 比例(加法在 0.1 档下一格跳一大截,在 2 档下几乎不动).0.0015 让一格 100px 的
 * 滚轮 ≈ 1.16 倍.
 */
export const VISUAL_WHEEL_ZOOM_SENSITIVITY = 0.0015;

/**
 * wheel 事件的 deltaMode 归一化:把"行 / 页"折算成像素.
 *
 * 为什么必须折:同一个滚轮在 Chrome 上是 `deltaMode = 0`(像素,一格约 100),在
 * Firefox 上是 `deltaMode = 1`(行,一格 3) -- 不折的话 Firefox 上一格只放大
 * 0.5%,等于不响应.两个数按各自的常见约定取值,不追求精确,只求量级一致.
 */
export const VISUAL_WHEEL_LINE_PIXELS = 16;
export const VISUAL_WHEEL_PAGE_PIXELS = 800;

// 中性场景的自动布局(见 visual/layout.ts)
//
// 布局回答"节点彼此别撞、连线怎么从圆边出发":节点半径用 VISUAL_NODE_RADIUS,
// 内容实际多大仍由渲染后 `getBBox()` 量.这些数只影响首屏观感,用户可以自己缩放,
// 不追求像素级最优.

/** 树形布局:相邻两层的垂直步长(px) */
export const VISUAL_LAYOUT_TREE_LAYER_STEP = 70;

/**
 * 树形布局:同层相邻节点的最小中心距(px).
 *
 * 必须大于圆的直径(`2 * VISUAL_NODE_RADIUS`):两个圆不能叠在一起.与层距同值是
 * "横竖留白一致"的默认观感.
 */
export const VISUAL_LAYOUT_TREE_MIN_GAP = 70;

/** 多个连通分量并排时,分量之间的水平间隙(px) */
export const VISUAL_LAYOUT_COMPONENT_GAP = 120;

/** 环形布局:最少半径(px),节点很少时圆不至于缩成一个点 */
export const VISUAL_LAYOUT_GRAPH_MIN_RADIUS = 110;

/** 环形布局:圆周长上每个节点占的弧长(px),节点越多圆越大 */
export const VISUAL_LAYOUT_GRAPH_CHORD = 110;

/**
 * 「定位」时的最小缩放下限:1 = 世界单位与屏幕像素 1:1.
 *
 * 整幅图很大时自动适应会把 k 压得很小(例如 0.2),定位到某个节点时按当时的 k
 * 移过去,节点仍然只有几个像素.这里给一个"至少要能看清节点值"的下限:比它小的
 * 视角在定位时抬到 0.8,比它大的保持用户自己的缩放(不打断手动放大).
 */
export const VISUAL_FOCUS_MIN_ZOOM = 0.8;
