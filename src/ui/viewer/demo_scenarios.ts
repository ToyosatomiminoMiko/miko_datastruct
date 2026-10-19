/*
 * 内置演示剧本(纯数据 + 组装):每个剧本 = 初始结构 + 操作序列 + 检查 id + 章节.
 *
 * 这里不做算法、不建 DOM:结构变更由 datastruct/bst 与 datastruct/rbt 的 generator
 * 产出 `TraceFrame`,本文件只按脚本顺序拼章、决定"哪一章换树"(`cut`).
 *
 * 剧本覆盖(docs/animation.md §7、§8.3):
 * - BST 原理:形状 / 查找命中 / 查找失败 / 插入 / 删除三情形 / 遍历;
 * - BST 旋转:认轴 -> 左旋 -> 中序验证 -> 右旋复原;之字形单旋镜像 / 双旋降层;
 * - BST 退化:空树升序插入 1..7,长成一条链(接红黑树的钩子);
 * - RBT 插入:入门(情形 3)/ 生根(情形 1 + 根染黑)/ 综合(情形 1/2/3 全出现);
 * - RBT 删除:物理移植 + 双黑四情形.
 *
 * 同一条剧本里换一棵完全无关的树时,新结构的第一帧标 `cut: true`:播放器直接硬切,
 * 不会把上一棵树的节点插值到新树的位置上(见 datastruct/trace/trace.ts).
 */

import type { MenuGroup } from 'miko_ui';
import {
    deleteFrames,
    insertFrames,
    rotateFrames,
    searchFrames,
    shapeFrames,
    traverseFrames,
    TreeModel,
} from '@/datastruct/bst/bst';
import { rbtDeleteFrames, rbtInsertFrames, rbtPropertiesFrames } from '@/datastruct/rbt/rbt_ops';
import {
    TraceBuilder,
    type SceneTrace,
    type TraceFrame,
} from '@/datastruct/trace/trace';

/** RBT 的五条性质检查 id(与「检查配置」窗口 / 帮助窗口同一套函数名) */
export const RBT_CHECK_IDS = [
    'checkColors',
    'checkRootBlack',
    'checkRedChildrenBlack',
    'checkBlackHeight',
    'checkBstOrder',
] as const;

/** BST 只跑有序性检查 */
export const BST_CHECK_IDS = ['checkBstOrder'] as const;

/** 一份演示剧本 */
export interface DemoScenario {
    readonly id: string;
    readonly title: string;
    /** 菜单右侧弱色注记(简短英文 id) */
    readonly hint: string;
    /** 菜单分组 */
    readonly group: string;
    /** 剧本一句话说明(退出 / 菜单标题用) */
    readonly description: string;
    /** 进入演示时写进「检查配置」窗口的检查 id */
    readonly checkIds: readonly string[];
    /** 生成整条轨迹(每次进入现算;小树毫秒级) */
    readonly build: () => SceneTrace;
}

/** 新结构的第一帧标 cut:章节硬切,不做帧间插值 */
function* cutFirst(frames: Iterable<TraceFrame>): Generator<TraceFrame> {
    let first = true;
    for (const frame of frames) {
        yield first ? { ...frame, cut: true } : frame;
        first = false;
    }
}

/** 安静地跑完一个 generator(只为了让树变成目标结构,不记录帧) */
function exhaust(frames: Iterable<TraceFrame>): void {
    for (const _frame of frames) {
        // 不记录:只推进生成器里的结构改动
    }
}

// BST:原理(查找 / 插入 / 删除三情形 / 遍历)

function buildBstBasics(): SceneTrace {
    const tree = new TreeModel().build([8, 4, 12, 2, 6, 10, 14]);
    const builder = new TraceBuilder('BST · 查找 / 插入 / 删除', BST_CHECK_IDS, () => tree.snapshot());

    builder.chapter('形状与不变量', shapeFrames(tree));
    builder.chapter('查找命中 6', searchFrames(tree, 6));
    builder.chapter('查找失败 5', searchFrames(tree, 5));
    builder.chapter('插入 5', insertFrames(tree, 5));
    builder.chapter('删除·叶子 2', deleteFrames(tree, 2));
    builder.chapter('删除·单孩子 4', deleteFrames(tree, 4));
    builder.chapter('删除·双孩子 12', deleteFrames(tree, 12));
    builder.chapter('中序遍历', traverseFrames(tree, 'in'));

    return builder.finish();
}

// BST:旋转(第 9 章)

function buildBstRotate(): SceneTrace {
    const tree = new TreeModel().build([10, 5, 20, 15, 30, 40]);
    const builder = new TraceBuilder('BST · 旋转', BST_CHECK_IDS, () => tree.snapshot());

    builder.chapter('认出旋转轴', shapeFrames(tree));
    builder.chapter('左旋 10(层数 4 -> 3)', rotateFrames(tree, 'left', 10));
    builder.chapter('右旋 20(复原)', rotateFrames(tree, 'right', 20));

    // 之字形单旋:只镜像,层数不变
    tree.clear();
    tree.build([30, 10, 20]);
    builder.chapter('之字形:单旋只镜像', cutFirst(shapeFrames(tree)));
    builder.chapter('之字形:右旋 30', rotateFrames(tree, 'right', 30));

    // 之字形双旋:左旋 10 -> 右旋 30,层数 3 -> 2
    tree.clear();
    tree.build([30, 10, 20]);
    builder.chapter('之字形:复位', cutFirst(shapeFrames(tree)));
    builder.chapter('之字形:双旋第一下(左旋 10)', rotateFrames(tree, 'left', 10));
    builder.chapter('之字形:双旋第二下(右旋 30)', rotateFrames(tree, 'right', 30));

    return builder.finish();
}

// BST:退化(接红黑树的钩子)

function buildBstDegenerate(): SceneTrace {
    const tree = new TreeModel();
    const builder = new TraceBuilder('BST · 退化', BST_CHECK_IDS, () => tree.snapshot());

    const frames: TraceFrame[] = [];
    for (let value = 1; value <= 7; value += 1) {
        for (const frame of insertFrames(tree, value, { fitCamera: true })) frames.push(frame);
    }
    builder.chapter('升序插入 1..7', frames);
    builder.chapter('链的长度', shapeFrames(tree));
    builder.chapter('BST 自己不会用旋转', (function* () {
        yield {
            title: 'BST 自己不会用旋转',
            detail: '同一组升序插入长成一条链;要有人替它决定何时转、转几次 —— 这就是红黑树',
            frame: tree.inOrder().map((node) => node.key),
            framing: 'fit' as const,
            marks: { nodes: tree.inOrder().map((node) => ({ key: node.key, state: 'visited' as const })) },
        };
    })());

    return builder.finish();
}

// RBT:插入

function buildRbtInsertIntro(): SceneTrace {
    const tree = new TreeModel();
    const builder = new TraceBuilder('RBT · 插入(入门)', RBT_CHECK_IDS, () => tree.snapshot({ colors: true }));

    builder.chapter('插入 10', rbtInsertFrames(tree, 10));
    builder.chapter('插入 20', rbtInsertFrames(tree, 20));
    builder.chapter('插入 30(情形 3:左旋)', rbtInsertFrames(tree, 30));
    builder.chapter('五条性质', rbtPropertiesFrames(tree));

    return builder.finish();
}

function buildRbtInsertRoot(): SceneTrace {
    const tree = new TreeModel();
    const builder = new TraceBuilder('RBT · 生根与情形 1', RBT_CHECK_IDS, () => tree.snapshot({ colors: true }));

    for (const value of [10, 5, 15]) {
        builder.chapter(`插入 ${value}`, rbtInsertFrames(tree, value));
    }
    builder.chapter('插入 1(叔叔红 -> 根染黑)', rbtInsertFrames(tree, 1));
    builder.chapter('五条性质', rbtPropertiesFrames(tree));

    return builder.finish();
}

/** 综合插入序列:已核对覆盖情形 1 / 2 / 3(docs/animation.md §8.3) */
const RBT_INSERT_SEQUENCE = [7, 3, 18, 10, 22, 8, 11, 26, 2, 6, 13] as const;

function buildRbtInsertFull(): SceneTrace {
    const tree = new TreeModel();
    const builder = new TraceBuilder('RBT · 插入(综合)', RBT_CHECK_IDS, () => tree.snapshot({ colors: true }));

    for (const value of RBT_INSERT_SEQUENCE) {
        builder.chapter(`插入 ${value}`, rbtInsertFrames(tree, value));
    }
    builder.chapter('五条性质', rbtPropertiesFrames(tree));

    return builder.finish();
}

// RBT:删除

function buildRbtDelete(): SceneTrace {
    const tree = new TreeModel();
    // 先安静地建一棵合法的红黑树(不记录插入过程,删除才是这一章的主角)
    for (const value of RBT_INSERT_SEQUENCE) exhaust(rbtInsertFrames(tree, value));

    const builder = new TraceBuilder('RBT · 删除', RBT_CHECK_IDS, () => tree.snapshot({ colors: true }));
    builder.chapter('起点', rbtPropertiesFrames(tree));
    // 这组删除序覆盖双黑修复的四个情形(教程里最难的四种;删完仍留一棵合法红黑树)
    for (const value of [26, 22, 18, 13, 11]) {
        builder.chapter(`删除 ${value}`, rbtDeleteFrames(tree, value));
    }
    builder.chapter('删除后仍然平衡', rbtPropertiesFrames(tree));

    return builder.finish();
}

/** 内置剧本清单:数组顺序 = 「演示」菜单的分组 / 项顺序 */
export const DEMO_SCENARIOS: readonly DemoScenario[] = [
    {
        id: 'bst-basics',
        title: 'BST · 查找 / 插入 / 删除',
        hint: 'bst',
        group: '二叉搜索树',
        description: '从一棵 7 节点 BST 出发,逐步演示查找、插入与删除的三种情形,最后中序遍历。',
        checkIds: BST_CHECK_IDS,
        build: buildBstBasics,
    },
    {
        id: 'bst-rotate',
        title: 'BST · 旋转',
        hint: 'rotate',
        group: '二叉搜索树',
        description: '不改变中序、只改变形状的局部手术:认轴、左旋、验证中序,以及之字形的单旋 / 双旋。',
        checkIds: BST_CHECK_IDS,
        build: buildBstRotate,
    },
    {
        id: 'bst-degenerate',
        title: 'BST · 退化',
        hint: 'degenerate',
        group: '二叉搜索树',
        description: '同一组升序插入,在 BST 上退化成一条链;下一段用同样的序列看红黑树如何保持高度。',
        checkIds: BST_CHECK_IDS,
        build: buildBstDegenerate,
    },
    {
        id: 'rbt-insert-intro',
        title: 'RBT · 插入(入门)',
        hint: 'rbt',
        group: '红黑树',
        description: '空树依次插入 10 / 20 / 30:只可能违反红孩子,情形 3 一次左旋解决。',
        checkIds: RBT_CHECK_IDS,
        build: buildRbtInsertIntro,
    },
    {
        id: 'rbt-insert-root',
        title: 'RBT · 生根与情形 1',
        hint: 'rbt',
        group: '红黑树',
        description: '叔叔是红色时只染色、把祖父当作新的当前节点;祖父是根时最后根染黑。',
        checkIds: RBT_CHECK_IDS,
        build: buildRbtInsertRoot,
    },
    {
        id: 'rbt-insert-full',
        title: 'RBT · 插入(综合)',
        hint: 'rbt',
        group: '红黑树',
        description: '11 个值的插入序列覆盖情形 1 / 2 / 3,包含"先旋转成外侧再接情形 3"的双旋路径。',
        checkIds: RBT_CHECK_IDS,
        build: buildRbtInsertFull,
    },
    {
        id: 'rbt-delete',
        title: 'RBT · 删除',
        hint: 'delete',
        group: '红黑树',
        description: '物理移植后继;被删的是黑色就出现双黑,四情形修复到黑高重新相等。',
        checkIds: RBT_CHECK_IDS,
        build: buildRbtDelete,
    },
];

/** 剧本菜单的分组数据(与示例菜单同形) */
export function demoScenarioMenuGroups(): readonly MenuGroup<string>[] {
    const groups: { title: string; entries: { value: string; text: string; hint: string }[] }[] = [];
    for (const scenario of DEMO_SCENARIOS) {
        let group = groups.find((candidate) => candidate.title === scenario.group);
        if (group === undefined) {
            group = { title: scenario.group, entries: [] };
            groups.push(group);
        }
        group.entries.push({ value: scenario.id, text: scenario.title, hint: scenario.hint });
    }
    return groups;
}

/** 按 id 取剧本;取不到说明菜单和清单不同步 */
export function findDemoScenario(id: string): DemoScenario | undefined {
    return DEMO_SCENARIOS.find((scenario) => scenario.id === id);
}
