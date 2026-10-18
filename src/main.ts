/*
应用入口:把红黑树**桌面**挂到页面那唯一一颗手写宿主 `#app` 上.

样式分两层,**库层在前,应用层在后**(顺序即层叠顺序,与主站同一条口径):
  1. 库层:`miko_ui/styles.css` 一行给出库的全部默认样式(主题令牌 / 控件 / 编辑器外壳
     / 反馈件 / 桌面窗口与任务栏 …);
  2. 应用层:`../css/app.css`,只写页面基线(底色 / 字体 / 桌面根铺满视口)与从主站继承
     下来的应用级令牌(`--font-code`,见那个文件的说明).

红黑树自己的观感不在这里:`src/ui/rbt/rbt.ts` 引 `@/ui/rbt/rbt.css`,那份再引同目录的
`tokens.css`(模块自己带样式,与主站同一条做法).

挂载只认宿主:桌面背景与两扇窗口的标记与行为全在 `src/ui/rbt/` 里,本文件不碰 DOM 结构,
也不按 id 查元素.
*/
import 'miko_ui/styles.css';
import '../css/app.css';

import { mountRBT } from '@/ui/rbt/rbt';

const host = document.getElementById('app');
if (!host) {
    throw new Error('index.html 缺少 #app:桌面宿主是页面上唯一需要手写的标记');
}
mountRBT(host);
