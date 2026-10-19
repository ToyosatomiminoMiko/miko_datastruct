/*
 * 静态路径的场景落笔:把 `VisualScene` 一次写成世界层里的 SVG 元素.
 *
 * 每轮**整批重建**世界层的子节点(先连线,后节点 -- 节点盖在线上):场景是"这一轮要画的
 * 全部内容",没有跨轮复用元素的理由;结构变化时保留旧节点只会留下对不上的残影.
 * 需要**跨轮稳定身份**的是动画路径(`visual/painter.ts` 的 `ScenePainter`),两条路径
 * 共用 `visual/elements.ts` 的图元构造与测量,避免观感 / 类名 / 箭头几何分叉
 * (见 docs/animation.md §5.1 与 §16).
 *
 * 这里只剩"拼装"这一件事:构造哪些图元、以什么顺序挂上、量一次包围盒.一个节点 /
 * 一条连线长什么样(类名、箭头、线收在底边)归 elements.ts.
 *
 * 不另包一层"图层" `<g>`:节点带 `.visual-node`、连线带 `.visual-link`,样式与测试都按
 * 类名命中;世界层是唯一必要的那一层,视口要长期改它的 transform.
 *
 * 子节点走库的 `childNodes()`(与 `replaceChildren` 同一套"字符串落成文本节点,假值
 * 跳过"的规则),不自己拼 innerHTML.
 */
import { childNodes } from 'miko_ui';
import { createLinkElements, createNodeElements, measureWorldBounds } from '@/visual/elements';
import type { VisualScene } from '@/visual/scene';
import type { PlaneBox } from '@/visual/viewport';

/**
 * 画一幅场景:整批重建世界层的子节点,再把量到的实际包围盒交给调用方(给视口适应).
 *
 * 文档顺序固定为"先所有连线(line / path),后所有节点 g":节点要盖在线上.有向指针的
 * 线段与箭头按"线 -> 箭头"相邻落笔(箭头在底边处压住线头,见 `arrowGeometry()`).
 */
export function renderScene(world: SVGGElement, scene: VisualScene): PlaneBox | null {
    const links = scene.links.flatMap((link) => {
        const elements = createLinkElements(link);
        return elements.arrow === null ? [elements.line] : [elements.line, elements.arrow];
    });
    const nodes = scene.nodes.map((node) => createNodeElements(node).group);
    world.replaceChildren(...childNodes([...links, ...nodes], world));
    return measureWorldBounds(world);
}

/** 清空世界层:一个节点 / 一条连线都不留(空输入 / 空树 / 解析失败三种情况) */
export function clearScene(world: SVGGElement): void {
    world.replaceChildren();
}
