/**
 * 中性场景文档解析器(纯逻辑,node 环境)的契约.
 *
 * 钉三件事:合法文档能读成什么形状(含省略字段的默认值)、每一类结构错误的稳定错误码、
 * 以及未知字段被忽略(向前兼容:Python 侧加字段时旧 web 不拒收).
 *
 * 节点的 key 就是数据键:number 或 string,同文档唯一且同类型;没有 label,节点展示
 * 文字由 key 现算.检查结论与结构名都不是文档字段:解析器只认 nodes / pointers /
 * edges,`checks` / `structure` 这类旧字段会被当成未知字段忽略.
 */
import { describe, expect, it } from 'vitest';

import {
    parseSceneDocument,
    readSceneDocument,
    SceneDocumentError,
} from '@/scene/scene_document_parse';

/** 断言抛的是带指定错误码的 SceneDocumentError,并交回它给调用方看路径 / 文案 */
function expectError(source: string, code: string): SceneDocumentError {
    try {
        parseSceneDocument(source);
    } catch (error) {
        expect(error).toBeInstanceOf(SceneDocumentError);
        const typed = error as SceneDocumentError;
        expect(typed.code).toBe(code);
        return typed;
    }
    throw new Error(`期待抛错 ${code},实际没有抛`);
}

describe('中性场景文档:解析', () => {
    it('最小文档:只有 nodes;指针 / 边默认成空数组', () => {
        const document = parseSceneDocument('{"nodes":[{"key":0}]}');
        expect(document.nodes).toEqual([{ key: 0, attrs: {} }]);
        expect(document.pointers).toEqual([]);
        expect(document.edges).toEqual([]);
    });

    it('完整文档:attrs / pointer / edge 全部读出来(边没有 label,展示文字不占文档字段)', () => {
        const document = parseSceneDocument(JSON.stringify({
            nodes: [
                { key: 10, attrs: { color: 'black', weight: 2, visited: false } },
                { key: 5 },
            ],
            pointers: [{ from: 10, to: 5 }],
            edges: [{ a: 10, b: 5, attrs: { weight: 3 } }],
        }));

        expect(document.nodes[0]).toEqual({
            key: 10,
            attrs: { color: 'black', weight: 2, visited: false },
        });
        expect(document.nodes[1]).toEqual({ key: 5, attrs: {} });
        expect(document.pointers).toEqual([{ from: 10, to: 5 }]);
        expect(document.edges).toEqual([{ a: 10, b: 5, attrs: { weight: 3 } }]);
    });

    it('attrs 省略 -> 空对象;edge 省略 attrs -> 空对象', () => {
        const document = parseSceneDocument(JSON.stringify({
            nodes: [{ key: 0 }, { key: 1 }],
            edges: [{ a: 0, b: 1 }],
        }));

        expect(document.edges[0]).toEqual({ a: 0, b: 1, attrs: {} });
    });

    it('key 允许字符串(命名节点):图用 "K" / "N" 这类 key,引用也按字符串', () => {
        const document = parseSceneDocument(JSON.stringify({
            nodes: [{ key: 'K' }, { key: 'N' }],
            pointers: [{ from: 'K', to: 'N' }],
        }));

        expect(document.nodes).toEqual([{ key: 'K', attrs: {} }, { key: 'N', attrs: {} }]);
        expect(document.pointers).toEqual([{ from: 'K', to: 'N' }]);
    });

    it('空文档 {}:三组图元都是空的(UI 据此显示"没有内容"而不是报错)', () => {
        expect(parseSceneDocument('{}')).toEqual({
            nodes: [],
            pointers: [],
            edges: [],
        });
    });

    it('未知字段忽略:向前兼容;旧文档残留的 label 不再有语义,也不会拒收', () => {
        const document = readSceneDocument({
            structure: 'rbt',
            checks: [{ name: '旧字段', passed: false }],
            nodes: [{ key: 7, label: '旧展示文字', extra: 'ignored' }],
        });
        expect(document.nodes).toHaveLength(1);
        expect(document.nodes[0]).toEqual({ key: 7, attrs: {} });
    });
});

describe('中性场景文档:结构错误', () => {
    it('JSON 语法错误 -> json-syntax', () => {
        const error = expectError('{"nodes":[}', 'json-syntax');
        expect(error.message).toContain('解析失败');
    });

    it('顶层不是对象 -> document-shape', () => {
        expect(expectError('[]', 'document-shape').path).toBe('$');
    });

    it('nodes 不是数组 -> document-shape', () => {
        expect(expectError('{"nodes":{}}', 'document-shape').path).toBe('$.nodes');
    });

    it('节点不是对象 -> node-shape', () => {
        expect(expectError('{"nodes":[1]}', 'node-shape').path).toBe('nodes[0]');
    });

    it('key 缺失 / 不是数字或非空字符串 -> node-key', () => {
        expect(expectError('{"nodes":[{"attrs":{}}]}', 'node-key').path).toBe('nodes[0].key');
        expect(expectError('{"nodes":[{"key":null}]}', 'node-key').path).toBe('nodes[0].key');
        expect(expectError('{"nodes":[{"key":true}]}', 'node-key').path).toBe('nodes[0].key');
        expect(expectError('{"nodes":[{"key":""}]}', 'node-key').path).toBe('nodes[0].key');
        expect(expectError('{"nodes":[{"key":1e999}]}', 'node-key').path).toBe('nodes[0].key');
    });

    it('key 重复 -> node-key-duplicate', () => {
        const error = expectError(
            '{"nodes":[{"key":0},{"key":0}]}',
            'node-key-duplicate',
        );
        expect(error.path).toBe('nodes[1].key');
        expect(error.message).toContain('0');
    });

    it('key 类型混用 -> node-key(布局排序需要一个明确的比较口径)', () => {
        const error = expectError(
            '{"nodes":[{"key":0},{"key":"A"}]}',
            'node-key',
        );
        expect(error.path).toBe('nodes[1].key');
        expect(error.message).toContain('同为');
    });

    it('attrs 不是对象 / 值是数组或 null -> node-attrs', () => {
        expect(expectError('{"nodes":[{"key":0,"attrs":[]}]}', 'node-attrs').path)
            .toBe('nodes[0].attrs');
        expect(expectError('{"nodes":[{"key":0,"attrs":{"x":[1]}}]}', 'node-attrs').path)
            .toBe('nodes[0].attrs.x');
        expect(expectError('{"nodes":[{"key":0,"attrs":{"x":null}}]}', 'node-attrs').path)
            .toBe('nodes[0].attrs.x');
    });

    it('pointer 字段格式错 / 类型与节点 key 不一致 -> pointer-shape;引用不存在的 key -> pointer-ref', () => {
        expect(expectError('{"nodes":[{"key":0}],"pointers":[{"from":true,"to":0}]}', 'pointer-shape').path)
            .toBe('pointers[0].from');
        expect(expectError('{"nodes":[{"key":0}],"pointers":[{"from":"0","to":0}]}', 'pointer-shape').path)
            .toBe('pointers[0].from');
        expect(expectError(
            '{"nodes":[{"key":0}],"pointers":[{"from":0,"to":9}]}',
            'pointer-ref',
        ).path).toBe('pointers[0].to');
    });

    it('edge 端点引用不存在的 key -> edge-ref;类型不一致 -> edge-shape', () => {
        expect(expectError(
            '{"nodes":[{"key":0}],"edges":[{"a":0,"b":9}]}',
            'edge-ref',
        ).path).toBe('edges[0].b');
        expect(expectError(
            '{"nodes":[{"key":0}],"edges":[{"a":0,"b":"0"}]}',
            'edge-shape',
        ).path).toBe('edges[0].b');
    });
});
