/*
 * 视觉层的**场景模型**:一幅结构图 = 平面上的若干图元.这一层不 import 任何 datastruct,
 * 也不知道"这个圆是红黑树的红节点"还是"那个格子是哈希桶":它只认"节点 / 连线 / 内存块"
 * 三种表示,语义由使用它的结构(ui/<结构>/)通过值文字与变体表达.
 *
 * 三种表示的正式定义(当前实现到哪一条,见每条注释):
 *
 * 1. **节点 node**:一个逻辑元素的标记.当前画法是**圆 + 居中的值文字**;位置是平面坐标
 *    (单位 = 屏幕像素 @ 缩放 1),由结构的布局算好.语义差异(红黑、当前 / 已访问)用
 *    `variant` 表达,落到 `visual-node--<variant>` 类上,由结构自己的样式表决定观感.
 *
 * 2. **连线 link**:两点之间的关系.两种方向语义用 `directed` 区分:
 *    - `directed: true`(**指针**,如树的父 -> 子、链表的 next):线段 + 终点箭头;
 *    - `directed: false`(**无向边**,如图里的一座桥):只有线段,不画箭头.
 *    端点已经由布局算好(收进节点圆边界并做平行 / 反向分道),渲染层只照着落笔.
 *
 * 3. **内存块 block**:一段连续的存储格(下标 + 值),是数组 / 栈 / 队列 / 哈希桶数组
 *    这类结构的画法.当前**没有结构用得到**,所以这里不定义类型、渲染层也不实现 -- 等
 *    第一种数组类结构真的出现时再补 `VisualBlock` 与它的渲染分支.提前把字段猜出来,
 *    等真需求来了多半对不上,反而多一处要改的死代码.
 *
 * 坐标约定:所有坐标都是世界坐标(平面坐标),与视口 / 桌面多大无关;世界坐标 -> 屏幕
 * 像素的换算只发生在世界层的 transform 上(见 visual/viewport.ts).
 */

/** 平面上的一个点(世界坐标,单位 = 屏幕像素 @ 缩放 1) */
export interface VisualPoint {
    readonly x: number;
    readonly y: number;
}

/**
 * 一个节点:位置 + 值文字 + 可选语义变体.
 *
 * `label` 是**已经格式化好的可见文字**(如 `13` / `13B`);视觉层不拼接、不解读.
 */
export interface VisualNode {
    /** 节点中心在世界坐标里的位置(形状以它为中心) */
    readonly at: VisualPoint;
    /** 节点值(可见文字) */
    readonly label: string;
    /**
     * 语义变体:写成 CSS 类名后缀(如 `red` / `black`),渲染层挂
     * `visual-node--<variant>`.不给就只有基础观感.
     */
    readonly variant?: string;
}

/**
 * 一条连线:两端都已经有坐标,渲染层只照着画.
 *
 * 不存"指向哪个节点"而是存两个点:端点由布局决定(从节点圆边出发,平行 / 反向连线
 * 已横向分道),渲染层不该知道节点形状与半径.
 */
export interface VisualLink {
    /** 起点(世界坐标,已经收进节点圆边界) */
    readonly from: VisualPoint;
    /** 终点(世界坐标,已经收进节点圆边界) */
    readonly to: VisualPoint;
    /** `true` = 有向指针(画箭头);`false` = 无向边(只画线) */
    readonly directed: boolean;
}

/** 一幅结构图:节点 + 连线(渲染顺序:先连线后节点,节点盖在线上) */
export interface VisualScene {
    /** 节点(顺序由结构决定,渲染层原样落笔) */
    readonly nodes: readonly VisualNode[];
    /** 连线(顺序由结构决定,渲染层原样落笔) */
    readonly links: readonly VisualLink[];
}
