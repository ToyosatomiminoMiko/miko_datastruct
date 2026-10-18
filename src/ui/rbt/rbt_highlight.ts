/*
表达式 -> 高亮 HTML(注入给 miko_ui 的 CodeEditor).库的高亮层只把 `highlight(source)`
的产物显示在透明 textarea 背后,不认识任何词法,分词与配色都在这一侧.

词法口径与解析器(datastruct/rbt/rbt_parse.ts)一致:按 `(` / `)` / `,` 切成节点词,
末位 R / B 是颜色标记,整段(不分大小写)是 `nil` 即空树.

必须守住:去掉标签后逐字等于源码(否则行号 / 光标错位);源码是用户输入,拼接前必须
转义(高亮层用 innerHTML 写入);颜色标记写错归解析器,这里只按"值"着色.
*/

import {
    RBT_COLOR_BLACK,
    RBT_COLOR_RED,
    RBT_COMMA,
    RBT_LEFT_PAREN,
    RBT_MIN_SHORTHAND_LENGTH,
    RBT_NIL,
    RBT_RIGHT_PAREN,
} from '@/datastruct/rbt/rbt_parse';
import {
    RBT_TOKEN_BLACK_CLASS,
    RBT_TOKEN_NIL_CLASS,
    RBT_TOKEN_PUNCT_CLASS,
    RBT_TOKEN_RED_CLASS,
    RBT_TOKEN_VALUE_CLASS,
} from '@/ui/rbt/config';

/** 切分节点词的三个字符(与解析器的切分口径一致) */
const RBT_DELIMITERS: readonly string[] = [RBT_LEFT_PAREN, RBT_RIGHT_PAREN, RBT_COMMA];

function isDelimiter(ch: string): boolean {
    return RBT_DELIMITERS.includes(ch);
}

/**
 * HTML 文本节点里必须转义的三个字符.
 *
 * 引号不在其中:拼出来的一律是元素内容(`<span>文本</span>`),没有属性值上下文,
 * 转义引号只会让源码里的引号在高亮层显示成 `&quot;`(与 textarea 对不上).
 */
const HTML_ESCAPES: Readonly<Record<string, string>> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
};

function escapeHtml(text: string): string {
    return text.replace(/[&<>]/g, (ch) => HTML_ESCAPES[ch]);
}

/** 一段带词法类名的文本(类名只来自 config 的常量,不在这里现写) */
function tokenSpan(className: string, text: string): string {
    return `<span class="${className}">${escapeHtml(text)}</span>`;
}

/**
 * 一段"节点词"的着色.
 *
 * 首尾空白原样交回(不进 span):它们是排版的一部分,着色不该把它们吞掉或换个宽度.
 */
function highlightWord(word: string): string {
    const bodyStart = word.length - word.trimStart().length;
    const bodyEnd = word.trimEnd().length;
    const body = word.slice(bodyStart, bodyEnd);

    // 整段都是空白:没有词法可判,原样交回
    if (body === '') return escapeHtml(word);

    const leading = escapeHtml(word.slice(0, bodyStart));
    const trailing = escapeHtml(word.slice(bodyEnd));

    // nil(空树写法):解析器收 nil / Nil / NIL 三种写法,着色跟着一起不敏感
    if (body.toLowerCase() === RBT_NIL) {
        return `${leading}${tokenSpan(RBT_TOKEN_NIL_CLASS, body)}${trailing}`;
    }

    // 末位是 R / B 且整段够长 => 值 + 颜色标记(与解析器的"简写叶子"同一条判据)
    const lastChar = body[body.length - 1];
    if (body.length >= RBT_MIN_SHORTHAND_LENGTH && (lastChar === RBT_COLOR_RED || lastChar === RBT_COLOR_BLACK)) {
        const colorClass = lastChar === RBT_COLOR_RED ? RBT_TOKEN_RED_CLASS : RBT_TOKEN_BLACK_CLASS;
        return `${leading}${tokenSpan(RBT_TOKEN_VALUE_CLASS, body.slice(0, -1))}${tokenSpan(colorClass, lastChar)}${trailing}`;
    }

    // 颜色标记没写对:整段按值着色,不在这里报错(理由见文件头)
    return `${leading}${tokenSpan(RBT_TOKEN_VALUE_CLASS, body)}${trailing}`;
}

/**
 * 把一段表达式变成高亮 HTML(注入给 `createCodeEditor` 的 `highlight`).
 *
 * 空串给空串:编辑器初值是空的时候高亮层就是空的,不塞一个空 span.
 */
export function highlightRbtExpression(source: string): string {
    let html = '';
    let index = 0;

    while (index < source.length) {
        const ch = source[index];
        if (isDelimiter(ch)) {
            html += tokenSpan(RBT_TOKEN_PUNCT_CLASS, ch);
            index += 1;
            continue;
        }
        let end = index;
        while (end < source.length && !isDelimiter(source[end])) end += 1;
        html += highlightWord(source.slice(index, end));
        index = end;
    }

    return html;
}
