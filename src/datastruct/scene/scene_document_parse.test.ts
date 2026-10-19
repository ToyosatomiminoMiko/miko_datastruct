/**
 * 中性场景文档解析器(纯逻辑,node 环境)的契约.
 *
 * 钉三件事:合法文档能读成什么形状(含省略字段的默认值)、每一类结构错误的稳定错误码、
 * 以及未知字段被忽略(向前兼容:Python 侧加字段时旧 web 不拒收).
 */
import { describe, expect, it } from 'vitest';

import {
    parseSceneDocument,
    readSceneDocument,
    SceneDocumentError,
} from '@/datastruct/scene/scene_document_parse';

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
    it('最小文档:只有 nodes;指针 / 边 / 检查都默认成空数组', () => {
        const document = parseSceneDocument('{"nodes":[{"key":0,"label":"A"}]}');
        expect(document.nodes).toEqual([{ key: 0, label: 'A', attrs: {} }]);
        expect(document.pointers).toEqual([]);
        expect(document.edges).toEqual([]);
        expect(document.checks).toEqual([]);
    });

    it('完整文档:attrs / pointer / edge / check 全部读出来', () => {
        const document = parseSceneDocument(JSON.stringify({
            nodes: [
                { key: 0, label: '10', attrs: { color: 'black', weight: 2, visited: false } },
                { key: 1, label: '5' },
            ],
            pointers: [{ from: 0, to: 1 }],
            edges: [{ a: 0, b: 1, label: '桥', attrs: { weight: 3 } }],
            checks: [{
                name: '根节点为黑色',
                passed: true,
                detail: '',
                details: ['说明 1', '说明 2'],
                node: 0,
            }],
        }));

        expect(document.nodes[0]).toEqual({
            key: 0,
            label: '10',
            attrs: { color: 'black', weight: 2, visited: false },
        });
        expect(document.pointers).toEqual([{ from: 0, to: 1 }]);
        expect(document.edges).toEqual([{
            a: 0,
            b: 1,
            label: '桥',
            attrs: { weight: 3 },
        }]);
        expect(document.checks).toEqual([{
            name: '根节点为黑色',
            passed: true,
            detail: '',
            details: ['说明 1', '说明 2'],
            node: 0,
        }]);
    });

    it('省略字段的默认值:edge label -> null,check 的 detail / details / node -> 空 / 空 / null', () => {
        const document = parseSceneDocument(JSON.stringify({
            nodes: [{ key: 0, label: 'A' }, { key: 1, label: 'B' }],
            edges: [{ a: 0, b: 1 }],
            checks: [{ name: '有环', passed: false }],
        }));

        expect(document.edges[0]).toEqual({ a: 0, b: 1, label: null, attrs: {} });
        expect(document.checks[0]).toEqual({
            name: '有环',
            passed: false,
            detail: '',
            details: [],
            node: null,
        });
    });

    it('空文档 {}:四组都是空数组(UI 据此显示"没有内容"而不是报错)', () => {
        expect(parseSceneDocument('{}')).toEqual({
            nodes: [],
            pointers: [],
            edges: [],
            checks: [],
        });
    });

    it('未知字段忽略:向前兼容 Python 侧以后加字段', () => {
        const document = readSceneDocument({
            kind: 'rbt',
            nodes: [{ key: 0, label: 'A', extra: 'ignored' }],
        });
        expect(document.nodes).toHaveLength(1);
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

    it('key 不是非负整数 -> node-key', () => {
        expect(expectError('{"nodes":[{"key":"0","label":"A"}]}', 'node-key').path).toBe('nodes[0].key');
        expect(expectError('{"nodes":[{"key":-1,"label":"A"}]}', 'node-key').path).toBe('nodes[0].key');
        expect(expectError('{"nodes":[{"key":1.5,"label":"A"}]}', 'node-key').path).toBe('nodes[0].key');
    });

    it('key 重复 -> node-key-duplicate', () => {
        const error = expectError(
            '{"nodes":[{"key":0,"label":"A"},{"key":0,"label":"B"}]}',
            'node-key-duplicate',
        );
        expect(error.path).toBe('nodes[1].key');
    });

    it('label 缺失 / 不是字符串 -> node-label', () => {
        expect(expectError('{"nodes":[{"key":0}]}', 'node-label').path).toBe('nodes[0].label');
        expect(expectError('{"nodes":[{"key":0,"label":1}]}', 'node-label').path).toBe('nodes[0].label');
    });

    it('attrs 不是对象 / 值是数组或 null -> node-attrs', () => {
        expect(expectError('{"nodes":[{"key":0,"label":"A","attrs":[]}]}', 'node-attrs').path)
            .toBe('nodes[0].attrs');
        expect(expectError('{"nodes":[{"key":0,"label":"A","attrs":{"x":[1]}}]}', 'node-attrs').path)
            .toBe('nodes[0].attrs.x');
        expect(expectError('{"nodes":[{"key":0,"label":"A","attrs":{"x":null}}]}', 'node-attrs').path)
            .toBe('nodes[0].attrs.x');
    });

    it('pointer 字段格式错 -> pointer-shape;引用不存在的 key -> pointer-ref', () => {
        expect(expectError('{"nodes":[],"pointers":[{"from":"0","to":0}]}', 'pointer-shape').path)
            .toBe('pointers[0].from');
        expect(expectError(
            '{"nodes":[{"key":0,"label":"A"}],"pointers":[{"from":0,"to":9}]}',
            'pointer-ref',
        ).path).toBe('pointers[0].to');
    });

    it('edge 端点引用不存在的 key -> edge-ref;label 类型错 -> edge-shape', () => {
        expect(expectError(
            '{"nodes":[{"key":0,"label":"A"}],"edges":[{"a":0,"b":9}]}',
            'edge-ref',
        ).path).toBe('edges[0].b');
        expect(expectError(
            '{"nodes":[{"key":0,"label":"A"}],"edges":[{"a":0,"b":0,"label":1}]}',
            'edge-shape',
        ).path).toBe('edges[0].label');
    });

    it('check 的 name / passed / details 形状错 -> check-shape', () => {
        expect(expectError('{"checks":[{"passed":true}]}', 'check-shape').path).toBe('checks[0].name');
        expect(expectError('{"checks":[{"name":"  ","passed":true}]}', 'check-shape').path)
            .toBe('checks[0].name');
        expect(expectError('{"checks":[{"name":"x","passed":"yes"}]}', 'check-shape').path)
            .toBe('checks[0].passed');
        expect(expectError('{"checks":[{"name":"x","passed":true,"details":[1]}]}', 'check-shape').path)
            .toBe('checks[0].details');
    });

    it('check.node 引用不存在的节点 -> check-ref', () => {
        expect(expectError('{"checks":[{"name":"x","passed":false,"node":3}]}', 'check-ref').path)
            .toBe('checks[0].node');
    });
});
