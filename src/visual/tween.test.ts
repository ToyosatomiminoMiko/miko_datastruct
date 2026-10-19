/*
 * 补间引擎(visual/tween.ts)的契约:缓动端点、进度单调、时钟可注入、单帧 delta 夹取、
 * 取消 / 外部 abort.
 *
 * 全部用手动时钟同步推进:不依赖 rAF,也不受测试机调度影响.
 */
import { describe, expect, it } from 'vitest';

import { ManualClock } from '@/test_support/manual_clock';
import {
    TWEEN_MAX_DELTA_MS,
    easeInOutCubic,
    easeOutCubic,
    linearEasing,
    tween,
} from '@/visual/tween';

describe('缓动函数', () => {
    it('easeInOutCubic:e(0)=0 / e(0.5)=0.5 / e(1)=1,单调递增', () => {
        expect(easeInOutCubic(0)).toBe(0);
        expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 9);
        expect(easeInOutCubic(1)).toBe(1);
        let previous = -1;
        for (let step = 0; step <= 100; step += 1) {
            const value = easeInOutCubic(step / 100);
            expect(value).toBeGreaterThanOrEqual(previous);
            previous = value;
        }
    });

    it('easeOutCubic 也是 0 -> 1 且起步快(中点超过线性)', () => {
        expect(easeOutCubic(0)).toBe(0);
        expect(easeOutCubic(1)).toBe(1);
        expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    });
});

describe('tween:虚拟时钟', () => {
    it('先同步回调 e(0),再按时间推进到 1 并回调 onDone 一次', () => {
        const clock = new ManualClock();
        const updates: number[] = [];
        let doneCount = 0;

        tween({
            duration: 100,
            easing: linearEasing,
            clock,
            onUpdate: (progress) => updates.push(progress),
            onDone: () => { doneCount += 1; },
        });

        expect(updates).toEqual([0]);
        clock.advance(25);
        expect(updates[updates.length - 1]).toBeCloseTo(0.25, 9);
        clock.advance(25);
        expect(updates[updates.length - 1]).toBeCloseTo(0.5, 9);
        clock.advance(50);
        expect(updates[updates.length - 1]).toBe(1);
        expect(doneCount).toBe(1);
        expect(clock.pendingCount).toBe(0);
    });

    it('单帧 delta 夹到 TWEEN_MAX_DELTA_MS:后台标签页回来不会一帧跳完', () => {
        const clock = new ManualClock();
        const updates: number[] = [];
        tween({
            duration: 1000,
            easing: linearEasing,
            clock,
            onUpdate: (progress) => updates.push(progress),
        });

        // 一帧差 5000ms:只按 50ms 算
        clock.advance(5000);
        expect(updates[updates.length - 1]).toBeCloseTo(TWEEN_MAX_DELTA_MS / 1000, 9);
        expect(updates[updates.length - 1]).toBeLessThan(1);

        // 剩下的时间继续走完
        for (let index = 0; index < 25; index += 1) clock.advance(TWEEN_MAX_DELTA_MS);
        expect(updates[updates.length - 1]).toBe(1);
    });

    it('cancel 之后不再收到回调,也不再排帧', () => {
        const clock = new ManualClock();
        const updates: number[] = [];
        const handle = tween({
            duration: 100,
            easing: linearEasing,
            clock,
            onUpdate: (progress) => updates.push(progress),
        });
        clock.advance(20);
        handle.cancel();
        const count = updates.length;
        clock.advance(1000);
        expect(updates).toHaveLength(count);
        expect(clock.pendingCount).toBe(0);
    });

    it('外部 AbortSignal 等价于 cancel', () => {
        const clock = new ManualClock();
        const updates: number[] = [];
        const abort = new AbortController();
        tween({
            duration: 100,
            easing: linearEasing,
            clock,
            signal: abort.signal,
            onUpdate: (progress) => updates.push(progress),
        });
        clock.advance(20);
        abort.abort();
        const count = updates.length;
        clock.advance(1000);
        expect(updates).toHaveLength(count);
        expect(clock.pendingCount).toBe(0);
    });

    it('duration <= 0 时同步落到 1(先 e(0) 再 e(1))', () => {
        const clock = new ManualClock();
        const updates: number[] = [];
        let done = 0;
        tween({
            duration: 0,
            easing: linearEasing,
            clock,
            onUpdate: (progress) => updates.push(progress),
            onDone: () => { done += 1; },
        });
        expect(updates).toEqual([0, 1]);
        expect(done).toBe(1);
        expect(clock.pendingCount).toBe(0);
    });
});
