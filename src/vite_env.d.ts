/**
 * Vite 层面的全局模块声明.
 *
 * CSS 是 Vite 在构建期处理的资源(`import '@/ui/rbt/rbt.css'` 会返回空对象并把样式抽进
 * 产物),TypeScript 不认识这种导入,所以在这里声明一次;不引 `vite/client` 全量类型,
 * 它自带 `*.css` 等资源声明,会与本文件重复.
 */
declare module '*.css';
declare module '*.js';
