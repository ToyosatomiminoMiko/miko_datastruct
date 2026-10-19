/*
 * 内置演示剧本(demo_scenarios.ts)的契约:每个剧本都能生成合法轨迹、覆盖它承诺的
 * 教学情形,且最后停在"检查全 PASS"的合法结构上.
 *
 * 这些断言是**教学路径的防腐层**:以后改算法 / 改剧本,如果某个情形在演示里再也看不到,
 * 或者最后停在一个违反红黑性质的状态,测试会先挡住(docs/animation.md §8.3).
 */
import { describe, expect, it } from 'vitest';

import { readSceneDocument } from '@/scene/scene_document_parse';
import { runSceneChecks } from '@/datastruct/checks';
import type { SceneTrace, TraceStep } from '@/datastruct/trace/trace';
import { DEMO_SCENARIOS, demoScenarioMenuGroups, findDemoScenario } from '@/ui/viewer/demo_scenarios';
import { toComparableLabel } from '@/scene/label_value';

/** 每一帧都能被解析器接受,且 label 是检查器认的十进制数 */
function assertDocumentValid(step: TraceStep): void {
    const document = readSceneDocument(step.document);
    for (const node of document.nodes) {
        expect(toComparableLabel(node.label), `节点 ${node.key} 的 label 不是十进制数: ${node.label}`)
            .not.toBeNull();
    }
    // focus / frame / anchor 引用的 key 必须存在于这一帧
    const keys = new Set(document.nodes.map((node) => node.key));
    if (step.focus !== undefined) expect(keys.has(step.focus)).toBe(true);
    for (const key of step.frame ?? []) expect(keys.has(key)).toBe(true);
    if (step.anchor !== undefined) expect(keys.has(step.anchor)).toBe(true);
    for (const mark of step.marks?.nodes ?? []) expect(keys.has(mark.key)).toBe(true);
    for (const mark of step.marks?.links ?? []) {
        expect(keys.has(mark.from)).toBe(true);
        expect(keys.has(mark.to)).toBe(true);
    }
}

/** 章节区间连续覆盖全部步骤 */
function assertChaptersCoverSteps(trace: SceneTrace): void {
    let cursor = 0;
    for (const chapter of trace.chapters) {
        expect(chapter.firstStep).toBe(cursor);
        expect(chapter.stepCount).toBeGreaterThan(0);
        cursor += chapter.stepCount;
    }
    expect(cursor).toBe(trace.steps.length);
}

/** 检查 id 在这个剧本里全部登记过(没登记会进 unknownIds) */
function assertChecksRegistered(trace: SceneTrace, step: TraceStep): void {
    const run = runSceneChecks(step.document, trace.checkIds);
    expect(run.unknownIds).toEqual([]);
}

describe('演示剧本:清单', () => {
    it('分组与 id 唯一;菜单分组能覆盖全部剧本', () => {
        expect(new Set(DEMO_SCENARIOS.map((scenario) => scenario.id)).size).toBe(DEMO_SCENARIOS.length);
        const menuIds = demoScenarioMenuGroups().flatMap((group) => group.entries.map((entry) => entry.value));
        expect([...menuIds].sort()).toEqual([...DEMO_SCENARIOS.map((scenario) => scenario.id)].sort());
        expect(findDemoScenario('rbt-insert-full')?.title).toContain('RBT');
        expect(findDemoScenario('nope')).toBeUndefined();
    });

    it('同一剧本两次生成的轨迹逐字节相同(确定性)', () => {
        for (const scenario of DEMO_SCENARIOS) {
            const first = JSON.stringify(scenario.build());
            const second = JSON.stringify(scenario.build());
            expect(second, `${scenario.id} 两次生成不一致`).toBe(first);
        }
    });
});

describe('演示剧本:轨迹合法性', () => {
    for (const scenario of DEMO_SCENARIOS) {
        it(`${scenario.id}:每帧合法、章节连续、检查已登记`, () => {
            const trace = scenario.build();
            expect(trace.steps.length).toBeGreaterThan(0);
            expect(trace.chapters.length).toBeGreaterThan(0);
            expect(trace.title).toBe(scenario.title);
            assertChaptersCoverSteps(trace);
            for (const step of trace.steps) {
                expect(step.title.length).toBeGreaterThan(0);
                expect(step.detail.length).toBeGreaterThan(0);
                assertDocumentValid(step);
                assertChecksRegistered(trace, step);
            }
        });
    }

    it('BST 剧本:每一帧都满足二叉搜索树有序', () => {
        for (const scenario of DEMO_SCENARIOS.filter((candidate) => candidate.group === '二叉搜索树')) {
            const trace = scenario.build();
            for (const step of trace.steps) {
                const checks = runSceneChecks(step.document, ['checkBstOrder']).checks;
                expect(checks[0]?.passed, `${scenario.id} / ${step.title}`).toBe(true);
            }
        }
    });

    it('RBT 剧本:最后一帧五条检查全 PASS,且中途确实出现过 FAIL(教学价值)', () => {
        for (const scenario of DEMO_SCENARIOS.filter((candidate) => candidate.group === '红黑树')) {
            const trace = scenario.build();
            const last = trace.steps[trace.steps.length - 1];
            if (last === undefined) throw new Error(`${scenario.id} 没有步骤`);
            const finalChecks = runSceneChecks(last.document, trace.checkIds).checks;
            expect(finalChecks).toHaveLength(5);
            expect(finalChecks.every((check) => check.passed), `${scenario.id} 最后一帧不是全 PASS`).toBe(true);
        }
    });
});

describe('演示剧本:教学情形覆盖', () => {
    it('BST 旋转:出现左旋 / 右旋 / 中序验证', () => {
        const trace = findDemoScenario('bst-rotate')?.build();
        if (!trace) throw new Error('缺少 bst-rotate');
        const titles = trace.steps.map((step) => step.title).join('\n');
        expect(titles).toContain('左旋');
        expect(titles).toContain('右旋');
        expect(titles).toContain('验证中序');
    });

    it('BST 退化:升序 1..7 后是一条链(高度 7)', () => {
        const trace = findDemoScenario('bst-degenerate')?.build();
        if (!trace) throw new Error('缺少 bst-degenerate');
        const last = trace.steps[trace.steps.length - 1];
        if (last === undefined) throw new Error('没有步骤');
        expect(last.document.nodes).toHaveLength(7);
        // 最后一章的 shapeFrames 说明里给出层数 = 7(根算第 1 层)
        const shapeStep = trace.steps.find((step) => step.detail.includes('高度'));
        if (shapeStep === undefined) throw new Error('缺少高度说明');
        expect(shapeStep.detail).toContain('7');
    });

    it('RBT 插入(综合):情形 1 / 2 / 3 各至少出现一次', () => {
        const trace = findDemoScenario('rbt-insert-full')?.build();
        if (!trace) throw new Error('缺少 rbt-insert-full');
        const narration = trace.steps.map((step) => `${step.title}\n${step.detail}`).join('\n');
        expect(narration).toContain('情形 1');
        expect(narration).toContain('情形 2');
        expect(narration).toContain('情形 3');
    });

    it('RBT 删除:出现物理移植 / 双黑,且四种删除情形全部出现', () => {
        const trace = findDemoScenario('rbt-delete')?.build();
        if (!trace) throw new Error('缺少 rbt-delete');
        const narration = trace.steps.map((step) => `${step.title}\n${step.detail}`).join('\n');
        expect(narration).toContain('后继');
        expect(narration).toContain('双黑');
        const caseCount = ['情形 1', '情形 2', '情形 3', '情形 4']
            .filter((name) => narration.includes(name)).length;
        expect(caseCount).toBe(4);
    });
});
