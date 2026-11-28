#!/usr/bin/env python3
"""모노크롬 서브컬처 셀화(Cel-Shading) 사이버펑크 배경(chasm.png) 및 HUD 프레임(ui_*) 생성기.

- 화풍: 원신 / 젠레스 존 제로 / 명조풍의 날카로운 선화와 정교한 투톤·쓰리톤 셀 채색(2배 슈퍼샘플링 안티에일리어싱).
- 색 규칙(AGENTS.md): 카본 블랙·건메탈·티타늄 실버·상아/순백 발광 + 위험 표시용 화(#C1443C) 단일 강조색.
- 결과는 고정 시드로 항상 동일하게 재현된다.

만드는 파일:
  assets/illustrated/chasm.png & assets/game/chasm.png  (720×1360, 내부 1440×2720 슈퍼샘플링)
  assets/game/ui_bar.png    202×55    어두운 셀화 HUD 판. CSS border-image 10 24 fill
  assets/game/ui_panel.png  313×85    밝은 셀화 HUD 판. CSS border-image 16 34 fill
  assets/game/ui_frame.png  102×110   모서리 꺾쇠 액자. CSS border-image 20 18
  assets/game/scan.png      1×3       터미널 주사선 패턴
"""
import math
import random
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ILL = ROOT / 'assets' / 'illustrated'
OUT = ROOT / 'assets' / 'game'

INK = (9, 11, 14)
CARBON = (13, 16, 20)
CARBON2 = (19, 23, 28)
SLATE = (27, 33, 40)
STEEL = (38, 46, 55)
STEEL_HI = (58, 68, 79)
TITAN = (96, 108, 118)
SILVER = (148, 160, 170)
GLOW = (232, 238, 242)
RED = (193, 68, 60)


def draw_catenary(draw, x0, y0, x1, y1, sag, thick, col_main, col_rim):
    pts = []
    steps = 36
    for i in range(steps + 1):
        u = i / steps
        x = x0 + (x1 - x0) * u
        y = y0 + (y1 - y0) * u + sag * 4.0 * u * (1.0 - u)
        pts.append((x, y))
    draw.line(pts, fill=INK, width=thick + 4)
    draw.line(pts, fill=col_main, width=thick)
    rim_pts = [(x, y - max(1.0, thick * 0.28)) for x, y in pts]
    draw.line(rim_pts, fill=col_rim, width=max(2, thick // 3))


def backdrop():
    # 1440×2720 (2배 슈퍼샘플링)에서 날카로운 셀화 건축 선화와 볼류메트릭 광선을 그린 뒤 720×1360으로 LANCZOS 축소
    W, H = 1440, 2720
    rnd = random.Random(20261127)
    base = Image.new('RGBA', (W, H), (*CARBON, 255))
    d = ImageDraw.Draw(base)

    # 전투 무대 경계: BT = 110/340 -> y = 880, 발판 바닥 ART_FOOT = 90/340 -> y = 720
    bt_y = 880
    foot_y = 720
    sky_h = 636

    # 1. 상단 육각 차폐 돔 천장 (y = 0 .. sky_h)
    d.rectangle([0, 0, W, sky_h], fill=(*CARBON2, 255))
    hw, hh = 96, 56
    for row in range(-1, sky_h // hh + 3):
        for col in range(-1, W // (hw * 3) + 3):
            cx = col * hw * 3 + (row % 2) * hw * 1.5
            cy = row * hh
            pts = [
                (cx - hw, cy), (cx - hw * 0.5, cy - hh), (cx + hw * 0.5, cy - hh),
                (cx + hw, cy), (cx + hw * 0.5, cy + hh), (cx - hw * 0.5, cy + hh),
            ]
            r_val = rnd.random()
            if r_val < 0.24:
                # 닫힌 장갑 차폐판(투톤 셀 명암)
                d.polygon(pts, fill=(*SLATE, 255))
                hi_tri = [pts[0], pts[1], pts[2], (cx, cy)]
                d.polygon(hi_tri, fill=(*STEEL, 255))
            else:
                # 열린 천장 창(깊은 밤하늘 + 미세 별빛)
                d.polygon(pts, fill=(10, 13, 17, 255))
                if r_val > 0.80:
                    sx = int(cx + rnd.uniform(-hw * 0.35, hw * 0.35))
                    sy = int(cy + rnd.uniform(-hh * 0.35, hh * 0.35))
                    if 0 <= sx < W and 0 <= sy < sky_h:
                        d.ellipse([sx - 2, sy - 2, sx + 2, sy + 2], fill=(*GLOW, 210))
            # 두꺼운 금속 트러스 테두리 + 먹선
            d.line(pts + [pts[0]], fill=(*STEEL_HI, 255), width=8)
            d.line(pts + [pts[0]], fill=(*INK, 255), width=3)

    # 돔 하단 수평 거더 빔
    d.rectangle([0, sky_h - 14, W, sky_h + 10], fill=(*STEEL, 255), outline=(*INK, 255), width=3)
    d.line([(0, sky_h - 10), (W, sky_h - 10)], fill=(*TITAN, 255), width=3)

    # 2. 수직 갱도 심연 벽면 (y = sky_h .. H, 중앙 원근 패널)
    d.rectangle([0, sky_h + 10, W, H], fill=(11, 14, 18, 255))
    vx, vy = W // 2, int(H * 0.92)
    # 원근 수직 가이드 리브
    for x_top in (270, 430, 580, 860, 1010, 1170):
        x_bot = round(vx + (x_top - vx) * 0.42)
        d.line([(x_top, bt_y), (x_bot, H)], fill=(20, 25, 31, 255), width=4)
        d.line([(x_top + 3, bt_y), (x_bot + 2, H)], fill=(10, 12, 15, 255), width=2)

    # 수평 층간 격벽 거더 (아래로 갈수록 좁아지며 어두워짐 — 벽돌 가독성 최우선 보호)
    for i, y in enumerate(range(bt_y + 90, H, 140)):
        u = (y - bt_y) / (H - bt_y)
        inset = round(230 + u * 210)
        c_beam = (24, 30, 37, 255) if i % 2 == 0 else (18, 22, 28, 255)
        d.rectangle([inset, y, W - inset, y + 16], fill=c_beam, outline=(9, 11, 14, 255), width=2)
        if i < 4:
            # 상부 거더 X자 트러스 브레이싱
            y_next = y + 140
            inset_n = round(230 + ((y_next - bt_y) / (H - bt_y)) * 210)
            d.line([(inset + 20, y + 16), (inset_n + 60, y_next)], fill=(19, 24, 30, 255), width=3)
            d.line([(W - inset - 20, y + 16), (W - inset_n - 60, y_next)], fill=(19, 24, 30, 255), width=3)

    # 3. 볼류메트릭 셀화 빛줄기 (천장 틈에서 전투 캣워크로 비스듬히 쏟아지는 은백색 광선)
    beam_layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(beam_layer)
    shafts = [
        ([(240, 0), (470, 0), (760, bt_y + 260), (430, bt_y + 260)], 28),
        ([(520, 0), (630, 0), (890, bt_y + 180), (740, bt_y + 180)], 18),
        ([(880, 0), (960, 0), (1160, bt_y + 120), (1050, bt_y + 120)], 14),
    ]
    for poly, alpha in shafts:
        bd.polygon(poly, fill=(220, 230, 238, alpha))
        bd.line([poly[0], poly[3]], fill=(238, 244, 248, alpha + 12), width=2)
        bd.line([poly[1], poly[2]], fill=(238, 244, 248, alpha + 8), width=2)
    base.alpha_composite(beam_layer)
    d = ImageDraw.Draw(base)

    # 4. 전투 무대 강철 캣워크 교량 (캐릭터 발밑 y = 720 에 정확히 맞춘 입체 발판 + 후방 난간)
    rail_y = foot_y - 68
    d.line([(210, rail_y), (W - 210, rail_y)], fill=(*INK, 255), width=7)
    d.line([(210, rail_y), (W - 210, rail_y)], fill=(*TITAN, 255), width=3)
    d.line([(210, rail_y + 30), (W - 210, rail_y + 30)], fill=(*STEEL_HI, 255), width=3)
    for rx in range(250, W - 210, 96):
        d.line([(rx, rail_y), (rx, foot_y - 12)], fill=(*INK, 255), width=6)
        d.line([(rx, rail_y), (rx, foot_y - 12)], fill=(*STEEL_HI, 255), width=3)

    # 캣워크 바닥 상판(y = 696 .. 760) 및 하부 교량 트러스(y = 760 .. 880)
    d.polygon([(190, foot_y - 22), (W - 190, foot_y - 22), (W - 150, foot_y + 36), (150, foot_y + 36)],
              fill=(*STEEL, 255), outline=(*INK, 255), width=4)
    d.line([(190, foot_y - 19), (W - 190, foot_y - 19)], fill=(*SILVER, 255), width=3)
    # 바닥 미끄럼 방지 셀화 사선 분할선
    for gx in range(240, W - 220, 110):
        d.line([(gx, foot_y - 20), (gx - 18, foot_y + 34)], fill=(*SLATE, 255), width=3)

    # 캣워크 전면 단차 거더 (y = 760 .. bt_y=880)
    d.rectangle([150, foot_y + 36, W - 150, bt_y], fill=(*CARBON2, 255), outline=(*INK, 255), width=4)
    for tx in range(180, W - 220, 120):
        d.polygon([(tx, foot_y + 46), (tx + 96, foot_y + 46), (tx + 82, bt_y - 14), (tx + 14, bt_y - 14)],
                  fill=(15, 18, 23, 255), outline=(*STEEL, 255), width=2)
    d.line([(0, bt_y - 4), (W, bt_y - 4)], fill=(*TITAN, 255), width=4)

    # 5. 좌우 초대형 서버 모놀리스 타워 (2점 투시 입체 면 분할 + 셀화 림라이트)
    def draw_server_tower(is_left):
        x_out = 0 if is_left else W
        x_mid = 215 if is_left else W - 215
        x_in = 285 if is_left else W - 285
        # 전면부(어두운 카본-슬레이트) + 측면부(안쪽을 향한 밝은 셀화 강철 면)
        front_poly = [(x_out, 360), (x_mid, 395), (x_mid, H), (x_out, H)] if is_left else [(x_mid, 395), (x_out, 360), (x_out, H), (x_mid, H)]
        side_poly = [(x_mid, 395), (x_in, 455), (x_in, H), (x_mid, H)] if is_left else [(x_in, 455), (x_mid, 395), (x_mid, H), (x_in, H)]
        top_poly = [(x_out, 360), (x_out + (185 if is_left else -185), 340), (x_in, 455), (x_mid, 395)]

        d.polygon(front_poly, fill=(18, 22, 27, 255), outline=(*INK, 255), width=4)
        d.polygon(side_poly, fill=(31, 38, 46, 255), outline=(*INK, 255), width=4)
        d.polygon(top_poly, fill=(52, 62, 72, 255), outline=(*INK, 255), width=4)
        # 날카로운 수직 셀화 하이라이트 엣지
        d.line([(x_mid, 395), (x_mid, H)], fill=(*TITAN, 255), width=4)
        d.line([(x_mid + (4 if is_left else -4), 395), (x_mid + (4 if is_left else -4), H)], fill=(*INK, 255), width=2)

        # 서버 블레이드 슬롯 & 상태 LED
        y = 435
        while y < H - 40:
            x0, x1 = (18, x_mid - 20) if is_left else (x_mid + 20, W - 18)
            d.rectangle([x0, y, x1, y + 44], fill=(13, 16, 20, 255), outline=(38, 46, 55, 255), width=2)
            # 슬롯 방열 그릴 선
            d.line([(x0 + 10, y + 28), (x1 - 10, y + 28)], fill=(30, 36, 44, 255), width=2)
            # 셀화 LED 점등 (대부분 은백색, 극소수 위험 경고등 #C1443C)
            for lx in range(x0 + 14, x1 - 14, 18):
                rv = rnd.random()
                if rv < 0.14:
                    d.rectangle([lx, y + 10, lx + 6, y + 15], fill=(*GLOW, 255))
                elif rv < 0.28:
                    d.rectangle([lx, y + 10, lx + 6, y + 15], fill=(*TITAN, 255))
                elif rv < 0.298 and y < bt_y + 500:
                    d.rectangle([lx, y + 10, lx + 6, y + 15], fill=(*RED, 255))
            # 안쪽 측면 원근 슬릿
            sy0 = y + 18
            sx_a, sx_b = (x_mid + 12, x_in - 10) if is_left else (x_in + 10, x_mid - 12)
            d.line([(sx_a, y + 8), (sx_b, sy0 + 22)], fill=(18, 22, 27, 255), width=4)
            y += 64

    draw_server_tower(True)
    draw_server_tower(False)

    # 6. 매끄러운 베지어 현수선 광케이블 다발 (먹선 외곽 + 건메탈 본체 + 은백색 상단 림라이트)
    cables = [
        (0, 80, 250, 420, 95, 10),
        (35, 0, 275, 450, 110, 7),
        (W, 80, W - 250, 420, 95, 10),
        (W - 35, 0, W - 275, 450, 110, 7),
        (265, 680, 520, 1060, 135, 8),
        (275, 830, 460, 1320, 165, 6),
        (W - 265, 680, W - 520, 1060, 135, 8),
        (W - 275, 830, W - 460, 1320, 165, 6),
    ]
    for x0, y0, x1, y1, sag, th in cables:
        draw_catenary(d, x0, y0, x1, y1, sag, th, (28, 34, 42, 255), (112, 124, 136, 255))

    final_rgb = base.convert('RGB').resize((720, 1360), Image.LANCZOS)
    ILL.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    final_rgb.save(ILL / 'chasm.png', optimize=True)
    final_rgb.save(OUT / 'chasm.png', optimize=True)


def chamfer_frame(size, slice_tb, slice_lr, fill, outer, inner, tick, cut, sheen=None):
    """2배 슈퍼샘플링으로 비스듬히 깎인 모서리와 셀화 광택을 가진 정밀 HUD 판을 생성한다."""
    SS = 2
    w, h = size[0] * SS, size[1] * SS
    c = cut * SS
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    poly = [
        (c, 1), (w - 2 - c, 1), (w - 2, c), (w - 2, h - 2 - c),
        (w - 2 - c, h - 2), (c, h - 2), (1, h - 2 - c), (1, c),
    ]
    if fill:
        d.polygon(poly, fill=fill)
    if sheen:
        # 대각선 셀화 반사광 띠
        sh_poly = [(c + 12, 3), (c + 64, 3), (c + 34, h - 4), (c - 4, h - 4)]
        sh_layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(sh_layer).polygon(sh_poly, fill=sheen)
        im.alpha_composite(sh_layer)
        d = ImageDraw.Draw(im)
    d.line(poly + [poly[0]], fill=outer, width=4)
    if inner:
        i = 8
        d.rectangle([i + c // 2, i, w - 2 - i - c // 2, h - 2 - i], outline=inner, width=2)
    if tick:
        L = (min(slice_lr, slice_tb) - 3) * SS
        for (x, y, sx, sy) in ((4, 4, 1, 1), (w - 5, 4, -1, 1), (4, h - 5, 1, -1), (w - 5, h - 5, -1, -1)):
            d.line([(x + sx * c, y), (x + sx * (c + L), y)], fill=tick, width=3)
            d.line([(x, y + sy * c), (x, y + sy * (c + L))], fill=tick, width=3)
    return im.resize(size, Image.LANCZOS)


def brackets(size, col, edge):
    SS = 2
    w, h = size[0] * SS, size[1] * SS
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    L, t = 28, 6
    for (x, y, sx, sy) in ((1, 1, 1, 1), (w - 2, 1, -1, 1), (1, h - 2, 1, -1), (w - 2, h - 2, -1, -1)):
        d.line([(x, y), (x + sx * L, y)], fill=edge, width=t + 4)
        d.line([(x, y), (x, y + sy * L)], fill=edge, width=t + 4)
        d.line([(x, y), (x + sx * L, y)], fill=col, width=t)
        d.line([(x, y), (x, y + sy * L)], fill=col, width=t)
    return im.resize(size, Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    backdrop()
    chamfer_frame(
        (202, 55), 10, 24,
        (14, 17, 21, 255), (160, 170, 178, 255), (42, 50, 58, 255), (*GLOW, 255), 6,
        sheen=(220, 230, 238, 16),
    ).save(OUT / 'ui_bar.png')
    chamfer_frame(
        (313, 85), 16, 34,
        (240, 243, 245, 255), (16, 19, 23, 255), (188, 196, 202, 255), (16, 19, 23, 255), 8,
        sheen=(255, 255, 255, 90),
    ).save(OUT / 'ui_panel.png')
    brackets((102, 110), (168, 178, 186, 255), (14, 17, 21, 255)).save(OUT / 'ui_frame.png')
    scan = Image.new('RGBA', (1, 3), (0, 0, 0, 0))
    scan.putpixel((0, 2), (255, 255, 255, 10))
    scan.save(OUT / 'scan.png')
    print('ok: cel-art chasm.png, ui_bar.png, ui_panel.png, ui_frame.png, scan.png')


if __name__ == '__main__':
    main()
