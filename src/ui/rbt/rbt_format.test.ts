/**
 * 显示层的**文案拼装**(ui/rbt/rbt_format.ts)的契约:纯字符串,默认 node 环境.
 *
 * 核心层只给结构化结果(错误码 / 违规节点 / 两侧黑高),这一层把它变成界面上那句话.
 * 所以这里断言的是**看得见的字**:
 *
 * - 解析失败:错误码 -> 固定句子的映射(每条错误码都要有句子,漏一条编译期就报);
 * - 性质违规:节点写成"值+颜色",黑高那条把两个数填进模板;
 * - 抬头:总条数 / FAIL 条数换成数字.
 *
 * 核心层的事实(哪棵树坏在哪条、违规节点是哪个)在 datastruct/rbt/rbt_tree.test.ts;
 * 解析器在 datastruct/rbt/rbt_parse.test.ts.两边的接口就是 RbtParseError 与 RbtPropertyReport.
 */
import { describe, expect, it } from 'vitest';

import { RbtParseError, buildTreeFromExpression } from '@/datastruct/rbt/rbt_parse';
import {
    checkTreeProperties,
    findPropertyResult,
    type RbtPropertyId,
    type RbtPropertyReport,
} from '@/datastruct/rbt/rbt_tree';
import { RBT_PROPERTY_IDS } from '@/datastruct/rbt/rbt_tree';
import {
    formatParseError,
    formatPropertyDetail,
    formatPropertySummary,
} from '@/ui/rbt/rbt_format';

/** 解析失败时取错误对象(没抛就说明契约变了) */
function parseError(expression: string): RbtParseError {
    try {
        buildTreeFromExpression(expression);
    } catch (error) {
        if (error instanceof RbtParseError) return error;
        throw error;
    }
    throw new Error(`表达式 "${expression}" 本该解析失败,却解析成功了`);
}

/** 把表达式喂给核心层跑一遍性质检查 */
function report(expression: string): RbtPropertyReport {
    return checkTreeProperties(buildTreeFromExpression(expression));
}

/** 某一条性质的出错说明(PASS 时为空串) */
function detail(expression: string, id: RbtPropertyId): string {
    return formatPropertyDetail(findPropertyResult(report(expression), id));
}

describe('红黑树:解析失败文案(错误码 -> 一句话)', () => {
    it('短简写 / 没颜色 / 颜色标记 / 节点格式各自成句', () => {
        expect(formatParseError(parseError('5'))).toBe('解析失败: 无效节点简写: "5",需要例如 "5R" 或 "13B"');
        expect(formatParseError(parseError('5X'))).toBe('解析失败: 简写节点必须用 R/B 结尾,错误: "5X"');
        expect(formatParseError(parseError('B(1B,2B)'))).toBe('解析失败: 节点格式错误: 至少包含值和颜色(如 13B), 实际: B');
        expect(formatParseError(parseError('5X(nil,nil)'))).toBe('解析失败: 颜色标记必须是 R 或 B, 错误部分: 5X');
    });

    it('括号 / 逗号 / 多余内容三条句子里带出错片段', () => {
        expect(formatParseError(parseError('5B(1B,2B'))).toContain('括号不匹配');
        expect(formatParseError(parseError('5B(1B 2B)'))).toContain('缺少逗号');
        expect(formatParseError(parseError('5B(1B 2B)'))).toContain('1B 2B');
        expect(formatParseError(parseError('5B(1B,2B)junk'))).toContain('表达式末尾有多余内容');
        expect(formatParseError(parseError('5B(1B,2B)junk'))).toContain('junk');
    });

    it('每一句都以"解析失败: "开头(前缀与具体原因分开,改前缀只动一处)', () => {
        for (const expression of ['5', '5X', 'B(1B,2B)', '5X(nil,nil)', '5B(1B,2B', '5B(1B 2B)', '5B(1B,2B)junk']) {
            expect(formatParseError(parseError(expression)), expression).toMatch(/^解析失败: /);
        }
    });

    it('认不出的异常退回它自己的 message(意外状况不吞掉原始信息)', () => {
        expect(formatParseError(new Error('程序内部错误'))).toBe('解析失败: 程序内部错误');
        expect(formatParseError('随便一个值')).toBe('解析失败: 随便一个值');
    });
});

describe('红黑树:性质违规文案(结构化结论 -> 一句话)', () => {
    it('PASS 的条目没有出错说明(输出区不 append 这一段)', () => {
        const result = findPropertyResult(report('10B(5R,15R)'), 'root-black');
        expect(formatPropertyDetail(result)).toBe('');
    });

    it('根红:写出违规节点的值与颜色', () => {
        expect(detail('10R(5B,20B)', 'root-black')).toBe('根节点 10R 是红色');
    });

    it('红接红:写出那个红节点', () => {
        expect(detail('10B(5R(1R,7B),20B(15B,30B))', 'red-no-red-child'))
            .toBe('红节点 5R 的孩子是红色');
    });

    it('黑高不一致:填出较浅 / 较深两侧的数字', () => {
        expect(detail('10B(5B,20B(15B,30B))', 'black-height'))
            .toBe('节点 10B 两侧黑高不同: 较浅一侧 2,较深一侧 3');
    });

    it('搜索序:写出以谁为根的子树不满足左小右大', () => {
        expect(detail('10B(5B(3B,7B),40B(2B,50B))', 'bst-order'))
            .toBe('以 10B 为根的子树不满足左小右大');
    });

    it('抬头把总条数 / FAIL 条数换成数字', () => {
        expect(formatPropertySummary(report('10B(5R(1B,7B),20R(15B,30B))')))
            .toBe(`红黑树性质检查: ${RBT_PROPERTY_IDS.length} 条中 0 条 FAIL`);
        expect(formatPropertySummary(report('10R(5B,20B)'))).toMatch(/条中 [1-9]\d* 条 FAIL/);
    });
});
