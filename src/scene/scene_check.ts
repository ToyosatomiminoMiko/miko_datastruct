/*
 * 场景性质检查的注册表:按函数名登记检查,按「检查配置」窗口里填的 id 列表运行.
 *
 * 为什么检查不在 JSON 里:JSON 只描述"结构是什么";"这类结构该满足哪些性质"是
 * 检查器自己的知识.把结论写进 JSON 等于让生产数据的一方手写检查,既重复,也挡不住
 * 一个错误的检查结论冒充事实.现在由查看器在载入后按用户给的函数名现算:
 *
 * - 注册:每种结构一个检查集模块(见 datastruct/rbt/rbt_checks.ts),由
 *   datastruct/checks.ts 在模块加载时登记进本表;
 * - 选择:查看器的「检查配置」窗口是一段 JSON 数组,元素就是这里登记的检查 id;
 * - 运行:查看器解析配置后把 id 列表交给 `runSceneChecks`,逐条跑,结果进检查窗口.
 *
 * 每条检查有两个名字,不要混:
 * - `id`:稳定的函数名(如 `checkRootBlack`),给配置窗口填写 / 诊断用,不翻译;
 * - 结论里的 `name`:给人看的中文名(如 `根节点为黑色`),只进检查窗口.
 *
 * 检查函数是纯函数:吃解析好的 SceneDocument,交回一条结论;不碰 DOM、不读全局.
 * 同一份文档 + 同一个 id 列表永远得到同一组结论(顺序 = 配置数组顺序).
 */

import type { SceneDocument, SceneNodeKey } from '@/scene/scene_document';

/**
 * 一条结构检查结论(不是 JSON 字段).
 *
 * `node` 是"这条结论指向哪个节点"(nodes[].key):FAIL 时行末的「定位」按它把
 * 视口移到违规节点;没有具体节点就是 null(例如"整张图不存在欧拉回路"这种结论).
 *
 * `detail` 是**行内可见**的一句话(折叠态就能读到);`details` 是展开后才看的
 * 补充行(推导 / 两侧数值之类).两者分开是为了"一眼看到结论,细节按需展开" --
 * 与 graphcalc 求值行的摘要 / 折叠细节同一条口径.
 */
export interface SceneCheckResult {
    /** 检查名(给人看的中文名;稳定 id 不进展示层) */
    readonly name: string;
    readonly passed: boolean;
    /** 行内一句话说明;PASS 时通常为空串 */
    readonly detail: string;
    /** 展开后的补充行,可以为空数组 */
    readonly details: readonly string[];
    /** 结论指向的节点 key;没有具体节点为 null */
    readonly node: SceneNodeKey | null;
}

/** 一条检查:吃整份文档,交回一条结论 */
export type SceneCheckFunction = (document: SceneDocument) => SceneCheckResult;

/** 一条可注册的检查:id(函数名)+ 怎么跑 */
export interface SceneCheckDefinition {
    /**
     * 稳定 id,就是检查函数的函数名(如 `checkRootBlack`).
     *
     * 不依赖 `Function.name`:打包压缩会把函数名改掉,而配置窗口 / 诊断信息需要一个
     * 跨构建稳定的字符串,所以显式写在这里.
     */
    readonly id: string;
    readonly run: SceneCheckFunction;
}

/** 一次检查运行的结果:结论 + 本次实际跑的 / 没找到的 id */
export interface SceneCheckRun {
    readonly checks: readonly SceneCheckResult[];
    /** 本次实际运行的检查 id(去重后;顺序即发现顺序 = 配置数组顺序) */
    readonly appliedIds: readonly string[];
    /** 配置里写了、但没有注册的检查 id(按输入顺序去重) */
    readonly unknownIds: readonly string[];
}

/** id -> 检查.同名重复登记时后登记的覆盖先登记的(本地 HMR 重载不会炸) */
const checkIndex = new Map<string, SceneCheckDefinition>();

/** 登记一组检查;id 必须是稳定的非空字符串 */
export function registerSceneChecks(checks: readonly SceneCheckDefinition[]): void {
    for (const check of checks) {
        if (check.id.trim() === '') {
            throw new Error('检查 id 不能为空');
        }
        checkIndex.set(check.id, check);
    }
}

/** 当前登记的检查 id(按登记顺序;调试 / 测试 / 帮助文案可查) */
export function registeredCheckIds(): readonly string[] {
    return [...checkIndex.keys()];
}

/**
 * 按 id 列表运行检查.
 *
 * - 空列表 = 没有检查(检查窗口显示"无检查"),不是错误;
 * - 配置里重复的 id 只跑一次;
 * - 没登记的 id 不运行,但原样进 `unknownIds`,由诊断窗口提示.
 *
 * 不短路:全部跑完,检查窗口一次列全问题.
 */
export function runSceneChecks(
    document: SceneDocument,
    ids: readonly string[],
): SceneCheckRun {
    const applied: SceneCheckDefinition[] = [];
    const appliedIdSet = new Set<string>();
    const unknownIds: string[] = [];

    for (const id of ids) {
        const check = checkIndex.get(id);
        if (check === undefined) {
            if (!unknownIds.includes(id)) unknownIds.push(id);
            continue;
        }
        if (appliedIdSet.has(id)) continue;
        appliedIdSet.add(id);
        applied.push(check);
    }

    return {
        checks: applied.map((check) => check.run(document)),
        appliedIds: applied.map((check) => check.id),
        unknownIds,
    };
}
