/*
 * 红黑树数据结构本身:节点的形状 / 颜色,以及"这棵树是不是红黑树"的四条性质检查.
 *
 * 纯逻辑:不碰 DOM、不引用显示层的常量;节点上不挂布局坐标(x / y 属于"画在哪",在
 * src/ui/rbt/rbt_layout.ts 的 `RbtPlacedNode` 里).表达式写法由 datastruct/rbt/rbt_parse.ts
 * 解析,性质名与出错文案由 src/ui/rbt/rbt_format.ts 拼,这里只回答"过没过、错在哪个节点、黑高多少".
 */

/** 节点颜色;nil 叶子用 `null` 表示,不占这个类型 */
export type RbtColor = 'R' | 'B';

/** 一个节点:值按字符串存,左右子树为 null 即 nil 叶子(不建节点) */
export interface RbtNode {
    readonly value: string;
    readonly color: RbtColor;
    readonly left: RbtNode | null;
    readonly right: RbtNode | null;
}

/**
 * 四条性质的稳定 id,顺序即检查顺序(显示层的清单也按这个顺序渲染).
 *
 * 1. 根是黑色;2. 红节点的孩子都是黑色;3. 任一节点到其后代 nil 叶子的每条路径上黑节点数
 * 相同(黑高一致);4. 二叉搜索树有序(左子树全部小于节点,右子树全部大于节点).第 4 条不是
 * 红黑性质,但手打表达式最常在这里写错,所以单列一条.
 *
 * CLRS 的"非红即黑"、"nil 叶子是黑色"、"要么两个孩子都不是 nil"三条没列:颜色取值与子节点
 * 形状由解析器保证,结构上不可能违反,列出来只是永远 PASS 的条目.
 *
 * `as const` 让 id 收窄成字面量联合,PROPERTY_CHECKS 按它收口:清单增删而检查函数没跟上会编译报错.
 */
export const RBT_PROPERTY_IDS = [
    'root-black',
    'red-no-red-child',
    'black-height',
    'bst-order',
] as const;

export type RbtPropertyId = (typeof RBT_PROPERTY_IDS)[number];

/** 黑高不一致的两个数:较浅一侧记 `expected`,较深一侧(含多出来的那层)记 `actual` */
export interface RbtBlackHeight {
    readonly expected: number;
    readonly actual: number;
}

/** 一条性质的违规位置(结构化结论,不含任何文案) */
export interface RbtPropertyViolation {
    /** 违规定位到的节点(bst-order 报根) */
    readonly node: RbtNode;
    /** 两侧黑高;只有 id 为 `black-height` 的违规会填 */
    readonly blackHeight: RbtBlackHeight | null;
}

/** 单条性质的结论 */
export interface RbtPropertyResult {
    readonly id: RbtPropertyId;
    readonly pass: boolean;
    readonly violation: RbtPropertyViolation | null;
}

/** 一次性质检查的完整结论 */
export interface RbtPropertyReport {
    /** 逐条结论,顺序与 RBT_PROPERTY_IDS 一致 */
    readonly results: readonly RbtPropertyResult[];
    readonly failedCount: number;
    readonly total: number;
}

/**
 * 二叉搜索树有序性比较的容差,只用来兜浮点写法的误差.取极小值:相等值(重复)仍然判 FAIL,
 * 不会因为容差被放过.
 */
export const RBT_COMPARISON_TOLERANCE = 1e-9;

/**
 * 取节点值参与比较时用的数;认不出来返回 null,由调用方跳过比较.
 *
 * 不用 `Number()`:它会把 `''` 当 0、`0x10` 当 16、`1e3` 当 1000,这些"看着是数字其实不是"
 * 的写法在这里只会让人对不上号.
 */
function toComparable(value: string): number | null {
    return /^[+-]?\d+(\.\d+)?$/.test(value) ? Number(value) : null;
}

/** 第 1 条:根节点必须是黑色 */
function checkRootIsBlack(root: RbtNode): RbtPropertyViolation | null {
    return root.color === 'R' ? { node: root, blackHeight: null } : null;
}

/** 第 2 条:红节点的孩子都是黑色(nil 是黑色,不算违规) */
function checkRedChildrenAreBlack(root: RbtNode): RbtPropertyViolation | null {
    return scanNodes(root, (node) => {
        if (node.color !== 'R') return null;
        const leftIsRed = node.left !== null && node.left.color === 'R';
        const rightIsRed = node.right !== null && node.right.color === 'R';
        return leftIsRed || rightIsRed ? { node, blackHeight: null } : null;
    });
}

/**
 * 第 3 条:任一节点到它所有后代 nil 叶子的路径上黑节点数相同.
 *
 * 递归返回这棵子树的黑高(含自身,红节点不加);两棵子树黑高不同就报当前节点,并带上两个数.
 * 返回数字 = 这棵子树黑高;返回对象 = 已经找到违规(向上原样传,不再算别人的).
 */
function checkBlackHeight(node: RbtNode): number | RbtPropertyViolation {
    const leftHeight = node.left === null ? 1 : checkBlackHeight(node.left);
    if (typeof leftHeight !== 'number') return leftHeight;
    const rightHeight = node.right === null ? 1 : checkBlackHeight(node.right);
    if (typeof rightHeight !== 'number') return rightHeight;
    if (leftHeight !== rightHeight) {
        return {
            node,
            blackHeight: { expected: Math.min(leftHeight, rightHeight), actual: Math.max(leftHeight, rightHeight) },
        };
    }
    return leftHeight + (node.color === 'B' ? 1 : 0);
}

/**
 * 第 4 条:二叉搜索树有序(左子树全部小于节点,右子树全部大于节点).
 *
 * 用区间递归而不是"每层只比父子":只比父子会漏掉"孙子比爷爷大"这种错(父节点在两者之间
 * 时,父子关系全对而整棵树仍然不是搜索树).
 *
 * 比较用数值而不是字符串:`007` 与 `7` 是同一个数,字符串比较会把它们当成两个.换成数与否
 * 只看这个值自己,与祖先能不能换无关.
 *
 * 区间是开区间:等于祖先的值也算乱序(查找时这个值落在哪一边是不确定的);容差只兜浮点误差.
 */
function checkBstOrder(root: RbtNode): RbtPropertyViolation | null {
    const inRange = (node: RbtNode | null, low: number | null, high: number | null): boolean => {
        if (node === null) return true;
        const value = toComparable(node.value);
        if (value !== null) {
            // 边界是开区间:小于等于下界、大于等于上界都不算有序,相等值必须算违规
            if (low !== null && value <= low + RBT_COMPARISON_TOLERANCE) return false;
            if (high !== null && value >= high - RBT_COMPARISON_TOLERANCE) return false;
            return inRange(node.left, low, value) && inRange(node.right, value, high);
        }
        // 值不是十进制数:这一层无从判定,区间原样往下传,子树照查
        return inRange(node.left, low, high) && inRange(node.right, low, high);
    };
    // 违规是整个区间条件被破坏,不便归到某一对父子,报根作代表
    return inRange(root, null, null) ? null : { node: root, blackHeight: null };
}

/** 深度优先遍历,第一个让 `find` 返回非 null 的节点就把它交回去(先根,再左,再右) */
function scanNodes(
    node: RbtNode,
    find: (node: RbtNode) => RbtPropertyViolation | null,
): RbtPropertyViolation | null {
    const own = find(node);
    if (own !== null) return own;
    if (node.left !== null) {
        const left = scanNodes(node.left, find);
        if (left !== null) return left;
    }
    if (node.right !== null) {
        const right = scanNodes(node.right, find);
        if (right !== null) return right;
    }
    return null;
}

/**
 * 性质 id -> 检查函数.用 `Record<RbtPropertyId, ...>` 而不是按下标取:清单增删而这里没跟上
 * 会编译报错,而不是等到某个输入触发 `undefined` 调用.
 */
const PROPERTY_CHECKS: Readonly<Record<RbtPropertyId, (node: RbtNode) => RbtPropertyViolation | null>> = {
    'root-black': checkRootIsBlack,
    'red-no-red-child': checkRedChildrenAreBlack,
    'black-height': (node) => {
        const height = checkBlackHeight(node);
        return typeof height === 'number' ? null : height;
    },
    'bst-order': checkBstOrder,
};

/**
 * 跑完四条性质,交回逐条结论.
 *
 * 四条都跑(不短路):清单要一次把问题列全,只报第一条的话读者修完还要再看一次.同一处错可能
 * 同时落在两条性质上(如根为红 + 红红相接),这是有意的.空树时四条都是空真.
 */
export function checkTreeProperties(root: RbtNode | null): RbtPropertyReport {
    const results: RbtPropertyResult[] = RBT_PROPERTY_IDS.map((id) => {
        const violation = root === null ? null : PROPERTY_CHECKS[id](root);
        return { id, pass: violation === null, violation };
    });

    return {
        results,
        failedCount: results.filter((result) => !result.pass).length,
        total: results.length,
    };
}

/** 按 id 取一条结论(找不到就抛错:清单与 RBT_PROPERTY_IDS 对不上是硬错误) */
export function findPropertyResult(report: RbtPropertyReport, id: RbtPropertyId): RbtPropertyResult {
    const found = report.results.find((result) => result.id === id);
    if (!found) throw new Error(`性质检查里没有 ${id} 这条结论`);
    return found;
}
