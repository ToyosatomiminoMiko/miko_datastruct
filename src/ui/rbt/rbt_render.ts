/*
把布局结果落成 SVG:每个节点一个 `<g>`(位置在组的 `transform` 上,圆与节点值是它的两个
孩子),每条父子连线一个 `<line>`;坐标直接用布局交回的世界坐标,视口缩放改的是世界层的
`transform`.

内容实际占多大在这里量:落笔后向浏览器要 `getBBox()`.让浏览器量而不是让布局算,是为了
不必知道圆的半径(否则 TS 与 CSS 两处半径必须手抄相等),量到的也是真实渲染结果.

颜色只给类名(`.rbt-node--red` / `--black`),不给 fill / stroke:观感全在 CSS.
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
 * 量不出来(宽或高不是正数)就交回 null,调用方据此不去动视角:
 * - happy-dom 没有排版,`getBBox()` 恒为空矩形,于是行为测试里世界层停在恒等视角 --
 *   这一层的契约是"量不到就别猜";
 * - 真实浏览器里画完立刻量一定是正数(SVG 是同步布局).
 *
 * `getBBox()` 量的是世界层自己的用户坐标系:它自己的 `transform`(视口写的平移 + 缩放)
 * 不算进去,所以量到的正好是布局坐标,不需要再除 k.
 *
 * 已知偏差(有意的取舍):节点有 220ms 入场动画(`scale(0.9) -> 1`),画完立刻量会把每个
 * 圆按 0.9 算进去(实测三节点树量到 109.6,静止后是 114).偏差对内容中心对称,所以居中
 * 不受影响;自动适应上线是 1 倍(只缩不放),最坏也就是按小了 0.4% 的内容算比例,落在
 * 48px 的留白里看不出来.等 220ms 再量能让几何精确,但首屏会先闪一下错误的缩放.
 */
function measureWorldBounds(world: SVGGElement): RbtPlaneBox | null {
    const box = world.getBBox();
    if (!(box.width > 0) || !(box.height > 0)) return null;
    return { minX: box.x, minY: box.y, width: box.width, height: box.height };
}

/**
 * 画一棵树:整批重建世界层的子节点(先连线,后节点 -- 节点盖在线上),再把量到的实际
 * 包围盒交给调用方(给视口适应).
 *
 * 不另包一层"图层" `<g>`:节点带 `.rbt-node`、连线带 `.rbt-edge`,样式与冒烟脚本都按
 * 类名命中;世界层是唯一必要的那一层,视口要长期改它的 transform.
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
