/*
 * 红黑树表达式的解析:字符串 -> `RbtNode | null`.
 *
 * 只管输入格式:树的形状与性质检查在 datastruct/rbt/rbt_tree.ts;这里只抛错误码 + 出错
 * 片段,给人看的句子由调用方拼.
 */
import type { RbtColor, RbtNode } from './rbt_tree';

// 语法字符(高亮层按同一批字符分词,两边口径必须一致)
export const RBT_NIL = 'nil';
export const RBT_COLOR_RED = 'R';
export const RBT_COLOR_BLACK = 'B';
export const RBT_LEFT_PAREN = '(';
export const RBT_RIGHT_PAREN = ')';
export const RBT_COMMA = ',';

/** 简写节点的最小长度:至少 1 位值 + 1 位颜色 */
export const RBT_MIN_SHORTHAND_LENGTH = 2;

/** 简写叶子补成完整写法时追加的后缀 */
const RBT_LEAF_SUFFIX = '(nil,nil)';

/**
 * 解析失败的原因码(每个码对应一种语法错误,显示层按码取中文文案模板).
 *
 * 每个码附带一段出错片段:片段是输入里的原文,显示层负责把它嵌进句子里.
 */
export type RbtParseErrorCode =
    | 'shorthand-too-short'
    | 'shorthand-no-color'
    | 'node-format'
    | 'color-mark'
    | 'unbalanced'
    | 'trailing'
    | 'no-comma';

/**
 * 解析失败(错误码 + 出错片段).继承 Error:调用方要 `instanceof` 区分"用户输入错了"与
 * 程序其它错误,且 Error 自带栈.`message` 只给调试 / 测试看,不是界面上显示的那句话.
 */
export class RbtParseError extends Error {
    /** 失败原因码 */
    readonly code: RbtParseErrorCode;
    /** 输入里出错的那一段原文(放在句子的哪个位置由显示层的文案模板决定) */
    readonly fragment: string;

    constructor(code: RbtParseErrorCode, fragment: string) {
        super(`RbtParseError(${code}): ${fragment}`);
        this.name = 'RbtParseError';
        this.code = code;
        this.fragment = fragment;
    }
}

/** 抛出解析失败(统一构造点,免得每个分支各写一次 new) */
function fail(code: RbtParseErrorCode, fragment: string): never {
    throw new RbtParseError(code, fragment);
}

/**
 * 递归下降:一个节点表达式 -> 节点.
 *
 * 语法:节点 = 值 + R/B;子树写全 `节点(左子树,右子树)`.不带括号的简写先补成
 * `值颜色(nil,nil)` 再走同一条路,所以简写与完整写法只有一套解析逻辑.
 */
function parseNode(str: string): RbtNode | null {
    const s = str.trim();
    if (s === '' || s === RBT_NIL || s === 'Nil' || s === 'NIL') {
        return null;
    }

    if (!s.includes(RBT_LEFT_PAREN)) {
        if (s.length < RBT_MIN_SHORTHAND_LENGTH) {
            fail('shorthand-too-short', s);
        }
        const lastChar = s[s.length - 1];
        if (lastChar !== RBT_COLOR_RED && lastChar !== RBT_COLOR_BLACK) {
            fail('shorthand-no-color', s);
        }
        const fullExpr = `${s}${RBT_LEAF_SUFFIX}`;
        return parseNode(fullExpr);
    }

    const leftParenIdx = s.indexOf(RBT_LEFT_PAREN);
    const valueColorPart = s.substring(0, leftParenIdx);
    if (valueColorPart.length < RBT_MIN_SHORTHAND_LENGTH) {
        fail('node-format', valueColorPart);
    }
    const colorChar = valueColorPart[valueColorPart.length - 1];
    if (colorChar !== RBT_COLOR_RED && colorChar !== RBT_COLOR_BLACK) {
        fail('color-mark', valueColorPart);
    }
    const valueStr = valueColorPart.substring(0, valueColorPart.length - 1);

    // 找与左括号配对的右括号
    let balance = 1;
    let rightParenIdx = leftParenIdx + 1;
    while (rightParenIdx < s.length && balance > 0) {
        if (s[rightParenIdx] === RBT_LEFT_PAREN) balance++;
        else if (s[rightParenIdx] === RBT_RIGHT_PAREN) balance--;
        rightParenIdx++;
    }
    if (balance !== 0) {
        fail('unbalanced', s);
    }
    // 括号配平不代表整串就是这一个表达式:`5B(1B,2B)junk` 的多余部分落在配对右括号
    // 之后,不比对长度就会被静默丢掉(不报错,但用户写的东西没被检查).
    if (rightParenIdx !== s.length) {
        fail('trailing', s.substring(rightParenIdx));
    }
    const inside = s.substring(leftParenIdx + 1, rightParenIdx - 1);
    let commaIdx = -1;
    let depth = 0;
    for (let i = 0; i < inside.length; i++) {
        const ch = inside[i];
        if (ch === RBT_LEFT_PAREN) depth++;
        else if (ch === RBT_RIGHT_PAREN) depth--;
        else if (ch === RBT_COMMA && depth === 0) {
            commaIdx = i;
            break;
        }
    }
    if (commaIdx === -1) {
        fail('no-comma', inside);
    }
    const leftStr = inside.substring(0, commaIdx);
    const rightStr = inside.substring(commaIdx + 1);

    const leftChild = parseNode(leftStr);
    const rightChild = parseNode(rightStr);
    const color: RbtColor = colorChar === RBT_COLOR_RED ? 'R' : 'B';
    return { value: valueStr, color, left: leftChild, right: rightChild };
}

/**
 * 把表达式解析成一棵树;空表达式给 `null`(空树).失败一律抛 `RbtParseError`,由调用方
 * 把错误码 + 出错片段拼成一句人话.
 *
 * 这里不包 `console.error`:解析失败是预期内的用户输入错误,不该往控制台和测试的 stderr 刷屏.
 */
export function buildTreeFromExpression(expr: string): RbtNode | null {
    if (!expr || expr.trim() === '') {
        return null;
    }
    return parseNode(expr);
}
