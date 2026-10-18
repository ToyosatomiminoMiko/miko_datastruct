/*
 * 场景落笔:把 `VisualScene` 写成世界层里的 SVG 元素.
 *
 * 每轮**整批重建**世界层的子节点(先指针,后节点 -- 节点盖在线上):场景是"这一轮要画的
 * 全部内容",没有跨轮复用元素的理由;结构变化时保留旧节点只会留下对不上的残影.
 *
 * 内容实际占多大在这里量:落笔后向浏览器要 `getBBox()`.让浏览器量而不是让布局算,是为了
 * 不必知道圆半径 / 字号(否则 TS 与 CSS 两处必须手抄相等),量到的也是真实渲染结果.
 *
 * 观感只给类名,不给 fill / stroke / r:颜色、线宽、半径全在 src/visual/visual.css 与
 * src/visual/tokens.css;语义变体由结构自己的样式表接住.
 */
import { childNodes, create_svg_element } from 'miko_ui';
import {
    VISUAL_NODE_CLASS,
    VISUAL_NODE_LABEL_CLASS,
    VISUAL_NODE_SHAPE_CLASS,
    VISUAL_POINTER_CLASS,
    visualNodeVariantClass,
} from '@/visual/config';
import type { VisualNode, VisualPointer, VisualScene } from '@/visual/scene';
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
        create_svg_element({ tag: 'circle' }, { class: VISUAL_NODE_SHAPE_CLASS }),
        create_svg_element({ tag: 'text' }, { class: VISUAL_NODE_LABEL_CLASS }, node.label),
    );
}

/** 一条指针(`x1/y1` 是起点,`x2/y2` 是终点;方向由结构语义决定,当前画法是无箭头线段) */
function createPointerElement(pointer: VisualPointer): SVGLineElement {
    return create_svg_element(
        { tag: 'line' },
        {
            class: VISUAL_POINTER_CLASS,
            x1: String(pointer.from.x),
            y1: String(pointer.from.y),
            x2: String(pointer.to.x),
            y2: String(pointer.to.y),
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
 * 不另包一层"图层" `<g>`:节点带 `.visual-node`、指针带 `.visual-pointer`,样式与测试都按
 * 类名命中;世界层是唯一必要的那一层,视口要长期改它的 transform.
 *
 * 子节点走库的 `childNodes()`(与 `replaceChildren` 同一套"字符串落成文本节点,假值
 * 跳过"的规则),不自己拼 innerHTML.
 */
export function renderScene(world: SVGGElement, scene: VisualScene): PlaneBox | null {
    const pointers = scene.pointers.map(createPointerElement);
    const nodes = scene.nodes.map(createNodeElement);
    world.replaceChildren(...childNodes([...pointers, ...nodes], world));
    return measureWorldBounds(world);
}

/** 清空世界层:一个节点 / 一条指针都不留(空输入 / 空树 / 解析失败三种情况) */
export function clearScene(world: SVGGElement): void {
    world.replaceChildren();
}
