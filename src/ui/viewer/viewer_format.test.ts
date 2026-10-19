/**
 * 查看器文案 / 变体映射(纯函数)的契约.
 */
import { describe, expect, it } from 'vitest';

import { SceneDocumentError } from '@/scene/scene_document_parse';
import {
    formatAttributeValue,
    formatCheckConfigError,
    formatCheckSummary,
    formatDocumentError,
    formatUnknownChecks,
    nodeVariant,
} from '@/ui/viewer/viewer_format';

describe('查看器:文案', () => {
    it('解析错误带路径与说明;认不出的异常退回自己的 message', () => {
        expect(formatDocumentError(new SceneDocumentError('node-key', 'nodes[1].key', '必须是 0 或正整数')))
            .toBe('nodes[1].key: 必须是 0 或正整数');
        expect(formatDocumentError(new Error('boom'))).toBe('boom');
        expect(formatDocumentError('plain')).toBe('plain');
    });

    it('检查抬头:两个占位符都换成数字', () => {
        expect(formatCheckSummary(5, 1)).toBe('5 条中 1 条 FAIL');
        expect(formatCheckSummary(0, 0)).toBe('0 条中 0 条 FAIL');
    });

    it('检查配置错误:统一加"检查配置: "前缀', () => {
        expect(formatCheckConfigError(new Error('JSON 解析失败: x')))
            .toBe('检查配置: JSON 解析失败: x');
        expect(formatCheckConfigError('plain')).toBe('检查配置: plain');
    });

    it('未注册函数名:一条警告里列全', () => {
        expect(formatUnknownChecks(['checkNope', 'checkMissing']))
            .toBe('检查配置里有未找到的检查函数: checkNope, checkMissing');
    });

    it('属性值原样转字符串(字符串不加 JSON 引号)', () => {
        expect(formatAttributeValue('black')).toBe('black');
        expect(formatAttributeValue(3)).toBe('3');
        expect(formatAttributeValue(false)).toBe('false');
    });
});

describe('查看器:节点变体', () => {
    it('attrs.color 归一成小写变体名(红黑树示例)', () => {
        expect(nodeVariant({ color: 'red' })).toBe('red');
        expect(nodeVariant({ color: 'BLACK' })).toBe('black');
    });

    it('attrs.variant 优先于 color(显式语义)', () => {
        expect(nodeVariant({ variant: 'current', color: 'red' })).toBe('current');
    });

    it('不合法的值不产生变体:不能把任意字符串塞进 class 名', () => {
        expect(nodeVariant({ color: 'not a color' })).toBeUndefined();
        expect(nodeVariant({ color: 'red blue' })).toBeUndefined();
        expect(nodeVariant({ color: 3 })).toBeUndefined();
        expect(nodeVariant({ variant: '"x' })).toBeUndefined();
        expect(nodeVariant({})).toBeUndefined();
    });
});
