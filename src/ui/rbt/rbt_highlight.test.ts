/**
 * 表达式分词(ui/rbt/rbt_highlight.ts)的契约:纯函数,不碰编辑器外壳.
 *
 * 高亮层是把 `highlight(source)` 的产物用 `innerHTML` 写进页面的(见 miko_ui 的
 * editor/EditorHighlight),所以这一层要钉三件事:
 *
 * 1. **文本不变**:去掉标签后的文本必须逐字等于源码("源码行 == 视觉行"是行号与
 *    光标对齐的前提,高亮层多一个字少一个字都会整体错位,而且不报错);
 * 2. **必须转义**:源码是用户敲进来的,`<` / `&` 拼进 innerHTML 就是注入点;
 * 3. **类名对口**:值与 R / B / nil / 结构符号各自挂上 config 里的类名(样式在
 *    src/ui/rbt/rbt.css 按同一批类名命中,改名两边一起改).
 *
 * 文件头写 `@vitest-environment happy-dom`:round-trip 要用真 DOM 解析这段 HTML,
 * 自己写正则去标签等于把"浏览器怎么解析 HTML"猜一遍,那就不是在测转义了.
 */
import { describe, expect, it } from 'vitest';

import {
    RBT_TOKEN_BLACK_CLASS,
    RBT_TOKEN_NIL_CLASS,
    RBT_TOKEN_PUNCT_CLASS,
    RBT_TOKEN_RED_CLASS,
    RBT_TOKEN_VALUE_CLASS,
    RBT_TREE_EXAMPLE,
} from '@/ui/rbt/config';
import { highlightRbtExpression } from '@/ui/rbt/rbt_highlight';

/** 高亮 HTML 里每段的类名(按文档顺序) */
function tokenClasses(source: string): string[] {
    const box = document.createElement('div');
    box.innerHTML = highlightRbtExpression(source);
    return [...box.querySelectorAll('span')].map((span) => span.className);
}

/** 高亮 HTML 上去标签后显示的文本(必须逐字等于源码) */
function highlightedText(source: string): string {
    const box = document.createElement('div');
    box.innerHTML = highlightRbtExpression(source);
    return box.textContent ?? '';
}

describe('红黑树:表达式高亮', () => {
    it('空串给空串(编辑器初值就是空的,不塞空 span)', () => {
        expect(highlightRbtExpression('')).toBe('');
    });

    it('值 / R / B / 结构符号各自成段,HTML 逐字可对', () => {
        expect(highlightRbtExpression('10B(5R,15R)')).toBe(
            '<span class="rbt-token--value">10</span><span class="rbt-token--black">B</span>'
            + '<span class="rbt-token--punct">(</span>'
            + '<span class="rbt-token--value">5</span><span class="rbt-token--red">R</span>'
            + '<span class="rbt-token--punct">,</span>'
            + '<span class="rbt-token--value">15</span><span class="rbt-token--red">R</span>'
            + '<span class="rbt-token--punct">)</span>',
        );
    });

    it('简写叶子(不带括号)与完整写法的着色一致', () => {
        // 解析器把 `5R` 当成 `5R(nil,nil)`;高亮只按写法着色,两种输入都认
        expect(tokenClasses('5R')).toEqual([RBT_TOKEN_VALUE_CLASS, RBT_TOKEN_RED_CLASS]);
        expect(tokenClasses('5R(nil,nil)')).toEqual([
            RBT_TOKEN_VALUE_CLASS,
            RBT_TOKEN_RED_CLASS,
            RBT_TOKEN_PUNCT_CLASS,
            RBT_TOKEN_NIL_CLASS,
            RBT_TOKEN_PUNCT_CLASS,
            RBT_TOKEN_NIL_CLASS,
            RBT_TOKEN_PUNCT_CLASS,
        ]);
    });

    it('nil 的大小写三种写法都是空树色(与解析器同一条口径)', () => {
        for (const source of ['nil', 'Nil', 'NIL']) {
            expect(tokenClasses(source)).toEqual([RBT_TOKEN_NIL_CLASS]);
        }
        // 值是 nil 而颜色标记照写时,末位的 R / B 仍按颜色标记切出来
        expect(tokenClasses('nilR')).toEqual([RBT_TOKEN_VALUE_CLASS, RBT_TOKEN_RED_CLASS]);
    });

    it('颜色标记写错时整段按值着色(报错归解析器,高亮不判错)', () => {
        expect(tokenClasses('5X')).toEqual([RBT_TOKEN_VALUE_CLASS]);
        expect(tokenClasses('10B(5X,15R)')).toEqual([
            RBT_TOKEN_VALUE_CLASS,
            RBT_TOKEN_BLACK_CLASS,
            RBT_TOKEN_PUNCT_CLASS,
            RBT_TOKEN_VALUE_CLASS,
            RBT_TOKEN_PUNCT_CLASS,
            RBT_TOKEN_VALUE_CLASS,
            RBT_TOKEN_RED_CLASS,
            RBT_TOKEN_PUNCT_CLASS,
        ]);
    });

    it('去掉标签后逐字等于源码(空白 / 换行 / 多行表达式都原样保留)', () => {
        const sources = [
            '10B(5R,15R)',
            '  10B( 5R , 15R )  ',
            '10B(\n  5R,\n  15R\n)',
            'nil',
            '5B(1B 2B)',
            '10B(5R,15R)junk',
            '5B(1B,2B))',
            RBT_TREE_EXAMPLE,
        ];
        for (const source of sources) {
            expect(highlightedText(source)).toBe(source);
        }
    });

    it('源码里的 HTML 被转义(高亮层是 innerHTML 写进去的,不转义就是注入点)', () => {
        const source = '5B(<img src=x onerror=1>,1B)';
        const html = highlightRbtExpression(source);

        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
        // 转义之后仍然只是文本,round-trip 不变
        expect(highlightedText(source)).toBe(source);

        // 元素层面再确认一次:解析出来一个 <img> 都没有
        const box = document.createElement('div');
        box.innerHTML = html;
        expect(box.querySelectorAll('img')).toHaveLength(0);
    });

    it('示例表达式:每段都有词法类名,且文本一字不差', () => {
        const classes = new Set(tokenClasses(RBT_TREE_EXAMPLE));

        expect(classes).toEqual(new Set([
            RBT_TOKEN_VALUE_CLASS,
            RBT_TOKEN_RED_CLASS,
            RBT_TOKEN_BLACK_CLASS,
            RBT_TOKEN_PUNCT_CLASS,
        ]));
        expect(highlightedText(RBT_TREE_EXAMPLE)).toBe(RBT_TREE_EXAMPLE);
    });
});
