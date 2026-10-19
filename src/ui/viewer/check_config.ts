/*
 * 「检查配置」编辑器的内容解析:一段 JSON 数组,元素是检查函数名.
 *
 * 为什么用 JSON 数组而不是纯文本:检查配置窗口与 JSON 窗口共用同一套 CodeEditor +
 * JSON 词法高亮(见 viewer_highlight.ts),不需要为它再养一套分词.用户填的仍然只是
 * 函数名,外面套一层数组语法而已.
 *
 * 只做语法 / 形状校验,不判断"名字有没有注册":那是注册表的事(unknownIds),
 * 解析层报的是"这段输入本身不合法",两者分开显示.
 */

/** 检查配置解析失败:语法错误 / 顶层不是数组 / 元素不是非空字符串 */
export class CheckConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CheckConfigError';
    }
}

/**
 * 把检查配置源码解析成函数名数组.
 *
 * - 空串 / 全空白 = 没有检查(空数组),不是错误;
 * - 同一函数名写两次只保留第一次:检查窗口不重复列行,运行层也不再各自去重;
 * - JSON 语法错误沿用 `JSON.parse` 的消息(它自带位置,包一层反而读不懂).
 */
export function parseCheckConfig(source: string): readonly string[] {
    const text = source.trim();
    if (text === '') return [];

    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new CheckConfigError(`JSON 解析失败: ${message}`);
    }

    if (!Array.isArray(value)) {
        throw new CheckConfigError('顶层必须是检查函数名的 JSON 数组');
    }

    const ids: string[] = [];
    for (const [index, item] of value.entries()) {
        if (typeof item !== 'string' || item.trim() === '') {
            throw new CheckConfigError(`[${index}] 必须是非空字符串`);
        }
        if (!ids.includes(item)) ids.push(item);
    }
    return ids;
}

/** 函数名数组 -> 编辑器里的 JSON 文本(默认示例配置用;缩进与 JSON 窗口一致) */
export function dumpCheckConfig(ids: readonly string[]): string {
    return JSON.stringify(ids, null, 2);
}
