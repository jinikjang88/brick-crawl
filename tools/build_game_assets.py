#!/usr/bin/env python3
"""assets/illustrated 원본을 게임 런타임용 작은 PNG(assets/game)로 변환한다.

원본은 1254px 캐릭터와 2MB급 시트라 그대로 쓰면 배포 크기·모바일 로딩이 무겁다.
게임 캔버스는 논리 180×340을 화면에 맞춘 정수배(휴대폰 기준 4~7배) 백버퍼로 그리므로, 각 에셋은
그 화면에서 실제로 차지하는 크기의 1~2배만 남긴다.

구슬 부품·칩·벽돌·크레딧·앱 아이콘은 tools/draw_item_assets.py가 도트로 그린다(2026-11-12).
AI 일러스트 원본(items/*.png·bricks.png·icon.png)을 넣으면 여기서 같은 이름으로 덮어쓰므로, 이 스크립트를 나중에 돌린다.

실행: python3 tools/build_game_assets.py  (Pillow, numpy 필요)
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'illustrated'
OUT = ROOT / 'assets' / 'game'

# 에셋 기준 배율. 게임의 RES(js/config.js fitCanvas)는 화면마다 2~8로 바뀌고, 그보다 크면 부드럽게 확대된다.
# 올리면 큰 화면에서 선명해지지만 파일이 커진다(배경 하나가 배율 제곱으로 커짐)
RES = 4

# 벽돌 저장 크기(px): 게임 벽돌 22×12의 RES×2배
SHEET_SIZE = {'brick': (22 * RES * 2, 12 * RES * 2)}
CHARS = ['rick', 'sludge', 'drone', 'guardian', 'disperser', 'sentinel', 'gemini', 'omnis']
CHAR_MAX = 256  # 몬스터 최대 표시 60px × RES 보다 약간 크게


def label(mask):
    """scipy 없이 4-연결 요소를 찾는다. 반환: 영역별 (bbox, 픽셀 수)."""
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


def fit(img, size):
    """비율을 지키며 size 안에 맞추고 투명 여백으로 가운데 정렬한다."""
    img = img.copy(); img.thumbnail(size, Image.LANCZOS)
    out = Image.new('RGBA', size, (0, 0, 0, 0))
    out.paste(img, ((size[0] - img.width) // 2, (size[1] - img.height) // 2))
    return out


BRICK_GRID = [['brick_n', 'brick_stone', 'brick_atk'], ['brick_def', 'brick_heal', 'brick_poison']]


def build_bricks():
    """bricks.png(3×2 격자, 평평한 회색 배경)에서 벽돌 6장을 잘라 투명 배경으로 만든다.

    collection.png 벽돌은 일반·특수 벽돌 질감이 비슷해 판에서 구분이 약했다. 배경색은 위·아래 가장자리
    중앙값으로 잡고, 칸마다 전경이 충분한 행·열 범위로 벽돌 경계를 찾는다(흩어진 잡음 픽셀 무시).
    """
    # AI 원본이 없으면 tools/draw_item_assets.py가 그린 도트 벽돌을 그대로 둔다
    if not (SRC / 'bricks.png').exists():
        return
    im = np.asarray(Image.open(SRC / 'bricks.png').convert('RGB')).astype(int)
    h, w, _ = im.shape
    bg = np.median(np.concatenate([im[:8].reshape(-1, 3), im[-8:].reshape(-1, 3)]), axis=0)
    fg = np.abs(im - bg).sum(axis=2) > 30
    rows_n, cols_n = len(BRICK_GRID), len(BRICK_GRID[0])
    for r, names in enumerate(BRICK_GRID):
        for c, name in enumerate(names):
            y0, x0 = r * h // rows_n, c * w // cols_n
            m = fg[y0:(r + 1) * h // rows_n, x0:(c + 1) * w // cols_n]
            ys = np.where(m.sum(axis=1) > m.shape[1] * .25)[0]
            xs = np.where(m.sum(axis=0) > m.shape[0] * .25)[0]
            assert len(ys) and len(xs), f'{name}: 벽돌을 찾지 못했다(bricks.png 배치 확인)'
            by0, by1, bx0, bx1 = ys[0], ys[-1] + 1, xs[0], xs[-1] + 1
            crop, mask = im[y0 + by0:y0 + by1, x0 + bx0:x0 + bx1], m[by0:by1, bx0:bx1]
            # 바깥 테두리에서 이어진 배경만 투명으로(벽돌 안쪽의 회색 무늬는 지킨다)
            ch, cw = mask.shape; out = np.zeros_like(mask)
            q = deque([(y, x) for y in range(ch) for x in (0, cw - 1)] + [(y, x) for x in range(cw) for y in (0, ch - 1)])
            while q:
                y, x = q.popleft()
                if y < 0 or x < 0 or y >= ch or x >= cw or out[y, x] or mask[y, x]:
                    continue
                out[y, x] = True; q.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
            rgba = np.dstack([crop.astype(np.uint8), np.where(out, 0, 255).astype(np.uint8)])
            # 원본(약 2:1)을 게임 벽돌(22:12) 비율로 맞춘다
            save(Image.fromarray(rgba, 'RGBA').resize(SHEET_SIZE['brick'], Image.LANCZOS), name)


def build_chars():
    for n in CHARS:
        img = Image.open(SRC / 'characters' / f'{n}.png').convert('RGBA')
        img = img.crop(img.getbbox())
        img.thumbnail((CHAR_MAX, CHAR_MAX), Image.LANCZOS)
        save(img, n)


def build_bg():
    # 2026-11-04: 게임 배경은 chasm.png(tools/draw_cyber_assets.py)로 바뀌었다. AI 일러스트 원본
    # assets/illustrated/chasm.png(docs/ASSET_PROMPTS.md 6.1)가 생기면 그것을 줄여 chasm으로 쓴다. 옛 dungeon.png는 기록용 원본이다
    src = SRC / 'chasm.png'
    if not src.exists():
        return
    img = Image.open(src).convert('RGB')
    img = img.resize((180 * RES, 340 * RES), Image.LANCZOS)
    # 불투명 배경은 팔레트로 줄여도 티가 안 나고 크기가 크게 준다
    save(img.quantize(colors=128, method=Image.MEDIANCUT, dither=Image.NONE), 'chasm')


def build_items():
    # 새 수집품도 원본에서 재생성해서 수작업 축소본과 런타임 그림이 어긋나지 않게 한다.
    for source in sorted((SRC / 'items').glob('*.png')):
        img = Image.open(source).convert('RGBA')
        bounds = img.getbbox()
        if not bounds:
            raise ValueError(f'빈 에셋: {source}')
        save(fit(img.crop(bounds), (96, 96)), source.stem)


# 앱 아이콘: icon.png(1024, 정사각형 꽉 찬 그림) → icons/. 스토어·브라우저가 각자 모서리를 둥글게 자르므로 원본에 둥근 모서리·투명을 넣지 않는다.
# iOS 앱 스토어 아이콘은 투명 채널을 거부하므로 전부 RGB로 저장한다. 피사체(구슬)가 가운데 80% 안에 있어 안드로이드 적응형 마스크에도 남는다
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
    build_bg()
    build_items()
    build_icons()
