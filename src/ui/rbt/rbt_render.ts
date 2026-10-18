/*
把布局结果**落成 SVG**:每个节点一个 `<g>`(位置写在组的 `transform` 上,圆与节点值
是它的两个孩子),每条父子连线一个 `<line>`.

这一层只管"建元素":坐标由 ui/rbt/rbt_layout.ts 的 `RbtTreeLayout` 给,视口的缩放由整层
世界层 `<g class="rbt-world">` 的 `transform` 表达(见 ui/rbt/rbt_viewport.ts),所以这里
一个坐标都不用换算 -- 布局坐标就是世界坐标.

**内容实际占多大也在这里量**(2026-10 删掉布局里的包围盒):`drawTree` 落笔之后向
浏览器要世界层的 `getBBox()`,交回 `RbtPlaneBox` 给视口适应.为什么不让布局算:
布局要算包围盒就得知道圆半径,于是半径同时长在 TS 与 CSS 两处、必须手抄相等;而
`getBBox()` 是浏览器按**真实渲染结果**算的(圆的 CSS 半径、节点值文字的宽度都算进去),
既省掉那条跨语言契约,量出来的也比"坐标 ± 半径"更准.代价是 `getBBox()` 会同步算一次
布局(浏览器得先把刚插进来的元素排出来);节点数很少、输入又是低频路径,可以忽略.

为什么与布局分开:布局只管算坐标(纯数字),渲染只管落笔(要 DOM).删掉 / 换掉一种画法
时两边互不牵连.每轮输入都整批重建世界层的子节点(节点数很少,不走增量复用),于是
不必维护"哪个元素对应哪个节点"的映射表,也不会留下陈旧节点.

颜色只给类名(`.rbt-node--red` / `--black`),不给 fill / stroke:观感全在 CSS,换配色
不用碰 TS(类名契约见 config.ts 的"节点与连线"一节).
*/
import { childNodes, create_svg_element } from 'miko_ui';
import {
    RBT_EDGE_CLASS,
    RBT_NODE_BLACK_CLASS,
    RBT_NODE_CLASS,
    RBT_NODE_LABEL_CLASS,
    RBT_NODE_RED_CLASS,
    RBT_NODE_SHAPE_CLASS,
} from '@/ui/rbt/config';
import type { RbtPlacedEdge, RbtPlacedNode, RbtTreeLayout } from '@/ui/rbt/rbt_layout';
import type { RbtPlaneBox } from '@/ui/rbt/rbt_viewport';

/** 一个节点组:位置 + 颜色修饰类 + 圆 + 节点值 */
function createNodeElement(placed: RbtPlacedNode): SVGGElement {
    const { node, x, y } = placed;
    return create_svg_element(
        { tag: 'g' },
        {
            class: `${RBT_NODE_CLASS} ${node.color === 'R' ? RBT_NODE_RED_CLASS : RBT_NODE_BLACK_CLASS}`,
            transform: `translate(${x},${y})`,
        },
        create_svg_element({ tag: 'circle' }, { class: RBT_NODE_SHAPE_CLASS }),
        create_svg_element({ tag: 'text' }, { class: RBT_NODE_LABEL_CLASS }, node.value),
    );
}

/** 一条父子连线(`x1/y1` 是父节点,`x2/y2` 是子节点) */
function createEdgeElement(edge: RbtPlacedEdge): SVGLineElement {
    return create_svg_element(
        { tag: 'line' },
        {
            class: RBT_EDGE_CLASS,
            x1: String(edge.from.x),
            y1: String(edge.from.y),
            x2: String(edge.to.x),
            y2: String(edge.to.y),
        },
    );
}

/**
 * 向浏览器要世界层的实际包围盒,换成平面坐标里的矩形.
 *
 * 量不出来(宽或高不是正数)就交回 null,调用方据此**不**去动视角:
 * - happy-dom 没有排版,`getBBox()` 恒为空矩形(见它的 SVGGraphicsElement 实现),
 *   于是行为测试里世界层停在恒等视角 -- 这一层的契约是"量不到就别猜",不是猜一个;
 * - 真实浏览器里画完立刻量一定是正数(SVG 是同步布局),null 只可能出现在测试环境.
 *
 * `getBBox()` 量的是**世界层自己的用户坐标系**:它自己的 `transform`(视口写的平移 +
 * 缩放)不算进去,所以量到的正好是布局坐标,不需要再除 k.
 *
 * 已知偏差(有意的取舍):节点有 220ms 入场动画(`scale(0.9) -> 1`),画完**立刻**量会
 * 把每个圆按 0.9 算进去(实测三节点树量到 109.6,静止后是 114).偏差对内容中心对称,
 * 所以居中不受影响;自动适应上线是 1 倍(只缩不放),最坏的情况也就是按小了 0.4% 的
 * 内容算比例,落在 48px 的留白里,看不出来.要"动画结束后的精确几何"就得等 220ms 再量,
 * 那会让首屏先闪一下错误的缩放,不值得.
 */
function measureWorldBounds(world: SVGGElement): RbtPlaneBox | null {
    const box = world.getBBox();
    if (!(box.width > 0) || !(box.height > 0)) return null;
    return { minX: box.x, minY: box.y, width: box.width, height: box.height };
}

/**
 * 画一棵树:整批重建**世界层**的子节点(先连线,后节点 -- 节点盖在线上),再把量到的
 * 实际包围盒交给调用方(给视口适应).
 *
 * 不另包一层"图层" `<g>`:节点本来就带 `.rbt-node`,连线带 `.rbt-edge`,样式与冒烟
 * 脚本都按类名命中,再套一层只是多一个不起作用的元素;世界层是唯一必要的那一层
 * (视口要长期改它的 transform,见 ui/rbt/rbt_viewport.ts).
 *
 * 子节点走库的 `childNodes()`(与 `replaceChildren` 同一套"字符串落成文本节点,假值
 * 跳过"的规则),不自己拼 innerHTML.
 */
export function drawTree(world: SVGGElement, layout: RbtTreeLayout): RbtPlaneBox | null {
    const edges = layout.edges.map(createEdgeElement);
    const nodes = layout.nodes.map(createNodeElement);
    world.replaceChildren(...childNodes([...edges, ...nodes], world));
    return measureWorldBounds(world);
}

/** 清空世界层:一颗节点 / 一条线都不留(输入为空 / 空树 / 解析失败三种情况) */
export function clearTree(world: SVGGElement): void {
    world.replaceChildren();
}
