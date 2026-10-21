/*
 * 最小堆检查:登记为 `checkHeapOrder`,由「检查配置」窗口按 id 选取后运行.
 *
 * 判据只有一条:每条有向指针 `from -> to` 上,父节点的 key 必须不大于孩子.不要求
 * 唯一根 / 二叉形状 / 无环:这条检查只回答"堆序有没有坏",结构性问题由别的检查
 * (或布局)暴露;堆序是局部性质,坏掉时扫指针就能指到具体那一对.
 *
 * 值从 `key` 读:堆的 key 就是参与比较的数值,必须是 number.遇到字符串 key 直接
 * FAIL:没有数值就无从判定堆序,静默跳过会得到一条空真的 PASS.
 */

import type { SceneCheckDefinition, SceneCheckFunction, SceneCheckResult } from '@/scene/scene_check';
import type { SceneDocumentNode, SceneNodeKey } from '@/scene/scene_document';

function pass(name: string): SceneCheckResult {
    return { name, passed: true, detail: '', details: [], node: null };
}

function fail(
    name: string,
    detail: string,
    node: SceneNodeKey | null,
    details: readonly string[] = [],
): SceneCheckResult {
    return { name, passed: false, detail, details, node };
}

/** 堆序的数值口径:key 必须是 number;字符串 key 返回 null(调用方 FAIL) */
function numericKeyOf(node: SceneDocumentNode): number | null {
    return typeof node.key === 'number' ? node.key : null;
}

/** 节点在文案里的称呼:显示文字就是 key 本身 */
function keyText(key: SceneNodeKey): string {
    return String(key);
}

/** 最小堆:任意父节点都不大于它的孩子 */
const checkHeapOrder: SceneCheckFunction = (document) => {
    const name = '最小堆序成立';
    if (document.nodes.length === 0) return pass(name);

    const nodeByKey = new Map<SceneNodeKey, SceneDocumentNode>(document.nodes.map((node) => [node.key, node] as const));
    for (const pointer of document.pointers) {
        const parent = nodeByKey.get(pointer.from);
        const child = nodeByKey.get(pointer.to);
        if (parent === undefined || child === undefined) continue;

        const parentValue = numericKeyOf(parent);
        if (parentValue === null) {
            return fail(name, `节点 ${keyText(parent.key)} 的 key 不是数字,无法比较堆序`, parent.key);
        }
        const childValue = numericKeyOf(child);
        if (childValue === null) {
            return fail(name, `节点 ${keyText(child.key)} 的 key 不是数字,无法比较堆序`, child.key);
        }
        if (childValue < parentValue) {
            return fail(
                name,
                `节点 ${keyText(parent.key)} 大于孩子 ${keyText(child.key)},不满足最小堆序`,
                parent.key,
                [
                    `父「${keyText(parent.key)}」 -> 孩子「${keyText(child.key)}」`,
                    '最小堆要求每个父节点都不大于它的孩子',
                ],
            );
        }
    }
    return pass(name);
};

/** `heap` 结构注册的全部检查;`id` 是函数名,检查配置窗口按它选取 */
export const HEAP_CHECKS: readonly SceneCheckDefinition[] = [
    { id: 'checkHeapOrder', run: checkHeapOrder },
];
