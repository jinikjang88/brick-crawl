#!/usr/bin/env python3
"""생성한 6×3 동작 시트(assets/illustrated/actions)를 게임용 아틀라스(assets/game/*_actions.png)로 패킹한다.

원본 그림은 칸 경계를 넘나든다(뻗은 팔·철퇴·날개·다음 줄로 내려간 발끝). 칸을 고정 격자로 자르면
그림이 잘리고 이웃 칸 조각이 섞이므로, 알파 연결 요소로 프레임을 찾는다.
  - 칸마다 큰 덩어리 하나가 그 프레임의 몸통. 두 프레임이 붙어 있으면 침식으로 나눈 뒤 다시 키운다.
  - 몸통과 떨어진 작은 조각(포자·파편·불꽃)은 가장 가까운 몸통에 붙인다.
  - 알파 20 이하 번짐은 이웃 소유자를 따른다.

배치: 생성 시 고정 피벗으로 그렸으므로 칸 안 상대 위치를 그대로 살려 몸이 제자리에서 움직이게 한다.
줄마다 마지막 포즈(대기·최종 쓰러짐)의 발밑을 바닥선에 맞춘다(줄 사이 기준선이 원본에서 어긋나 있음).
모든 프레임이 한 칸에 들어가는 공통 배율 하나만 쓴다(누운 포즈가 커지지 않게).
배치 정보는 js/art.js의 ART_SHEET 블록을 다시 써서 넘긴다(런타임은 fetch 없이 상수만 읽는다).

실행: python3 tools/build_action_assets.py  (Pillow, numpy 필요. 시트당 수 초)
"""
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_game_assets import label  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
NAMES = ['knight', 'slime', 'bat', 'golem', 'shroom', 'boss']
CELL = 320           # 아틀라스 칸(px). 칸이 넘침 여백까지 품으므로 대기 포즈는 칸의 60~75%를 차지한다
PAD = 6              # 칸 가장자리 여백: 부드러운 축소 시 이웃 칸이 번져 들지 않게
FOOT_ROOM = PAD      # 바닥선 아래 여백. 바닥보다 내려간 프레임은 바닥에 올려 두므로 가장자리 여백만 둔다
BIG = 3000           # 이보다 큰 덩어리는 프레임 몸통
ART_JS = ROOT / 'js' / 'art.js'


def shift(a, dy, dx, fill):
    out = np.full_like(a, fill)
    h, w = a.shape
    out[max(dy, 0):h + min(dy, 0), max(dx, 0):w + min(dx, 0)] = a[max(-dy, 0):h + min(-dy, 0), max(-dx, 0):w + min(-dx, 0)]
    return out


def grow(lab, allow, steps=None):
    """lab(-1=빈칸)의 소유를 allow 영역 안으로 4방향으로 번지게 한다."""
    n = 0
    while steps is None or n < steps:
        todo = allow & (lab < 0)
        if not todo.any():
            break
        before = int(todo.sum())
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            s = shift(lab, dy, dx, -1)
            take = allow & (lab < 0) & (s >= 0)
            lab[take] = s[take]
        n += 1
        if int((allow & (lab < 0)).sum()) == before:
            break
    return lab


def split(ys, xs, shape, k):
    """붙어 버린 k개 프레임 덩어리를 침식으로 씨앗을 나눈 뒤 다시 키워 나눈다."""
    sub = np.zeros(shape, bool); sub[ys, xs] = True
    er = sub.copy()
    for _ in range(60):
        er = er & shift(er, 1, 0, False) & shift(er, -1, 0, False) & shift(er, 0, 1, False) & shift(er, 0, -1, False)
        seeds = [p for p in label(er) if p[1] > 500]
        if len(seeds) >= k:
            break
    else:
        raise SystemExit('붙은 프레임을 나누지 못함')
    lab = np.full(shape, -1, int)
    for i, p in enumerate(seeds):
        lab[p[2]] = i
    lab = grow(lab, sub)
    return [np.nonzero(lab == i) for i in range(len(seeds))]


def segment(a):
    """픽셀별 프레임 번호(0~17, -1=버림) 지도."""
    h, w = a.shape[:2]; cw, ch = w / 6, h / 3
    comps = label(a[..., 3] > 20)
    bodies = []
    for _, cnt, (ys, xs) in (c for c in comps if c[1] > BIG):
        cells, n = np.unique(np.stack([(ys // ch).astype(int), (xs // cw).astype(int)]), axis=1, return_counts=True)
        major = [tuple(cells[:, i]) for i in range(len(n)) if n[i] > cnt * .25]
        parts = [(ys, xs)] if len(major) == 1 else split(ys, xs, (h, w), len(major))
        for py, px in parts:
            bodies.append(((int(py.mean() // ch), int(px.mean() // cw)), py, px))
    bodies.sort(key=lambda b: b[0])
    cells = [b[0] for b in bodies]
    assert cells == [(r, c) for r in range(3) for c in range(6)], f'프레임 몸통이 칸마다 하나가 아님: {cells}'
    owner = np.full((h, w), -1, int)
    for i, (_, ys, xs) in enumerate(bodies):
        owner[ys, xs] = i
    samples = [(ys[::25], xs[::25]) for _, ys, xs in bodies]
    for _, cnt, (ys, xs) in (c for c in comps if c[1] <= BIG):
        cy, cx = ys.mean(), xs.mean()
        owner[ys, xs] = int(np.argmin([((sy - cy) ** 2 + (sx - cx) ** 2).min() for sy, sx in samples]))
    return grow(owner, a[..., 3] > 0, steps=12)


def build(name):
    a = np.array(Image.open(ROOT / 'assets/illustrated/actions' / (name + '.png')).convert('RGBA'))
    assert a[..., 3].min() == 0, f'{name}: 투명 배경 필요'
    h, w = a.shape[:2]; cw, ch = w / 6, h / 3
    owner = segment(a)
    boxes = []
    for i in range(18):
        r, c = divmod(i, 6)
        ys, xs = np.nonzero(owner == i)
        boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1, c * cw, r * ch))
    # 가로 기준: 첫 줄 마지막(대기) 포즈의 가운데. 세로 기준: 줄마다 마지막 포즈의 발밑
    ax = (boxes[5][0] + boxes[5][2]) / 2 - boxes[5][4]
    foot = [boxes[r * 6 + 5][3] - boxes[r * 6 + 5][5] for r in range(3)]
    # 칸 안 좌표(기준점 원점)로 바꿔 공통 배율을 구한다
    # 바닥보다 내려간 프레임은 바닥에 올린다: 박쥐 사망 줄처럼 떨어지는 포즈가 최종 누운 포즈보다 아래에 그려진 원본이 있어,
    # 그대로 두면 바닥을 뚫고 내려갔다가 다시 올라온다
    rel = []
    for i, (x0, y0, x1, y1, ox, oy) in enumerate(boxes):
        dy = -foot[i // 6] - max(0, y1 - oy - foot[i // 6])
        rel.append((x0 - ox - ax, y0 - oy + dy, x1 - ox - ax, y1 - oy + dy))
    half = max(max(-r[0], r[2]) for r in rel)
    up = max(-r[1] for r in rel)
    scale = min((CELL / 2 - PAD) / half, (CELL - FOOT_ROOM - PAD) / up)
    gx, gy = CELL / 2, CELL - FOOT_ROOM
    atlas = Image.new('RGBA', (CELL * 6, CELL * 3))
    for i, (x0, y0, x1, y1, ox, oy) in enumerate(boxes):
        piece = a[y0:y1, x0:x1].copy()
        piece[owner[y0:y1, x0:x1] != i] = 0
        im = Image.fromarray(piece)
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.Resampling.LANCZOS)
        r, c = divmod(i, 6)
        px = c * CELL + round(gx + rel[i][0] * scale)
        py = r * CELL + round(gy + rel[i][1] * scale)
        atlas.alpha_composite(im, (px, py))
    target = ROOT / 'assets/game' / (name + '_actions.png')
    atlas.save(target, optimize=True)
    idle = rel[5]
    meta = {'iw': round((idle[2] - idle[0]) * scale), 'ih': round((idle[3] - idle[1]) * scale)}
    print(target.relative_to(ROOT), target.stat().st_size, meta)
    return meta


def write_meta(metas):
    """art.js의 ART_SHEET 블록을 새 배치로 바꾼다. 손으로 고치지 않게 이 스크립트가 유일한 출처다."""
    body = ', '.join(f"{n}:{{ iw:{m['iw']}, ih:{m['ih']} }}" for n, m in metas.items())
    block = (f'const ART_SHEET = {{ cell:{CELL}, ax:{CELL // 2}, foot:{CELL - FOOT_ROOM},\n'
             f'  {body} }};')
    src = ART_JS.read_text(encoding='utf8')
    new, n = re.subn(r'const ART_SHEET = \{.*?\};', block, src, count=1, flags=re.S)
    assert n == 1, 'js/art.js에서 ART_SHEET 블록을 찾지 못함'
    ART_JS.write_text(new, encoding='utf8')


if __name__ == '__main__':
    write_meta({n: build(n) for n in NAMES})
