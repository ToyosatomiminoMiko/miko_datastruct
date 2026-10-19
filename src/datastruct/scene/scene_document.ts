/*
 * 中性场景文档:web 与 Python 两侧共享的那份 JSON 数据的**类型定义**.
 *
 * 它不是某一种数据结构,而是"一种结构画出来是什么样"的中性描述:
 *
 * - `nodes`    平面上的节点(业务 key / 展示文字 / 结构特有属性);
 * - `pointers` 有向指针(树里就是父 -> 子);
 * - `edges`    无向边(图里的一条边);
 * - `checks`   结构检查结论(名字 / 过没过 / 说明 / 定位到哪个节点).
 *
 * 字段形状与 python/README.md 的 Scene 输出契约保持一致,只多一个 `checks`:
 * Python 的 `Scene` 目前由 `JsonBackend` 单独输出,`checks` 由 `Diagram` 带着;
 * web 需要的是一份**完整输入**(图 + 检查),所以输入契约把两者放在同一份 JSON 里.
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
    /** 节点编号(整数,同一文档内唯一;pointer / edge / check 都按它引用节点) */
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

/**
 * 一条结构检查结论.
 *
 * `node` 是"这条结论指向哪个节点"(nodes[].key):FAIL 时行末的「定位」按它把
 * 视口移到违规节点;没有具体节点就是 null(例如"整张图不存在欧拉回路"这种结论).
 *
 * `detail` 是**行内可见**的一句话(折叠态就能读到);`details` 是展开后才看的
 * 补充行(推导 / 两侧数值之类).两者分开是为了"一眼看到结论,细节按需展开" --
 * 与 graphcalc 求值行的摘要 / 折叠细节同一条口径.
 */
export interface SceneDocumentCheck {
    /** 检查名(给人看的中文名;稳定 id 不进展示层) */
    readonly name: string;
    readonly passed: boolean;
    /** 行内一句话说明;PASS 时通常为空串 */
    readonly detail: string;
    /** 展开后的补充行,可以为空数组 */
    readonly details: readonly string[];
    /** 结论指向的节点 key;没有具体节点为 null */
    readonly node: number | null;
}

/** 一份完整的中性场景文档:一个结构 = 节点 + 连接 + 检查结论 */
export interface SceneDocument {
    readonly nodes: readonly SceneDocumentNode[];
    readonly pointers: readonly SceneDocumentPointer[];
    readonly edges: readonly SceneDocumentEdge[];
    readonly checks: readonly SceneDocumentCheck[];
}

/** 空文档:既没有图元也没有检查(UI 用它表示"这一轮没有内容") */
export const EMPTY_SCENE_DOCUMENT: SceneDocument = {
    nodes: [],
    pointers: [],
    edges: [],
    checks: [],
};
