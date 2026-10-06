#!/usr/bin/env python3
"""생성한 6×3 동작 시트를 고정 셀·공통 배율·바닥 기준으로 패킹한다."""
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
NAMES = ['knight', 'slime', 'bat', 'golem', 'shroom', 'boss']
CELL = 256

def build(name):
    source = ROOT / 'assets/illustrated/actions' / (name + '.png')
    sheet = Image.open(source).convert('RGBA')
    assert sheet.getchannel('A').getextrema()[0] == 0, f'{name}: 투명 배경 필요'
    frames = []
    for row in range(3):
        for col in range(6):
            tile = sheet.crop((round(col*sheet.width/6), round(row*sheet.height/3),
                               round((col+1)*sheet.width/6), round((row+1)*sheet.height/3)))
            box = tile.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox()
            assert box, f'{name}: 빈 프레임 {row},{col}'
            frames.append(tile.crop(box))
    # 사망 프레임을 개별 확대하면 누운 캐릭터가 갑자기 커진다. 한 배율만 공유한다.
    scale = min((CELL-12)/max(f.width for f in frames), (CELL-12)/max(f.height for f in frames))
    atlas = Image.new('RGBA', (CELL*6, CELL*3))
    for i, frame in enumerate(frames):
        frame = frame.resize((round(frame.width*scale), round(frame.height*scale)), Image.Resampling.LANCZOS)
        atlas.paste(frame, (i%6*CELL+(CELL-frame.width)//2, i//6*CELL+CELL-4-frame.height))
    target = ROOT / 'assets/game' / (name+'_actions.png')
    atlas.save(target, optimize=True)
    print(target.relative_to(ROOT), target.stat().st_size)

if __name__ == '__main__':
    for name in NAMES:
        build(name)
