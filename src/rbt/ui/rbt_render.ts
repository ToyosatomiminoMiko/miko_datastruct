/*
把布局结果**落成 SVG**:每个节点一个 `<g>`(位置写在组的 `transform` 上,圆与节点值
是它的两个孩子),每条父子连线一个 `<line>`.

这一层只管"建元素":坐标由 ui/rbt_layout.ts 的 `RbtTreeLayout` 给,视口的缩放由整层
世界层 `<g class="rbt-world">` 的 `transform` 表达(见 ui/rbt_viewport.ts),所以这里
一个坐标都不用换算 -- 布局坐标就是世界坐标.

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
} from '@/rbt/config';
import type { RbtPlacedEdge, RbtPlacedNode, RbtTreeLayout } from '@/rbt/ui/rbt_layout';

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
 * 画一棵树:整批重建**世界层**的子节点(先连线,后节点 -- 节点盖在线上).
 *
 * 不另包一层"图层" `<g>`:节点本来就带 `.rbt-node`,连线带 `.rbt-edge`,样式与冒烟
 * 脚本都按类名命中,再套一层只是多一个不起作用的元素;世界层是唯一必要的那一层
 * (视口要长期改它的 transform,见 ui/rbt_viewport.ts).
 *
 * 子节点走库的 `childNodes()`(与 `replaceChildren` 同一套"字符串落成文本节点,假值
 * 跳过"的规则),不自己拼 innerHTML.
 */
export function drawTree(world: SVGGElement, layout: RbtTreeLayout): void {
    const edges = layout.edges.map(createEdgeElement);
    const nodes = layout.nodes.map(createNodeElement);
    world.replaceChildren(...childNodes([...edges, ...nodes], world));
}

/** 清空世界层:一颗节点 / 一条线都不留(输入为空 / 空树 / 解析失败三种情况) */
export function clearTree(world: SVGGElement): void {
    world.replaceChildren();
}
