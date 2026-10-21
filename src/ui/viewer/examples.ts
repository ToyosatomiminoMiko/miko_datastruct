/*
 * 内置示例结构:一份中性场景 JSON + 这套结构建议的检查函数名.
 *
 * 为什么放在「示例」里,而不是写死进 JSON:JSON 只描述结构,检查配置是另一份输入
 * (见 check_config.ts).一个示例要能直接看,就得同时给出"结构长什么样"和"这类结构
 * 该满足哪些性质";两者在示例里配对,载入时一起写进两个编辑器.
 *
 * 这里只放数据与分组,不建 DOM、不注册检查:检查 id 是否真的登记过由
 * `datastruct/checks.ts` 负责,`examples.test.ts` 会逐个校验.
 *
 * 新增一种结构:在 VIEWER_EXAMPLES 里加一条(JSON + 建议的检查 id),菜单自动多一项.
 */

import type { MenuGroup } from 'miko_ui';

/** 一份内置示例 */
export interface ViewerExample {
    /** 菜单项的载荷(选中后回调拿到它) */
    readonly id: string;
    /** 菜单里显示的名字 */
    readonly title: string;
    /** 菜单项右侧的弱色注记(结构 id,和 Python 侧的例子同名) */
    readonly hint: string;
    /** 菜单分组标题 */
    readonly group: string;
    /** 中性场景 JSON(编辑器里显示的那段文本) */
    readonly json: string;
    /** 载入这份示例时同时写进「检查配置」窗口的检查函数名 */
    readonly checkIds: readonly string[];
}

/** 示例 JSON 里节点 / 指针 / 边的形状(只用于在这里写数据,不做校验) */
interface ExampleNode {
    /** 数据键:节点的显示文字、指针引用、有序检查都用它(number 树 / string 命名节点) */
    readonly key: number | string;
    readonly attrs?: Readonly<Record<string, string | number | boolean>>;
}

interface ExamplePointer {
    readonly from: number | string;
    readonly to: number | string;
}

interface ExampleEdge {
    readonly a: number | string;
    readonly b: number | string;
}

/** 节点 / 指针 / 边 -> 编辑器里的那段 JSON 文本(缩进与检查配置窗口一致) */
function scene(
    nodes: readonly ExampleNode[],
    pointers: readonly ExamplePointer[] = [],
    edges: readonly ExampleEdge[] = [],
): string {
    return JSON.stringify({ nodes, pointers, edges }, null, 2);
}

/**
 * 内置示例清单:数组顺序 = 任务栏里「示例」菜单的分组 / 项顺序,第一条是首屏默认.
 *
 * 覆盖现有图元能画的三类形态:树(3 种)、线性链、无向图.数组 / 内存块这类需要
 * 新图元的结构不在其中(视觉层还没有 block).
 */
export const VIEWER_EXAMPLES: readonly ViewerExample[] = [
    {
        id: 'rbt',
        title: '红黑树(含一处错误)',
        hint: 'rbt',
        group: '树',
        // 一棵故意写错黑高的 5 节点红黑树:首屏要同时看到 PASS / FAIL、折叠详情与「定位」
        json: scene(
            [
                { key: 10, attrs: { color: 'black' } },
                { key: 5, attrs: { color: 'red' } },
                { key: 1, attrs: { color: 'black' } },
                { key: 8, attrs: { color: 'black' } },
                { key: 15, attrs: { color: 'red' } },
            ],
            [
                { from: 10, to: 5 },
                { from: 5, to: 1 },
                { from: 5, to: 8 },
                { from: 10, to: 15 },
            ],
        ),
        checkIds: ['checkColors', 'checkRootBlack', 'checkRedChildrenBlack', 'checkBlackHeight', 'checkBstOrder'],
    },
    {
        id: 'bst',
        title: '二叉搜索树',
        hint: 'bst',
        group: '树',
        json: scene(
            [
                { key: 8 },
                { key: 4 },
                { key: 12 },
                { key: 2 },
                { key: 6 },
                { key: 10 },
                { key: 14 },
            ],
            [
                { from: 8, to: 4 },
                { from: 8, to: 12 },
                { from: 4, to: 2 },
                { from: 4, to: 6 },
                { from: 12, to: 10 },
                { from: 12, to: 14 },
            ],
        ),
        checkIds: ['checkBstOrder'],
    },
    {
        id: 'heap',
        title: '最小堆',
        hint: 'heap',
        group: '树',
        json: scene(
            [
                { key: 1 },
                { key: 3 },
                { key: 2 },
                { key: 7 },
                { key: 4 },
                { key: 5 },
                { key: 8 },
            ],
            [
                { from: 1, to: 3 },
                { from: 1, to: 2 },
                { from: 3, to: 7 },
                { from: 3, to: 4 },
                { from: 2, to: 5 },
                { from: 2, to: 8 },
            ],
        ),
        checkIds: ['checkHeapOrder'],
    },
    {
        id: 'list',
        title: '单链表(升序)',
        hint: 'list',
        group: '线性结构',
        json: scene(
            [
                { key: 1 },
                { key: 2 },
                { key: 3 },
                { key: 4 },
                { key: 5 },
            ],
            [
                { from: 1, to: 2 },
                { from: 2, to: 3 },
                { from: 3, to: 4 },
                { from: 4, to: 5 },
            ],
        ),
        checkIds: ['checkLinkedList', 'checkListSorted'],
    },
    {
        id: 'graph',
        title: '柯尼斯堡七桥',
        hint: 'graph',
        group: '图',
        // 4 块陆地 + 7 座无向桥;K-N、K-S 各两座,多重边就是两条独立的 edges 项
        json: scene(
            [
                { key: 'K' },
                { key: 'N' },
                { key: 'S' },
                { key: 'E' },
            ],
            [],
            [
                { a: 'K', b: 'N' },
                { a: 'K', b: 'N' },
                { a: 'K', b: 'S' },
                { a: 'K', b: 'S' },
                { a: 'K', b: 'E' },
                { a: 'N', b: 'E' },
                { a: 'S', b: 'E' },
            ],
        ),
        checkIds: ['checkEulerCircuit'],
    },
];

/** 首屏默认示例(= 清单第一条);第一项不存在属于清单写空,直接抛错而不是给 undefined */
export const DEFAULT_VIEWER_EXAMPLE: ViewerExample = VIEWER_EXAMPLES[0] as ViewerExample;

/** 按 id 取示例;示例菜单只可能给出清单里出现过的 id,取不到说明配置和菜单不同步 */
export function findViewerExample(id: string): ViewerExample | undefined {
    return VIEWER_EXAMPLES.find((example) => example.id === id);
}

/**
 * 示例清单 -> 库的菜单分组数据:分组按 group 首次出现的顺序,组内保持清单顺序.
 *
 * 菜单项载荷是示例 id(选中回调与 `setActive` 都用它);右侧注记是结构 id,
 * 中文标题在左、英文 id 在右,是"这是哪种结构"的对照.
 */
export function viewerExampleMenuGroups(): readonly MenuGroup<string>[] {
    const groups: { title: string; entries: { value: string; text: string; hint: string }[] }[] = [];
    for (const example of VIEWER_EXAMPLES) {
        let group = groups.find((candidate) => candidate.title === example.group);
        if (group === undefined) {
            group = { title: example.group, entries: [] };
            groups.push(group);
        }
        group.entries.push({ value: example.id, text: example.title, hint: example.hint });
    }
    return groups;
}
