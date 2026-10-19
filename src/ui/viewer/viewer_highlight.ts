/*
 * JSON -> 高亮 HTML(注入给 miko_ui 的 CodeEditor).库的高亮层只把
 * `highlight(source)` 的产物显示在透明 textarea 背后,不认识任何词法,分词与配色
 * 都在这一侧.
 *
 * 词法口径只服务**显示**,不做校验:
 * - 字符串按 `"` 开合,支持 `\"` 转义;后面跟 `:` 的字符串当 key 着色,其余当字符串;
 * - 数字 / true / false / null / 标点(括号 / 逗号 / 冒号)各一类;
 * - 认不出的字符原样输出(语法错误归解析器,高亮器不抢着报错).
 *
 * 必须守住:去掉标签、还原实体后逐字等于源码(否则行号 / 光标错位);源码是用户
 * 输入,拼接前必须转义(高亮层用 innerHTML 写入).
 */

import {
    VIEWER_TOKEN_KEY_CLASS,
    VIEWER_TOKEN_LITERAL_CLASS,
    VIEWER_TOKEN_NUMBER_CLASS,
    VIEWER_TOKEN_PUNCT_CLASS,
    VIEWER_TOKEN_STRING_CLASS,
} from '@/ui/viewer/config';

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

/** 一段带词法类名的文本(类名只来自 config 的常量) */
function tokenSpan(className: string, text: string): string {
    return `<span class="${className}">${escapeHtml(text)}</span>`;
}

/** 从 `start`(一个 `"`)开始扫到配对的收引号之后;不闭合就扫到末尾 */
function scanString(source: string, start: number): number {
    let index = start + 1;
    let escaped = false;
    while (index < source.length) {
        const ch = source[index];
        if (escaped) {
            escaped = false;
        } else if (ch === '\\') {
            escaped = true;
        } else if (ch === '"') {
            return index + 1;
        }
        index += 1;
    }
    return source.length;
}

/** 从 `start` 开始扫一段连续数字(允许前导 `-`、小数点、指数) */
function scanNumber(source: string, start: number): number {
    let index = start;
    if (source[index] === '-') index += 1;
    while (index < source.length && source[index] >= '0' && source[index] <= '9') index += 1;
    if (source[index] === '.') {
        index += 1;
        while (index < source.length && source[index] >= '0' && source[index] <= '9') index += 1;
    }
    if (source[index] === 'e' || source[index] === 'E') {
        index += 1;
        if (source[index] === '+' || source[index] === '-') index += 1;
        while (index < source.length && source[index] >= '0' && source[index] <= '9') index += 1;
    }
    return index;
}

const PUNCTUATION = '{}[],:';

/**
 * 把一段 JSON 文本变成高亮 HTML(注入给 `createCodeEditor` 的 `highlight`).
 *
 * 空串给空串:编辑器初值是空的时候高亮层就是空的,不塞一个空 span.
 */
export function highlightJson(source: string): string {
    let html = '';
    let index = 0;

    while (index < source.length) {
        const ch = source[index];

        if (ch === '"') {
            const end = scanString(source, index);
            const text = source.slice(index, end);
            // 看这个字符串后面(跳过空白)是不是冒号:是则是 JSON 的 key
            let next = end;
            while (next < source.length && /\s/.test(source[next])) next += 1;
            const isKey = source[next] === ':';
            html += tokenSpan(isKey ? VIEWER_TOKEN_KEY_CLASS : VIEWER_TOKEN_STRING_CLASS, text);
            index = end;
            continue;
        }

        if (ch === '-' || (ch >= '0' && ch <= '9')) {
            const end = scanNumber(source, index);
            // 只吃到一个 `-` 不算数字:交回普通文本,别把语法错误画出颜色
            if (end > index && !(end === index + 1 && ch === '-')) {
                html += tokenSpan(VIEWER_TOKEN_NUMBER_CLASS, source.slice(index, end));
                index = end;
                continue;
            }
        }

        if (ch === 't' || ch === 'f' || ch === 'n') {
            const literal = ch === 't' ? 'true' : ch === 'f' ? 'false' : 'null';
            if (source.startsWith(literal, index)) {
                html += tokenSpan(VIEWER_TOKEN_LITERAL_CLASS, literal);
                index += literal.length;
                continue;
            }
        }

        if (PUNCTUATION.includes(ch)) {
            html += tokenSpan(VIEWER_TOKEN_PUNCT_CLASS, ch);
            index += 1;
            continue;
        }

        html += escapeHtml(ch);
        index += 1;
    }

    return html;
}
