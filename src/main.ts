/*
 * 应用入口:把 JSON 查看器桌面挂到页面上唯一手写宿主 `#app` 上;本文件不碰 DOM 结构,
 * 也不按 id 查元素.
 *
 * 两条样式 import 的顺序就是层叠顺序(库层 `miko_ui` 在前,应用层 `css/app.css` 在后),
 * 与主站同一条口径,不要调换.
 */
import 'miko_ui/styles.css';
import '../css/app.css';

import { mountViewer } from '@/ui/viewer/viewer';

const host = document.getElementById('app');
if (!host) {
    throw new Error('index.html 缺少 #app:桌面宿主是页面上唯一需要手写的标记');
}
mountViewer(host);
