/*
 * 节点 label 的数值比较口径(检查器共用).
 *
 * 中性场景只有 label 一个展示槽,没有"值"字段:有序性 / 堆序这类检查只能把 label
 * 当数值读.这里给出唯一的读法,避免 rbt / heap / list 各写一份正则后口径漂移.
 *
 * 只认十进制写法(`[+-]?digits[.digits]`):不用 `Number()`,它会把 `''` 当 0、
 * `0x10` 当 16、`Infinity` 当合法数;这些"看着是数字其实不是"的写法会让检查结论
 * 对不上号.认不出来返回 null,由各检查自己决定"跳过还是 FAIL".
 */

/** 比较容差:只兜浮点写法的误差;相等值仍按违规处理(区间是开区间) */
export const LABEL_COMPARE_TOLERANCE = 1e-9;

/** label -> 数值;不是十进制数返回 null */
export function toComparableLabel(label: string): number | null {
    return /^[+-]?\d+(\.\d+)?$/.test(label) ? Number(label) : null;
}
