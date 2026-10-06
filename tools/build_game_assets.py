#!/usr/bin/env python3
"""assets/illustrated 원본을 게임 런타임용 작은 PNG(assets/game)로 변환한다.

원본은 1254px 캐릭터와 2MB급 시트라 그대로 쓰면 배포 크기·모바일 로딩이 무겁다.
게임 캔버스는 논리 180×340을 4배(720×1360) 백버퍼로 그리므로, 각 에셋은
그 화면에서 실제로 차지하는 크기의 1~2배만 남긴다.

collection.png는 균등 격자가 아니라서 알파 영역(연결 요소)으로 조각을 찾는다.
원본 배치가 바뀌면 SHEET_ORDER를 다시 확인해야 한다.

실행: python3 tools/build_game_assets.py  (Pillow, numpy 필요)
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'illustrated'
OUT = ROOT / 'assets' / 'game'

# 캔버스 백버퍼 배율(js/config.js의 RES와 같아야 한다)
RES = 4

# 원본 시트의 줄별 조각 순서(왼쪽→오른쪽). None은 쓰지 않는 조각
SHEET_ORDER = [
    ['orb_basic', 'orb_bomb', 'orb_drill', 'orb_guard', 'orb_split', 'orb_venom', 'orb_heavy'],
    ['brick_n', 'brick_stone', 'brick_atk', 'brick_def', 'brick_heal', 'brick_poison'],
    ['ui_panel', 'ui_frame', 'coin', 'spark', 'rubble', 'ui_bar'],
]
# 조각별 저장 크기(px). 구슬은 발사대 9px·HUD 48px 표시를 모두 감당하도록 넉넉히
SHEET_SIZE = {'orb': (96, 96), 'brick': (22 * RES * 2, 12 * RES * 2), 'coin': (48, 48), 'spark': (64, 64), 'rubble': (64, 64)}
CHARS = ['knight', 'slime', 'bat', 'golem', 'shroom', 'boss']
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


def build_sheet():
    sheet = Image.open(SRC / 'collection.png').convert('RGBA')
    a = np.array(sheet)
    # 조각 경계가 몇 px 차이로 붙어 있어 원본 해상도로 연결 요소를 찾는다(수 초 걸림)
    k = 1
    small = a[::k, ::k, 3] > 20
    comps = [c for c in label(small) if c[1] > 500]
    # 폭탄 심지 불꽃처럼 본체와 떨어진 작은 조각은 가장 가까운 큰 조각에 붙인다
    big = [c for c in comps if c[1] > 5000]
    tiny = [c for c in comps if c[1] <= 5000]
    boxes = [list(c[0]) for c in big]
    # 조각끼리 bbox가 겹치면(송곳 끝과 방패 구슬) 이웃 조각 픽셀이 섞이므로, 큰 조각 소유 지도를 만들어 지운다
    owner = np.full(small.shape, -1)
    for i, c in enumerate(big):
        owner[c[2]] = i
    for (bx, _, _) in tiny:
        cx, cy = (bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2
        j = min(range(len(boxes)), key=lambda i: abs((boxes[i][0] + boxes[i][2]) / 2 - cx) + abs((boxes[i][1] + boxes[i][3]) / 2 - cy))
        b = boxes[j]; boxes[j] = [min(b[0], bx[0]), min(b[1], bx[1]), max(b[2], bx[2]), max(b[3], bx[3])]
    # 줄 → 왼쪽 순으로 정렬
    boxes.sort(key=lambda b: b[1])
    for i, b in enumerate(boxes):
        b.append(i)
    rows = []
    for b in boxes:
        if rows and abs(rows[-1][0][1] - b[1]) < 120:
            rows[-1].append(b)
        else:
            rows.append([b])
    assert [len(r) for r in rows] == [len(r) for r in SHEET_ORDER], f'시트 조각 배치가 예상과 다르다: {[len(r) for r in rows]}'
    for names, row in zip(SHEET_ORDER, rows):
        row.sort(key=lambda b: b[0])
        for name, b in zip(names, row):
            if not name:
                continue
            x0, y0, x1, y1 = (max(0, b[0] * k - k), max(0, b[1] * k - k), b[2] * k + k, b[3] * k + k)
            crop = sheet.crop((x0, y0, x1, y1))
            # 다른 큰 조각의 픽셀은 투명 처리한다
            own = owner[y0:y1, x0:x1]
            ca = np.array(crop); h_, w_ = own.shape
            other = (own >= 0) & (own != b[4])
            ca[:h_, :w_, 3][other] = 0
            crop = Image.fromarray(ca)
            bb = crop.getbbox(); crop = crop.crop(bb)
            if name.startswith('ui_'):
                # DOM 장식(border-image)용: 비율을 지켜 절반 크기로. 테두리 조각 폭을 CSS에서 원본 비율로 자른다
                save(crop.resize((crop.width // 2, crop.height // 2), Image.LANCZOS), name)
                continue
            size = SHEET_SIZE[name.split('_')[0]]
            if name.startswith('brick'):
                # 원본 벽돌(약 3:2)을 게임 벽돌(22:12) 비율로 늘린다. 돌 질감이라 늘려도 어색하지 않다
                img = crop.resize(size, Image.LANCZOS)
            else:
                img = fit(crop, size)
            save(img, name)


def build_chars():
    for n in CHARS:
        img = Image.open(SRC / 'characters' / f'{n}.png').convert('RGBA')
        img = img.crop(img.getbbox())
        img.thumbnail((CHAR_MAX, CHAR_MAX), Image.LANCZOS)
        save(img, n)


def build_bg():
    img = Image.open(SRC / 'dungeon.png').convert('RGB')
    img = img.resize((180 * RES, 340 * RES), Image.LANCZOS)
    # 불투명 배경은 팔레트로 줄여도 티가 안 나고 크기가 크게 준다
    save(img.quantize(colors=128, method=Image.MEDIANCUT, dither=Image.NONE), 'dungeon')


def save(img, name):
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / f'{name}.png'
    img.save(p, optimize=True)
    print(f'{p.relative_to(ROOT)}  {img.width}x{img.height}  {p.stat().st_size // 1024}KB')


if __name__ == '__main__':
    build_sheet()
    build_chars()
    build_bg()
