/*
 * 中性场景的**自动布局**:给节点 / 指针 / 边算平面坐标.
 *
 * 这一层不认识红黑树 / 图 / 链表:只从连接关系推形状.
 *
 * ```text
 * 输入:节点 + 有向指针 + 无向边
 *   │
 *   ├─ 只有 pointers 且构成森林(每个节点入度 <= 1、无环)
 *   │    -> 树形布局:自底向上合并轮廓,父节点在子节点正中(与旧 rbt_layout 同一算法,泛化到 N 个孩子)
 *   │
 *   └─ 其余(有 edges / 有环 / 一个节点多条入边)
 *        -> 环形布局:每个连通分量的节点排在一个圆上,边是圆内的弦
 * ```
 *
 * 为什么不用力导向:它要迭代 / 随机初值 / 调参,结果还依赖节点顺序;对一个
 * "把结构画出来给人看"的工具,确定性比"更漂亮"重要.环形布局对小型图足够可读,
 * 真正的图布局(分层 / 正交)等有第一个难看的例子再加.
 *
 * 坐标是**世界坐标**(单位 = 屏幕像素 @ 缩放 1),与视口多大无关;节点半径不在这里,
 * 内容实际占多大由渲染层量 `getBBox()` 后交给视口适应.
 */

import {
    VISUAL_LAYOUT_COMPONENT_GAP,
    VISUAL_LAYOUT_GRAPH_CHORD,
    VISUAL_LAYOUT_GRAPH_MIN_RADIUS,
    VISUAL_LAYOUT_TREE_LAYER_STEP,
    VISUAL_LAYOUT_TREE_MIN_GAP,
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

/** 一条要画的连线:两端都是节点 key(有向指针与无向边在视觉上都是线段) */
export interface SceneLayoutLink {
    readonly from: number;
    readonly to: number;
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
 * 与旧 rbt_layout 的差别只有最后一条:那里固定两个孩子,父节点在它们中点;这里
 * 用首尾孩子中点,两个孩子时退化成同一个结果.
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
    const links: SceneLayoutLink[] = [
        ...input.pointers.map((pointer) => ({ from: pointer.from, to: pointer.to })),
        ...input.edges.map((edge) => ({ from: edge.a, to: edge.b })),
    ];
    return { nodes, links };
}
