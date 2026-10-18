/*
 * 红黑树的**视觉翻译**:把布局结果翻译成视觉层的场景.
 *
 * 这是"红黑树语义"与"视觉词汇"唯一的接缝:
 * - 节点 -> 一个圆 + 节点值,红 / 黑变成视觉变体 `red` / `black`(观感在 ui/rbt/rbt.css
 *   的变体规则里,不在视觉层的 token 里);
 * - 父子关系 -> 一条指针(线段),两端就是父子节点的平面坐标(布局已经算好,渲染层不再算).
 *
 * 布局只给几何、视觉层只认图元,两边都不认识红黑树;这个文件是认识红黑树的那一层.
 */
import type { RbtTreeLayout } from '@/ui/rbt/rbt_layout';
import type { VisualScene } from '@/visual/scene';

/** 布局 -> 场景:节点顺序与指针顺序都沿用布局的先序 */
export function rbtScene(layout: RbtTreeLayout): VisualScene {
    return {
        nodes: layout.nodes.map((placed) => ({
            at: { x: placed.x, y: placed.y },
            label: placed.node.value,
            variant: placed.node.color === 'R' ? 'red' : 'black',
        })),
        pointers: layout.edges.map((edge) => ({
            from: { x: edge.from.x, y: edge.from.y },
            to: { x: edge.to.x, y: edge.to.y },
        })),
    };
}
