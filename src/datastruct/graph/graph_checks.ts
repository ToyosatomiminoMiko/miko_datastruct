/*
 * 图结构检查:登记为 `checkEulerCircuit`,演示检查注册表不只服务红黑树.
 *
 * 现在只有一条:欧拉回路存在性.判定用的是无向图的经典条件:
 *
 * - 所有节点度数都是偶数(有奇数度节点就不存在欧拉回路);
 * - 所有带边的节点属于同一个连通分量(回路必须能一笔走完所有边).
 *
 * 边来自中性文档的 `edges`;没有边的孤立节点不参与连通性判断(它们本来就不需要走).
 * 这条检查是给"柯尼斯堡七桥"示例用的,不是所有图都关心的性质;换一种图结构时,
 * 应该注册自己的检查集,而不是复用这个结构名.
 */

import type { SceneCheckDefinition, SceneCheckFunction, SceneCheckResult } from '@/scene/scene_check';
import type { SceneNodeKey } from '@/scene/scene_document';

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

/** 存在欧拉回路:所有度数偶数,且带边的部分连通 */
const checkEulerCircuit: SceneCheckFunction = (document) => {
    const name = '存在欧拉回路';
    if (document.edges.length === 0) return pass(name);

    // 度数:一条边给两端各加一;自环(a === b)会给同一个节点加两次,正好是 2
    const degree = new Map<SceneNodeKey, number>(document.nodes.map((node) => [node.key, 0] as const));
    const adjacency = new Map<SceneNodeKey, SceneNodeKey[]>(document.nodes.map((node) => [node.key, []] as const));
    for (const edge of document.edges) {
        degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1);
        degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1);
        adjacency.get(edge.a)?.push(edge.b);
        adjacency.get(edge.b)?.push(edge.a);
    }

    const odd = document.nodes.filter((node) => ((degree.get(node.key) ?? 0) % 2) === 1);
    if (odd.length > 0) {
        return fail(
            name,
            `奇数度节点:${odd.map((node) => `${String(node.key)}(度${degree.get(node.key) ?? 0})`).join(', ')} -- 不存在欧拉回路`,
            odd[0]?.key ?? null,
            odd.map((node) => `节点 ${String(node.key)}: 度 ${degree.get(node.key) ?? 0}`),
        );
    }

    // 连通性:只统计真的挂了边的节点;孤立节点不影响回路
    const withEdge = new Set<SceneNodeKey>();
    for (const edge of document.edges) {
        withEdge.add(edge.a);
        withEdge.add(edge.b);
    }
    const visited = new Set<SceneNodeKey>();
    let components = 0;
    for (const key of withEdge) {
        if (visited.has(key)) continue;
        components += 1;
        const stack = [key];
        visited.add(key);
        while (stack.length > 0) {
            const current = stack.pop() as SceneNodeKey;
            for (const next of adjacency.get(current) ?? []) {
                if (visited.has(next)) continue;
                visited.add(next);
                stack.push(next);
            }
        }
    }
    if (components > 1) {
        return fail(name, `带边的节点分成 ${components} 个互不连通的部分 -- 不存在欧拉回路`, null);
    }
    return pass(name);
};

/** `graph` 结构注册的全部检查;`id` 是函数名,检查配置窗口按它选取 */
export const GRAPH_CHECKS: readonly SceneCheckDefinition[] = [
    { id: 'checkEulerCircuit', run: checkEulerCircuit },
];
