/*
 * 动画**轨迹**的数据契约:一次演示 = 一串"这一帧长什么样 + 怎么讲"的快照.
 *
 * 这一层是纯数据 + 小工具,不碰 DOM,也不认识任何一种结构:
 *
 * ```text
 * 初始结构 + 操作序列
 *     │  datastruct 的算法逐拍改结构,每改完一拍 yield 一个 TraceFrame
 *     ▼
 * SceneTrace = [ TraceStep(document, title, detail, focus / marks / anchor / motion) ]
 *     │  visual 侧逐帧布局 / 插值 / 落笔
 *     ▼
 * 播放器回放
 * ```
 *
 * 为什么每帧存**完整 document** 而不是"这一步对上一帧做了什么":
 * - 回退 / 拖进度条只要重新画第 i 帧,不需要反向补间;
 * - 每一步都能单独喂给 `parseSceneDocument` / `runSceneChecks`,测试逐帧断言;
 * - 算法与画面解耦:算法只管改结构,怎么动由视觉层统一决定(见 docs/animation.md §2).
 *
 * 字段口径见 docs/animation.md §4. 这里多了一个文档里没有的 `cut`:章节之间换一棵
 * 完全无关的树时,从上一帧插值过去会得到"所有节点乱飞"的中间态;`cut: true` 表示
 * 这一拍直接硬切(不插值),用于旋转 / 退化章节的开场.
 */

import type { SceneDocument } from '@/scene/scene_document';

/** 节点高亮状态:动画词汇,和结构色变体(红 / 黑)叠加,不进 attrs */
export type TraceNodeState = 'active' | 'path' | 'visited' | 'found' | 'ghost' | 'fresh';

/** 连线高亮状态:路径上的指针 / 已被断开的指针 */
export type TraceLinkState = 'path' | 'ghost';

/** 一个节点的高亮 */
export interface TraceNodeMark {
    readonly key: number;
    readonly state: TraceNodeState;
}

/** 一条连线的高亮:按两端 key 匹配(同一对之间多条线时全部命中) */
export interface TraceLinkMark {
    readonly from: number;
    readonly to: number;
    readonly state: TraceLinkState;
}

/** 这一帧的高亮集合 */
export interface TraceMarks {
    readonly nodes?: readonly TraceNodeMark[];
    readonly links?: readonly TraceLinkMark[];
}

/**
 * 帧间形变提示:描述"怎么从上一帧过渡到这一帧",不改变这一帧的布局结果.
 *
 * - `rotate`:`from` 是下沉的那个节点(x),`to` 是上位的那个(y);两帧里这两个 key
 *   必须都存在.视觉层绕旧 from–to 边的中点做极坐标插值;
 * - `subtree`:`root` 子树整体平移(单孩子删除时子树往上挪),避免直线插值把子树
 *   拉成斜的.
 */
export type TraceMotion =
    | { readonly kind: 'rotate'; readonly from: number; readonly to: number }
    | { readonly kind: 'subtree'; readonly root: number };

/** 镜头策略:点 / 整幅适应 / 不动(旋转、指针改写这类"看局部"的步骤用 hold) */
export type TraceFraming = 'point' | 'fit' | 'hold';

/**
 * 一拍 = 一帧完整结构 + 一句叙述 + 这一帧的高亮 / 镜头 / 锚定 / 形变提示.
 *
 * 所有可选字段都是**给播放器的提示**,不是时间轴:真正怎么动由视觉层统一参数决定.
 */
export interface TraceStep {
    /** 这一帧的完整结构(中性场景 JSON 的形状) */
    readonly document: SceneDocument;
    /** 步骤标题(粗体一行) */
    readonly title: string;
    /** 步骤说明(最多两行;长文本由浮条省略) */
    readonly detail: string;
    /** 镜头对准的节点 key;不给 = 保持当前镜头 */
    readonly focus?: number;
    /** 镜头框住的一组节点 key(优先于 focus):旋转要一次看全 p / x / y / α / β / γ */
    readonly frame?: readonly number[];
    /** 镜头策略(默认 point;没有 focus / frame 时什么都不做) */
    readonly framing?: TraceFraming;
    /** 帧间锚定:这一帧的 anchor 节点尽量落在上一帧 anchorAt 节点的位置 */
    readonly anchor?: number;
    /** 锚定目标;缺省取上一帧的同名节点 */
    readonly anchorAt?: number;
    readonly marks?: TraceMarks;
    /** 从上一帧过渡到这一帧时的几何提示 */
    readonly motion?: TraceMotion;
    /** 覆盖默认停留时间(ms),快的机械步骤可以短一点 */
    readonly holdMs?: number;
    /** 这一拍直接硬切,不做帧间插值(章节换树时用) */
    readonly cut?: boolean;
}

/** 一章:进度条按章分组(章与章之间留缺口) */
export interface TraceChapter {
    readonly title: string;
    /** 本章第一拍在 steps 里的下标 */
    readonly firstStep: number;
    /** 本章的拍数 */
    readonly stepCount: number;
}

/** 一次演示的完整轨迹:标题 + 每帧要跑的检查 id + 全部步骤 */
export interface SceneTrace {
    readonly title: string;
    /** 每帧顺带跑的性质检查 id(与「检查配置」窗口同一套函数名) */
    readonly checkIds: readonly string[];
    readonly steps: readonly TraceStep[];
    readonly chapters: readonly TraceChapter[];
}

/**
 * 算法 yield 出来的"没有 document 的 TraceStep".
 *
 * document 由记录器在 yield 的那一刻向结构要快照:算法只需要"改完结构再 yield",
 * 不必自己拼 JSON,也不会不小心把改到一半的结构拍下来.
 */
export type TraceFrame = Omit<TraceStep, 'document'>;

/** 一次 yield 之后取一张快照;通常是 `() => tree.snapshot({ colors: true })` */
export type TraceSnapshot = () => SceneDocument;

/**
 * 把一串 TraceFrame 记成 TraceStep 数组:每 yield 一拍就立刻要一份快照.
 *
 * 生成器在 yield 之前必须已经完成这一拍的结构改动(见 docs/animation.md §5.4 的
 * "旋转的中间态不是树"):记录器看到的就是 yield 那一刻的完整结构.
 */
export function recordFrames(snapshot: TraceSnapshot, frames: Iterable<TraceFrame>): TraceStep[] {
    const steps: TraceStep[] = [];
    for (const frame of frames) {
        steps.push({ ...frame, document: snapshot() });
    }
    return steps;
}

/**
 * 轨迹记录器:按章追加 `TraceFrame`,并在 yield 时取快照.
 *
 * 用法:
 *
 * ```ts
 * const builder = new TraceBuilder('BST 原理', ['checkBstOrder'], () => tree.snapshot());
 * builder.chapter('查找 6', searchFrames(tree, 6));
 * const trace = builder.finish();
 * ```
 *
 * `chapter()` 只能追加(顺序即播放顺序);一章一帧都没有时不记空章,避免进度条上
 * 出现一段点不动的空白.
 */
export class TraceBuilder {
    private readonly steps: TraceStep[] = [];
    private readonly chapters: TraceChapter[] = [];

    constructor(
        readonly title: string,
        readonly checkIds: readonly string[],
        private readonly snapshot: TraceSnapshot,
    ) { }

    /** 追加一章:逐拍取快照,并记下这一章在 steps 里的区间 */
    chapter(title: string, frames: Iterable<TraceFrame>): this {
        const firstStep = this.steps.length;
        for (const frame of frames) this.steps.push({ ...frame, document: this.snapshot() });
        const stepCount = this.steps.length - firstStep;
        if (stepCount > 0) this.chapters.push({ title, firstStep, stepCount });
        return this;
    }

    /** 已经记下的拍数(章节之间要"换一棵树"时,调用方据此决定要不要 cut) */
    get stepCount(): number {
        return this.steps.length;
    }

    finish(): SceneTrace {
        return {
            title: this.title,
            checkIds: this.checkIds,
            steps: this.steps,
            chapters: this.chapters,
        };
    }
}

/** 操作序列里的一种操作(剧本 = 初始结构 + TreeOp[];自由操作沙盒也是同一个词表) */
export type TreeOp =
    | { readonly kind: 'search'; readonly value: number }
    | { readonly kind: 'insert'; readonly value: number }
    | { readonly kind: 'delete'; readonly value: number }
    | { readonly kind: 'traverse'; readonly order: 'in' | 'pre' | 'post' }
    | { readonly kind: 'rotate'; readonly direction: 'left' | 'right'; readonly value: number };
