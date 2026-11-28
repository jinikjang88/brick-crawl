#!/usr/bin/env python3
"""AI 생성 원본(.jpg/.png, 흰색 단색 또는 체커보드 배경)을 투명 PNG로 정제하고
모노크롬 사이버펑크 팔레트(무채색 + 화 #C1443C)로 정규화하여 assets/illustrated/에 배치한다.

동작 원리:
1. 외곽 테두리 픽셀에서 시작해 어두운 외곽선(벽: max(R,G,B) < 60)을 넘지 않는 선에서
   배경(흰색 단색 및 밝은 회색/흰색 체커보드)을 flood-fill로 투명화한다.
2. 캐릭터(codex, zero, compiler, holo, arm)의 닫힌 내부 구멍(케이블 사이, 팔과 몸통 사이 등)에 남은
   순백 배경 덩어리도 실제 발광 부위(모니터·와이어프레임 등)를 보호하며 투명화한다.
3. 가장자리의 반투명 흰색/회색 헤일로(JPEG 압축 링잉 포함)를 걷어내고 알파를 다듬는다.
4. 팔레트 규칙: 위험 효과/기체 센서(#C1443C 계열)가 허용된 에셋만 붉은색을 유지하고,
   나머지 픽셀의 미세한 황동/청색/보라 색조 편차는 명도를 유지한 채 무채색 범위(mx - mn <= 34)로 정규화한다.
"""
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART_SRC = Path(r"C:\Users\jinik\.gemini\antigravity-cli\brain\900d9350-d8e4-4db4-91b0-3b00e94cb569")
ILL = ROOT / "assets" / "illustrated"


def components(mask):
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        q = deque([(y0, x0)])
        seen[y0, x0] = True
        pts = []
        while q:
            y, x = q.popleft()
            pts.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        yield pts


def enforce_palette(rgba, allow_red=False, max_gray_chroma=34):
    """무채색(티타늄/상아) + 선택적 화(#C1443C) 팔레트 강제."""
    arr = rgba.copy()
    rgb = arr[..., :3].astype(np.float32)
    alpha = arr[..., 3] > 0
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    chroma = mx - mn

    is_red = allow_red & (r > g * 1.26) & (r > b * 1.26) & (r > 70)

    # 붉은색이 허용된 영역도 주황/분홍으로 튀지 않게 #C1443C 비율 쪽으로 부드럽게 정돈
    if allow_red and np.any(is_red & alpha):
        m = is_red & alpha
        lum = 0.299 * r[m] + 0.587 * g[m] + 0.114 * b[m]
        # 목표 화색 비율 (193, 68, 60) -> 밝기에 비례하되 R > G*1.35, R > B*1.35 보장
        nr = np.clip(r[m] * 0.85 + lum * 0.35, 75, 238)
        ng = np.clip(np.minimum(g[m], nr / 1.42), 20, 125)
        nb = np.clip(np.minimum(b[m], nr / 1.48), 20, 118)
        rgb[m, 0], rgb[m, 1], rgb[m, 2] = nr, ng, nb

    # 비-적색 픽셀 중 채도가 max_gray_chroma를 넘는 픽셀은 명도를 유지하며 무채색(차가운 티타늄/상아)으로 수렴
    non_red = alpha & (~is_red) & (chroma > max_gray_chroma)
    if np.any(non_red):
        lum = 0.299 * r[non_red] + 0.587 * g[non_red] + 0.114 * b[non_red]
        scale = (max_gray_chroma * 0.75) / np.maximum(chroma[non_red], 1.0)
        for ch in range(3):
            rgb[non_red, ch] = np.clip(lum + (rgb[non_red, ch] - lum) * scale, 0, 255)

    # 만약 allow_red=False 인데 붉은 기운(r > g*1.22 and r > b*1.22)이 조금이라도 있으면 완전 무채색화
    if not allow_red:
        red_leak = alpha & (rgb[..., 0] > rgb[..., 1] * 1.18) & (rgb[..., 0] > rgb[..., 2] * 1.18)
        if np.any(red_leak):
            lum = (0.299 * rgb[red_leak, 0] + 0.587 * rgb[red_leak, 1] + 0.114 * rgb[red_leak, 2])
            rgb[red_leak, 0] = lum
            rgb[red_leak, 1] = lum
            rgb[red_leak, 2] = np.clip(lum + 2, 0, 255)

    arr[..., :3] = np.round(rgb).astype(np.uint8)
    return arr


def remove_bg_outlined(im_rgb, is_checker=False, hole_min_area=None, keep_boxes=()):
    """검은 외곽선 안쪽 피사체를 보존하고 바깥 흰색/체커보드 배경 및 내부 배경 구멍을 제거한다."""
    rgb = np.asarray(im_rgb.convert("RGB")).astype(np.int32)
    h, w, _ = rgb.shape
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = mx - mn

    if is_checker:
        # 체커보드 배경은 중간 회색(~135-225)과 흰색(~230-255) 무채색 격자이고,
        # 아이템 본체는 진한 카본 블랙 외곽선(mx < 70)으로 완전히 둘러싸여 있다.
        bg_like = (mn >= 128) & (sat <= 28)
    else:
        # 순백 단색 배경 (JPEG 노이즈 감안)
        bg_like = (mn >= 225) & (sat <= 26)

    bg = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bg_like[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if bg_like[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))

    while q:
        y, x = q.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx] and bg_like[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))

    # 닫힌 내부 홀(케이블 사이 등) 순백 배경 제거
    if hole_min_area is not None:
        inner_white = (~bg) & (mn >= 242) & (sat <= 16)
        for pts in components(inner_white):
            if len(pts) < hole_min_area:
                continue
            ys, xs = zip(*pts)
            bx0, by0, bx1, by1 = min(xs), min(ys), max(xs), max(ys)
            # 보호 영역(모니터 화면 등)과 겹치면 보존
            if any(not (bx1 < kx0 or bx0 > kx1 or by1 < ky0 or by0 > ky1) for kx0, ky0, kx1, ky1 in keep_boxes):
                continue
            bg[ys, xs] = True

    # 배경에 맞닿은 밝은 안티에일리어싱/JPEG 링잉 테두리 2픽셀 정리 (외곽선 바깥 헤일로 제거)
    for thresh in (195, 165):
        near = np.zeros_like(bg)
        near[1:] |= bg[:-1]
        near[:-1] |= bg[1:]
        near[:, 1:] |= bg[:, :-1]
        near[:, :-1] |= bg[:, 1:]
        halo = near & (~bg) & (mn >= thresh) & (sat <= 28)
        bg |= halo

    alpha = np.where(bg, 0, 255).astype(np.uint8)
    rgba = np.dstack([rgb.astype(np.uint8), alpha])

    # 아주 작은 외부 먼지 픽셀(넓이 < 25px) 정리 (단, zero나 stone처럼 부유 파편이 있는 캐릭터는 작은 먼지만)
    fg = rgba[..., 3] > 0
    for pts in components(fg):
        if len(pts) < 18:
            ys, xs = zip(*pts)
            rgba[ys, xs] = 0

    return rgba


def process_all():
    # 1. 캐릭터 5종 (흰 배경 단색)
    char_jobs = [
        # (파일, 출력명, 내부홀 최소크기, 보호박드리스트 (x0,y0,x1,y1))
        ("codex_v3_1795701070120.jpg", "codex", 140, [(580, 350, 735, 475)]),  # 우측 하얀 터미널 화면 보호
        ("zero_v2_1795701049973.jpg", "zero", 450, [(420, 70, 560, 220), (360, 200, 660, 960)]),  # 머리/갑옷 하이라이트 보호
        ("compiler_1795701155316.jpg", "compiler", 220, [(140, 690, 340, 910)]),  # 와이어프레임 큐브 보호
        ("holo_1795701164359.jpg", "holo", 180, [(360, 95, 558, 860), (558, 280, 665, 425)]),  # 몸통·어깨 보호, 팔-허리 사이(x>560, y>425) 흰 구멍 제거
        ("arm_1795701162621.jpg", "arm", 60, [(160, 640, 256, 815)]),  # 왼손 데이터 블록(x<=256)만 보호, 집게 안쪽 흰 구멍 제거
    ]
    for fname, out_name, hole_min, keeps in char_jobs:
        im = Image.open(ART_SRC / fname)
        rgba = remove_bg_outlined(im, is_checker=False, hole_min_area=hole_min, keep_boxes=keeps)
        rgba = enforce_palette(rgba, allow_red=True, max_gray_chroma=36)
        out_p = ILL / "characters" / f"{out_name}.png"
        Image.fromarray(rgba, "RGBA").save(out_p, optimize=True)
        ys, xs = np.nonzero(rgba[..., 3] > 0)
        print(f"[char] {out_p.relative_to(ROOT)}  size={im.size}  bbox=({xs.min()},{ys.min()},{xs.max()},{ys.max()})")

    # 2. 배경 chasm.png (불투명 9:17 비율로 크롭·정규화)
    chasm_im = Image.open(ART_SRC / "chasm_1795701167564.jpg").convert("RGBA")
    cw, ch = chasm_im.size
    # 9:17 비율 맞추기 (가로 기준으로 세로가 약간 짧으면 좌우를 미세 크롭해 9:17 정확히 일치)
    target_w = round(ch * 9 / 17)
    if target_w < cw:
        x0 = (cw - target_w) // 2
        chasm_im = chasm_im.crop((x0, 0, x0 + target_w, ch))
    chasm_rgba = enforce_palette(np.asarray(chasm_im), allow_red=True, max_gray_chroma=28)
    out_chasm = ILL / "chasm.png"
    Image.fromarray(chasm_rgba[..., :3], "RGB").save(out_chasm, optimize=True)
    print(f"[bg]   {out_chasm.relative_to(ROOT)}  size={chasm_rgba.shape[1]}x{chasm_rgba.shape[0]}")

    # 3. 아이템 7종 (흰 배경 또는 체커보드 배경)
    item_jobs = [
        ("orb_basic_1795701156115.jpg", "orb_basic", False, False),
        ("orb_venom_1795701158208.jpg", "orb_venom", True, True),
        ("orb_rust_1795701160340.jpg", "orb_rust", True, False),
        ("relic_whetstone_1795701163147.jpg", "relic_whetstone", True, False),
        ("relic_combo_1795701162144.jpg", "relic_combo", True, False),
        ("relic_counter_1795701162962.jpg", "relic_counter", True, False),
        ("relic_kingsword_1795701168377.jpg", "relic_kingsword", True, False),
    ]
    for fname, out_name, checker, allow_red in item_jobs:
        im = Image.open(ART_SRC / fname)
        rgba = remove_bg_outlined(im, is_checker=checker, hole_min_area=None)
        rgba = enforce_palette(rgba, allow_red=allow_red, max_gray_chroma=34)
        out_p = ILL / "items" / f"{out_name}.png"
        Image.fromarray(rgba, "RGBA").save(out_p, optimize=True)
        ys, xs = np.nonzero(rgba[..., 3] > 0)
        print(f"[item] {out_p.relative_to(ROOT)}  bbox=({xs.min()},{ys.min()},{xs.max()},{ys.max()})")


if __name__ == "__main__":
    process_all()
