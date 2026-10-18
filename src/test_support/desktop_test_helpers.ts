/**
 * 桌面标记契约测试共用的小工具.
 *
 * 桌面测试都要做同样两件事:把桌面挂进文档(交回的引用必须在文档里查,否则可能绑到
 * 不在页面上的元素),以及检查文档里没有重复 id(mountRBT 用 replaceChildren 整体接管
 * 宿主,重复 id 说明标记生成重复了).这套逻辑完全一样,放在这里只留一份实现;
 * 断言本身仍写在各测试文件里.
 *
 * 宿主带 `#app` 这个 id 与 index.html 逐字一致:桌面根就是页面上那一颗手写宿主,
 * 测试里的形状不该比真页面多一层或少一层.
 *
 * 宿主用库的 `create_element` 建(与"有实现就复用当前实现"一条;`into: document.body`
 * 让"建"与"挂"是同一次调用).这与 `document.createElement` 产出完全同构的节点 -- 库里
 * 那一份就是 `doc.createElement(tag)` + 逐个 `setAttribute`,本条只是少写一次 `append`.
 *
 * 只有 `*.test.ts` 会被 vitest 收集,本文件是普通模块,由
 * `src/ui/rbt/rbt_views.test.ts` 显式 import(与主站 oled / calendar 那两份测试同一个用法).
 */
import { expect } from 'vitest';
import { create_element } from 'miko_ui';

/** 清空文档,建一颗新宿主并把 `mount` 装上去,返回宿主与挂载函数的返回值 */
export function renderHost<T>(mount: (host: HTMLElement) => T): { host: HTMLElement; result: T } {
    document.body.innerHTML = '';
    const host = create_element({ tag: 'div', into: document.body }, { id: 'app' });
    return { host, result: mount(host) };
}

/** 断言整个文档里没有重复的 id */
export function expectNoDuplicateIds(): void {
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
}
