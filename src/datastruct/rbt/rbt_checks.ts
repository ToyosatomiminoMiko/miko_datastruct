/*
 * 红黑树性质检查:登记为 `checkColors` / `checkRootBlack` 等函数名,由「检查配置」
 * 窗口按 id 选取后运行.
 *
 * 检查对象是**中性文档**,不是 Python 对象:手上只有节点(key / attrs)与有向
 * 指针.所以三条约定要先写清楚:
 *
 * - 颜色从 `attrs.color` 读(`red` / `black`,大小写不敏感);颜色写错本身就是一条
 *   FAIL,不能让"没有颜色"被当成"不是红色"而蒙混通过;
 * - 父子关系从 `pointers` 读:出边是孩子;左右顺序按 pointers 数组顺序(与树形布局
 *   同一口径:第一个孩子是左,第二个是右).只剩一个孩子时顺序说不清左右,按 key 与
 *   父节点比较定(小左大右,与布局同一条规则);堆这类左右由数组下标决定的结构不能
 *   靠 key 比较,需要它自己的检查 / 布局;
 * - 值从 `key` 读:树 / 堆 / 链的 key 就是参与比较的数值,有序检查要求它是 number;
 *   字符串 key(图里的命名节点)不参与数值比较,直接 FAIL 而不是静默跳过.
 *
 * 五条结论独立运行、不短路:检查窗口要一次把问题列全,而不是修一条看一次.
 */

import type { SceneDocument, SceneDocumentNode, SceneNodeKey } from '@/scene/scene_document';
import type { SceneCheckDefinition, SceneCheckFunction, SceneCheckResult } from '@/scene/scene_check';

type NodeColor = 'red' | 'black';

/** 一次检查要用的文档索引:节点表 / 出边(孩子)表 / 入度(找根) */
interface TreeIndex {
    readonly nodeByKey: ReadonlyMap<SceneNodeKey, SceneDocumentNode>;
    readonly childrenOf: ReadonlyMap<SceneNodeKey, readonly SceneNodeKey[]>;
    readonly roots: readonly SceneNodeKey[];
}

function buildTreeIndex(document: SceneDocument): TreeIndex {
    const nodeByKey = new Map<SceneNodeKey, SceneDocumentNode>(document.nodes.map((node) => [node.key, node] as const));
    const childrenOf = new Map<SceneNodeKey, SceneNodeKey[]>(document.nodes.map((node) => [node.key, []] as const));
    const incoming = new Map<SceneNodeKey, number>(document.nodes.map((node) => [node.key, 0] as const));

    for (const pointer of document.pointers) {
        childrenOf.get(pointer.from)?.push(pointer.to);
        const count = incoming.get(pointer.to);
        if (count !== undefined) incoming.set(pointer.to, count + 1);
    }

    const roots = document.nodes
        .filter((node) => (incoming.get(node.key) ?? 0) === 0)
        .map((node) => node.key);
    return { nodeByKey, childrenOf, roots };
}

function colorOf(node: SceneDocumentNode): NodeColor | null {
    const raw = node.attrs.color;
    if (typeof raw !== 'string') return null;
    const normalized = raw.toLowerCase();
    return normalized === 'red' || normalized === 'black' ? normalized : null;
}

/** 节点在文案里的称呼:显示文字就是 key 本身 */
function keyText(key: SceneNodeKey): string {
    return String(key);
}

/** 有序检查的数值口径:key 必须是 number;字符串 key 返回 null(调用方 FAIL) */
function numericKeyOf(node: SceneDocumentNode): number | null {
    return typeof node.key === 'number' ? node.key : null;
}

/** 构造一条 PASS 结论(没有细节、不定位) */
function pass(name: string): SceneCheckResult {
    return { name, passed: true, detail: '', details: [], node: null };
}

/** 构造一条 FAIL 结论:行内一句话 + 可选的展开行与定位目标 */
function fail(
    name: string,
    detail: string,
    node: SceneNodeKey | null,
    details: readonly string[] = [],
): SceneCheckResult {
    return { name, passed: false, detail, details, node };
}

/** 节点在文案里的称呼(标签是给人看的,key 只用于定位) */
function nameOf(index: TreeIndex, key: SceneNodeKey): string {
    return index.nodeByKey.get(key) === undefined ? `#${keyText(key)}` : keyText(key);
}

// 1. 颜色合法

/**
 * 每个节点都必须有 `attrs.color`,取值只能是 red / black.
 *
 * 这条不是 CLRS 的性质,而是"检查可以建立在什么之上"的前提:颜色缺失 / 拼错时,
 * 后面几条颜色性质要么空真、要么误判,所以先单列一条明确报出来.
 */
const checkColors: SceneCheckFunction = (document) => {
    const name = '节点颜色合法';
    const invalid = document.nodes.filter((node) => colorOf(node) === null);
    if (invalid.length === 0) return pass(name);
    const first = invalid[0] as SceneDocumentNode;
    return fail(
        name,
        `节点 ${invalid.map((node) => keyText(node.key)).join(', ')} 的 attrs.color 不是 red / black`,
        first.key,
        invalid.map((node) => `节点 #${keyText(node.key)}「${keyText(node.key)}」: attrs.color = ${JSON.stringify(node.attrs.color)}`),
    );
};

// 2. 根节点为黑色

const checkRootBlack: SceneCheckFunction = (document) => {
    const name = '根节点为黑色';
    if (document.nodes.length === 0) return pass(name);

    const index = buildTreeIndex(document);
    if (index.roots.length === 0) {
        return fail(name, '找不到根节点:每个节点都有父节点(结构里可能有环)', document.nodes[0]?.key ?? null);
    }
    if (index.roots.length > 1) {
        return fail(
            name,
            `根不唯一:有 ${index.roots.length} 个节点没有父节点`,
            index.roots[0] ?? null,
        );
    }

    const rootKey = index.roots[0] as SceneNodeKey;
    const color = colorOf(index.nodeByKey.get(rootKey) as SceneDocumentNode);
    if (color === 'red') {
        return fail(name, `根节点 ${nameOf(index, rootKey)} 是红色`, rootKey);
    }
    if (color === null) {
        return fail(name, `根节点 ${nameOf(index, rootKey)} 没有合法的颜色`, rootKey);
    }
    return pass(name);
};

// 3. 红节点的孩子都是黑色

/**
 * 扫所有节点而不是只扫从根可达的节点:红红相接是局部错误,不依赖"根唯一 / 无环"这些
 * 前提;结构坏掉时也能报出来.
 */
const checkRedChildrenBlack: SceneCheckFunction = (document) => {
    const name = '红色节点的孩子都是黑色';
    if (document.nodes.length === 0) return pass(name);

    const index = buildTreeIndex(document);
    for (const node of document.nodes) {
        if (colorOf(node) !== 'red') continue;
        for (const childKey of index.childrenOf.get(node.key) ?? []) {
            const child = index.nodeByKey.get(childKey);
            if (child !== undefined && colorOf(child) === 'red') {
                return fail(
                    name,
                    `节点 ${keyText(node.key)} 是红色,孩子 ${keyText(child.key)} 也是红色`,
                    node.key,
                    [`红色节点「${keyText(node.key)}」-> 红色孩子「${keyText(child.key)}」`],
                );
            }
        }
    }
    return pass(name);
};

// 4. 各路径黑色节点数量相同

/** 黑高从"后代 nil 叶子"算起:nil 叶子算一个黑,节点自身是黑再加一(与旧实现同一口径) */
interface BlackHeightViolation {
    readonly kind: 'cycle' | 'black-height';
    readonly node: SceneNodeKey;
    /** 两侧黑高;只有 kind 为 black-height 时有意义 */
    readonly low: number;
    readonly high: number;
}

type HeightOutcome = number | BlackHeightViolation;

const checkBlackHeight: SceneCheckFunction = (document) => {
    const name = '各路径黑色节点数量相同';
    if (document.nodes.length === 0) return pass(name);

    const index = buildTreeIndex(document);
    if (index.roots.length !== 1) {
        return fail(name, '找不到唯一的根节点,无法计算黑高', index.roots[0] ?? null);
    }

    const visited = new Set<SceneNodeKey>();

    const heightOf = (key: SceneNodeKey): HeightOutcome => {
        if (visited.has(key)) return { kind: 'cycle', node: key, low: 0, high: 0 };
        visited.add(key);

        const node = index.nodeByKey.get(key) as SceneDocumentNode;
        let expected: number | null = null;
        for (const childKey of index.childrenOf.get(key) ?? []) {
            const childHeight = heightOf(childKey);
            if (typeof childHeight !== 'number') return childHeight;
            if (expected === null) {
                expected = childHeight;
            } else if (expected !== childHeight) {
                return {
                    kind: 'black-height',
                    node: key,
                    low: Math.min(expected, childHeight),
                    high: Math.max(expected, childHeight),
                };
            }
        }

        // 没有孩子时 expected 还是 null:路径走到 nil 叶子,黑高从 1 起算
        const own = colorOf(node) === 'black' ? 1 : 0;
        return (expected ?? 1) + own;
    };

    const outcome = heightOf(index.roots[0] as SceneNodeKey);
    if (typeof outcome !== 'number') {
        if (outcome.kind === 'cycle') {
            return fail(name, `节点 ${nameOf(index, outcome.node)} 被重复引用(有环或共享孩子)`, outcome.node);
        }
        return fail(
            name,
            `节点 ${nameOf(index, outcome.node)} 两侧黑高不同: 较浅一侧 ${outcome.low}, 较深一侧 ${outcome.high}`,
            outcome.node,
            [
                '黑高按「节点到 nil 叶子」计,含节点自身的黑',
                `较浅一侧 ${outcome.low}, 较深一侧 ${outcome.high}`,
            ],
        );
    }

    if (visited.size !== document.nodes.length) {
        const unreachable = document.nodes.find((node) => !visited.has(node.key)) as SceneDocumentNode;
        return fail(
            name,
            `有 ${document.nodes.length - visited.size} 个节点从根不可达`,
            unreachable.key,
        );
    }
    return pass(name);
};

// 5. 二叉搜索树有序

type BstViolationReason = 'range' | 'shape' | 'cycle' | 'value' | 'unreachable';

interface BstViolation {
    readonly node: SceneNodeKey;
    readonly reason: BstViolationReason;
}

/**
 * 第 5 条:二叉搜索树有序(左子树全部小于节点,右子树全部大于节点).
 *
 * - 用区间递归而不是只比父子:只比父子会漏掉"孙子比爷爷大"这种错;
 * - 区间是开区间:等于祖先的值也算乱序(查找时这个值落在哪一边不确定);
 * - 节点最多两个孩子,出边顺序第一个是左、第二个是右;只有一个孩子时没有兄弟可比
 *   顺序,按 key 与父节点比较定左右(小的走左、大的走右),与布局同一口径.
 */
const checkBstOrder: SceneCheckFunction = (document) => {
    const name = '二叉搜索树有序';
    if (document.nodes.length === 0) return pass(name);

    const index = buildTreeIndex(document);
    if (index.roots.length !== 1) {
        return fail(name, '找不到唯一的根节点,无法检查有序性', index.roots[0] ?? null);
    }

    const reached = new Set<SceneNodeKey>();

    const validate = (
        key: SceneNodeKey,
        low: number | null,
        high: number | null,
        path: readonly SceneNodeKey[],
    ): BstViolation | null => {
        if (path.includes(key)) return { node: key, reason: 'cycle' };
        reached.add(key);

        const node = index.nodeByKey.get(key) as SceneDocumentNode;
        const value = numericKeyOf(node);
        if (value === null) return { node: key, reason: 'value' };
        if (low !== null && value <= low) return { node: key, reason: 'range' };
        if (high !== null && value >= high) return { node: key, reason: 'range' };

        const children = index.childrenOf.get(key) ?? [];
        if (children.length > 2) return { node: key, reason: 'shape' };
        if (children.length === 0) return null;

        const nextPath = [...path, key];

        if (children.length === 1) {
            const childKey = children[0] as SceneNodeKey;
            // 单孩子没有兄弟给顺序:按 key 与父节点比较定左右(与布局同一口径).
            // 这里的比较和"左右两种解释各试一次"结果等价:能过左区间的只可能是
            // 小于父节点的孩子,反之亦然;非数字 key 交给 validate 报"不是数字".
            const childValue = numericKeyOf(index.nodeByKey.get(childKey) as SceneDocumentNode);
            const goesRight = childValue !== null && childValue > value;
            return goesRight
                ? validate(childKey, value, high, nextPath)
                : validate(childKey, low, value, nextPath);
        }

        const leftBad = validate(children[0] as SceneNodeKey, low, value, nextPath);
        if (leftBad !== null) return leftBad;
        return validate(children[1] as SceneNodeKey, value, high, nextPath);
    };

    const violation = validate(index.roots[0] as SceneNodeKey, null, null, []);
    if (violation !== null) {
        const nodeName = nameOf(index, violation.node);
        switch (violation.reason) {
            case 'shape':
                return fail(name, `节点 ${nodeName} 的子节点超过 2 个,二叉搜索树每个节点最多两个`, violation.node);
            case 'cycle':
                return fail(name, `节点 ${nodeName} 被重复引用(有环或共享孩子)`, violation.node);
            case 'range':
                return fail(name, `节点 ${nodeName} 破坏了有序性(左子树应全小于、右子树应全大于;相等也算违规)`, violation.node);
            case 'value':
                return fail(name, `节点 ${nodeName} 的 key 不是数字,无法检查数值有序性`, violation.node);
            default:
                return fail(name, `节点 ${nodeName} 从根不可达`, violation.node);
        }
    }

    if (reached.size !== document.nodes.length) {
        const unreachable = document.nodes.find((node) => !reached.has(node.key)) as SceneDocumentNode;
        return fail(name, `节点 ${keyText(unreachable.key)} 从根不可达`, unreachable.key);
    }
    return pass(name);
};

/**
 * `rbt` 结构注册的全部检查(顺序 = 默认运行顺序 = 检查窗口里的行顺序).
 *
 * `id` 显式写成函数名:检查配置窗口里把 `checkRootBlack` 这类名字写进 JSON 数组即可运行.
 */
export const RBT_CHECKS: readonly SceneCheckDefinition[] = [
    { id: 'checkColors', run: checkColors },
    { id: 'checkRootBlack', run: checkRootBlack },
    { id: 'checkRedChildrenBlack', run: checkRedChildrenBlack },
    { id: 'checkBlackHeight', run: checkBlackHeight },
    { id: 'checkBstOrder', run: checkBstOrder },
];
