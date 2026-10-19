/**
 * 图结构检查(纯逻辑,node 环境)的契约:欧拉回路判定.
 */
import { describe, expect, it } from 'vitest';

import { readSceneDocument } from '@/scene/scene_document_parse';
import { GRAPH_CHECKS } from '@/datastruct/graph/graph_checks';

function graphDocument(
    labels: readonly string[],
    edges: readonly (readonly [number, number])[],
): ReturnType<typeof readSceneDocument> {
    return readSceneDocument({
        nodes: labels.map((label, key) => ({ key, label })),
        edges: edges.map(([a, b]) => ({ a, b })),
    });
}

function run(document: ReturnType<typeof readSceneDocument>) {
    return GRAPH_CHECKS.map((check) => check.run(document));
}

describe('图检查:存在欧拉回路', () => {
    it('三角形:所有度数偶数且连通 -> PASS', () => {
        const checks = run(graphDocument(['A', 'B', 'C'], [[0, 1], [1, 2], [2, 0]]));
        expect(checks).toHaveLength(1);
        expect(checks[0]?.passed).toBe(true);
    });

    it('没有边:空图视为存在(没有边要走)', () => {
        expect(run(graphDocument(['A', 'B'], []))[0]?.passed).toBe(true);
    });

    it('柯尼斯堡七桥:奇数度节点 -> FAIL,细节列出度数', () => {
        const checks = run(graphDocument(
            ['K', 'N', 'S', 'E'],
            [
                [0, 1], [0, 1],
                [0, 2], [0, 2],
                [0, 3],
                [1, 3],
                [2, 3],
            ],
        ));
        const check = checks[0];
        expect(check?.passed).toBe(false);
        expect(check?.detail).toContain('奇数度节点');
        expect(check?.detail).toContain('K(度5)');
        expect(check?.node).toBe(0);
        expect(check?.details).toHaveLength(4);
    });

    it('两个互不连通的三角形:度数全是偶数也不存在欧拉回路', () => {
        const checks = run(graphDocument(
            ['A', 'B', 'C', 'D', 'E', 'F'],
            [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3]],
        ));
        expect(checks[0]?.passed).toBe(false);
        expect(checks[0]?.detail).toContain('互不连通');
    });
});
