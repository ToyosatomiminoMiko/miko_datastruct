/**
 * 红黑树性质检查(纯逻辑,node 环境)的契约.
 *
 * 检查吃的是**中性文档**:颜色在 attrs.color、父子在 pointers;两个孩子按指针顺序定
 * 左右,只剩一个孩子时按 key 与父节点比较定(小左大右).
 * 节点的 key 就是树里的值(13 / 8 / …),有序性直接比较 key,不再解析展示文字.
 * 所以测试不引用任何"Python 树对象",直接写 web 真正会收到的那份 JSON.
 */
import { describe, expect, it } from 'vitest';

import { readSceneDocument } from '@/scene/scene_document_parse';
import type { SceneCheckResult } from '@/scene/scene_check';
import { RBT_CHECKS } from '@/datastruct/rbt/rbt_checks';

/** 一份红黑树文档:节点写成 [key, color],指针写成 [from, to](key 就是数值) */
function rbtDocument(
    nodes: readonly (readonly [number, string?])[],
    pointers: readonly (readonly [number, number])[],
): ReturnType<typeof readSceneDocument> {
    return readSceneDocument({
        nodes: nodes.map(([key, color]) => (
            color === undefined
                ? { key }
                : { key, attrs: { color } }
        )),
        pointers: pointers.map(([from, to]) => ({ from, to })),
    });
}

function run(document: ReturnType<typeof readSceneDocument>): readonly SceneCheckResult[] {
    return RBT_CHECKS.map((check) => check.run(document));
}

/** 按名字取一条结论(名字对不上是硬错误,不静默跳过) */
function named(checks: readonly SceneCheckResult[], name: string): SceneCheckResult {
    const found = checks.find((check) => check.name === name);
    if (found === undefined) throw new Error(`检查结论里没有「${name}」`);
    return found;
}

const COLORS = '节点颜色合法';
const ROOT = '根节点为黑色';
const RED_CHILDREN = '红色节点的孩子都是黑色';
const BLACK_HEIGHT = '各路径黑色节点数量相同';
const BST = '二叉搜索树有序';

describe('红黑树检查:一棵合法树', () => {
    // 13B(8R(1B, 11B), 17R(15B, 25B)):颜色、黑高、搜索树顺序都成立
    const document = rbtDocument(
        [
            [13, 'black'],
            [8, 'red'],
            [1, 'black'],
            [11, 'black'],
            [17, 'red'],
            [15, 'black'],
            [25, 'black'],
        ],
        [[13, 8], [13, 17], [8, 1], [8, 11], [17, 15], [17, 25]],
    );

    it('五条性质全部 PASS', () => {
        const checks = run(document);
        expect(checks).toHaveLength(5);
        expect(checks.filter((check) => !check.passed)).toEqual([]);
    });
});

describe('红黑树检查:每条性质的 FAIL 条件', () => {
    it('颜色缺失 -> 节点颜色合法 FAIL,并列出没有颜色的节点', () => {
        const checks = run(rbtDocument([[10], [5]], [[10, 5]]));
        const check = named(checks, COLORS);
        expect(check.passed).toBe(false);
        expect(check.node).toBe(10);
        expect(check.detail).toContain('10');
        expect(check.details).toHaveLength(2);
    });

    it('根为红色 -> 根节点为黑色 FAIL,定位到根', () => {
        const checks = run(rbtDocument([[10, 'red'], [5, 'black']], [[10, 5]]));
        const check = named(checks, ROOT);
        expect(check.passed).toBe(false);
        expect(check.node).toBe(10);
    });

    it('红节点接红孩子 -> 红色节点的孩子都是黑色 FAIL,定位到红父', () => {
        const checks = run(rbtDocument(
            [[10, 'black'], [5, 'red'], [1, 'red']],
            [[10, 5], [5, 1]],
        ));
        const check = named(checks, RED_CHILDREN);
        expect(check.passed).toBe(false);
        expect(check.node).toBe(5);
        expect(check.detail).toContain('5');
        expect(check.detail).toContain('1');
    });

    it('两侧黑高不同 -> 各路径黑色节点数量相同 FAIL,带两个数和折叠详情', () => {
        // 默认示例同构:10B 左子树比右子树多一层黑
        const checks = run(rbtDocument(
            [
                [10, 'black'],
                [5, 'red'],
                [1, 'black'],
                [8, 'black'],
                [15, 'red'],
            ],
            [[10, 5], [5, 1], [5, 8], [10, 15]],
        ));
        const check = named(checks, BLACK_HEIGHT);
        expect(check.passed).toBe(false);
        expect(check.node).toBe(10);
        expect(check.detail).toContain('较浅一侧 1');
        expect(check.detail).toContain('较深一侧 2');
        expect(check.details.length).toBeGreaterThan(0);
    });

    it('孙子的值越过祖父的范围 -> 二叉搜索树有序 FAIL(只比父子查不出来)', () => {
        // 10 的左子树里出现 12:父子关系全对,整棵树不是搜索树
        const checks = run(rbtDocument(
            [
                [10, 'black'],
                [5, 'red'],
                [1, 'black'],
                [12, 'black'],
                [15, 'red'],
            ],
            [[10, 5], [10, 15], [5, 1], [5, 12]],
        ));
        const check = named(checks, BST);
        expect(check.passed).toBe(false);
        expect(check.node).toBe(12);
    });

    it('单孩子按 key 与父节点比较定左右:比父大的走右子树', () => {
        const checks = run(rbtDocument(
            [[10, 'black'], [15, 'red']],
            [[10, 15]],
        ));
        expect(named(checks, BST).passed).toBe(true);
    });

    it('单孩子按比较定左右后仍做区间检查:左孩子子树里出现大值就 FAIL', () => {
        // 5 是 10 的左孩子;5 的右子树出现 12(>10),按左子树区间必须全 < 10
        const checks = run(rbtDocument(
            [[10], [5], [12]],
            [[10, 5], [5, 12]],
        ));
        expect(named(checks, BST).passed).toBe(false);
    });

    it('字符串 key 不能当数值判序 -> 二叉搜索树有序 FAIL(不静默跳过)', () => {
        const document = readSceneDocument({
            nodes: [{ key: 'root', attrs: { color: 'black' } }],
            pointers: [],
        });
        const check = named(run(document), BST);
        expect(check.passed).toBe(false);
        expect(check.node).toBe('root');
        expect(check.detail).toContain('不是数字');
    });

    it('有环 -> 根 / 黑高 / 有序都报出结构问题,不会递归爆栈', () => {
        const checks = run(rbtDocument(
            [[10, 'black'], [5, 'red']],
            [[10, 5], [5, 10]],
        ));
        expect(named(checks, ROOT).passed).toBe(false);
        expect(named(checks, BLACK_HEIGHT).passed).toBe(false);
        expect(named(checks, BST).passed).toBe(false);
    });
});

describe('红黑树检查:空树', () => {
    it('没有节点:五条都是空真(与旧实现一致,不算失败)', () => {
        const checks = run(rbtDocument([], []));
        expect(checks).toHaveLength(5);
        expect(checks.every((check) => check.passed)).toBe(true);
    });
});
