/**
 * BST 旋转(纯逻辑,node 环境)的契约.
 *
 * 旋转是第 9 章"局部手术":只改三根指针、**中序完全不变**;左旋 / 右旋互逆;之字形
 * 单旋只镜像(层数不变),双旋才降一层;线形右重左旋降一层;根旋转要改写根指针.
 *
 * 轨迹侧还要证明:每帧都是合法 BST、完成帧带 `motion: rotate(from = x, to = y)` 与
 * `anchor: y / anchorAt: x`、最后有一拍验证中序(docs/animation.md §7.1、§11).
 */
import { describe, expect, it } from 'vitest';

import { readSceneDocument } from '@/scene/scene_document_parse';
import { runSceneChecks } from '@/datastruct/checks';
import {
    TreeModel,
    rotateFrames,
    rotateLeft,
    rotateRight,
    type TreeNode,
} from '@/datastruct/bst/bst';
import { recordFrames, type TraceStep } from '@/datastruct/trace/trace';

function assertFramesValidate(steps: readonly TraceStep[], ids: readonly string[] = ['checkBstOrder']): void {
    for (const [index, step] of steps.entries()) {
        const document = readSceneDocument(step.document);
        const run = runSceneChecks(document, ids);
        expect(run.unknownIds, `第 ${index} 帧「${step.title}」有未登记的检查 id`).toEqual([]);
        expect(
            run.checks.filter((check) => !check.passed),
            `第 ${index} 帧「${step.title}」没有通过 ${ids.join(' / ')}`,
        ).toEqual([]);
    }
}

/** 逐帧断言 pointers 的语义顺序:父节点 key 升序;每个父 left 在前、right 在后 */
function assertPointerOrder(steps: readonly TraceStep[]): void {
    for (const step of steps) {
        const document = readSceneDocument(step.document);
        const labelOf = new Map(document.nodes.map((node) => [node.key, node.label] as const));
        const groups = new Map<number, number[]>();
        const parentOrder: number[] = [];
        for (const pointer of document.pointers) {
            if (!groups.has(pointer.from)) {
                groups.set(pointer.from, []);
                parentOrder.push(pointer.from);
            }
            groups.get(pointer.from)?.push(pointer.to);
        }
        expect(parentOrder).toEqual([...parentOrder].sort((a, b) => a - b));
        for (const [from, children] of groups) {
            if (children.length !== 2) continue;
            const parentValue = Number(labelOf.get(from));
            expect(Number(labelOf.get(children[0]))).toBeLessThan(parentValue);
            expect(Number(labelOf.get(children[1]))).toBeGreaterThan(parentValue);
        }
    }
}

/** parent / left / right 三套指针互相一致,根没有父,节点数与登记表一致 */
function assertLinks(tree: TreeModel): void {
    expect(tree.root?.parent ?? null).toBeNull();
    let count = 0;
    for (const node of tree.preOrder()) {
        count += 1;
        if (node.left !== null) expect(node.left.parent).toBe(node);
        if (node.right !== null) expect(node.right.parent).toBe(node);
    }
    expect(count).toBe(tree.nodes.size);
}

function values(tree: TreeModel): number[] {
    return tree.inOrder().map((node) => node.value);
}

function lastStep(steps: readonly TraceStep[]): TraceStep {
    const step = steps[steps.length - 1];
    if (step === undefined) throw new Error('轨迹为空');
    return step;
}

describe('BST 旋转:结构正确性', () => {
    it('左旋前后中序完全相同,父指针一致', () => {
        const tree = new TreeModel().build([10, 5, 15, 3, 7, 12, 18]);
        const before = values(tree);
        const y = rotateLeft(tree, tree.find(10) as TreeNode);
        expect(y.value).toBe(15);
        expect(tree.root?.value).toBe(15);
        expect(values(tree)).toEqual(before);
        assertLinks(tree);
    });

    it('右旋前后中序完全相同', () => {
        const tree = new TreeModel().build([10, 5, 15, 3, 7, 12, 18]);
        const before = values(tree);
        const y = rotateRight(tree, tree.find(10) as TreeNode);
        expect(y.value).toBe(5);
        expect(tree.root?.value).toBe(5);
        expect(values(tree)).toEqual(before);
        assertLinks(tree);
    });

    it('左旋后右旋回到原结构(snapshot 逐字段相等,节点 key 不变)', () => {
        const tree = new TreeModel().build([10, 5, 15, 3, 7, 12, 18]);
        const original = tree.snapshot();
        const beforeKeys = [...tree.nodes.keys()];

        const y = rotateLeft(tree, tree.find(10) as TreeNode);
        rotateRight(tree, y);

        expect(tree.snapshot()).toEqual(original);
        expect([...tree.nodes.keys()]).toEqual(beforeKeys);
        assertLinks(tree);
    });

    it('根旋转正确改写 root;非根旋转保持父指针', () => {
        const rootTree = new TreeModel().build([10, 5, 15]);
        rotateLeft(rootTree, rootTree.root as TreeNode);
        expect(rootTree.root?.value).toBe(15);
        expect(rootTree.root?.parent).toBeNull();

        const innerTree = new TreeModel().build([10, 5, 15, 3, 7]);
        const five = innerTree.find(5) as TreeNode;
        rotateLeft(innerTree, five);
        // 5 的右孩子 7 上位,10 仍是根,7 顶替 5 的位置,5 成为 7 的左孩子
        expect(innerTree.root?.value).toBe(10);
        expect(innerTree.root?.left?.value).toBe(7);
        expect(innerTree.find(7)?.parent?.value).toBe(10);
        expect(innerTree.find(5)?.parent?.value).toBe(7);
        assertLinks(innerTree);
    });

    it('要转的一侧没有孩子时直接抛错(不是旋转)', () => {
        const tree = new TreeModel().build([10, 5]);
        expect(() => rotateLeft(tree, tree.find(5) as TreeNode)).toThrow();
        expect(() => rotateRight(tree, tree.find(5) as TreeNode)).toThrow();
    });
});

describe('BST 旋转:高度变化', () => {
    it('线形右重:左旋把层数从 4 降到 3', () => {
        const tree = new TreeModel().build([10, 5, 20, 15, 30, 40]);
        expect(tree.height()).toBe(4);
        const before = values(tree);
        rotateLeft(tree, tree.find(10) as TreeNode);
        expect(tree.height()).toBe(3);
        expect(values(tree)).toEqual(before);
    });

    it('之字形:单旋只镜像,层数仍是 3', () => {
        const tree = new TreeModel().build([30, 10, 20]);
        expect(tree.height()).toBe(3);
        const before = values(tree);
        rotateRight(tree, tree.find(30) as TreeNode);
        expect(tree.height()).toBe(3);
        expect(values(tree)).toEqual(before);
    });

    it('之字形双旋:层数 3 -> 2', () => {
        const tree = new TreeModel().build([30, 10, 20]);
        const before = values(tree);
        rotateLeft(tree, tree.find(10) as TreeNode);
        rotateRight(tree, tree.find(30) as TreeNode);
        expect(tree.height()).toBe(2);
        expect(values(tree)).toEqual(before);
        assertLinks(tree);
    });
});

describe('BST 旋转轨迹', () => {
    it('三拍:认轴(hold)-> 旋转完成(motion rotate)-> 验证中序', () => {
        const tree = new TreeModel().build([10, 5, 15, 3, 7]);
        const x = tree.find(10) as TreeNode;
        const y = tree.find(15) as TreeNode;
        const steps = recordFrames(() => tree.snapshot(), rotateFrames(tree, 'left', 10));
        expect(steps).toHaveLength(3);

        const intro = steps[0] as TraceStep;
        expect(intro.framing).toBe('hold');
        expect(intro.frame).toContain(x.key);
        expect(intro.frame).toContain(y.key);

        const completion = steps[1] as TraceStep;
        expect(completion.motion).toEqual({ kind: 'rotate', from: x.key, to: y.key });
        expect(completion.anchor).toBe(y.key);
        expect(completion.anchorAt).toBe(x.key);
        expect(completion.framing).toBe('hold');

        const verify = steps[2] as TraceStep;
        expect(verify.detail).toContain('3 5 7 10 15');
        expect(tree.root?.value).toBe(15);

        assertFramesValidate(steps);
        assertPointerOrder(steps);
    });

    it('右旋轨迹:from = x、to = y,中序不变', () => {
        const tree = new TreeModel().build([10, 5, 15, 3, 7]);
        const x = tree.find(10) as TreeNode;
        const y = tree.find(5) as TreeNode;
        const steps = recordFrames(() => tree.snapshot(), rotateFrames(tree, 'right', 10));
        expect(lastStep(steps).detail).toContain('3 5 7 10 15');
        const completion = steps[1] as TraceStep;
        expect(completion.motion).toEqual({ kind: 'rotate', from: x.key, to: y.key });
        expect(completion.anchor).toBe(y.key);
        expect(tree.root?.value).toBe(5);
        assertFramesValidate(steps);
    });

    it('连续旋转(含根旋转)每帧都是合法 BST,中序恒不变', () => {
        const tree = new TreeModel().build([10, 5, 20, 15, 30, 40]);
        const steps: TraceStep[] = [];
        steps.push(...recordFrames(() => tree.snapshot(), rotateFrames(tree, 'left', 10)));
        steps.push(...recordFrames(() => tree.snapshot(), rotateFrames(tree, 'right', 20)));
        assertFramesValidate(steps);
        assertPointerOrder(steps);
        expect(values(tree)).toEqual([5, 10, 15, 20, 30, 40]);
        // 左旋 10 后 20 是根,再右旋 20 回到原状
        expect(tree.root?.value).toBe(10);
        expect(tree.height()).toBe(4);
    });

    it('不存在的值 / 缺孩子的一侧:只讲解、不生成帧', () => {
        const tree = new TreeModel().build([10, 5]);
        expect(recordFrames(() => tree.snapshot(), rotateFrames(tree, 'left', 5))).toHaveLength(0);
        expect(recordFrames(() => tree.snapshot(), rotateFrames(tree, 'left', 99))).toHaveLength(0);
        expect(tree.root?.value).toBe(10);
    });
});
