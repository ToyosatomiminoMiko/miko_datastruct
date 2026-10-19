/**
 * 两种列表行(实体 / 检查)的 DOM 契约(happy-dom).
 *
 * 钉的是"行里实际渲染了什么":实体行的 label / 颜色 / 其余属性、检查行的 PASS / FAIL
 * 徽章与折叠详情、以及「定位」按钮出现的条件.行引擎(RowList)的增删复用由查看器的行为
 * 测试覆盖,这里只管单行的结构.
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { SceneDocumentCheck, SceneDocumentNode } from '@/datastruct/scene/scene_document';
import { CheckItem, EntityItem } from '@/ui/viewer/viewer_items';

beforeEach(() => {
    document.body.innerHTML = '';
});

function entityNode(overrides: Partial<SceneDocumentNode> = {}): SceneDocumentNode {
    return {
        key: 0,
        label: '10',
        attrs: {},
        ...overrides,
    };
}

function check(overrides: Partial<SceneDocumentCheck> = {}): SceneDocumentCheck {
    return {
        name: '根节点为黑色',
        passed: true,
        detail: '',
        details: [],
        node: null,
        ...overrides,
    };
}

describe('实体行', () => {
    it('label / 颜色定义 / 其余属性都画出来;颜色不是只靠色块', () => {
        const item = new EntityItem(entityNode({
            key: 3,
            label: '8',
            attrs: { color: 'black', weight: 2 },
        }), () => {});

        expect(item.row.classList.contains('object-row')).toBe(true);
        expect(item.row.classList.contains('entity-row')).toBe(true);
        expect(item.row.dataset.nodeKey).toBe('3');
        expect(item.row.querySelector('.object-name')?.textContent).toBe('8');
        // 颜色:色块 + 明文值(色觉 / 低对比度用户也能读到定义)
        expect(item.row.querySelector('.viewer-color-code')?.textContent).toBe('black');
        const swatch = item.row.querySelector('.viewer-color-swatch') as HTMLElement;
        expect(swatch.style.getPropertyValue('--viewer-attr-color-value')).toBe('black');
        // 其余属性走 key: value 小徽章
        expect([...item.row.querySelectorAll('.viewer-attr')].map((node) => node.textContent))
            .toEqual(['weight: 2']);
    });

    it('行末「定位」按钮接上回调', () => {
        let located = 0;
        const item = new EntityItem(entityNode(), () => {
            located += 1;
        });
        const button = item.row.querySelector<HTMLButtonElement>('.row-locate-btn');
        expect(button).not.toBeNull();
        button?.click();
        expect(located).toBe(1);
    });

    it('内容键跟着会被渲染的字段走', () => {
        expect(EntityItem.cacheKey(entityNode()))
            .not.toBe(EntityItem.cacheKey(entityNode({ label: '11' })));
        expect(EntityItem.cacheKey(entityNode()))
            .not.toBe(EntityItem.cacheKey(entityNode({ attrs: { color: 'red' } })));
    });
});

describe('检查行', () => {
    it('PASS:徽章文案与配色类,没有详情就没有 <details>,也没有定位按钮', () => {
        const item = new CheckItem(check(), null);

        expect(item.row.classList.contains('check-row')).toBe(true);
        const badge = item.row.querySelector('.ui-badge');
        expect(badge?.textContent).toBe('PASS');
        expect(badge?.classList.contains('is-pass')).toBe(true);
        expect(item.row.querySelector('.object-name')?.textContent).toBe('根节点为黑色');
        expect(item.row.querySelector('.viewer-details')).toBeNull();
        expect(item.row.querySelector('.row-locate-btn')).toBeNull();
    });

    it('FAIL + details + node:可折叠详情、行末「定位」、行内一句话', () => {
        let located = 0;
        const item = new CheckItem(check({
            name: '各路径黑色节点数量相同',
            passed: false,
            detail: '两侧黑高不同',
            details: ['较浅一侧 1', '较深一侧 2'],
            node: 0,
        }), () => {
            located += 1;
        });

        expect(item.row.classList.contains('is-fail')).toBe(true);
        const badge = item.row.querySelector('.ui-badge');
        expect(badge?.textContent).toBe('FAIL');
        expect(badge?.classList.contains('is-fail')).toBe(true);
        expect(item.row.querySelector('.viewer-row-detail')?.textContent).toBe('两侧黑高不同');

        const details = item.row.querySelector<HTMLDetailsElement>('details.viewer-details');
        expect(details).not.toBeNull();
        expect(details?.open).toBe(false);
        expect([...item.row.querySelectorAll('.viewer-detail-line')].map((node) => node.textContent))
            .toEqual(['较浅一侧 1', '较深一侧 2']);

        item.row.querySelector<HTMLButtonElement>('.row-locate-btn')?.click();
        expect(located).toBe(1);
    });

    it('FAIL 但没有 node:不摆一颗点不动的「定位」按钮', () => {
        const item = new CheckItem(check({ passed: false, detail: '不存在欧拉回路' }), null);
        expect(item.row.querySelector('.row-locate-btn')).toBeNull();
    });

    it('行重建时把 <details> 的展开态搬到新行(内容变化不该收起用户展开的详情)', () => {
        const previous = new CheckItem(check({ passed: false, details: ['a'] }), null);
        const details = previous.row.querySelector<HTMLDetailsElement>('details');
        if (!details) throw new Error('旧行里没有 <details>');
        details.open = true;

        const next = new CheckItem(check({ passed: false, details: ['b'] }), null);
        expect(next.row.querySelector<HTMLDetailsElement>('details')?.open).toBe(false);
        next.preserveExpandedStateFrom(previous);
        expect(next.row.querySelector<HTMLDetailsElement>('details')?.open).toBe(true);
    });

    it('内容键跟着描述 / 详情 / 状态 / 定位目标走', () => {
        expect(CheckItem.cacheKey(check())).not.toBe(CheckItem.cacheKey(check({ passed: false })));
        expect(CheckItem.cacheKey(check())).not.toBe(CheckItem.cacheKey(check({ detail: 'x' })));
        expect(CheckItem.cacheKey(check())).not.toBe(CheckItem.cacheKey(check({ node: 0 })));
    });
});
