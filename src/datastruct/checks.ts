/*
 * 内置性质检查集的注册入口.
 *
 * 每种结构把自己的检查放在 `datastruct/<结构>/<结构>_checks.ts` 里,本模块只做一次
 * "检查 id -> 检查函数"的登记.查看器 import 本模块一次,登记随之完成(ES 模块只执行
 * 一次);「检查配置」窗口按函数名挑检查,`runSceneChecks` 按配置数组顺序运行.
 *
 * 新增一种结构时按两步走:
 * 1. 写检查模块,导出 `XXX_CHECKS`(每项 `{ id, run }`,id 就是函数名);
 * 2. 在本文件加一行 `registerSceneChecks(XXX_CHECKS)`;帮助窗口里补上可填的名字.
 *
 * 没登记的函数名不是错误:已有检查照跑,诊断窗口会提示"未找到"的名字.
 */

import { registerSceneChecks } from '@/scene/scene_check';
import { GRAPH_CHECKS } from '@/datastruct/graph/graph_checks';
import { HEAP_CHECKS } from '@/datastruct/heap/heap_checks';
import { LIST_CHECKS } from '@/datastruct/list/list_checks';
import { RBT_CHECKS } from '@/datastruct/rbt/rbt_checks';

// 登记顺序 = 帮助窗口里的函数名顺序(检查本身按配置数组顺序运行)
registerSceneChecks(RBT_CHECKS);
registerSceneChecks(GRAPH_CHECKS);
registerSceneChecks(HEAP_CHECKS);
registerSceneChecks(LIST_CHECKS);

export {
    registerSceneChecks,
    registeredCheckIds,
    runSceneChecks,
} from '@/scene/scene_check';
export type {
    SceneCheckDefinition,
    SceneCheckFunction,
    SceneCheckResult,
    SceneCheckRun,
} from '@/scene/scene_check';
