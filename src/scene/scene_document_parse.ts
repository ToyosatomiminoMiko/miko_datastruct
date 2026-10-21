/*
 * 中性场景文档的解析与校验:把用户粘贴的 `unknown` JSON 变成 SceneDocument.
 *
 * 为什么必须校验而不是"信任 JSON":输入来自人(或另一个进程),字段写错 / 少写 /
 * 引用了不存在的节点都不会自己报错,只会在布局或渲染阶段变成一颗画不出来的节点.
 * 这里把**所有**结构性问题收在一处,并给出可读的路径(`nodes[3].key`),上层只负责
 * 把错误显示出来.
 *
 * 校验口径(与 python/README.md 的输出契约一致):
 * - `nodes` 必填,数组;`key` 是 number / string,在文档内唯一且同类型;`attrs` 可省略;
 * - `pointers` / `edges` 可省略(默认空数组);
 * - pointer / edge 引用的 key 必须存在;
 * - 没有 node / edge 的 label:节点展示文字由 key 现算(`String(key)`);
 * - 未知字段一律忽略:Python 侧以后加字段时,旧的 web 不该因此拒收整份文档.
 *
 * JSON 里没有检查结论,也没有结构名:要跑哪些检查由「检查配置」窗口单独给.
 *
 * 错误只给稳定错误码 + 人话,不抛原始 TypeError;UI 文案由显示层拼.
 */

import type {
    SceneAttribute,
    SceneDocument,
    SceneDocumentEdge,
    SceneDocumentNode,
    SceneDocumentPointer,
    SceneNodeKey,
} from '@/scene/scene_document';

/** 解析失败的稳定错误码(测试与显示层按它区分,不靠文案匹配) */
export type SceneDocumentErrorCode =
    | 'json-syntax'
    | 'document-shape'
    | 'node-shape'
    | 'node-key'
    | 'node-key-duplicate'
    | 'node-attrs'
    | 'pointer-shape'
    | 'pointer-ref'
    | 'edge-shape'
    | 'edge-ref';

/**
 * 文档解析失败.
 *
 * `path` 是出错位置(`nodes[2].key` 这种),`message` 是给人看的一句话;
 * 显示层把两者拼起来即可,不必再按错误码写一份文案表.
 */
export class SceneDocumentError extends Error {
    constructor(
        readonly code: SceneDocumentErrorCode,
        readonly path: string,
        message: string,
    ) {
        // 路径是给"定位字段"用的;顶层错误(`$`)不带路径前缀,显示层少一层噪声
        super(path === '$' ? message : `${path}: ${message}`);
        this.name = 'SceneDocumentError';
    }
}

function fail(code: SceneDocumentErrorCode, path: string, message: string): never {
    throw new SceneDocumentError(code, path, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 取可选字段:对象里没有这个键时给 undefined(与"显式写 null"区分) */
function optional(record: Record<string, unknown>, field: string): unknown {
    return Object.prototype.hasOwnProperty.call(record, field) ? record[field] : undefined;
}

/** 读一个可选的数组字段;不是数组就报错,缺省给空数组 */
function readOptionalArray(
    record: Record<string, unknown>,
    field: string,
    path: string,
    code: SceneDocumentErrorCode,
): readonly unknown[] {
    const value = optional(record, field);
    if (value === undefined) return [];
    if (!Array.isArray(value)) fail(code, `${path}.${field}`, '必须是数组');
    return value;
}

/**
 * 读节点 key:有限数字或非空字符串.
 *
 * 不限定整数 / 非负:key 是数据键,树 / 堆的键可以是负数或小数;字符串留给 "K" / "N"
 * 这类命名节点(图).同一文档内 key 类型是否一致由 `readNodes` 统一检查.
 */
function readNodeKey(value: unknown, path: string, code: SceneDocumentErrorCode): SceneNodeKey {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value !== '') return value;
    fail(code, path, '必须是数字或非空字符串');
}

/** 读一个 attrs:必须是对象,值只能是字符串 / 数字 / 布尔 */
function readAttributes(
    value: unknown,
    path: string,
    code: SceneDocumentErrorCode,
): Readonly<Record<string, SceneAttribute>> {
    if (value === undefined) return {};
    if (!isRecord(value)) fail(code, path, '必须是对象');
    const attrs: Record<string, SceneAttribute> = {};
    for (const [name, raw] of Object.entries(value)) {
        const attrPath = `${path}.${name}`;
        if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') {
            fail(code, attrPath, '只能是字符串 / 数字 / 布尔');
        }
        attrs[name] = raw;
    }
    return attrs;
}

// 三段:节点 / 指针 / 边

function readNodes(raw: readonly unknown[]): readonly SceneDocumentNode[] {
    const nodes: SceneDocumentNode[] = [];
    const seen = new Set<SceneNodeKey>();
    let keyType: 'number' | 'string' | null = null;
    for (const [index, item] of raw.entries()) {
        const path = `nodes[${index}]`;
        if (!isRecord(item)) fail('node-shape', path, '必须是对象');
        const key = readNodeKey(optional(item, 'key'), `${path}.key`, 'node-key');
        const currentType: 'number' | 'string' = typeof key === 'number' ? 'number' : 'string';
        if (keyType !== null && currentType !== keyType) {
            fail('node-key', `${path}.key`, '同一文档内节点 key 必须同为数字或同为字符串');
        }
        keyType = currentType;
        if (seen.has(key)) fail('node-key-duplicate', `${path}.key`, `节点 key 重复: ${String(key)}`);
        seen.add(key);

        nodes.push({
            key,
            attrs: readAttributes(optional(item, 'attrs'), `${path}.attrs`, 'node-attrs'),
        });
    }
    return nodes;
}

/**
 * 一条连接两端节点的引用(Object 里 from/to 或 a/b).
 *
 * `shapeCode` 管"字段本身写错了"(不是数字 / 非空字符串),`refCode` 管"引用了不存在的
 * key":两种错要在同一段里报,但错误码必须能区分"格式"与"悬空引用".
 */
function readNodeReference(
    item: Record<string, unknown>,
    field: string,
    path: string,
    nodeKeys: ReadonlySet<SceneNodeKey>,
    keyType: 'number' | 'string' | null,
    shapeCode: SceneDocumentErrorCode,
    refCode: SceneDocumentErrorCode,
): SceneNodeKey {
    const key = readNodeKey(optional(item, field), `${path}.${field}`, shapeCode);
    // 引用与节点 key 必须同类型:文档内 key 同类型是硬约束,混类型引用几乎一定是写错了
    if (keyType !== null && typeof key !== keyType) {
        fail(shapeCode, `${path}.${field}`, 'key 类型与文档内节点 key 不一致');
    }
    if (!nodeKeys.has(key)) fail(refCode, `${path}.${field}`, `引用了不存在的节点 key: ${String(key)}`);
    return key;
}

function readPointers(
    raw: readonly unknown[],
    nodeKeys: ReadonlySet<SceneNodeKey>,
    keyType: 'number' | 'string' | null,
): readonly SceneDocumentPointer[] {
    return raw.map((item, index) => {
        const path = `pointers[${index}]`;
        if (!isRecord(item)) fail('pointer-shape', path, '必须是对象');
        return {
            from: readNodeReference(item, 'from', path, nodeKeys, keyType, 'pointer-shape', 'pointer-ref'),
            to: readNodeReference(item, 'to', path, nodeKeys, keyType, 'pointer-shape', 'pointer-ref'),
        };
    });
}

function readEdges(
    raw: readonly unknown[],
    nodeKeys: ReadonlySet<SceneNodeKey>,
    keyType: 'number' | 'string' | null,
): readonly SceneDocumentEdge[] {
    return raw.map((item, index) => {
        const path = `edges[${index}]`;
        if (!isRecord(item)) fail('edge-shape', path, '必须是对象');
        return {
            a: readNodeReference(item, 'a', path, nodeKeys, keyType, 'edge-shape', 'edge-ref'),
            b: readNodeReference(item, 'b', path, nodeKeys, keyType, 'edge-shape', 'edge-ref'),
            attrs: readAttributes(optional(item, 'attrs'), `${path}.attrs`, 'edge-shape'),
        };
    });
}

/**
 * 把已经 `JSON.parse` 出来的值校验成 SceneDocument.
 *
 * 与 {@link parseSceneDocument} 分开:测试可以直接喂对象,调用方也不必为了解析
 * 再序列化一遍.
 */
export function readSceneDocument(value: unknown): SceneDocument {
    if (!isRecord(value)) fail('document-shape', '$', '顶层必须是一个 JSON 对象');
    const nodes = readNodes(readOptionalArray(value, 'nodes', '$', 'document-shape'));
    const nodeKeys = new Set(nodes.map((node) => node.key));
    // 空文档没有节点可参照:引用只能是悬空的,类型检查跳过
    const keyType = nodes.length === 0 ? null : (typeof nodes[0]?.key as 'number' | 'string');
    return {
        nodes,
        pointers: readPointers(readOptionalArray(value, 'pointers', '$', 'document-shape'), nodeKeys, keyType),
        edges: readEdges(readOptionalArray(value, 'edges', '$', 'document-shape'), nodeKeys, keyType),
    };
}

/**
 * 把一段 JSON 文本解析成 SceneDocument.
 *
 * JSON 语法错误单独给 `json-syntax`:它不是文档结构的问题,错误消息来自
 * `JSON.parse`(已经带位置),再包一层反而读不懂.
 */
export function parseSceneDocument(source: string): SceneDocument {
    let value: unknown;
    try {
        value = JSON.parse(source);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new SceneDocumentError('json-syntax', '$', `JSON 解析失败: ${message}`);
    }
    return readSceneDocument(value);
}
