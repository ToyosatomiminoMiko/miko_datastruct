/*
 * 中性场景文档:web 与 Python 两侧共享的那份 JSON 数据的**类型定义**.
 *
 * 它不是某一种数据结构,而是"一种结构画出来是什么样"的中性描述:
 *
 * - `nodes`     平面上的节点(业务 key / 展示文字 / 结构特有属性);
 * - `pointers`  有向指针(树里就是父 -> 子);
 * - `edges`     无向边(图里的一条边).
 *
 * JSON 里**没有检查结论,也没有"结构名"**:性质检查不是结构内容,而是"某一类结构该
 * 满足什么"的知识,由 web 侧「检查配置」窗口按函数名选择、载入后现算(见
 * scene_check.ts).生产 JSON 的一方只负责描述结构,不必也不应该手写 PASS / FAIL.
 *
 * 字段形状与 python/README.md 的输出契约保持一致.
 *
 * 这里只定义类型,不解析也不校验(见 scene_document_parse.ts).类型只描述"合法的
 * 文档长什么样";用户输入是 `unknown`,必须过解析器.
 */

/**
 * attrs 允许的值:JSON 标量.
 *
 * 只收字符串 / 数字 / 布尔:它们能原样显示在列表行里,也够表达颜色、权重这类
 * 结构属性.数组 / 对象留白(现在没有结构需要嵌套属性);`null` 不收 -- JSON 里
 * 省略字段与本字段为 null 应当是同一种意思,解析器直接拒绝,避免两种"没有".
 */
export type SceneAttribute = string | number | boolean;

/** 一个节点:业务 key 只在本文档内唯一,label 是展示文字,attrs 是结构特有属性 */
export interface SceneDocumentNode {
    /** 节点编号(整数,同一文档内唯一;pointer / edge 都按它引用节点) */
    readonly key: number;
    /** 节点上显示的文字(已经格式化好,web 不再拼接) */
    readonly label: string;
    /** 结构特有属性(例如红黑树的 `color`);列表行与节点样式都从这里读 */
    readonly attrs: Readonly<Record<string, SceneAttribute>>;
}

/** 一条有向指针:`from -> to`,两端都是 nodes[].key */
export interface SceneDocumentPointer {
    readonly from: number;
    readonly to: number;
}

/** 一条无向边:两端都是 nodes[].key;label / attrs 可选(边的展示文字与属性) */
export interface SceneDocumentEdge {
    readonly a: number;
    readonly b: number;
    readonly label: string | null;
    readonly attrs: Readonly<Record<string, SceneAttribute>>;
}

/** 一份完整的中性场景文档:一个结构 = 节点 + 连接 */
export interface SceneDocument {
    readonly nodes: readonly SceneDocumentNode[];
    readonly pointers: readonly SceneDocumentPointer[];
    readonly edges: readonly SceneDocumentEdge[];
}

/** 空文档:没有图元(UI 用它表示"这一轮没有内容") */
export const EMPTY_SCENE_DOCUMENT: SceneDocument = {
    nodes: [],
    pointers: [],
    edges: [],
};
