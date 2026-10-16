import { fileURLToPath } from 'node:url';
// defineConfig 从 vitest/config 拿:它只是给 Vite 的 UserConfig 多加了 test 段,
// 这样测试的收集规则与构建配置住在同一个文件里,不必再养一份 vitest.config.ts.
import { defineConfig } from 'vitest/config';

/**
 * 源码根别名 `@/` == `src/`,与 `tsconfig.json` 的 `paths` 是同一份约定的两半
 * (TS 侧管类型检查与编辑器,Vite 侧管 dev/build/test 的实际解析,改一处必须同步另一处).
 */
const SRC_ALIAS = fileURLToPath(new URL('./src', import.meta.url)).replace(/\/$/, '');

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
    test: {
        // 单测分两层,文件都叫 `src/**/*.test.ts`:
        //   - 纯数据 / 纯函数单测:默认的 node 环境(rbt_tree.test.ts 的解析与性质检查);
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
