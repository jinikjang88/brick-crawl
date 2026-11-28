#!/usr/bin/env python3
"""assets/illustrated 원본을 게임 런타임용 작은 PNG(assets/game)로 변환한다.

원본은 1024px 이상 캐릭터·아이템 시트라 그대로 쓰면 배포 크기·모바일 로딩이 무겁다.
게임 캔버스는 논리 180×340을 화면에 맞춘 정수배(휴대폰 기준 4~7배) 백버퍼로 그리므로, 각 에셋은
그 화면에서 실제로 차지하는 크기의 1~2배만 남긴다.

AI 일러스트 원본(characters/*.png, portraits/*.png, items/*.png, bricks/*.png 또는 bricks.png,
chasm.png, icon.png)이 존재하는 모든 에셋을 런타임 크기로 변환하며, 아직 AI 원본이 없는 항목은
tools/draw_item_assets.py의 폴백을 유지한다(그래서 draw_item_assets.py를 먼저, 이 스크립트를 나중에 돌린다).

실행: python3 tools/build_game_assets.py  (Pillow, numpy 필요)
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'illustrated'
OUT = ROOT / 'assets' / 'game'

RES = 4
SHEET_SIZE = {'brick': (22 * RES * 2, 12 * RES * 2)}
ALL_CHARS = [
    'rick', 'sludge', 'drone', 'guardian', 'disperser',
    'sentinel', 'codex', 'gemini', 'claude', 'omnis', 'zero',
    'compiler', 'holo', 'stone', 'keeper', 'hardener', 'royal',
    'arm', 'observer', 'tower', 'lens',
]
CHAR_MAX = 256
# 구슬 부품·칩·벽돌 중 화(#C1443C) 위험 강조색이 허용되는 항목(check_assets.py 팔레트 규칙과 동일)
RED_ITEMS = {
    'orb_bomb', 'orb_venom', 'orb_thorn', 'orb_toxin',
    'relic_sting', 'relic_leech', 'relic_wrath', 'relic_heart', 'relic_plague', 'relic_pact',
    'brick_poison',
}


def label(mask):
    """scipy 없이 4-연결 요소를 찾는다. 반환: 영역별 (bbox, 픽셀 수, 좌표)."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    comps = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        q = deque([(y0, x0)]); seen[y0, x0] = True
        ys, xs = [], []
        while q:
            y, x = q.popleft(); ys.append(y); xs.append(x)
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        comps.append(((min(xs), min(ys), max(xs) + 1, max(ys) + 1), len(ys), (np.array(ys), np.array(xs))))
    return comps


def clamp_item_palette(img, allow_red=False):
    """LANCZOS 축소 과정에서 생길 수 있는 경계 채도 번짐까지 check_assets.py 기준(무채색 mx-mn<=40 또는 화 계열)에 맞춘다."""
    arr = np.array(img.convert('RGBA'))
    rgb = arr[..., :3].astype(np.float32)
    vis = arr[..., 3] > 20
    # 반투명 가장자리 찌꺼기 정리
    arr[arr[..., 3] <= 20] = 0
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    chroma = mx - mn
    red = allow_red & (r > g * 1.28) & (r > b * 1.28)
    bad = vis & (~red) & (chroma > 36)
    if np.any(bad):
        lum = 0.299 * r[bad] + 0.587 * g[bad] + 0.114 * b[bad]
        k = 28.0 / np.maximum(chroma[bad], 1.0)
        for ch in range(3):
            rgb[bad, ch] = np.clip(lum + (rgb[bad, ch] - lum) * k, 0, 255)
    if not allow_red:
        leak = vis & (rgb[..., 0] > rgb[..., 1] * 1.20) & (rgb[..., 0] > rgb[..., 2] * 1.20)
        if np.any(leak):
            lum = 0.299 * rgb[leak, 0] + 0.587 * rgb[leak, 1] + 0.114 * rgb[leak, 2]
            rgb[leak, 0] = lum; rgb[leak, 1] = lum; rgb[leak, 2] = lum
    arr[..., :3] = np.round(rgb).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA')


def fit(img, size, pad=4):
    """비율을 지키며 여백을 두고 size 안에 가운데 정렬한다."""
    inner = (max(1, size[0] - pad * 2), max(1, size[1] - pad * 2))
    img = img.copy(); img.thumbnail(inner, Image.LANCZOS)
    out = Image.new('RGBA', size, (0, 0, 0, 0))
    out.paste(img, ((size[0] - img.width) // 2, (size[1] - img.height) // 2))
    return out


BRICK_GRID = [['brick_n', 'brick_stone', 'brick_atk'], ['brick_def', 'brick_heal', 'brick_poison']]


def build_bricks():
    """개별 bricks/brick_*.png 또는 3×2 시트 bricks.png에서 벽돌 6장을 빌드한다."""
    indiv_dir = SRC / 'bricks'
    if indiv_dir.exists():
        for row in BRICK_GRID:
            for name in row:
                p = indiv_dir / f'{name}.png'
                if p.exists():
                    im = Image.open(p).convert('RGBA')
                    bb = im.getbbox()
                    if bb:
                        im = im.crop(bb).resize(SHEET_SIZE['brick'], Image.LANCZOS)
                        save(clamp_item_palette(im, allow_red=(name in RED_ITEMS)), name)
    if not (SRC / 'bricks.png').exists():
        return
    im = np.asarray(Image.open(SRC / 'bricks.png').convert('RGB')).astype(int)
    h, w, _ = im.shape
    bg = np.median(np.concatenate([im[:8].reshape(-1, 3), im[-8:].reshape(-1, 3)]), axis=0)
    fg = np.abs(im - bg).sum(axis=2) > 30
    rows_n, cols_n = len(BRICK_GRID), len(BRICK_GRID[0])
    for r, names in enumerate(BRICK_GRID):
        for c, name in enumerate(names):
            if indiv_dir.exists() and (indiv_dir / f'{name}.png').exists():
                continue
            y0, x0 = r * h // rows_n, c * w // cols_n
            m = fg[y0:(r + 1) * h // rows_n, x0:(c + 1) * w // cols_n]
            ys = np.where(m.sum(axis=1) > m.shape[1] * .25)[0]
            xs = np.where(m.sum(axis=0) > m.shape[0] * .25)[0]
            assert len(ys) and len(xs), f'{name}: 벽돌을 찾지 못했다(bricks.png 배치 확인)'
            by0, by1, bx0, bx1 = ys[0], ys[-1] + 1, xs[0], xs[-1] + 1
            crop, mask = im[y0 + by0:y0 + by1, x0 + bx0:x0 + bx1], m[by0:by1, bx0:bx1]
            ch, cw = mask.shape; out = np.zeros_like(mask)
            q = deque([(y, x) for y in range(ch) for x in (0, cw - 1)] + [(y, x) for x in range(cw) for y in (0, ch - 1)])
            while q:
                y, x = q.popleft()
                if y < 0 or x < 0 or y >= ch or x >= cw or out[y, x] or mask[y, x]:
                    continue
                out[y, x] = True; q.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
            rgba = np.dstack([crop.astype(np.uint8), np.where(out, 0, 255).astype(np.uint8)])
            resized = Image.fromarray(rgba, 'RGBA').resize(SHEET_SIZE['brick'], Image.LANCZOS)
            save(clamp_item_palette(resized, allow_red=(name in RED_ITEMS)), name)


def build_chars():
    for n in ALL_CHARS:
        p = SRC / 'characters' / f'{n}.png'
        if not p.exists():
            continue
        img = Image.open(p).convert('RGBA')
        bb = img.getbbox()
        if bb:
            img = img.crop(bb)
        img.thumbnail((CHAR_MAX, CHAR_MAX), Image.LANCZOS)
        save(img, n)


def build_portraits():
    p_dir = SRC / 'portraits'
    if not p_dir.exists():
        return
    for source in sorted(p_dir.glob('portrait_*.png')):
        img = Image.open(source).convert('RGBA').resize((192, 192), Image.LANCZOS)
        save(img, source.stem)


def build_bg():
    src = SRC / 'chasm.png'
    if not src.exists():
        return
    img = Image.open(src).convert('RGB')
    img = img.resize((180 * RES, 340 * RES), Image.LANCZOS)
    save(img.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.NONE), 'chasm')


def build_items():
    items_dir = SRC / 'items'
    if not items_dir.exists():
        return
    for source in sorted(items_dir.glob('*.png')):
        stem = source.stem
        img = Image.open(source).convert('RGBA')
        bounds = img.getbbox()
        if not bounds:
            raise ValueError(f'빈 에셋: {source}')
        if stem == 'heater':
            # 충전소 히터: 정지 본체에서 밝기·열기 파동 3프레임 시트(campfire.png, 288×96) 생성
            base = fit(img.crop(bounds), (96, 96), pad=4)
            strip = Image.new('RGBA', (96 * 3, 96), (0, 0, 0, 0))
            for f, br in enumerate((0.96, 1.04, 1.10)):
                fr = clamp_item_palette(ImageEnhance.Brightness(base).enhance(br), allow_red=False)
                strip.paste(fr, (f * 96, 0))
            save(strip, 'campfire')
            continue
        # 구슬 레벨 링(orb_lv_*)은 코어 바깥을 감싸야 하므로 여백을 좁게(pad=1), 일반 아이템은 pad=4
        pad = 1 if stem.startswith('orb_lv_') else 4
        fitted = fit(img.crop(bounds), (96, 96), pad=pad)
        save(clamp_item_palette(fitted, allow_red=(stem in RED_ITEMS)), stem)


ICON_SIZES = {'icon-1024': 1024, 'icon-512': 512, 'icon-192': 192, 'apple-touch-icon': 180, 'favicon-32': 32}


def build_icons():
    if not (SRC / 'icon.png').exists():
        return
    img = Image.open(SRC / 'icon.png').convert('RGB')
    assert img.width == img.height, f'icon.png는 정사각형이어야 한다: {img.size}'
    d = ROOT / 'icons'; d.mkdir(exist_ok=True)
    for name, n in ICON_SIZES.items():
        p = d / f'{name}.png'
        img.resize((n, n), Image.LANCZOS).save(p, optimize=True)
        print(f'{p.relative_to(ROOT)}  {n}x{n}  {p.stat().st_size // 1024}KB')


def save(img, name):
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / f'{name}.png'
    img.save(p, optimize=True)
    print(f'{p.relative_to(ROOT)}  {img.width}x{img.height}  {p.stat().st_size // 1024}KB')


if __name__ == '__main__':
    build_bricks()
    build_chars()
    build_portraits()
    build_bg()
    build_items()
    build_icons()
