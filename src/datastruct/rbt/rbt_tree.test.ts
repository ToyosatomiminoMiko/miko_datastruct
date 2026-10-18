/**
 * 红黑树**数据结构与四条性质**(datastruct/rbt/rbt_tree.ts)的契约:纯函数,默认 node 环境.
 *
 * 每条性质单独喂一棵"专门坏在这一条上"的树:拿表达式当输入(与用户实际敲的是同一条
 * 路径),用 findPropertyResult 只断言那一条,免得"根是红的"顺带把红红相接也弄红了,
 * 断言写成 `failedCount === 1` 就很难维护.
 *
 * 这一层断言的是**结构化结论**(违规节点 / 两侧黑高),不是文案:核心层不知道
 * `10R` 会显示成"根节点 10R 是红色",那是 ui/rbt/rbt_format.ts 的事(见 rbt_format.test.ts).
 *
 * 解析本身在 datastruct/rbt/rbt_parse.test.ts;挂载与背景树在 ui/rbt/rbt.test.ts.
 */
import { describe, expect, it } from 'vitest';

import { buildTreeFromExpression } from '@/datastruct/rbt/rbt_parse';
import {
    RBT_COMPARISON_TOLERANCE,
    RBT_PROPERTY_IDS,
    checkTreeProperties,
    findPropertyResult,
    type RbtPropertyId,
    type RbtPropertyViolation,
} from '@/datastruct/rbt/rbt_tree';

/**
 * 一棵深度 4 的满二叉树(31 个节点),四条性质都合法.
 *
 * 为什么不直接用显示层的示例(`ui/rbt/config.ts` 的 RBT_TREE_EXAMPLE):依赖方向只有
 * 显示 -> 核心一个,核心层的测试反过去 import 显示层会把这条线倒过来.示例本身是否
 * 合法由显示层在挂载后断言(见 `ui/rbt/rbt.test.ts`),这里要的只是"一棵合法的满树".
 */
const VALID_FULL_TREE =
    '18B(9R(4B(2R(1B,3B),6R(5B,7B)),13B(11R(10B,12B),15R(14B,16B))),27R(22B(20R(19B,21B),24R(23B,25B)),31B(29R(28B,30B),33R(32B,34B))))';

/** 各条性质的稳定 id(与 RBT_PROPERTY_IDS 一一对应) */
const PROPERTY_IDS = {
    rootBlack: 'root-black',
    redChild: 'red-no-red-child',
    blackHeight: 'black-height',
    bstOrder: 'bst-order',
} as const;

/** 把表达式解析出来跑一遍性质检查(解析失败直接抛,由调用方决定怎么断言) */
function check(expression: string) {
    return checkTreeProperties(buildTreeFromExpression(expression));
}

/** 单条性质的结论 */
function property(expression: string, id: RbtPropertyId) {
    return findPropertyResult(check(expression), id);
}

/** 取一条"确实 FAIL"的结论的违规位置(没 FAIL 或没结构就说明契约变了) */
function violation(expression: string, id: RbtPropertyId): RbtPropertyViolation {
    const result = property(expression, id);
    expect(result.pass).toBe(false);
    if (result.violation === null) throw new Error(`${id} 判了 FAIL 却没给违规位置`);
    return result.violation;
}

describe('红黑树:性质清单', () => {
    it('核心层声明了四条性质,id 不重复', () => {
        expect(RBT_PROPERTY_IDS).toHaveLength(4);
        expect(new Set(RBT_PROPERTY_IDS).size).toBe(RBT_PROPERTY_IDS.length);
        // 检查代码按 id 取结论,id 漏一个就会在 findPropertyResult 里抛
        for (const id of Object.values(PROPERTY_IDS)) {
            expect(RBT_PROPERTY_IDS, id).toContain(id);
        }
        // "nil 叶子黑" / "非红即黑" / "两孩子或都是 nil" 三条结构上不可能违反,
        // 不列进清单(理由见 datastruct/rbt/rbt_tree.ts 的 RBT_PROPERTY_IDS);这里钉住"没混进来"
        expect(RBT_PROPERTY_IDS as readonly string[]).not.toContain('nil-leaf-black');
    });
});

describe('红黑树:性质检查', () => {
    it('合法红黑树(深度 4 满树)四条全过', () => {
        const report = check(VALID_FULL_TREE);
        expect(report.results.map((result) => result.pass)).toEqual([true, true, true, true]);
        expect(report.failedCount).toBe(0);
        expect(report.total).toBe(RBT_PROPERTY_IDS.length);
    });

    it('合法的非满树也全过(含单侧链条 n 层,黑高一致)', () => {
        // 全黑链:每层到 nil 的黑高都一样,是合法的红黑树
        expect(check('10B(5B(1B,7B),20B(15B,30B))').failedCount).toBe(0);
        // 红节点夹在黑节点之间,叶子接 nil 的那一层也合法
        expect(check('10B(5R(1B,7B),20R(15B,30B))').failedCount).toBe(0);
    });

    it('空树是合法红黑树:四条都 PASS(空真)', () => {
        const report = checkTreeProperties(null);
        expect(report.failedCount).toBe(0);
        expect(report.results.every((result) => result.pass)).toBe(true);
        expect(report.results.every((result) => result.violation === null)).toBe(true);
    });

    it('第 1 条:根是红色 -> 根黑 FAIL,交回根节点', () => {
        const found = violation('10R(5B,20B)', PROPERTY_IDS.rootBlack);
        expect(found.node.value).toBe('10');
        expect(found.node.color).toBe('R');
        // 这一条不需要黑高
        expect(found.blackHeight).toBeNull();
    });

    it('第 2 条:红节点底下挂红孩子 -> 交回那个红节点(父节点)', () => {
        const found = violation('10B(5R(1R,7B),20B(15B,30B))', PROPERTY_IDS.redChild);
        expect(found.node.value).toBe('5');
        expect(found.node.color).toBe('R');
    });

    it('红节点接 nil 叶子只坏黑高,不坏第 2 条(nil 就是黑的)', () => {
        // 5R 是简写叶子,补成 5R(nil,nil):两个孩子都是黑叶子,第 2 条不适用;
        // 但它右边那条路径(5R -> nil)比左边(10B -> 5R -> nil)少一个黑节点,
        // 所以坏的是黑高那一条
        const report = check('10B(5R,20B)');
        expect(findPropertyResult(report, PROPERTY_IDS.redChild).pass).toBe(true);
        const height = findPropertyResult(report, PROPERTY_IDS.blackHeight);
        expect(height.pass).toBe(false);
        expect(height.violation?.node.value).toBe('10');
    });

    it('第 3 条:一侧多出一个黑节点 -> 交回违规节点与两侧黑高', () => {
        // 右侧多一层黑节点:左侧黑高 2(10B -> nil),右侧 3(10B -> 20B -> nil)
        const found = violation('10B(5B,20B(15B,30B))', PROPERTY_IDS.blackHeight);
        expect(found.node.value).toBe('10');
        expect(found.blackHeight).toEqual({ expected: 2, actual: 3 });
    });

    it('第 4 条:值乱序 -> 搜索序 FAIL(黑高合法也照样报)', () => {
        // 根的右子树里放了 2:父子关系(2<40)全对,只有"已见到的区间"
        // 能发现 2 比根 10 小
        const expression = '10B(5B(3B,7B),40B(2B,50B))';
        const report = check(expression);
        const result = findPropertyResult(report, PROPERTY_IDS.bstOrder);
        expect(result.pass).toBe(false);
        expect(result.violation?.node.value).toBe('10');
        // 这一条坏不影响红黑那三条:四条路径黑高都是 3,也没有红红相接
        expect(report.failedCount).toBe(1);
    });

    it('越级的乱序也报:两层的父子都合法,区间到第三层才发现', () => {
        // 5 是 20 的左孩子,20 又是 30 的左孩子,而 30 是根的右孩子:
        // 20<30,5<20 各自都对,整条链却都跑到根的左边(链上每个都得大于 10)
        const report = check('10B(2B(1B,3B),30B(20B(5B,25B),40B))');
        expect(findPropertyResult(report, PROPERTY_IDS.bstOrder).pass).toBe(false);
        // 顺带说明:报的是"扫描时最先撞上的违规处"(这里 5 与 30 都比根小,
        // 先撞上哪个就报哪个),不一定是最初写错的那个节点 -- 位置只是
        // "搜索能确认违规的地方",不是根因定位.
    });

    it('相等值(重复)不算有序:两侧共用同一个数会判 FAIL', () => {
        expect(property('10B(10B,20B)', PROPERTY_IDS.bstOrder).pass).toBe(false);
        expect(property('10B(5B,10B)', PROPERTY_IDS.bstOrder).pass).toBe(false);
    });

    it('值按数值比:`007` 与 `7` 是同一个数,不算乱序', () => {
        // 字符串比较会把 "007" 排在 "7" 前面,数值比较不会
        expect(property('10B(007B,20B)', PROPERTY_IDS.bstOrder).pass).toBe(true);
    });

    it('容差是极小值:相邻整数不受影响,浮点写法也留有余地', () => {
        expect(RBT_COMPARISON_TOLERANCE).toBeLessThan(1e-6);
        expect(check('10.5B(5.25B,20.75B)').failedCount).toBe(0);
    });

    it('值不是十进制数(如 abcR)时跳过有序性判定,不误报', () => {
        const report = check('abcB(xR,yR)');
        // 红黑那几条照查(全黑 + 红叶子合法),搜索序跳过
        expect(findPropertyResult(report, PROPERTY_IDS.bstOrder).pass).toBe(true);
    });
});
