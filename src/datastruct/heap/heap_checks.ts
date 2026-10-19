/*
 * 最小堆检查:登记为 `checkHeapOrder`,由「检查配置」窗口按 id 选取后运行.
 *
 * 判据只有一条:每条有向指针 `from -> to` 上,父节点的值必须不大于孩子.不要求
 * 唯一根 / 二叉形状 / 无环:这条检查只回答"堆序有没有坏",结构性问题由别的检查
 * (或布局)暴露;堆序是局部性质,坏掉时扫指针就能指到具体那一对.
 *
 * 值从 label 读(中性文档没有单独的 value 字段),只认十进制数.遇到非数字 label
 * 直接 FAIL:没有数值就无从判定堆序,静默跳过会得到一条空真的 PASS.
 */

import type { SceneCheckDefinition, SceneCheckFunction, SceneCheckResult } from '@/datastruct/scene/scene_check';
import { LABEL_COMPARE_TOLERANCE, toComparableLabel } from '@/datastruct/scene/label_value';

function pass(name: string): SceneCheckResult {
    return { name, passed: true, detail: '', details: [], node: null };
}

function fail(name: string, detail: string, node: number | null, details: readonly string[] = []): SceneCheckResult {
    return { name, passed: false, detail, details, node };
}

/** 最小堆:任意父节点都不大于它的孩子 */
const checkHeapOrder: SceneCheckFunction = (document) => {
    const name = '最小堆序成立';
    if (document.nodes.length === 0) return pass(name);

    const nodeByKey = new Map(document.nodes.map((node) => [node.key, node] as const));
    for (const pointer of document.pointers) {
        const parent = nodeByKey.get(pointer.from);
        const child = nodeByKey.get(pointer.to);
        if (parent === undefined || child === undefined) continue;

        const parentValue = toComparableLabel(parent.label);
        if (parentValue === null) {
            return fail(name, `节点 ${parent.label} 的 label 不是数字,无法比较堆序`, parent.key);
        }
        const childValue = toComparableLabel(child.label);
        if (childValue === null) {
            return fail(name, `节点 ${child.label} 的 label 不是数字,无法比较堆序`, child.key);
        }
        if (childValue < parentValue - LABEL_COMPARE_TOLERANCE) {
            return fail(
                name,
                `节点 ${parent.label} 大于孩子 ${child.label},不满足最小堆序`,
                parent.key,
                [`父「${parent.label}」 -> 孩子「${child.label}」`, '最小堆要求每个父节点都不大于它的孩子'],
            );
        }
    }
    return pass(name);
};

/** `heap` 结构注册的全部检查;`id` 是函数名,检查配置窗口按它选取 */
export const HEAP_CHECKS: readonly SceneCheckDefinition[] = [
    { id: 'checkHeapOrder', run: checkHeapOrder },
];
