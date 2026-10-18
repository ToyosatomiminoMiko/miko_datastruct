import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { searchForWorkspaceRoot } from 'vite';
// defineConfig 从 vitest/config 拿:它只比 Vite 的 UserConfig 多一个 test 段,
// 收集规则与构建配置同住一个文件,不必再养一份 vitest.config.ts.
import { defineConfig } from 'vitest/config';

/**
 * 源码根别名 `@/` == `src/`,与 `tsconfig.json` 的 `paths` 是同一份约定的两半
 * (TS 侧管类型检查与编辑器,Vite 侧管 dev/build/test 的实际解析,改一处必须同步另一处).
 */
const SRC_ALIAS = fileURLToPath(new URL('./src', import.meta.url)).replace(/\/$/, '');

/** 本仓库根目录(配置文件所在目录),给 `searchForWorkspaceRoot` 与真身解析用. */
const PROJECT_ROOT = fileURLToPath(new URL('.', import.meta.url));

const require = createRequire(import.meta.url);

/**
 * 库(`miko_ui`)在磁盘上的**真身**目录,以及它实际用的 katex 包目录.
 *
 * Vite 按真身路径解析,而本地联调时 `node_modules/miko_ui` 是符号链接(见
 * `scripts/dev_ui_link.py`);库样式表里 `url(...)` 引的字体由浏览器按 `/@fs/<真身>/...`
 * 直接请求,落在 `server.fs.allow`(默认只有工作区根)之外就会 403 并**静默**退回回退字体.
 * katex 的位置必须问库本身(`createRequire(库的 package.json)`),因为 `node_modules/katex`
 * 可能被提升到任何一层. 只在 dev server / preview 生效,`vite build` 会把字体拷进产物.
 */
function libraryServeDirs(): string[] {
    const dirs: string[] = [];
    try {
        const manifest = require.resolve('miko_ui/package.json');
        dirs.push(dirname(realpathSync(manifest)));
        try {
            dirs.push(dirname(realpathSync(createRequire(manifest).resolve('katex/package.json'))));
        } catch {
            // 库这一版没带 katex:没有字体要放行
        }
    } catch {
        // 库没装出来:没有要额外放行的东西
    }
    return dirs;
}

export default defineConfig({
    /**
     * 部署路径的**唯一开关**:产物里的资源路径与 HTML 里的引用都写成这个前缀,
     * 仓库改名(或挪到别的子路径)时只改这一处.
     * dev server 与 `vite preview` 也认它,本地地址是 http://localhost:5173/miko_datastruct/.
     */
    base: '/miko_datastruct/',
    resolve: {
        alias: [{ find: /^@\//, replacement: `${SRC_ALIAS}/` }],
        /**
         * 库的运行时依赖只留一份实例:`@preact/signals-core` 装成两份会让 `signal` 与
         * `effect` 落在两条注册表上(表现是"值变了界面不动"),`katex` 装成两份会有两套
         * 字体与两套模块状态.
         */
        dedupe: ['katex', '@preact/signals-core'],
    },
    // 生产产物只有一个入口:index.html(Vite 的默认入口,不需要 rollupOptions.input).
    build: {
        outDir: 'dist',
    },
    server: {
        fs: {
            /**
             * 写 `allow` 会**覆盖**默认值(默认只有"工作区根"),所以根必须留在数组里;
             * 库的真身在仓库外(见 `libraryServeDirs`),不放行它的字体请求就 403.
             */
            allow: [searchForWorkspaceRoot(PROJECT_ROOT), ...libraryServeDirs()],
        },
    },
    test: {
        // 单测分两层,文件都叫 `src/**/*.test.ts`:纯数据 / 纯函数走默认 node 环境;
        // 标记契约 / 行为测试在文件头写 `@vitest-environment happy-dom`,在进程内建真 DOM.
        include: ['src/**/*.test.ts'],
        exclude: ['node_modules/**', 'dist/**'],
        /**
         * 库产物里的相对导入不带扩展名(如 `./reactive`),Node 原生 ESM 解析会报
         * ERR_UNSUPPORTED_DIR_IMPORT;inline 进来走 Vite 的解析 / 转换链.
         */
        server: {
            deps: {
                inline: ['miko_ui'],
            },
        },
    },
});
