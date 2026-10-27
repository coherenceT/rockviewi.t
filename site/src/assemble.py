#!/usr/bin/env python3
"""Assemble the standalone page (site/index.html) from its editable sources.

Run: python3 site/src/assemble.py

Sources:  site/src/body.html, site/src/page.css, site/src/page.js
Output:   site/index.html  (one self-contained file: inline CSS/JS,
          fonts, certification logos and favicon as data URIs)
"""
from pathlib import Path
import base64

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
OUT = ROOT / 'index.html'

FONTS = {
    '@@BRICOLAGE_FONT@@': ROOT / 'fonts' / 'bricolage-display.woff2',
    '@@PLEX400_FONT@@': ROOT / 'fonts' / 'plex-sans-400.woff2',
    '@@PLEX600_FONT@@': ROOT / 'fonts' / 'plex-sans-600.woff2',
}
LOGOS = ['comptia.svg', 'azure.svg', 'aws.svg', 'python-institute.svg']


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()


def build() -> Path:
    page = OUT.read_text(encoding='utf-8')

    css = (SRC / 'page.css').read_text(encoding='utf-8')
    for marker, path in FONTS.items():
        css = css.replace(marker, b64(path))
    if '@@' in css:
        raise SystemExit('unresolved font placeholder in page.css')

    start = page.index('  <style>') + len('  <style>')
    end = page.index('  </style>', start)
    page = page[:start] + '\n' + css + '\n' + page[end:]

    body_start = page.index('<body>') + len('<body>')
    script_start = page.index('<script>', body_start)
    page = page[:body_start] + '\n' + (SRC / 'body.html').read_text(encoding='utf-8') + '\n' + page[script_start:]

    script_start = page.rindex('<script>') + len('<script>')
    script_end = page.index('</script>', script_start)
    page = page[:script_start] + '\n' + (SRC / 'page.js').read_text(encoding='utf-8') + '\n' + page[script_end:]

    for name in LOGOS:
        uri = 'data:image/svg+xml;base64,' + b64(ROOT / 'assets' / name)
        page = page.replace(f'src="assets/{name}"', f'src="{uri}"')
    icon = 'data:image/svg+xml;base64,' + b64(ROOT / 'assets' / 'favicon.svg')
    page = page.replace('href="assets/favicon.svg"', f'href="{icon}"')

    for unresolved in ('__INLINE_', 'assets/', 'fonts/', '@@'):
        if unresolved in page:
            raise SystemExit(f'unresolved placeholder/external asset: {unresolved}')

    OUT.write_text(page, encoding='utf-8')
    print(f'built {OUT} ({len(page):,} bytes)')
    return OUT


if __name__ == '__main__':
    build()
