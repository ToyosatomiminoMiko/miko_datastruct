/**
 * 检查注册表(纯逻辑,node 环境)的契约.
 *
 * 钉的是"检查配置给一段函数名数组 -> 按 id 运行"这条链路:按配置顺序跑、重复 id 只跑
 * 一次、没登记的 id 原样报出、同名重复登记后者覆盖前者(本地 HMR 会重载模块).
 */
import { describe, expect, it } from 'vitest';

import type { SceneDocument } from '@/datastruct/scene/scene_document';
import {
    registerSceneChecks,
    registeredCheckIds,
    runSceneChecks,
    type SceneCheckDefinition,
    type SceneCheckResult,
} from '@/datastruct/scene/scene_check';

const DOCUMENT: SceneDocument = {
    nodes: [{ key: 0, label: 'A', attrs: {} }],
    pointers: [],
    edges: [],
};

/** 一条测试检查:结论名就用 id,方便断言顺序 */
function definition(id: string): SceneCheckDefinition {
    return {
        id,
        run: (): SceneCheckResult => ({ name: id, passed: true, detail: '', details: [], node: null }),
    };
}

describe('场景性质检查:注册表', () => {
    it('按配置数组的顺序运行登记过的 id', () => {
        registerSceneChecks([definition('checkFirst'), definition('checkSecond')]);

        const run = runSceneChecks(DOCUMENT, ['checkSecond', 'checkFirst']);

        expect(run.appliedIds).toEqual(['checkSecond', 'checkFirst']);
        expect(run.checks.map((check) => check.name)).toEqual(['checkSecond', 'checkFirst']);
        expect(run.unknownIds).toEqual([]);
        expect(registeredCheckIds()).toEqual(expect.arrayContaining(['checkFirst', 'checkSecond']));
    });

    it('空配置 = 没有检查,不是错误', () => {
        const run = runSceneChecks(DOCUMENT, []);
        expect(run.checks).toEqual([]);
        expect(run.appliedIds).toEqual([]);
        expect(run.unknownIds).toEqual([]);
    });

    it('配置里重复的 id 只跑一次(顺序取第一次出现的位置)', () => {
        registerSceneChecks([definition('checkOnce')]);
        const run = runSceneChecks(DOCUMENT, ['checkOnce', 'checkOnce']);
        expect(run.appliedIds).toEqual(['checkOnce']);
        expect(run.checks).toHaveLength(1);
    });

    it('没登记的 id 不运行,但原样交回给诊断窗口提示', () => {
        const run = runSceneChecks(DOCUMENT, ['checkMissing', 'checkMissing']);
        expect(run.checks).toEqual([]);
        expect(run.unknownIds).toEqual(['checkMissing']);
    });

    it('同名重复登记后者覆盖前者:旧函数不再跑', () => {
        registerSceneChecks([definition('checkOverride')]);
        expect(runSceneChecks(DOCUMENT, ['checkOverride']).checks.map((check) => check.name))
            .toEqual(['checkOverride']);

        registerSceneChecks([{
            id: 'checkOverride',
            run: () => ({ name: '新结论', passed: false, detail: '', details: [], node: null }),
        }]);
        const run = runSceneChecks(DOCUMENT, ['checkOverride']);
        expect(run.checks.map((check) => check.name)).toEqual(['新结论']);
        expect(run.checks[0]?.passed).toBe(false);
    });

    it('检查 id 不能是空白', () => {
        expect(() => registerSceneChecks([{ id: '  ', run: definition('x').run }])).toThrow();
    });
});
