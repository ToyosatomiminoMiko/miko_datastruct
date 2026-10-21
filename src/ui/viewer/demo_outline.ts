/*
 * 演示「步骤目录」:一扇独立窗口里的纵向步骤列表(按章分组 / 当前高亮 / 点击跳转).
 *
 * 为什么不在控制条里再塞一条纵向列表:横向进度条要的是"现在到哪了",它用等分刻度
 * 就能表达 57 步;步骤标题则要占真实的行高,塞进固定 180px 高的控制窗口会立刻变成
 * 滚动条里的一行行碎字,既看不清当前步,也压掉了说明文字.所以这里把"目录"拆成
 * 一扇只在演示模式存在的窗口(见 docs/animation.md §9.3):控制条保留横向进度条,
 * 目录窗口负责"每一步讲什么",两者共用同一个 seek.
 *
 * 这个模块只建正文(列表本身),窗口外壳 / 几何 / 显隐在 demo_window.ts 与 viewer.ts;
 * 它不认算法、不碰画布,只吃 `SceneTrace` 与播放器快照(与 demo_views.ts 同一口径).
 *
 * 章节分组是列表的骨架:一章 = 一个粘性标题 + 若干步.当前步变化时只把
 * `is-current` 挪过去,并在当前步离开可视区时才 `scrollIntoView` -- 自动播放每拍
 * 都刷新,如果每拍都强制居中,列表会一直跳.
 */

import { create_element } from 'miko_ui';
import type { DemoPlayerSnapshot } from '@/ui/viewer/demo_player';
import type { SceneTrace } from '@/datastruct/trace/trace';

/** 目录正文根(样式在 src/ui/viewer/viewer.css) */
export const DEMO_OUTLINE_CLASS = 'demo-outline';
export const DEMO_OUTLINE_HEAD_CLASS = 'demo-outline__head';
export const DEMO_OUTLINE_SUMMARY_CLASS = 'demo-outline__summary';
export const DEMO_OUTLINE_COLLAPSE_CLASS = 'demo-outline__collapse';
export const DEMO_OUTLINE_LIST_CLASS = 'demo-outline__list';
export const DEMO_OUTLINE_CHAPTER_CLASS = 'demo-outline__chapter';
export const DEMO_OUTLINE_CHAPTER_HEAD_CLASS = 'demo-outline__chapter-head';
export const DEMO_OUTLINE_CHAPTER_INDEX_CLASS = 'demo-outline__chapter-index';
export const DEMO_OUTLINE_CHAPTER_TITLE_CLASS = 'demo-outline__chapter-title';
export const DEMO_OUTLINE_CHAPTER_COUNT_CLASS = 'demo-outline__chapter-count';
export const DEMO_OUTLINE_STEP_CLASS = 'demo-outline__step';
export const DEMO_OUTLINE_STEP_INDEX_CLASS = 'demo-outline__step-index';
export const DEMO_OUTLINE_STEP_TITLE_CLASS = 'demo-outline__step-title';
/** 当前步骤 / 已经播过的步骤 */
export const DEMO_OUTLINE_CURRENT_CLASS = 'is-current';
export const DEMO_OUTLINE_PAST_CLASS = 'is-past';

/** 目录里的文案:可访问名与按钮文字 */
export const DEMO_OUTLINE_LABELS = {
    region: '步骤目录',
    collapse: '收起',
    collapseTitle: '收起步骤目录(演示继续)',
    summary: '{chapters} 章 · {steps} 步',
    chapter: '第 {index} 章: {title}({count} 步);跳到本章第一步',
    step: '第 {index} 步: {title}',
} as const;

/** `createDemoOutline()` 的输入 */
export interface DemoOutlineOptions {
    readonly trace: SceneTrace;
    /** 点击某一步 / 某章标题时跳过去(接线层转给播放器 seek) */
    readonly onSeek: (stepIndex: number) => void;
    /** 收起目录;不给就不显示「收起」按钮 */
    readonly onCollapse?: () => void;
}

/** 目录句柄:元素 + 按播放器快照挪高亮 + 拆卸 */
export interface DemoOutlineHandle {
    readonly element: HTMLElement;
    /** 当前步变化时挪高亮 / 渐隐已播步骤 / 必要时滚进可视区 */
    update(snapshot: DemoPlayerSnapshot): void;
    dispose(): void;
}

/** 两行文案的模板替换(`{index}` / `{title}` / `{count}`) */
function fill(template: string, values: Readonly<Record<string, string | number>>): string {
    return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
        const value = values[key];
        return value === undefined ? whole : String(value);
    });
}

/**
 * 建目录正文:头部(章数 / 步数 + 收起)+ 按章分组的步骤按钮.
 *
 * 每章一个 `<section>`,章标题与步骤都是 `<button>`:目录是"跳转入口",不是纯文字,
 * 用按钮才能拿到键盘焦点 / Enter / Space 的原生行为.
 */
export function createDemoOutline(options: DemoOutlineOptions): DemoOutlineHandle {
    const abort = new AbortController();
    const { signal } = abort;
    const { trace } = options;

    const summary = create_element(
        { tag: 'span' },
        { class: DEMO_OUTLINE_SUMMARY_CLASS },
        fill(DEMO_OUTLINE_LABELS.summary, { chapters: trace.chapters.length, steps: trace.steps.length }),
    );
    const head = create_element({ tag: 'div' }, { class: DEMO_OUTLINE_HEAD_CLASS }, summary);
    if (options.onCollapse !== undefined) {
        const collapse = create_element(
            { tag: 'button' },
            {
                type: 'button',
                class: `ui-button ${DEMO_OUTLINE_COLLAPSE_CLASS}`,
                title: DEMO_OUTLINE_LABELS.collapseTitle,
            },
            DEMO_OUTLINE_LABELS.collapse,
        );
        collapse.addEventListener('click', () => options.onCollapse?.(), { signal });
        head.append(collapse);
    }

    const list = create_element({ tag: 'div' }, { class: DEMO_OUTLINE_LIST_CLASS });
    const stepButtons: HTMLButtonElement[] = [];

    for (const [chapterIndex, chapter] of trace.chapters.entries()) {
        const chapterElement = create_element({ tag: 'section' }, { class: DEMO_OUTLINE_CHAPTER_CLASS });
        const chapterHead = create_element(
            { tag: 'button' },
            {
                type: 'button',
                class: DEMO_OUTLINE_CHAPTER_HEAD_CLASS,
                'data-chapter-step': String(chapter.firstStep),
                title: fill(DEMO_OUTLINE_LABELS.chapter, {
                    index: chapterIndex + 1,
                    title: chapter.title,
                    count: chapter.stepCount,
                }),
            },
            create_element(
                { tag: 'span' },
                { class: DEMO_OUTLINE_CHAPTER_INDEX_CLASS },
                String(chapterIndex + 1).padStart(2, '0'),
            ),
            create_element({ tag: 'span' }, { class: DEMO_OUTLINE_CHAPTER_TITLE_CLASS }, chapter.title),
            create_element(
                { tag: 'span' },
                { class: DEMO_OUTLINE_CHAPTER_COUNT_CLASS },
                `${chapter.stepCount} 步`,
            ),
        );
        chapterElement.append(chapterHead);

        for (let offset = 0; offset < chapter.stepCount; offset += 1) {
            const stepIndex = chapter.firstStep + offset;
            const step = trace.steps[stepIndex];
            if (step === undefined) continue;
            const button = create_element(
                { tag: 'button' },
                {
                    type: 'button',
                    class: DEMO_OUTLINE_STEP_CLASS,
                    'data-step': String(stepIndex),
                    'aria-label': fill(DEMO_OUTLINE_LABELS.step, { index: stepIndex + 1, title: step.title }),
                },
                create_element(
                    { tag: 'span' },
                    { class: DEMO_OUTLINE_STEP_INDEX_CLASS },
                    String(stepIndex + 1),
                ),
                create_element({ tag: 'span' }, { class: DEMO_OUTLINE_STEP_TITLE_CLASS }, step.title),
            );
            chapterElement.append(button);
            stepButtons.push(button);
        }
        list.append(chapterElement);
    }

    const element = create_element(
        { tag: 'div' },
        { class: DEMO_OUTLINE_CLASS, role: 'region', 'aria-label': DEMO_OUTLINE_LABELS.region },
        head,
        list,
    );

    // 委托点击:章标题与步骤共用一份监听,目录拆掉时一次全摘
    element.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const jump = target.closest<HTMLElement>('[data-step], [data-chapter-step]');
        if (jump === null) return;
        const raw = jump.dataset.step ?? jump.dataset.chapterStep;
        const stepIndex = Number(raw);
        if (Number.isSafeInteger(stepIndex)) options.onSeek(stepIndex);
    }, { signal });

    let lastCurrent = -1;
    const update = (snapshot: DemoPlayerSnapshot): void => {
        const changed = snapshot.step !== lastCurrent;
        for (const button of stepButtons) {
            const stepIndex = Number(button.dataset.step);
            const current = stepIndex === snapshot.step;
            button.classList.toggle(DEMO_OUTLINE_CURRENT_CLASS, current);
            button.classList.toggle(DEMO_OUTLINE_PAST_CLASS, stepIndex < snapshot.step);
            if (current) button.setAttribute('aria-current', 'step');
            else button.removeAttribute('aria-current');
            // block:'nearest' 只在当前步已经离开可视区时滚动,自动播放不会每拍都跳
            if (current && changed && typeof button.scrollIntoView === 'function') {
                button.scrollIntoView({ block: 'nearest' });
            }
        }
        lastCurrent = snapshot.step;
    };

    return {
        element,
        update,
        dispose(): void {
            abort.abort();
            element.remove();
        },
    };
}
