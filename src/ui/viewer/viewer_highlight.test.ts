/**
 * JSON 高亮器(纯字符串)的契约.
 *
 * 高亮层把产物按 HTML 写进编辑器背后,所以两条硬约束:去掉标签 / 还原实体后与源码
 * 逐字相等(否则光标与着色错位);几类词法各自带上类名(颜色由 tokens.css 给).
 */
import { describe, expect, it } from 'vitest';

import {
    VIEWER_TOKEN_KEY_CLASS,
    VIEWER_TOKEN_LITERAL_CLASS,
    VIEWER_TOKEN_NUMBER_CLASS,
    VIEWER_TOKEN_PUNCT_CLASS,
    VIEWER_TOKEN_STRING_CLASS,
} from '@/ui/viewer/config';
import { highlightJson } from '@/ui/viewer/viewer_highlight';

/** 去掉 span 标签并把 HTML 实体还原成原文 */
function plainText(html: string): string {
    return html
        .replace(/<span class="[^"]*">/g, '')
        .replace(/<\/span>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

/** 某类 token 的全部文本 */
function tokenTexts(html: string, className: string): string[] {
    const pattern = new RegExp(`<span class="${className}">([^<]*)</span>`, 'g');
    return [...html.matchAll(pattern)].map((match) => match[1]);
}

describe('JSON 高亮', () => {
    it('去掉标签后逐字等于源码(含转义 / 空白 / 中文)', () => {
        const source = '{\n  "名称": "红 <黑> & 白",\n  "n": -12.5e3,\n  "ok": true,\n  "nil": null\n}';
        expect(plainText(highlightJson(source))).toBe(source);
    });

    it('key 与字符串分开着色:冒号前的字符串是 key', () => {
        const html = highlightJson('{"name":"value","array":["x"]}');
        expect(tokenTexts(html, VIEWER_TOKEN_KEY_CLASS)).toEqual(['"name"', '"array"']);
        expect(tokenTexts(html, VIEWER_TOKEN_STRING_CLASS)).toEqual(['"value"', '"x"']);
    });

    it('数字 / 字面量 / 标点各有自己的类名', () => {
        const html = highlightJson('{"a":-1.5,"b":true,"c":false,"d":null}');
        expect(tokenTexts(html, VIEWER_TOKEN_NUMBER_CLASS)).toEqual(['-1.5']);
        expect(tokenTexts(html, VIEWER_TOKEN_LITERAL_CLASS)).toEqual(['true', 'false', 'null']);
        expect(tokenTexts(html, VIEWER_TOKEN_PUNCT_CLASS)).toEqual(['{', ':', ',', ':', ',', ':', ',', ':', '}']);
    });

    it('HTML 特殊字符被转义,不会破坏高亮层结构', () => {
        const html = highlightJson('"<script>&"');
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('&amp;');
    });

    it('空串给空串;不闭合的字符串照常着色到末尾(语法错误归解析器)', () => {
        expect(highlightJson('')).toBe('');
        expect(plainText(highlightJson('"未闭合'))).toBe('"未闭合');
    });
});
