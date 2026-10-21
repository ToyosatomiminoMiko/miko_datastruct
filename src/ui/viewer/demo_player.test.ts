/*
 * 演示播放器(ui/viewer/demo_player.ts)的契约:虚拟时钟推进、单步 / 回退 / 跳转、
 * 自动播放与停留、镜头请求、硬切 / reduce-motion、锚定后的取景坐标.
 *
 * 不碰 DOM:端口把"画了什么 / 列表换成哪拍 / 镜头去哪 / 状态是什么"记下来,
 * 时钟用手动时钟同步推进.
 */
import { describe, expect, it } from 'vitest';

import type { SceneDocument } from '@/scene/scene_document';
import type { SceneCheckResult } from '@/scene/scene_check';
import type { SceneTrace, TraceStep } from '@/datastruct/trace/trace';import { ManualClock } from '@/test_support/manual_clock';
import type { MotionScene } from '@/visual/motion';
import {
    cameraRequestForStep,
    createDemoPlayer,
    demoHoldMs,
    prepareTrace,
    type DemoCameraRequest,
    type DemoPlayerPorts,
    type DemoPlayerSnapshot,
} from '@/ui/viewer/demo_player';

/** 由 key 与 [from,to] 连接造一份最小文档 */
function documentOf(
    keys: readonly number[],
    pointers: readonly (readonly [number, number])[] = [],
): SceneDocument {
    return {
        nodes: keys.map((key) => ({ key, attrs: {} })),
        pointers: pointers.map(([from, to]) => ({ from, to })),
        edges: [],
    };
}

/** 一步:文档 + 标题 / 说明 + 可选提示 */
function stepOf(
    document: SceneDocument,
    title: string,
    options: Partial<Omit<TraceStep, 'document' | 'title' | 'detail'>> & { detail?: string } = {},
): TraceStep {
    const { detail = '', ...rest } = options;
    return { document, title, detail, holdMs: 64, ...rest };
}

/** 一条 3 步的小轨迹:同一点的查找,只有高亮变化 */
function tinyTrace(): SceneTrace {
    const document = documentOf([0, 1], [[0, 1]]);
    const steps: TraceStep[] = [
        stepOf(document, '第一步', { focus: 0, framing: 'point' }),
        stepOf(document, '第二步', { focus: 1, framing: 'point' }),
        stepOf(document, '第三步', { framing: 'hold' }),
    ];
    return {
        title: '测试剧本',
        checkIds: [],
        steps,
        chapters: [{ title: '一章', firstStep: 0, stepCount: 3 }],
    };
}

/** 记录端口:画了什么、列表换到哪拍、镜头去了哪、状态是什么 */
function recordingPorts(): {
    ports: DemoPlayerPorts;
    paints: number[];
    settled: MotionScene[];
    shown: number[];
    cameras: { request: DemoCameraRequest; instant: boolean }[];
    states: DemoPlayerSnapshot[];
    checks: (readonly SceneCheckResult[])[];
} {
    const paints: number[] = [];
    const settled: MotionScene[] = [];
    const shown: number[] = [];
    const cameras: { request: DemoCameraRequest; instant: boolean }[] = [];
    const states: DemoPlayerSnapshot[] = [];
    const checks: (readonly SceneCheckResult[])[] = [];
    const ports: DemoPlayerPorts = {
        paint: (_scene, progress) => paints.push(progress),
        settle: (scene) => settled.push(scene),
        showStep: (index, _step, stepChecks) => {
            shown.push(index);
            checks.push(stepChecks);
        },
        camera: (request, options) => cameras.push({ request, instant: options.instant }),
        state: (snapshot) => states.push(snapshot),
    };
    return { ports, paints, settled, shown, cameras, states, checks };
}

/** 推进足够多帧,让 420ms 的过渡 + 64ms 的停留都走完 */
function advanceAll(clock: ManualClock): void {
    clock.advanceFrames(80, 16);
}

describe('预处理:锚定与取景', () => {
    it('显式 anchor 让这一拍布局的节点落在上一拍 anchorAt 的位置', () => {
        const before = documentOf([0, 1]);
        const after = documentOf([0, 1, 2]);
        const trace: SceneTrace = {
            title: '锚定',
            checkIds: [],
            steps: [
                stepOf(before, '有 0/1'),
                stepOf(after, '插入 2', { anchor: 0, anchorAt: 0 }),
            ],
            chapters: [],
        };
        const prepared = prepareTrace(trace);
        const first = prepared[0]!.layout;
        const second = prepared[1]!.layout;
        const firstPoint = first.nodes.find((node) => node.key === 0);
        const secondPoint = second.nodes.find((node) => node.key === 0);
        expect(secondPoint?.x).toBeCloseTo(firstPoint?.x ?? 0, 9);
        expect(secondPoint?.y).toBeCloseTo(firstPoint?.y ?? 0, 9);
    });

    it('cameraRequestForStep:fit 框全部节点,frame 框一组,hold / 无提示返回 null', () => {
        const document = documentOf([0, 1, 2], [[0, 1], [0, 2]]);
        const prepared = prepareTrace({
            title: '取景',
            checkIds: [],
            steps: [stepOf(document, '整幅', { framing: 'fit' })],
            chapters: [],
        });
        const points = prepared[0]!.points;
        expect(cameraRequestForStep({ ...prepared[0]!.step, framing: 'fit' }, points))
            .toMatchObject({ kind: 'fit' });
        expect(cameraRequestForStep({ ...prepared[0]!.step, framing: 'point', frame: [1, 2] }, points))
            .toMatchObject({ kind: 'frame' });
        expect(cameraRequestForStep({ ...prepared[0]!.step, framing: 'point', focus: 1 }, points))
            .toMatchObject({ kind: 'point' });
        expect(cameraRequestForStep({ ...prepared[0]!.step, framing: 'hold', focus: 1 }, points)).toBeNull();
        expect(cameraRequestForStep({ ...prepared[0]!.step, framing: 'point' }, points)).toBeNull();
    });

    it('停留时长:显式 holdMs 优先,否则按标题 + 说明字数估并夹在 700~1800', () => {
        expect(demoHoldMs({ document: documentOf([]), title: 't', detail: '', holdMs: 120 })).toBe(120);
        expect(demoHoldMs({ document: documentOf([]), title: '', detail: '' })).toBe(700);
        expect(demoHoldMs({ document: documentOf([]), title: '很长'.repeat(100), detail: '' })).toBe(1800);
        const medium = demoHoldMs({ document: documentOf([]), title: '标题', detail: '说明'.repeat(10) });
        expect(medium).toBeGreaterThan(700);
        expect(medium).toBeLessThan(1800);
    });
});

describe('播放器:构造与单步', () => {
    it('构造时落到第 0 拍:settle + 列表 + 点镜头(instant),状态 paused', () => {
        const clock = new ManualClock();
        const recorder = recordingPorts();
        createDemoPlayer({ trace: tinyTrace(), ports: recorder.ports, clock, transitionMs: 100 });

        expect(recorder.shown).toEqual([0]);
        expect(recorder.settled).toHaveLength(1);
        expect(recorder.states[recorder.states.length - 1]).toMatchObject({ status: 'paused', step: 0, total: 3 });
        expect(recorder.cameras).toHaveLength(1);
        expect(recorder.cameras[0]).toMatchObject({ request: { kind: 'point' }, instant: true });
    });

    it('next():过渡到下一步,过渡完自动暂停;中间帧由时钟驱动', () => {
        const clock = new ManualClock();
        const recorder = recordingPorts();
        const player = createDemoPlayer({
            trace: tinyTrace(),
            ports: recorder.ports,
            clock,
            transitionMs: 100,
        });
        const paintsAfterConstruct = recorder.paints.length;

        player.next();
        // 过渡开始:立刻画 t=0,列表先换成目标步
        expect(recorder.paints.length).toBeGreaterThan(paintsAfterConstruct);
        expect(recorder.shown[recorder.shown.length - 1]).toBe(1);
        expect(player.snapshot).toMatchObject({ status: 'paused', step: 1 });

        clock.advanceFrames(10, 16);
        // 100ms 的过渡走完:落定第二拍,不再有帧排队
        expect(clock.pendingCount).toBe(0);
        expect(recorder.shown[recorder.shown.length - 1]).toBe(1);
        expect(recorder.settled).toHaveLength(2);
        expect(player.snapshot).toMatchObject({ status: 'paused', step: 1 });
    });

    it('prev() / seek():瞬移,不做反向动画;goal 夹在首尾', () => {
        const clock = new ManualClock();
        const recorder = recordingPorts();
        const player = createDemoPlayer({
            trace: tinyTrace(),
            ports: recorder.ports,
            clock,
            transitionMs: 100,
        });
        const paintsAfterConstruct = recorder.paints.length;

        player.seek(2);
        expect(player.snapshot.step).toBe(2);
        expect(recorder.paints).toHaveLength(paintsAfterConstruct);
        expect(recorder.shown[recorder.shown.length - 1]).toBe(2);

        player.prev();
        expect(player.snapshot.step).toBe(1);
        player.prev();
        player.prev();
        expect(player.snapshot.step).toBe(0);
    });

    it('播放状态下 next() 也先暂停,过渡完不自动继续', () => {
        const clock = new ManualClock();
        const recorder = recordingPorts();
        const player = createDemoPlayer({
            trace: tinyTrace(),
            ports: recorder.ports,
            clock,
            transitionMs: 100,
        });
        player.play();
        expect(player.snapshot.status).toBe('playing');
        clock.advanceFrames(2, 16);

        // 过渡中点 next:先把当前过渡落定到目标(1),再向下一步(2)过渡,完成后暂停
        player.next();
        expect(player.snapshot.status).toBe('paused');
        advanceAll(clock);
        expect(player.snapshot.step).toBe(2);
        expect(player.snapshot.status).toBe('paused');
    });
});

describe('播放器:自动播放 / 速度 / reduce-motion', () => {
    it('play() 自动逐拍前进,播完最后一拍停在完成态并暂停', () => {
        const clock = new ManualClock();
        const recorder = recordingPorts();
        const player = createDemoPlayer({
            trace: tinyTrace(),
            ports: recorder.ports,
            clock,
            transitionMs: 64,
        });

        player.play();
        // 3 拍:2 段过渡 + 2 段停留;多推几轮确保走完
        for (let round = 0; round < 12; round += 1) clock.advanceFrames(20, 16);
        expect(player.snapshot.step).toBe(2);
        expect(player.snapshot.status).toBe('paused');
        expect(clock.pendingCount).toBe(0);
    });

    it('2× 速度:同样的虚拟帧数走得更远', () => {
        const clock = new ManualClock();
        const recorder = recordingPorts();
        const player = createDemoPlayer({
            trace: tinyTrace(),
            ports: recorder.ports,
            clock,
            transitionMs: 100,
        });
        player.setSpeed(2);
        expect(player.snapshot.speed).toBe(2);

        player.play();
        clock.advanceFrames(5, 16);
        // 2× 下 80ms 已经接近 100ms 过渡的终点(1× 只走 40%)
        expect(recorder.paints[recorder.paints.length - 1]).toBeGreaterThan(0.5);
    });

    it('reduce-motion:过渡直接落定,不排动画帧,步骤仍可前进', () => {
        const clock = new ManualClock();
        const recorder = recordingPorts();
        const player = createDemoPlayer({
            trace: tinyTrace(),
            ports: recorder.ports,
            clock,
            transitionMs: 100,
            reducedMotion: true,
        });
        const paintsAfterConstruct = recorder.paints.length;

        player.next();
        expect(player.snapshot.step).toBe(1);
        expect(recorder.paints).toHaveLength(paintsAfterConstruct);
        expect(clock.pendingCount).toBe(0);
        expect(recorder.settled).toHaveLength(2);
    });

    it('cut 帧:结构完全换掉时直接硬切,不做帧间插值', () => {
        const clock = new ManualClock();
        const recorder = recordingPorts();
        const first = documentOf([0, 1], [[0, 1]]);
        const cut = documentOf([9, 8], [[9, 8]]);
        const trace: SceneTrace = {
            title: '硬切',
            checkIds: [],
            steps: [
                stepOf(first, '旧树'),
                stepOf(cut, '新树', { cut: true, framing: 'fit' }),
            ],
            chapters: [],
        };
        const player = createDemoPlayer({ trace, ports: recorder.ports, clock, transitionMs: 100 });
        const paintsAfterConstruct = recorder.paints.length;

        player.next();
        expect(player.snapshot.step).toBe(1);
        expect(recorder.paints).toHaveLength(paintsAfterConstruct);
        expect(clock.pendingCount).toBe(0);
    });
});

describe('播放器:镜头跟随', () => {
    it('framing:hold 的拍不发镜头请求;关掉跟随后不再发', () => {
        const clock = new ManualClock();
        const recorder = recordingPorts();
        const player = createDemoPlayer({
            trace: tinyTrace(),
            ports: recorder.ports,
            clock,
            transitionMs: 64,
        });
        const cameraCount = recorder.cameras.length;

        player.seek(2); // 第三拍 framing:'hold'
        expect(recorder.cameras).toHaveLength(cameraCount);

        player.setFollow(false);
        player.seek(1);
        expect(recorder.cameras).toHaveLength(cameraCount);

        // 重新打开跟随:立刻按当前拍补一次镜头
        player.setFollow(true);
        expect(recorder.cameras.length).toBeGreaterThan(cameraCount);
    });
});
