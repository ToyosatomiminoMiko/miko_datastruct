/*
 * 场景落笔:把 `VisualScene` 写成世界层里的 SVG 元素.
 *
 * 每轮**整批重建**世界层的子节点(先连线,后节点 -- 节点盖在线上):场景是"这一轮要画的
 * 全部内容",没有跨轮复用元素的理由;结构变化时保留旧节点只会留下对不上的残影.
 *
 * 连线的两种方向语义在这里落笔:
 * - 无向边:一条线段;
 * - 有向指针:线段 + 终点处的箭头三角形.端点已经由布局收进节点圆边界,箭头不会被圆盖住.
 *
 * 箭头画成显式 `<path>` 而不是 SVG `<marker>`:marker 要么按线宽缩放、要么要一份带 id 的
 * `<defs>`(同一页面多次挂载 / 重绘时要管 id 唯一),而这一层的箭头大小是固定的几个像素,
 * 直接算三个点更省事,也少一份"定义与引用"的状态.
 *
 * 内容实际占多大在这里量:落笔后向浏览器要 `getBBox()`.让浏览器量而不是让布局算,是为了
 * 不必知道字号;量到的也是真实渲染结果.
 *
 * 观感只给类名,不给 fill / stroke:颜色、线宽、半径全在 src/visual/visual.css 与
 * src/visual/tokens.css;语义变体由结构自己的样式表接住.
 */
import { childNodes, create_svg_element } from 'miko_ui';
import {
    VISUAL_ARROW_HALF_WIDTH,
    VISUAL_ARROW_LENGTH,
    VISUAL_LINK_CLASS,
    VISUAL_LINK_EDGE_CLASS,
    VISUAL_LINK_POINTER_CLASS,
    VISUAL_NODE_CLASS,
    VISUAL_NODE_LABEL_CLASS,
    VISUAL_NODE_RADIUS,
    VISUAL_NODE_SHAPE_CLASS,
    VISUAL_POINTER_ARROW_CLASS,
    visualNodeVariantClass,
} from '@/visual/config';
import type { VisualLink, VisualNode, VisualScene } from '@/visual/scene';
import type { PlaneBox } from '@/visual/viewport';

/** 一个节点组:位置 + 语义变体修饰类 + 形状 + 值文字 */
function createNodeElement(node: VisualNode): SVGGElement {
    const variant = node.variant === undefined ? null : visualNodeVariantClass(node.variant);
    return create_svg_element(
        { tag: 'g' },
        {
            class: variant === null ? VISUAL_NODE_CLASS : `${VISUAL_NODE_CLASS} ${variant}`,
            transform: `translate(${node.at.x},${node.at.y})`,
        },
        create_svg_element(
            { tag: 'circle' },
            { class: VISUAL_NODE_SHAPE_CLASS, r: String(VISUAL_NODE_RADIUS) },
        ),
        create_svg_element({ tag: 'text' }, { class: VISUAL_NODE_LABEL_CLASS }, node.label),
    );
}

/**
 * 有向指针终点的箭头三角形:尖端在 `to`,底边向回退 `VISUAL_ARROW_LENGTH`.
 *
 * 线本身画到尖端;三角形随后落笔覆盖在线段上,所以线不会从箭头里透出来.
 * 零长度(自环)没有方向,交回 null -- 宁可少画一枚箭头,也不要画一个 NaN 坐标.
 */
function createArrowElement(link: VisualLink): SVGPathElement | null {
    const dx = link.to.x - link.from.x;
    const dy = link.to.y - link.from.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) return null;

    const ux = dx / length;
    const uy = dy / length;
    // 底边中点:从尖端沿连线往回退一个箭头长度
    const baseX = link.to.x - ux * VISUAL_ARROW_LENGTH;
    const baseY = link.to.y - uy * VISUAL_ARROW_LENGTH;
    // 底边的两个端点:沿法向各偏半个底宽
    const leftX = baseX - uy * VISUAL_ARROW_HALF_WIDTH;
    const leftY = baseY + ux * VISUAL_ARROW_HALF_WIDTH;
    const rightX = baseX + uy * VISUAL_ARROW_HALF_WIDTH;
    const rightY = baseY - ux * VISUAL_ARROW_HALF_WIDTH;

    return create_svg_element(
        { tag: 'path' },
        {
            class: VISUAL_POINTER_ARROW_CLASS,
            d: `M ${link.to.x} ${link.to.y} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`,
        },
    );
}

/**
 * 一条连线落成 1~2 个元素:线段必有,有向指针再加一枚箭头.
 *
 * 线段的类名带变体(`visual-link--pointer` / `visual-link--edge`):测试与样式可以只看
 * 有向 / 无向,不必按 data-* 或节点顺序去猜.
 */
function createLinkElements(link: VisualLink): (SVGLineElement | SVGPathElement)[] {
    const variant = link.directed ? VISUAL_LINK_POINTER_CLASS : VISUAL_LINK_EDGE_CLASS;
    const line = create_svg_element(
        { tag: 'line' },
        {
            class: `${VISUAL_LINK_CLASS} ${variant}`,
            x1: String(link.from.x),
            y1: String(link.from.y),
            x2: String(link.to.x),
            y2: String(link.to.y),
        },
    );
    if (!link.directed) return [line];

    const arrow = createArrowElement(link);
    return arrow === null ? [line] : [line, arrow];
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
 * 不算进去,所以量到的正好是场景坐标,不需要再除 k.
 *
 * 已知偏差(有意的取舍):节点有 220ms 入场动画(`scale(0.9) -> 1`),画完立刻量会把每个
 * 圆按 0.9 算进去(实测三节点树量到 109.6,静止后是 114).偏差对内容中心对称,所以居中
 * 不受影响;自动适应上线是 1 倍(只缩不放),最坏也就是按小了 0.4% 的内容算比例,落在
 * 48px 的留白里看不出来.等 220ms 再量能让几何精确,但首屏会先闪一下错误的缩放.
 */
function measureWorldBounds(world: SVGGElement): PlaneBox | null {
    const box = world.getBBox();
    if (!(box.width > 0) || !(box.height > 0)) return null;
    return { minX: box.x, minY: box.y, width: box.width, height: box.height };
}

/**
 * 画一幅场景:整批重建世界层的子节点,再把量到的实际包围盒交给调用方(给视口适应).
 *
 * 不另包一层"图层" `<g>`:节点带 `.visual-node`、连线带 `.visual-link`,样式与测试都按
 * 类名命中;世界层是唯一必要的那一层,视口要长期改它的 transform.
 *
 * 子节点走库的 `childNodes()`(与 `replaceChildren` 同一套"字符串落成文本节点,假值
 * 跳过"的规则),不自己拼 innerHTML.
 */
export function renderScene(world: SVGGElement, scene: VisualScene): PlaneBox | null {
    const links = scene.links.flatMap(createLinkElements);
    const nodes = scene.nodes.map(createNodeElement);
    world.replaceChildren(...childNodes([...links, ...nodes], world));
    return measureWorldBounds(world);
}

/** 清空世界层:一个节点 / 一条连线都不留(空输入 / 空树 / 解析失败三种情况) */
export function clearScene(world: SVGGElement): void {
    world.replaceChildren();
}
