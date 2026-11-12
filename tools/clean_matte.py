#!/usr/bin/env python3
"""캐릭터 원본에 남은 흰 배경 조각을 투명으로 만든다(작업 09, 2026-11-12).

AI 생성 그림의 배경을 지울 때 몸에 둘러싸인 안쪽(제미디의 고리 안, OMNIS·제미디의 케이블 사이, 가디언의 몸통과
방패 사이, 살포기 배 아래)은 바깥에서 이어지지 않아 순백으로 남아 있었다. 어두운 판 위에서 흰 얼룩으로 보인다.
- 대상 캐릭터와 최소 넓이, 남길 곳(KEEP: 제미디 이마 광택·OMNIS 눈의 빛)을 캐릭터마다 적는다: 클라드의 가슴 발광·방패 광택 같은 진짜 흰 부분을 지우지 않으려고.
- 지운 영역에 맞닿은 밝은 무채색 가장자리(반투명 경계가 흰색과 섞인 테)도 두 겹 걷어 낸다.
- 여러 번 돌려도 결과가 같다. 돌린 뒤 build_game_assets.py → build_cyber_actions.py를 다시 돌린다.

실행: python3 tools/clean_matte.py  (Pillow, numpy 필요)
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(__file__).resolve().parent.parent / 'assets' / 'illustrated' / 'characters'
# 캐릭터 → 지울 순백 덩어리의 최소 넓이(px, 1024 원본 기준)
TARGETS = {'gemini': 300, 'omnis': 300, 'guardian': 1500, 'disperser': 1500}
# 지우면 안 되는 진짜 흰 부분(원본 좌표의 점): 이 점을 품은 덩어리는 남긴다
KEEP = {'gemini': [(481, 139)], 'omnis': [(389, 420)]}


def components(mask):
    h, w = mask.shape
    seen = np.zeros_like(mask)
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        q = deque([(y0, x0)]); seen[y0, x0] = True
        pts = []
        while q:
            y, x = q.popleft(); pts.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        yield pts


def clean(name, min_area):
    p = SRC / f'{name}.png'
    a = np.array(Image.open(p).convert('RGBA'))
    rgb = a[..., :3].astype(int)
    opaque = a[..., 3] > 20
    white = opaque & (rgb.min(axis=2) >= 250)
    kill = np.zeros_like(white)
    n = 0
    for pts in components(white):
        if len(pts) < min_area:
            continue
        ys, xs = zip(*pts)
        # 덩어리의 테두리 상자 안에 지킬 점이 있으면 광택·발광이다
        if any(min(xs) - 12 <= kx <= max(xs) + 12 and min(ys) - 12 <= ky <= max(ys) + 12 for kx, ky in KEEP.get(name, [])):
            continue
        kill[ys, xs] = True; n += 1
    # 가장자리 테: 지운 곳에 맞닿은 밝은 무채색 픽셀
    pale = opaque & (rgb.min(axis=2) >= 205) & (rgb.max(axis=2) - rgb.min(axis=2) <= 22)
    for _ in range(2):
        near = np.zeros_like(kill)
        near[1:] |= kill[:-1]; near[:-1] |= kill[1:]; near[:, 1:] |= kill[:, :-1]; near[:, :-1] |= kill[:, 1:]
        kill |= near & pale
    a[kill] = 0
    Image.fromarray(a, 'RGBA').save(p, optimize=True)
    print(f'{name}: 흰 조각 {n}곳, {int(kill.sum())}px 투명 처리')


# 캐릭터 그림을 잘라 만든 초상(assets/game, 96px)에도 같은 흰 조각이 남아 있었다. 원본이 따로 없어 그 자리에서 고친다.
# 지운 자리는 같은 줄의 배경색(왼쪽 테 안쪽)으로 메운다: 초상 배경은 줄마다 색이 다른 주사선 무늬다
PORTRAITS = ['portrait_gemini', 'portrait_gemini_hostile', 'portrait_omnis', 'portrait_zero']


# 초상에서 남길 광택(96px 좌표): 제미디 이마
PORTRAIT_KEEP = {'portrait_gemini': [(54, 26)]}


def clean_portrait(name, min_area=6):
    p = SRC.parent.parent / 'game' / f'{name}.png'
    a = np.array(Image.open(p).convert('RGBA'))
    rgb = a[..., :3].astype(int)
    white = rgb.min(axis=2) >= 250
    h, w = white.shape
    kill = np.zeros_like(white)
    for pts in components(white):
        ys, xs = zip(*pts)
        # 한가운데의 작은 빛(OMNIS 눈)은 남긴다
        if len(pts) < min_area or (len(pts) < 60 and abs(np.mean(xs) - w / 2) < 14 and abs(np.mean(ys) - h / 2) < 14):
            continue
        if any(min(xs) - 3 <= kx <= max(xs) + 3 and min(ys) - 3 <= ky <= max(ys) + 3 for kx, ky in PORTRAIT_KEEP.get(name, [])):
            continue
        kill[ys, xs] = True
    pale = (rgb.min(axis=2) >= 205) & (rgb.max(axis=2) - rgb.min(axis=2) <= 22)
    near = np.zeros_like(kill)
    near[1:] |= kill[:-1]; near[:-1] |= kill[1:]; near[:, 1:] |= kill[:, :-1]; near[:, :-1] |= kill[:, 1:]
    kill |= near & pale
    for y in range(h):
        a[y, kill[y], :3] = a[y, 5, :3]
    Image.fromarray(a, 'RGBA').save(p, optimize=True)
    print(f'{name}: {int(kill.sum())}px 배경색으로 메움')


if __name__ == '__main__':
    for name, area in TARGETS.items():
        clean(name, area)
    for name in PORTRAITS:
        clean_portrait(name)
