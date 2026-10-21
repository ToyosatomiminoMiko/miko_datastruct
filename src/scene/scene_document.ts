/*
 * 中性场景文档:web 与 Python 两侧共享的那份 JSON 数据的**类型定义**.
 *
 * 它不是某一种数据结构,而是"一种结构画出来是什么样"的中性描述:
 *
 * - `nodes`     平面上的节点(key = 数据键 / 结构特有属性);
 * - `pointers`  有向指针(树里就是父 -> 子);
 * - `edges`     无向边(图里的一条边).
 *
 * 节点的 `key` 就是它在数据结构里的键:树 / 堆 / 链里通常是参与比较的数值,图里
 * 可以是 "K" 这种名字.它同时是三件事:
 *
 * 1. 引用:pointers / edges 按 key 找节点;
 * 2. 排序:有序性检查直接比较 key(不再把展示文字解析回数字);
 * 3. 展示:节点上画的就是 `String(key)`.
 *
 * 因此**没有独立的文档内编号,也没有 label**:同样形状的节点各带各的 key,key 在
 * 一份文档里唯一且类型一致(number / string 不混用)."不同节点可以有相同 key"的
 * 结构现在不需要;真出现时再加可选 uuid 专做引用,不把 key 拆成两份语义.
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
 * 节点 key:number 或 string.
 *
 * 同一份文档里 key 必须同类型(全 number 或全 string):布局里会按 key 排先后,
 * 混类型会让比较规则依赖 JS 的隐式转换,重新引入"看起来能跑、排序却说不清"的坑.
 */
export type SceneNodeKey = number | string;

/**
 * attrs 允许的值:JSON 标量.
 *
 * 只收字符串 / 数字 / 布尔:它们能原样显示在列表行里,也够表达颜色、权重这类
 * 结构属性.数组 / 对象留白(现在没有结构需要嵌套属性);`null` 不收 -- JSON 里
 * 省略字段与本字段为 null 应当是同一种意思,解析器直接拒绝,避免两种"没有".
 */
export type SceneAttribute = string | number | boolean;

/** 一个节点:key 是数据键(引用 / 排序 / 展示都用它),attrs 是结构特有属性 */
export interface SceneDocumentNode {
    /** 数据键:同一文档内唯一;pointer / edge 都按它引用节点 */
    readonly key: SceneNodeKey;
    /** 结构特有属性(例如红黑树的 `color`);列表行与节点样式都从这里读 */
    readonly attrs: Readonly<Record<string, SceneAttribute>>;
}

/** 一条有向指针:`from -> to`,两端都是 nodes[].key */
export interface SceneDocumentPointer {
    readonly from: SceneNodeKey;
    readonly to: SceneNodeKey;
}

/** 一条无向边:两端都是 nodes[].key,attrs 是边的结构属性 */
export interface SceneDocumentEdge {
    readonly a: SceneNodeKey;
    readonly b: SceneNodeKey;
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
