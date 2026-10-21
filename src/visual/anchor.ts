/*
 * 帧间**锚定**:把一帧布局整体平移,让指定的 anchor 节点落在上一帧 anchorAt 节点的位置.
 *
 * 为什么必须锚定(见 docs/animation.md §5.4):`layoutScene` 每次都按包围盒归零,
 * 任何一次插入 / 删除 / 旋转都会让整棵树的坐标平移一段(哪怕只是加了一个最左叶子).
 * 直接把两帧布局插值,画面上是"所有节点一起滑",真正变化的那几个节点反而看不清.
 *
 * 这里只做**纯平移**,是纯算术:
 *
 * ```text
 * dx = previous(anchorAt).x - current(anchor).x
 * dy = previous(anchorAt).y - current(anchor).y
 * current' = current + (dx, dy)
 * ```
 *
 * 不改变布局的内部关系,也不认识任何一种结构.平移量可以预先算好(整条轨迹一次),
 * 测试能断言"锚点前后像素级不动".
 */

import type { SceneNodeKey } from '@/scene/scene_document';
import { compareSceneNodeKeys } from '@/visual/layout';
import type { SceneLayout, SceneLayoutNode } from '@/visual/layout';

/** 锚定请求:anchor 是这一帧的节点,anchorAt 是上一帧的节点(缺省取同名 key) */
export interface AnchorRequest {
    readonly anchor?: SceneNodeKey;
    readonly anchorAt?: SceneNodeKey;
}

/** 平移量:世界坐标里的整数 / 浮点增量 */
export interface AnchorOffset {
    readonly dx: number;
    readonly dy: number;
}

/** 布局里某个 key 的位置;找不到返回 null(布局应当包含所有 document 节点) */
export function layoutPosition(layout: SceneLayout, key: SceneNodeKey): SceneLayoutNode | null {
    return layout.nodes.find((node) => node.key === key) ?? null;
}

/** 整帧平移:节点坐标与连线端点一起挪,拓扑 / 顺序不变 */
export function translateLayout(layout: SceneLayout, dx: number, dy: number): SceneLayout {
    if (dx === 0 && dy === 0) return layout;
    return {
        nodes: layout.nodes.map((node) => ({ ...node, x: node.x + dx, y: node.y + dy })),
        links: layout.links.map((link) => ({
            ...link,
            start: { x: link.start.x + dx, y: link.start.y + dy },
            end: { x: link.end.x + dx, y: link.end.y + dy },
        })),
    };
}

/**
 * 算这一次的平移量.
 *
 * 回退规则(任何一条不满足就不锚定,返回 null):
 * 1. 没有上一帧(第一帧 / 硬切):不锚;
 * 2. `anchor` 没给:不锚;
 * 3. 这一帧没有 `anchor` 节点:不锚(节点被删了,没有可对齐的东西);
 * 4. `anchorAt` 没给时取上一帧的**同名 key**;上一帧也没有它:不锚.
 *
 * 不锚定时返回 null,调用方直接用当前布局(整帧可能滑一下,但那是没有更好锚点
 * 的信息缺失,不该猜一个节点硬锚).
 */
export function anchorOffset(
    current: SceneLayout,
    previous: SceneLayout | null,
    request: AnchorRequest,
): AnchorOffset | null {
    if (previous === null || request.anchor === undefined) return null;

    const anchorAtKey = request.anchorAt ?? request.anchor;
    const currentPoint = layoutPosition(current, request.anchor);
    const previousPoint = layoutPosition(previous, anchorAtKey);
    if (currentPoint === null || previousPoint === null) return null;

    return {
        dx: previousPoint.x - currentPoint.x,
        dy: previousPoint.y - currentPoint.y,
    };
}

/**
 * 按锚定请求平移这一帧布局.
 *
 * 返回的布局在 `anchor` 存在时保证:anchor 节点坐标 = 上一帧 anchorAt 节点坐标
 * (像素级);没有可锚内容时原样返回,**不复制**布局(调用方可以按引用判断有没有动).
 */
export function anchorLayout(
    current: SceneLayout,
    previous: SceneLayout | null,
    request: AnchorRequest,
): SceneLayout {
    const offset = anchorOffset(current, previous, request);
    return offset === null ? current : translateLayout(current, offset.dx, offset.dy);
}

/**
 * 自动锚定:调用方没给 anchor,但两帧有共同节点时,拿"上一帧里 key 最小的共同节点"
 * 当锚,避免整棵树因为包围盒归零而无谓地滑.
 *
 * "最小"按 key 本身的类型比较(数字相减、字符串按字典序,见
 * `compareSceneNodeKeys`):字符串 key 不能直接相减,否则排序结果变成 NaN 比较、
 * 锚点在不同帧之间飘.
 *
 * 这是给"机械步骤 / 算法忘了写 anchor"的兜底,不替代算法显式锚定:
 * - 两帧文档完全一样时,布局也完全一样,自动锚定是恒等;
 * - 旋转 / 插入这类几何变化大的步骤,算法必须显式给 anchorAt,否则自动锚点
 *   可能选在次要节点上,插值出来的视觉中心不对.
 */
export function autoAnchorLayout(current: SceneLayout, previous: SceneLayout | null): SceneLayout {
    if (previous === null) return current;
    const previousKeys = new Set(previous.nodes.map((node) => node.key));
    const common = current.nodes
        .map((node) => node.key)
        .filter((key) => previousKeys.has(key))
        .sort(compareSceneNodeKeys);
    const anchor = common[0];
    if (anchor === undefined) return current;
    return anchorLayout(current, previous, { anchor });
}
