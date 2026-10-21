/*
 * 演示步骤目录(ui/viewer/demo_outline.ts)的行为契约.
 *
 * 目录本身不碰窗口系统:它只吃一条轨迹、按章建列表、把播放器快照里的当前步挪成
 * 高亮,并把点击转成 `onSeek`.窗口外壳 / 显隐 / 几何在 demo_window.ts 与
 * demo_mode.test.ts 里验.
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    DEMO_OUTLINE_CHAPTER_CLASS,
    DEMO_OUTLINE_CHAPTER_HEAD_CLASS,
    DEMO_OUTLINE_COLLAPSE_CLASS,
    DEMO_OUTLINE_CURRENT_CLASS,
    DEMO_OUTLINE_LIST_CLASS,
    DEMO_OUTLINE_PAST_CLASS,
    DEMO_OUTLINE_STEP_CLASS,
    DEMO_OUTLINE_SUMMARY_CLASS,
    createDemoOutline,
} from '@/ui/viewer/demo_outline';
import type { DemoPlayerSnapshot } from '@/ui/viewer/demo_player';
import { findDemoScenario } from '@/ui/viewer/demo_scenarios';

/** BST 原理剧本:章多、步多,足够覆盖分组与跳转 */
function bstTrace() {
    const scenario = findDemoScenario('bst-basics');
    if (scenario === undefined) throw new Error('缺少 bst-basics 剧本');
    return scenario.build();
}

/** 播放器快照(目录只读 step / total) */
function snapshot(step: number, total: number): DemoPlayerSnapshot {
    return { status: 'paused', step, total, speed: 1, follow: true };
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('演示步骤目录:结构', () => {
    it('按章分组列出全部步骤;摘要给章数与步数', () => {
        const trace = bstTrace();
        const outline = createDemoOutline({ trace, onSeek: () => undefined });
        document.body.append(outline.element);

        expect(outline.element.querySelectorAll(`.${DEMO_OUTLINE_CHAPTER_CLASS}`))
            .toHaveLength(trace.chapters.length);
        const rows = [...outline.element.querySelectorAll<HTMLElement>(`.${DEMO_OUTLINE_STEP_CLASS}`)];
        expect(rows).toHaveLength(trace.steps.length);
        expect(rows[0]?.textContent).toContain(trace.steps[0]?.title ?? '');
        expect(outline.element.querySelector(`.${DEMO_OUTLINE_SUMMARY_CLASS}`)?.textContent)
            .toBe(`${trace.chapters.length} 章 · ${trace.steps.length} 步`);
        // 滚动条外观归库:滚动容器自己必须挂 ui-scrollbar(::-webkit-scrollbar 不可继承)
        expect(outline.element.querySelector(`.${DEMO_OUTLINE_LIST_CLASS}`)?.classList.contains('ui-scrollbar'))
            .toBe(true);

        outline.dispose();
        expect(document.body.contains(outline.element)).toBe(false);
    });

    it('每章标题给出章序与步数,并带跳到本章第一步的点击目标', () => {
        const trace = bstTrace();
        const outline = createDemoOutline({ trace, onSeek: () => undefined });
        document.body.append(outline.element);

        const chapterHeads = [
            ...outline.element.querySelectorAll<HTMLElement>(`.${DEMO_OUTLINE_CHAPTER_HEAD_CLASS}`),
        ];
        expect(chapterHeads).toHaveLength(trace.chapters.length);
        for (const [index, chapter] of trace.chapters.entries()) {
            const head = chapterHeads[index];
            expect(head?.dataset.chapterStep).toBe(String(chapter.firstStep));
            expect(head?.textContent).toContain(chapter.title);
            expect(head?.textContent).toContain(`${chapter.stepCount} 步`);
        }

        outline.dispose();
    });
});

describe('演示步骤目录:跳转与高亮', () => {
    it('点步骤 / 点章头都转成 onSeek', () => {
        const trace = bstTrace();
        const onSeek = vi.fn();
        const outline = createDemoOutline({ trace, onSeek });
        document.body.append(outline.element);

        const rows = outline.element.querySelectorAll<HTMLElement>(`.${DEMO_OUTLINE_STEP_CLASS}`);
        rows[5]?.click();
        expect(onSeek).toHaveBeenLastCalledWith(5);

        const secondChapter = trace.chapters[1];
        if (secondChapter === undefined) throw new Error('剧本至少要有两章');
        outline.element
            .querySelectorAll<HTMLElement>(`.${DEMO_OUTLINE_CHAPTER_HEAD_CLASS}`)[1]
            ?.click();
        expect(onSeek).toHaveBeenLastCalledWith(secondChapter.firstStep);

        outline.dispose();
    });

    it('update 只把当前步标成 is-current,之前的步骤标成 is-past', () => {
        const trace = bstTrace();
        const outline = createDemoOutline({ trace, onSeek: () => undefined });
        document.body.append(outline.element);

        outline.update(snapshot(4, trace.steps.length));
        const rows = [...outline.element.querySelectorAll<HTMLElement>(`.${DEMO_OUTLINE_STEP_CLASS}`)];
        expect(rows.filter((row) => row.classList.contains(DEMO_OUTLINE_CURRENT_CLASS))).toHaveLength(1);
        expect(rows[4]?.classList.contains(DEMO_OUTLINE_CURRENT_CLASS)).toBe(true);
        expect(rows[4]?.getAttribute('aria-current')).toBe('step');
        expect(rows[3]?.classList.contains(DEMO_OUTLINE_PAST_CLASS)).toBe(true);
        expect(rows[5]?.classList.contains(DEMO_OUTLINE_PAST_CLASS)).toBe(false);

        outline.update(snapshot(0, trace.steps.length));
        expect(rows.filter((row) => row.classList.contains(DEMO_OUTLINE_PAST_CLASS))).toHaveLength(0);
        expect(rows[0]?.classList.contains(DEMO_OUTLINE_CURRENT_CLASS)).toBe(true);

        outline.dispose();
    });

    it('给了 onCollapse 才有「收起」按钮;点了只上报,不自己藏', () => {
        const trace = bstTrace();
        const withoutCollapse = createDemoOutline({ trace, onSeek: () => undefined });
        expect(withoutCollapse.element.querySelector(`.${DEMO_OUTLINE_COLLAPSE_CLASS}`)).toBeNull();
        withoutCollapse.dispose();

        const onCollapse = vi.fn();
        const outline = createDemoOutline({ trace, onSeek: () => undefined, onCollapse });
        document.body.append(outline.element);
        outline.element.querySelector<HTMLElement>(`.${DEMO_OUTLINE_COLLAPSE_CLASS}`)?.click();
        expect(onCollapse).toHaveBeenCalledTimes(1);
        // 显隐归窗口接线层:目录自己不知道窗口是否存在
        expect(document.body.contains(outline.element)).toBe(true);

        outline.dispose();
    });

    it('dispose 之后元素上的委托监听一起摘掉', () => {
        const trace = bstTrace();
        const onSeek = vi.fn();
        const outline = createDemoOutline({ trace, onSeek });
        document.body.append(outline.element);
        const rows = [...outline.element.querySelectorAll<HTMLElement>(`.${DEMO_OUTLINE_STEP_CLASS}`)];
        outline.dispose();

        rows[3]?.click();
        expect(onSeek).not.toHaveBeenCalled();
    });
});
