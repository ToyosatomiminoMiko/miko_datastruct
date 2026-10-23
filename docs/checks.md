# 性质检查实现速查

检查窗口里每一行"结论"是谁算的、代码在哪、判据是什么。业务背景见根 `README.md`。

## 一次运行链路

| 步骤 | 位置 |
| --- | --- |
| `RUN` / `Ctrl+Enter` 触发 | `src/ui/viewer/viewer.ts` → `mountViewer` 内的 `run()` |
| 检查配置变化(不重新解析 JSON) | 同文件 → `applyCheckConfig()` |
| 检查配置 JSON -> 函数名数组 | `src/ui/viewer/check_config.ts` → `parseCheckConfig()` |
| id -> 检查函数 | `src/scene/scene_check.ts` → `runSceneChecks()` |
| 内置检查集登记 | `src/datastruct/checks.ts` → `registerSceneChecks(...)` |
| 一条结论 -> 一行 | `src/ui/viewer/viewer_items.ts` → `CheckItem` |
| 检查窗口抬头 `n 条中 m 条 FAIL` | `src/ui/viewer/viewer_format.ts` → `formatCheckSummary()` |
| 示例配套的检查 id | `src/ui/viewer/examples.ts` → `VIEWER_EXAMPLES[].checkIds` |

## 检查表

"显示名"是检查窗口里的行名；"配置 id"是「检查配置」数组里要填的函数名。

| 显示名 | 配置 id | 实现 | 判据 |
| --- | --- | --- | --- |
| 节点颜色合法 | `checkColors` | `src/datastruct/rbt/rbt_checks.ts` → `checkColors` | 每个节点的 `attrs.color` 必须是 `red` / `black`(大小写不敏感)；缺失或其它值 FAIL |
| 根节点为黑色 | `checkRootBlack` | `src/datastruct/rbt/rbt_checks.ts` → `checkRootBlack` | 入度为 0 的节点必须唯一且颜色为黑；无根 / 多根 / 根为红 / 根无颜色都 FAIL |
| 红色节点的孩子都是黑色 | `checkRedChildrenBlack` | `src/datastruct/rbt/rbt_checks.ts` → `checkRedChildrenBlack` | 扫全部节点：红节点的任意孩子不能是红(只扫可达节点会漏掉坏结构) |
| 各路径黑色节点数量相同 | `checkBlackHeight` | `src/datastruct/rbt/rbt_checks.ts` → `checkBlackHeight` | 从唯一根递归：同一节点的各孩子黑高必须相等；nil 叶子算 1,节点自身为黑再 +1；顺带报环 / 共享孩子 / 从根不可达 |
| 二叉搜索树有序 | `checkBstOrder` | `src/datastruct/rbt/rbt_checks.ts` → `checkBstOrder` | 开区间递归：左子树全 `<` 节点、右子树全 `>` 节点，比较的是节点的 number 类型 `key`；相等算违规；单孩子按 `key` 与父节点比较定左右(小左大右)，与布局同一口径；>2 孩子 FAIL；`key` 不是 number 直接 FAIL |
| 存在欧拉回路 | `checkEulerCircuit` | `src/datastruct/graph/graph_checks.ts` → `checkEulerCircuit` | 所有节点度数为偶 + 所有带边的节点在同一连通分量；孤立节点不参与连通性 |
| 最小堆序成立 | `checkHeapOrder` | `src/datastruct/heap/heap_checks.ts` → `checkHeapOrder` | 每条 `pointers` 上父节点的 `key` `<=` 孩子节点的 `key`(都按 number 比较)；`key` 不是 number 直接 FAIL |
| 单链表结构合法 | `checkLinkedList` | `src/datastruct/list/list_checks.ts` → `checkLinkedList` | 只允许 `pointers`；唯一表头、每节点至多 1 父 1 子、从表头可达全部节点；出现 `edges` / 环 / 分叉 / 合流 / 不可达都 FAIL |
| 单链表节点值严格递增 | `checkListSorted` | `src/datastruct/list/list_checks.ts` → `checkListSorted` | 沿表头读出节点的 `key`，必须严格递增(相等算违规)；`key` 不是 number FAIL |

## 共用实现

| 函数 / 常量 | 位置 | 用途 |
| --- | --- | --- |
| `buildTreeIndex()` | `src/datastruct/rbt/rbt_checks.ts` | 节点表 / 出边表 / 根列表；出边顺序 = `pointers` 数组顺序 = 左右顺序 |
| `colorOf()` | `src/datastruct/rbt/rbt_checks.ts` | `attrs.color` -> `red` / `black` / null |
| `readList()` | `src/datastruct/list/list_checks.ts` | 单链表结构校验 + 从表头读出节点顺序；两条链表检查共用 |
| `pass()` / `fail()` | 各 `*_checks.ts` | 构造 `SceneCheckResult`；`fail` 的 `node` 决定 FAIL 行末「定位」是否出现 |

有序类检查( `checkBstOrder` / `checkHeapOrder` / `checkListSorted` )**直接比较 `nodes[].key`**：
只有 number 类型的 key 参与数值比较，字符串 key 直接 FAIL「不是数字」，不静默跳过。各
`*_checks.ts` 里只有一个很小的 `numericKeyOf()` 本地助手做类型收窄，不再有跨结构共用的
`label -> 数值` 解析层。

## `SceneCheckResult` 字段

定义在 `src/scene/scene_check.ts`。

| 字段 | 去处 |
| --- | --- |
| `name` | 检查窗口行名(给人看的中文名) |
| `passed` | PASS / FAIL 徽章 |
| `detail` | 折叠态第二行的一句话 |
| `details` | `<details>` 展开后的补充行 |
| `node` | FAIL 行「定位」的目标节点 key；`null` = 不显示定位 |

## 新增一条检查

1. 在 `src/datastruct/<结构>/<结构>_checks.ts` 写函数并导出 `XXX_CHECKS: readonly SceneCheckDefinition[]`，`id` 显式写成函数名(稳定，不用 `Function.name`)；
2. 在 `src/datastruct/checks.ts` 加一行 `registerSceneChecks(XXX_CHECKS)`；
3. 若要出现在示例里：把 id 加进 `src/ui/viewer/examples.ts` 对应示例的 `checkIds`；
4. 测试放在同目录 `xxx_checks.test.ts`，纯逻辑、node 环境、直接吃 `readSceneDocument()` 的产物。

## 约束与坑

- 检查函数是纯函数：只吃 `SceneDocument`，不碰 DOM、不读全局；同一文档 + 同一 id 列表结果固定。
- JSON 里没有检查结论；检查 id 是配置词，不是数据字段。
- **节点身份就是 `nodes[].key`**：它同时是数据键、引用标识和显示文字（`String(key)`），
  没有 `label`，也没有文档内编号。
- **有序性 / 堆序检查直接比较 `key`**：只有 number 类型的 key 可比；字符串 key 直接
  FAIL「不是数字」，读不出数值时不静默跳过（跳过会得到一条空真的 PASS）。
- `pointers` 数组顺序承载左右语义；中性文档没有 `left` / `right` 字段名。只剩一个
  孩子时顺序没有左右信息，按 `key` 与父节点比较定(小左大右)——堆这类左右由数组
  下标决定的结构不能套用，需要自己的检查 / 布局。
- 检查之间不短路：一次列全问题，不在第一条 FAIL 处停。
