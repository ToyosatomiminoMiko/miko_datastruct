/*
 * 中性场景文档的解析与校验:把用户粘贴的 `unknown` JSON 变成 SceneDocument.
 *
 * 为什么必须校验而不是"信任 JSON":输入来自人(或另一个进程),字段写错 / 少写 /
 * 引用了不存在的节点都不会自己报错,只会在布局或渲染阶段变成一颗画不出来的节点.
 * 这里把**所有**结构性问题收在一处,并给出可读的路径(`nodes[3].key`),上层只负责
 * 把错误显示出来.
 *
 * 校验口径(与 python/README.md 的输出契约一致):
 * - `nodes` 必填,数组;`key` 是整数且在文档内唯一,`label` 是字符串,`attrs` 可省略;
 * - `pointers` / `edges` 可省略(默认空数组);
 * - pointer / edge 引用的 key 必须存在;
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
} from '@/scene/scene_document';

/** 解析失败的稳定错误码(测试与显示层按它区分,不靠文案匹配) */
export type SceneDocumentErrorCode =
    | 'json-syntax'
    | 'document-shape'
    | 'node-shape'
    | 'node-key'
    | 'node-key-duplicate'
    | 'node-label'
    | 'node-attrs'
    | 'pointer-shape'
    | 'pointer-ref'
    | 'edge-shape'
    | 'edge-ref';

/**
 * 文档解析失败.
 *
 * `path` 是出错位置(`nodes[2].label` 这种),`message` 是给人看的一句话;
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
 * 读节点 key:非负安全整数.
 *
 * 限定非负是因为 Python 的 Scene key 从 0 开始按遍历顺序编号;负数能过类型检查
 * 但不会是合法输出,收进来只会让"引用不存在"的报错更难懂.
 */
function readNodeKey(value: unknown, path: string, code: SceneDocumentErrorCode): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        fail(code, path, '必须是 0 或正整数');
    }
    return value;
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

// 四段:节点 / 指针 / 边 / 检查

function readNodes(raw: readonly unknown[]): readonly SceneDocumentNode[] {
    const nodes: SceneDocumentNode[] = [];
    const seen = new Set<number>();
    for (const [index, item] of raw.entries()) {
        const path = `nodes[${index}]`;
        if (!isRecord(item)) fail('node-shape', path, '必须是对象');
        const key = readNodeKey(optional(item, 'key'), `${path}.key`, 'node-key');
        if (seen.has(key)) fail('node-key-duplicate', `${path}.key`, `节点 key 重复: ${key}`);
        seen.add(key);

        const label = optional(item, 'label');
        if (typeof label !== 'string') fail('node-label', `${path}.label`, '必须是字符串');

        nodes.push({
            key,
            label,
            attrs: readAttributes(optional(item, 'attrs'), `${path}.attrs`, 'node-attrs'),
        });
    }
    return nodes;
}

/**
 * 一条连接两端节点的引用(Object 里 from/to 或 a/b).
 *
 * `shapeCode` 管"字段本身写错了"(不是整数),`refCode` 管"引用了不存在的 key":
 * 两种错要在同一段里报,但错误码必须能区分"格式"与"悬空引用".
 */
function readNodeReference(
    item: Record<string, unknown>,
    field: string,
    path: string,
    nodeKeys: ReadonlySet<number>,
    shapeCode: SceneDocumentErrorCode,
    refCode: SceneDocumentErrorCode,
): number {
    const key = readNodeKey(optional(item, field), `${path}.${field}`, shapeCode);
    if (!nodeKeys.has(key)) fail(refCode, `${path}.${field}`, `引用了不存在的节点 key: ${key}`);
    return key;
}

function readPointers(raw: readonly unknown[], nodeKeys: ReadonlySet<number>): readonly SceneDocumentPointer[] {
    return raw.map((item, index) => {
        const path = `pointers[${index}]`;
        if (!isRecord(item)) fail('pointer-shape', path, '必须是对象');
        return {
            from: readNodeReference(item, 'from', path, nodeKeys, 'pointer-shape', 'pointer-ref'),
            to: readNodeReference(item, 'to', path, nodeKeys, 'pointer-shape', 'pointer-ref'),
        };
    });
}

function readEdges(raw: readonly unknown[], nodeKeys: ReadonlySet<number>): readonly SceneDocumentEdge[] {
    return raw.map((item, index) => {
        const path = `edges[${index}]`;
        if (!isRecord(item)) fail('edge-shape', path, '必须是对象');
        const label = optional(item, 'label');
        if (label !== undefined && label !== null && typeof label !== 'string') {
            fail('edge-shape', `${path}.label`, '必须是字符串或 null');
        }
        return {
            a: readNodeReference(item, 'a', path, nodeKeys, 'edge-shape', 'edge-ref'),
            b: readNodeReference(item, 'b', path, nodeKeys, 'edge-shape', 'edge-ref'),
            label: label ?? null,
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
    return {
        nodes,
        pointers: readPointers(readOptionalArray(value, 'pointers', '$', 'document-shape'), nodeKeys),
        edges: readEdges(readOptionalArray(value, 'edges', '$', 'document-shape'), nodeKeys),
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
