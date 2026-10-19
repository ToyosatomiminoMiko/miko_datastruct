/**
 * 「检查配置」编辑器内容的解析(纯逻辑,node 环境)的契约.
 *
 * 钉三件事:合法数组读成函数名数组、空输入等于没有检查、语法 / 形状错误带可读消息.
 */
import { describe, expect, it } from 'vitest';

import { CheckConfigError, dumpCheckConfig, parseCheckConfig } from '@/ui/viewer/check_config';

/** 断言抛的是 CheckConfigError,并交回它给调用方看消息 */
function expectError(source: string): CheckConfigError {
    try {
        parseCheckConfig(source);
    } catch (error) {
        expect(error).toBeInstanceOf(CheckConfigError);
        return error as CheckConfigError;
    }
    throw new Error(`期待解析失败,实际成功: ${source}`);
}

describe('检查配置:解析', () => {
    it('JSON 字符串数组 -> 函数名数组;重复名字只留第一次', () => {
        expect(parseCheckConfig('["checkRootBlack","checkBlackHeight","checkRootBlack"]'))
            .toEqual(['checkRootBlack', 'checkBlackHeight']);
    });

    it('空串 / 全空白 = 空数组(没有检查,不是错误)', () => {
        expect(parseCheckConfig('')).toEqual([]);
        expect(parseCheckConfig('  \n ')).toEqual([]);
        expect(parseCheckConfig('[]')).toEqual([]);
    });

    it('JSON 语法错 -> JSON 解析失败', () => {
        const error = expectError('["checkRootBlack",]');
        expect(error.message).toContain('JSON 解析失败');
    });

    it('顶层不是数组 / 元素不是非空字符串 -> 形状错误', () => {
        expect(expectError('{"checks":[]}').message).toContain('顶层必须是');
        expect(expectError('[1]').message).toContain('[0]');
        expect(expectError('[""]').message).toContain('[0]');
        expect(expectError('["ok", null]').message).toContain('[1]');
    });
});

describe('检查配置:写端', () => {
    it('dump 出来的文本能被 parse 原样读回', () => {
        const ids = ['checkRootBlack', 'checkBstOrder'];
        expect(parseCheckConfig(dumpCheckConfig(ids))).toEqual(ids);
    });
});
