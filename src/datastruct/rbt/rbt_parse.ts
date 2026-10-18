/*
红黑树**表达式写法**的解析:一段字符串 -> `RbtNode | null`.

这是"输入格式"的逻辑,不是树的逻辑 -- 树本身的形状与性质检查在 datastruct/rbt/rbt_tree.ts.
单独一份的原因:

- 纯函数(字符串进,节点出),能在进程内直接单测;
- 用户在编辑器里敲的是它认的语法,词法高亮(ui/rbt/rbt_highlight.ts)按**同一批**语法
  字符分词 -- 语法只有这一处定义,高亮不另写一套;
- 解析失败只交回**结构化原因**(错误码 + 出错片段),中文文案由显示层的
  src/ui/rbt/rbt_format.ts 拼:这里一个给人看的句子都不写,换文案不必碰解析器.

语法口径(与提示区的说明一致):

- 节点 = 值 + 颜色标记(R / B),例如 `13B`;
- 子树 = `节点(左子树,右子树)`,左右两个都必须写;
- `nil`(`nil` / `Nil` / `NIL` 三种写法)表示空树或空子树,不建节点;
- 简写叶子:不带括号的 `5R` 等价于 `5R(nil,nil)`;
- 整串必须**恰好**是一个表达式:括号配平之后还多出字符也算错
  (`5B(1B,2B)junk` 不静默丢弃多余输入).
*/
import type { RbtColor, RbtNode } from './rbt_tree';

// ============================================================
// 语法字符(高亮层也引这几个:解析器认什么,高亮就按什么分词)
// ============================================================

/** 表示空节点的字符串(小写;解析时另外认 Nil / NIL) */
export const RBT_NIL = 'nil';

/** R/B 颜色标记字符(红) */
export const RBT_COLOR_RED = 'R';

/** R/B 颜色标记字符(黑) */
export const RBT_COLOR_BLACK = 'B';

/** 节点表达式里的左括号 */
export const RBT_LEFT_PAREN = '(';

/** 节点表达式里的右括号 */
export const RBT_RIGHT_PAREN = ')';

/** 左右子树的分隔逗号 */
export const RBT_COMMA = ',';

/** 节点简写的最小长度(至少 1 位值 + 1 位颜色) */
export const RBT_MIN_SHORTHAND_LENGTH = 2;

/** 简写叶子自动补全的后缀:值+颜色(nil,nil) */
const RBT_LEAF_SUFFIX = '(nil,nil)';

// ============================================================
// 解析失败:结构化原因,不带文案
// ============================================================

/**
 * 解析失败的原因码(显示层按它取对应的中文文案模板).
 *
 * 每个码配一个"出错片段":片段是输入里的那一段原文,显示层负责把它嵌进句子里
 * (有的模板把片段放在引号中间,有的放在冒号后面 -- 那是文案的事,解析器不管).
 */
export type RbtParseErrorCode =
    /** 简写节点太短(连"1 位值 + 1 位颜色"都不够) */
    | 'shorthand-too-short'
    /** 简写节点不以 R / B 结尾 */
    | 'shorthand-no-color'
    /** 括号表达式里"值+颜色"那一段格式不对(至少要有值 + 颜色) */
    | 'node-format'
    /** 颜色标记不是 R / B */
    | 'color-mark'
    /** 括号不配平 */
    | 'unbalanced'
    /** 括号配平之后还有多余内容 */
    | 'trailing'
    /** 子树里缺少左右分隔的逗号 */
    | 'no-comma';

/**
 * 解析失败(带错误码与出错片段).
 *
 * 继承 Error 而不是抛一个普通对象:调用方要 `instanceof` 区分"用户输入错了"与
 * "程序真出了别的错"(见 ui/rbt/rbt_format.ts 的 formatParseError),而且 Error 自带
 * 栈信息.`message` 只给调试 / 测试看,**不是**界面上显示的那句话:界面上那句话
 * 由显示层拼,所以这里可以保持与文案无关的写法(错误码 + 片段).
 */
export class RbtParseError extends Error {
    /** 失败原因码 */
    readonly code: RbtParseErrorCode;
    /** 输入里出错的那一段原文(由显示层的文案模板决定放在句子的哪里) */
    readonly fragment: string;

    constructor(code: RbtParseErrorCode, fragment: string) {
        super(`RbtParseError(${code}): ${fragment}`);
        this.name = 'RbtParseError';
        this.code = code;
        this.fragment = fragment;
    }
}

/** 抛一条解析失败(统一构造点,免得每个分支各写一次 new) */
function fail(code: RbtParseErrorCode, fragment: string): never {
    throw new RbtParseError(code, fragment);
}

// ============================================================
// 解析
// ============================================================

/**
 * 递归下降:一个节点表达式 -> 节点.
 *
 * 空串 / nil 给 null(不建节点,对应的就是黑叶子);不带括号的简写先补成
 * `值颜色(nil,nil)` 再走同一条路 -- 简写与完整写法因此只有一套解析逻辑.
 */
function parseNode(str: string): RbtNode | null {
    const s = str.trim();
    // nil / 空 直接返回 null(不建节点,对应的就是黑叶子)
    if (s === '' || s === RBT_NIL || s === 'Nil' || s === 'NIL') {
        return null;
    }

    // 简写叶子节点:不带括号 => 自动包装成 值颜色(nil,nil)
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

    // 标准带括号解析
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

    // 匹配括号内左右子树
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
    // 括号配平还不够:整串必须**只有**这一个表达式.不比对长度的话,
    // `5B(1B,2B)junk` / `5B(1B,2B))` 都会被当成合法的 5B 树 -- 多余的输入
    // 落在配对右括号之后,会被静默丢掉(不报错,但用户写的东西没被检查).
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
 * 把表达式解析成一棵树;空表达式给 `null`(空树).
 *
 * 失败一律抛 `RbtParseError`(带错误码与出错片段):调用方(挂载函数)把它交给
 * ui/rbt/rbt_format.ts 的 `formatParseError` 变成输出区里的一行错误 -- 画布只画树,
 * 不写任何文案.
 *
 * 不在这里包一层 `console.error`:解析失败是**预期内的用户输入错误**,不是异常
 * 状况 -- 每敲错一个字符就往控制台打一条红字,正常使用会被刷屏;跑测试时更糟:
 * 故意喂错表达式的用例会往 stderr 打字,看日志的人会以为测试挂了.
 */
export function buildTreeFromExpression(expr: string): RbtNode | null {
    if (!expr || expr.trim() === '') {
        return null;
    }
    return parseNode(expr);
}
