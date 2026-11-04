#!/usr/bin/env python3
"""사이버펑크 화면용 배경·UI 조각을 도트로 그린다(작업 07, 2026-11-04 안 B: 모노크롬 사이버펑크).

AI 일러스트(docs/ASSET_PROMPTS.md 6.1 chasm)가 나오기 전까지 옛 중세 던전 배경·양피지 프레임을 대신한다.
색은 카본 블랙·티타늄 회색·백색 발광 + 위험 표시용 화(#C1443C) 하나만 쓴다(AGENTS.md 색 규칙).
결과는 실행마다 같다(고정 시드). 실행: python3 tools/draw_cyber_assets.py

만드는 파일(assets/game):
  chasm.png     720×1360  전투·지도·장면 공용 배경(세로 9:17): 위 = 육각 차폐판 하늘, 양옆 = 서버 탑, 가운데 = 수직 갱도
  ui_bar.png    202×55    어두운 HUD 판(시작 버튼·다크 패널). CSS border-image 10 24 fill
  ui_panel.png  313×85    밝은 HUD 판(배너·라이트 패널). CSS border-image 16 34 fill
  ui_frame.png  102×110   모서리 꺾쇠만 있는 액자(이번 구슬·터미널 테두리). CSS border-image 20 18
  scan.png      1×3       주사선 무늬 한 칸(터미널 화면 위에 반복). 그라디언트 대신 이미지로 둔다
"""
import random
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'game'

CARBON = (11, 13, 16)
CARBON2 = (17, 20, 24)
STEEL = (30, 35, 40)
STEEL2 = (44, 51, 57)
TITAN = (96, 106, 113)
PALE = (150, 160, 166)
GLOW = (228, 236, 240)
RED = (193, 68, 60)


def backdrop():
    # 360×680 도트로 그리고 2배 최근접 확대: 도트 굵기를 화면 어디서나 같게
    W, H = 360, 680
    rnd = random.Random(20261104)
    im = Image.new('RGB', (W, H), CARBON)
    d = ImageDraw.Draw(im)

    # 하늘(위 30%): 육각 차폐판 격자. 판 몇 장은 조금 밝고, 틈으로 잿빛 빛줄기가 내려온다
    sky = int(H * .30)
    d.rectangle([0, 0, W, sky], fill=CARBON2)
    hw, hh = 22, 13
    for row in range(-1, sky // hh + 2):
        for col in range(-1, W // (hw * 3) + 2):
            cx = col * hw * 3 + (row % 2) * hw * 1.5
            cy = row * hh
            pts = [(cx - hw, cy), (cx - hw / 2, cy - hh), (cx + hw / 2, cy - hh), (cx + hw, cy), (cx + hw / 2, cy + hh), (cx - hw / 2, cy + hh)]
            fill = STEEL if rnd.random() < .18 else None
            d.polygon(pts, fill=fill, outline=STEEL2)
    for _ in range(5):
        x = rnd.randrange(70, W - 70)
        for y in range(sky - 40, sky + 160):
            if (x + y) % 2 == 0:
                im.putpixel((x, y), STEEL2)
            if (x + 1 + y) % 3 == 0:
                im.putpixel((x + 1, y), STEEL)
    d.line([0, sky, W, sky], fill=STEEL2)

    # 가운데 수직 갱도: 멀어지는 난간(가로선)과 가운데 기둥
    for i, y in enumerate(range(sky + 8, H, 26)):
        inset = max(0, 120 - i * 6)
        d.line([60 + inset // 2, y, W - 60 - inset // 2, y], fill=STEEL if i % 2 else CARBON2)
    for x in (150, 210):
        d.line([x, sky, x, H], fill=CARBON2)

    # 양옆 서버 탑: 랙 칸·LED. 백색 LED가 대부분이고, 붉은 경고등은 드물게(붉은색 = 위험)
    def tower(x0, x1):
        d.rectangle([x0, sky - 30, x1, H], fill=CARBON2, outline=STEEL2)
        y = sky - 24
        while y < H:
            d.rectangle([x0 + 3, y, x1 - 3, y + 14], outline=STEEL)
            for lx in range(x0 + 6, x1 - 6, 4):
                r = rnd.random()
                if r < .10:
                    im.putpixel((lx, y + 4), GLOW)
                elif r < .22:
                    im.putpixel((lx, y + 4), PALE)
                elif r < .235:
                    im.putpixel((lx, y + 4), RED)
            d.line([x0 + 6, y + 10, x1 - 6, y + 10], fill=STEEL)
            y += 18
    tower(0, 58)
    tower(W - 59, W - 1)

    # 늘어진 케이블 다발: 탑에서 갱도 쪽으로
    for k in range(6):
        y0 = sky + 20 + k * 37
        sag = 18 + rnd.randrange(16)
        left = k % 2 == 0
        xa, xb = (58, 150) if left else (W - 59, 210)
        prev = None
        for t in range(0, 101, 2):
            u = t / 100
            x = xa + (xb - xa) * u
            y = y0 + sag * 4 * u * (1 - u)
            p = (int(x), int(y))
            if prev:
                d.line([prev, p], fill=STEEL2, width=2)
                d.line([prev[0], prev[1] - 1, p[0], p[1] - 1], fill=STEEL)
            prev = p

    # 바닥 쪽(벽돌판 자리)은 낮은 대비의 패널 격자만: 벽돌·구슬이 먼저 읽히게
    for y in range(int(H * .55), H, 34):
        d.line([60, y, W - 60, y], fill=CARBON2)
    for x in range(60, W - 59, 40):
        d.line([x, int(H * .55), x, H], fill=CARBON2)

    im.resize((W * 2, H * 2), Image.NEAREST).save(OUT / 'chasm.png', optimize=True)


def chamfer_frame(size, slice_tb, slice_lr, fill, outer, inner, tick, cut):
    """모서리를 비스듬히 깎은 HUD 판. 깎은 모서리·꺾쇠는 border-image 모서리 조각 안에 들어가게 slice보다 작게 둔다."""
    w, h = size
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    poly = [(cut, 0), (w - 1 - cut, 0), (w - 1, cut), (w - 1, h - 1 - cut), (w - 1 - cut, h - 1), (cut, h - 1), (0, h - 1 - cut), (0, cut)]
    if fill:
        d.polygon(poly, fill=fill)
    d.line(poly + [poly[0]], fill=outer, width=2)
    if inner:
        i = 4
        d.rectangle([i + cut // 2, i, w - 1 - i - cut // 2, h - 1 - i], outline=inner)
    if tick:
        L = min(slice_lr, slice_tb) - 3
        for (x, y, sx, sy) in ((2, 2, 1, 1), (w - 3, 2, -1, 1), (2, h - 3, 1, -1), (w - 3, h - 3, -1, -1)):
            d.line([x + sx * cut, y, x + sx * (cut + L), y], fill=tick)
            d.line([x, y + sy * cut, x, y + sy * (cut + L)], fill=tick)
    return im


def brackets(size, col, edge):
    """가운데가 빈 모서리 꺾쇠 액자."""
    w, h = size
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    L, t = 14, 3
    for (x, y, sx, sy) in ((0, 0, 1, 1), (w - 1, 0, -1, 1), (0, h - 1, 1, -1), (w - 1, h - 1, -1, -1)):
        for k in range(t):
            d.line([x, y + sy * k, x + sx * L, y + sy * k], fill=edge if k == t - 1 else col)
            d.line([x + sx * k, y, x + sx * k, y + sy * L], fill=edge if k == t - 1 else col)
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    backdrop()
    chamfer_frame((202, 55), 10, 24, (14, 17, 20, 255), (150, 160, 166, 255), (40, 47, 53, 255), GLOW + (255,), 6).save(OUT / 'ui_bar.png')
    chamfer_frame((313, 85), 16, 34, (238, 241, 243, 255), (18, 21, 24, 255), (185, 193, 198, 255), (18, 21, 24, 255), 8).save(OUT / 'ui_panel.png')
    brackets((102, 110), (150, 160, 166, 255), (18, 21, 24, 255)).save(OUT / 'ui_frame.png')
    scan = Image.new('RGBA', (1, 3), (0, 0, 0, 0))
    scan.putpixel((0, 2), (255, 255, 255, 10))
    scan.save(OUT / 'scan.png')
    print('ok:', ', '.join(p for p in ('chasm.png', 'ui_bar.png', 'ui_panel.png', 'ui_frame.png', 'scan.png')))


if __name__ == '__main__':
    main()
