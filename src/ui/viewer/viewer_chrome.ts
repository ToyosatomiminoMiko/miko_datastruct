/*
 * JSON 窗口标题栏上的应用节点:「示例」按钮、「RUN」按钮与示例菜单的面板.
 *
 * 为什么节点在这里建:库的 `mountDesktop` 只负责把节点搬进窗口槽位,不认"示例" /
 * "RUN" 这两个应用的词;标题栏的内容归消费者.建好后交给 `windowSlotsProvider`,
 * 位置由 config.ts 的 `VIEWER_ADOPTED_NODES` 一张表说清,装配层不写 if 链.
 *
 * 这里只建节点、不接线:点击与菜单选中由 viewer.ts 的挂载流程负责.
 */

import { createButton, create_element } from 'miko_ui';
import {
    VIEWER_CHROME_LABELS,
    VIEWER_DOM,
    VIEWER_EXAMPLE_BUTTON_TITLE,
    VIEWER_RUN_BUTTON_LABEL,
    VIEWER_RUN_BUTTON_TITLE,
    type ViewerChromeNodeId,
} from '@/ui/viewer/config';

/** 标题栏节点句柄:形状由 ViewerChromeNodeId 锁死(配置表引用的每个名字都必须有) */
export type ViewerChrome = Readonly<Record<ViewerChromeNodeId, HTMLElement>>;

/** 建 JSON 窗口标题栏的三个节点;按钮走库的 createButton(带 `.ui-button` 基线) */
export function createViewerChrome(): ViewerChrome {
    const exampleButton = createButton({
        text: VIEWER_CHROME_LABELS.example,
        title: VIEWER_EXAMPLE_BUTTON_TITLE,
    }).element;
    exampleButton.id = VIEWER_DOM.exampleButtonId;
    // 菜单是"点开才出现"的浮层:静态语义写在这里,`aria-expanded` 由 Popover 独占写入
    exampleButton.setAttribute('aria-haspopup', 'true');

    const runButton = createButton({
        text: VIEWER_CHROME_LABELS.run,
        title: VIEWER_RUN_BUTTON_TITLE,
        ariaLabel: VIEWER_RUN_BUTTON_LABEL,
    }).element;
    runButton.id = VIEWER_DOM.runButtonId;

    // 面板只给一个带 id 的空容器:`.menu-panel` / 分组 / 菜单项由库的 createMenu 建
    const exampleMenu = create_element({ tag: 'div' });
    exampleMenu.id = VIEWER_DOM.exampleMenuId;

    return { exampleButton, runButton, exampleMenu };
}
