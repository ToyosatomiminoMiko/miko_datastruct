/*
 * 演示播放器:回放一条 `SceneTrace` 的状态机 + 虚拟时钟 + 镜头指令.
 *
 * 这一层不认识 BST / 红黑树:拿到 `SceneTrace` 之后只认"步骤 / 文档 / 叙述 / 提示".
 * 它负责三件事:
 *
 * 1. **时间**:过渡(结构动画)与停留(叙述 hold)两条时间线,共享一个可注入的虚拟
 *    时钟;`next()` 走过渡后自动暂停,`prev()/seek()` 是瞬移(不做反向动画,
 *    见 docs/animation.md §3);
 * 2. **中间帧**:从"上一拍落定场景"插值到"这一拍落定场景"(visual/motion.ts),
 *    交给落笔端口;插值前两帧布局已经按 anchor 对齐(visual/anchor.ts);
 * 3. **镜头**:每拍按 `focus / frame / framing` 发一条镜头请求;用户关掉「跟随镜头」
 *    后不再发;`framing: 'hold'`(旋转这类看局部的步骤)完全不动镜头.
 *
 * 为什么要端口(ports)而不是直接抓 DOM:
 * - 纯逻辑测试可以注入手动时钟 + 记录端口,同步断言"第几步画了什么、镜头去了哪";
 * - 落笔 / 检查列表 / 控制条分属不同层,播放器只发指令,不 import 它们.
 *
 * 减少动态效果(reduced-motion)下:结构过渡与镜头都瞬移,但步骤仍可自动 / 手动前进.
 */

import type { SceneCheckResult } from '@/scene/scene_check';
import type { SceneNodeKey } from '@/scene/scene_document';
import { runSceneChecks } from '@/datastruct/checks';
import type { SceneTrace, TraceStep } from '@/datastruct/trace/trace';
import { autoAnchorLayout, anchorLayout } from '@/visual/anchor';
import { layoutScene, type SceneLayout } from '@/visual/layout';
import {
    interpolateScenes,
    sceneFromLayout,
    type MotionScene,
    type VariantOf,
} from '@/visual/motion';
import type { VisualPoint } from '@/visual/scene';
import {
    TWEEN_MAX_DELTA_MS,
    easeInOutCubic,
    type TweenClock,
} from '@/visual/tween';

/** 结构过渡的默认时长(ms):docs/animation.md §3 的 240–520 区间取中 */
export const DEMO_TRANSITION_MS = 420;

/** 叙述停留:没给 holdMs 时按"字数"估,夹在 700–1800ms */
export const DEMO_HOLD_MIN_MS = 700;
export const DEMO_HOLD_MAX_MS = 1800;

/** 播放器对外状态(控制条按它刷新按钮 / 进度 / 速度) */
export interface DemoPlayerSnapshot {
    readonly status: 'idle' | 'playing' | 'paused';
    /** 当前步骤(过渡中 = 目标步骤) */
    readonly step: number;
    readonly total: number;
    readonly speed: number;
    /** 「跟随镜头」开关 */
    readonly follow: boolean;
}

/** 镜头请求:世界坐标里的点 / 一组点;播放器不知道视口多大,换算归 ui 层 */
export type DemoCameraRequest =
    | { readonly kind: 'point'; readonly point: VisualPoint }
    | { readonly kind: 'frame'; readonly points: readonly VisualPoint[] }
    | { readonly kind: 'fit'; readonly points: readonly VisualPoint[] };

/** 播放器的副作用端口(落笔 / 列表 / 镜头 / 状态) */
export interface DemoPlayerPorts {
    /** 画一帧中间态(t = 这一拍的过渡进度;落笔层据 opacity / entering 处理进出场) */
    paint(scene: MotionScene, progress: number): void;
    /** 落到确定的一帧:写精确值、移除退场元素(落笔层会量一次包围盒) */
    settle(scene: MotionScene): void;
    /**
     * 列表 / 检查窗口 / 控制条换成这一拍.
     *
     * 同时给出**锚定后的布局**:行末「定位」要按画面上真实坐标飞过去,而不是按
     * 未锚定的原始布局(两者差一次整帧平移).
     */
    showStep(
        index: number,
        step: TraceStep,
        checks: readonly SceneCheckResult[],
        layout: SceneLayout,
    ): void;
    /** 镜头请求;`instant` = 不做过渡(seek / 硬切 / reduce-motion) */
    camera(request: DemoCameraRequest, options: { readonly instant: boolean }): void;
    /** 播放状态变化 */
    state(snapshot: DemoPlayerSnapshot): void;
}

/** `createDemoPlayer()` 的输入 */
export interface DemoPlayerOptions {
    readonly trace: SceneTrace;
    readonly ports: DemoPlayerPorts;
    readonly clock: TweenClock;
    /** 减少动态效果:过渡 / 镜头瞬移,步骤照常前进 */
    readonly reducedMotion?: boolean;
    /** document.attrs -> 视觉变体(红黑树颜色);不传则没有结构变体 */
    readonly variantOf?: VariantOf;
    /** 结构过渡时长覆盖(测试 / 调参用) */
    readonly transitionMs?: number;
}

/** 播放器句柄:命令 + 只读快照 */
export interface DemoPlayerHandle {
    /** 当前状态(每次变化后复制出来,调用方不必自己缓存) */
    readonly snapshot: DemoPlayerSnapshot;
    play(): void;
    pause(): void;
    toggle(): void;
    /** 过渡到下一步,过渡完自动暂停 */
    next(): void;
    /** 瞬移到上一步完成态 */
    prev(): void;
    /** 瞬移到第 i 步完成态(拖进度条 / 跳章) */
    seek(index: number): void;
    setSpeed(speed: number): void;
    setFollow(follow: boolean): void;
    dispose(): void;
}

/** 一拍预处理后的结果:锚定布局 + 落定场景 + 检查结论 */
interface PreparedStep {
    readonly step: TraceStep;
    readonly layout: SceneLayout;
    readonly scene: MotionScene;
    readonly checks: readonly SceneCheckResult[];
    /** 节点 key -> 锚定后的世界位置(镜头取景用) */
    readonly points: ReadonlyMap<SceneNodeKey, VisualPoint>;
}

/**
 * 单调时钟的差值夹取:后台标签页回来时 RAF 的差可能是几秒,夹到
 * {@link TWEEN_MAX_DELTA_MS} 避免一帧跳完整个过渡(docs/animation.md §13.9).
 */
function frameDelta(now: number, last: number): number {
    return Math.min(Math.max(now - last, 0), TWEEN_MAX_DELTA_MS);
}

/** 叙述停留时长:显式 holdMs 优先,否则按标题 + 说明的字数估 */
export function demoHoldMs(step: TraceStep): number {
    if (step.holdMs !== undefined) return step.holdMs;
    const textLength = step.title.length + step.detail.length;
    return Math.min(Math.max(DEMO_HOLD_MIN_MS + 24 * textLength, DEMO_HOLD_MIN_MS), DEMO_HOLD_MAX_MS);
}

/**
 * 预处理整条轨迹:逐拍布局,按上一拍做锚定,造落定场景并跑检查.
 *
 * 锚定优先级:
 * 1. 这一拍 `cut`(章节换树):不锚,直接用自己的布局;
 * 2. 这一拍显式给了 `anchor`:按 `anchorAt`(缺省同名 key)平移;
 * 3. 否则自动锚到"上一拍里 key 最小的共同节点":机械步骤(纯高亮)因此不会整棵树滑.
 *
 * 检查逐拍跑一次:红黑树 fixup 中途会 FAIL,这是教学内容,不当作错误(§13.11).
 */
export function prepareTrace(
    trace: SceneTrace,
    options: { readonly variantOf?: VariantOf } = {},
): PreparedStep[] {
    const prepared: PreparedStep[] = [];
    let previousLayout: SceneLayout | null = null;
    for (const step of trace.steps) {
        const raw = layoutScene(step.document);
        let layout: SceneLayout;
        if (previousLayout === null || step.cut) {
            layout = raw;
        } else if (step.anchor !== undefined) {
            layout = anchorLayout(raw, previousLayout, { anchor: step.anchor, anchorAt: step.anchorAt });
        } else {
            layout = autoAnchorLayout(raw, previousLayout);
        }
        previousLayout = layout;

        const scene = sceneFromLayout(step.document, layout, {
            marks: step.marks,
            variantOf: options.variantOf,
        });
        const points = new Map<SceneNodeKey, VisualPoint>(
            scene.nodes.map((node) => [node.key, node.at] as const),
        );
        prepared.push({
            step,
            layout,
            scene,
            points,
            checks: runSceneChecks(step.document, trace.checkIds).checks,
        });
    }
    return prepared;
}

/** 一拍的镜头请求;`null` = 保持当前镜头(没有 focus / frame / fit) */
export function cameraRequestForStep(step: TraceStep, points: ReadonlyMap<SceneNodeKey, VisualPoint>): DemoCameraRequest | null {
    if (step.framing === 'hold') return null;
    if (step.framing === 'fit') {
        const all = [...points.values()];
        return all.length === 0 ? null : { kind: 'fit', points: all };
    }
    if (step.frame !== undefined && step.frame.length > 0) {
        const framed = step.frame
            .map((key) => points.get(key))
            .filter((point): point is VisualPoint => point !== undefined);
        if (framed.length > 0) return { kind: 'frame', points: framed };
    }
    if (step.focus !== undefined) {
        const point = points.get(step.focus);
        if (point !== undefined) return { kind: 'point', point };
    }
    return null;
}

/**
 * 建一个演示播放器.
 *
 * 构造时立刻落到第 0 拍(调用方在此之后再显示控制窗口):先把场景落定,再发第 0 拍的
 * 镜头请求(instant).之后所有时间推进都由 `clock` 驱动.
 */
export function createDemoPlayer(options: DemoPlayerOptions): DemoPlayerHandle {
    const { trace, ports, clock } = options;
    const reducedMotion = options.reducedMotion ?? false;
    const transitionMs = options.transitionMs ?? DEMO_TRANSITION_MS;
    const prepared = prepareTrace(trace, { variantOf: options.variantOf });
    const total = prepared.length;

    /** 最后一次落定的步骤 */
    let current = 0;
    /** 正在进行的结构过渡 */
    let transition: { readonly from: number; readonly to: number; elapsed: number } | null = null;
    /** 播放中的叙述停留 */
    let hold: { left: number } | null = null;
    let status: DemoPlayerSnapshot['status'] = 'paused';
    let speed = 1;
    let follow = true;
    let rafHandle: number | null = null;
    let lastNow = clock.now();

    const snapshot = (): DemoPlayerSnapshot => ({
        status,
        step: transition?.to ?? current,
        total,
        speed,
        follow,
    });

    let lastSnapshot = snapshot();
    const publish = (): void => {
        lastSnapshot = snapshot();
        ports.state(lastSnapshot);
    };

    const stopLoop = (): void => {
        if (rafHandle !== null) {
            clock.cancel(rafHandle);
            rafHandle = null;
        }
    };

    const issueCamera = (index: number, instant: boolean): void => {
        if (!follow) return;
        const request = cameraRequestForStep(prepared[index]!.step, prepared[index]!.points);
        if (request === null) return;
        ports.camera(request, { instant: instant || reducedMotion });
    };

    /** 落定到第 index 拍:场景 / 列表 / 镜头全部换过去 */
    const settleStep = (index: number): void => {
        current = index;
        transition = null;
        hold = null;
        const frame = prepared[index]!;
        ports.settle(frame.scene);
        ports.showStep(index, frame.step, frame.checks, frame.layout);
        issueCamera(index, true);
        publish();
    };

    const startTransition = (to: number): void => {
        if (to <= current || to >= total) return;
        stopLoop();
        const target = prepared[to]!;
        // 硬切:章节换树 / reduce-motion.硬切也要走"落定 -> 停留"的同一条收尾路径,
        // 否则自动播放会在这一拍停住.
        if (target.step.cut || reducedMotion) {
            settleStep(to);
            if (status === 'playing') {
                hold = { left: demoHoldMs(target.step) };
                ensureLoop();
            }
            return;
        }
        transition = { from: current, to, elapsed: 0 };
        ports.showStep(to, target.step, target.checks, target.layout);
        issueCamera(to, false);
        ports.paint(interpolateScenes(prepared[current]!.scene, target.scene, 0, target.step.motion), 0);
        publish();
        ensureLoop();
    };

    const completeTransition = (): void => {
        const to = transition?.to;
        transition = null;
        if (to === undefined) return;
        settleStep(to);
        if (status === 'playing') {
            hold = { left: demoHoldMs(prepared[to]!.step) };
        }
    };

    /** 自动播放时的"下一拍":播到最后一拍就停在完成态并暂停 */
    const advance = (): void => {
        if (status !== 'playing') return;
        if (current + 1 >= total) {
            status = 'paused';
            publish();
            stopLoop();
            return;
        }
        startTransition(current + 1);
    };

    let tick: (now: number) => void;

    const ensureLoop = (): void => {
        if (rafHandle !== null) return;
        // 没有工作可做时不要空转:暂停且没有过渡 / 停留就停
        if (transition === null && hold === null && status !== 'playing') return;
        lastNow = clock.now();
        rafHandle = clock.request(tick);
    };

    tick = (now: number): void => {
        rafHandle = null;
        const delta = frameDelta(now, lastNow) * speed;
        lastNow = now;
        if (transition !== null) {
            transition.elapsed += delta;
            const progress = Math.min(transition.elapsed / transitionMs, 1);
            ports.paint(
                interpolateScenes(
                    prepared[transition.from]!.scene,
                    prepared[transition.to]!.scene,
                    easeInOutCubic(progress),
                    prepared[transition.to]!.step.motion,
                ),
                progress,
            );
            if (progress >= 1) {
                completeTransition();
                if (status === 'playing') ensureLoop();
                return;
            }
        } else if (hold !== null) {
            hold.left -= delta;
            if (hold.left <= 0) {
                hold = null;
                advance();
            }
        }
        ensureLoop();
    };

    /** 瞬移完成后统一收尾:过渡丢掉、停留丢掉 */
    const jumpTo = (index: number): void => {
        stopLoop();
        transition = null;
        hold = null;
        settleStep(Math.min(Math.max(index, 0), total - 1));
    };

    // 构造:先落到第 0 拍.空轨迹(理论上不会出现)时什么都不画.
    if (total > 0) {
        const first = prepared[0]!;
        ports.settle(first.scene);
        ports.showStep(0, first.step, first.checks, first.layout);
        issueCamera(0, true);
        publish();
    } else {
        ports.state({ ...snapshot(), total: 0 });
    }

    const handle: DemoPlayerHandle = {
        get snapshot(): DemoPlayerSnapshot {
            return lastSnapshot;
        },
        play(): void {
            if (status === 'playing') return;
            status = 'playing';
            // 播到最后一拍再按播放 = 从第一步重放(docs/animation.md §9.3)
            if (current + 1 >= total && transition === null && hold === null) {
                settleStep(0);
                if (total > 1) startTransition(1);
            } else if (transition === null && hold === null) {
                startTransition(current + 1);
            }
            publish();
            ensureLoop();
        },
        pause(): void {
            if (status === 'paused') return;
            status = 'paused';
            stopLoop();
            publish();
        },
        toggle(): void {
            if (status === 'playing') handle.pause();
            else handle.play();
        },
        next(): void {
            status = 'paused';
            stopLoop();
            if (transition !== null) {
                const to = transition.to;
                transition = null;
                hold = null;
                settleStep(to);
            } else {
                hold = null;
            }
            if (current + 1 < total) startTransition(current + 1);
            else publish();
        },
        prev(): void {
            status = 'paused';
            jumpTo(current - 1);
        },
        seek(index: number): void {
            status = 'paused';
            jumpTo(index);
        },
        setSpeed(next: number): void {
            speed = next;
            publish();
        },
        setFollow(next: boolean): void {
            follow = next;
            publish();
            if (follow) issueCamera(transition?.to ?? current, false);
        },
        dispose(): void {
            stopLoop();
            transition = null;
            hold = null;
            status = 'paused';
        },
    };

    return handle;
}
