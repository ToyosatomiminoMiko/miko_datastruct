/**
 * 图结构检查(纯逻辑,node 环境)的契约:欧拉回路判定.
 *
 * 图节点的 key 就是陆地名字("K" / "N" / …),边按 key 引用;检查文案直接显示 key.
 */
import { describe, expect, it } from 'vitest';

import { readSceneDocument } from '@/scene/scene_document_parse';
import { GRAPH_CHECKS } from '@/datastruct/graph/graph_checks';

function graphDocument(
    keys: readonly string[],
    edges: readonly (readonly [string, string])[],
): ReturnType<typeof readSceneDocument> {
    return readSceneDocument({
        nodes: keys.map((key) => ({ key })),
        edges: edges.map(([a, b]) => ({ a, b })),
    });
}

function run(document: ReturnType<typeof readSceneDocument>) {
    return GRAPH_CHECKS.map((check) => check.run(document));
}

describe('图检查:存在欧拉回路', () => {
    it('三角形:所有度数偶数且连通 -> PASS', () => {
        const checks = run(graphDocument(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']]));
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
                ['K', 'N'], ['K', 'N'],
                ['K', 'S'], ['K', 'S'],
                ['K', 'E'],
                ['N', 'E'],
                ['S', 'E'],
            ],
        ));
        const check = checks[0];
        expect(check?.passed).toBe(false);
        expect(check?.detail).toContain('奇数度节点');
        expect(check?.detail).toContain('K(度5)');
        expect(check?.node).toBe('K');
        expect(check?.details).toHaveLength(4);
    });

    it('两个互不连通的三角形:度数全是偶数也不存在欧拉回路', () => {
        const checks = run(graphDocument(
            ['A', 'B', 'C', 'D', 'E', 'F'],
            [['A', 'B'], ['B', 'C'], ['C', 'A'], ['D', 'E'], ['E', 'F'], ['F', 'D']],
        ));
        expect(checks[0]?.passed).toBe(false);
        expect(checks[0]?.detail).toContain('互不连通');
    });
});
