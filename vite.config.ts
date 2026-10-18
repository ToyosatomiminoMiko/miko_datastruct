import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { searchForWorkspaceRoot } from 'vite';
// defineConfig 从 vitest/config 拿:它只是给 Vite 的 UserConfig 多加了 test 段,
// 这样测试的收集规则与构建配置住在同一个文件里,不必再养一份 vitest.config.ts.
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
 * 为什么需要:本地联调时 `node_modules/miko_ui` 是指向仓库外工作副本的符号链接
 * (见 `scripts/dev_ui_link.py`),而 Vite 按真身路径解析 -- 库样式表里 `url(...)`
 * 引的字体由浏览器直接按 `/@fs/<真身>/...` 请求,落在 `server.fs.allow`(默认只有
 * 工作区根)之外,于是 dev 控制台刷 "outside of Vite serving allow list",字体的
 * 请求 403 并**静默**退回回退字体(排字照常,只是字形不对).
 *
 * 为什么 katex 的位置要问**库**而不是本仓库:`node_modules/katex` 是库的依赖,
 * 可能被提升到任何一层;从这边 `require.resolve` 不一定找得到它.所以用
 * `createRequire(库的 package.json)` 从库的解析上下文去问.
 *
 * 只在 dev server / preview 生效;`vite build` 把字体当资源拷进产物,不需要白名单.
 * 解析不到就跳过:npm 形状(库就在本仓库的 `node_modules/` 里,本来就在工作区根
 * 之内)不会因此多出任何路径.
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
     * 部署路径的**唯一开关**:Vite 用它把产物里的资源路径与 HTML 里的引用都写成这个前缀.
     * 仓库改名(或挪到别的子路径)时只改这一处.
     * 开发服务器与 `vite preview` 也认它,所以本地地址是 http://localhost:5173/miko_datastruct/.
     */
    base: '/miko_datastruct/',
    resolve: {
        alias: [{ find: /^@\//, replacement: `${SRC_ALIAS}/` }],
        /**
         * 库的运行时依赖只留一份实例:`@preact/signals-core` 装成两份会让 `signal` 与
         * `effect` 落在两条注册表上(表现是"值变了界面不动"),`katex` 装成两份会有两套
         * 字体与两套模块状态.本仓库不直接 import 这两个包,这条纯属防第二份的保险.
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
             * 默认白名单只有"工作区根".本地联调时库的真身在仓库外,它的字体走
             * `/@fs` 请求会被拒(见 `libraryServeDirs`).这里把根与库的真身一起
             * 放行 -- 写 `allow` 会**覆盖**默认值,所以根必须留在数组里.
             */
            allow: [searchForWorkspaceRoot(PROJECT_ROOT), ...libraryServeDirs()],
        },
    },
    test: {
        // 单测分两层,文件都叫 `src/**/*.test.ts`:
        //   - 纯数据 / 纯函数单测:默认的 node 环境
        //     (datastruct/ 下的解析与性质检查,以及 ui/ 下的布局 / 文案拼装);
        //   - **标记契约 / 行为**单测:文件头写 `@vitest-environment happy-dom` 的那些,
        //     在进程内建一个真 DOM,断言生成的标签 / 类名 / id 与 CSS 对得上.
        include: ['src/**/*.test.ts'],
        exclude: ['node_modules/**', 'dist/**'],
        /**
         * 库从 npm 装进 node_modules/ 后,Vitest 默认把它当外部依赖交给 Node 原生 ESM
         * 解析 -- 而库产物里的相对导入不带扩展名(如 dist/index.js 里的 `./reactive`),
         * Node 会报 ERR_UNSUPPORTED_DIR_IMPORT.把它 inline 进来走 Vite 的解析 / 转换链.
         */
        server: {
            deps: {
                inline: ['miko_ui'],
            },
        },
    },
});
