/*
 * 项目样式契约:全站直角(不出现圆角).
 *
 * 规则:`css/` 与 `src/` 下的样式表、以及宿主 `index.html` 的内联 style 里,
 * `border-radius` 只允许写成 `0` / `0px`.直角基线(令牌覆盖 + `*` 兜底)在
 * `css/app.css`;这条测试防的是"某个组件又顺手写了一个 px 半径"——演示浮条的
 * 10px 就是这么漏出去的.
 *
 * 为什么读文件而不是量 DOM:圆角可能来自 UA / 库 / 项目样式表三处,项目能改的只有
 * 第三处;单测环境没有真实排版,量不到 UA 的绘制.库自己的样式表不归这里管,它读的
 * `--radius-*` 已由应用层钉成 0.
 *
 * 扫描范围显式列成 `css/` + `src/` + `index.html`:不碰 node_modules 与 dist(生成物,
 * 产物里的圆角是构建时拼进来的,不该让源码契约测试去读).
 *
 * @vitest-environment node
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** 仓库根:本文件在 `src/`,向上一层 */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 样式内容的根:两份样式目录 + 宿主页(内联 style 也算项目写的样式) */
const STYLE_ROOTS = [join(PROJECT_ROOT, 'css'), join(PROJECT_ROOT, 'src')];
const HOST_PAGE = join(PROJECT_ROOT, 'index.html');

/** 允许的直角写法;其余一律视为圆角 */
const SQUARE_VALUES = new Set(['0', '0px']);

/** 递归收集一份目录下的样式表与宿主页(目录按名字过滤,不追 node_modules 之类) */
function collectStyleFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectStyleFiles(path));
        } else if (entry.name.endsWith('.css') || entry.name.endsWith('.html')) {
            files.push(path);
        }
    }
    return files;
}

/** 去掉注释:被注释掉的示例声明不该让契约测试误报 */
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('样式契约:全站直角', () => {
    it('项目样式表里不出现非零 border-radius', () => {
        const files = [...STYLE_ROOTS.flatMap(collectStyleFiles), HOST_PAGE];
        const offenders: string[] = [];

        for (const file of files) {
            const source = stripComments(readFileSync(file, 'utf8'));
            for (const match of source.matchAll(/border-radius\s*:\s*([^;]+);/g)) {
                const value = match[1].trim();
                if (!SQUARE_VALUES.has(value)) {
                    offenders.push(`${relative(PROJECT_ROOT, file)}: border-radius: ${value}`);
                }
            }
        }

        expect(offenders).toEqual([]);
    });
});
