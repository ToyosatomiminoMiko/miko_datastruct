/*
 * 中性场景的**自动布局**:给节点 / 指针 / 边算平面坐标.
 *
 * 这一层不认识红黑树 / 图 / 链表:只从连接关系推形状.
 *
 * ```text
 * 输入:节点 + 有向指针 + 无向边
 *   │
 *   ├─ 只有 pointers 且构成森林(每个节点入度 <= 1、无环)
 *   │    -> 树形布局:自底向上合并轮廓,父节点在子节点正中(泛化到 N 个孩子)
 *   │
 *   └─ 其余(有 edges / 有环 / 一个节点多条入边)
 *        -> 环形布局:每个连通分量的节点排在一个圆上,边是圆内的弦
 * ```
 *
 * 为什么不用力导向:它要迭代 / 随机初值 / 调参,结果还依赖节点顺序;对一个
 * "把结构画出来给人看"的工具,确定性比"更漂亮"重要.环形布局对小型图足够可读,
 * 真正的图布局(分层 / 正交)等有第一个难看的例子再加.
 *
 * 坐标是**世界坐标**(单位 = 屏幕像素 @ 缩放 1),与视口多大无关.连线端点也在这里
 * 算好(收进节点圆边界 + 平行 / 反向分道),渲染层不再知道节点形状;内容实际占多大由
 * 渲染层量 `getBBox()` 后交给视口适应.
 */

import {
    VISUAL_LAYOUT_COMPONENT_GAP,
    VISUAL_LAYOUT_GRAPH_CHORD,
    VISUAL_LAYOUT_GRAPH_MIN_RADIUS,
    VISUAL_LAYOUT_TREE_LAYER_STEP,
    VISUAL_LAYOUT_TREE_MIN_GAP,
    VISUAL_LINK_LANE_GAP,
    VISUAL_LINK_NODE_GAP,
    VISUAL_NODE_RADIUS,
} from '@/visual/config';

// 输入 / 输出

/**
 * 布局只需要三种连接信息,不需要节点上的任何业务字段.
 *
 * 故意不 import datastruct 的 SceneDocument:视觉层与数据结构层互不认识;调用方
 * 把文档原样传进来即可(TS 结构化类型只检查字段形状).
 */
export interface SceneLayoutInput {
    readonly nodes: readonly { readonly key: number }[];
    readonly pointers: readonly { readonly from: number; readonly to: number }[];
    readonly edges: readonly { readonly a: number; readonly b: number }[];
}

/** 坐好标的节点(世界坐标) */
export interface SceneLayoutNode {
    readonly key: number;
    readonly x: number;
    readonly y: number;
}

/** 平面上的一个点(世界坐标) */
export interface SceneLayoutPoint {
    readonly x: number;
    readonly y: number;
}

/**
 * 一条要画的连线:两端节点 key + **已经算好的端点**.
 *
 * 端点在这里算而不在渲染层算,是因为它们依赖节点半径与"同一对节点有几条线":
 * - 线要从节点圆边出发,箭头才不会被圆盖住;
 * - 平行边 / 反向指针要横向分道,否则 `a->b` 与 `b->a` 会画成同一条线.
 *
 * `directed` 只描述方向语义(视觉层据此决定画不画箭头),不改变端点.
 */
export interface SceneLayoutLink {
    readonly from: number;
    readonly to: number;
    readonly directed: boolean;
    /** 起点(世界坐标,已收进节点圆边界并做过分道偏移) */
    readonly start: SceneLayoutPoint;
    /** 终点(世界坐标,同上) */
    readonly end: SceneLayoutPoint;
}

/** 一次布局的结果:节点坐标 + 连线(顺序与输入一致) */
export interface SceneLayout {
    /** 与输入 nodes 同序,便于调用方按下标对应 */
    readonly nodes: readonly SceneLayoutNode[];
    /** 先 pointers 后 edges,与输入顺序一致 */
    readonly links: readonly SceneLayoutLink[];
}

// 连通分量

interface Component {
    /** 分量内节点在输入里的下标(保持输入顺序) */
    readonly memberIndexes: number[];
}

/**
 * 弱连通分量:把有向指针当无向、无向边也当无向求连通块.
 *
 * 树形布局要求"一个分量只有一个根";图布局要求"一个分量一个圆".两种形状都需要
 * 先知道分量,所以搜索只写一份.分量与分量内节点都按输入顺序给出(确定性).
 */
function collectComponents(
    keyOfIndex: readonly number[],
    adjacency: ReadonlyMap<number, readonly number[]>,
): Component[] {
    const indexByKey = new Map(keyOfIndex.map((key, index) => [key, index] as const));
    const visited = new Set<number>();
    const components: Component[] = [];
    for (const key of keyOfIndex) {
        if (visited.has(key)) continue;
        const memberIndexes: number[] = [];
        const stack = [key];
        visited.add(key);
        while (stack.length > 0) {
            const current = stack.pop() as number;
            const index = indexByKey.get(current);
            if (index === undefined) throw new Error(`布局输入里没有节点 ${current}`);
            memberIndexes.push(index);
            for (const next of adjacency.get(current) ?? []) {
                if (visited.has(next)) continue;
                visited.add(next);
                stack.push(next);
            }
        }
        memberIndexes.sort((a, b) => a - b);
        components.push({ memberIndexes });
    }
    return components;
}

/** 建无向邻接表(指针与边都算连接) */
function buildAdjacency(
    keyOfIndex: readonly number[],
    pointers: SceneLayoutInput['pointers'],
    edges: SceneLayoutInput['edges'],
): Map<number, number[]> {
    const adjacency = new Map<number, number[]>(keyOfIndex.map((key) => [key, []]));
    const add = (a: number, b: number): void => {
        adjacency.get(a)?.push(b);
        adjacency.get(b)?.push(a);
    };
    for (const pointer of pointers) add(pointer.from, pointer.to);
    for (const edge of edges) add(edge.a, edge.b);
    return adjacency;
}

// 树形布局

/** 子树内部算出来的相对坐标:根 x = 0,depth = 层号 */
interface RelativeNode {
    readonly key: number;
    readonly x: number;
    readonly depth: number;
}

/** 一棵子树的形状:相对坐标的节点 + 每一层的最左 / 最右 x(下标 = 层号) */
interface SubtreeShape {
    readonly nodes: readonly RelativeNode[];
    readonly left: readonly number[];
    readonly right: readonly number[];
}

/**
 * 放一棵子树:轮廓合并(泛化到任意多个孩子).
 *
 * - 叶子:根在 x = 0;
 * - 单孩子:孩子放正下方(x = 0);
 * - 多孩子:先把孩子各自的形状按输入顺序从左到右排开,相邻两棵的错开量取
 *   "每一层都不撞"的最小值;最后父节点放在第一个与最后一个孩子正中.
 *
 * 父节点放在首尾孩子中点,而不是某一对孩子的中点:孩子数不固定时这是唯一
 * 与"左右对称"一致的位置;两个孩子时退化成以前的中点.
 */
function placeSubtree(key: number, depth: number, childrenOf: ReadonlyMap<number, readonly number[]>): SubtreeShape {
    const children = childrenOf.get(key) ?? [];
    if (children.length === 0) {
        return { nodes: [{ key, x: 0, depth }], left: [0], right: [0] };
    }

    // 已放好的孩子(相对坐标,轮廓下标 0 = 孩子这一层),以及第一个 / 最后一个孩子的根 x
    let placed: SubtreeShape | null = null;
    let lastRootX = 0;

    for (const child of children) {
        const shape = placeSubtree(child, depth + 1, childrenOf);
        if (placed === null) {
            placed = shape;
            lastRootX = 0;
            continue;
        }

        // 相邻错开量的下限:两棵子树在同一层都要至少隔一个 GAP
        let shift = VISUAL_LAYOUT_TREE_MIN_GAP;
        const sharedDepth = Math.min(placed.right.length, shape.left.length);
        for (let layer = 0; layer < sharedDepth; layer += 1) {
            const required = placed.right[layer] - shape.left[layer] + VISUAL_LAYOUT_TREE_MIN_GAP;
            if (required > shift) shift = required;
        }

        // 合并:节点整体右移 shift;轮廓逐层取 min / max(缺层的一侧不参与)
        const nodes: RelativeNode[] = [...placed.nodes];
        for (const node of shape.nodes) nodes.push({ key: node.key, x: node.x + shift, depth: node.depth });
        const mergedDepth = Math.max(placed.left.length, shape.left.length);
        const left: number[] = [];
        const right: number[] = [];
        for (let layer = 0; layer < mergedDepth; layer += 1) {
            const leftValues: number[] = [];
            const rightValues: number[] = [];
            if (layer < placed.left.length) {
                leftValues.push(placed.left[layer]);
                rightValues.push(placed.right[layer]);
            }
            if (layer < shape.left.length) {
                leftValues.push(shape.left[layer] + shift);
                rightValues.push(shape.right[layer] + shift);
            }
            left.push(Math.min(...leftValues));
            right.push(Math.max(...rightValues));
        }
        placed = { nodes, left, right };
        lastRootX = shift;
    }

    // 父节点放在首尾孩子正中;把整棵子树平移,使父节点回到 x = 0
    const rootX = lastRootX / 2;
    const nodes: RelativeNode[] = [{ key, x: 0, depth }];
    for (const node of (placed as SubtreeShape).nodes) {
        nodes.push({ key: node.key, x: node.x - rootX, depth: node.depth });
    }
    return {
        nodes,
        left: [0, ...(placed as SubtreeShape).left.map((value) => value - rootX)],
        right: [0, ...(placed as SubtreeShape).right.map((value) => value - rootX)],
    };
}

/** 一棵树的布局结果:节点相对坐标 + 包围盒(给多分量排布) */
interface ComponentPlacement {
    readonly nodes: readonly { readonly key: number; readonly x: number; readonly y: number }[];
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
}

function boundsOf(nodes: readonly { x: number; y: number }[]): Omit<ComponentPlacement, 'nodes'> {
    if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const node of nodes) {
        if (node.x < minX) minX = node.x;
        if (node.y < minY) minY = node.y;
        if (node.x > maxX) maxX = node.x;
        if (node.y > maxY) maxY = node.y;
    }
    return { minX, minY, maxX, maxY };
}

/**
 * 放一个树分量:rootIndex 是根在输入里的下标.
 *
 * 返回的坐标已经平移到"左上角在原点附近",但 x 的最小值可能是负数(轮廓合并
 * 以父节点为 0),由多分量排布统一平移.
 */
function layoutTreeComponent(
    rootIndex: number,
    keyOfIndex: readonly number[],
    childrenOf: ReadonlyMap<number, readonly number[]>,
): ComponentPlacement {
    const rootKey = keyOfIndex[rootIndex];
    const shape = placeSubtree(rootKey, 0, childrenOf);
    const raw = shape.nodes.map((node) => ({
        key: node.key,
        x: node.x,
        y: node.depth * VISUAL_LAYOUT_TREE_LAYER_STEP,
    }));
    // 轮廓法只保证同层不撞;整个分量按自己的包围盒收进 [0, ...]
    const bounds = boundsOf(raw);
    const nodes = raw.map((node) => ({ key: node.key, x: node.x - bounds.minX, y: node.y - bounds.minY }));
    return { nodes, ...boundsOf(nodes) };
}

/**
 * 判断能不能按树布局:只有指针、无环、每个节点入度 <= 1.
 *
 * 三条同时成立时,每个含指针的弱连通分量都是一棵有根树(边数 = 点数 - 1 且
 * 无环),根就是入度为 0 的那个节点.
 */
function isTreeLike(pointers: SceneLayoutInput['pointers'], edges: SceneLayoutInput['edges']): boolean {
    if (edges.length > 0) return false;
    const inDegree = new Map<number, number>();
    for (const pointer of pointers) {
        if (pointer.from === pointer.to) return false;
        inDegree.set(pointer.to, (inDegree.get(pointer.to) ?? 0) + 1);
        if ((inDegree.get(pointer.to) ?? 0) > 1) return false;
    }
    // 有向环检测:沿指针走,回到走过的节点就是环
    const outgoing = new Map<number, number[]>();
    for (const pointer of pointers) {
        const list = outgoing.get(pointer.from) ?? [];
        list.push(pointer.to);
        outgoing.set(pointer.from, list);
    }
    const state = new Map<number, 'visiting' | 'done'>();
    const visit = (key: number): boolean => {
        const current = state.get(key);
        if (current === 'visiting') return false;
        if (current === 'done') return true;
        state.set(key, 'visiting');
        for (const next of outgoing.get(key) ?? []) {
            if (!visit(next)) return false;
        }
        state.set(key, 'done');
        return true;
    };
    for (const key of outgoing.keys()) {
        if (!visit(key)) return false;
    }
    return true;
}

// 图布局(环形)

/**
 * 放一个图分量:节点按输入顺序排在圆上,从 12 点方向顺时针.
 *
 * 半径随节点数增长(圆周长 = 节点数 × 弧长),下限保证节点很少时圆不会缩成一点.
 * 圆心的 y 取半径,使分量的包围盒从 y = 0 开始(与树分量同一口径,便于并排).
 */
function layoutGraphComponent(component: Component, keyOfIndex: readonly number[]): ComponentPlacement {
    const count = component.memberIndexes.length;
    const radius = Math.max(VISUAL_LAYOUT_GRAPH_MIN_RADIUS, (count * VISUAL_LAYOUT_GRAPH_CHORD) / (2 * Math.PI));
    const center = { x: radius, y: radius };
    const nodes = component.memberIndexes.map((index, slot) => {
        const angle = -Math.PI / 2 + (slot * 2 * Math.PI) / Math.max(count, 1);
        return {
            key: keyOfIndex[index],
            x: center.x + radius * Math.cos(angle),
            y: center.y + radius * Math.sin(angle),
        };
    });
    return { nodes, ...boundsOf(nodes) };
}

// 连线端点

/** 同一对无向节点之间的连线分组键(方向不重要:反向指针也落在同一对里) */
function linkPairKey(a: number, b: number): string {
    return a <= b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * 同一对无向节点之间每条线的**分道偏移**(px,沿固定法向).
 *
 * 规则:同一无向节点对之间有 n 条线时,按输入顺序取
 * `(位置 - (n-1)/2) * VISUAL_LINK_LANE_GAP` 的横向偏移,整组以连线为中心左右对称.
 * 两个效果:
 * - 平行边(柯尼斯堡的 K-N ×2 / K-S ×2)不再重叠成一条;
 * - 反向指针 `a->b` + `b->a` 分到两侧,两枚箭头都看得见.
 *
 * 单独导出是因为动画每帧要**插值**这个偏移(分道数变化时不能瞬跳),不能每帧重新
 * 从零分组算完就丢:见 src/visual/motion.ts.
 */
export function assignLinkLanes(
    rawLinks: readonly { readonly from: number; readonly to: number }[],
): number[] {
    const laneOffsets = new Array<number>(rawLinks.length).fill(0);
    const groups = new Map<string, number[]>();
    rawLinks.forEach((link, index) => {
        const key = linkPairKey(link.from, link.to);
        const indexes = groups.get(key);
        if (indexes === undefined) groups.set(key, [index]);
        else indexes.push(index);
    });
    for (const indexes of groups.values()) {
        if (indexes.length < 2) continue;
        const center = (indexes.length - 1) / 2;
        indexes.forEach((linkIndex, position) => {
            laneOffsets[linkIndex] = (position - center) * VISUAL_LINK_LANE_GAP;
        });
    }
    return laneOffsets;
}

/**
 * 一条连线的端点:从节点圆心方向收进圆边界(半径 + 空隙),再沿固定法向分道.
 *
 * 这是布局与动画**共用**的端点公式:静态路径在 `buildLinks` 里用;动画每帧先用
 * 插值后的节点坐标,再对 `laneOffset` 插值,最后调这里重算端点 -- 节点在动时线段
 * 端点不会脱开圆边(见 docs/animation.md §5.3).
 *
 * `laneOffset` 已经带符号(调用方把"同对序号"折成正负),这里不再判断方向:
 * 法向固定为 `(-uy, ux)`,反向指针由调用方给负偏移来决定分到哪一侧.
 */
export function linkEndpoints(
    from: SceneLayoutPoint,
    to: SceneLayoutPoint,
    laneOffset: number,
): { readonly start: SceneLayoutPoint; readonly end: SceneLayoutPoint } {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) {
        // 自环:没有"从圆心指向圆心"的方向可收,交给渲染层时是零长度线段
        return { start: from, end: to };
    }

    const ux = dx / length;
    const uy = dy / length;
    const offsetX = -uy * laneOffset;
    const offsetY = ux * laneOffset;
    // 收进半径 + 空隙;线太短时最多收到一半,避免端点交叉
    const shorten = Math.max(0, Math.min(VISUAL_NODE_RADIUS + VISUAL_LINK_NODE_GAP, length / 2 - 0.5));

    return {
        start: {
            x: from.x + ux * shorten + offsetX,
            y: from.y + uy * shorten + offsetY,
        },
        end: {
            x: to.x - ux * shorten + offsetX,
            y: to.y - uy * shorten + offsetY,
        },
    };
}

/**
 * 给每条连线算端点:收进节点圆边界 + 同对连线横向分道.
 *
 * 法向取"无向对"的固定方向(按 key 大小定正负),而不是每条线自己的方向:否则反向
 * 指针的局部法向会翻回来,两条线又叠到一起.`linkEndpoints` 只认带符号的偏移,
 * 这个 canonical 符号在这里折进去.
 */
function buildLinks(
    rawLinks: readonly { readonly from: number; readonly to: number; readonly directed: boolean }[],
    pointOf: (key: number) => SceneLayoutPoint,
): SceneLayoutLink[] {
    const laneOffsets = assignLinkLanes(rawLinks);

    return rawLinks.map((link, index) => {
        const from = pointOf(link.from);
        const to = pointOf(link.to);
        const canonical = link.from <= link.to ? 1 : -1;
        const endpoints = linkEndpoints(from, to, (laneOffsets[index] ?? 0) * canonical);
        return { ...link, ...endpoints };
    });
}

// 出口

/**
 * 给一份中性场景算布局.
 *
 * 步骤:①建无向邻接求连通分量;②逐分量选树 / 环形布局;③把分量从左到右并排
 * (统一上沿对齐,分量间留 COMPONENT_GAP).同一输入永远给同一结果(节点顺序、
 * 分量顺序都按输入),测试可以逐字断言坐标关系.
 */
export function layoutScene(input: SceneLayoutInput): SceneLayout {
    const keyOfIndex = input.nodes.map((node) => node.key);
    if (new Set(keyOfIndex).size !== keyOfIndex.length) {
        throw new Error('布局输入的节点 key 重复');
    }
    const adjacency = buildAdjacency(keyOfIndex, input.pointers, input.edges);
    const components = collectComponents(keyOfIndex, adjacency);
    const treeLike = isTreeLike(input.pointers, input.edges);

    // 树形布局要按"入度 0"找根:没有指针时每个节点自己就是一棵单节点树
    const inDegree = new Map<number, number>();
    for (const pointer of input.pointers) {
        inDegree.set(pointer.to, (inDegree.get(pointer.to) ?? 0) + 1);
    }
    const childrenOf = new Map<number, number[]>();
    for (const pointer of input.pointers) {
        const list = childrenOf.get(pointer.from) ?? [];
        list.push(pointer.to);
        childrenOf.set(pointer.from, list);
    }

    const placements = components.map((component) => {
        if (!treeLike) return layoutGraphComponent(component, keyOfIndex);
        const rootIndex = component.memberIndexes.find((index) => (inDegree.get(keyOfIndex[index]) ?? 0) === 0)
            ?? component.memberIndexes[0];
        return layoutTreeComponent(rootIndex, keyOfIndex, childrenOf);
    });

    // 分量从左到右并排:每个分量的包围盒上沿对齐 y = 0,x 接在前一个右边
    const placed = new Map<number, SceneLayoutNode>();
    let offsetX = 0;
    for (const placement of placements) {
        for (const node of placement.nodes) {
            placed.set(node.key, { key: node.key, x: node.x + offsetX, y: node.y });
        }
        offsetX = placement.maxX + VISUAL_LAYOUT_COMPONENT_GAP;
    }

    const nodes = keyOfIndex.map((key) => {
        const node = placed.get(key);
        if (node === undefined) throw new Error(`布局没有给节点 ${key} 算坐标`);
        return node;
    });
    const pointOf = (key: number): SceneLayoutPoint => {
        const node = placed.get(key);
        if (node === undefined) throw new Error(`布局没有给节点 ${key} 算坐标`);
        return node;
    };
    const rawLinks = [
        ...input.pointers.map((pointer) => ({ from: pointer.from, to: pointer.to, directed: true })),
        ...input.edges.map((edge) => ({ from: edge.a, to: edge.b, directed: false })),
    ];
    return { nodes, links: buildLinks(rawLinks, pointOf) };
}
