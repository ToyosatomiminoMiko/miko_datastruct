#!/usr/bin/env python3
"""本地联调 miko_ui: 把 node_modules/miko_ui 换成指向本地工作副本的符号链接.
============================================================================
[为什么需要它]
应用依赖的是发布在 npm 上的 miko_ui, 部署(gh-pages)也只能走 npm. 但改库的时候
"改一行 -> 发一版 -> 回来更新 lock" 这条环路太长. 这一步只在**本地**把解析目标
换成工作副本:

  * 只动 node_modules/(gitignore), 不碰 package.json 与 package-lock.json;
  * CI / 部署一个字节都不变(npm ci 就能还原成 npm 上那一版).

之所以不把 "file:../miko_ui" 写进 package.json: CI 上没有那个路径, 仓库里一旦
留下本地依赖, 构建会直接失败; 链接只存在于被忽略的 node_modules/ 里就没有这个
风险. 本文件与 miko_graphcalc/scripts/dev_ui_link.py 是同一套做法(那边是来源,
这里去掉它依赖的 buildlib 工具包, 自足可跑).

[用法]
  python3 scripts/dev_ui_link.py link     # 链接到本地副本(默认动作)
  python3 scripts/dev_ui_link.py unlink   # 还原成 npm 版(按 lock 重装)
  python3 scripts/dev_ui_link.py status   # 看当前解析到哪一份
(scripts/dev_ui_link.sh 只是壳; npm run ui:link / ui:unlink / ui:status 同理.)

工作副本位置默认 ../miko_ui(相对仓库根的上层目录), 用 MIKO_UI_DIR 覆盖:
  MIKO_UI_DIR=/path/to/miko_ui python3 scripts/dev_ui_link.py link

[链接之后怎么用]
  * 库的 styles/ 是原样发布的(库的 exports 直接映射到 styles/*.css), 改完
    **零构建立即生效**;
  * 库的 src/ 要先编译进 dist/, 两条路:
        cd <库> && npm run build:dist
        或 在库里常驻 npx tsc -p tsconfig.build.json --watch
    (两种别同时用: build:dist 开头会 clean, 和常驻的 watch 会打架);
  * Vite 会把 root 外已加载的**模块**加进自己的 watcher, 保存后自动刷新; 但
    模块之外的**资源**(库样式表里 url() 引的 woff2)走 /@fs/<真身>/... 直接
    请求, 落在 server.fs.allow 之外会被 403 并**静默**退回回退字体.
    vite.config.ts 的 libraryServeDirs() 会自动把库(以及它解析到的 katex)的
    真身目录补进去, 所以链接状态不用额外配置.

[两个已知坑]
  1. node_modules/.vite 里可能有上一轮按 npm 包预打包的产物(deps/miko___ui.js),
     链接切换前后不清它, 表现是"改了库但页面没动". 本脚本在 link / unlink 时
     都会删掉这个缓存目录.
  2. 本地 npm test 也会跟着用工作副本(测试直接读库的 styles/), 所以"本地绿"
     不等于"CI 绿"; 要回到 npm 上那一版就跑 unlink(或 npm ci).
"""
from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import sys
from pathlib import Path

UI_PKG_NAME = 'miko_ui'
PROJECT_ROOT = Path(__file__).resolve().parent.parent
LINK_PATH = PROJECT_ROOT / 'node_modules' / UI_PKG_NAME
VITE_CACHE = PROJECT_ROOT / 'node_modules' / '.vite'
DEFAULT_UI_DIR = PROJECT_ROOT.parent / UI_PKG_NAME
METADATA_FILES = ('package.json', 'package-lock.json')


def log(message: str) -> None:
    print(f'[UI-LINK] {message}')


def fail(message: str) -> None:
    print(f'[UI-LINK][ERROR] {message}', file=sys.stderr)
    raise SystemExit(1)


def resolve_ui_dir() -> Path:
    """工作副本位置: `MIKO_UI_DIR` 优先, 否则本仓库的上层同级目录 `../miko_ui`."""
    return Path(os.environ.get('MIKO_UI_DIR', DEFAULT_UI_DIR))


def ui_version(directory: Path) -> str:
    """库的版本号(读不到就返回空串, 只用于日志)."""
    import json

    try:
        with (directory / 'package.json').open(encoding='utf-8') as handle:
            return str(json.load(handle).get('version', ''))
    except (OSError, ValueError):
        return ''


def metadata_fingerprint() -> str:
    """package.json / package-lock.json 的内容指纹.

    只动 node_modules 是这个脚本的契约, 所以链接前后比一次: 变了就说明这整套
    操作碰了被跟踪的文件, 要喊出来让人看 `git diff`, 而不是悄悄继续.
    """
    digest = hashlib.sha256()
    for name in METADATA_FILES:
        path = PROJECT_ROOT / name
        digest.update(name.encode('utf-8'))
        if path.is_file():
            digest.update(path.read_bytes())
    return digest.hexdigest()


def require_ui_checkout(ui_dir: Path) -> None:
    """链接前的三道校验: 有 package.json / 确实是 miko_ui / dist 已编译."""
    if not (ui_dir / 'package.json').is_file():
        fail(f'no library checkout at {ui_dir} (set MIKO_UI_DIR to point at it)')

    name_version = ui_version(ui_dir)
    import json

    with (ui_dir / 'package.json').open(encoding='utf-8') as handle:
        name = json.load(handle).get('name')
    if name != UI_PKG_NAME:
        fail(f"{ui_dir} is not the {UI_PKG_NAME} checkout (package.json name='{name}')")

    # 应用运行时 import 的是库的 dist/, 没有它连 dev server 都起不来. 与其链上去
    # 再报一个难懂的解析错误, 不如在这里说清要先编译.
    if not (ui_dir / 'dist' / 'index.js').is_file():
        fail(
            f'{ui_dir}/dist/index.js is missing; build the library first:\n'
            f'    cd {ui_dir} && npx tsc -p tsconfig.build.json --watch\n'
            f'    (库版本 {name_version})'
        )


def clear_vite_cache() -> None:
    """删掉 Vite 的依赖预打包缓存.

    链接与还原之后都必须做, 否则页面继续吃旧的预打包产物: 库链接进来之后走的是
    真身源码路径, 不再预打包, 缓存里那份旧的会让"改了库但页面没动".
    """
    if VITE_CACHE.is_dir():
        shutil.rmtree(VITE_CACHE)
        log('cleared Vite dep cache: node_modules/.vite')


def link(ui_dir: Path) -> int:
    require_ui_checkout(ui_dir)

    if not (PROJECT_ROOT / 'node_modules').is_dir():
        fail("node_modules is missing; run 'npm install' first")

    before = metadata_fingerprint()
    target = ui_dir.resolve()

    current = None
    if LINK_PATH.is_symlink():
        try:
            current = LINK_PATH.resolve()
        except OSError:
            current = None

    if current == target:
        log(f'already linked to {target}')
    else:
        # 删掉的是 npm 装的那一份目录, 不是工作副本; 要还原就走 unlink 或 npm ci.
        if LINK_PATH.exists() or LINK_PATH.is_symlink():
            log(f'replacing npm copy with a link to {target}')
        else:
            log(f'linking node_modules/{UI_PKG_NAME} -> {target}')
        if LINK_PATH.is_symlink() or LINK_PATH.is_file():
            LINK_PATH.unlink()
        else:
            shutil.rmtree(LINK_PATH)
        LINK_PATH.symlink_to(target)

    clear_vite_cache()

    if before != metadata_fingerprint():
        fail('package.json / package-lock.json changed unexpectedly; check git diff')

    log(f'linked: node_modules/{UI_PKG_NAME} -> {target} (version {ui_version(LINK_PATH)})')
    log("the app now resolves the local copy: run 'npx vite' for the local server")
    log(f"after editing the library's src/, rebuild its dist/: cd {target} && npm run build:dist")
    log('restore the published package with: python3 scripts/dev_ui_link.py unlink (or npm ci)')
    return 0


def unlink() -> int:
    if LINK_PATH.is_symlink():
        LINK_PATH.unlink()
        log(f'removed the link at node_modules/{UI_PKG_NAME}')
    elif LINK_PATH.exists():
        log(f'node_modules/{UI_PKG_NAME} is not a link; nothing to unlink')
        return 0

    before = metadata_fingerprint()
    log(f'reinstalling {UI_PKG_NAME} from package-lock.json')
    result = subprocess.run(['npm', 'install', '--no-audit', '--no-fund'], cwd=PROJECT_ROOT)
    if result.returncode != 0:
        fail('npm install failed')
    if before != metadata_fingerprint():
        fail('npm install changed package.json / package-lock.json; check git diff')

    clear_vite_cache()
    log(f'{UI_PKG_NAME} is back to the published version: {ui_version(LINK_PATH) or "unknown"}')
    return 0


def status() -> int:
    if LINK_PATH.is_symlink():
        log(f'resolves to the local checkout: {LINK_PATH.resolve()}')
    elif LINK_PATH.exists():
        log(f'resolves to the npm package: version {ui_version(LINK_PATH) or "unknown"}')
    else:
        log('not installed (run npm install)')

    if VITE_CACHE.is_dir():
        log('Vite dep cache exists: node_modules/.vite')

    if shutil.which('git') is not None:
        dirty = subprocess.run(
            ['git', '-C', str(PROJECT_ROOT), 'status', '--porcelain', '--', *METADATA_FILES],
            capture_output=True, text=True,
        ).stdout.strip()
        if dirty:
            log('WARN: package.json / package-lock.json have uncommitted changes')
    return 0


def main(argv: list[str]) -> int:
    action = argv[0] if argv else 'link'
    if action == 'link':
        return link(resolve_ui_dir())
    if action == 'unlink':
        return unlink()
    if action == 'status':
        return status()
    fail(f"unknown action '{action}' (expected link|unlink|status)")
    return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
