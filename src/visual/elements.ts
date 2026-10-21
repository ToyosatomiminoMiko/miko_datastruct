/*
 * 场景图元:节点 / 连线的构造与就地写入,外加世界层包围盒的测量.
 *
 * 为什么单独成文件(见 docs/animation.md §5.1 与 §16):静态路径(`render.ts`)每轮整批
 * 重建,动画路径(`painter.ts`)要复用同一批元素、只改属性;两条路径如果各写一份构造,
 * 类名 / 箭头几何 / 子节点顺序迟早分叉.这里把"一个节点 / 一条连线长什么样"收成唯一来源,
 * 静态路径只负责拼装,动画路径只负责增量落笔.
 *
 * 类名是**跨文件契约**(visual.css 命中、测试断言,改名要三处一起改):
 * - 节点:组 `visual-node`(+ 语义变体 `visual-node--<variant>`)、形状 `visual-node__shape`、
 *   值文字 `visual-node__label`;
 * - 连线:线段 `visual-link` + `visual-link--pointer`(有向)/ `visual-link--edge`(无向),
 *   有向指针另有一枚 `visual-pointer-arrow`.
 *
 * 节点位置写在组的 `transform` **属性**上(不是 CSS transform):世界坐标是几何,归属性;
 * CSS 的 transform 留给形状 / 文字各自的入场缩放.两者抢同一个属性会让动画期间所有节点
 * 叠到世界原点(见 §13.3).
 *
 * 观感只给类名,不给 fill / stroke:颜色、线宽、半径全在 visual.css 与 tokens.css;
 * 语义变体由结构自己的样式表接住.
 */
import { create_svg_element } from 'miko_ui';
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
import type { VisualLink, VisualNode, VisualPoint } from '@/visual/scene';
import type { PlaneBox } from '@/visual/viewport';

/** 一个节点组的三个引用(都在同一棵树里:形状与值文字是组的两个孩子) */
export interface NodeElements {
    /** 节点组:位置在 `transform` 属性上,语义变体 / 动画状态类挂在它上面 */
    readonly group: SVGGElement;
    /** 形状(当前是圆):半径由 TS 常量写进 `r` 属性,填充与入场动画归 CSS */
    readonly shape: SVGCircleElement;
    /** 值文字元素:居中对齐归 CSS,内容由场景给(文档里是 `String(key)`) */
    readonly label: SVGTextElement;
}

/** 一条连线的元素:线段必有,有向指针再加一枚箭头;无向边 `arrow` 为 null */
export interface LinkElements {
    /** 有向指针的箭头;无向边为 null */
    readonly arrow: SVGPathElement | null;
    /** 线段:有向指针的终点收在箭头底边(见 `arrowGeometry()`) */
    readonly line: SVGLineElement;
}

/**
 * 有向指针的箭头几何:尖端在 `to`,底边沿连线往回退 `VISUAL_ARROW_LENGTH`,底边总宽
 * `2 × VISUAL_ARROW_HALF_WIDTH`;底边中点 `base` 同时是**线段的终点**.
 *
 * 线必须停在底边上,不能画到尖端.三角形在尖端附近比线还窄:半宽从 3.5 线性收到 0,
 * 而线宽恒为 2,所以离尖端约 2.9px 以内,线反而比三角形宽.画到尖端的线头于是从两条
 * 斜边里戳出来,尖端变成一截方头 -- 放大后整枚箭头看着像鼠标指针.线停在底边就没有
 * 这截多余的方头,线段也正好被底边(宽 7)整个盖住,接缝处不会漏色.
 *
 * 零长度(自环)没有方向,交回 null -- 宁可少画一枚箭头,也不要画一个 NaN 坐标.
 * 连线比一个箭头还短时,底边最多退到起点(不让线反向画),此时整条线就是那枚箭头.
 */
export interface ArrowGeometry {
    /** 三角形尖端 = 指针终点 */
    readonly tip: VisualPoint;
    /** 底边中点 = 线段终点(尖端正往回退一个箭头长度) */
    readonly base: VisualPoint;
    /** 底边两个端点 */
    readonly left: VisualPoint;
    readonly right: VisualPoint;
}

/**
 * 有向指针的箭头几何;零长度(自环)返回 null.
 *
 * 纯函数:静态路径与动画路径每帧算的是同一份几何,箭头大小 / 收线位置不会分叉.
 */
export function arrowGeometry(link: VisualLink): ArrowGeometry | null {
    const dx = link.to.x - link.from.x;
    const dy = link.to.y - link.from.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) return null;

    const ux = dx / length;
    const uy = dy / length;
    // 底边中点:从尖端沿连线往回退一个箭头长度(连线不够长时退到起点为止)
    const back = Math.min(VISUAL_ARROW_LENGTH, length);
    const baseX = link.to.x - ux * back;
    const baseY = link.to.y - uy * back;
    // 底边的两个端点:沿法向各偏半个底宽
    const leftX = baseX - uy * VISUAL_ARROW_HALF_WIDTH;
    const leftY = baseY + ux * VISUAL_ARROW_HALF_WIDTH;
    const rightX = baseX + uy * VISUAL_ARROW_HALF_WIDTH;
    const rightY = baseY - ux * VISUAL_ARROW_HALF_WIDTH;

    return {
        tip: { x: link.to.x, y: link.to.y },
        base: { x: baseX, y: baseY },
        left: { x: leftX, y: leftY },
        right: { x: rightX, y: rightY },
    };
}

/** 箭头三角形的 `d`:尖端 -> 左底角 -> 右底角 -> 闭合 */
function arrowPath(geometry: ArrowGeometry): string {
    return `M ${geometry.tip.x} ${geometry.tip.y} L ${geometry.left.x} ${geometry.left.y}`
        + ` L ${geometry.right.x} ${geometry.right.y} Z`;
}

/**
 * 把一个 `base--<variant>` 族的修饰类换成 `next`,其余类原样保留.
 *
 * 只认 `baseClass--` 前缀:`visual-state--entering` 这类状态类与结构变体类(如
 * `visual-node--red`)是两套独立契约,状态切换不能把结构色一起清掉,反过来也一样.
 * 已经是目标类时不动 DOM,避免无意义的 class 变更触发样式重算.
 */
function writeVariantClass(element: Element, baseClass: string, next: string | null): void {
    const prefix = `${baseClass}--`;
    const current = [...element.classList].filter((name) => name.startsWith(prefix));
    if (current.length === 1 && current[0] === next) return;
    for (const name of current) element.classList.remove(name);
    if (next !== null) element.classList.add(next);
}

/**
 * 造一个节点组(形状与值文字一起造好并挂上).
 *
 * 类名组合与静态路径原来的实现逐字一致:没有变体时只有基础类,有变体时是
 * `visual-node visual-node--<variant>`;组的位置写在 `transform` 属性上.
 */
export function createNodeElements(node: VisualNode): NodeElements {
    const variant = node.variant === undefined ? null : visualNodeVariantClass(node.variant);
    const group = create_svg_element(
        { tag: 'g' },
        {
            class: variant === null ? VISUAL_NODE_CLASS : `${VISUAL_NODE_CLASS} ${variant}`,
            transform: `translate(${node.at.x},${node.at.y})`,
        },
    );
    const shape = create_svg_element(
        { tag: 'circle', into: group },
        { class: VISUAL_NODE_SHAPE_CLASS, r: String(VISUAL_NODE_RADIUS) },
    );
    const label = create_svg_element(
        { tag: 'text', into: group },
        { class: VISUAL_NODE_LABEL_CLASS },
        node.text,
    );
    return { group, shape, label };
}

/**
 * 造一条连线的元素(线段 + 有向指针的箭头),不挂到任何父节点.
 *
 * `arrow` 的有无由**构造时**的 `directed` 决定,接口里是只读字段:方向语义(有向 / 无向)
 * 真的发生变化时,调用方要重建 LinkElements,而不是指望就地写入变出一枚箭头.
 */
export function createLinkElements(link: VisualLink): LinkElements {
    const variant = link.directed ? VISUAL_LINK_POINTER_CLASS : VISUAL_LINK_EDGE_CLASS;
    const arrow = link.directed ? arrowGeometry(link) : null;
    // 有向指针的线收在箭头底边;无向边(或零长度指针)直接画到终点
    const end = arrow === null ? link.to : arrow.base;
    const line = create_svg_element(
        { tag: 'line' },
        {
            class: `${VISUAL_LINK_CLASS} ${variant}`,
            x1: String(link.from.x),
            y1: String(link.from.y),
            x2: String(end.x),
            y2: String(end.y),
        },
    );
    if (arrow === null) return { arrow: null, line };

    return {
        arrow: create_svg_element(
            { tag: 'path' },
            { class: VISUAL_POINTER_ARROW_CLASS, d: arrowPath(arrow) },
        ),
        line,
    };
}

/**
 * 把节点位置 / 语义变体 / 值文字写到已有元素上,不重建元素.
 *
 * 动画每帧调它:组是同一个 DOM 节点,浏览器才有"上一帧"可插值.只动本文件的契约类,
 * 动画状态类(`visual-state--...`,由 painter 挂)原样保留.
 */
export function writeNodeElements(elements: NodeElements, node: VisualNode): void {
    elements.group.setAttribute('transform', `translate(${node.at.x},${node.at.y})`);
    writeVariantClass(
        elements.group,
        VISUAL_NODE_CLASS,
        node.variant === undefined ? null : visualNodeVariantClass(node.variant),
    );
    // textContent 相同就不写:动画每帧都在调,避免无意义的文本节点替换
    if (elements.label.textContent !== node.text) elements.label.textContent = node.text;
}

/**
 * 把连线端点 / 方向变体 / 箭头几何写到已有元素上,不重建元素.
 *
 * 方向语义(有向 / 无向)改变时不能靠这里变出 / 变没一枚箭头(`LinkElements` 是只读
 * 结构),调用方要重建;这里只处理同方向下的端点与箭头几何变化,包括动画途中两端恰好
 * 重合的零长度瞬间(箭头先摘掉,长度恢复时再挂回)。
 */
export function writeLinkElements(elements: LinkElements, link: VisualLink): void {
    writeVariantClass(
        elements.line,
        VISUAL_LINK_CLASS,
        link.directed ? VISUAL_LINK_POINTER_CLASS : VISUAL_LINK_EDGE_CLASS,
    );
    const geometry = link.directed ? arrowGeometry(link) : null;
    // 线段终点:有向指针收在箭头底边,无向边 / 零长度指针画到终点
    const end = geometry === null ? link.to : geometry.base;
    elements.line.setAttribute('x1', String(link.from.x));
    elements.line.setAttribute('y1', String(link.from.y));
    elements.line.setAttribute('x2', String(end.x));
    elements.line.setAttribute('y2', String(end.y));

    if (elements.arrow === null) return;
    if (geometry === null) {
        /*
          零长度:箭头没有方向可画,先摘掉.不等同于把 d 写成空串 -- 空 path 留下一个
          不可见但仍在文档里的元素,恢复长度时还得判断它挂没挂;直接摘掉更干净.
        */
        elements.arrow.remove();
        return;
    }
    elements.arrow.setAttribute('d', arrowPath(geometry));
    // 长度恢复后箭头可能还脱离着文档:挂回线段所在图层(线段之间的相对顺序不影响观感)
    if (elements.arrow.parentNode === null) elements.line.parentNode?.append(elements.arrow);
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
 * 两条路径共用:静态路径每轮落笔后量一次;动画路径只在"落定帧"(settled)量一次,
 * 动画中途不量 -- 否则会量到进出场的中间态,自动适应跟着抖(见 §13.1).
 *
 * 已知偏差(有意的取舍):节点有 220ms 入场动画(`scale(0.9) -> 1`),画完立刻量会把每个
 * 圆按 0.9 算进去(实测三节点树量到 109.6,静止后是 114).偏差对内容中心对称,所以居中
 * 不受影响;自动适应上线是 1 倍(只缩不放),最坏也就是按小了 0.4% 的内容算比例,落在
 * 48px 的留白里看不出来.等 220ms 再量能让几何精确,但首屏会先闪一下错误的缩放.
 */
export function measureWorldBounds(world: SVGGElement): PlaneBox | null {
    const box = world.getBBox();
    if (!(box.width > 0) || !(box.height > 0)) return null;
    return { minX: box.x, minY: box.y, width: box.width, height: box.height };
}
