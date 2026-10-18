/**
 * Vite 层面的全局模块声明:样式表等资源由 Vite 在构建期处理,TS 侧导入时按空对象看待.
 *
 * 不引 `vite/client` 全量类型:它自带 `*.css` 等资源声明,会与本文件重复.
 */
declare module '*.css';
declare module '*.js';
