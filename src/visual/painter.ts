/*
 * `ScenePainter`:给世界层一份**稳定身份**的增量落笔.
 *
 * 静态路径(`render.ts`)每轮整批重建,元素一换就没有"上一帧",浏览器无法插值;动画路径
 * 必须复用同一批 DOM 元素,只改属性(位置 / 变体 / 端点 / 透明度),只在"这一帧场景里不再
 * 存在"的元素上挂退场类,落定后才真正移除(见 docs/animation.md §5.1).
 *
 * 两项稳定身份:
 * - 节点按 `key` 配(结构自己的节点 id),两组图元之间靠它认"还是那个圆";
 * - 连线按 `id` 配(约定 `${from}->${to}#${同序对出现序号}`),方向 / 端点变了但 id 不变
 *   就是同一根线.
 *
 * 为了 z 序稳定,构造时在世界层里建两个图层:先连线层、后节点层.节点永远盖在线上,
 * 动画中途新增的元素也进各自的层,不会突然跑到节点上面去.
 *
 * 状态分成两套类,互不覆盖(见 §5.2):
 * - 高亮状态 `visual-state--<state>`:active / path / visited / found / ghost / fresh,
 *   与结构变体类(`visual-node--<variant>`)叠加,由 visual.css 统一接住;
 * - 进出场状态 `visual-state--entering` / `--leaving`:只在未落定的帧上挂,落定帧移除.
 *
 * 这里不 import datastruct,也不写循环 rAF / 时钟:painter 只回答"这一帧长什么样",
 * 帧从哪来、什么时候落定由播放器决定.动画中途**不量包围盒**(量到的是中间态,自动适应
 * 会跟着抖),只有落定帧量一次交给视口;演示期间视口用 `manual` 模式,不自动 fit.
 */
import { create_svg_element } from 'miko_ui';
import {
    createLinkElements,
    createNodeElements,
    measureWorldBounds,
    writeLinkElements,
    writeNodeElements,
} from '@/visual/elements';
import type { LinkElements, NodeElements } from '@/visual/elements';
import type { VisualLink, VisualPoint } from '@/visual/scene';
import type { PlaneBox } from '@/visual/viewport';

/** 连线图层的类名:世界层里先建的一层,z 序在节点之下 */
export const VISUAL_PAINTER_LINKS_CLASS = 'visual-painter__links';

/** 节点图层的类名:世界层里后建的一层,z 序在连线之上 */
export const VISUAL_PAINTER_NODES_CLASS = 'visual-painter__nodes';

/**
 * 动画状态类前缀:完整类名是 `visual-state--<state>`(见 PaintNodeState / PaintLinkState).
 *
 * 与结构变体类(`visual-node--<variant>`)是两个独立契约,visual.css 分别命中;状态切换
 * 只清状态类,不改结构色,反过来也一样.
 */
export const VISUAL_STATE_CLASS_PREFIX = 'visual-state--';

/** 节点的高亮状态;语义由使用它的结构定义,视觉层只负责挂类 */
export type PaintNodeState = 'active' | 'path' | 'visited' | 'found' | 'ghost' | 'fresh';

/** 连线的高亮状态(当前只有"路径上"与"幽灵"两档) */
export type PaintLinkState = 'path' | 'ghost';

/** 一帧里的一个节点:稳定身份 + 位置 + 值文字 + 可选变体 / 状态 / 透明度 */
export interface PaintNode {
    /** 稳定身份:跨帧配 DOM 元素用(同一个 key = 同一个圆) */
    readonly key: number;
    /** 节点中心的世界坐标 */
    readonly at: VisualPoint;
    /** 值文字(已经格式化好,视觉层不拼接) */
    readonly label: string;
    /** 语义变体:`visual-node--<variant>` 的类名后缀(红黑树的 red / black 等) */
    readonly variant?: string;
    /** 高亮状态类 `visual-state--<state>`;缺省不挂 */
    readonly state?: PaintNodeState;
    /** 0..1;缺省 1.进出场 / 淡出用,写到节点组的 opacity 属性上 */
    readonly opacity?: number;
}

/** 一帧里的一条连线:稳定 id + 两个端点 + 方向 + 可选状态 / 透明度 */
export interface PaintLink {
    /** 稳定身份:`${from}->${to}#${同序对出现序号}`,由布局 / 轨迹侧给 */
    readonly id: string;
    /** 起点(已经收进节点圆边界) */
    readonly start: VisualPoint;
    /** 终点(已经收进节点圆边界) */
    readonly end: VisualPoint;
    /** `true` = 有向指针(画箭头);`false` = 无向边 */
    readonly directed: boolean;
    /** 高亮状态类 `visual-state--<state>`;缺省不挂 */
    readonly state?: PaintLinkState;
    /** 0..1;缺省 1.写到线段与箭头上 */
    readonly opacity?: number;
}

/** 一帧要画的全部内容:节点 + 连线 */
export interface PaintScene {
    readonly nodes: readonly PaintNode[];
    readonly links: readonly PaintLink[];
}

/** 高亮 / 进出场类都挂在这一组元素上(节点组;连线的线段 + 箭头) */
type ClassTarget = Element;

/** 两条路径共用的缓动状态:挂类的元素 + 当前高亮类 + 当前进出场类(只可能有一个) */
interface ElementState {
    /** 状态类 / 进出场类要挂的元素(节点组;连线的线段 + 可选的箭头) */
    readonly classTargets: readonly ClassTarget[];
    /** 已经挂上的高亮状态类全名(`visual-state--<state>`),null = 没有 */
    stateClass: string | null;
    /** 已经挂上的进出场类全名(entering / leaving),null = 已稳定 */
    transientClass: string | null;
}

interface NodeEntry extends ElementState {
    readonly elements: NodeElements;
    /** 节点组 = `elements.group`;单独留一份是为了与"表里的条目"直接对应 */
    readonly root: SVGGElement;
}

interface LinkEntry extends ElementState {
    readonly elements: LinkElements;
    /** 构造时的方向语义:变了就要重建元素(箭头的有无无法就地写) */
    readonly directed: boolean;
}

/** 进入场景时挂的类:淡入 / 缩放由 visual.css 接住 */
const ENTERING_CLASS = `${VISUAL_STATE_CLASS_PREFIX}entering`;

/** 离开场景时挂的类:淡出 / 缩小由 visual.css 接住(落定后才真正移除元素) */
const LEAVING_CLASS = `${VISUAL_STATE_CLASS_PREFIX}leaving`;

/** `PaintNode` 结构上是 `VisualNode` 的超集:直接交给图元构造 / 写入(多出的字段不影响) */
function visualLinkOf(link: PaintLink): VisualLink {
    return { from: link.start, to: link.end, directed: link.directed };
}

/**
 * 把透明度写到元素上:缺省 1,夹到 0..1,保留三位小数.
 *
 * 三位小数是为了不让插值噪声(`0.30000000000000004`)进 DOM:属性每帧都写,稳定格式
 * 便于对比与测试.`-0` 归一成 `0`(数值相等但字符串不同,只留一种写法).
 */
function writeOpacity(element: Element, opacity: number | undefined): void {
    const value = opacity === undefined ? 1 : opacity;
    const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
    const rounded = Math.round(clamped * 1000) / 1000;
    element.setAttribute('opacity', String(rounded === 0 ? 0 : rounded));
}

/**
 * 场景的增量落笔器:一帧一帧地把 `PaintScene` 写到世界层上.
 *
 * 生命周期:
 * 1. `new ScenePainter(world)`:接管世界层,清掉旧子节点,建"连线层 -> 节点层"两层;
 * 2. 动画中途 `apply(scene, { settled: false })`:复用元素、只写属性,新元素挂 entering,
 *    完全消失的元素先挂 leaving 留着画退场,不量包围盒(返回 null);
 * 3. 每步落定 `apply(scene, { settled: true })`:移除退场元素、清掉 entering / leaving,
 *    属性写成精确值,再量一次世界层 `getBBox()` 交给视口;
 * 4. `clear()` 清空两个图层;`dispose()` 清空并把图层从世界层摘掉.
 */
export class ScenePainter {
    /** 世界层:视口只改它的 transform,图元都挂在下面两个图层里 */
    private readonly world: SVGGElement;

    /** 连线图层(先建:z 序在下) */
    private readonly linksLayer: SVGGElement;

    /** 节点图层(后建:z 序在上,新增节点也进这一层) */
    private readonly nodesLayer: SVGGElement;

    /** 节点表:key -> 元素与状态 */
    private readonly nodes = new Map<number, NodeEntry>();

    /** 连线表:id -> 元素与状态 */
    private readonly links = new Map<string, LinkEntry>();

    /** dispose 之后不再落笔 / 测量(图层已经摘掉,写了也看不见) */
    private disposed = false;

    /**
     * 接管世界层:清掉它原来的子节点,建两个图层.
     *
     * 世界层归 painter 独占:静态路径的残留(或上一次挂载的图元)必须清掉,否则会和
     * 动画元素叠在一起;需要静态重绘时用 `render.ts`,两者不要同时写同一层.
     */
    constructor(world: SVGGElement) {
        this.world = world;
        this.linksLayer = create_svg_element(
            { tag: 'g' },
            { class: VISUAL_PAINTER_LINKS_CLASS },
        );
        this.nodesLayer = create_svg_element(
            { tag: 'g' },
            { class: VISUAL_PAINTER_NODES_CLASS },
        );
        world.replaceChildren(this.linksLayer, this.nodesLayer);
    }

    /**
     * 落一帧.
     *
     * - 两帧都有的节点 / 连线:复用同一批 DOM 元素,只写属性(位置 / 变体 / 端点 / 透明度);
     * - 只出现 / 只消失的:挂 `visual-state--entering` / `visual-state--leaving` 状态类;
     * - `settled: true` 时移除场景里没有的元素,清掉进出场类,并量一次世界层 `getBBox()`
     *   交回 `PlaneBox | null`;
     * - 动画中途(`settled: false`)不量包围盒,直接返回 null.
     */
    apply(scene: PaintScene, options: { readonly settled: boolean }): PlaneBox | null {
        if (this.disposed) return null;
        this.applyNodes(scene.nodes, options.settled);
        this.applyLinks(scene.links, options.settled);
        if (!options.settled) return null;
        this.settle();
        return this.measure();
    }

    /** 只量一次世界层的实际包围盒;量不到(空矩形 / 还没排版)返回 null,不猜 */
    measure(): PlaneBox | null {
        return this.disposed ? null : measureWorldBounds(this.world);
    }

    /** 清空两个图层里的所有图元(图层本身保留,下一次 apply 继续用) */
    clear(): void {
        this.linksLayer.replaceChildren();
        this.nodesLayer.replaceChildren();
        this.nodes.clear();
        this.links.clear();
    }

    /** 清空并摘掉两个图层:之后 apply / measure 都返回 null(painter 不再拥有世界层) */
    dispose(): void {
        if (this.disposed) return;
        this.clear();
        this.linksLayer.remove();
        this.nodesLayer.remove();
        this.disposed = true;
    }

    // 节点

    private applyNodes(nodes: readonly PaintNode[], settled: boolean): void {
        const seen = new Set<number>();
        for (const node of nodes) {
            seen.add(node.key);
            let entry = this.nodes.get(node.key);
            if (entry === undefined) {
                entry = this.createNodeEntry(node, settled);
                this.nodes.set(node.key, entry);
            } else {
                writeNodeElements(entry.elements, node);
                this.revive(entry, settled);
            }
            this.writeState(entry, node.state);
            writeOpacity(entry.root, node.opacity);
        }

        for (const [key, entry] of this.nodes) {
            if (seen.has(key)) continue;
            if (settled) {
                entry.root.remove();
                this.nodes.delete(key);
            } else {
                this.markLeaving(entry);
            }
        }
    }

    /** 造一个节点:写进节点图层;未落定帧的新元素带 entering 类 */
    private createNodeEntry(node: PaintNode, settled: boolean): NodeEntry {
        const elements = createNodeElements(node);
        this.nodesLayer.append(elements.group);
        const entry: NodeEntry = {
            elements,
            root: elements.group,
            classTargets: [elements.group],
            stateClass: null,
            transientClass: null,
        };
        if (!settled) this.setTransient(entry, ENTERING_CLASS);
        return entry;
    }

    // 连线

    private applyLinks(links: readonly PaintLink[], settled: boolean): void {
        const seen = new Set<string>();
        for (const link of links) {
            seen.add(link.id);
            let entry = this.links.get(link.id);
            if (entry !== undefined && entry.directed !== link.directed) {
                /*
                  有向 <-> 无向 = 箭头元素的有无要变,而 LinkElements 的 arrow 是只读的:
                  重建这组元素最直接.视觉上它是一次"换了一种线",按新出现的连线处理.
                */
                this.removeLinkElements(entry);
                this.links.delete(link.id);
                entry = undefined;
            }
            if (entry === undefined) {
                entry = this.createLinkEntry(link, settled);
                this.links.set(link.id, entry);
            } else {
                writeLinkElements(entry.elements, visualLinkOf(link));
                this.revive(entry, settled);
            }
            this.writeState(entry, link.state);
            writeOpacity(entry.elements.line, link.opacity);
            if (entry.elements.arrow !== null) writeOpacity(entry.elements.arrow, link.opacity);
        }

        for (const [id, entry] of this.links) {
            if (seen.has(id)) continue;
            if (settled) {
                this.removeLinkElements(entry);
                this.links.delete(id);
            } else {
                this.markLeaving(entry);
            }
        }
    }

    /** 造一条连线:线段先挂、箭头后挂(箭头压住线头);未落定帧带 entering 类 */
    private createLinkEntry(link: PaintLink, settled: boolean): LinkEntry {
        const elements = createLinkElements(visualLinkOf(link));
        this.linksLayer.append(elements.line);
        if (elements.arrow !== null) this.linksLayer.append(elements.arrow);
        const entry: LinkEntry = {
            elements,
            directed: link.directed,
            classTargets: elements.arrow === null
                ? [elements.line]
                : [elements.line, elements.arrow],
            stateClass: null,
            transientClass: null,
        };
        if (!settled) this.setTransient(entry, ENTERING_CLASS);
        return entry;
    }

    private removeLinkElements(entry: LinkEntry): void {
        entry.elements.line.remove();
        entry.elements.arrow?.remove();
    }

    // 状态 / 进出场 / 落定

    /**
     * 写高亮状态类:先清旧值再挂新值;`undefined` 表示这一帧没有高亮.
     *
     * 只动 `visual-state--` 前缀的类,结构变体类(`visual-node--red` 等)与基础类原样保留.
     */
    private writeState(entry: ElementState, state: PaintNodeState | PaintLinkState | undefined): void {
        const next = state === undefined ? null : `${VISUAL_STATE_CLASS_PREFIX}${state}`;
        this.setClass(entry, next, 'stateClass');
    }

    /** 换进出场类(entering / leaving / null),同一个元素组上同时只留一个 */
    private setTransient(entry: ElementState, next: string | null): void {
        this.setClass(entry, next, 'transientClass');
    }

    /**
     * 把条目上记着的某一类类名换成 `next`;调用方保证 `entry` 与 target 元素对应.
     *
     * 类名记在条目里而不是从 DOM 反查:元素上的类可能被宿主 / 调试改动,条目自己记住
     * "上次写了什么",清旧值才不会漏(清不掉的旧状态类会和新的叠在一起).
     */
    private setClass(
        entry: ElementState,
        next: string | null,
        field: 'stateClass' | 'transientClass',
    ): void {
        const previous = entry[field];
        if (previous === next) return;
        for (const element of entry.classTargets) {
            if (previous !== null) element.classList.remove(previous);
            if (next !== null) element.classList.add(next);
        }
        entry[field] = next;
    }

    /**
     * 消失过又回来的元素:把 leaving 换回 entering(未落定帧)或直接清掉(落定帧).
     *
     * 两帧都有的元素不动:它一直待在 enter / 稳定状态里,不需要重播淡入.
     */
    private revive(entry: ElementState, settled: boolean): void {
        if (entry.transientClass !== LEAVING_CLASS) return;
        this.setTransient(entry, settled ? null : ENTERING_CLASS);
    }

    /** 标记离开:换成 leaving 类,元素先留在文档里画退场,落定帧再移除 */
    private markLeaving(entry: ElementState): void {
        if (entry.transientClass === LEAVING_CLASS) return;
        this.setTransient(entry, LEAVING_CLASS);
    }

    /** 落定:所有还留在场景里的元素都回到稳定态,不能残留 entering / leaving */
    private settle(): void {
        for (const entry of this.nodes.values()) this.setTransient(entry, null);
        for (const entry of this.links.values()) this.setTransient(entry, null);
    }
}
