/*
核心层的**结构化结果** -> 界面上给人看的中文文案.

核心层只回答"过没过 / 错在哪个节点 / 两侧黑高各是多少",一个界面字都不写;本文件是
**唯一**知道"哪个错误码对应哪句文案、哪条性质用哪个模板"的一层.文案模板在
src/ui/rbt/config.ts,这里只做映射与占位符替换.
*/
import {
    RbtParseError,
    type RbtParseErrorCode,
} from '@/datastruct/rbt/rbt_parse';
import type {
    RbtNode,
    RbtPropertyId,
    RbtPropertyReport,
    RbtPropertyResult,
    RbtPropertyViolation,
} from '@/datastruct/rbt/rbt_tree';
import {
    RBT_BLACK_HEIGHT_DETAIL,
    RBT_BST_ORDER_DETAIL,
    RBT_ERR_COLOR_MARK,
    RBT_ERR_NO_COMMA,
    RBT_ERR_NODE_FORMAT,
    RBT_ERR_PARSE_FAILED,
    RBT_ERR_SHORTHAND_NO_COLOR,
    RBT_ERR_SHORTHAND_TOO_SHORT,
    RBT_ERR_SHORTHAND_TOO_SHORT_SUFFIX,
    RBT_ERR_TRAILING,
    RBT_ERR_UNBALANCED,
    RBT_PROPERTY_SUMMARY,
    RBT_RED_CHILD_DETAIL,
    RBT_ROOT_RED_DETAIL,
} from '@/ui/rbt/config';

/** 节点在提示里的写法:值 + 颜色(如 `11R`);只在本文件拼句子时用 */
function describeNode(node: RbtNode): string {
    return `${node.value}${node.color}`;
}

// 解析失败:错误码 -> 一句话

/**
 * 错误码 -> 文案.每个模板自己决定把出错片段放在哪(引号里 / 冒号后面),所以这里
 * 存的是"片段 -> 句子"的函数,而不是一条字符串模板;新增错误码时这里缺键会编译报错.
 */
const RBT_PARSE_ERROR_TEXTS: Readonly<Record<RbtParseErrorCode, (fragment: string) => string>> = {
    'shorthand-too-short': (fragment) =>
        `${RBT_ERR_SHORTHAND_TOO_SHORT}${fragment}${RBT_ERR_SHORTHAND_TOO_SHORT_SUFFIX}`,
    // 前缀自带开引号,这里补上收引号
    'shorthand-no-color': (fragment) => `${RBT_ERR_SHORTHAND_NO_COLOR}${fragment}"`,
    'node-format': (fragment) => `${RBT_ERR_NODE_FORMAT}${fragment}`,
    'color-mark': (fragment) => `${RBT_ERR_COLOR_MARK}${fragment}`,
    'unbalanced': (fragment) => `${RBT_ERR_UNBALANCED}${fragment}`,
    'trailing': (fragment) => `${RBT_ERR_TRAILING}${fragment}`,
    'no-comma': (fragment) => `${RBT_ERR_NO_COMMA}${fragment}`,
};

/**
 * 解析失败 -> 输出区里那一行错误(不带 `错误: ` 前缀,那个前缀归挂载函数加).
 *
 * 认不出的异常(不该发生,但万一)退回它自己的 message:这是意外状况,把原始
 * 信息露出来比吞掉有用;预期内的解析失败走错误码那条路,永远显示固定文案.
 */
export function formatParseError(error: unknown): string {
    if (error instanceof RbtParseError) {
        return `${RBT_ERR_PARSE_FAILED}${RBT_PARSE_ERROR_TEXTS[error.code](error.fragment)}`;
    }
    const message = error instanceof Error ? error.message : String(error);
    return `${RBT_ERR_PARSE_FAILED}${message}`;
}

// 性质违规:结论 -> 一句"错在哪"

/** 性质 id -> 违规说明(占位符由这里填) */
const RBT_PROPERTY_DETAIL_TEXTS: Readonly<Record<
    RbtPropertyId,
    (violation: RbtPropertyViolation) => string
>> = {
    'root-black': (violation) => RBT_ROOT_RED_DETAIL.replace('{node}', describeNode(violation.node)),
    'red-no-red-child': (violation) => RBT_RED_CHILD_DETAIL.replace('{node}', describeNode(violation.node)),
    'black-height': (violation) => {
        const height = violation.blackHeight;
        if (height === null) return '';
        return RBT_BLACK_HEIGHT_DETAIL
            .replace('{node}', describeNode(violation.node))
            .replace('{expected}', String(height.expected))
            .replace('{actual}', String(height.actual));
    },
    'bst-order': (violation) => RBT_BST_ORDER_DETAIL.replace('{node}', describeNode(violation.node)),
};

/**
 * 一条结论 -> 出错位置的说明;PASS 时是空串(输出区那时不显示这一段).
 *
 * 调用方不必先判 pass:空串与"没有说明"在界面上是同一件事(不 append).
 */
export function formatPropertyDetail(result: RbtPropertyResult): string {
    if (result.pass || result.violation === null) return '';
    return RBT_PROPERTY_DETAIL_TEXTS[result.id](result.violation);
}

/** 清单抬头文案(把 RBT_PROPERTY_SUMMARY 里的两个占位符换成数字) */
export function formatPropertySummary(report: RbtPropertyReport): string {
    return RBT_PROPERTY_SUMMARY
        .replace('{total}', String(report.total))
        .replace('{failed}', String(report.failedCount));
}
