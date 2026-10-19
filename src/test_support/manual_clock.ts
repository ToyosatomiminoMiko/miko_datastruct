/*
 * 测试用的**手动时钟**:不让测试依赖 `requestAnimationFrame` / `setTimeout`.
 *
 * 播放器与视口镜头都接受 `TweenClock`;测试推进 `advance()` 就能同步走完动画,
 * 断言任意中间帧.这不是 miko_ui 的件,也不参与生产构建(`*.test.ts` 之外只有测试
 * 显式 import 它).
 */
import type { TweenClock } from '@/visual/tween';

export class ManualClock implements TweenClock {
    private time: number;
    private nextId = 1;
    private readonly pending = new Map<number, (now: number) => void>();

    constructor(start = 0) {
        this.time = start;
    }

    now(): number {
        return this.time;
    }

    request(callback: (now: number) => void): number {
        const id = this.nextId;
        this.nextId += 1;
        this.pending.set(id, callback);
        return id;
    }

    cancel(handle: number): void {
        this.pending.delete(handle);
    }

    /** 还没触发的回调数(测试断言"循环停了"用) */
    get pendingCount(): number {
        return this.pending.size;
    }

    /**
     * 时间前进 `ms`,并触发*这一次*已排队的回调.
     *
     * 回调里新排的回调留到下一次 `advance()`:等价于浏览器的"每帧一次".
     */
    advance(ms: number): void {
        this.time += ms;
        const callbacks = [...this.pending.values()];
        this.pending.clear();
        for (const callback of callbacks) callback(this.time);
    }

    /** 连续推进 `frames` 帧(默认每帧 16ms) */
    advanceFrames(frames: number, stepMs = 16): void {
        for (let index = 0; index < frames; index += 1) this.advance(stepMs);
    }
}
