/**
 * 最小堆检查(纯逻辑,node 环境)的契约.
 *
 * 检查只读中性文档:值在 label,父子在 pointers;不要求根唯一 / 二叉形状(那些不是
 * 堆序检查的职责).
 */
import { describe, expect, it } from 'vitest';

import { readSceneDocument } from '@/datastruct/scene/scene_document_parse';
import { HEAP_CHECKS } from '@/datastruct/heap/heap_checks';

function heapDocument(
    labels: readonly string[],
    pointers: readonly (readonly [number, number])[],
): ReturnType<typeof readSceneDocument> {
    return readSceneDocument({
        nodes: labels.map((label, key) => ({ key, label })),
        pointers: pointers.map(([from, to]) => ({ from, to })),
    });
}

function run(document: ReturnType<typeof readSceneDocument>) {
    return HEAP_CHECKS.map((check) => check.run(document));
}

describe('堆检查:最小堆序', () => {
    it('合法最小堆:每个父节点都不大于孩子 -> PASS', () => {
        const checks = run(heapDocument(
            ['1', '3', '2', '7', '4', '5', '8'],
            [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]],
        ));
        expect(checks).toHaveLength(1);
        expect(checks[0]?.passed).toBe(true);
    });

    it('父节点大于孩子 -> FAIL,定位到父节点并给出那一对', () => {
        const checks = run(heapDocument(['1', '3', '2'], [[0, 1], [0, 2], [1, 2]]));
        const check = checks[0];
        // 1 <= 3 / 1 <= 2 都成立,3 <= 2 不成立
        expect(check?.passed).toBe(false);
        expect(check?.node).toBe(1);
        expect(check?.detail).toContain('3');
        expect(check?.detail).toContain('2');
        expect(check?.details).toHaveLength(2);
    });

    it('label 不是数字 -> FAIL(不能静默跳过)', () => {
        const checks = run(heapDocument(['1', 'x'], [[0, 1]]));
        expect(checks[0]?.passed).toBe(false);
        expect(checks[0]?.node).toBe(1);
        expect(checks[0]?.detail).toContain('不是数字');
    });

    it('没有节点 -> PASS(没有堆序可违反)', () => {
        expect(run(heapDocument([], []))[0]?.passed).toBe(true);
    });
});
