/*
 * 核心 / 文档层的结果 -> 界面上给人看的中文文案.
 *
 * 解析器只给稳定错误码 + 路径 + 人话;检查结论的文案全部来自 JSON(checks[].name /
 * detail / details),这里不重新拼.本文件只做三件事:
 * 1. 把解析错误包成一行可显示的文本;
 * 2. 检查抬头(`{total} 条中 {failed} 条 FAIL`)的占位符替换;
 * 3. 节点属性 -> 视觉层的变体名(红黑树的 `color: "red"` -> `visual-node--red`).
 */

import { SceneDocumentError } from '@/datastruct/scene/scene_document_parse';
import { VIEWER_CHECK_SUMMARY } from '@/ui/viewer/config';

/**
 * 解析失败 -> 一行错误文本.
 *
 * SceneDocumentError 的 message 已经带 `path: 说明`,直接用;认不出的异常退回它
 * 自己的 message -- 那是意外状况,把原始信息露出来比吞掉有用.
 */
export function formatDocumentError(error: unknown): string {
    if (error instanceof SceneDocumentError) return error.message;
    return error instanceof Error ? error.message : String(error);
}

/** 检查抬头:把模板里的两个占位符换成数字 */
export function formatCheckSummary(total: number, failed: number): string {
    return VIEWER_CHECK_SUMMARY
        .replace('{total}', String(total))
        .replace('{failed}', String(failed));
}

/** 变体名只收小写字母 / 数字 / 连字符:它要落进 class 名,不能带空格或引号 */
const VARIANT_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * 节点属性 -> 视觉变体的类名后缀.
 *
 * 约定只有两条,都来自中性文档的 attrs:
 * - `attrs.variant` 是显式的视觉变体名(给非颜色类的语义,如 current / visited);
 * - `attrs.color` 是颜色类属性的通用走法(红黑树示例用它:red / black).
 *
 * 取值不合法(不是字符串 / 不符合类名安全字符)就当没有变体:视觉层有基础观感,
 * 不会因为一个坏属性把整棵树画坏.
 */
export function nodeVariant(attrs: Readonly<Record<string, string | number | boolean>>): string | undefined {
    const explicit = attrs.variant;
    if (typeof explicit === 'string' && VARIANT_PATTERN.test(explicit)) return explicit;

    const color = attrs.color;
    if (typeof color === 'string') {
        const normalized = color.toLowerCase();
        if (VARIANT_PATTERN.test(normalized)) return normalized;
    }
    return undefined;
}

/**
 * 属性值 -> 列表行里显示的文字.
 *
 * 数字 / 布尔原样转字符串;字符串不加引号(attrs 里的字符串就是展示语义,如颜色名),
 * 与 JSON 原文的引号区分开:列表是给人读的,不是另一份源码.
 */
export function formatAttributeValue(value: string | number | boolean): string {
    return String(value);
}
