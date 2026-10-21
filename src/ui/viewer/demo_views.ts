/*
 * 演示控制条(装进演示窗口的正文):标记(纯函数式装配)+ 键盘绑定.
 *
 * 控制条只做三件事:显示"第几步 / 讲什么 / 进度",把按钮动作上报给播放器接线层,
 * 按播放器快照刷新自身.它不认算法、不碰画布:所有语义(剧本 / 步骤 / 速度)都由
 * `SceneTrace` 与 `DemoPlayerSnapshot` 给.
 *
 * 为什么不放任务栏:任务栏是桌面级动作(回正视图 / 全部还原),演示是一个**模式**,
 * 进入 / 播放 / 退出都该在控制条上(docs/animation.md §9.3).
 *
 * 键盘只在演示模式绑定,且焦点不在输入框里(见 {@link bindDemoKeys});Space / ← / →
 * 等在浏览器里有默认行为(滚动 / 光标),所以命中时统一 preventDefault.
 */

import { createInlineToggle, createSegmented, createSwitch, create_element } from 'miko_ui';
import type { DemoPlayerSnapshot } from '@/ui/viewer/demo_player';
import type { SceneTrace } from '@/datastruct/trace/trace';

/** 控制条根元素的类名(样式在 src/ui/viewer/viewer.css) */
export const DEMO_BAR_CLASS = 'demo-bar';
/** 控制条上的按钮 / 进度点类名 */
export const DEMO_BAR_TITLE_CLASS = 'demo-bar__title';
export const DEMO_BAR_COUNT_CLASS = 'demo-bar__count';
export const DEMO_BAR_STEP_TITLE_CLASS = 'demo-bar__step-title';
export const DEMO_BAR_STEP_DETAIL_CLASS = 'demo-bar__step-detail';
export const DEMO_BAR_PROGRESS_CLASS = 'demo-bar__progress';
export const DEMO_BAR_CHAPTER_CLASS = 'demo-bar__chapter';
export const DEMO_BAR_TICK_CLASS = 'demo-bar__tick';
export const DEMO_BAR_SPEED_CLASS = 'demo-bar__speed';
export const DEMO_BAR_ACTION_CLASS = 'demo-bar__action';
export const DEMO_BAR_FOLLOW_CLASS = 'demo-bar__follow';
/** 「步骤」目录开关(与控制条同一排,不占纵向空间) */
export const DEMO_BAR_OUTLINE_CLASS = 'demo-bar__outline';
/** 当前步骤的状态类(进度点 / 当前按钮) */
export const DEMO_BAR_CURRENT_CLASS = 'is-current';
/** 已经播过的步骤 */
export const DEMO_BAR_PAST_CLASS = 'is-past';

/**
 * 播放速度档位(0.5× / 1× / 2×);顺序即按钮显示顺序.
 *
 * 值用字符串是因为库的分段单选 `createSegmented` 的值域是 `T extends string`;
 * 上报给播放器时再 `Number(value)` 转回倍速(见下面的 `onChange`).
 */
export const DEMO_SPEEDS = [
    { value: '0.5', label: '0.5×' },
    { value: '1', label: '1×' },
    { value: '2', label: '2×' },
] as const;

/** 控制条上的动作 id;接线层按它调播放器 */
export type DemoBarAction = 'prev' | 'toggle' | 'next' | 'exit';

/** 控制条文案:进度 / 按钮 / 可访问名 */
export const DEMO_BAR_LABELS = {
    region: '演示控制',
    prev: '上一步',
    next: '下一步',
    play: '播放',
    pause: '暂停',
    follow: '跟随镜头',
    followTitle: '镜头跟随当前步骤(关掉后演示不再抢视角)',
    outline: '步骤',
    outlineTitle: '显示 / 隐藏左侧步骤目录(列出每一章的每一步)',
    exit: '退出',
    speedGroup: '播放速度',
    progressGroup: '步骤进度',
    progressStep: '跳到第 {index} 步: {title}',
} as const;

/** `createDemoBar()` 的输入 */
export interface DemoBarOptions {
    readonly trace: SceneTrace;
    readonly onAction: (action: DemoBarAction) => void;
    readonly onSeek: (stepIndex: number) => void;
    readonly onSpeed: (speed: number) => void;
    readonly onFollow: (follow: boolean) => void;
    /** 「步骤」目录初始是否展开(接线层建目录窗口时用同一个值) */
    readonly outlineVisible: boolean;
    readonly onOutlineToggle: (visible: boolean) => void;
}

/** 控制条句柄:元素 + 按快照刷新 + 拆卸 */
export interface DemoBarHandle {
    readonly element: HTMLElement;
    /** 按播放器快照刷新按钮文案 / 当前进度 / 速度 / 跟随 */
    update(snapshot: DemoPlayerSnapshot): void;
    /** 换这一拍的标题 / 说明 */
    setStepText(title: string, detail: string): void;
    /** 同步「步骤」开关(目录窗口从自己的「收起」按钮关掉时也要勾回去) */
    setOutlineVisible(visible: boolean): void;
    dispose(): void;
}

/** 一个进度点:点一下就 seek 到那一步 */
function createProgressTick(stepIndex: number, title: string): HTMLButtonElement {
    const tick = create_element(
        { tag: 'button' },
        {
            type: 'button',
            class: DEMO_BAR_TICK_CLASS,
            'data-step': String(stepIndex),
            title,
            'aria-label': DEMO_BAR_LABELS.progressStep
                .replace('{index}', String(stepIndex + 1))
                .replace('{title}', title),
        },
    );
    return tick;
}

/**
 * 建控制条:头部(剧本名 / 进度 / 播放控制 / 速度 / 跟随 / 退出)+ 步骤文本 +
 * 按章分组的进度点(章与章之间留缺口).
 */
export function createDemoBar(options: DemoBarOptions): DemoBarHandle {
    const abort = new AbortController();
    const { signal } = abort;

    const title = create_element({ tag: 'span' }, { class: DEMO_BAR_TITLE_CLASS }, options.trace.title);
    const count = create_element(
        { tag: 'span' },
        { class: DEMO_BAR_COUNT_CLASS, 'aria-live': 'polite' },
        `1 / ${options.trace.steps.length}`,
    );

    const prevButton = create_element(
        { tag: 'button' },
        { type: 'button', class: 'ui-button', 'data-demo-action': 'prev', title: DEMO_BAR_LABELS.prev },
        DEMO_BAR_LABELS.prev,
    );
    const toggleButton = create_element(
        { tag: 'button' },
        { type: 'button', class: 'ui-button', 'data-demo-action': 'toggle', title: DEMO_BAR_LABELS.play },
        DEMO_BAR_LABELS.play,
    );
    const nextButton = create_element(
        { tag: 'button' },
        { type: 'button', class: 'ui-button', 'data-demo-action': 'next', title: DEMO_BAR_LABELS.next },
        DEMO_BAR_LABELS.next,
    );

    /*
      速度档用库的分段单选 `createSegmented`:一次只有一个 `.active`,按钮组带
      `role="group"` + `aria-pressed`,键盘与读屏语义都是库定好的;应用侧只给列数 /
      组名 / 初值,不再自己写"三个按钮 + 手写高亮".
    */
    const speedSegmented = createSegmented({
        columns: DEMO_SPEEDS.length,
        ariaLabel: DEMO_BAR_LABELS.speedGroup,
        value: '1',
        items: DEMO_SPEEDS,
    });
    speedSegmented.element.classList.add(DEMO_BAR_SPEED_CLASS);

    /*
      两个布尔开关都用库的 `createSwitch`(而不是手写 `<input type="checkbox">`):
      轨道 / 圆钮 / 焦点态是库的控件基线,应用侧只声明"初值 + 标签".标签用
      `createInlineToggle` 生成 `<label for>`,点文字也能切换,可访问名由可见标签给
      (所以不再传 ariaLabel,否则读屏会把名字念两遍).

      状态归属:开关自己持有勾选态;播放器快照是「跟随镜头」的真相,目录窗口显隐是
      「步骤」的真相 -- 外部只在不一致时 `set()` 回写,用户切换由 `onChange` 上报.
    */
    const followSwitch = createSwitch({ value: true });
    const followToggle = createInlineToggle(DEMO_BAR_LABELS.follow, followSwitch);
    followToggle.classList.add(DEMO_BAR_FOLLOW_CLASS);
    followToggle.title = DEMO_BAR_LABELS.followTitle;

    // 「步骤」目录开关:目录窗口默认展开,收起后画布更干净
    const outlineSwitch = createSwitch({ value: options.outlineVisible });
    const outlineToggle = createInlineToggle(DEMO_BAR_LABELS.outline, outlineSwitch);
    outlineToggle.classList.add(DEMO_BAR_OUTLINE_CLASS);
    outlineToggle.title = DEMO_BAR_LABELS.outlineTitle;

    const exitButton = create_element(
        { tag: 'button' },
        { type: 'button', class: 'ui-button', 'data-demo-action': 'exit', title: DEMO_BAR_LABELS.exit },
        DEMO_BAR_LABELS.exit,
    );

    const head = create_element(
        { tag: 'div' },
        { class: 'demo-bar__head' },
        title,
        count,
        create_element(
            { tag: 'div' },
            { class: 'demo-bar__transport', role: 'group', 'aria-label': '播放控制' },
            prevButton,
            toggleButton,
            nextButton,
        ),
        speedSegmented.element,
        followToggle,
        outlineToggle,
        exitButton,
    );

    const stepTitle = create_element({ tag: 'p' }, { class: DEMO_BAR_STEP_TITLE_CLASS });
    const stepDetail = create_element({ tag: 'p' }, { class: DEMO_BAR_STEP_DETAIL_CLASS });

    // 进度条:按章分组;章与章之间由 CSS 的 gap + 分隔线表达"缺口"
    const progress = create_element(
        { tag: 'div' },
        { class: DEMO_BAR_PROGRESS_CLASS, role: 'group', 'aria-label': DEMO_BAR_LABELS.progressGroup },
    );
    for (const chapter of options.trace.chapters) {
        const chapterElement = create_element(
            { tag: 'div' },
            { class: DEMO_BAR_CHAPTER_CLASS, title: chapter.title },
        );
        for (let offset = 0; offset < chapter.stepCount; offset += 1) {
            const stepIndex = chapter.firstStep + offset;
            const step = options.trace.steps[stepIndex];
            if (step === undefined) continue;
            chapterElement.append(createProgressTick(stepIndex, step.title));
        }
        progress.append(chapterElement);
    }

    const element = create_element(
        { tag: 'div' },
        { class: DEMO_BAR_CLASS, role: 'region', 'aria-label': DEMO_BAR_LABELS.region },
        head,
        stepTitle,
        stepDetail,
        progress,
    );

    // 委托点击:播放按钮 / 进度点共用一份监听,控制条拆掉时一次全摘
    // (速度档归库的 segmented,它自己绑按钮,不从这里走)
    element.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const tick = target.closest<HTMLElement>(`.${DEMO_BAR_TICK_CLASS}`);
        if (tick !== null) {
            const stepIndex = Number(tick.dataset.step);
            if (Number.isSafeInteger(stepIndex)) options.onSeek(stepIndex);
            return;
        }
        const actionButton = target.closest<HTMLElement>('[data-demo-action]');
        if (actionButton === null) return;
        const action = actionButton.dataset.demoAction;
        if (action === 'prev' || action === 'toggle' || action === 'next' || action === 'exit') {
            options.onAction(action);
        }
    }, { signal });

    // 用户切换:库的开关先把值写回自己的 input,再回调;这里只负责上报给播放器 / 窗口层
    const stopFollow = followSwitch.onChange((value) => {
        options.onFollow(value);
    });
    const stopOutline = outlineSwitch.onChange((value) => {
        options.onOutlineToggle(value);
    });
    const stopSpeed = speedSegmented.onChange((value) => {
        options.onSpeed(Number(value));
    });

    const setStepText = (nextTitle: string, nextDetail: string): void => {
        stepTitle.textContent = nextTitle;
        stepDetail.textContent = nextDetail;
        // 长说明在控制条里省略(最多两行),悬停看全文
        stepDetail.title = nextDetail;
    };

    const setOutlineVisible = (visible: boolean): void => {
        if (outlineSwitch.get() !== visible) outlineSwitch.set(visible);
    };

    const update = (snapshot: DemoPlayerSnapshot): void => {
        count.textContent = `${snapshot.step + 1} / ${snapshot.total}`;
        const playing = snapshot.status === 'playing';
        toggleButton.textContent = playing ? DEMO_BAR_LABELS.pause : DEMO_BAR_LABELS.play;
        toggleButton.title = playing ? DEMO_BAR_LABELS.pause : DEMO_BAR_LABELS.play;
        prevButton.disabled = snapshot.step <= 0;
        nextButton.disabled = snapshot.step >= snapshot.total - 1;
        // 速度档:segmented 只认自己的值域,按倍速反查对应的字符串档位再回写
        const speedValue = DEMO_SPEEDS.find((item) => Number(item.value) === snapshot.speed)?.value;
        if (speedValue !== undefined && speedSegmented.get() !== speedValue) {
            speedSegmented.set(speedValue);
        }
        // 播放器快照是跟随状态的真相;只在控件与快照不一致时回写(用户切换的那一拍
        // 由 onChange 先上报,快照回来时两边已经一致,不会互相覆盖)
        if (followSwitch.get() !== snapshot.follow) followSwitch.set(snapshot.follow);

        const ticks = element.querySelectorAll<HTMLElement>(`.${DEMO_BAR_TICK_CLASS}`);
        for (const tick of ticks) {
            const stepIndex = Number(tick.dataset.step);
            tick.classList.toggle(DEMO_BAR_CURRENT_CLASS, stepIndex === snapshot.step);
            tick.classList.toggle(DEMO_BAR_PAST_CLASS, stepIndex < snapshot.step);
            if (stepIndex === snapshot.step) tick.setAttribute('aria-current', 'step');
            else tick.removeAttribute('aria-current');
        }
    };

    return {
        element,
        update,
        setStepText,
        setOutlineVisible,
        dispose(): void {
            stopFollow();
            stopOutline();
            stopSpeed();
            followSwitch.dispose();
            outlineSwitch.dispose();
            speedSegmented.dispose();
            abort.abort();
            element.remove();
        },
    };
}

/** 演示模式键盘动作 */
export interface DemoKeyHandlers {
    toggle(): void;
    prev(): void;
    next(): void;
    first(): void;
    last(): void;
    exit(): void;
}

/** 输入类元素里不抢键:用户可能在 JSON 编辑器里打字(演示模式通常已最小化,但别假设) */
function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return target.isContentEditable;
}

/**
 * 把演示键盘绑定到 document:Space 播放 / 暂停,←/→ 上一步 / 下一步,Home/End 首尾,
 * Esc 退出.
 *
 * 只在演示模式调用(调用方在进入时绑、退出时 abort);`signal` 用于统一解绑.
 * 焦点在输入框 / 可编辑区时不接管,也不阻止默认行为.
 */
export function bindDemoKeys(
    target: Document,
    handlers: DemoKeyHandlers,
    signal: AbortSignal,
): void {
    target.addEventListener('keydown', (event) => {
        if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
        if (isTypingTarget(event.target)) return;
        switch (event.key) {
            case ' ':
            case 'Spacebar':
                event.preventDefault();
                handlers.toggle();
                break;
            case 'ArrowLeft':
                event.preventDefault();
                handlers.prev();
                break;
            case 'ArrowRight':
                event.preventDefault();
                handlers.next();
                break;
            case 'Home':
                event.preventDefault();
                handlers.first();
                break;
            case 'End':
                event.preventDefault();
                handlers.last();
                break;
            case 'Escape':
                event.preventDefault();
                handlers.exit();
                break;
            default:
                break;
        }
    }, { signal });
}
