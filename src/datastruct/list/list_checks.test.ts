/**
 * 单链表检查(纯逻辑,node 环境)的契约:结构合法 + 值严格递增.
 *
 * 链表只应有向指针;每种结构错误都要 FAIL 且尽量指到具体节点.节点的 key 就是
 * 链表里比较的数值,有序性直接读 key.
 */
import { describe, expect, it } from 'vitest';

import { readSceneDocument } from '@/scene/scene_document_parse';
import type { SceneNodeKey } from '@/scene/scene_document';
import { LIST_CHECKS } from '@/datastruct/list/list_checks';

function listDocument(
    keys: readonly SceneNodeKey[],
    pointers: readonly (readonly [SceneNodeKey, SceneNodeKey])[],
    edges: readonly (readonly [SceneNodeKey, SceneNodeKey])[] = [],
): ReturnType<typeof readSceneDocument> {
    return readSceneDocument({
        nodes: keys.map((key) => ({ key })),
        pointers: pointers.map(([from, to]) => ({ from, to })),
        edges: edges.map(([a, b]) => ({ a, b })),
    });
}

function run(document: ReturnType<typeof readSceneDocument>) {
    return LIST_CHECKS.map((check) => check.run(document));
}

const STRUCTURE = '单链表结构合法';
const SORTED = '单链表节点值严格递增';

describe('单链表检查:合法链', () => {
    it('1 -> 2 -> 3 -> 4 -> 5:结构合法且严格递增', () => {
        const checks = run(listDocument([1, 2, 3, 4, 5], [[1, 2], [2, 3], [3, 4], [4, 5]]));
        expect(checks).toHaveLength(2);
        expect(checks.map((check) => check.passed)).toEqual([true, true]);
    });

    it('单节点:没有指针也合法', () => {
        const checks = run(listDocument([1], []));
        expect(checks.map((check) => check.passed)).toEqual([true, true]);
    });
});

describe('单链表检查:结构错误', () => {
    it('有两个表头 -> 结构合法 FAIL,定位到第二个表头', () => {
        const checks = run(listDocument([1, 2], []));
        const check = checks.find((candidate) => candidate.name === STRUCTURE);
        expect(check?.passed).toBe(false);
        expect(check?.node).toBe(2);
        expect(check?.detail).toContain('2 个节点没有父节点');
        // 结构不合法时排序检查也 FAIL,文案说明原因
        expect(checks.find((candidate) => candidate.name === SORTED)?.passed).toBe(false);
    });

    it('节点有两个孩子(分叉)-> 结构合法 FAIL', () => {
        const checks = run(listDocument([1, 2, 3], [[1, 2], [1, 3]]));
        const check = checks.find((candidate) => candidate.name === STRUCTURE);
        expect(check?.passed).toBe(false);
        expect(check?.node).toBe(1);
        expect(check?.detail).toContain('多个孩子');
    });

    it('节点有两个父节点(合流)-> 结构合法 FAIL', () => {
        const checks = run(listDocument([1, 2, 3], [[1, 3], [2, 3]]));
        const check = checks.find((candidate) => candidate.name === STRUCTURE);
        expect(check?.passed).toBe(false);
        expect(check?.node).toBe(3);
        expect(check?.detail).toContain('两个父节点');
    });

    it('闭环(没有表头)-> 结构合法 FAIL', () => {
        const checks = run(listDocument([1, 2], [[1, 2], [2, 1]]));
        const check = checks.find((candidate) => candidate.name === STRUCTURE);
        expect(check?.passed).toBe(false);
        expect(check?.detail).toContain('找不到表头');
    });

    it('表头之外还有一个自环(不可达)-> 结构合法 FAIL', () => {
        // 1 -> 2 是表头链,3 自环:只有一个表头,但 3 从表头走不到
        const checks = run(listDocument([1, 2, 3], [[1, 2], [3, 3]]));
        const check = checks.find((candidate) => candidate.name === STRUCTURE);
        expect(check?.passed).toBe(false);
        expect(check?.node).toBe(3);
        expect(check?.detail).toContain('不可达');
    });

    it('用了无向边 -> 结构合法 FAIL', () => {
        const checks = run(listDocument([1, 2], [], [[1, 2]]));
        const check = checks.find((candidate) => candidate.name === STRUCTURE);
        expect(check?.passed).toBe(false);
        expect(check?.detail).toContain('无向边');
    });
});

describe('单链表检查:有序性', () => {
    it('递减 -> 严格递增 FAIL,定位到第一个破坏点', () => {
        const checks = run(listDocument([1, 3, 2], [[1, 3], [3, 2]]));
        const check = checks.find((candidate) => candidate.name === SORTED);
        expect(check?.passed).toBe(false);
        expect(check?.node).toBe(2);
        expect(check?.detail).toContain('3');
        expect(check?.detail).toContain('2');
        expect(check?.details).toHaveLength(2);
    });

    it('字符串 key 不能当数值比较 -> FAIL(不静默跳过)', () => {
        const checks = run(listDocument(['a', 'b'], [['a', 'b']]));
        const check = checks.find((candidate) => candidate.name === SORTED);
        expect(check?.passed).toBe(false);
        expect(check?.node).toBe('a');
        expect(check?.detail).toContain('不是数字');
    });
});
