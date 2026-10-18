#!/usr/bin/env python3
"""本地联调 miko_ui: 把 node_modules/miko_ui 换成指向本地工作副本的符号链接.

用法: python3 scripts/dev_ui_link.py link|unlink|status (默认 link), MIKO_UI_DIR 可覆盖副本位置.
只动 node_modules/(gitignore), 不碰 package.json 与 package-lock.json, 所以 CI / 部署不受影响.
坑: 切换前后必须清 node_modules/.vite 的预打包缓存, 否则"改了库但页面没动"; 链接期间本地
测试也读工作副本, "本地绿"不等于"CI 绿", 要回到 npm 那一版就跑 unlink(或 npm ci).
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

    只动 node_modules 是本脚本的契约: 指纹变了就说明碰了被跟踪的文件, 要喊出来
    让人看 `git diff`, 而不是悄悄继续.
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

    链接与还原之后都必须做: 库链接进来后走真身源码, 不再预打包, 缓存里那份旧的
    会让"改了库但页面没动".
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
