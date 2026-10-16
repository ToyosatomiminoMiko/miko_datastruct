/*
应用入口:把红黑树面板挂到页面那唯一一颗手写宿主 `#app` 上.

样式分两层,**库层在前,应用层在后**(顺序即层叠顺序,与主站同一条口径):
  1. 库层:`miko_ui/styles.css` 一行给出库的全部默认样式(主题令牌 / 控件 / 编辑器外壳
     / 反馈件 …),`createPanel` 建的框体外观也在里面;
  2. 应用层:`../css/app.css`,只写页面基线(底色 / 字体 / 居中)与两条从主站继承下来的
     应用级令牌(`--font-code` / `--card-width`,见那个文件的说明).

红黑树自己的观感不在这里:`src/rbt/rbt.ts` 引 `@/rbt/rbt.css`,那份再引同目录的
`tokens.css`(模块自己带样式,与主站同一条做法).

挂载只认宿主:面板的标记与行为全在 `src/rbt/` 里,本文件不碰 DOM 结构,也不按 id 查元素.
*/
import 'miko_ui/styles.css';
import '../css/app.css';

import { mountRBT } from '@/rbt/rbt';

const host = document.getElementById('app');
if (!host) {
    throw new Error('index.html 缺少 #app:面板宿主是页面上唯一需要手写的标记');
}
mountRBT(host);
