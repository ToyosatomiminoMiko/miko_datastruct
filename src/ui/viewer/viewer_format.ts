/*
 * 核心 / 文档层的结果 -> 界面上给人看的中文文案.
 *
 * 解析器只给稳定错误码 + 路径 + 人话;检查结论的文案来自检查器(注册在
 * datastruct/<结构>/<结构>_checks.ts),这里不重新拼.本文件只做四件事:
 * 1. 把解析错误包成一行可显示的文本;
 * 2. 检查抬头(`{total} 条中 {failed} 条 FAIL`)的占位符替换;
 * 3. 检查配置的报错文案 / 未注册函数名的提示;
 * 4. 节点属性 -> 视觉层的变体名(红黑树的 `color: "red"` -> `visual-node--red`).
 */

import { SceneDocumentError } from '@/datastruct/scene/scene_document_parse';
import {
    VIEWER_CHECK_CONFIG_ERROR_PREFIX,
    VIEWER_CHECK_SUMMARY,
    VIEWER_UNKNOWN_CHECK_TEXT,
} from '@/ui/viewer/config';

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

/**
 * 检查配置解析失败 -> 一行可显示的错误文本.
 *
 * 与文档解析错误分开:文档错了画不了图;检查配置错了只是这次不跑检查,图照画,所以
 * 前缀写明"检查配置: ",读者不会以为是 JSON 文档本身坏了.
 */
export function formatCheckConfigError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return `${VIEWER_CHECK_CONFIG_ERROR_PREFIX}${message}`;
}

/**
 * 检查配置里有未注册的函数名 -> 诊断窗口的一句警告.
 *
 * 不是错误:已注册的检查照跑,只是配置里这部分被忽略.可用函数名在帮助窗口里.
 */
export function formatUnknownChecks(ids: readonly string[]): string {
    return VIEWER_UNKNOWN_CHECK_TEXT.replace('{ids}', ids.join(', '));
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
