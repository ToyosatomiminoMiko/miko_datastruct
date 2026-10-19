/**
 * 内置示例清单(纯逻辑,node 环境)的契约.
 *
 * 示例是"结构 + 配套检查"的配对,任何一条对不上都会在首屏直接表现为画不出来 /
 * 诊断窗口报"未找到检查函数",所以这里把清单本身当数据校验一遍.
 */
import { describe, expect, it } from 'vitest';

import '@/datastruct/checks';
import { registeredCheckIds } from '@/scene/scene_check';
import { parseSceneDocument } from '@/scene/scene_document_parse';
import {
    DEFAULT_VIEWER_EXAMPLE,
    VIEWER_EXAMPLES,
    findViewerExample,
    viewerExampleMenuGroups,
} from '@/ui/viewer/examples';

describe('内置示例清单', () => {
    it('id 唯一,默认示例是第一条', () => {
        const ids = VIEWER_EXAMPLES.map((example) => example.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(DEFAULT_VIEWER_EXAMPLE).toBe(VIEWER_EXAMPLES[0]);
        expect(findViewerExample(DEFAULT_VIEWER_EXAMPLE.id)).toBe(DEFAULT_VIEWER_EXAMPLE);
        expect(findViewerExample('nope')).toBeUndefined();
    });

    it('每份 JSON 都能被中性文档解析器收下', () => {
        for (const example of VIEWER_EXAMPLES) {
            const document = parseSceneDocument(example.json);
            expect(document.nodes.length, example.id).toBeGreaterThan(0);
        }
    });

    it('每份示例建议的检查函数名都已注册', () => {
        const registered = new Set(registeredCheckIds());
        for (const example of VIEWER_EXAMPLES) {
            for (const id of example.checkIds) {
                expect(registered.has(id), `${example.id}: ${id}`).toBe(true);
            }
        }
    });

    it('菜单分组覆盖全部示例,组内顺序与清单一致', () => {
        const groups = viewerExampleMenuGroups();
        expect(groups.map((group) => group.title)).toEqual(['树', '线性结构', '图']);
        const values = groups.flatMap((group) => group.entries.map((entry) => entry.value));
        expect(values).toEqual(VIEWER_EXAMPLES.map((example) => example.id));
        for (const group of groups) {
            for (const entry of group.entries) {
                const example = findViewerExample(entry.value);
                expect(entry.text).toBe(example?.title);
                expect(entry.hint).toBe(example?.hint);
            }
        }
    });
});
