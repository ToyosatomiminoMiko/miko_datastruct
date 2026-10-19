/**
 * BST 模型与轨迹生成(纯逻辑,node 环境)的契约.
 *
 * 钉住的是 docs/animation.md §7 / §11 的教学路径与几件容易退化的事:
 * - 每帧 document 都能被 `readSceneDocument` 解析、`checkBstOrder` 全 PASS;
 * - `pointers` 顺序承载左右语义(左孩子在前),父节点按 key 升序输出;
 * - 查找命中 / 失败、插入(含空树 / 重复值)、删除叶子 / 单孩子 / 双孩子(物理移植)、
 *   删到空这些步骤都要真的出现,升序 1..7 必须退化成高度 7 的链.
 */
import { describe, expect, it } from 'vitest';

import type { SceneDocument } from '@/scene/scene_document';
import { readSceneDocument } from '@/scene/scene_document_parse';
import { runSceneChecks } from '@/datastruct/checks';
import {
    TreeModel,
    deleteFrames,
    insertFrames,
    searchFrames,
    shapeFrames,
    traverseFrames,
} from '@/datastruct/bst/bst';
import { recordFrames, type TraceStep } from '@/datastruct/trace/trace';

/** 逐帧解析 + 跑 BST 有序检查:轨迹本身必须是合法场景 */
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
            expect(children.length).toBeLessThanOrEqual(2);
            if (children.length !== 2) continue;
            // pointers 顺序 = 左右:第一个孩子必须比父小(左),第二个必须比父大(右)
            const parentValue = Number(labelOf.get(from));
            expect(Number(labelOf.get(children[0]))).toBeLessThan(parentValue);
            expect(Number(labelOf.get(children[1]))).toBeGreaterThan(parentValue);
        }
    }
}

function lastStep(steps: readonly TraceStep[]): TraceStep {
    const step = steps[steps.length - 1];
    if (step === undefined) throw new Error('轨迹为空');
    return step;
}

function values(tree: TreeModel): number[] {
    return tree.inOrder().map((node) => node.value);
}

const BASE = [8, 4, 12, 2, 6, 10, 14] as const;

describe('BST 模型:结构与快照', () => {
    it('build 之后中序升序,重复值不新建节点', () => {
        const tree = new TreeModel().build([8, 4, 12, 2, 6, 10, 14, 4]);
        expect(values(tree)).toEqual([2, 4, 6, 8, 10, 12, 14]);
        expect(tree.nodes.size).toBe(7);
        expect(tree.find(6)?.value).toBe(6);
        expect(tree.find(0)).toBeNull();
    });

    it('空树快照是空文档;有节点时 nodes 按 key 升序、attrs 为空', () => {
        const empty = new TreeModel();
        expect(empty.snapshot()).toEqual({ nodes: [], pointers: [], edges: [] });
        expect(empty.height()).toBe(0);

        const tree = new TreeModel().build(BASE);
        const document = tree.snapshot();
        expect(document.edges).toEqual([]);
        expect(document.nodes.map((node) => node.key)).toEqual([...document.nodes.map((node) => node.key)].sort((a, b) => a - b));
        expect(document.nodes.every((node) => Object.keys(node.attrs).length === 0)).toBe(true);
        expect(document.nodes.find((node) => node.key === tree.find(8)?.key)?.label).toBe('8');
    });

    it('快照顺序 + 高度 + 子树 key 都是确定性的', () => {
        const tree = new TreeModel().build(BASE);
        expect(tree.snapshot()).toEqual(tree.snapshot());
        expect(tree.height()).toBe(3);
        expect(tree.preOrder().map((node) => node.value)).toEqual([8, 4, 2, 6, 12, 10, 14]);
        expect(tree.postOrder().map((node) => node.value)).toEqual([2, 6, 4, 10, 14, 12, 8]);
        expect(tree.minimum(tree.root as NonNullable<TreeModel['root']>).value).toBe(2);
        expect(tree.subtreeKeys(tree.find(4) as NonNullable<TreeModel['root']>)).toHaveLength(3);
        // 同一组输入,两棵树的 key 分配完全一样(轨迹可复现的前提)
        const twin = new TreeModel().build(BASE);
        expect(tree.snapshot()).toEqual(twin.snapshot());
    });
});

describe('BST 查找轨迹', () => {
    it('命中:每比较一次一拍,最后一拍 state found', () => {
        const tree = new TreeModel().build(BASE);
        const steps = recordFrames(() => tree.snapshot(), searchFrames(tree, 6));
        expect(steps.length).toBe(3); // 8 -> 4 -> 6
        expect(lastStep(steps).focus).toBe(tree.find(6)?.key);
        expect(lastStep(steps).marks?.nodes?.some((mark) => mark.state === 'found')).toBe(true);
        expect(lastStep(steps).detail).toContain('命中');
        assertFramesValidate(steps);
        assertPointerOrder(steps);
    });

    it('失败:最后一拍说明"将插在这里"', () => {
        const tree = new TreeModel().build(BASE);
        const steps = recordFrames(() => tree.snapshot(), searchFrames(tree, 5));
        expect(steps.length).toBe(4); // 8 -> 4 -> 6 三次比较,再一拍落到空位
        expect(lastStep(steps).detail).toContain('将插在这里');
        expect(lastStep(steps).marks?.nodes?.some((mark) => mark.state === 'found')).toBe(false);
        assertFramesValidate(steps);
    });

    it('空树查找:一拍说明成为根', () => {
        const tree = new TreeModel();
        const steps = recordFrames(() => tree.snapshot(), searchFrames(tree, 5));
        expect(steps).toHaveLength(1);
        expect(lastStep(steps).detail).toContain('将插在这里');
        expect(steps[0]?.document.nodes).toEqual([]);
    });
});

describe('BST 插入轨迹', () => {
    it('插入 5 后中序升序,最后一拍 mark fresh、anchor 父节点', () => {
        const tree = new TreeModel().build(BASE);
        const parentKey = tree.find(6)?.key;
        const steps = recordFrames(() => tree.snapshot(), insertFrames(tree, 5));
        expect(values(tree)).toEqual([2, 4, 5, 6, 8, 10, 12, 14]);
        expect(tree.find(5)?.value).toBe(5);
        expect(lastStep(steps).marks?.nodes?.some((mark) => mark.state === 'fresh')).toBe(true);
        expect(lastStep(steps).focus).toBe(tree.find(5)?.key);
        expect(lastStep(steps).anchor).toBe(parentKey);
        expect(lastStep(steps).document.nodes).toHaveLength(8);
        assertFramesValidate(steps);
        assertPointerOrder(steps);
    });

    it('同值已存在:只一拍,不插', () => {
        const tree = new TreeModel().build(BASE);
        const steps = recordFrames(() => tree.snapshot(), insertFrames(tree, 6));
        expect(steps).toHaveLength(3); // 比较 8、4,到 6 时发现同值
        expect(lastStep(steps).title).toContain('已存在');
        expect(tree.nodes.size).toBe(7);
    });

    it('空树插入:只有完成一拍,成为根', () => {
        const tree = new TreeModel();
        const steps = recordFrames(() => tree.snapshot(), insertFrames(tree, 5));
        expect(steps).toHaveLength(1);
        expect(tree.root?.value).toBe(5);
        expect(lastStep(steps).document.nodes).toHaveLength(1);
        expect(lastStep(steps).anchor).toBeUndefined();
        assertFramesValidate(steps);
    });

    it('fitCamera 让插入完成帧 framing = fit', () => {
        const tree = new TreeModel().build(BASE);
        const steps = recordFrames(() => tree.snapshot(), insertFrames(tree, 5, { fitCamera: true, holdMs: 500 }));
        expect(lastStep(steps).framing).toBe('fit');
        expect(lastStep(steps).holdMs).toBe(500);
        expect(steps.every((step) => step.holdMs === 500)).toBe(true);
    });
});

describe('BST 删除轨迹:叶子 / 单孩子 / 双孩子', () => {
    it('删叶子 2:节点摘除,完成帧 anchor 父节点', () => {
        const tree = new TreeModel().build(BASE);
        const parentKey = tree.find(4)?.key;
        const steps = recordFrames(() => tree.snapshot(), deleteFrames(tree, 2));
        expect(steps.map((step) => step.title).join('|')).toContain('叶子');
        expect(tree.find(2)).toBeNull();
        expect(values(tree)).toEqual([4, 6, 8, 10, 12, 14]);
        expect(lastStep(steps).anchor).toBe(parentKey);
        assertFramesValidate(steps);
        assertPointerOrder(steps);
    });

    it('删单孩子 12:完成帧 motion = subtree', () => {
        const tree = new TreeModel().build([8, 4, 12, 2, 6, 10]);
        const childKey = tree.find(10)?.key;
        const steps = recordFrames(() => tree.snapshot(), deleteFrames(tree, 12));
        expect(steps.map((step) => step.title).join('|')).toContain('单孩子');
        expect(lastStep(steps).motion).toEqual({ kind: 'subtree', root: childKey });
        expect(values(tree)).toEqual([2, 4, 6, 8, 10]);
        expect(tree.find(12)).toBeNull();
        assertFramesValidate(steps);
        assertPointerOrder(steps);
    });

    it('删双孩子 12:先找后继,再物理移植(后继 key 不变)', () => {
        const tree = new TreeModel().build(BASE);
        const successorKey = tree.find(14)?.key;
        const steps = recordFrames(() => tree.snapshot(), deleteFrames(tree, 12));
        const titles = steps.map((step) => step.title).join('|');
        expect(titles).toContain('后继');
        expect(titles).toContain('物理移植');
        expect(steps.some((step) => step.marks?.nodes?.some((mark) => mark.state === 'found'))).toBe(true);
        expect(tree.find(12)).toBeNull();
        // 物理移植:后继节点对象整个接到被删位置,key / 父指针跟着它走
        expect(tree.find(14)?.key).toBe(successorKey);
        expect(tree.find(14)?.parent?.value).toBe(8);
        expect(values(tree)).toEqual([2, 4, 6, 8, 10, 14]);
        assertFramesValidate(steps);
        assertPointerOrder(steps);
    });

    it('删根(双孩子):新根是后继,完成帧锚定到被删的根', () => {
        const tree = new TreeModel().build(BASE);
        const oldRootKey = tree.root?.key;
        const successorKey = tree.find(10)?.key;
        const steps = recordFrames(() => tree.snapshot(), deleteFrames(tree, 8));
        expect(tree.root?.value).toBe(10);
        expect(tree.root?.key).toBe(successorKey);
        expect(lastStep(steps).anchor).toBe(successorKey);
        expect(lastStep(steps).anchorAt).toBe(oldRootKey);
        expect(values(tree)).toEqual([2, 4, 6, 10, 12, 14]);
        assertFramesValidate(steps);
        assertPointerOrder(steps);
    });

    it('删到空:document 为空且不锚定', () => {
        const tree = new TreeModel().build([5]);
        const steps = recordFrames(() => tree.snapshot(), deleteFrames(tree, 5));
        expect(steps.length).toBeGreaterThanOrEqual(2);
        expect(lastStep(steps).document.nodes).toEqual([]);
        expect(tree.root).toBeNull();
        expect(lastStep(steps).anchor).toBeUndefined();
        assertFramesValidate(steps);
    });

    it('删除不存在的值 / 空树删除都只是一拍叙述', () => {
        const tree = new TreeModel().build(BASE);
        const missing = recordFrames(() => tree.snapshot(), deleteFrames(tree, 99));
        expect(missing).toHaveLength(4); // 8、12、14 三次比较后落到空位
        expect(lastStep(missing).detail).toContain('不在树中');

        const empty = new TreeModel();
        const emptySteps = recordFrames(() => empty.snapshot(), deleteFrames(empty, 1));
        expect(emptySteps).toHaveLength(1);
        expect(lastStep(emptySteps).title).toContain('空树');
    });
});

describe('BST 退化:升序插入 1..7', () => {
    it('build 升序 1..7 高度 = 7;逐拍插入轨迹每帧合法且完成帧 fit', () => {
        const tree = new TreeModel().build([1, 2, 3, 4, 5, 6, 7]);
        expect(tree.height()).toBe(7);

        const demo = new TreeModel();
        const steps: TraceStep[] = [];
        for (let value = 1; value <= 7; value += 1) {
            steps.push(...recordFrames(() => demo.snapshot(), insertFrames(demo, value, { fitCamera: true })));
        }
        expect(demo.height()).toBe(7);
        expect(values(demo)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(lastStep(steps).framing).toBe('fit');
        assertFramesValidate(steps);
        assertPointerOrder(steps);
    });
});

describe('BST 遍历与形状章节', () => {
    it('中序遍历每访问一个节点一拍,detail 累积访问序列', () => {
        const tree = new TreeModel().build(BASE);
        const steps = recordFrames(() => tree.snapshot(), traverseFrames(tree, 'in'));
        expect(steps).toHaveLength(7);
        expect(lastStep(steps).detail).toContain('2 4 6 8 10 12 14');
        expect(steps.flatMap((step) => step.marks?.nodes ?? []).some((mark) => mark.state === 'visited')).toBe(true);
        assertFramesValidate(steps);
    });

    it('空树遍历也有一拍', () => {
        const tree = new TreeModel();
        const steps = recordFrames(() => tree.snapshot(), traverseFrames(tree, 'post'));
        expect(steps).toHaveLength(1);
        expect(lastStep(steps).document.nodes).toEqual([]);
    });

    it('shapeFrames:两拍,第一拍 fit,第二拍全部 visited + 中序序列', () => {
        const tree = new TreeModel().build(BASE);
        const steps = recordFrames(() => tree.snapshot(), shapeFrames(tree));
        expect(steps).toHaveLength(2);
        expect(steps[0]?.framing).toBe('fit');
        expect(steps[0]?.document).toEqual(tree.snapshot());
        expect(steps[1]?.marks?.nodes).toHaveLength(7);
        expect(steps[1]?.marks?.nodes?.every((mark) => mark.state === 'visited')).toBe(true);
        expect(steps[1]?.detail).toContain('2 4 6 8 10 12 14');
        assertFramesValidate(steps);
    });
});

describe('BST 快照与检查口径', () => {
    it('每帧的 document 节点 key 唯一、指针引用有效', () => {
        const tree = new TreeModel().build(BASE);
        const steps = recordFrames(() => tree.snapshot(), deleteFrames(tree, 4));
        for (const step of steps) {
            const document = step.document as SceneDocument;
            const keys = document.nodes.map((node) => node.key);
            expect(new Set(keys).size).toBe(keys.length);
            for (const pointer of document.pointers) {
                expect(keys).toContain(pointer.from);
                expect(keys).toContain(pointer.to);
            }
        }
    });

    it('颜色只在 colors: true 时写进 attrs', () => {
        const tree = new TreeModel().build([1, 2, 3]);
        expect(tree.snapshot().nodes.every((node) => Object.keys(node.attrs).length === 0)).toBe(true);
        const colored = tree.snapshot({ colors: true });
        expect(colored.nodes.every((node) => node.attrs.color === 'black')).toBe(true);
    });
});

