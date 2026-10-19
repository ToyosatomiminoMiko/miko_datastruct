/*
 * 列表行:实体行(每个节点一行)与检查行(每条结论一行).
 *
 * 行引擎是库的 `RowList`:它只认"标识 / 内容键 / 怎么建一行",所以行内结构全在
 * 这里.行外壳(`.object-row` + `.row-main` + `.row-actions`)、徽章基线、按钮基线
 * 都用库的公开件,应用只加自己的增量类名(见 ui/viewer/viewer.css).
 *
 * 两种行的差别:
 * - 实体行:label + attrs(颜色画成"色块 + 明文值",其余是 `key: value` 小徽章),
 *   行末「定位」把视口移到这个节点;
 * - 检查行:PASS / FAIL 徽章 + 检查名 + 行内一句话;有 `details` 时收进
 *   `<details>`(默认收起,展开态在行重建时用库的 carryDetailsOpen 保留),
 *   FAIL 且有 `node` 时行末「定位」移到违规节点.
 *
 * 不在这里做数据校验 / 文案拼接:输入已经过 datastruct/scene 的解析器,文案来自
 * JSON 本身(config 只给 PASS / FAIL 与按钮字).
 */

import {
    carryDetailsOpen,
    createBadge,
    createButton,
    createRowActions,
    createObjectRow,
    create_element,
} from 'miko_ui';
import type { SceneDocumentCheck, SceneDocumentNode } from '@/datastruct/scene/scene_document';
import {
    VIEWER_ATTRIBUTE_CLASS,
    VIEWER_CHECK_FAIL_TEXT,
    VIEWER_CHECK_PASS_TEXT,
    VIEWER_CHECK_ROW_CLASS,
    VIEWER_CHECK_STATE_CLASS,
    VIEWER_COLOR_CLASS,
    VIEWER_COLOR_CODE_CLASS,
    VIEWER_COLOR_SWATCH_CLASS,
    VIEWER_DETAIL_LINE_CLASS,
    VIEWER_DETAILS_BODY_CLASS,
    VIEWER_DETAILS_CLASS,
    VIEWER_ENTITY_ROW_CLASS,
    VIEWER_LOCATE_BUTTON_LABEL,
    VIEWER_LOCATE_BUTTON_TEXT,
    VIEWER_ROW_DETAIL_CLASS,
    VIEWER_SUMMARY_CLASS,
    VIEWER_SUMMARY_ROW_CLASS,
} from '@/ui/viewer/config';
import { formatAttributeValue } from '@/ui/viewer/viewer_format';

/** 摘要行的内容:状态徽章 + 检查名 + 第二行说明(detail 为空时不挂) */
function createSummaryRow(badge: HTMLElement, name: HTMLElement, detail: HTMLElement | null): HTMLElement {
    return create_element({ tag: 'div' }, { class: VIEWER_SUMMARY_ROW_CLASS }, badge, name, detail);
}

/** 「定位」按钮:点击后由调用方把视口移到节点;不在任何 `<summary>` 里,不会开合细节 */
function createLocateButton(label: string, onLocate: () => void): HTMLButtonElement {
    const button = createButton({
        text: VIEWER_LOCATE_BUTTON_TEXT,
        class: 'row-locate-btn',
        ariaLabel: `${VIEWER_LOCATE_BUTTON_LABEL}: ${label}`,
        title: VIEWER_LOCATE_BUTTON_LABEL,
    });
    button.onClick(onLocate);
    return button.element;
}

/**
 * 实体行:一个节点一行.
 *
 * 第一行是"label + 颜色 + 其余属性":颜色不只用色块表达(色觉 / 低对比度用户读不到),
 * 所以色块旁边写出属性值;其余属性统一成 `key: value` 小徽章.
 */
export class EntityItem {
    /** 行引擎要的句柄:行根元素 */
    readonly row: HTMLElement;

    constructor(node: SceneDocumentNode, onLocate: () => void) {
        const { row, main } = createObjectRow(
            VIEWER_ENTITY_ROW_CLASS,
            createRowActions(createLocateButton(`节点 ${node.label}`, onLocate)),
        );

        main.append(create_element({ tag: 'strong' }, { class: 'object-name' }, node.label));

        const color = node.attrs.color;
        const renderedColor = typeof color === 'string';
        if (renderedColor) {
            // 颜色属性单独走"色块 + 明文值":与 graphcalc 实体行的颜色定义同一条约定
            const colorBox = create_element({ tag: 'span' }, { class: VIEWER_COLOR_CLASS });
            colorBox.setAttribute('title', `颜色 ${color}`);
            colorBox.setAttribute('aria-label', `颜色 ${color}`);
            const swatch = create_element({ tag: 'span' }, { class: VIEWER_COLOR_SWATCH_CLASS });
            swatch.setAttribute('aria-hidden', 'true');
            // 值原样交给 CSS 变量:合法 CSS 颜色直接生效,不合法就退回透明
            swatch.style.setProperty('--viewer-attr-color-value', color);
            colorBox.append(
                swatch,
                create_element({ tag: 'code' }, { class: VIEWER_COLOR_CODE_CLASS }, color),
            );
            main.append(colorBox);
        }

        for (const [name, value] of Object.entries(node.attrs)) {
            // 只有"颜色已经画成色块 + 明文值"时才跳过,否则数字 / 布尔类型的 color 会丢
            if (name === 'color' && renderedColor) continue;
            main.append(
                create_element(
                    { tag: 'span' },
                    { class: VIEWER_ATTRIBUTE_CLASS },
                    `${name}: ${formatAttributeValue(value)}`,
                ),
            );
        }

        // 节点的业务 key 不在正文里重复(label 才是给人看的),但读屏 / 悬停要能查到
        row.dataset.nodeKey = String(node.key);
        row.title = `节点 #${node.key}`;
        this.row = row;
    }

    /**
     * 内容键:key + label + attrs 的全部取值.
     *
     * 必须在建行之前算出来(见库的 RowList):先建再比会让每次同步都白建一遍 DOM.
     */
    static cacheKey(node: SceneDocumentNode): string {
        return JSON.stringify([node.key, node.label, node.attrs]);
    }
}

/**
 * 检查行:一条结论一行.
 *
 * - 徽章文案是 PASS / FAIL,配色由变体类 `is-pass` / `is-fail` 给;
 * - 折叠态第二行是 `detail`(一句话结论,FAIL 时就是错在哪);
 * - `<details>` 里的 `details` 是补充行(推导 / 数值),默认收起;
 * - 行末「定位」只在 FAIL 且带 `node` 时出现:给"点这条结论去看那个节点"一个入口.
 */
export class CheckItem {
    /** 行引擎要的句柄:行根元素 */
    readonly row: HTMLElement;

    constructor(check: SceneDocumentCheck, onLocate: (() => void) | null) {
        const stateClass = check.passed ? 'is-pass' : 'is-fail';
        const badge = createBadge(
            check.passed ? VIEWER_CHECK_PASS_TEXT : VIEWER_CHECK_FAIL_TEXT,
            { class: `${VIEWER_CHECK_STATE_CLASS} ${stateClass}` },
        );
        const name = create_element({ tag: 'strong' }, { class: 'object-name' }, check.name);
        const detail = check.detail === ''
            ? null
            : create_element({ tag: 'span' }, { class: VIEWER_ROW_DETAIL_CLASS }, check.detail);

        const { row, main } = createObjectRow(
            VIEWER_CHECK_ROW_CLASS,
            onLocate === null ? null : createRowActions(createLocateButton(check.name, onLocate)),
        );
        row.classList.toggle('is-fail', !check.passed);

        if (check.details.length === 0) {
            // 没有可展开的补充行:摘要行直接当普通块,不建空的 <details>
            main.append(createSummaryRow(badge, name, detail));
        } else {
            /*
              <summary> 本身不写成 flex:它是 <details> 的原生开合热区,默认的展开三角
              靠 `display: list-item` 画出来;把 summary 改成 flex 会把那个三角弄丢.
              两行排版放在里面那层 `.viewer-summary-row` 上.
            */
            const details = document.createElement('details');
            details.className = VIEWER_DETAILS_CLASS;
            details.open = false;
            const summary = document.createElement('summary');
            summary.className = VIEWER_SUMMARY_CLASS;
            summary.append(createSummaryRow(badge, name, detail));
            details.append(summary);

            const body = create_element({ tag: 'div' }, { class: VIEWER_DETAILS_BODY_CLASS });
            for (const line of check.details) {
                body.append(create_element({ tag: 'div' }, { class: VIEWER_DETAIL_LINE_CLASS }, line));
            }
            details.append(body);
            main.append(details);
        }

        row.dataset.checkName = check.name;
        this.row = row;
    }

    /**
     * 行被替换时把 `<details>` 的展开态带到新行上.
     *
     * 内容变化(改 JSON 后检查结论变了)会重建行,但"用户把它展开了"与内容无关;
     * 展开态搬运归库的 carryDetailsOpen,不在查看器里再写一遍.
     */
    preserveExpandedStateFrom(previous: CheckItem): void {
        carryDetailsOpen(previous.row, this.row);
    }

    /** 内容键:会被渲染的全部内容(名字 / 状态 / 一句话 / 补充行) */
    static cacheKey(check: SceneDocumentCheck): string {
        return JSON.stringify([
            check.name,
            check.passed,
            check.detail,
            check.details,
            check.node,
        ]);
    }
}
