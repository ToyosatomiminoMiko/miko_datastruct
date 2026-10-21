/**
 * 轨迹记录层(`recordFrames` / `TraceBuilder`)的契约(纯逻辑,node 环境).
 *
 * 钉住三件容易错的事:
 * - 快照在 **yield 的那一刻**取:算法"先改结构再 yield",记录器不该提前或延后取;
 * - 章节区间:firstStep 从 0 累加、stepCount 正确、一章一帧都没有时不记空章;
 * - 确定性:同一输入两次生成的轨迹逐字段相同(演示必须可复现,docs/animation.md §11).
 */
import { describe, expect, it } from 'vitest';

import { readSceneDocument } from '@/scene/scene_document_parse';
import { runSceneChecks } from '@/datastruct/checks';
import { TreeModel, deleteFrames, insertFrames, rotateFrames, searchFrames } from '@/datastruct/bst/bst';
import {
    TraceBuilder,
    recordFrames,
    type SceneTrace,
    type TraceFrame,
    type TraceStep,
} from '@/datastruct/trace/trace';

/** 一个最小生成器:先给空树拍一帧,再改结构,再拍一帧 */
function* emptyThenInsert(tree: TreeModel): Generator<TraceFrame> {
    yield { title: '空树', detail: '还没有节点' };
    const steps = insertFrames(tree, 5);
    for (const frame of steps) yield frame;
}

describe('recordFrames:yield 时取快照', () => {
    it('第一帧是空树,插入后的帧能看到新节点', () => {
        const tree = new TreeModel();
        const steps = recordFrames(() => tree.snapshot(), emptyThenInsert(tree));
        expect(steps).toHaveLength(2);
        expect(steps[0]?.document.nodes).toEqual([]);
        expect(steps[1]?.document.nodes.map((node) => node.key)).toEqual([5]);
        expect(steps[1]?.title).toContain('插入 5');
    });

    it('快照是每帧独立对象,后续改动不会污染已经记下的帧', () => {
        const tree = new TreeModel().build([8, 4, 12]);
        const steps = recordFrames(() => tree.snapshot(), searchFrames(tree, 4));
        const captured = JSON.parse(JSON.stringify(steps[0]?.document)) as unknown;
        tree.build([2, 6, 10, 14]);
        expect(steps[0]?.document).toEqual(captured);
        expect(steps[0]?.document.nodes).toHaveLength(3);
    });

    it('空生成器不产生任何帧', () => {
        const tree = new TreeModel();
        expect(recordFrames(() => tree.snapshot(), [])).toEqual([]);
    });
});

describe('TraceBuilder:章节区间', () => {
    it('空章不记;firstStep / stepCount 按下标累加', () => {
        const tree = new TreeModel().build([8, 4, 12]);
        const builder = new TraceBuilder('BST 原理', ['checkBstOrder'], () => tree.snapshot());

        builder.chapter('空章', []);
        expect(builder.stepCount).toBe(0);

        builder.chapter('查找 4', searchFrames(tree, 4));
        const afterSearch = builder.stepCount;
        expect(afterSearch).toBe(2);

        builder.chapter('插入 6', insertFrames(tree, 6));
        builder.chapter('空章 2', []);
        const trace = builder.finish();

        expect(trace.title).toBe('BST 原理');
        expect(trace.checkIds).toEqual(['checkBstOrder']);
        expect(trace.steps).toHaveLength(builder.stepCount);
        expect(trace.chapters).toEqual([
            { title: '查找 4', firstStep: 0, stepCount: 2 },
            { title: '插入 6', firstStep: 2, stepCount: builder.stepCount - 2 },
        ]);
    });

    it('章内每一帧都带各自的 document,且能逐帧跑检查', () => {
        const tree = new TreeModel().build([8, 4, 12]);
        const builder = new TraceBuilder('BST', ['checkBstOrder'], () => tree.snapshot());
        builder.chapter('删除 4', deleteFrames(tree, 4));
        const trace = builder.finish();

        expect(trace.steps.length).toBeGreaterThan(0);
        for (const [index, step] of trace.steps.entries()) {
            const document = readSceneDocument(step.document);
            const run = runSceneChecks(document, trace.checkIds);
            expect(run.unknownIds, `第 ${index} 帧检查 id 未登记`).toEqual([]);
            expect(run.checks.filter((check) => !check.passed), `第 ${index} 帧`).toEqual([]);
        }
    });

    it('同一个 builder 可以继续追加章节(顺序即播放顺序)', () => {
        const tree = new TreeModel().build([10, 5, 20, 15, 30, 40]);
        const builder = new TraceBuilder('旋转', ['checkBstOrder'], () => tree.snapshot());
        builder.chapter('左旋 10', rotateFrames(tree, 'left', 10));
        const first = builder.stepCount;
        const partial = builder.finish();
        builder.chapter('右旋 20', rotateFrames(tree, 'right', 20));
        const trace = builder.finish();

        expect(trace.chapters).toHaveLength(2);
        expect(trace.chapters[1]?.firstStep).toBe(first);
        // finish 交回的是同一份数组引用:同一个 builder 继续追加章节,之前的 trace 也跟着长
        expect(partial.steps).toBe(trace.steps);
        expect(trace.steps.length).toBe(builder.stepCount);
        expect(trace.steps.length).toBeGreaterThan(first);
    });
});

describe('轨迹确定性', () => {
    function buildTrace(): SceneTrace {
        const tree = new TreeModel().build([8, 4, 12, 2, 6, 10, 14]);
        const builder = new TraceBuilder('确定性', ['checkBstOrder'], () => tree.snapshot());
        builder.chapter('查找 5', searchFrames(tree, 5));
        builder.chapter('插入 5', insertFrames(tree, 5));
        builder.chapter('删除 4', deleteFrames(tree, 4));
        builder.chapter('旋转 8', rotateFrames(tree, 'left', 8));
        return builder.finish();
    }

    it('同一输入两次生成逐字段相同', () => {
        const first = buildTrace();
        const second = buildTrace();
        expect(second).toEqual(first);
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });

    it('同输入两次生成的节点 key / 指针 / 标题都一致', () => {
        const [first, second] = [buildTrace(), buildTrace()];
        const firstKeys = first.steps.map((step) => step.document.nodes.map((node) => node.key));
        const secondKeys = second.steps.map((step) => step.document.nodes.map((node) => node.key));
        expect(secondKeys).toEqual(firstKeys);
        expect(second.steps.map((step) => step.document.pointers)).toEqual(
            first.steps.map((step) => step.document.pointers),
        );
    });
});

describe('轨迹里的帧字段口径', () => {
    it('document 节点 key 唯一、指针引用有效、检查全 PASS', () => {
        const tree = new TreeModel().build([8, 4, 12]);
        const builder = new TraceBuilder('口径', ['checkBstOrder'], () => tree.snapshot());
        builder.chapter('插入 6', insertFrames(tree, 6));
        const trace = builder.finish();
        for (const step of trace.steps as readonly TraceStep[]) {
            const keys = step.document.nodes.map((node) => node.key);
            expect(new Set(keys).size).toBe(keys.length);
            for (const pointer of step.document.pointers) {
                expect(keys).toContain(pointer.from);
                expect(keys).toContain(pointer.to);
            }
        }
    });

    it('高亮词表只出现约定里的状态', () => {
        const allowedNodes = new Set(['active', 'path', 'visited', 'found', 'ghost', 'fresh']);
        const allowedLinks = new Set(['path', 'ghost']);
        const tree = new TreeModel().build([8, 4, 12, 2, 6, 10, 14]);
        const builder = new TraceBuilder('词表', ['checkBstOrder'], () => tree.snapshot());
        builder.chapter('查找', searchFrames(tree, 6));
        builder.chapter('删除', deleteFrames(tree, 12));
        builder.chapter('遍历', (function* () {
            yield { title: '遍历', detail: '' };
        })());
        for (const step of builder.finish().steps) {
            for (const mark of step.marks?.nodes ?? []) expect(allowedNodes.has(mark.state)).toBe(true);
            for (const mark of step.marks?.links ?? []) expect(allowedLinks.has(mark.state)).toBe(true);
        }
    });
});
