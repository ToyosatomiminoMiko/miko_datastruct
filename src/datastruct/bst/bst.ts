/*
 * 二叉搜索树(BST)的结构模型 + 演示轨迹生成(纯逻辑,不碰 DOM).
 *
 * 这一层只做两件事:
 * - `TreeModel`:节点身份(`key` = 创建序号,稳定)+ 整棵树的快照;
 * - `*Frames()`:普通算法,外加每改完一拍 `yield` 一个 `TraceFrame`. 帧里没有 document:
 *   记录器(`recordFrames` / `TraceBuilder`)会在 yield 那一刻向模型要快照,所以算法
 *   不可能把"改到一半"的结构拍下来(见 docs/animation.md §2、§4).
 *
 * 几条必须守住的约定(见 docs/animation.md §4、§5.4、§13):
 * - 节点身份是 `key`(创建序号),`label` 才是 `String(value)`;删除双孩子节点用
 *   **物理移植**——把后继节点整个接到被删位置,不是复制值,颜色 / 高亮才跟着节点走;
 * - 快照里 `nodes` 按 key 升序,`pointers` 按"父节点 key 升序,每个父 left 再 right"
 *   输出;`pointers` 顺序承载左右语义(自动布局按输入顺序从左到右放孩子);
 * - 旋转的三次指针改写是一帧内的**原子操作**:`rotateLeft` / `rotateRight` 内部不
 *   yield 中间态,轨迹里只有旋转前后两帧(中间态甚至不是一棵合法 BST);
 * - 空树 / 单节点 / 删到空都要能产出快照,播放器不能假设每帧都有 focus.
 *
 * 高亮词表(`TraceNodeState`)与镜头提示(`focus` / `frame` / `framing` / `anchor`)只是
 * 给播放器的提示,不进 `attrs`;颜色是结构语义,只在 `snapshot({ colors: true })` 时写.
 */

import type { SceneDocument, SceneDocumentNode, SceneDocumentPointer } from '@/scene/scene_document';
import type { TraceFrame, TraceLinkMark, TraceNodeMark, TraceNodeState } from '@/datastruct/trace/trace';

/** 节点颜色:BST 不使用,红黑树用它表达结构语义 */
export type TreeNodeColor = 'red' | 'black';

/** 树上的一颗节点:身份是 `key`,展示值是 `label`(= `String(value)`) */
export interface TreeNode {
    /** 稳定身份 = 创建序号;轨迹的 focus / marks / motion 都按它引用节点 */
    readonly key: number;
    readonly value: number;
    left: TreeNode | null;
    right: TreeNode | null;
    parent: TreeNode | null;
    color: TreeNodeColor;
}

/** 快照选项:是否把颜色写进 `attrs`(红黑树要,BST 不要) */
export interface SnapshotOptions {
    readonly colors?: boolean;
}

/** 一帧的镜头 / 节奏选项 */
export interface FrameOptions {
    /** 覆盖这一拍的默认停留时间(机械步骤可以短一点) */
    readonly holdMs?: number;
    /** 插入 / 退化这类步骤:完成帧用 `framing: 'fit'` 让整棵树留在镜头里 */
    readonly fitCamera?: boolean;
}

/** 树模型:根 + 节点登记表 + 稳定 key 分配器 */
export class TreeModel {
    root: TreeNode | null = null;
    /** key -> 节点(只含仍在树上的节点;删除时同步移除) */
    readonly nodes = new Map<number, TreeNode>();

    /** 下一个要分配的 key.清空后归零:一棵新树从 0 开始,轨迹才可复现 */
    private nextKey = 0;

    /** 分配 key 并登记节点;不挂到树上(挂接由调用方做,便于"创建即可见"的帧) */
    createNode(value: number, color: TreeNodeColor = 'black'): TreeNode {
        const node: TreeNode = {
            key: this.nextKey,
            value,
            left: null,
            right: null,
            parent: null,
            color,
        };
        this.nextKey += 1;
        this.nodes.set(node.key, node);
        return node;
    }

    /** 清空成一棵空树(节点登记表与 key 分配器一起重置) */
    clear(): void {
        this.root = null;
        this.nodes.clear();
        this.nextKey = 0;
    }

    /** 普通 BST 插入(不产轨迹),按 values 顺序建树;重复值忽略 */
    build(values: readonly number[]): this {
        for (const value of values) this.insertValue(value);
        return this;
    }

    find(value: number): TreeNode | null {
        let current = this.root;
        while (current !== null) {
            if (value === current.value) return current;
            current = value < current.value ? current.left : current.right;
        }
        return null;
    }

    findByKey(key: number): TreeNode | null {
        return this.nodes.get(key) ?? null;
    }

    /** 中序遍历:节点按值升序(合法 BST 的前提) */
    inOrder(): TreeNode[] {
        const result: TreeNode[] = [];
        const visit = (node: TreeNode | null): void => {
            if (node === null) return;
            visit(node.left);
            result.push(node);
            visit(node.right);
        };
        visit(this.root);
        return result;
    }

    preOrder(): TreeNode[] {
        const result: TreeNode[] = [];
        const visit = (node: TreeNode | null): void => {
            if (node === null) return;
            result.push(node);
            visit(node.left);
            visit(node.right);
        };
        visit(this.root);
        return result;
    }

    postOrder(): TreeNode[] {
        const result: TreeNode[] = [];
        const visit = (node: TreeNode | null): void => {
            if (node === null) return;
            visit(node.left);
            visit(node.right);
            result.push(node);
        };
        visit(this.root);
        return result;
    }

    /** 层数:空树 0,根算第 1 层 */
    height(): number {
        const depth = (node: TreeNode | null): number => {
            if (node === null) return 0;
            return 1 + Math.max(depth(node.left), depth(node.right));
        };
        return depth(this.root);
    }

    /** 子树里的最小节点(一路往左) */
    minimum(node: TreeNode): TreeNode {
        let current = node;
        while (current.left !== null) current = current.left;
        return current;
    }

    /** node 及其整棵子树的 key(含 node;前序,确定性的顺序) */
    subtreeKeys(node: TreeNode): number[] {
        const result: number[] = [];
        const visit = (current: TreeNode | null): void => {
            if (current === null) return;
            result.push(current.key);
            visit(current.left);
            visit(current.right);
        };
        visit(node);
        return result;
    }

    /**
     * 这一帧的完整中性场景文档.
     *
     * - `nodes` 按 key 升序(遍历后排序,不依赖 Map 插入顺序);
     * - `pointers` 按父节点 key 升序、每个父 left 再 right;
     * - `attrs` 默认 `{}`,红黑树传 `{ colors: true }` 才写 `{ color }`.
     */
    snapshot(options?: SnapshotOptions): SceneDocument {
        const live: TreeNode[] = [];
        const visit = (node: TreeNode | null): void => {
            if (node === null) return;
            live.push(node);
            visit(node.left);
            visit(node.right);
        };
        visit(this.root);
        live.sort((a, b) => a.key - b.key);

        const colors = options?.colors === true;
        const nodes: SceneDocumentNode[] = live.map((node) => {
            const attrs: Readonly<Record<string, string>> = colors ? { color: node.color } : {};
            return { key: node.key, label: String(node.value), attrs };
        });

        const pointers: SceneDocumentPointer[] = [];
        for (const node of live) {
            if (node.left !== null) pointers.push({ from: node.key, to: node.left.key });
            if (node.right !== null) pointers.push({ from: node.key, to: node.right.key });
        }

        return { nodes, pointers, edges: [] };
    }

    /** build 的单次插入:重复值不新建节点 */
    private insertValue(value: number): TreeNode {
        if (this.root === null) {
            this.root = this.createNode(value);
            return this.root;
        }
        let current = this.root;
        while (true) {
            if (value === current.value) return current;
            if (value < current.value) {
                if (current.left === null) {
                    const created = this.createNode(value);
                    current.left = created;
                    created.parent = current;
                    return created;
                }
                current = current.left;
            } else {
                if (current.right === null) {
                    const created = this.createNode(value);
                    current.right = created;
                    created.parent = current;
                    return created;
                }
                current = current.right;
            }
        }
    }
}

// 旋转
// 三次指针改写必须在一次调用里做完(中间态不是合法 BST);调用方只在前后各拍一帧.

/** 左旋:node 下沉、node.right 上位,返回新的子树根 y */
export function rotateLeft(tree: TreeModel, node: TreeNode): TreeNode {
    const y = node.right;
    if (y === null) throw new Error(`节点 ${node.value} 没有右孩子,不能左旋`);
    node.right = y.left;
    if (y.left !== null) y.left.parent = node;
    y.parent = node.parent;
    if (node.parent === null) {
        tree.root = y;
    } else if (node.parent.left === node) {
        node.parent.left = y;
    } else {
        node.parent.right = y;
    }
    y.left = node;
    node.parent = y;
    return y;
}

/** 右旋:node 下沉、node.left 上位,返回新的子树根 y */
export function rotateRight(tree: TreeModel, node: TreeNode): TreeNode {
    const y = node.left;
    if (y === null) throw new Error(`节点 ${node.value} 没有左孩子,不能右旋`);
    node.left = y.right;
    if (y.right !== null) y.right.parent = node;
    y.parent = node.parent;
    if (node.parent === null) {
        tree.root = y;
    } else if (node.parent.left === node) {
        node.parent.left = y;
    } else {
        node.parent.right = y;
    }
    y.right = node;
    node.parent = y;
    return y;
}

// 轨迹生成的公共小工具

/** 把 FrameOptions.holdMs 摊进帧里(没给就不写这个键,保持帧对象干净) */
function holdOf(options?: FrameOptions): Pick<TraceFrame, 'holdMs'> {
    return options?.holdMs === undefined ? {} : { holdMs: options.holdMs };
}

/** 完成帧的镜头策略:插入 / 删除这类会重排整棵树的步骤可选整幅适应 */
function fitOf(options?: FrameOptions): Pick<TraceFrame, 'framing'> {
    return options?.fitCamera === true ? { framing: 'fit' } : {};
}

/** 高亮:路径上的节点 + 当前节点(当前节点的状态由调用方给) */
function trailMarks(
    path: readonly TreeNode[],
    current: TreeNode | null,
    currentState: TraceNodeState = 'active',
): { nodes: TraceNodeMark[]; links: TraceLinkMark[] } {
    const nodes: TraceNodeMark[] = path.map((node) => ({ key: node.key, state: 'path' as const }));
    const links: TraceLinkMark[] = [];
    for (let index = 1; index < path.length; index += 1) {
        const from = path[index - 1];
        const to = path[index];
        if (from !== undefined && to !== undefined) links.push({ from: from.key, to: to.key, state: 'path' });
    }
    if (current !== null) {
        nodes.push({ key: current.key, state: currentState });
        const last = path[path.length - 1];
        if (last !== undefined) links.push({ from: last.key, to: current.key, state: 'path' });
    }
    return { nodes, links };
}

/** 一串节点的 mark(用于遍历 / 整棵树点亮) */
function marksOf(nodes: readonly TreeNode[], state: TraceNodeState): TraceNodeMark[] {
    return nodes.map((node) => ({ key: node.key, state }));
}

/**
 * 查找:每比较一次 yield 一拍,路径累积;命中最后一拍 state 'found',失败最后一拍
 * 用 detail 说明"将插在这里"(虚线圈画不出来,交给叙述).
 */
export function* searchFrames(tree: TreeModel, value: number, options?: FrameOptions): Generator<TraceFrame> {
    const hold = holdOf(options);
    if (tree.root === null) {
        yield { ...hold, title: `空树`, detail: `树是空的,${value} 将插在这里(成为根)`, marks: { nodes: [] } };
        return;
    }

    const path: TreeNode[] = [];
    let current: TreeNode | null = tree.root;
    while (current !== null) {
        if (current.value === value) {
            yield {
                ...hold,
                title: `命中 ${value}`,
                detail: `比较到节点 ${value},相等,查找命中`,
                focus: current.key,
                anchor: current.key,
                marks: trailMarks(path, current, 'found'),
            };
            return;
        }
        const goLeft: boolean = value < current.value;
        yield {
            ...hold,
            title: `比较 ${value} 与 ${current.value}`,
            detail: goLeft ? `${value} < ${current.value},走左子树` : `${value} > ${current.value},走右子树`,
            focus: current.key,
            anchor: current.key,
            marks: trailMarks(path, current, 'active'),
        };
        path.push(current);
        current = goLeft ? current.left : current.right;
    }

    const last = path[path.length - 1];
    yield {
        ...hold,
        title: `未找到 ${value}`,
        detail: last === undefined
            ? `${value} 将插在这里(成为根)`
            : `走到空位,${value} 将插在这里(节点 ${last.value} 的${value < last.value ? '左' : '右'}边)`,
        ...(last === undefined ? {} : { focus: last.key }),
        marks: trailMarks(path, null),
    };
}

/**
 * 插入:沿路径比较的每一拍都 yield;插入完成帧 focus 新 key、anchor 父 key、mark
 * 'fresh';已存在同值只 yield 一拍说明不重复插入.
 */
export function* insertFrames(tree: TreeModel, value: number, options?: FrameOptions): Generator<TraceFrame> {
    const hold = holdOf(options);

    const path: TreeNode[] = [];
    let parent: TreeNode | null = null;
    let goLeft = true;
    let current: TreeNode | null = tree.root;
    while (current !== null) {
        if (current.value === value) {
            yield {
                ...hold,
                title: `已存在 ${value}`,
                detail: `值 ${value} 已经在树中,不重复插入`,
                focus: current.key,
                anchor: current.key,
                marks: trailMarks(path, current, 'found'),
            };
            return;
        }
        const left = value < current.value;
        yield {
            ...hold,
            title: `比较 ${value} 与 ${current.value}`,
            detail: left ? `${value} < ${current.value},走左子树` : `${value} > ${current.value},走右子树`,
            focus: current.key,
            anchor: current.key,
            marks: trailMarks(path, current, 'active'),
        };
        path.push(current);
        parent = current;
        goLeft = left;
        current = left ? current.left : current.right;
    }

    const created = tree.createNode(value);
    if (parent === null) {
        tree.root = created;
    } else if (goLeft) {
        parent.left = created;
        created.parent = parent;
    } else {
        parent.right = created;
        created.parent = parent;
    }

    const nodes: TraceNodeMark[] = [
        ...path.map((node) => ({ key: node.key, state: 'path' as const })),
        { key: created.key, state: 'fresh' },
    ];
    yield {
        ...hold,
        ...fitOf(options),
        title: `插入 ${value}`,
        detail: parent === null
            ? `空树,${value} 成为根节点;中序仍然升序`
            : `${value} 挂在节点 ${parent.value} 的${goLeft ? '左' : '右'}边;中序仍然升序`,
        focus: created.key,
        ...(parent === null ? {} : { anchor: parent.key }),
        marks: { nodes },
    };
}

/**
 * 删除:先查找(叶子 / 单孩子 / 双孩子三种叙述),双孩子先找右子树最小(后继)再
 * **物理移植**;单孩子完成帧用 `motion: { kind: 'subtree' }` 让子树整体上移.
 *
 * 删除完成帧的 anchor 取父节点;删根时取仍存在的孩子 / 后继(锚到被删的根上,
 * 整棵子树才往上填);树空则不锚.
 */
export function* deleteFrames(tree: TreeModel, value: number, options?: FrameOptions): Generator<TraceFrame> {
    const hold = holdOf(options);
    if (tree.root === null) {
        yield { ...hold, title: `空树`, detail: `树是空的,没有 ${value} 可删除`, marks: { nodes: [] } };
        return;
    }

    const path: TreeNode[] = [];
    let current: TreeNode | null = tree.root;
    while (current !== null && current.value !== value) {
        const goLeft: boolean = value < current.value;
        yield {
            ...hold,
            title: `比较 ${value} 与 ${current.value}`,
            detail: goLeft ? `${value} < ${current.value},走左子树找` : `${value} > ${current.value},走右子树找`,
            focus: current.key,
            anchor: current.key,
            marks: trailMarks(path, current, 'active'),
        };
        path.push(current);
        current = goLeft ? current.left : current.right;
    }

    if (current === null) {
        const last = path[path.length - 1];
        yield {
            ...hold,
            title: `未找到 ${value}`,
            detail: `走到空位,${value} 不在树中,无需删除`,
            ...(last === undefined ? {} : { focus: last.key }),
            marks: trailMarks(path, null),
        };
        return;
    }

    const target = current;
    const left = target.left;
    const right = target.right;
    const parent = target.parent;
    const childCount = (left === null ? 0 : 1) + (right === null ? 0 : 1);
    yield {
        ...hold,
        title: `找到 ${value}`,
        detail: childCount === 0
            ? `${value} 是叶子,直接摘除`
            : childCount === 1
                ? `${value} 只有一个孩子,用孩子接替它的位置`
                : `${value} 有两个孩子,先找右子树最小节点(后继)`,
        focus: target.key,
        anchor: target.key,
        marks: trailMarks(path, target, 'found'),
    };

    let replacement: TreeNode | null = left ?? right;
    let motion: TraceFrame['motion'];
    let title: string;
    let detail: string;

    if (left !== null && right !== null) {
        // 后继 = 右子树最小;沿路点亮,最后一拍标记 'found'
        let successor = right;
        while (successor.left !== null) {
            yield {
                ...hold,
                title: `找右子树最小`,
                detail: `${successor.value} 还有左孩子,继续往左找更小的`,
                focus: successor.key,
                anchor: successor.key,
                marks: {
                    nodes: [
                        { key: target.key, state: 'ghost' },
                        { key: successor.key, state: 'ghost' },
                    ],
                },
            };
            successor = successor.left;
        }
        yield {
            ...hold,
            title: `找到后继 ${successor.value}`,
            detail: `右子树最小节点是 ${successor.value},它接替 ${value} 的位置`,
            focus: successor.key,
            anchor: successor.key,
            marks: {
                nodes: [
                    { key: target.key, state: 'ghost' },
                    { key: successor.key, state: 'found' },
                ],
            },
        };

        // 物理移植:后继整个接到被删位置(不是复制值)
        const movedParent = successor.parent;
        const movedRight = successor.right;
        if (movedParent !== null && movedParent !== target) {
            movedParent.left = movedRight;
            if (movedRight !== null) movedRight.parent = movedParent;
        }
        successor.parent = parent;
        if (parent === null) {
            tree.root = successor;
        } else if (parent.left === target) {
            parent.left = successor;
        } else {
            parent.right = successor;
        }
        successor.left = left;
        left.parent = successor;
        if (movedParent !== target) {
            successor.right = right;
            right.parent = successor;
        }
        replacement = successor;
        title = `删除双孩子节点 ${value}(物理移植后继)`;
        detail = `${successor.value}(后继)接过 ${value} 的位置;${value} 被摘除,中序仍然升序`;
    } else if (replacement === null) {
        if (parent === null) {
            tree.root = null;
        } else if (parent.left === target) {
            parent.left = null;
        } else {
            parent.right = null;
        }
        title = `删除叶子 ${value}`;
        detail = `${value} 是叶子,直接摘除;中序仍然升序`;
    } else {
        const child = replacement;
        if (parent === null) {
            tree.root = child;
            child.parent = null;
        } else if (parent.left === target) {
            parent.left = child;
            child.parent = parent;
        } else {
            parent.right = child;
            child.parent = parent;
        }
        motion = { kind: 'subtree', root: child.key };
        title = `删除单孩子节点 ${value}(${child.value} 整棵子树向上接替)`;
        detail = `节点 ${value} 只有一个孩子 ${child.value},孩子的子树整体上移;中序仍然升序`;
    }

    tree.nodes.delete(target.key);
    target.left = null;
    target.right = null;
    target.parent = null;

    // 锚定:父节点不动;删根且树非空时把接替者锚到被删的根上
    const marks: { nodes: TraceNodeMark[] } = { nodes: [] };
    if (parent !== null) marks.nodes.push({ key: parent.key, state: 'path' });
    if (replacement !== null) marks.nodes.push({ key: replacement.key, state: 'fresh' });

    yield {
        ...hold,
        ...fitOf(options),
        title,
        detail,
        focus: replacement?.key ?? parent?.key,
        ...(parent !== null ? { anchor: parent.key } : {}),
        ...(parent === null && replacement !== null
            ? { anchor: replacement.key, anchorAt: target.key }
            : {}),
        ...(motion === undefined ? {} : { motion }),
        marks,
    };
}

/**
 * 遍历:每访问一个节点 yield 一拍;已访问标 'visited',当前标 'active',detail 累积
 * 访问序列.空树也 yield 一拍,播放器不必假设"每步都有节点".
 */
export function* traverseFrames(
    tree: TreeModel,
    order: 'in' | 'pre' | 'post',
    options?: FrameOptions,
): Generator<TraceFrame> {
    const hold = holdOf(options);
    const nodes = order === 'in' ? tree.inOrder() : order === 'pre' ? tree.preOrder() : tree.postOrder();
    const orderName = order === 'in' ? '中序' : order === 'pre' ? '前序' : '后序';

    if (nodes.length === 0) {
        yield { ...hold, title: `${orderName}遍历`, detail: '空树没有可访问的节点', marks: { nodes: [] } };
        return;
    }

    const visited: TreeNode[] = [];
    for (const node of nodes) {
        visited.push(node);
        yield {
            ...hold,
            title: `${orderName}遍历:访问 ${node.value}`,
            detail: `已访问序列:${visited.map((item) => item.value).join(' ')}`,
            focus: node.key,
            anchor: node.key,
            marks: { nodes: marksOf(visited, 'visited').map((mark) =>
                mark.key === node.key ? { key: mark.key, state: 'active' as const } : mark) },
        };
    }
}

/**
 * 旋转轨迹:先一帧"认出 p / x / y / α / β / γ"(镜头 hold 不动),再一帧旋转完成
 * (motion: rotate(from = x, to = y)),最后一帧验证中序.
 *
 * 要转的那一侧没有孩子时不是旋转:只讲解、不生成帧,函数直接结束.
 */
export function* rotateFrames(
    tree: TreeModel,
    direction: 'left' | 'right',
    value: number,
    options?: FrameOptions,
): Generator<TraceFrame> {
    const hold = holdOf(options);
    const target = tree.find(value);
    if (target === null) return;

    const child = direction === 'left' ? target.right : target.left;
    if (child === null) return;

    // 认轴:p / x / y / α / β / γ(左旋:α = x.left,β = y.left,γ = y.right;右旋镜像)
    const p = target.parent;
    const alpha = direction === 'left' ? target.left : child.left;
    const beta = direction === 'left' ? child.left : child.right;
    const gamma = direction === 'left' ? child.right : target.right;
    const introKeys: number[] = [];
    for (const node of [p, target, child, alpha, beta, gamma]) {
        if (node !== null && !introKeys.includes(node.key)) introKeys.push(node.key);
    }
    yield {
        ...hold,
        title: `认出旋转轴:${direction === 'left' ? '左旋' : '右旋'} ${value}`,
        detail: `只改三根指针:${value} 下沉,${child.value} 上位,β 子树换父;中序不变,p→x 变成 p→y`,
        focus: target.key,
        frame: introKeys,
        framing: 'hold',
        marks: {
            nodes: [
                ...(p === null ? [] : [{ key: p.key, state: 'path' as const }]),
                { key: target.key, state: 'active' as const },
                { key: child.key, state: 'found' as const },
            ],
        },
    };

    // 三次指针改写是一帧内的原子操作,这里不 yield 中间态
    const newRoot = direction === 'left' ? rotateLeft(tree, target) : rotateRight(tree, target);

    const completionKeys: number[] = [];
    for (const node of [p, target, newRoot, alpha, beta, gamma]) {
        if (node !== null && !completionKeys.includes(node.key)) completionKeys.push(node.key);
    }
    yield {
        ...hold,
        title: `${direction === 'left' ? '左旋' : '右旋'}完成:${child.value} 上位`,
        detail: `${child.value} 顶到 ${value} 原来的位置,${value} 下沉;β 子树改挂到 ${value} 的${direction === 'left' ? '右' : '左'}边`,
        focus: child.key,
        frame: completionKeys,
        framing: 'hold',
        anchor: child.key,
        anchorAt: target.key,
        motion: { kind: 'rotate', from: target.key, to: child.key },
        marks: {
            nodes: [
                ...(p === null ? [] : [{ key: p.key, state: 'path' as const }]),
                { key: target.key, state: 'active' as const },
                { key: child.key, state: 'found' as const },
            ],
        },
    };

    const sequence = tree.inOrder().map((node) => node.value).join(' ');
    yield {
        ...hold,
        title: `验证中序不变`,
        detail: `旋转前后中序完全相同:${sequence}`,
        frame: tree.inOrder().map((node) => node.key),
        framing: 'hold',
        marks: { nodes: marksOf(tree.inOrder(), 'visited') },
    };
}

/**
 * 第 1 章:整棵树 + 中序升序,2 拍.
 *
 * 第一拍 `framing: 'fit'` 把整棵树放进镜头;第二拍全部节点标 'visited',detail 给出
 * 中序序列,用"中序 = 升序"证明二叉搜索树有序.
 */
export function* shapeFrames(tree: TreeModel, options?: FrameOptions): Generator<TraceFrame> {
    const hold = holdOf(options);
    const ordered = tree.inOrder();
    const keys = ordered.map((node) => node.key);
    yield {
        ...hold,
        title: '整棵树',
        detail: ordered.length === 0 ? '空树' : `共 ${ordered.length} 个节点,高度 ${tree.height()} 层(根算第 1 层)`,
        frame: keys,
        framing: 'fit',
        marks: { nodes: [] },
    };
    yield {
        ...hold,
        title: '中序遍历就是升序',
        detail: `中序访问序列:${ordered.length === 0 ? '(空)' : ordered.map((node) => node.value).join(' ')}`,
        frame: keys,
        framing: 'fit',
        marks: { nodes: marksOf(ordered, 'visited') },
    };
}
