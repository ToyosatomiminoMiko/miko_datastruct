/**
 * 红黑树插入 / 删除轨迹(纯逻辑,node 环境)的契约.
 *
 * 钉住 docs/animation.md §8 / §11 的教学路径:
 * - 插入 10,20,30 必须出现"情形 3";插入 10,5,15,1 必须出现"情形 1"且根由红染黑;
 *   综合序列 7,3,18,10,22,8,11,26,2,6,13 三种情形各至少一次,末帧五条检查全 PASS;
 * - 升序 1..7 在 RBT 里高度是 4(对照 BST 的 7),黑高检查 PASS;
 * - 删除:物理移植后继、记录后继颜色;双黑四情形(兄弟红 / 兄弟黑两孩子黑 / 近侄红 /
 *   远侄红)在一条删除序列里全部出现,且每帧都是合法 BST,每删一次末帧五条全 PASS.
 */
import { describe, expect, it } from 'vitest';

import { readSceneDocument } from '@/scene/scene_document_parse';
import type { SceneDocument, SceneNodeKey } from '@/scene/scene_document';
import { runSceneChecks } from '@/datastruct/checks';
import { TreeModel } from '@/datastruct/bst/bst';
import {
    rbtDeleteFrames,
    rbtInsertFrames,
    rbtPropertiesFrames,
} from '@/datastruct/rbt/rbt_ops';
import { recordFrames, type TraceStep } from '@/datastruct/trace/trace';

/** 五条性质(顺序 = 检查窗口默认顺序) */
const FIVE = ['checkColors', 'checkRootBlack', 'checkRedChildrenBlack', 'checkBlackHeight', 'checkBstOrder'] as const;

const snapshot = (tree: TreeModel) => tree.snapshot({ colors: true });

function lastStep(steps: readonly TraceStep[]): TraceStep {
    const step = steps[steps.length - 1];
    if (step === undefined) throw new Error('轨迹为空');
    return step;
}

/** 每帧解析 + BST 有序检查(中间帧允许违反红孩子 / 黑高,但不允许不是 BST) */
function assertEveryFrameIsBst(steps: readonly TraceStep[]): void {
    for (const [index, step] of steps.entries()) {
        const document = readSceneDocument(step.document);
        const run = runSceneChecks(document, ['checkBstOrder']);
        expect(run.unknownIds, `第 ${index} 帧「${step.title}」有未登记的检查 id`).toEqual([]);
        expect(
            run.checks.filter((check) => !check.passed),
            `第 ${index} 帧「${step.title}」不是合法二叉搜索树`,
        ).toEqual([]);
    }
}

/**
 * key 直接承载数据键:返回 key -> 数值.没有 label 可解析,文档里的 key 就是节点值.
 */
function valueOfKey(document: SceneDocument): Map<SceneNodeKey, number> {
    const result = new Map<SceneNodeKey, number>();
    for (const node of document.nodes) {
        expect(typeof node.key, `节点 key 必须是数字,实际是 ${String(node.key)}`).toBe('number');
        result.set(node.key, node.key as number);
    }
    return result;
}

/** 取 key 对应的数值(key 不在文档里时给 NaN,断言会直接失败并指出问题) */
function numeric(valueOf: ReadonlyMap<SceneNodeKey, number>, key: SceneNodeKey): number {
    return valueOf.get(key) ?? Number.NaN;
}

/** 逐帧断言 pointers 的语义顺序:父节点 key 升序;每个父 left 在前、right 在后 */
function assertPointerOrder(steps: readonly TraceStep[]): void {
    for (const step of steps) {
        const document = readSceneDocument(step.document);
        const valueOf = valueOfKey(document);
        const groups = new Map<SceneNodeKey, SceneNodeKey[]>();
        const parentOrder: SceneNodeKey[] = [];
        for (const pointer of document.pointers) {
            if (!groups.has(pointer.from)) {
                groups.set(pointer.from, []);
                parentOrder.push(pointer.from);
            }
            groups.get(pointer.from)?.push(pointer.to);
        }
        expect(parentOrder).toEqual([...parentOrder].sort((a, b) => numeric(valueOf, a) - numeric(valueOf, b)));
        for (const [from, children] of groups) {
            if (children.length !== 2) continue;
            const parentValue = numeric(valueOf, from);
            expect(numeric(valueOf, children[0] as SceneNodeKey)).toBeLessThan(parentValue);
            expect(numeric(valueOf, children[1] as SceneNodeKey)).toBeGreaterThan(parentValue);
        }
    }
}

/** 末帧五条检查全 PASS;根必须黑色 */
function assertFinalRbt(tree: TreeModel, steps: readonly TraceStep[]): void {
    const document = readSceneDocument(lastStep(steps).document);
    const run = runSceneChecks(document, [...FIVE]);
    expect(run.unknownIds).toEqual([]);
    expect(run.checks.filter((check) => !check.passed), '末帧五条性质必须全 PASS').toEqual([]);
    if (tree.root !== null) expect(tree.root.color).toBe('black');
}

function insertAll(tree: TreeModel, values: readonly number[]): TraceStep[] {
    const steps: TraceStep[] = [];
    for (const value of values) steps.push(...recordFrames(() => snapshot(tree), rbtInsertFrames(tree, value)));
    return steps;
}

function titles(steps: readonly TraceStep[]): string {
    return steps.map((step) => `${step.title} ${step.detail}`).join('\n');
}

/** 从"双黑 · 情形 N"标题里抽情形编号 */
function caseNumbers(steps: readonly TraceStep[]): Set<string> {
    const result = new Set<string>();
    for (const step of steps) {
        if (!`${step.title} ${step.detail}`.includes('双黑')) continue;
        const match = /情形 (\d)/.exec(step.title);
        if (match?.[1] !== undefined) result.add(match[1]);
    }
    return result;
}

describe('RBT 插入:教学情形', () => {
    it('10,20,30 出现情形 3(左旋),末帧五条 PASS', () => {
        const tree = new TreeModel();
        const steps = insertAll(tree, [10, 20, 30]);
        expect(titles(steps)).toContain('情形 3');
        expect(tree.height()).toBe(2);
        assertEveryFrameIsBst(steps);
        assertFinalRbt(tree, steps);
        assertPointerOrder(steps);
    });

    it('10,5,15,1 出现情形 1(叔叔红),祖父是根所以最后根染黑', () => {
        const tree = new TreeModel();
        const steps = insertAll(tree, [10, 5, 15, 1]);
        expect(titles(steps)).toContain('情形 1');
        expect(titles(steps)).toContain('根染黑');
        expect(tree.root?.key).toBe(10);
        expect(tree.root?.color).toBe('black');
        assertEveryFrameIsBst(steps);
        assertFinalRbt(tree, steps);
    });

    it('空树插入:新节点先红,再作为根染黑,末帧五条 PASS', () => {
        const tree = new TreeModel();
        const steps = recordFrames(() => snapshot(tree), rbtInsertFrames(tree, 7));
        expect(steps.map((step) => step.title).join('|')).toContain('插入 7(红)');
        expect(titles(steps)).toContain('根染黑');
        expect(tree.root?.color).toBe('black');
        assertFinalRbt(tree, steps);
    });

    it('同值已存在:只一拍,不插', () => {
        const tree = new TreeModel();
        insertAll(tree, [10, 5, 15]);
        const sizeBefore = tree.nodes.size;
        const steps = recordFrames(() => snapshot(tree), rbtInsertFrames(tree, 10));
        expect(steps).toHaveLength(1);
        expect(lastStep(steps).title).toContain('已存在');
        expect(tree.nodes.size).toBe(sizeBefore);
    });

    it('综合序列 7,3,18,10,22,8,11,26,2,6,13:情形 1/2/3 各至少一次,末帧五条 PASS', () => {
        const tree = new TreeModel();
        const steps = insertAll(tree, [7, 3, 18, 10, 22, 8, 11, 26, 2, 6, 13]);
        const text = titles(steps);
        for (const caseName of ['情形 1', '情形 2', '情形 3']) expect(text).toContain(caseName);
        // 教学价值:插入途中真的会有一条红孩子 FAIL,修完转 PASS
        const redFails = steps.filter((step) => {
            const document = readSceneDocument(step.document);
            const run = runSceneChecks(document, ['checkRedChildrenBlack']);
            return run.checks.some((check) => !check.passed);
        });
        expect(redFails.length).toBeGreaterThan(0);
        assertEveryFrameIsBst(steps);
        assertFinalRbt(tree, steps);
        assertPointerOrder(steps);
    });

    it('升序 1..7:高度 4(BST 是 7),黑高检查 PASS', () => {
        const tree = new TreeModel();
        const steps = insertAll(tree, [1, 2, 3, 4, 5, 6, 7]);
        expect(tree.height()).toBe(4);
        assertFinalRbt(tree, steps);
        const document = readSceneDocument(lastStep(steps).document);
        const run = runSceneChecks(document, ['checkBlackHeight', 'checkRootBlack']);
        expect(run.checks.every((check) => check.passed)).toBe(true);
    });
});

describe('RBT 删除:物理移植 + 双黑四情形', () => {
    const INSERT = [7, 3, 18, 10, 22, 8, 11, 26, 2, 6, 13] as const;
    // 综合树倒序删空:覆盖双黑情形 1 / 2 / 3 / 4
    const DELETE = [26, 22, 18, 13, 11, 10, 8, 7, 6, 3, 2] as const;

    it('每个删除都先找后继 / 物理移植;每帧合法 BST,每步末帧五条 PASS', () => {
        const tree = new TreeModel();
        insertAll(tree, INSERT);
        const allSteps: TraceStep[] = [];
        const covered = new Set<string>();
        for (const value of DELETE) {
            const steps = recordFrames(() => snapshot(tree), rbtDeleteFrames(tree, value));
            allSteps.push(...steps);
            assertEveryFrameIsBst(steps);
            assertPointerOrder(steps);
            assertFinalRbt(tree, steps);
            expect(tree.find(value)).toBeNull();
            for (const number of caseNumbers(steps)) covered.add(number);
        }
        expect(tree.root).toBeNull();
        expect(titles(allSteps)).toContain('双黑');
        expect(titles(allSteps)).toContain('后继');
        expect(titles(allSteps)).toContain('物理移植');
        // 双黑四情形全部出现在这条删除链上(改算法把某条教学路径改没了会挂)
        expect([...covered].sort()).toEqual(['1', '2', '3', '4']);
    });

    it('删根 / 删单孩子 / 删叶子都能删到空,中间帧始终是合法 BST', () => {
        const tree = new TreeModel();
        insertAll(tree, [10, 5, 15, 1, 6, 12, 20]);
        const steps: TraceStep[] = [];
        for (const value of [10, 5, 15, 1, 6, 12, 20]) {
            steps.push(...recordFrames(() => snapshot(tree), rbtDeleteFrames(tree, value)));
        }
        assertEveryFrameIsBst(steps);
        expect(tree.root).toBeNull();
        expect(lastStep(steps).document.nodes).toEqual([]);
    });

    it('删除不存在的值 / 空树删除都只是一拍叙述', () => {
        const tree = new TreeModel();
        insertAll(tree, [10, 5, 15]);
        const missing = recordFrames(() => snapshot(tree), rbtDeleteFrames(tree, 99));
        expect(lastStep(missing).detail).toContain('不在树中');

        const empty = new TreeModel();
        const emptySteps = recordFrames(() => snapshot(empty), rbtDeleteFrames(empty, 1));
        expect(emptySteps).toHaveLength(1);
        expect(lastStep(emptySteps).title).toContain('空树');
    });
});

describe('RBT 五条性质讲解帧', () => {
    it('五拍分别对应五条性质,末拍给出中序序列', () => {
        const tree = new TreeModel();
        insertAll(tree, [7, 3, 18, 10, 22, 8, 11, 26, 2, 6, 13]);
        const steps = recordFrames(() => snapshot(tree), rbtPropertiesFrames(tree));
        expect(steps).toHaveLength(5);
        for (const number of [1, 2, 3, 4, 5]) expect(titles(steps)).toContain(`性质 ${number}`);
        expect(lastStep(steps).detail).toContain('2 3 6 7 8 10 11 13 18 22 26');
        expect(steps[0]?.framing).toBe('fit');
        assertEveryFrameIsBst(steps);
        assertPointerOrder(steps);
    });
});




