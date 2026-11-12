#!/usr/bin/env python3
"""에셋 전수 검사(작업 09, 2026-11-12): 눈으로 찾았던 결함이 다시 들어오지 않게 숫자로 본다.

1. 목록: js/art.js가 불러오는 그림이 모두 있고, assets/game에 안 쓰는 그림이 없다.
2. 흰 배경 잔여물: 캐릭터 그림 안에 순백 덩어리가 남아 있지 않다(tools/clean_matte.py가 지운 것).
3. 떠 있는 조각: 동작 시트의 연출 없는 프레임(각 줄 마지막 칸)에 몸에서 떨어진 작은 조각이 없다.
4. 이음매: 공격·피격·스킬 줄의 마지막 칸은 같은 대기 포즈다(동작이 끝날 때 튀지 않는다).
5. 연속성: 한 줄 안에서 이웃한 칸의 몸 중심이 갑자기 튀지 않고, 몸 넓이가 급변하지 않는다
   (다른 그림이 끼어들거나 좌우가 뒤집히면 여기서 걸린다).
6. 좌우: 비대칭 표식(가장 붉은 부위의 좌우 위치)이 대기 포즈와 같은 쪽에 있다.
7. 팔레트: 구슬 부품·칩·벽돌 그림은 무채색 + 화(#C1443C) 계열만 쓴다.

실행: python3 tools/check_assets.py  (실패가 있으면 종료 코드 1. Pillow, numpy 필요)
"""
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / 'assets' / 'game'
CELL = 320
fails = []


def ok(name, cond, detail=''):
    print(('통과 ' if cond else '실패 ') + name + (f' — {detail}' if detail and not cond else ''))
    if not cond:
        fails.append(name)


def comps(mask):
    """8방향 연결 요소의 넓이를 큰 순서로 돌려준다."""
    h, w = mask.shape
    seen = np.zeros_like(mask)
    out = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        st = [(y0, x0)]; seen[y0, x0] = True
        n = 0
        while st:
            y, x = st.pop(); n += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True; st.append((ny, nx))
        out.append(n)
    return sorted(out, reverse=True)


def load(name):
    return np.array(Image.open(GAME / f'{name}.png').convert('RGBA'))


# ── 1. 목록 ──────────────────────────────────────────────────────────────────────────────
art = (ROOT / 'js' / 'art.js').read_text(encoding='utf8')
data = (ROOT / 'js' / 'data.js').read_text(encoding='utf8')
block = lambda src, name: re.search(r'const ' + name + r' = \{(.*?)\n\};', src, re.S).group(1)
orbs = re.findall(r'^\s{2}(\w+):\s*\{ part:', block(data, 'ORBS'), re.M)
relics = re.findall(r'^\s{2}(\w+):\s*\{ t:', block(data, 'RELICS'), re.M)
chars = re.findall(r"'(\w+)'", re.search(r'const ART_CHARS = \[(.*?)\]', art, re.S).group(1))
# 아직 그림이 없어 다른 그림으로 대신하는 캐릭터(ART_FALLBACK)는 파일이 없어도 된다
fallback = set(re.findall(r'(\w+):', re.search(r'const ART_FALLBACK = \{(.*?)\}', art, re.S).group(1)))
chars = [c for c in chars if c not in fallback]
acts = re.findall(r"'(\w+)'", re.search(r'const ART_ACTIONS_LIST = \[(.*?)\]', art, re.S).group(1))
ports = sorted(set(re.findall(r"port:'(\w+)'", data)))
want = set(['chasm', 'coin', 'spark', 'rubble', 'merchant', 'campfire', 'ui_bar', 'ui_frame', 'ui_panel', 'scan'])
want |= set(chars) | {a + '_actions' for a in acts} | {'orb_' + k for k in orbs} | {'relic_' + k for k in relics}
want |= {'brick_' + k for k in ('n', 'stone', 'atk', 'def', 'heal', 'poison')} | {'portrait_' + p for p in ports}
have = {p.stem for p in GAME.glob('*.png')}
ok(f'목록: 필요한 그림 {len(want)}장이 모두 있다', not (want - have), '없음: ' + ', '.join(sorted(want - have)))
ok('목록: 안 쓰는 그림이 없다', not (have - want), '남음: ' + ', '.join(sorted(have - want)))

# ── 2. 흰 배경 잔여물 ────────────────────────────────────────────────────────────────────
# 게임용 축소본(최대 256px) 기준. 클라드 가슴 발광처럼 원래 흰 부분은 예외로 적는다
WHITE_OK = {'claude': 600, 'rick': 120, 'omnis': 120}   # OMNIS 눈 한가운데의 빛
bad = []
for n in chars:
    a = load(n)
    white = (a[..., 3] > 20) & (a[..., :3].min(axis=2) >= 250)
    c = comps(white)
    if c and c[0] > WHITE_OK.get(n, 60):
        bad.append(f'{n} {c[0]}px')
ok('흰 배경 잔여물: 캐릭터 안에 큰 순백 덩어리가 없다', not bad, ', '.join(bad))

# ── 3~6. 동작 시트 ──────────────────────────────────────────────────────────────────────
# 원래 떨어져 있는 부품이 있는 캐릭터(클라드의 떠 있는 패널)는 조각 수를 따로 적는다
PARTS = {'claude': 3}
stray, seam, jump, flip = [], [], [], []
for n in acts:
    sheet = load(n + '_actions')
    rows = sheet.shape[0] // CELL
    cell = lambda r, c: sheet[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL]
    rest = [cell(r, 5) for r in range(rows) if r != 2]      # 2행 = 사망(대기로 돌아오지 않는다)
    for r, a in zip([r for r in range(rows) if r != 2], rest):
        c = comps(a[..., 3] > 20)
        small = [x for x in c[PARTS.get(n, 1):] if x > 6]
        if small:
            stray.append(f'{n} r{r}f5 조각 {small[:3]}')
    for r, a in zip([r for r in range(rows) if r != 2][1:], rest[1:]):
        d = int((np.abs(a.astype(int) - rest[0].astype(int)).sum(axis=2) > 60).sum())
        if d > 400:
            seam.append(f'{n} r{r}f5 대기 포즈와 {d}px 다름')

    def body(a):
        m = a[..., 3] > 20
        ys, xs = np.nonzero(m)
        return (xs.mean(), ys.mean(), int(m.sum())) if len(xs) else (0, 0, 0)

    def red_side(a):
        # 가장 붉은 부위(눈·렌즈·경고등)의 가로 위치가 몸 중심의 어느 쪽인지. 붉은 부위가 적으면 판단하지 않는다
        r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
        m = (a[..., 3] > 20) & (r > 150) & (r > g * 1.8) & (r > b * 1.8)
        if m.sum() < 40:
            return 0
        cx = body(a)[0]
        off = np.nonzero(m)[1].mean() - cx
        return 0 if abs(off) < 10 else (1 if off > 0 else -1)

    idle_side = red_side(rest[0])
    for r in range(rows):
        prev = None
        for c in range(6):
            a = cell(r, c)
            cur = body(a)
            if prev and cur[2] and prev[2]:
                dist = ((cur[0] - prev[0]) ** 2 + (cur[1] - prev[1]) ** 2) ** .5
                grow = cur[2] / prev[2]
                # 사망 줄은 쓰러지며 크게 움직인다. 한 칸에 셀 폭의 1/3 넘게 튀거나 넓이가 2배로 변하면 다른 그림이다
                if dist > CELL / 3 or grow > 2.2 or grow < .45:
                    jump.append(f'{n} r{r}f{c} 이동 {dist:.0f}px 넓이 ×{grow:.2f}')
            prev = cur
            # 타격 연출(붉은 광선·불꽃)이 섞이는 칸은 빼고, 연출 없는 처음과 끝 칸에서만 본다
            if r != 2 and c in (0, 5) and idle_side and red_side(a) == -idle_side:
                flip.append(f'{n} r{r}f{c}')
ok('떠 있는 조각: 대기 프레임에 몸에서 떨어진 조각이 없다', not stray, ' / '.join(stray[:6]))
ok('이음매: 공격·피격·스킬이 같은 대기 포즈로 끝난다', not seam, ' / '.join(seam[:6]))
ok('연속성: 이웃한 프레임 사이에 그림이 튀지 않는다', not jump, ' / '.join(jump[:6]))
ok('좌우: 비대칭 표식이 대기 포즈와 같은 쪽에 있다', not flip, ' / '.join(flip[:6]))

# ── 7. 팔레트 ───────────────────────────────────────────────────────────────────────────
off = []
for n in sorted(have):
    if not n.startswith(('orb_', 'relic_', 'brick_', 'coin', 'rubble', 'spark', 'campfire', 'merchant')):
        continue
    a = load(n)
    px = a[a[..., 3] > 20][:, :3].astype(int)
    mx, mn = px.max(axis=1), px.min(axis=1)
    gray = (mx - mn) <= 40                                   # 무채색(상아의 약한 따뜻함 포함)
    red = (px[:, 0] > px[:, 1] * 1.25) & (px[:, 0] > px[:, 2] * 1.25)
    if (~(gray | red)).sum() > 0:
        off.append(f'{n} {(~(gray | red)).sum()}px')
ok('팔레트: 구슬 부품·칩·벽돌은 무채색과 화(火) 계열만 쓴다', not off, ', '.join(off[:8]))

print(f'\n검사 {"전부 통과" if not fails else str(len(fails)) + "건 실패"}')
sys.exit(1 if fails else 0)
