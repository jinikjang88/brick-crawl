#!/usr/bin/env python3
"""상점 상인·모닥불 도트 스프라이트를 코드로 그려 assets/game에 저장한다.

assets/illustrated에 없는 장면 소품이라, 같은 팔레트(상아·황동·먹색·나무·돌)의 단계 명암으로 직접 그린다.
도형마다 재질 램프를 정하고, 왼쪽 위 광원 기준 구면 명암 → 램프 단계로 양자화 → 바깥 1px 먹색 외곽선.
붉은색은 게임에서 "위험" 전용이라 불꽃도 황동·상아 톤만 쓴다.

실행: python3 tools/draw_scene_sprites.py  (Pillow, numpy 필요)
"""
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'game'
SCALE = 4  # 저장 배율: 캔버스 RES(보통 4~7)에서 부드럽게 그려지도록 최근접 확대해 둔다

RAMP = {
    'robe':  ['#211A15', '#30261E', '#433529', '#5A4838', '#6F5B47'],
    'dark':  ['#100C09', '#17120E', '#1F1813'],
    'brass': ['#4E3A1F', '#76592F', '#A07D45', '#C9A766', '#EAD49C'],
    'ivory': ['#7E6F57', '#A7977A', '#CDBD9C', '#E6D9BC', '#F6EEDC'],
    'wood':  ['#2E2116', '#463222', '#604530', '#7C5B3E', '#97724F'],
    'stone': ['#3E3A35', '#59534B', '#766E63', '#968C7E', '#B4AA9A'],
    'flame': ['#9C7A3E', '#C9A766', '#E8CC8C', '#F6E6BC', '#FFF8E6'],
    'glow':  ['#F6EEDC'],
}
OUTLINE = '#15110D'


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [[None] * w for _ in range(h)]
        self.glows = []   # 외곽선 없이 맨 위에 찍는 빛 점(불티·눈빛)

    def put(self, x, y, col):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = col

    def shade(self, mat, k):
        r = RAMP[mat]
        return r[max(0, min(len(r) - 1, int(k * len(r))))]

    def ellipse(self, cx, cy, rx, ry, mat, light=(-.6, -.7), flat=0.0, bias=0.0):
        """구면 명암 타원. flat이 클수록 명암 대비가 줄어든다(천·평면)."""
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                nx, ny = (x + .5 - cx) / rx, (y + .5 - cy) / ry
                d = nx * nx + ny * ny
                if d > 1:
                    continue
                nz = math.sqrt(max(0, 1 - d))
                lum = (-(nx * light[0] + ny * light[1]) * .6 + nz * .55) * (1 - flat) + flat * .55 + bias
                self.put(x, y, self.shade(mat, (lum + .25) / 1.2))

    def poly(self, pts, mat, light_x=-1.0, base=.45, slope=.35, bias=0.0):
        """다각형: 왼쪽이 밝게(광원 왼쪽) 가로 방향 명암."""
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        x0, x1 = min(xs), max(xs)
        for y in range(int(min(ys)), int(max(ys)) + 1):
            for x in range(int(x0), int(x1) + 1):
                if inside(pts, x + .5, y + .5):
                    t = (x + .5 - x0) / max(1, x1 - x0)
                    lum = base + slope * (.5 - t) * (-light_x) + bias
                    self.put(x, y, self.shade(mat, lum))

    def rect(self, x, y, w, h, mat, k):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.put(xx, yy, self.shade(mat, k))

    def image(self, outline=True):
        if outline:
            src = [row[:] for row in self.px]
            for y in range(self.h):
                for x in range(self.w):
                    if src[y][x] is None and any(
                        0 <= x + dx < self.w and 0 <= y + dy < self.h and src[y + dy][x + dx] not in (None, 'GLOW')
                        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                        self.px[y][x] = OUTLINE
        for x, y, col in self.glows:
            if 0 <= x < self.w and 0 <= y < self.h:
                self.px[y][x] = col
        a = np.zeros((self.h, self.w, 4), dtype=np.uint8)
        for y in range(self.h):
            for x in range(self.w):
                c = self.px[y][x]
                if c and c != 'GLOW':
                    a[y, x] = (*hexrgb(c), 255)
        return Image.fromarray(a, 'RGBA')


def inside(pts, x, y):
    c = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]; xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def merchant():
    """후드를 쓴 떠돌이 상인: 큰 봇짐, 황동 랜턴, 그늘진 얼굴에 빛나는 눈. 카운터 뒤에 서므로 허리 아래는 짧게."""
    c = Canvas(56, 60)
    # 봇짐(뒤): 나무 틀 + 상아 천 꾸러미
    c.ellipse(15, 22, 11, 13, 'ivory', flat=.3, bias=-.1)
    c.rect(6, 12, 2, 30, 'wood', .5)
    c.ellipse(13, 9, 6, 4, 'ivory', flat=.2, bias=-.05)
    # 몸통(로브)
    c.poly([(19, 27), (37, 27), (46, 60), (10, 60)], 'robe', base=.5, slope=.5)
    # 상아 목도리
    c.ellipse(28, 28, 10, 4, 'ivory', flat=.4)
    c.ellipse(24, 34, 3, 6, 'ivory', flat=.4, bias=-.1)
    # 후드
    c.ellipse(28, 17, 12, 13, 'robe', bias=.22)
    c.ellipse(29, 19, 8, 9, 'dark', flat=1)
    # 빛나는 눈(그늘 속): 외곽선에 묻히지 않게 직접 찍는다
    for x, y in ((26, 19), (27, 19), (31, 19), (32, 19)):
        c.put(x, y, RAMP['flame'][4])
    c.put(29, 23, RAMP['dark'][2])
    # 황동 띠·동전 주머니
    c.rect(15, 44, 26, 2, 'brass', .55)
    c.ellipse(34, 49, 4, 4, 'brass', bias=.05)
    # 오른손 랜턴(들어 올림)
    c.ellipse(41, 36, 4, 3, 'robe', bias=.1)            # 소매
    c.rect(44, 25, 1, 9, 'brass', .3)                    # 손잡이 줄
    c.rect(41, 33, 7, 2, 'brass', .7)                    # 뚜껑
    c.rect(42, 35, 5, 7, 'flame', .9)                    # 불빛
    c.rect(41, 35, 1, 7, 'brass', .45); c.rect(47, 35, 1, 7, 'brass', .35); c.rect(44, 35, 1, 7, 'brass', .6)
    c.rect(41, 42, 7, 2, 'brass', .5)
    return c.image()


def campfire(frame, rng):
    """둥근 돌 테두리 + 엇갈린 장작 + 불꽃. frame마다 불꽃 모양만 바뀐다."""
    c = Canvas(48, 44)
    # 불꽃(뒤쪽 큰 혀 → 앞쪽 작은 혀). 프레임마다 높이·흔들림을 바꾼다
    sway = [0, 1, -1][frame]
    tall = [0, 3, 1][frame]
    tongues = [(24 + sway, 30, 8, 15 + tall, 0.0), (18 - sway, 32, 5, 9 + (2 - frame), -.05), (30 + sway, 32, 5, 10 + frame, -.05),
               (24 - sway, 33, 5, 8, .15)]
    for cx, base, rx, h, bias in tongues:
        for y in range(base - h, base + 1):
            t = (base - y) / h                      # 0 바닥 → 1 끝
            w = rx * (1 - t ** 1.6) * (1 + .15 * math.sin(t * 6 + frame))
            for x in range(int(cx - w), int(cx + w) + 1):
                d = abs(x + .5 - cx) / max(.5, w)
                k = (1 - d) * .7 + (1 - t) * .3 + bias
                c.put(x, y, c.shade('flame', k))
    # 장작 두 개(엇갈림)
    c.poly([(8, 33), (11, 30), (40, 37), (37, 40)], 'wood', base=.5, slope=.4)
    c.poly([(37, 30), (40, 33), (11, 40), (8, 37)], 'wood', base=.42, slope=.4)
    for x, y in ((9, 31), (38, 31)):                 # 장작 단면(나이테)
        c.ellipse(x + .5, y + 2, 2, 2, 'wood', flat=.2, bias=.25)
    # 돌 테두리
    for i, (sx, sy, r) in enumerate([(5, 39, 4), (12, 41, 4), (20, 42, 4), (28, 42, 4), (36, 41, 4), (43, 39, 4)]):
        c.ellipse(sx, sy, r + .5, r - .5, 'stone', bias=rng.uniform(-.06, .06))
    # 불티
    for i in range(3):
        x = 24 + rng.randint(-8, 8); y = rng.randint(4, 14) - frame * 2
        c.glows.append((x, y, RAMP['flame'][3 + (i % 2)]))
    return c.image()


def save(img, name):
    OUT.mkdir(parents=True, exist_ok=True)
    big = img.resize((img.width * SCALE, img.height * SCALE), Image.NEAREST)
    p = OUT / f'{name}.png'
    big.save(p, optimize=True)
    print(f'{p.relative_to(ROOT)}  {big.width}x{big.height}  {p.stat().st_size // 1024}KB')


if __name__ == '__main__':
    rng = random.Random(7)   # 결과가 매번 같도록 고정 시드
    save(merchant(), 'merchant')
    # 모닥불은 3프레임을 가로로 이어 붙인 띠 하나로 둔다(로드 1번)
    frames = [campfire(i, rng) for i in range(3)]
    strip = Image.new('RGBA', (frames[0].width * 3, frames[0].height))
    for i, f in enumerate(frames):
        strip.paste(f, (i * f.width, 0))
    save(strip, 'campfire')
