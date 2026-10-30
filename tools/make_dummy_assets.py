#!/usr/bin/env python3
"""시나리오 "마지막 번개"용 더미 그림을 assets/game에 만든다.

진짜 그림이 오기 전까지 자리만 채운다. 같은 파일 이름으로 진짜 그림을 넣으면 코드는 바꿀 필요가 없다.
목록·크기·쓰는 곳은 docs/assets/DUMMY.md. 이미 진짜 그림이 있으면 덮어쓰지 않는다(--force로 강제).

실행: python3 tools/make_dummy_assets.py [--force]
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'game'
FORCE = '--force' in sys.argv
INK, INK2, PAPER, LINE = (27, 26, 24, 255), (91, 87, 80, 255), (249, 246, 239, 255), (163, 158, 147, 255)


def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow 10.1 미만은 크기를 못 고른다
        return ImageFont.load_default()


def label(d, w, y, text, size):
    f = font(size)
    tw = d.textlength(text, font=f)
    d.text(((w - tw) / 2, y), text, fill=INK, font=f)


def char(name, text, shape):
    """전투 화면 인물·보스: 투명 바탕에 회색 실루엣 + 이름. 발밑이 그림 아래 끝에 닿게 둔다(ART_FOOT 기준)"""
    w, h = 220, 220
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if shape == 'person':
        d.ellipse((80, 20, 140, 80), fill=LINE, outline=INK, width=5)
        d.rounded_rectangle((60, 84, 160, 216), 18, fill=LINE, outline=INK, width=5)
    elif shape == 'eye':
        d.ellipse((14, 40, 206, 200), fill=LINE, outline=INK, width=6)
        d.ellipse((80, 90, 140, 150), fill=INK2, outline=INK, width=5)
    else:  # 기계
        d.rectangle((30, 50, 190, 216), fill=LINE, outline=INK, width=6)
        d.rectangle((60, 80, 160, 120), fill=PAPER, outline=INK, width=4)
    label(d, w, 160 if shape != 'eye' else 196, text, 20)
    label(d, w, 6, 'DUMMY', 16)
    return im


def face(text):
    """대사 초상: 44px로 줄여 쓰므로 96px 정사각 + 큰 머리글자"""
    im = Image.new('RGBA', (96, 96), PAPER)
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 95, 95), outline=INK, width=4)
    d.ellipse((28, 14, 68, 54), fill=LINE, outline=INK, width=3)
    d.rectangle((20, 58, 76, 92), fill=LINE, outline=INK, width=3)
    label(d, 96, 62, text, 18)
    return im


ITEMS = {
    'rick': lambda: char('rick', 'RICK', 'person'),
    'boss_sentinel': lambda: char('boss_sentinel', 'SENTINEL', 'machine'),
    'boss_cotech': lambda: char('boss_cotech', 'COTECH', 'machine'),
    'boss_gemidi': lambda: char('boss_gemidi', 'GEMIDI', 'machine'),
    'boss_klad': lambda: char('boss_klad', 'KLAD', 'person'),
    'boss_omnis': lambda: char('boss_omnis', 'OMNIS', 'eye'),
    'boss_rule0': lambda: char('boss_rule0', 'RULE 0', 'eye'),
    'face_rick': lambda: face('RICK'),
    'face_lina': lambda: face('LINA'),
    'face_yun': lambda: face('YUN'),
    'face_cotech': lambda: face('COTE'),
    'face_gemidi': lambda: face('GEMI'),
    'face_klad': lambda: face('KLAD'),
    'face_omnis': lambda: face('OMNI'),
}

for name, make in ITEMS.items():
    p = OUT / f'{name}.png'
    if p.exists() and not FORCE:
        print('있음, 건너뜀:', p.relative_to(ROOT))
        continue
    make().save(p, optimize=True)
    print('만듦:', p.relative_to(ROOT))
