/**
 * 红黑树表达式解析(datastruct/rbt/rbt_parse.ts)的契约:纯函数,默认 node 环境.
 *
 * 只钉两件事:成功时的树形,失败时的原因码与出错片段.给人看的中文句子是显示层的事,这里
 * 一个文案断言都没有,两件事分开测.
 */
import { describe, expect, it } from 'vitest';

import { RbtParseError, buildTreeFromExpression } from '@/datastruct/rbt/rbt_parse';
import type { RbtNode } from '@/datastruct/rbt/rbt_tree';

/** 解析失败时取错误(没抛就说明契约变了,直接抛错而不是让断言读 null) */
function parseError(expression: string): RbtParseError {
    try {
        buildTreeFromExpression(expression);
    } catch (error) {
        if (error instanceof RbtParseError) return error;
        throw error;
    }
    throw new Error(`表达式 "${expression}" 本该解析失败,却解析成功了`);
}

describe('红黑树:表达式解析(树形)', () => {
    it('简写叶子自动补成 (nil,nil),左右子树为 null', () => {
        const node = buildTreeFromExpression('5R') as RbtNode;
        expect(node.value).toBe('5');
        expect(node.color).toBe('R');
        expect(node.left).toBeNull();
        expect(node.right).toBeNull();
    });

    it('nil / 空表达式给 null(空树),不建节点', () => {
        expect(buildTreeFromExpression('')).toBeNull();
        expect(buildTreeFromExpression('   ')).toBeNull();
        expect(buildTreeFromExpression('nil')).toBeNull();
        expect(buildTreeFromExpression('NIL')).toBeNull();
    });

    it('标准括号表达式按左右子树拆开', () => {
        const root = buildTreeFromExpression('13B(8R(1B,11R),17R(15B,25B))') as RbtNode;
        expect(`${root.value}${root.color}`).toBe('13B');
        expect(root.left?.value).toBe('8');
        expect(root.left?.left?.value).toBe('1');
        expect(root.left?.right?.value).toBe('11');
        expect(root.right?.value).toBe('17');
        expect(root.right?.left?.value).toBe('15');
        expect(root.right?.right?.value).toBe('25');
    });

    it('前后空白是允许的(解析先 trim)', () => {
        expect(buildTreeFromExpression('  5B(1B,2B)  ')?.value).toBe('5');
    });
});

describe('红黑树:解析失败的原因码', () => {
    it('每种格式错误抛出对应的错误码', () => {
        expect(parseError('5').code).toBe('shorthand-too-short');
        expect(parseError('5X').code).toBe('shorthand-no-color');
        expect(parseError('B(1B,2B)').code).toBe('node-format');
        expect(parseError('5X(nil,nil)').code).toBe('color-mark');
        expect(parseError('5B(1B,2B').code).toBe('unbalanced');
        expect(parseError('5B(1B 2B)').code).toBe('no-comma');
        expect(parseError('5B(1B,2B)junk').code).toBe('trailing');
    });

    it('错误片段就是输入里出错的那一段(显示层负责把它嵌进句子里)', () => {
        expect(parseError('5').fragment).toBe('5');
        expect(parseError('5X').fragment).toBe('5X');
        expect(parseError('B(1B,2B)').fragment).toBe('B');
        expect(parseError('5X(nil,nil)').fragment).toBe('5X');
        expect(parseError('5B(1B 2B)').fragment).toBe('1B 2B');
    });

    it('括号配平之后还有内容 -> 抛 trailing,片段是多余的那一段,不静默丢弃', () => {
        // 括号配平只说明"这一段对上了",整串是否只有这一个表达式还要另外查
        expect(parseError('5B(1B,2B)junk').fragment).toBe('junk');
        expect(parseError('5B(1B,2B))').fragment).toBe(')');
        expect(parseError('5B(1B,2B)(3B,4B)').fragment).toBe('(3B,4B)');
        // 子树里也一样:左子树收尾之后多出来的字符同样要报错
        expect(parseError('5B(1B(2B,3B)x,4B)').fragment).toBe('x');
    });

    it('错误对象的 message 带上错误码与片段(调试 / 日志用,不是界面文案)', () => {
        const error = parseError('5B(1B 2B)');
        expect(error.name).toBe('RbtParseError');
        expect(error.message).toContain('no-comma');
        expect(error.message).toContain('1B 2B');
    });
});
