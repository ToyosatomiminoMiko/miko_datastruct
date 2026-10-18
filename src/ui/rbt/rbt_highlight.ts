/*
表达式 -> 高亮 HTML(注入给 miko_ui 的 CodeEditor).

库的高亮层是**叠层**:真 textarea 负责光标 / 选区 / 撤销 / IME,它上面那一层只把
`highlight(source)` 交回的 HTML 显示在透明文字背后(见 miko_ui 的
editor/EditorHighlight 文件头).库因此不认识"红黑树表达式"这门语言,也不知道
任何词法类名 -- 分词与配色都是消费者的事,这一个文件就是那份分词.

词法口径与解析器一致(见 src/datastruct/rbt/rbt_parse.ts):表达式被 `(` / `)` / `,` 切成
一段段"节点词",每段去掉首尾空白后,末位字符若是 R / B 就是颜色标记,前面是节点值;
整段(不分大小写)是 `nil` 就是空树写法.所以高亮不引入第二套语法:解析器认什么,
这里就按什么着色 -- 语法字符本身也直接引解析器那一份,不在这里另抄一遍.

三件必须守住的事:
1. **不改动源码文本**:交回的 HTML 去掉标签必须逐字等于输入(行号 / 光标 / 选区
   全按 textarea 的文本对齐,高亮层多一个字少一个字就会整体错位);
2. **必须转义**:源码是用户敲进来的,`<` / `&` 直接拼进 innerHTML 会把编辑区变成
   HTML 注入点(高亮层是 `innerHTML` 写进去的,见 EditorHighlight.update);
3. **只着色不判错**:颜色标记写错(`5X`)归解析器报错,这里按"值"着色就好 --
   两处各判一套错的话,高亮与输出区会互相打脸.

返回的是 HTML 字符串而不是元素:库的口径就是"消费者给一个 source -> html 的纯函数",
纯函数也才能在进程内直接单测(见 rbt_highlight.test.ts).
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

/** 切分节点词的三个字符(与解析器的切分口径一致,见文件头) */
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

    // 颜色标记没写对:整段按值着色,不在这里报错(理由见文件头第 3 条)
    return `${leading}${tokenSpan(RBT_TOKEN_VALUE_CLASS, body)}${trailing}`;
}

/**
 * 把一段表达式变成高亮 HTML(注入给 `createCodeEditor` 的 `highlight`).
 *
 * 空串给空串:编辑器初值是空的时候高亮层就是空的(不塞一个空 span,行高由
 * textarea 与高亮层各自的 CSS 保证).
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
        // 一段节点词 = 直到下一个分隔符为止(分隔符自己由上面那条分支吃掉)
        let end = index;
        while (end < source.length && !isDelimiter(source[end])) end += 1;
        html += highlightWord(source.slice(index, end));
        index = end;
    }

    return html;
}
