/*
 * 两帧场景 -> 任意 t 的中间帧:节点位置、连线端点、颜色 / 高亮状态、进入 / 离开.
 *
 * 输入是**已经锚定好的布局**(见 visual/anchor.ts):两帧布局先用 anchor 对齐,
 * 这里只负责形状插值.输出刻意带**稳定标识**(节点 key / 连线 id),因为落笔层
 * (visual/painter.ts)要靠它复用上一帧的 DOM 元素 -- 没有稳定身份就没有补间.
 *
 * 三种插值:
 * 1. 直线:节点坐标 `lerp(上一帧, 这一帧)`;
 * 2. 旋转(`motion.kind === 'rotate'`):x / y 绕旧 x–y 边的中点做**极坐标插值**
 *    (半径线性、角度取最短弧),看起来是绕轴转而不是两个圆擦肩而过;β 子树以
 *    移动中的 x 为圆心走短弧(它是"换爹"的主角);α / γ 等其余节点跟随父节点平移;
 * 3. 子树平移(`motion.kind === 'subtree'`):根所在子树整体按根的位移平移,避免
 *    直线插值把子树拉成斜的.
 *
 * 连线**不直接插值端点**:先取插值后的节点坐标,再对分道偏移插值,最后用布局层
 * 导出的 `linkEndpoints()` 重算端点.节点在动时线段端点始终贴着圆边,不会脱开.
 *
 * 这一层是纯函数:没有 DOM,没有时钟;测试可以逐点断言.
 */

import type { SceneDocument } from '@/scene/scene_document';
import type { SceneLayout, SceneLayoutPoint } from '@/visual/layout';
import { assignLinkLanes, linkEndpoints } from '@/visual/layout';
import type { VisualPoint } from '@/visual/scene';
import type { TraceLinkState, TraceMarks, TraceMotion, TraceNodeState } from '@/datastruct/trace/trace';

/** 文档 attrs -> 视觉变体后缀(红黑树的 color -> red / black);由 ui 层注入 */
export type VariantOf = (attrs: Readonly<Record<string, string | number | boolean>>) => string | undefined;

/** 中间帧里的一个节点:位置 + 文字 + 结构变体 + 动画高亮 + 透明度 */
export interface MotionNode {
    readonly key: number;
    readonly at: VisualPoint;
    readonly label: string;
    readonly variant?: string;
    readonly state?: TraceNodeState;
    /** 0..1;进入 / 离开时淡入淡出,常驻为 1 */
    readonly opacity: number;
}

/** 中间帧里的一条连线:两端节点 key + 已经算好的端点 + 高亮 */
export interface MotionLink {
    /** 稳定标识 `${from}->${to}#${同序对序号}`,落笔层按它复用 DOM */
    readonly id: string;
    readonly from: number;
    readonly to: number;
    readonly directed: boolean;
    readonly start: VisualPoint;
    readonly end: VisualPoint;
    readonly state?: TraceLinkState;
    readonly opacity: number;
    /** 带符号的分道偏移(按无向对的固定法向);插值分道数变化时不会瞬跳 */
    readonly laneOffset: number;
}

/** 一帧动画场景(任意 t);节点顺序:这一帧的节点在前,正在离开的节点在后 */
export interface MotionScene {
    readonly nodes: readonly MotionNode[];
    readonly links: readonly MotionLink[];
}

/** 一份文档里连线的稳定 id:方向 + 同序对里第几条(平行边 / 反向指针各算各的) */
export function linkIdsOfDocument(document: SceneDocument): readonly string[] {
    const counts = new Map<string, number>();
    const ordered = [
        ...document.pointers.map((pointer) => ({ from: pointer.from, to: pointer.to })),
        ...document.edges.map((edge) => ({ from: edge.a, to: edge.b })),
    ];
    return ordered.map((link) => {
        const base = `${link.from}->${link.to}`;
        const index = counts.get(base) ?? 0;
        counts.set(base, index + 1);
        return `${base}#${index}`;
    });
}

/**
 * 由"完整文档 + 静态布局"造一帧确定场景(步骤落定 / seek / 硬切用).
 *
 * 端点与静态布局完全一致;`laneOffset` 与布局同口径(canonical 符号在这里折进去),
 * 于是动画从任意中间帧过渡到这一帧时,线段的最终位置与静态渲染逐像素相同.
 */
export function sceneFromLayout(
    document: SceneDocument,
    layout: SceneLayout,
    options: { readonly marks?: TraceMarks; readonly variantOf?: VariantOf } = {},
): MotionScene {
    const positions = new Map(layout.nodes.map((node) => [node.key, node] as const));
    const pointOf = (key: number): SceneLayoutPoint => {
        const node = positions.get(key);
        if (node === undefined) throw new Error(`布局里没有节点 ${key}`);
        return { x: node.x, y: node.y };
    };
    const rawLinks = [
        ...document.pointers.map((pointer) => ({ from: pointer.from, to: pointer.to })),
        ...document.edges.map((edge) => ({ from: edge.a, to: edge.b })),
    ];
    const laneOffsets = assignLinkLanes(rawLinks);
    const ids = linkIdsOfDocument(document);
    const linkMarks = options.marks?.links ?? [];
    const nodeMarks = new Map<number, TraceNodeState>();
    for (const mark of options.marks?.nodes ?? []) nodeMarks.set(mark.key, mark.state);

    return {
        nodes: document.nodes.map((node) => {
            const at = pointOf(node.key);
            const variant = options.variantOf?.(node.attrs);
            const state = nodeMarks.get(node.key);
            const base = { key: node.key, at: { x: at.x, y: at.y }, label: node.label, opacity: 1 };
            return {
                ...base,
                ...(variant === undefined ? {} : { variant }),
                ...(state === undefined ? {} : { state }),
            };
        }),
        links: layout.links.map((link, index) => {
            const canonical = link.from <= link.to ? 1 : -1;
            const signedLane = (laneOffsets[index] ?? 0) * canonical;
            // 归一 -0:同一条线的偏移在两次生成里不该出现两种写法(便于逐字段 diff)
            const laneOffset = signedLane === 0 ? 0 : signedLane;
            const mark = linkMarks.find((item) => item.from === link.from && item.to === link.to);
            return {
                id: ids[index] as string,
                from: link.from,
                to: link.to,
                directed: link.directed,
                start: { x: link.start.x, y: link.start.y },
                end: { x: link.end.x, y: link.end.y },
                opacity: 1,
                laneOffset,
                ...(mark === undefined ? {} : { state: mark.state }),
            };
        }),
    };
}

// 插值的纯数学

function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}

function lerpPoint(from: VisualPoint, to: VisualPoint, t: number): VisualPoint {
    return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
}

/** 最短弧:把角差折到 (-π, π],避免 350° -> 10° 时反向绕一大圈 */
function shortestAngleDelta(from: number, to: number): number {
    let delta = (to - from) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
}

/**
 * 绕 `center` 的极坐标插值:半径线性、角度取最短弧.
 *
 * 与直线插值的差别在"看起来绕轴":例如 y 从右下转到正上方,直线会穿过 x 的圆心,
 * 极坐标则沿一段圆弧过去.半径也插值,于是"v 字形的两边长度变了"这种情形不会
 * 在半径上瞬跳.
 */
export function polarInterpolate(
    from: VisualPoint,
    to: VisualPoint,
    center: VisualPoint,
    t: number,
): VisualPoint {
    const fromX = from.x - center.x;
    const fromY = from.y - center.y;
    const toX = to.x - center.x;
    const toY = to.y - center.y;
    const fromRadius = Math.hypot(fromX, fromY);
    const toRadius = Math.hypot(toX, toY);
    if (fromRadius < 1e-9 || toRadius < 1e-9) return lerpPoint(from, to, t);
    const radius = lerp(fromRadius, toRadius, t);
    const angle = Math.atan2(fromY, fromX)
        + shortestAngleDelta(Math.atan2(fromY, fromX), Math.atan2(toY, toX)) * t;
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
}

/** 有向连接的孩子(按连线在文档里的顺序:左孩子在前,右孩子在后) */
function childrenOf(scene: MotionScene, key: number): number[] {
    return scene.links.filter((link) => link.directed && link.from === key).map((link) => link.to);
}

/** 从 key 出发沿有向连接可达的全部节点(含 key 自己) */
function subtreeKeys(scene: MotionScene, key: number): Set<number> {
    const result = new Set<number>();
    const stack = [key];
    while (stack.length > 0) {
        const current = stack.pop() as number;
        if (result.has(current)) continue;
        result.add(current);
        for (const child of childrenOf(scene, current)) stack.push(child);
    }
    return result;
}

/**
 * 旋转里 β 子树(换爹的那块)的根.
 *
 * 左旋(x 的右孩子 y 上位)时 β = y 的左孩子;右旋时 β = y 的右孩子.
 * 用布局里的指针顺序判断方向(左孩子在前):y 是 x 的第 2 个孩子 -> 左旋;
 * 只有 1 个孩子时退回几何判断(哪个孩子画在 x 的右边).判断不出来返回 null,
 * 这一帧退化成普通直线插值,不会画错只是没那么好看.
 */
function betaRootOf(previous: MotionScene, x: number, y: number): number | null {
    const xChildren = childrenOf(previous, x);
    if (!xChildren.includes(y)) return null;
    const xNode = previous.nodes.find((node) => node.key === x);
    const yNode = previous.nodes.find((node) => node.key === y);
    const yIsRight = xChildren.length >= 2
        ? xChildren[1] === y
        : xNode !== undefined && yNode !== undefined && yNode.at.x >= xNode.at.x;
    const yChildren = childrenOf(previous, y);
    if (yChildren.length === 0) return null;
    return yIsRight ? (yChildren[0] as number) : (yChildren[yChildren.length - 1] as number);
}

/** 插值的中间结果(位置 / 透明度),最后再组装成 MotionScene */
interface NodeSample {
    readonly at: VisualPoint;
    readonly opacity: number;
}

/**
 * 两帧之间插值出任意 t 的动画场景.
 *
 * - `previous === null`(第一帧 / 硬切后的第一帧):直接用 next,透明度全 1;
 * - t 由调用方缓动后传入(播放器用 easeInOutCubic),这里只做线性几何;
 * - 进入的元素 `opacity = t`,离开的元素 `opacity = 1 - t`,settled 那一帧由
 *   落笔层删掉(这里不删,否则淡出会瞬间消失).
 */
export function interpolateScenes(
    previous: MotionScene | null,
    next: MotionScene,
    t: number,
    motion?: TraceMotion,
): MotionScene {
    if (previous === null) {
        return {
            nodes: next.nodes.map((node) => ({ ...node, opacity: 1 })),
            links: next.links.map((link) => ({ ...link, opacity: 1 })),
        };
    }
    const clamped = Math.min(Math.max(t, 0), 1);
    const previousNodes = new Map(previous.nodes.map((node) => [node.key, node] as const));
    const nextNodes = new Map(next.nodes.map((node) => [node.key, node] as const));
    const samples = new Map<number, NodeSample>();

    // ① 两帧都有的节点:先记"直线"作为默认,旋转 / 子树提示再覆盖
    for (const [key, node] of nextNodes) {
        const old = previousNodes.get(key);
        if (old === undefined) {
            samples.set(key, { at: node.at, opacity: clamped });
            continue;
        }
        samples.set(key, { at: lerpPoint(old.at, node.at, clamped), opacity: 1 });
    }

    // ② 只在上一帧的节点:停在原位淡出
    for (const [key, node] of previousNodes) {
        if (nextNodes.has(key)) continue;
        samples.set(key, { at: node.at, opacity: 1 - clamped });
    }

    // ③ 旋转:极坐标插值 x / y 与 β 子树,其余节点保持直线(跟随父节点平移)
    if (motion?.kind === 'rotate') {
        const oldX = previousNodes.get(motion.from);
        const oldY = previousNodes.get(motion.to);
        const newX = nextNodes.get(motion.from);
        const newY = nextNodes.get(motion.to);
        if (oldX !== undefined && oldY !== undefined && newX !== undefined && newY !== undefined) {
            const center = { x: (oldX.at.x + oldY.at.x) / 2, y: (oldX.at.y + oldY.at.y) / 2 };
            const xAt = polarInterpolate(oldX.at, newX.at, center, clamped);
            const yAt = polarInterpolate(oldY.at, newY.at, center, clamped);
            samples.set(motion.from, { at: xAt, opacity: 1 });
            samples.set(motion.to, { at: yAt, opacity: 1 });

            const betaRoot = betaRootOf(previous, motion.from, motion.to);
            if (betaRoot !== null) {
                const betaKeys = subtreeKeys(previous, betaRoot);
                for (const key of betaKeys) {
                    const oldNode = previousNodes.get(key);
                    const newNode = nextNodes.get(key);
                    if (oldNode === undefined) continue;
                    // β 以"移动中的 x"为圆心走短弧:它是绕 x 换爹的,视觉焦点在 x
                    const at = newNode === undefined
                        ? oldNode.at
                        : polarInterpolate(oldNode.at, newNode.at, xAt, clamped);
                    samples.set(key, { at, opacity: newNode === undefined ? 1 - clamped : 1 });
                }
            }
        }
    }

    // ④ 子树整体平移:按根的位移,所有同子树节点用同一个 delta
    if (motion?.kind === 'subtree') {
        const oldRoot = previousNodes.get(motion.root);
        const newRoot = nextNodes.get(motion.root);
        if (oldRoot !== undefined && newRoot !== undefined) {
            const keys = new Set([...subtreeKeys(previous, motion.root), ...subtreeKeys(next, motion.root)]);
            const dx = (newRoot.at.x - oldRoot.at.x) * clamped;
            const dy = (newRoot.at.y - oldRoot.at.y) * clamped;
            for (const key of keys) {
                const oldNode = previousNodes.get(key);
                const newNode = nextNodes.get(key);
                if (oldNode === undefined || newNode === undefined) continue;
                samples.set(key, { at: { x: oldNode.at.x + dx, y: oldNode.at.y + dy }, opacity: 1 });
            }
        }
    }

    const nodes: MotionNode[] = [];
    for (const node of next.nodes) {
        const sample = samples.get(node.key);
        const state = node.state;
        nodes.push({
            ...node,
            at: sample?.at ?? node.at,
            opacity: sample?.opacity ?? 1,
            ...(state === undefined ? {} : { state }),
        });
    }
    for (const node of previous.nodes) {
        if (nextNodes.has(node.key)) continue;
        const sample = samples.get(node.key);
        nodes.push({ ...node, at: sample?.at ?? node.at, opacity: sample?.opacity ?? 0 });
    }

    // ⑤ 连线:取并集,先这一帧的(顺序稳定),再上一帧独有的(淡出)
    const previousLinks = new Map(previous.links.map((link) => [link.id, link] as const));
    const nextLinks = new Map(next.links.map((link) => [link.id, link] as const));
    const positionOf = (key: number): VisualPoint => {
        const sample = samples.get(key);
        if (sample !== undefined) return sample.at;
        return previousNodes.get(key)?.at ?? nextNodes.get(key)?.at ?? { x: 0, y: 0 };
    };
    const buildLink = (
        link: MotionLink,
        laneOffset: number,
        opacity: number,
        state: TraceLinkState | undefined,
    ): MotionLink => {
        const endpoints = linkEndpoints(positionOf(link.from), positionOf(link.to), laneOffset);
        return {
            id: link.id,
            from: link.from,
            to: link.to,
            directed: link.directed,
            start: endpoints.start,
            end: endpoints.end,
            opacity,
            laneOffset,
            ...(state === undefined ? {} : { state }),
        };
    };
    const links: MotionLink[] = [];
    for (const link of next.links) {
        const old = previousLinks.get(link.id);
        const laneOffset = old === undefined ? link.laneOffset : lerp(old.laneOffset, link.laneOffset, clamped);
        links.push(buildLink(link, laneOffset, old === undefined ? clamped : 1, link.state ?? old?.state));
    }
    for (const link of previous.links) {
        if (nextLinks.has(link.id)) continue;
        links.push(buildLink(link, link.laneOffset, 1 - clamped, link.state));
    }

    return { nodes, links };
}
