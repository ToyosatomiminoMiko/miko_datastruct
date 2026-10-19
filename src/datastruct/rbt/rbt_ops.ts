/*
 * 红黑树(RBT)插入 / 删除的演示轨迹生成(纯逻辑,不碰 DOM).
 *
 * 结构模型与快照复用 `@/datastruct/bst/bst` 的 `TreeModel`:节点身份、旋转、中性文档
 * 都只有一份实现.颜色是 RBT 独有的结构语义,只在本文件里改.
 *
 * 算法按 CLRS 讲:
 * - 插入:新节点先染红,fixup 情形 1(叔叔红)/ 2(内侧孩子先转成外侧)/ 3(外侧孩子
 *   染色 + 旋转),最后根染黑;
 * - 删除:双孩子**物理移植后继**(记录后继颜色),被删的是黑色就出现"双黑",四情形
 *   (兄弟红 / 兄弟黑且两孩子黑 / 兄弟黑且近侄红 / 兄弟黑且远侄红)修复.
 *
 * 关键约定(见 docs/animation.md §8、§13):
 * - 中间帧**故意**可能违反红孩子 / 黑高:检查窗口当场 FAIL 再 PASS 就是教学内容;
 * - 但每一帧的树本身必须是**合法 BST**(中序升序、每节点最多两个孩子、引用有效),
 *   所以旋转与移植都一次性做完再 yield,绝不拍半成品;
 * - 每完成一次结构 / 颜色改动就 yield 一帧,记录器在 yield 时取快照;
 * - 教学路径由测试钉住:fixup 帧标题必须出现"情形 1/2/3",删除帧必须出现"双黑".
 */

import type { TraceFrame } from '@/datastruct/trace/trace';
import {
    rotateLeft,
    rotateRight,
    type FrameOptions,
    type TreeModel,
    type TreeNode,
    type TreeNodeColor,
} from '@/datastruct/bst/bst';

/** 把 FrameOptions.holdMs 摊进帧(没给就不写这个键) */
function holdOf(options?: FrameOptions): Pick<TraceFrame, 'holdMs'> {
    return options?.holdMs === undefined ? {} : { holdMs: options.holdMs };
}

/** 完成帧的镜头策略:整棵树会重排的步骤可选整幅适应 */
function fitOf(options?: FrameOptions): Pick<TraceFrame, 'framing'> {
    return options?.fitCamera === true ? { framing: 'fit' } : {};
}

/** null 视为黑(nil 叶子是黑的,这是黑高口径的一部分) */
function isBlack(node: TreeNode | null): boolean {
    return node === null || node.color === 'black';
}

// 插入

/**
 * RBT 插入:二叉搜索树插入(红) + CLRS fixup.
 *
 * 每一拍:比较 -> 插入(红) -> 情形 1/2/3 各一次 -> 根染黑 -> 完成.
 * 已存在同值只 yield 一拍,不重复插入.
 */
export function* rbtInsertFrames(tree: TreeModel, value: number, options?: FrameOptions): Generator<TraceFrame> {
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
                marks: { nodes: [...path.map((node) => ({ key: node.key, state: 'path' as const })), { key: current.key, state: 'found' }] },
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
            marks: { nodes: [...path.map((node) => ({ key: node.key, state: 'path' as const })), { key: current.key, state: 'active' }] },
        };
        path.push(current);
        parent = current;
        goLeft = left;
        current = left ? current.left : current.right;
    }

    const node = tree.createNode(value, 'red');
    if (parent === null) {
        tree.root = node;
    } else if (goLeft) {
        parent.left = node;
        node.parent = parent;
    } else {
        parent.right = node;
        node.parent = parent;
    }

    yield {
        ...hold,
        title: `插入 ${value}(红)`,
        detail: parent === null
            ? `空树,${value} 先作为红色根节点`
            : `${value} 先染红,挂在 ${parent.value} 的${goLeft ? '左' : '右'}边;此时可能违反"红孩子"`,
        focus: node.key,
        ...(parent === null ? {} : { anchor: parent.key }),
        marks: { nodes: [...path.map((item) => ({ key: item.key, state: 'path' as const })), { key: node.key, state: 'fresh' }] },
    };

    let z: TreeNode = node;
    while (z.parent !== null && z.parent.color === 'red') {
        const p = z.parent;
        const g = p.parent;
        // 根必须是黑的,红节点的父一定存在祖父;这里只是防御
        if (g === null) break;
        const parentIsLeft = p === g.left;

        const uncle = parentIsLeft ? g.right : g.left;
        if (uncle !== null && uncle.color === 'red') {
            // 情形 1:叔叔是红色 -> 只染色,把祖父当作新的当前节点继续上移
            p.color = 'black';
            uncle.color = 'black';
            g.color = 'red';
            yield {
                ...hold,
                title: `情形 1:叔叔是红色`,
                detail: `父 / 叔染黑,祖父染红,把祖父 ${g.value} 当作新的当前节点继续上移`,
                focus: g.key,
                frame: [p.key, uncle.key, g.key],
                framing: 'hold',
                marks: {
                    nodes: [
                        { key: p.key, state: 'path' },
                        { key: uncle.key, state: 'path' },
                        { key: g.key, state: 'active' },
                    ],
                },
            };
            z = g;
            continue;
        }

        // 叔叔是黑 / 空
        const isOuter = parentIsLeft ? z === p.left : z === p.right;
        if (!isOuter) {
            // 情形 2:当前节点是内侧孩子 -> 绕父旋转成外侧(不改颜色)
            const inner = z;
            z = p;
            if (parentIsLeft) {
                rotateLeft(tree, p);
            } else {
                rotateRight(tree, p);
            }
            yield {
                ...hold,
                title: `情形 2:当前节点是内侧孩子`,
                detail: `先绕父节点旋转,把内侧孩子 ${inner.value} 转成外侧(只改形状,不改颜色;就是 BST 双旋的第一下)`,
                focus: inner.key,
                frame: [p.key, inner.key],
                framing: 'hold',
                marks: {
                    nodes: [
                        { key: p.key, state: 'path' },
                        { key: inner.key, state: 'active' },
                    ],
                },
            };
        }

        // 情形 3:当前节点是外侧孩子 -> 父染黑、祖父染红,绕祖父旋转,这一支恢复
        const outerParent = z.parent;
        const grandParent = outerParent === null ? null : outerParent.parent;
        if (outerParent === null || grandParent === null) break;
        outerParent.color = 'black';
        grandParent.color = 'red';
        if (parentIsLeft) {
            rotateRight(tree, grandParent);
        } else {
            rotateLeft(tree, grandParent);
        }
        yield {
            ...hold,
            title: `情形 3:当前节点是外侧孩子`,
            detail: `父 ${outerParent.value} 染黑、祖父 ${grandParent.value} 染红,绕祖父旋转;这一支的红黑性质恢复(就是 BST 的单旋)`,
            focus: outerParent.key,
            frame: [outerParent.key, grandParent.key],
            framing: 'hold',
            marks: {
                nodes: [
                    { key: outerParent.key, state: 'active' },
                    { key: grandParent.key, state: 'path' },
                ],
            },
        };
        // 情形 3 之后 z 的父变成黑色:循环条件自然不成立,不需要再上移 z
    }

    if (tree.root !== null && tree.root.color === 'red') {
        tree.root.color = 'black';
        yield {
            ...hold,
            title: `根染黑`,
            detail: `根节点 ${tree.root.value} 必须是黑色,染黑后黑高恢复`,
            focus: tree.root.key,
            framing: 'hold',
            marks: { nodes: [{ key: tree.root.key, state: 'active' }] },
        };
    }

    yield {
        ...hold,
        ...fitOf(options),
        title: `插入 ${value} 完成`,
        detail: '红黑树的五条性质全部恢复(途中违反的红孩子 / 黑高现在都修好)',
        focus: node.key,
        marks: { nodes: path.map((item) => ({ key: item.key, state: 'path' as const })) },
    };
}

// 删除

/**
 * 双黑修复:CLRS RB-DELETE-FIXUP 的四情形.
 *
 * 参数 `x` 是"多背了一层黑"的位置(可能是 null = nil 叶子),`parent` 是它的父;
 * `xIsLeft` 显式记录 x 是父的左 / 右孩子:当 x 为 null 时没法从两边指针区分,
 * 而双黑的修复方向完全依赖左右.
 *
 * 每个情形都在改完结构 / 颜色之后 yield 一帧:标题同时带"双黑"和"情形 N"。
 */
function* deleteFixupFrames(
    tree: TreeModel,
    startX: TreeNode | null,
    startParent: TreeNode | null,
    startIsLeft: boolean,
    options?: FrameOptions,
): Generator<TraceFrame> {
    const hold = holdOf(options);
    let x = startX;
    let parent = startParent;
    let xIsLeft = startIsLeft;

    while (x !== tree.root && isBlack(x)) {
        if (parent === null) break;
        if (xIsLeft) {
            let sibling = parent.right;
            if (sibling !== null && sibling.color === 'red') {
                // 情形 1:兄弟是红色 -> 染色 + 绕父旋转,把兄弟换成黑色再处理
                sibling.color = 'black';
                parent.color = 'red';
                rotateLeft(tree, parent);
                sibling = parent.right;
                yield {
                    ...hold,
                    title: `双黑 · 情形 1:兄弟是红色`,
                    detail: `兄弟染黑、父染红,绕父 ${parent.value} 左旋;双黑位置不变,换成黑兄弟后继续`,
                    focus: parent.key,
                    frame: [parent.key, ...(sibling === null ? [] : [sibling.key])],
                    framing: 'hold',
                    marks: { nodes: [{ key: parent.key, state: 'path' }] },
                };
            }
            if (sibling === null) {
                // 兄弟是 nil:等价于"兄弟黑且两孩子都黑",无法真的染红 nil
                x = parent;
                parent = x.parent;
                xIsLeft = parent !== null && parent.left === x;
                yield {
                    ...hold,
                    title: `双黑 · 情形 2:兄弟是黑色且两个孩子都是黑色`,
                    detail: `兄弟是 nil(黑色),双黑上移到父节点 ${x.value} 继续处理`,
                    focus: x.key,
                    framing: 'hold',
                    marks: { nodes: [{ key: x.key, state: 'active' }] },
                };
                continue;
            }
            if (isBlack(sibling.left) && isBlack(sibling.right)) {
                // 情形 2:兄弟黑且两孩子黑 -> 兄弟染红,双黑上移
                sibling.color = 'red';
                x = parent;
                parent = x.parent;
                xIsLeft = parent !== null && parent.left === x;
                yield {
                    ...hold,
                    title: `双黑 · 情形 2:兄弟是黑色且两个孩子都是黑色`,
                    detail: `兄弟 ${sibling.value} 染红,双黑上移到父节点 ${x.value};父节点是红色时直接染黑就结束`,
                    focus: x.key,
                    framing: 'hold',
                    marks: { nodes: [{ key: x.key, state: 'active' }] },
                };
                continue;
            }
            if (isBlack(sibling.right)) {
                // 情形 3:近侄红、远侄黑 -> 先旋转兄弟,把远侄转成红色
                if (sibling.left !== null) sibling.left.color = 'black';
                sibling.color = 'red';
                rotateRight(tree, sibling);
                sibling = parent.right;
                yield {
                    ...hold,
                    title: `双黑 · 情形 3:兄弟黑、近侄红、远侄黑`,
                    detail: `先绕兄弟右旋,把近侄的红色转到远侧;双黑还没消除,接着做情形 4`,
                    focus: sibling === null ? parent.key : sibling.key,
                    frame: [parent.key, ...(sibling === null ? [] : [sibling.key])],
                    framing: 'hold',
                    marks: { nodes: [{ key: parent.key, state: 'path' }] },
                };
            }
            // 情形 4:远侄是红色 -> 兄弟接父色、父与远侄染黑,绕父旋转,双黑消除
            if (sibling === null) break;
            sibling.color = parent.color;
            parent.color = 'black';
            if (sibling.right !== null) sibling.right.color = 'black';
            rotateLeft(tree, parent);
            x = tree.root;
            parent = null;
            xIsLeft = false;
            yield {
                ...hold,
                title: `双黑 · 情形 4:兄弟黑、远侄红`,
                detail: `兄弟接父色、父与远侄染黑,绕父左旋;双黑被"吃掉",整棵树恢复`,
                focus: sibling.key,
                framing: 'hold',
                marks: { nodes: [{ key: sibling.key, state: 'active' }] },
            };
        } else {
            let sibling = parent.left;
            if (sibling !== null && sibling.color === 'red') {
                // 情形 1(镜像):兄弟是红色
                sibling.color = 'black';
                parent.color = 'red';
                rotateRight(tree, parent);
                sibling = parent.left;
                yield {
                    ...hold,
                    title: `双黑 · 情形 1:兄弟是红色`,
                    detail: `兄弟染黑、父染红,绕父 ${parent.value} 右旋;双黑位置不变,换成黑兄弟后继续`,
                    focus: parent.key,
                    frame: [parent.key, ...(sibling === null ? [] : [sibling.key])],
                    framing: 'hold',
                    marks: { nodes: [{ key: parent.key, state: 'path' }] },
                };
            }
            if (sibling === null) {
                x = parent;
                parent = x.parent;
                xIsLeft = parent !== null && parent.left === x;
                yield {
                    ...hold,
                    title: `双黑 · 情形 2:兄弟是黑色且两个孩子都是黑色`,
                    detail: `兄弟是 nil(黑色),双黑上移到父节点 ${x.value} 继续处理`,
                    focus: x.key,
                    framing: 'hold',
                    marks: { nodes: [{ key: x.key, state: 'active' }] },
                };
                continue;
            }
            if (isBlack(sibling.left) && isBlack(sibling.right)) {
                sibling.color = 'red';
                x = parent;
                parent = x.parent;
                xIsLeft = parent !== null && parent.left === x;
                yield {
                    ...hold,
                    title: `双黑 · 情形 2:兄弟是黑色且两个孩子都是黑色`,
                    detail: `兄弟 ${sibling.value} 染红,双黑上移到父节点 ${x.value};父节点是红色时直接染黑就结束`,
                    focus: x.key,
                    framing: 'hold',
                    marks: { nodes: [{ key: x.key, state: 'active' }] },
                };
                continue;
            }
            if (isBlack(sibling.left)) {
                // 情形 3(镜像):近侄红、远侄黑
                if (sibling.right !== null) sibling.right.color = 'black';
                sibling.color = 'red';
                rotateLeft(tree, sibling);
                sibling = parent.left;
                yield {
                    ...hold,
                    title: `双黑 · 情形 3:兄弟黑、近侄红、远侄黑`,
                    detail: `先绕兄弟左旋,把近侄的红色转到远侧;双黑还没消除,接着做情形 4`,
                    focus: sibling === null ? parent.key : sibling.key,
                    frame: [parent.key, ...(sibling === null ? [] : [sibling.key])],
                    framing: 'hold',
                    marks: { nodes: [{ key: parent.key, state: 'path' }] },
                };
            }
            if (sibling === null) break;
            sibling.color = parent.color;
            parent.color = 'black';
            if (sibling.left !== null) sibling.left.color = 'black';
            rotateRight(tree, parent);
            x = tree.root;
            parent = null;
            xIsLeft = false;
            yield {
                ...hold,
                title: `双黑 · 情形 4:兄弟黑、远侄红`,
                detail: `兄弟接父色、父与远侄染黑,绕父右旋;双黑被"吃掉",整棵树恢复`,
                focus: sibling.key,
                framing: 'hold',
                marks: { nodes: [{ key: sibling.key, state: 'active' }] },
            };
        }
    }

    // 双黑落在一个红节点上(或循环把双黑推到了红父节点):染黑即消除,没有额外的旋转
    if (x !== null && x.color === 'red') {
        x.color = 'black';
        yield {
            ...hold,
            title: `双黑消除:${x.value} 染黑`,
            detail: `双黑落在红节点 ${x.value} 上,直接染黑就把多出来的一层黑吸收掉`,
            focus: x.key,
            framing: 'hold',
            marks: { nodes: [{ key: x.key, state: 'active' }] },
        };
    }
}

/**
 * RBT 删除:查找 -> (双孩子先找后继) -> 物理移植 -> 双黑修复.
 *
 * 每帧都是合法 BST;被删节点是黑色时中间帧会违反黑高 / 红孩子(教学内容),修复完
 * 最后一帧五条性质全 PASS.
 */
export function* rbtDeleteFrames(tree: TreeModel, value: number, options?: FrameOptions): Generator<TraceFrame> {
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
            marks: { nodes: [...path.map((node) => ({ key: node.key, state: 'path' as const })), { key: current.key, state: 'active' }] },
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
            marks: { nodes: path.map((node) => ({ key: node.key, state: 'path' as const })) },
        };
        return;
    }

    const target = current;
    const left = target.left;
    const right = target.right;
    const targetParent = target.parent;
    const childCount = (left === null ? 0 : 1) + (right === null ? 0 : 1);
    yield {
        ...hold,
        title: `找到 ${value}`,
        detail: childCount === 0
            ? `${value} 是叶子(颜色 ${target.color === 'red' ? '红' : '黑'}),直接摘除`
            : childCount === 1
                ? `${value} 只有一个孩子(颜色 ${target.color === 'red' ? '红' : '黑'}),用孩子接替`
                : `${value} 有两个孩子(颜色 ${target.color === 'red' ? '红' : '黑'}),先找右子树最小(后继)`,
        focus: target.key,
        anchor: target.key,
        marks: { nodes: [...path.map((node) => ({ key: node.key, state: 'path' as const })), { key: target.key, state: 'found' }] },
    };

    // 被物理摘掉的节点颜色:决定是否需要双黑修复
    let removedColor: TreeNodeColor = target.color;
    let x: TreeNode | null;
    let xParent: TreeNode | null;
    let xIsLeft: boolean;
    let successor: TreeNode | null = null;

    if (left !== null && right !== null) {
        // 双孩子:找右子树最小(后继),物理移植
        let candidate = right;
        while (candidate.left !== null) {
            yield {
                ...hold,
                title: `找右子树最小`,
                detail: `${candidate.value} 还有左孩子,继续往左找更小的`,
                focus: candidate.key,
                anchor: candidate.key,
                marks: { nodes: [{ key: target.key, state: 'ghost' }, { key: candidate.key, state: 'ghost' }] },
            };
            candidate = candidate.left;
        }
        successor = candidate;
        yield {
            ...hold,
            title: `找到后继 ${successor.value}`,
            detail: `右子树最小节点 ${successor.value} 接替 ${value} 的位置(物理移植,连同颜色)`,
            focus: successor.key,
            anchor: successor.key,
            marks: { nodes: [{ key: target.key, state: 'ghost' }, { key: successor.key, state: 'found' }] },
        };

        const moved = successor;
        const movedParent = moved.parent;
        const movedRight = moved.right;
        removedColor = moved.color;
        x = movedRight;
        if (movedParent === target) {
            // 后继就是右孩子:右孩子直接顶上,它的右子树原样保留
            xParent = moved;
            xIsLeft = false;
        } else {
            xParent = movedParent;
            xIsLeft = true;
            if (movedParent !== null) {
                movedParent.left = movedRight;
                if (movedRight !== null) movedRight.parent = movedParent;
            }
        }
        moved.parent = targetParent;
        if (targetParent === null) {
            tree.root = moved;
        } else if (targetParent.left === target) {
            targetParent.left = moved;
        } else {
            targetParent.right = moved;
        }
        moved.left = left;
        left.parent = moved;
        if (movedParent !== target) {
            moved.right = right;
            right.parent = moved;
        }
        moved.color = target.color;
    } else {
        const child = left ?? right;
        removedColor = target.color;
        x = child;
        xParent = targetParent;
        xIsLeft = targetParent !== null && targetParent.left === target;
        if (targetParent === null) {
            tree.root = child;
        } else if (targetParent.left === target) {
            targetParent.left = child;
        } else {
            targetParent.right = child;
        }
        if (child !== null) child.parent = targetParent;
    }

    tree.nodes.delete(target.key);
    target.left = null;
    target.right = null;
    target.parent = null;

    // 结构改动后的一帧:被摘掉黑节点时,顶替位置已经"多背一层黑"
    const needsFixup = removedColor === 'black';
    const doubleBlack = needsFixup && isBlack(x);
    const structuralMarks: { nodes: Array<{ key: number; state: 'path' | 'fresh' | 'ghost' | 'found' | 'active' }> } = {
        nodes: path.map((node) => ({ key: node.key, state: 'path' as const })),
    };
    if (successor !== null) structuralMarks.nodes.push({ key: successor.key, state: 'fresh' });
    else if (x !== null) structuralMarks.nodes.push({ key: x.key, state: 'fresh' });
    if (doubleBlack && x !== null) structuralMarks.nodes.push({ key: x.key, state: 'ghost' });

    yield {
        ...hold,
        ...fitOf(options),
        title: doubleBlack ? `双黑出现在 ${x === null ? 'nil / 空位' : x.value}` : `物理移植完成`,
        detail: !needsFixup
            ? '被摘掉的是红节点,不影响黑高,无需修复'
            : doubleBlack
                ? '被摘掉的是黑节点,顶替位置多背一层黑 -> 双黑,开始四情形修复'
                : `顶替节点 ${x === null ? '(nil)' : x.value} 是红色,直接染黑就能吸收多出来的一层黑`,
        focus: x?.key ?? successor?.key ?? targetParent?.key ?? tree.root?.key,
        ...(targetParent === null
            ? (successor === null && x === null ? {} : { anchor: (successor ?? x)?.key, anchorAt: target.key })
            : { anchor: targetParent.key }),
        marks: structuralMarks,
    };

    if (needsFixup) {
        yield* deleteFixupFrames(tree, x, xParent, xIsLeft, options);
    }

    yield {
        ...hold,
        ...fitOf(options),
        title: `删除 ${value} 完成`,
        detail: '双黑修复结束,五条红黑性质全部 PASS(BST 有序始终成立)',
        focus: tree.root?.key,
        marks: { nodes: tree.root === null ? [] : [{ key: tree.root.key, state: 'active' }] },
    };
}

// 五条性质的讲解帧

/**
 * 五条性质的讲解帧(检查窗口配合).
 *
 * 每一拍 focus 到能说明该性质的位置(根 / 一对红父子 / 一条黑高路径),`detail` 是
 * 讲解词;性质本身仍由检查窗口的 RBT_CHECKS 现算,这里不写字面 PASS / FAIL.
 */
export function* rbtPropertiesFrames(tree: TreeModel, options?: FrameOptions): Generator<TraceFrame> {
    const hold = holdOf(options);

    yield {
        ...hold,
        title: `性质 1:每个节点非红即黑`,
        detail: '颜色从 attrs.color 读;演示里节点带红黑变体,不靠高亮色冒充',
        frame: tree.inOrder().map((node) => node.key),
        framing: 'fit',
        marks: { nodes: [] },
    };

    const root = tree.root;
    yield {
        ...hold,
        title: `性质 2:根节点是黑色`,
        detail: root === null ? '空树也算满足' : `根节点 ${root.value} 的颜色是 ${root.color === 'red' ? '红(违反!)' : '黑'}`,
        ...(root === null ? {} : { focus: root.key }),
        framing: 'hold',
        marks: { nodes: root === null ? [] : [{ key: root.key, state: 'active' }] },
    };

    // 找一对红父子:红节点本身就是最直观的"这条性质在说什么"
    const redNodes = tree.preOrder().filter((node) => node.color === 'red');
    const redNode = redNodes[0] ?? null;
    yield {
        ...hold,
        title: `性质 3:红色节点的孩子都是黑色`,
        detail: redNode === null
            ? '当前没有红色节点:红孩子这条性质空真'
            : `拿红节点 ${redNode.value} 当例子:它的孩子必须是黑色`,
        ...(redNode === null ? {} : { focus: redNode.key }),
        framing: 'hold',
        marks: { nodes: redNode === null ? [] : [{ key: redNode.key, state: 'active' }] },
    };

    const blackPath: TreeNode[] = [];
    let current = tree.root;
    while (current !== null) {
        if (current.color === 'black') blackPath.push(current);
        current = current.left;
    }
    yield {
        ...hold,
        title: `性质 4:各路径黑色节点数量相同`,
        detail: `沿最左路径数黑节点:${blackPath.length} 个(含节点自身);每条到 nil 叶子的路径都要相等`,
        frame: blackPath.map((node) => node.key),
        framing: 'hold',
        marks: { nodes: blackPath.map((node) => ({ key: node.key, state: 'visited' as const })) },
    };

    const ordered = tree.inOrder();
    yield {
        ...hold,
        title: `性质 5:二叉搜索树有序(中序升序)`,
        detail: `中序访问序列:${ordered.length === 0 ? '(空)' : ordered.map((node) => node.value).join(' ')}`,
        frame: ordered.map((node) => node.key),
        framing: 'fit',
        marks: { nodes: ordered.map((node) => ({ key: node.key, state: 'visited' as const })) },
    };
}
