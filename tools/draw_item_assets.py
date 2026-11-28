#!/usr/bin/env python3
"""구슬 부품(코어·회로)·칩·벽돌·크레딧·파편·충전소 히터·단말기를 모노크롬 서브컬처 셀화(Cel-Shading) 벡터 일러스트로 생성한다.

- 화풍: 원신 / 젠레스 존 제로(W-Engine·디스크) 스타일의 날카로운 먹선 외곽선 + 다단계 투톤·쓰리톤 셀 명암 + 사선 광택(4배 슈퍼샘플링 384×384 → 96×96 LANCZOS).
- 팔레트(AGENTS.md): 카본 블랙·건메탈·티타늄 실버·상아/순백 발광 + 위험 전용 화(#C1443C) 단일 강조색.
- 실루엣 구분: 코어 = 입체 구(球), 회로 = 우상단 챔퍼 + 하단 단자 카트리지, 칩 = 4면 16핀 IC 패키지, 공명 = 이중 림 원형 메달리온.
"""
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'game'
ICONS = ROOT / 'icons'

LINE = (11, 13, 16)
IV = [(124, 120, 112), (170, 166, 156), (208, 204, 194), (234, 231, 222), (248, 247, 243)]
TI = [(52, 59, 66), (78, 88, 96), (112, 122, 130), (156, 166, 174), (206, 214, 220)]
GM = [(18, 21, 25), (30, 35, 41), (46, 53, 60), (68, 76, 84), (98, 108, 116)]
GLOW = (246, 249, 250)
RED, RED_HI, RED_D = (193, 68, 60), (232, 112, 102), (128, 42, 38)
INK = {'#': IV[3], '+': TI[3], 'r': RED, 'd': RED_D, 'k': GM[0], 'g': GLOW}

RED_ALLOWED = {
    'orb_bomb', 'orb_venom', 'orb_thorn', 'orb_disarm', 'orb_toxin',
    'relic_sting', 'relic_wrath', 'relic_plague', 'relic_pact',
    'brick_poison',
}


def G(text):
    rows = text.strip().split('\n')
    assert len(rows) == 11 and all(len(r) == 11 for r in rows), f'문양은 11×11이어야 한다:\n{text}'
    return rows


def clamp_cel_palette(im, allow_red=False):
    """LANCZOS 축소 후 경계 반투명 찌꺼기를 제거하고 check_assets.py 팔레트 규칙(무채색 mx-mn<=36 또는 화색)을 엄격히 맞춘다."""
    arr = np.array(im.convert('RGBA'))
    arr[arr[..., 3] <= 24] = 0
    vis = arr[..., 3] > 24
    rgb = arr[..., :3].astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    chroma = mx - mn
    is_red = allow_red & (r > g * 1.28) & (r > b * 1.28) & (r > 65)
    bad = vis & (~is_red) & (chroma > 32)
    if np.any(bad):
        lum = 0.299 * r[bad] + 0.587 * g[bad] + 0.114 * b[bad]
        k = 24.0 / np.maximum(chroma[bad], 1.0)
        for ch in range(3):
            rgb[bad, ch] = np.clip(lum + (rgb[bad, ch] - lum) * k, 0, 255)
    if not allow_red:
        leak = vis & (rgb[..., 0] > rgb[..., 1] * 1.18) & (rgb[..., 0] > rgb[..., 2] * 1.18)
        if np.any(leak):
            lum = 0.299 * rgb[leak, 0] + 0.587 * rgb[leak, 1] + 0.114 * rgb[leak, 2]
            rgb[leak, 0] = lum; rgb[leak, 1] = lum; rgb[leak, 2] = lum
    arr[..., :3] = np.round(rgb).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA')


def save_cel(im_hi, name, target_size=(96, 96), out=OUT):
    out.mkdir(parents=True, exist_ok=True)
    lo = im_hi.resize(target_size, Image.LANCZOS)
    lo = clamp_cel_palette(lo, allow_red=(name in RED_ALLOWED))
    p = out / f'{name}.png'
    lo.save(p, optimize=True)
    return p


def _epx2x_mask(m):
    p = np.pad(m, 1, mode='constant', constant_values=False)
    P = p[1:-1, 1:-1]
    A, B, C, D = p[:-2, 1:-1], p[1:-1, 2:], p[1:-1, :-2], p[2:, 1:-1]
    h, w = m.shape
    out = np.empty((h * 2, w * 2), dtype=bool)
    out[0::2, 0::2] = P | (C & A & (~D) & (~B))
    out[0::2, 1::2] = P | (A & B & (~C) & (~D))
    out[1::2, 0::2] = P | (C & D & (~A) & (~B))
    out[1::2, 1::2] = P | (B & D & (~A) & (~C))
    return out


def render_vector_emblem(rows, size=176, remap=None, dark_outline=True):
    """11×11 심볼 그리드를 EPX 대각 복원 + 부호화 거리장(SDF) 윤곽 보간으로 매끄러운 셀화 벡터 문양으로 변환한다."""
    cmap = remap or INK
    H0, W0 = len(rows) + 4, len(rows[0]) + 4
    syms = []
    for r in rows:
        for ch in r:
            if ch != '.' and ch not in syms:
                syms.append(ch)

    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    union_mask = np.zeros((H0, W0), dtype=bool)
    sym_masks = {}
    for s in syms:
        m = np.zeros((H0, W0), dtype=bool)
        for j, r in enumerate(rows):
            for i, ch in enumerate(r):
                if ch == s:
                    m[j + 2, i + 2] = True
        sym_masks[s] = m
        union_mask |= m

    if not union_mask.any():
        return layer

    def smooth_mask(m, blur_r=3.0, thresh=116.0):
        m8 = _epx2x_mask(_epx2x_mask(_epx2x_mask(m)))
        im_m = Image.fromarray((m8.astype(np.uint8) * 255), 'L').resize((size, size), Image.BICUBIC)
        im_b = np.array(im_m.filter(ImageFilter.GaussianBlur(radius=blur_r)), dtype=np.float32)
        return np.clip((im_b - thresh) * (255.0 / 26.0), 0.0, 255.0)

    u_alpha = smooth_mask(union_mask, blur_r=3.2, thresh=112.0)
    arr = np.zeros((size, size, 4), dtype=np.uint8)

    if dark_outline:
        u_im = Image.fromarray(u_alpha.astype(np.uint8), 'L').filter(ImageFilter.MaxFilter(size=9)).filter(ImageFilter.GaussianBlur(radius=1.4))
        out_a = np.clip((np.array(u_im, dtype=np.float32) - 60.0) * 2.2, 0, 255).astype(np.uint8)
        arr[..., 0] = LINE[0]; arr[..., 1] = LINE[1]; arr[..., 2] = LINE[2]
        arr[..., 3] = out_a

    out_im = Image.fromarray(arr, 'RGBA')
    for s in syms:
        col = cmap[s]
        sa = smooth_mask(sym_masks[s], blur_r=2.8, thresh=118.0)
        s_arr = np.zeros((size, size, 4), dtype=np.uint8)
        hi_col = tuple(min(252, int(c * 1.16 + 18)) for c in col)
        sh_col = tuple(max(12, int(c * 0.78)) for c in col)
        s_arr[..., 0], s_arr[..., 1], s_arr[..., 2] = col[0], col[1], col[2]
        sa_shift_dn = np.pad(sa, ((4, 0), (4, 0)), mode='constant')[:-4, :-4]
        sa_shift_up = np.pad(sa, ((0, 4), (0, 4)), mode='constant')[4:, 4:]
        hi_zone = (sa > 140) & (sa_shift_dn < 110)
        sh_zone = (sa > 140) & (sa_shift_up < 110)
        s_arr[sh_zone, :3] = sh_col
        s_arr[hi_zone, :3] = hi_col
        s_arr[..., 3] = sa.astype(np.uint8)
        out_im.alpha_composite(Image.fromarray(s_arr, 'RGBA'))
    return out_im


def make_cel_sphere(S, cx, cy, r, ramp, outline_w=10):
    """384×384 해상도에서 또렷한 4단계 애니메이션 셀화 구면 명암 + 사선 반사광 + 하이라이트 점을 그린다."""
    yy, xx = np.meshgrid(np.arange(S, dtype=np.float32), np.arange(S, dtype=np.float32), indexing='ij')
    dx, dy = xx - cx, yy - cy
    dist = np.hypot(dx, dy)

    r_out = r + outline_w
    a_out = np.clip((r_out - dist) * 1.5, 0.0, 1.0)
    a_in = np.clip((r - dist) * 1.5, 0.0, 1.0)

    nx = dx / max(1.0, r)
    ny = dy / max(1.0, r)
    nz = np.sqrt(np.maximum(0.0, 1.0 - nx * nx - ny * ny))
    lit = nx * (-0.52) + ny * (-0.58) + nz * 0.62

    rgb = np.zeros((S, S, 3), dtype=np.float32)
    c0, c1, c2, c3, c4 = [np.array(c, dtype=np.float32) for c in ramp]
    rgb[:] = c0
    for thr, col_next in ((0.06, c1), (0.32, c2), (0.60, c3), (0.83, c4)):
        t = np.clip((lit - thr) / 0.035, 0.0, 1.0)
        rgb = rgb * (1.0 - t[..., None]) + col_next * t[..., None]

    rim_ang = nx * 0.62 + ny * 0.68
    rim = (dist > r * 0.80) & (dist <= r) & (rim_ang > 0.45)
    rgb[rim] = c3 * 0.7 + c2 * 0.3

    ink_arr = np.array(LINE, dtype=np.float32)
    final_rgb = ink_arr * (1.0 - a_in[..., None]) + rgb * a_in[..., None]
    final_a = (a_out * 255.0).astype(np.uint8)
    out = np.dstack([np.clip(final_rgb, 0, 255).astype(np.uint8), final_a])
    res = Image.fromarray(out, 'RGBA')

    d = ImageDraw.Draw(res)
    hx, hy = cx - r * 0.36, cy - r * 0.38
    d.ellipse([hx - r * 0.16, hy - r * 0.11, hx + r * 0.16, hy + r * 0.11], fill=(*GLOW, 245))
    return res


def core_basic():
    S = 384
    im = make_cel_sphere(S, 192, 192, 128, IV, outline_w=11)
    d = ImageDraw.Draw(im)
    d.arc([62, 152, 322, 242], start=8, end=172, fill=(*LINE, 255), width=10)
    d.arc([64, 154, 320, 240], start=10, end=170, fill=(*TI[2], 255), width=5)
    bolt = [(204, 108), (168, 166), (196, 166), (176, 224), (222, 156), (194, 156)]
    d.polygon(bolt, fill=(*GLOW, 255), outline=(*LINE, 255), width=7)
    return im


def core_drill():
    S = 384
    im = make_cel_sphere(S, 168, 214, 114, TI, outline_w=10)
    d = ImageDraw.Draw(im)
    for off in (-38, 8, 54):
        d.arc([58, 110 + off // 2, 278, 300 + off // 2], start=195, end=345, fill=(*LINE, 255), width=9)
        d.arc([60, 112 + off // 2, 276, 298 + off // 2], start=198, end=342, fill=(*IV[3], 255), width=4)
    cone = [(214, 118), (344, 40), (268, 172)]
    d.polygon(cone, fill=(*IV[3], 255), outline=(*LINE, 255), width=10)
    d.polygon([(214, 118), (344, 40), (242, 145)], fill=(*GLOW, 255))
    for k in (0.28, 0.55, 0.78):
        x0 = 214 + (344 - 214) * k; y0 = 118 + (40 - 118) * k
        x1 = 268 + (344 - 268) * k; y1 = 172 + (40 - 172) * k
        d.line([(x0, y0), (x1, y1)], fill=(*LINE, 255), width=7)
    return im


def core_bomb():
    S = 384
    im = make_cel_sphere(S, 192, 204, 126, GM, outline_w=11)
    d = ImageDraw.Draw(im)
    for x in range(74, 300, 44):
        d.rounded_rectangle([x, 182, x + 32, 232], radius=6, fill=(*TI[2], 255), outline=(*LINE, 255), width=7)
        d.rectangle([x + 6, 188, x + 26, 198], fill=(*TI[4], 255))
    d.rounded_rectangle([168, 52, 216, 88], radius=10, fill=(*RED, 255), outline=(*LINE, 255), width=9)
    d.ellipse([178, 58, 196, 72], fill=(*RED_HI, 255))
    return im


def core_magnet():
    S = 384
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.arc([34, 62, 350, 354], start=0, end=180, fill=(*LINE, 255), width=56)
    d.arc([42, 70, 342, 346], start=0, end=180, fill=(*GM[3], 255), width=38)
    d.arc([48, 76, 336, 340], start=12, end=168, fill=(*TI[2], 255), width=12)
    for x0 in (30, 304):
        d.rounded_rectangle([x0, 146, x0 + 50, 208], radius=8, fill=(*GLOW, 255), outline=(*LINE, 255), width=9)
        d.rectangle([x0 + 8, 184, x0 + 42, 200], fill=(*TI[3], 255))
    im.alpha_composite(make_cel_sphere(S, 192, 162, 98, IV, outline_w=10))
    return im


def core_heavy():
    S = 384
    im = make_cel_sphere(S, 192, 192, 148, GM, outline_w=12)
    d = ImageDraw.Draw(im)
    d.line([(46, 192), (338, 192)], fill=(*LINE, 255), width=9)
    d.line([(192, 46), (192, 338)], fill=(*LINE, 255), width=9)
    d.arc([68, 92, 316, 292], start=0, end=360, fill=(*LINE, 255), width=7)
    for rx, ry in ((116, 112), (268, 112), (96, 192), (288, 192), (116, 272), (268, 272), (156, 152), (228, 232)):
        d.ellipse([rx - 12, ry - 12, rx + 12, ry + 12], fill=(*TI[3], 255), outline=(*LINE, 255), width=5)
        d.ellipse([rx - 5, ry - 6, rx + 2, ry + 1], fill=(*GLOW, 255))
    return im


def core_split():
    S = 384
    im = make_cel_sphere(S, 192, 192, 128, TI, outline_w=11)
    d = ImageDraw.Draw(im)
    d.ellipse([92, 92, 292, 292], fill=(*IV[3], 255), outline=(*LINE, 255), width=9)
    d.pieslice([96, 96, 288, 288], start=210, end=330, fill=(*GLOW, 255))
    d.pieslice([96, 96, 288, 288], start=330, end=90, fill=(*IV[2], 255))
    for ang in (90, 210, 330):
        rad = math.radians(ang)
        d.line([(192, 192), (192 + math.cos(rad) * 126, 192 + math.sin(rad) * 126)], fill=(*LINE, 255), width=12)
    d.ellipse([174, 174, 210, 210], fill=(*GLOW, 255), outline=(*LINE, 255), width=7)
    return im


def core_comet():
    S = 384
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    tail = [(152, 170), (352, 28), (288, 152), (356, 98), (226, 238)]
    d.polygon(tail, fill=(*IV[4], 255), outline=(*LINE, 255), width=10)
    d.polygon([(168, 176), (336, 44), (254, 162)], fill=(*GLOW, 255))
    im.alpha_composite(make_cel_sphere(S, 156, 224, 104, IV, outline_w=10))
    d = ImageDraw.Draw(im)
    for deg in range(0, 360, 60):
        d.arc([24, 92, 288, 356], start=deg, end=deg + 36, fill=(*LINE, 255), width=13)
        d.arc([24, 92, 288, 356], start=deg + 2, end=deg + 34, fill=(*GLOW, 255), width=6)
    return im


CORES = {'basic': core_basic, 'drill': core_drill, 'bomb': core_bomb, 'magnet': core_magnet,
         'heavy': core_heavy, 'split': core_split, 'comet': core_comet}

# ── 회로 16종: 꽂는 카트리지. 문양이 효과를 말한다 ────────────────────────────────────────
CIRC = {
'venom': G('''
.....r.....
....rr.....
....rrr....
...rrrrr...
..rrrrrrr..
..rdrrrrr..
..rdrrrrr..
...rrrrr...
....rrr....
+++.+++.+++
.+++.+.+++.'''),
'guard': G('''
...#####...
..#.....#..
.#.......#.
#....#....#
#...###...#
#....#....#
#.........#
.#.......#.
..#.....#..
...#...#...
....###....'''),
'herb': G('''
...........
....###....
....###....
....###....
.#########.
.#########.
.#########.
....###....
....###....
....###....
...........'''),
'thorn': G('''
r....r....r
.#...#...#.
..#..#..#..
...........
...........
r##..+..##r
...........
...........
..#..#..#..
.#...#...#.
r....r....r'''),
'hammer': G('''
...#####...
...#####...
....###....
....###....
.#########.
.#########.
...........
+++++.+++++
++++.++++++
+++.+++++++
+++++++++++'''),
'vamp': G('''
#.........#
#.........#
#....#....#
.#..###..#.
.#..###..#.
..#..#..#..
..#.....#..
...#####...
....+++....
....+++....
...+++++...'''),
'wreck': G('''
#..........
.#.........
..#........
...#.......
..###......
.#####.+++.
.#####.+++.
.#####.....
..###.++.++
......++.++
...........'''),
'chain': G('''
........###
.......#..#
.....###..#
....#..###.
..###..#...
.#..###....
.#..#......
.####......
...........
+.+.+.+.+.+
...........'''),
'rust': G('''
#########..
#########..
########...
#######.#..
######.....
#####..#...
####.......
.....#..#..
..#........
.......#...
....#......'''),
'weaken': G('''
#.........#
##.......##
.##.....##.
..##...##..
...##.##...
....###....
.....#.....
...........
..+++++++..
...........
....+++....'''),
'disarm': G('''
.........r.
....#...r..
....#..r...
....#.r....
....#r.....
....r......
...r#......
..r.#......
.r.###.....
r...#......
....#......'''),
'toxin': G('''
...#####...
..#..r..#..
.#.r.r.r.#.
#...rrr...#
#..rrrrr..#
#rrrrdrrrr#
#..rrrrr..#
#...rrr...#
.#.r.r.r.#.
..#..r..#..
...#####...'''),
'mirror': G('''
#..........
##.........
.##........
..##..#....
...##.##...
....#######
...##.##...
..##..#....
.##........
##.........
#..........'''),
'stun': G('''
#....#....#
.#...#...#.
..#..#..#..
...#.#.#...
...........
..#.###.#..
...#####...
.#########.
...#####...
..#.###.#..
...........'''),
'prism': G('''
.....#.....
....###....
....#.#...#
...##.##.#.
...#...#...
+++#...####
..##...##..
..#.....#.#
.##.....##.
.#########.
...........'''),
}
# 공명 문양 6종(res_<id>.png): 아카이브 "공명" 줄과 차고·발견 표시에 쓰는 둥근 배지
RES = {
'relay': G('''
....###....
...#...#...
..#..#..#..
.#..###..#.
#..#####..#
#....#....#
.#...#...#.
..#..#..#..
...#...#...
....###....
...........'''),
'gate': G('''
###########
#...#.#...#
#...#.#...#
#..##.##..#
#...#.#...#
#...#.#...#
###########
...........
.++.+++.++.
...........
...........'''),
'fan': G('''
....###....
...#####...
....###....
.....#.....
.##.###.##.
###..#..###
.##.....##.
..###.###..
...........
.+.+.+.+.+.
...........'''),
'rootkey': G('''
...#####...
..#.....#..
..#..#..#..
..#.....#..
...#####...
.....#.....
.....####..
.....#.....
.....###...
.....#.....
...........'''),
'halt': G('''
...#####...
..#..g..#..
.#..gg...#.
#..gg.#...#
#.gggg....#
#...gg....#
#..gg.....#
.#.g.....#.
..#.....#..
...#####...
...........'''),
'lastarc': G('''
.....g.....
....ggg....
...ggggg...
.....g.....
....ggg....
...g.g.g...
..g..g..g..
.#...#...#.
#....#....#
#....#....#
...........'''),
}

# ── 칩 40종: IC 실루엣 + 문양 ─────────────────────────────────────────────────────────────
RELIC = {
'whetstone': G('''
...#####...
..#.....#..
.#......##.
#......#..#
#.....#...#
#....#....#
#....#....#
.#.......#.
..#.....#..
...........
.+.+.+.+.+.'''),
'buckler': G('''
...#####...
..#.....#..
.#..+....#.
#..+......#
#.+.......#
#.........#
#.......+.#
.#.....+.#.
..#.....#..
...#####...
...........'''),
'wallet': G('''
...........
.#########.
.#.......#.
.#########.
.#.......#.
.#...###.#.
.#...#+#.#.
.#...###.#.
.#.......#.
.#########.
...........'''),
'bandage': G('''
...####....
..#....#...
.#..##..#..
.#.#..#.#..
.#.#..#.#..
.#..##..###
..#....#+++
...#######+
........+++
...........
...........'''),
'luckycoin': G('''
...#####...
..#.....#..
.#.......#.
#..#...#..#
#.........#
#....#....#
#.........#
#..#...#..#
.#.......#.
..#.....#..
...#####...'''),
'callus': G('''
..#.#.#.#..
..#.#.#.#..
..#.#.#.#..
..#######.#
..#######.#
..########.
..########.
..#######..
...#####...
...+++++...
...+++++...'''),
'mason': G('''
#....#....#
.#...#...#.
..#.....#..
....###....
....###....
.....#.....
.....#.....
...+++++...
..+++++++..
..+++.+++..
..+++++++..'''),
'lantern': G('''
....###....
....#.#....
...#####...
..#.....#..
..#..#..#..
..#.###.#..
..#..#..#..
..#.....#..
...#####...
..+++++++..
...........'''),
'medkit': G('''
...........
...#####...
.###...###.
.#.......#.
.#...#...#.
.#..###..#.
.#...#...#.
.#.......#.
.#########.
...........
...........'''),
'focus': G('''
.....#.....
...#####...
..#..#..#..
.#...#...#.
.#.......#.
###..#..###
.#.......#.
.#...#...#.
..#..#..#..
...#####...
.....#.....'''),
'combo': G('''
...........
.#########.
.#.......#.
.#......##.
.#...##.##.
.#.#.##.##.
.#.#.##.##.
.#.......#.
.#########.
....+++....
...........'''),
'harvest': G('''
..#######..
.#.......#.
#.........#
#.........#
#...###...#
.#..###..#.
.#...#...#.
..#..#..#..
.....#.....
....+++....
....+++....'''),
'armor': G('''
.##.....##.
.###...###.
.#########.
.#########.
.####+####.
..###+###..
..###+###..
..#######..
..#######..
...#####...
...........'''),
'brace': G('''
....###....
.....#.....
..#######..
.........#.
..#######..
.#.........
..#######..
.........#.
..#######..
.....#.....
....###....'''),
'antidote': G('''
.........##
........##.
......###..
.....#.#...
....#.#.#..
...#.#.#...
..#.#.#....
...#.#.....
..#.#......
.#.........
#..........'''),
'rebound': G('''
..#.....#..
.###...###.
#.#.#.#.#.#
..#.....#..
..#.....#..
...........
.#########.
#.........#
#.+++++++.#
#.........#
.#########.'''),
'sting': G('''
r..........
.r.........
..d........
...#.......
....#......
.....##....
....#####..
.....#####.
......####.
.......###.
........#..'''),
'thorns': G('''
#....#....#
#....#....#
.#...#...#.
..#######..
..#.....#..
..#..#..#..
..#.##..#..
..#..##.#..
..#..#..#..
..#######..
...........'''),
'breath': G('''
#.#.#.#.#.#
#.#.#.#.#.#
#.#.#.#.#.#
#.#.#.#.#.#
#.#.#.#.#.#
#.#.#.#.#.#
###########
###########
.+.......+.
.+.......+.
...........'''),
'scout': G('''
...#####...
..#.....#..
.#....#..#.
#....#....#
#...#.....#
#..#......#
#.........#
.#..+....#.
..#.....#..
...#####...
...........'''),
'counter': G('''
.#########.
.#.......#.
.#..#....#.
.#.#####.#.
.#..#..#.#.
.#.....#.#.
.#.#####.#.
..#.....#..
...#...#...
....###....
...........'''),
'leech': G('''
.#.......#.
.#.......#.
.#.......#.
.#.......#.
.##.....##.
..##...##..
...#####...
....###....
....#+#....
....###....
...........'''),
'endure': G('''
....###....
.#########.
.#.......#.
.#.#####.#.
.#.......#.
.#.#####.#.
.#.......#.
.#.#####.#.
.#.......#.
.#########.
...........'''),
'wrath': G('''
...#####...
..#.....#..
.#.......#.
#.......r.#
#......r..#
#.....r...#
#....#....#
#.........#
.#..ddd..#.
..#.....#..
...#####...'''),
'heart': G('''
...........
.###...###.
#####.#####
###########
###########
.#########.
..#######..
...#####...
....###....
.....#.....
...........'''),
'alchemy': G('''
.+.+.......
+.+.+......
.+.+.......
..###......
..#.#......
..#.####...
..#....#...
..####.#...
.....#.#.##
.....###.##
...........'''),
'twin': G('''
...........
.###...###.
#...#.#...#
#...#.#...#
#...#.#...#
.###...###.
..#.....#..
..#######..
.....#.....
.....#.....
...........'''),
'smith': G('''
.........##
........###
.......###.
......###..
.....##....
....##.....
...#+......
..#+.......
.#+........
#+.........
+..........'''),
'charm': G('''
...#####...
..#.....#..
..#.....#..
..#.....#..
.#########.
.#########.
.####.####.
.####.####.
.#########.
.#########.
...........'''),
'pouch': G('''
...#####...
..#..#..#..
.#.#...#.#.
#.........#
#.#..#..#.#
#....#....#
#.#.....#.#
.#.......#.
..#.#.#.#..
...#####...
...........'''),
'kingsword': G('''
..####.....
.#....#....
.#.##.#....
.#....#....
..####.....
...##......
...##......
...#####...
...##......
...####....
...##......'''),
'hourglass': G('''
.#########.
..#.....#..
..#.....#..
...#...#...
....#.#....
.....#.....
....#.#....
...#.#.#...
..#.###.#..
..#######..
.#########.'''),
'ring': G('''
...........
...........
.###...###.
#...#.#...#
#....#....#
#...#.#...#
.###...###.
...........
.....+.....
....+++....
...........'''),
'crusher': G('''
###########
#.#.#.#.#.#
.#.#.#.#.#.
...........
.....+.....
....+.+....
...........
.#.#.#.#.#.
#.#.#.#.#.#
###########
...........'''),
'plague': G('''
........rr.
.......rdrr
........rr.
......##...
....##.....
...##......
..##...##..
..##..##...
...####....
...........
...........'''),
'giant': G('''
.#.#.#.#...
.#.#.#.#...
.#######.#.
.#######.#.
.#########.
.#########.
..#######..
..+++++++..
..#######..
..#######..
...........'''),
'warp': G('''
...#####...
..#.....#..
.#...#...#.
#....#....#
#....#....#
#....##...#
#......#..#
.#.....#.#.
..#.....#..
...#####...
...........'''),
'greed': G('''
..+..+..+..
.+..+..+...
...........
.#########.
.#.#.#.#.#.
.#########.
.#.......#.
.#.##.##.#.
.#.##.##.#.
.#########.
...........'''),
'pact': G('''
##.........
.##........
..##.......
...##......
....rrr....
....rdr....
....rrr....
......##...
.......##..
........##.
.........##'''),
'collector': G('''
...........
.##.##.##..
.##.##.##..
...........
.#########.
.#.......#.
.#########.
#.#.#.#.#.#
#.#.#.#.#.#
...........
...........'''),
}


def circuit(rows):
    """384×384 셀화 카트리지: 우상단 챔퍼 노치 + 하단 7핀 슬롯 단자 + 오목한 건메탈 스크린 + 매끄러운 벡터 문양."""
    S = 384
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # 하단 단자 하우징 + 은백색 커넥터 핀
    d.rounded_rectangle([88, 274, 296, 352], radius=10, fill=(*GM[2], 255), outline=(*LINE, 255), width=10)
    for x in range(106, 282, 26):
        d.rectangle([x, 292, x + 14, 344], fill=(*TI[4], 255), outline=(*LINE, 255), width=4)

    # 카트리지 본체(우상단 챔퍼 노치)
    hull = [(68, 36), (266, 36), (316, 86), (316, 286), (68, 286)]
    d.polygon(hull, fill=(*TI[2], 255), outline=(*LINE, 255), width=11)
    # 좌상단 셀화 베벨 하이라이트
    d.line([(74, 43), (262, 43)], fill=(*TI[4], 255), width=7)
    d.line([(74, 43), (74, 278)], fill=(*TI[3], 255), width=7)
    # 중앙 오목 다크 스크린 창 + 사선 유리 반사광
    win = [(92, 64), (254, 64), (292, 102), (292, 262), (92, 262)]
    d.polygon(win, fill=(*GM[1], 255), outline=(*LINE, 255), width=8)
    sheen = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sheen).polygon([(114, 68), (158, 68), (112, 258), (96, 258)], fill=(220, 230, 238, 22))
    im.alpha_composite(sheen)

    emb = render_vector_emblem(rows, size=188)
    im.alpha_composite(emb, (192 - 94, 166 - 94))
    return im


def relic(rows):
    """384×384 셀화 16핀 IC 칩 패키지: 4면 티타늄 리드 핀 + 챔퍼 바디 + 매끄러운 벡터 문양."""
    S = 384
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # 4변 각 4개씩의 금속 IC 핀
    for k in (104, 154, 204, 254):
        d.rounded_rectangle([28, k, 78, k + 24], radius=5, fill=(*TI[3], 255), outline=(*LINE, 255), width=7)
        d.rounded_rectangle([306, k, 356, k + 24], radius=5, fill=(*TI[2], 255), outline=(*LINE, 255), width=7)
        d.rounded_rectangle([k, 28, k + 24, 78], radius=5, fill=(*TI[3], 255), outline=(*LINE, 255), width=7)
        d.rounded_rectangle([k, 306, k + 24, 356], radius=5, fill=(*TI[2], 255), outline=(*LINE, 255), width=7)

    # 챔퍼 정사각 IC 바디
    c = 22
    hull = [(68 + c, 68), (316 - c, 68), (316, 68 + c), (316, 316 - c), (316 - c, 316), (68 + c, 316), (68, 316 - c), (68, 68 + c)]
    d.polygon(hull, fill=(*TI[1], 255), outline=(*LINE, 255), width=11)
    d.line([(68 + c, 76), (312 - c, 76)], fill=(*TI[4], 255), width=6)
    d.line([(76, 68 + c), (76, 312 - c)], fill=(*TI[3], 255), width=6)

    # 내부 실리콘 다이 창
    d.rounded_rectangle([94, 94, 290, 290], radius=14, fill=(*GM[1], 255), outline=(*LINE, 255), width=8)
    sheen = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sheen).polygon([(126, 98), (174, 98), (118, 286), (98, 286)], fill=(220, 230, 238, 22))
    im.alpha_composite(sheen)
    # 1번 핀 방향 표식 홈
    ImageDraw.Draw(im).ellipse([104, 104, 120, 120], fill=(*TI[3], 255))

    emb = render_vector_emblem(rows, size=184)
    im.alpha_composite(emb, (192 - 92, 192 - 92))
    return im


def orb_lv_ring(lv):
    """구슬 레벨(2~5) 투명 셀화 오버레이 링: 중앙 65%를 완전히 비워 코어를 감싼다."""
    S = 384
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    box = [26, 26, 358, 358]
    if lv == 2:
        for st in (295, 115):
            d.arc(box, start=st, end=st + 65, fill=(*LINE, 255), width=28)
            d.arc(box, start=st + 3, end=st + 62, fill=(*IV[3], 255), width=14)
        for ang in (328, 148):
            rad = math.radians(ang)
            px, py = 192 + math.cos(rad) * 166, 192 + math.sin(rad) * 166
            d.ellipse([px - 14, py - 14, px + 14, py + 14], fill=(*GLOW, 255), outline=(*LINE, 255), width=6)
    elif lv == 3:
        d.ellipse(box, outline=(*LINE, 255), width=24)
        d.ellipse([32, 32, 352, 352], outline=(*TI[3], 255), width=10)
        for ang in (0, 90, 180, 270):
            rad = math.radians(ang)
            px, py = 192 + math.cos(rad) * 160, 192 + math.sin(rad) * 160
            d.rounded_rectangle([px - 18, py - 18, px + 18, py + 18], radius=6, fill=(*IV[4], 255), outline=(*LINE, 255), width=7)
    elif lv == 4:
        d.ellipse(box, outline=(*LINE, 255), width=28)
        d.ellipse([32, 32, 352, 352], outline=(*IV[3], 255), width=12)
        for ang in (45, 135, 225, 315):
            rad = math.radians(ang)
            px, py = 192 + math.cos(rad) * 162, 192 + math.sin(rad) * 162
            pts = [(px, py - 22), (px + 14, py), (px, py + 22), (px - 14, py)]
            d.polygon(pts, fill=(*GLOW, 255), outline=(*LINE, 255), width=6)
    else:
        # Lv5 MAX: 풀 크레스트 링 + 8방향 방열 블레이드 핀
        for k in range(8):
            ang = math.radians(k * 45)
            ux, uy = math.cos(ang), math.sin(ang)
            nx, ny = -uy, ux
            p0 = (192 + ux * 150 + nx * 14, 192 + uy * 150 + ny * 14)
            p1 = (192 + ux * 186, 192 + uy * 186)
            p2 = (192 + ux * 150 - nx * 14, 192 + uy * 150 - ny * 14)
            d.polygon([p0, p1, p2], fill=(*IV[4], 255), outline=(*LINE, 255), width=7)
        d.ellipse([30, 30, 354, 354], outline=(*LINE, 255), width=28)
        d.ellipse([36, 36, 348, 348], outline=(*GLOW, 255), width=13)
    return im


def badge(rows):
    """공명 6종 원형 셀화 메달리온 배지."""
    S = 384
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([34, 34, 350, 350], fill=(*TI[3], 255), outline=(*LINE, 255), width=11)
    d.arc([42, 42, 342, 342], start=195, end=345, fill=(*GLOW, 255), width=8)
    d.ellipse([62, 62, 322, 322], fill=(*GM[1], 255), outline=(*LINE, 255), width=9)
    emb = render_vector_emblem(rows, size=196)
    im.alpha_composite(emb, (192 - 98, 192 - 98))
    return im


# ── 벽돌 6종: 352×192 슈퍼샘플링 → 88×48 (게임 벽돌 비율) ────────────────────────────────
BRICK_MARK = {
'atk': G('''
.........kk
........kkk
.......kkk.
......kkk..
.k...kkk...
.kk.kkk....
..kkkk.....
..kkk......
.kk.kk.....
kk...k.....
k..........'''),
'def': G('''
.kkkkkkkkk.
.kkkkkkkkk.
.kk.....kk.
.kk.....kk.
.kk.....kk.
.kk.....kk.
..kk...kk..
..kk...kk..
...kk.kk...
....kkk....
.....k.....'''),
'heal': [r.replace('#', 'k') for r in CIRC['herb']],
'poison': G('''
.....r.....
....rrr....
....rrr....
...rrrrr...
..rrrrrrr..
.rrgrrrrrr.
.rrgrrrrrr.
.rrrrrrrrr.
..rrrrrrr..
...rrrrr...
...........'''),
}


def brick(kind):
    W, H = 352, 192
    im = Image.new('RGBA', (W, H), (*LINE, 255))
    d = ImageDraw.Draw(im)
    if kind == 'n':
        d.rounded_rectangle([8, 8, W - 9, H - 9], radius=12, fill=(*TI[1], 255), outline=(*LINE, 255), width=6)
        d.line([(18, 16), (W - 20, 16)], fill=(*TI[3], 255), width=7)
        d.line([(28, 96), (244, 96)], fill=(*LINE, 255), width=7)
        d.line([(28, 103), (244, 103)], fill=(*TI[2], 255), width=5)
        for idx, x in enumerate((268, 294, 320)):
            col = TI[4] if idx == 0 else GM[2]
            d.rounded_rectangle([x, 38, x + 14, 64], radius=4, fill=(*col, 255), outline=(*LINE, 255), width=3)
    elif kind == 'stone':
        d.rounded_rectangle([8, 8, W - 9, H - 9], radius=12, fill=(*GM[2], 255), outline=(*LINE, 255), width=6)
        d.rounded_rectangle([24, 24, W - 25, H - 25], radius=8, fill=(*GM[1], 255), outline=(*GM[3], 255), width=5)
        for k in range(56, 310, 48):
            d.line([(k, 152), (k + 42, 40)], fill=(*GM[2], 255), width=10)
        for rx, ry in ((42, 42), (W - 42, 42), (42, H - 42), (W - 42, H - 42)):
            d.ellipse([rx - 10, ry - 10, rx + 10, ry + 10], fill=(*TI[3], 255), outline=(*LINE, 255), width=4)
    elif kind == 'poison':
        d.rounded_rectangle([8, 8, W - 9, H - 9], radius=12, fill=(*GM[1], 255), outline=(*LINE, 255), width=6)
        d.line([(22, 22), (W - 23, 22)], fill=(*RED_D, 255), width=8)
        d.line([(22, H - 23), (W - 23, H - 23)], fill=(*RED_D, 255), width=8)
        emb = render_vector_emblem(BRICK_MARK['poison'], size=144, dark_outline=True)
        im.alpha_composite(emb, (W // 2 - 72, H // 2 - 72))
    else:
        # 특수 효과 블록(atk, def, heal): 밝은 상아 셀화 장갑판 + 진한 먹색 문양(가독성 극대화)
        d.rounded_rectangle([8, 8, W - 9, H - 9], radius=12, fill=(*IV[3], 255), outline=(*LINE, 255), width=6)
        d.line([(18, 16), (W - 20, 16)], fill=(*IV[4], 255), width=7)
        sheen = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(sheen).polygon([(44, 14), (96, 14), (54, H - 14), (16, H - 14)], fill=(255, 255, 255, 70))
        im.alpha_composite(sheen)
        d = ImageDraw.Draw(im)
        for sx, sy, dx, dy in ((26, 26, 1, 1), (W - 27, 26, -1, 1), (26, H - 27, 1, -1), (W - 27, H - 27, -1, -1)):
            d.line([(sx, sy), (sx + dx * 22, sy)], fill=(*TI[1], 255), width=5)
            d.line([(sx, sy), (sx, sy + dy * 22)], fill=(*TI[1], 255), width=5)
        emb = render_vector_emblem(BRICK_MARK[kind], size=144, dark_outline=False)
        im.alpha_composite(emb, (W // 2 - 72, H // 2 - 72))
    return im


# ── 소품 & 충전소 ────────────────────────────────────────────────────────────────────────
def coin():
    S = 192
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = 38
    oct_pts = [(16 + c, 16), (S - 16 - c, 16), (S - 16, 16 + c), (S - 16, S - 16 - c),
               (S - 16 - c, S - 16), (16 + c, S - 16), (16, S - 16 - c), (16, 16 + c)]
    d.polygon(oct_pts, fill=(*TI[3], 255), outline=(*LINE, 255), width=10)
    d.ellipse([42, 42, S - 42, S - 42], fill=(*GM[2], 255), outline=(*LINE, 255), width=7)
    dia = [(96, 56), (136, 96), (96, 136), (56, 96)]
    d.polygon(dia, fill=(*IV[4], 255), outline=(*LINE, 255), width=6)
    return im


def spark():
    S = 256
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx, cy = 128, 128
    # 8방향 날카로운 셀화 스타버스트 섬광
    pts = []
    for k in range(16):
        ang = math.radians(k * 22.5)
        r = (116 if k % 4 == 0 else 68) if k % 2 == 0 else 20
        pts.append((cx + math.cos(ang) * r, cy + math.sin(ang) * r))
    d.polygon(pts, fill=(*GLOW, 255), outline=(*IV[2], 255), width=4)
    return im


def rubble():
    S = 256
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    shards = [
        ([(28, 48), (102, 28), (118, 98), (46, 112)], TI[2]),
        ([(148, 56), (218, 76), (196, 134), (138, 114)], TI[1]),
        ([(56, 152), (132, 138), (148, 214), (72, 218)], GM[3]),
        ([(168, 166), (228, 154), (222, 216), (176, 208)], TI[3]),
    ]
    for poly, col in shards:
        d.polygon(poly, fill=(*col, 255), outline=(*LINE, 255), width=10)
        d.line([poly[0], poly[1]], fill=(*TI[4], 255), width=5)
    return im


def heater():
    """충전소 플라즈마 인덕션 히터 3프레임 시트(576×176, 내부 2배 슈퍼샘플링)."""
    SS = 2
    FW, FH = 192 * SS, 176 * SS
    sheet = Image.new('RGBA', (192 * 3, 176), (0, 0, 0, 0))
    for f in range(3):
        im = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        # 하단 중장갑 받침대
        d.rounded_rectangle([64, 304, 320, 340], radius=12, fill=(*GM[2], 255), outline=(*LINE, 255), width=10)
        d.rounded_rectangle([92, 280, 292, 312], radius=8, fill=(*TI[1], 255), outline=(*LINE, 255), width=9)
        # 중앙 유도 코일 기둥
        d.rectangle([140, 108, 244, 284], fill=(*GM[1], 255), outline=(*LINE, 255), width=10)
        for i, y in enumerate(range(126, 272, 32)):
            lit = (i + f) % 3 == 0
            col = GLOW if lit else TI[2]
            d.rounded_rectangle([124, y, 260, y + 20], radius=8, fill=(*col, 255), outline=(*LINE, 255), width=8)
        # 상단 방전 캡 & 부유 플라즈마 링
        d.rounded_rectangle([128, 84, 256, 112], radius=8, fill=(*TI[3], 255), outline=(*LINE, 255), width=9)
        dy_glow = (-6, 0, -10)[f]
        d.ellipse([162, 36 + dy_glow, 222, 86 + dy_glow], fill=(*GLOW, 255), outline=(*LINE, 255), width=8)
        frame_lo = clamp_cel_palette(im.resize((192, 176), Image.LANCZOS), allow_red=False)
        sheet.paste(frame_lo, (f * 192, 0))
    return sheet


def terminal():
    S_W, S_H = 448, 480
    im = Image.new('RGBA', (S_W, S_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([124, 412, 324, 448], radius=8, fill=(*GM[3], 255), outline=(*LINE, 255), width=10)
    d.rectangle([196, 356, 252, 416], fill=(*GM[2], 255), outline=(*LINE, 255), width=10)
    d.rounded_rectangle([44, 44, 404, 360], radius=18, fill=(*TI[1], 255), outline=(*LINE, 255), width=12)
    d.rounded_rectangle([72, 72, 376, 332], radius=10, fill=(*GM[0], 255), outline=(*LINE, 255), width=8)
    for y in range(96, 312, 28):
        w_bar = 80 + ((y * 13) % 180)
        d.line([(96, y), (96 + w_bar, y)], fill=(*TI[3], 255), width=7)
    return im


ICON_SIZES = {'icon-1024': 1024, 'icon-512': 512, 'icon-192': 192, 'apple-touch-icon': 180, 'favicon-32': 32}


def main():
    n = 0
    for k, fn in CORES.items():
        save_cel(fn(), 'orb_' + k, (96, 96)); n += 1
    for k, rows in CIRC.items():
        save_cel(circuit(rows), 'orb_' + k, (96, 96)); n += 1
    for k, rows in RES.items():
        save_cel(badge(rows), 'res_' + k, (96, 96)); n += 1
    for lv in (2, 3, 4, 5):
        save_cel(orb_lv_ring(lv), f'orb_lv_{lv}', (96, 96)); n += 1
    for k, rows in RELIC.items():
        save_cel(relic(rows), 'relic_' + k, (96, 96)); n += 1
    for k in ('n', 'stone', 'atk', 'def', 'heal', 'poison'):
        save_cel(brick(k), 'brick_' + k, (88, 48)); n += 1
    save_cel(coin(), 'coin', (48, 48))
    save_cel(spark(), 'spark', (64, 64))
    save_cel(rubble(), 'rubble', (64, 64))
    save_cel(terminal(), 'merchant', (224, 240))
    heater().save(OUT / 'campfire.png', optimize=True)

    # AI 셀화 앱 아이콘 원본(assets/illustrated/icon.png)이 있으면 그것을 우선 사용한다
    ill_icon = ROOT / 'assets' / 'illustrated' / 'icon.png'
    if ill_icon.exists():
        big = Image.open(ill_icon).convert('RGB')
        ICONS.mkdir(exist_ok=True)
        for name, size in ICON_SIZES.items():
            big.resize((size, size), Image.LANCZOS).save(ICONS / f'{name}.png', optimize=True)
    print(f'셀화 아이템 {n}장 + 크레딧·불꽃·파편·단말기·히터 + 앱 아이콘 {len(ICON_SIZES)}장을 생성했다')


if __name__ == '__main__':
    main()

