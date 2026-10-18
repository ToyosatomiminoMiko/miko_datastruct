/**
 * 桌面标记契约测试共用的小工具:挂宿主 + 查重复 id.
 *
 * 引用必须在文档里查,否则可能绑到不在页面上的节点;宿主 id `#app` 与 index.html 逐字一致,
 * 测试里的形状不该比真页面多一层或少一层.
 *
 * 只有 `*.test.ts` 会被 vitest 收集,本文件是普通模块,由测试显式 import.
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
