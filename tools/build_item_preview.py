"""수집품 원본·축소본의 알파와 누락을 확인하고 로컬 검수 페이지를 만든다."""
import hashlib
import html
import json
import re
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets/illustrated/items'
data = (ROOT / 'js/data.js').read_text(encoding='utf-8')
items = []
for group, block in [('orb', 'ORBS'), ('relic', 'RELICS')]:
    section = data.split(f'const {block} = {{', 1)[1].split('\n};', 1)[0]
    for key, name in re.findall(r"^\s*(\w+):\s*\{[^\n]*?name:'([^']+)'", section, re.M):
        stem = f'{group}_{key}'
        target = ROOT / 'assets/game' / f'{stem}.png'
        if not target.exists():
            raise ValueError(f'게임용 에셋 누락: {stem}')
        with Image.open(target) as im:
            rgba = im.convert('RGBA')
            if rgba.getchannel('A').getextrema() != (0, 255):
                raise ValueError(f'투명 배경 확인 필요: {stem}')
            if im.size != (96, 96):
                raise ValueError(f'크기 확인 필요: {stem}: {im.size}')
        source = SOURCE / f'{stem}.png'
        entry = {'id': stem, 'name': name, 'game': str(target.relative_to(ROOT)),
                 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
        if source.exists():
            with Image.open(source) as im:
                entry.update(source=str(source.relative_to(ROOT)), size=list(im.size),
                             alpha=list(im.convert('RGBA').getchannel('A').getextrema()))
        items.append(entry)
(SOURCE / 'manifest.json').write_text(json.dumps(items, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
cards = ''.join(f'<figure><img src="../../{i["game"]}" alt="{html.escape(i["name"])}"><figcaption>{html.escape(i["name"])}<small>{i["id"]}</small></figcaption></figure>' for i in items)
page = '''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>브릭 크롤 수집품 에셋</title><style>
:root{--bg:#f4eee2;--ink:#282622;--line:#b1a797;--panel:#fffaf0}*{box-sizing:border-box}
body{margin:0;padding:24px;background:var(--bg);color:var(--ink);font-family:system-ui,sans-serif}
body.dark{--bg:#242320;--ink:#e9e2d4;--line:#655f54;--panel:#35322d}
h1{font-size:24px;margin:0 0 12px}p{line-height:1.6}button{min-height:44px;background:var(--panel);color:var(--ink);border:1px solid var(--line);padding:8px 16px;cursor:pointer}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-top:20px}
figure{margin:0;padding:16px 8px;text-align:center;background:var(--panel);border:1px solid var(--line)}
img{width:96px;height:96px;object-fit:contain}body.small img{width:32px;height:32px;margin:32px}
figcaption{font-size:14px}small{display:block;font-size:11px;margin-top:6px}</style>
<h1>브릭 크롤 · 구슬 24종 / 유물 40종</h1><p>기존 구슬 7종과 새 수집품 57종. 투명 PNG의 밝은 배경·어두운 배경과 축소 가독성을 비교한다.</p>
<button onclick="document.body.classList.toggle('dark')">밝게 / 어둡게</button>
<button onclick="document.body.classList.toggle('small')">96px / 32px</button><main>''' + cards + '</main></html>'
(ROOT / 'docs/art/items-preview.html').write_text(page, encoding='utf-8')
# 한 장으로 비교해야 비슷한 실루엣이나 배경 잔여물을 빠르게 찾을 수 있다.
contact = Image.new('RGB', (960, ((len(items) + 7) // 8) * 136), '#eee7d9')
draw = ImageDraw.Draw(contact)
for i, entry in enumerate(items):
    x, y = (i % 8) * 120, (i // 8) * 136
    with Image.open(ROOT / entry['game']) as im:
        rgba = im.convert('RGBA')
        contact.paste(rgba, (x + 12, y + 4), rgba)
    draw.text((x + 4, y + 108), entry['id'], fill='#242320')
contact.save(ROOT / 'docs/art/items-contact.png')
print(f'PASS: {len(items)}종 파일·크기·알파 확인, manifest와 검수 페이지 생성')
