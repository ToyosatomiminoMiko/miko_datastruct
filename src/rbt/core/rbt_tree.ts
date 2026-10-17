/*
红黑树**数据结构本身**:节点的形状 / 颜色,以及"这棵树是不是红黑树"的四条性质检查.

这一层是纯逻辑,与"这棵树怎么画"完全无关:

- 不碰 DOM;
- 不引用显示层的任何常量;
- 节点上**不挂布局坐标** -- 布局算出来的 x / y 属于"这棵树画在哪",存在
  src/rbt/ui/rbt_layout.ts 的 `RbtPlacedNode` 里,核心节点保持只有结构.

于是本文件可以脱离这个项目单独读:它是一棵(只读)红黑树的定义.表达式写法(用户
输入的那串 `13B(8R(1B,11R),...)`)由 core/rbt_parse.ts 解析,中文文案(性质名 /
出错说明)由显示层的 src/rbt/ui/rbt_format.ts 拼 -- 这里只回答"过没过、错在哪个
节点、两侧黑高各是多少".

数据形状:
- `RbtNode` 是这棵树的全部状态,**字段只读**:解析之后没有任何一处再改它(布局要
  坐标就另存一份,见 ui/rbt_layout.ts).从前把 `x?` / `y?` 写在节点上,于是"数据
  结构"里混进了显示状态 -- 那是这次拆分要拆掉的东西.
- nil 叶子**不建节点**:用 `null` 表示,颜色恒为黑(所以"nil 叶子是黑色"这条性质
  结构上不会违反,不列进清单,理由见下面 RBT_PROPERTY_IDS 的说明).

性质检查的两条约定:
- 顺序 = `RBT_PROPERTY_IDS` 的顺序;每条对应的检查函数按 id 从 PROPERTY_CHECKS 里取
  (清单增删而这里没跟上会编译报错);
- 结论是**结构化**的:违规节点交回节点引用,黑高那条另外交回两个数;把节点写成
  `11R` 这种给人看的字符串是显示层的事(见 ui/rbt_format.ts),这里不拼任何文案.
*/

// ============================================================
// 树的形状
// ============================================================

/** 节点颜色:nil 叶子用 `null` 节点表示,颜色恒为黑,不占这个类型 */
export type RbtColor = 'R' | 'B';

/** 一个节点(值按字符串存,颜色 R/B,左右子树为 null 表示 nil 叶子) */
export interface RbtNode {
    readonly value: string;
    readonly color: RbtColor;
    readonly left: RbtNode | null;
    readonly right: RbtNode | null;
}

// ============================================================
// 性质:四条,对应 RBT_PROPERTY_IDS 的四个 id
// ============================================================

/**
 * 四条性质的稳定 id,顺序即检查顺序(显示层的清单也按这个顺序渲染).
 *
 * 前三条是红黑树的定义(CLRS 那五条里会被表达式破坏的那些),第四条是"红黑树"
 * 这名字里的另一半:
 *
 * 1. 根是黑色;
 * 2. 红节点的孩子都是黑色(含"红节点直接接 nil" -- nil 是黑的,但那样这条路径
 *    上红节点底下没有黑节点,形状上已经不对);
 * 3. 任一节点到其后代 nil 叶子的所有路径上黑节点数相同(黑高一致);
 * 4. 二叉搜索树有序(左子树全部小于节点,右子树全部大于节点).
 *
 * 第 4 条不是红黑性质,是手打表达式最常见的错(层级对了而值乱序);单独列一条,
 * 文案写的是"二叉搜索树有序",不混进上面那三条.
 *
 * 少了 CLRS 里另外两条,原因不是"没实现"而是**结构上不可能违反**:
 * - "每个节点非红即黑":颜色写在表达式里,解析器只收 R / B;
 * - "nil 叶子是黑色":解析器不建 nil 节点(用 null 表示),颜色恒为黑;
 * - "每个节点要么两个子节点都不是 nil,要么都是":括号表达式必须写两个子树
 *   (`5B(1B,2B)`),单孩子写法 `5B(1B)` 在解析阶段就报"缺少逗号",到不了性质检查.
 * 列一条永远 PASS 的条目只会让清单看着更长,所以不列;哪天支持了单孩子写法,
 * 再把那条加回来.
 *
 * `as const` 让 id 收窄成字面量联合:PROPERTY_CHECKS 用 `Record<id 联合, 检查函数>`
 * 收口,清单增删一条而检查函数没跟上会**编译报错**,而不是等到某个输入把它变成
 * undefined 调用.显示层的性质名 / 出错文案按同一批 id 收口(见 src/rbt/config.ts
 * 与 src/rbt/ui/rbt_format.ts).
 */
export const RBT_PROPERTY_IDS = [
    'root-black',
    'red-no-red-child',
    'black-height',
    'bst-order',
] as const;

/** RBT_PROPERTY_IDS 的 id 联合 */
export type RbtPropertyId = (typeof RBT_PROPERTY_IDS)[number];

/** 两侧黑高(只有 black-height 那条会填;数值含义见 checkBlackHeight) */
export interface RbtBlackHeight {
    /** 较浅那一侧的黑高 */
    readonly expected: number;
    /** 较深那一侧的黑高(含多出来的那层) */
    readonly actual: number;
}

/** 一条性质的违规位置(结构化:谁错了 + 黑高那条的两个数) */
export interface RbtPropertyViolation {
    /** 违规节点(根红 / 红接红 / 黑高不一致时报的是定位到的那一个;搜索序报根) */
    readonly node: RbtNode;
    /** 两侧黑高;只有 id 为 `black-height` 的违规会填 */
    readonly blackHeight: RbtBlackHeight | null;
}

/** 单条性质的结论 */
export interface RbtPropertyResult {
    /** 对应 RbtPropertyId */
    readonly id: RbtPropertyId;
    /** 是否 PASS */
    readonly pass: boolean;
    /** FAIL 时的违规位置;PASS 时是 null */
    readonly violation: RbtPropertyViolation | null;
}

/** 一次性质检查的完整结论 */
export interface RbtPropertyReport {
    /** 逐条结论,顺序与 RBT_PROPERTY_IDS 一致 */
    readonly results: readonly RbtPropertyResult[];
    /** FAIL 的条数 */
    readonly failedCount: number;
    /** 总条数(= RBT_PROPERTY_IDS.length) */
    readonly total: number;
}

/**
 * 二叉搜索树有序性的比较容差.
 *
 * 只用来兜住浮点写法(如 `0.1 + 0.2` 那类值在字符串里看不出误差)与整数写法
 * 混用时的边界;相等值(左右子树出现和祖先同一个值)仍然判 FAIL,所以容差取
 * 极小值,不会把"值重复"放过.
 */
export const RBT_COMPARISON_TOLERANCE = 1e-9;

/**
 * 取节点值参与比较时用的数.
 *
 * 用手写解析而不是 `Number()`:`Number` 会把 `''` 当 0,把 `0x10` 当 16,把
 * `1e3` 当 1000,这些"看着是数字其实不是"的写法在这里只会让人对不上号.
 * 认不出来就返回 null,由调用方跳过比较(见 checkBstOrder).
 */
function toComparable(value: string): number | null {
    return /^[+-]?\d+(\.\d+)?$/.test(value) ? Number(value) : null;
}

/** 第 1 条:根节点必须是黑色 */
function checkRootIsBlack(root: RbtNode): RbtPropertyViolation | null {
    return root.color === 'R' ? { node: root, blackHeight: null } : null;
}

/** 第 2 条:红节点的孩子都是黑色(红节点接 nil 也算:那条路径上没有黑节点兜底) */
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
 * 递归返回值是"这棵子树的黑高"(含自身,除非自身是红);两棵子树黑高不同就报错.
 * 黑高不一致至少发生在两个节点上,这里报**较深的那一侧**的节点:它是多出来的
 * 那个黑节点所在的位置,顺着它往下能最快看到"多出来的一层".
 *
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
 * 用区间递归而不是"每层只比父子":只比父子会漏掉"孙子比爷爷大"这种错
 * (父节点在两者之间时,父子关系全对而整棵树仍然不是搜索树).
 *
 * 比较用**数值**而不是字符串:值在网页上是十进制写法(`007` 与 `7` 是同一个数,
 * 而字符串比较会把它们当成两个),所以先经 toComparable 换成数;换成数与否
 * 只看这个值自己,与祖先能不能换无关(不能换的值既不检查它,也不收窄区间).
 *
 * 区间是**开区间**:等于祖先的值也算乱序(左子树出现和爷爷同一个数,查找时这个值
 * 落在哪一边是不确定的).容差只用来兜浮点写法,取极小值,不会把相等的值放过.
 */
function checkBstOrder(root: RbtNode): RbtPropertyViolation | null {
    const inRange = (node: RbtNode | null, low: number | null, high: number | null): boolean => {
        if (node === null) return true;
        const value = toComparable(node.value);
        if (value !== null) {
            // 两个边界都是**闭合排除**的:小于等于下界,大于等于上界都不算有序.
            // (`<=` / `>=` 而不是 `<` / `>`:相等值必须算违规,见上面那段注释)
            if (low !== null && value <= low + RBT_COMPARISON_TOLERANCE) return false;
            if (high !== null && value >= high - RBT_COMPARISON_TOLERANCE) return false;
            return inRange(node.left, low, value) && inRange(node.right, value, high);
        }
        // 值不是十进制数:这一层无从判定,区间原样往下传,不误报也不放过子树的比较
        return inRange(node.left, low, high) && inRange(node.right, low, high);
    };
    // 报根:这一条不定位"第一处违规的父子"(下面测试的说明里有原因),违规是整个
    // 区间条件被破坏,根是这棵子树的代表
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
 * 性质 id -> 检查函数.
 *
 * 用 `Record<RbtPropertyId, ...>` 而不是"按下标取第 i 个检查":`RBT_PROPERTY_IDS`
 * 增删一条而这里没跟上会**编译报错**(缺键 / 多键),而不是等到某个输入触发
 * `undefined` 调用(checkBlackHeight 那条还要包一层,因为它返回的是黑高数字).
 * 检查与渲染的顺序仍由 `RBT_PROPERTY_IDS` 的顺序决定,所以"清单顺序 = 检查顺序".
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
 * 四条**都跑**(不做"前一条不过就短路"):清单要一次把问题列全,只报第一条的话
 * 读者修完一次还要再看一次.每条各自在自己的子树里找第一处错,所以同一处错
 * 可能同时落在两条性质上(如根为红 + 红红相接),这是有意的:两条性质确实都被它
 * 破坏了.空树走另一条路:四条在空树上都是空真(root === null 时四条都不适用).
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

/** 按 id 取一条结论(找不到时抛错:清单与 RBT_PROPERTY_IDS 对不上是硬错误) */
export function findPropertyResult(report: RbtPropertyReport, id: RbtPropertyId): RbtPropertyResult {
    const found = report.results.find((result) => result.id === id);
    if (!found) throw new Error(`性质检查里没有 ${id} 这条结论`);
    return found;
}
