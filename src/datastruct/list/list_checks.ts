/*
 * 单链表检查:登记为 `checkLinkedList` / `checkListSorted`,由「检查配置」窗口按 id
 * 选取后运行.
 *
 * 单链表在中性文档里的形状:只有 `pointers`(父 -> 子方向的指针),没有 `edges`;
 * 恰好一个没有父节点的表头,每个节点最多一个孩子、最多一个父亲,从表头能走到全部
 * 节点(无环、无分叉、无合流、无孤立尾巴).
 *
 * 两条检查共用同一份"先把链读出来"的逻辑:结构不合法时排序无从谈起,`checkListSorted`
 * 直接复用结构检查的违规原因,而不是在两个函数里各写一遍遍历.
 */

import type {
    SceneCheckDefinition,
    SceneCheckFunction,
    SceneCheckResult,
} from '@/datastruct/scene/scene_check';
import type { SceneDocument, SceneDocumentNode } from '@/datastruct/scene/scene_document';
import { LABEL_COMPARE_TOLERANCE, toComparableLabel } from '@/datastruct/scene/label_value';

/** 链表结构违规的原因(定位用;文案由下面统一拼) */
type ListViolationKind = 'edge' | 'no-head' | 'multi-head' | 'branch' | 'merge' | 'cycle' | 'disconnected';

interface ListViolation {
    readonly kind: ListViolationKind;
    /** 违规指向的节点 key;没有具体节点(例如"用了无向边")为 null */
    readonly node: number | null;
    readonly detail: string;
}

/** 读链的结果:要么是从表头开始的节点顺序,要么是一条违规 */
type ListShape = { readonly order: readonly number[] } | ListViolation;

/** 从表头沿唯一的孩子往下走,读出一条单链;任何结构问题都收成一条违规 */
function readList(document: SceneDocument): ListShape {
    if (document.edges.length > 0) {
        return { kind: 'edge', node: null, detail: '单链表只应有向指针,不应出现无向边' };
    }

    const nodeByKey = new Map(document.nodes.map((node) => [node.key, node] as const));
    const childrenOf = new Map<number, number[]>(document.nodes.map((node) => [node.key, []] as const));
    const parentOf = new Map<number, number | null>(document.nodes.map((node) => [node.key, null] as const));

    for (const pointer of document.pointers) {
        childrenOf.get(pointer.from)?.push(pointer.to);
        if (parentOf.get(pointer.to) !== null) {
            const child = nodeByKey.get(pointer.to) as SceneDocumentNode;
            return { kind: 'merge', node: child.key, detail: `节点 ${child.label} 有两个父节点,不是单链` };
        }
        parentOf.set(pointer.to, pointer.from);
    }

    for (const node of document.nodes) {
        if ((childrenOf.get(node.key)?.length ?? 0) > 1) {
            return { kind: 'branch', node: node.key, detail: `节点 ${node.label} 有多个孩子,不是单链` };
        }
    }

    const heads = document.nodes.filter((node) => parentOf.get(node.key) === null);
    if (heads.length === 0) {
        const node = document.nodes[0] as SceneDocumentNode;
        return { kind: 'no-head', node: node.key, detail: '找不到表头:每个节点都有父节点(链上有环)' };
    }
    if (heads.length > 1) {
        const head = heads[1] as SceneDocumentNode;
        return { kind: 'multi-head', node: head.key, detail: `有 ${heads.length} 个节点没有父节点,不是一条单链` };
    }

    const order: number[] = [];
    const visited = new Set<number>();
    let current: number | null = (heads[0] as SceneDocumentNode).key;
    while (current !== null) {
        if (visited.has(current)) {
            const node = nodeByKey.get(current) as SceneDocumentNode;
            return { kind: 'cycle', node: current, detail: `节点 ${node.label} 被第二次走到(链上有环)` };
        }
        visited.add(current);
        order.push(current);
        current = childrenOf.get(current)?.[0] ?? null;
    }

    if (order.length !== document.nodes.length) {
        const unreachable = document.nodes.find((node) => !visited.has(node.key)) as SceneDocumentNode;
        return {
            kind: 'disconnected',
            node: unreachable.key,
            detail: `节点 ${unreachable.label} 从表头不可达`,
        };
    }

    return { order };
}

function pass(name: string): SceneCheckResult {
    return { name, passed: true, detail: '', details: [], node: null };
}

function fail(name: string, detail: string, node: number | null, details: readonly string[] = []): SceneCheckResult {
    return { name, passed: false, detail, details, node };
}

/** 单链表结构:唯一表头 + 每节点至多一父一子 + 从表头可达全部节点 */
const checkLinkedList: SceneCheckFunction = (document) => {
    const name = '单链表结构合法';
    if (document.nodes.length === 0) return pass(name);

    const shape = readList(document);
    if ('kind' in shape) return fail(name, shape.detail, shape.node);
    return pass(name);
};

/** 单链表升序:沿表头读出每个节点的 label,必须严格递增 */
const checkListSorted: SceneCheckFunction = (document) => {
    const name = '单链表节点值严格递增';
    if (document.nodes.length === 0) return pass(name);

    const shape = readList(document);
    if ('kind' in shape) {
        return fail(name, `链表结构不合法,无法检查有序性: ${shape.detail}`, shape.node);
    }

    const nodeByKey = new Map(document.nodes.map((node) => [node.key, node] as const));
    let previousLabel: string | null = null;
    let previousValue: number | null = null;
    for (const key of shape.order) {
        const node = nodeByKey.get(key) as SceneDocumentNode;
        const value = toComparableLabel(node.label);
        if (value === null) {
            return fail(name, `节点 ${node.label} 的 label 不是数字,无法比较大小`, node.key);
        }
        if (previousValue !== null && previousLabel !== null && value <= previousValue + LABEL_COMPARE_TOLERANCE) {
            return fail(
                name,
                `节点 ${previousLabel} -> ${node.label} 不是严格递增`,
                node.key,
                [`前一个节点「${previousLabel}」= ${previousValue}`, `当前节点「${node.label}」= ${value}`],
            );
        }
        previousLabel = node.label;
        previousValue = value;
    }
    return pass(name);
};

/** `list` 结构注册的全部检查;`id` 是函数名,检查配置窗口按它选取 */
export const LIST_CHECKS: readonly SceneCheckDefinition[] = [
    { id: 'checkLinkedList', run: checkLinkedList },
    { id: 'checkListSorted', run: checkListSorted },
];
