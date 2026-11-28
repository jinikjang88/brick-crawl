#!/usr/bin/env python3
"""기체·보스 13종 및 대화 초상화(리나 2종 + 기체·보스 10종)를 고밀도 모노크롬 서브컬처 셀화(Cel-Shading) 일러스트로 생성한다.

- 화풍: 원신 / 젠레스 존 제로 / 명조 스타일의 날카로운 먹선(가변 필압·내부 장갑 분할선)과
  3D 곡면 법선 기반 4단계 셀 명암 + 사선 금속 스페큘러 + 림라이트(내부 2048×2048 슈퍼샘플링 → 1024×1024 LANCZOS).
- 리깅 정합성: tools/build_cyber_actions.py 의 각 캐릭터 파츠 다각형(parts_spec)·관절 피벗(pivot)·2-Bone IK 관절(H, K, A) 좌표계와
  1:1로 일치하도록 설계하여 50프레임 스켈레탈 애니메이션에서 끊김이나 조각 분리가 생기지 않는다.
- 색 규칙(AGENTS.md): 카본 블랙·건메탈·티타늄 실버·상아/은백 발광 + 적 위험 표시용 화(#C1443C) 단일 강조색.
  순백(min>=250) 면적 제한(check_assets.py WHITE_OK)을 지키기 위해 최고 휘도 발광색은 (242, 246, 248)을 기본으로 쓴다.
"""
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
CHAR_DIR = ROOT / 'assets' / 'illustrated' / 'characters'
PORT_DIR = ROOT / 'assets' / 'illustrated' / 'portraits'

SS = 2  # 2048×2048 슈퍼샘플링 → 1024×1024

INK = (10, 12, 15, 255)
CARBON_DEEP = (15, 18, 22, 255)
CARBON = (22, 26, 32, 255)
CARBON_HI = (36, 43, 52, 255)
GUN_SH = (38, 45, 54, 255)
GUN = (54, 63, 74, 255)
GUN_HI = (82, 94, 107, 255)
TITAN_SH = (104, 115, 126, 255)
TITAN = (148, 160, 171, 255)
SILVER = (194, 204, 213, 255)
IVORY_DEEP = (152, 149, 142, 255)
IVORY_SH = (184, 180, 171, 255)
IVORY = (218, 214, 205, 255)
IVORY_HI = (235, 233, 226, 255)
GLOW = (242, 246, 248, 255)  # min=242 (<250 이므로 WHITE_OK 오탐 원천 방지)

RED_DEEP = (82, 22, 20, 255)
RED_DARK = (128, 38, 34, 255)
RED = (193, 68, 60, 255)
RED_HI = (232, 108, 96, 255)
RED_CORE = (244, 182, 174, 255)

# 재질별 4단계 애니메 셀 램프 (Core Shadow, Midtone, Lit Plane, Specular, Rim)
RAMP_CARBON = (CARBON_DEEP, CARBON, CARBON_HI, GUN_HI, GUN)
RAMP_GUN    = (CARBON, GUN, GUN_HI, TITAN, TITAN_SH)
RAMP_TITAN  = (GUN, TITAN_SH, TITAN, SILVER, GLOW)
RAMP_SILVER = (TITAN_SH, TITAN, SILVER, GLOW, GLOW)
RAMP_IVORY  = (IVORY_DEEP, IVORY_SH, IVORY, IVORY_HI, GLOW)
RAMP_WHITE  = (TITAN_SH, IVORY_SH, IVORY_HI, GLOW, GLOW)
RAMP_RED    = (RED_DEEP, RED_DARK, RED, RED_HI, RED_CORE)


def P(pts):
    return [(round(x * SS), round(y * SS)) for x, y in pts]


def B(x0, y0, x1, y1):
    return [round(x0 * SS), round(y0 * SS), round(x1 * SS), round(y1 * SS)]


def new_cv():
    im = Image.new('RGBA', (1024 * SS, 1024 * SS), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def catmull_rom(pts, subdiv=10, closed=True):
    """제어점 리스트를 부드러운 곡선 다각형(Catmull-Rom Spline)으로 보간한다."""
    n = len(pts)
    if n < 3:
        return list(pts)
    out = []
    cnt = n if closed else n - 1
    for i in range(cnt):
        p0 = pts[(i - 1) % n] if closed else pts[max(0, i - 1)]
        p1 = pts[i]
        p2 = pts[(i + 1) % n] if closed else pts[min(n - 1, i + 1)]
        p3 = pts[(i + 2) % n] if closed else pts[min(n - 1, i + 2)]
        for s in range(subdiv):
            t = s / subdiv
            t2 = t * t
            t3 = t2 * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t
                       + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                       + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t
                       + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                       + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    if not closed:
        out.append(pts[-1])
    return out


def chamfer_poly(pts, ratio=0.16):
    """직선 다각형의 꼭짓점을 메카닉 베벨(모따기)로 깎아 세련된 하드서피스 실루엣으로 만든다."""
    n = len(pts)
    out = []
    for i in range(n):
        p_prev = pts[(i - 1) % n]
        p_curr = pts[i]
        p_next = pts[(i + 1) % n]
        ax = p_curr[0] + (p_prev[0] - p_curr[0]) * ratio
        ay = p_curr[1] + (p_prev[1] - p_curr[1]) * ratio
        bx = p_curr[0] + (p_next[0] - p_curr[0]) * ratio
        by = p_curr[1] + (p_next[1] - p_curr[1]) * ratio
        out.extend([(ax, ay), (bx, by)])
    return out


def save_char(im, name):
    CHAR_DIR.mkdir(parents=True, exist_ok=True)
    lo = im.resize((1024, 1024), Image.LANCZOS)
    arr = np.array(lo)
    arr[arr[..., 3] <= 36] = 0
    edge = (arr[..., 3] > 36) & (arr[..., 3] < 215)
    arr[edge, :3] = (arr[edge, :3] * 0.42).astype(np.uint8)
    arr[arr[..., 3] > 36, 3] = 255
    out_im = Image.fromarray(arr, 'RGBA')
    out_p = CHAR_DIR / f'{name}.png'
    out_im.save(out_p, optimize=True)
    print(f'[cel-char] {out_p.relative_to(ROOT)}')
    return out_im


def cel_part(im, pts, ramp=RAMP_IVORY, outline_w=8, bevel=18, sheen=True, seams=None, rivets=None, smooth=False, chamfer=0.0):
    """다각형/곡선 파츠에 3D 베벨 법선 기반 4단계 서브컬처 셀 명암 + 사선 광택 + 패널 분할선 + 리벳을 입힌다."""
    if smooth:
        pts = catmull_rom(pts, subdiv=9, closed=True)
    elif chamfer > 0.0:
        pts = chamfer_poly(pts, ratio=chamfer)

    sp = P(pts)
    xs = [p[0] for p in sp]
    ys = [p[1] for p in sp]
    pad = (outline_w + 8) * SS
    W, H = im.size
    x0 = max(0, min(xs) - pad)
    y0 = max(0, min(ys) - pad)
    x1 = min(W, max(xs) + pad + 1)
    y1 = min(H, max(ys) + pad + 1)
    if x1 <= x0 + 2 or y1 <= y0 + 2:
        return

    bw, bh = x1 - x0, y1 - y0
    local_pts = [(x - x0, y - y0) for x, y in sp]

    mask_im = Image.new('L', (bw, bh), 0)
    md = ImageDraw.Draw(mask_im)
    md.polygon(local_pts, fill=255)
    mask = np.array(mask_im) > 127
    if not mask.any():
        return

    # 부드러운 베벨 높이장으로부터 곡면 법선 추정 + 전역 곡률 혼합
    blur_im = mask_im.filter(ImageFilter.GaussianBlur(radius=max(2, bevel * SS * 0.55)))
    hf = np.array(blur_im, dtype=np.float32) / 255.0
    gy, gx = np.gradient(hf)
    # 내부로 갈수록 높이가 커지므로 외향 법선은 (-gx, -gy)
    nx_b = -gx * (bevel * SS * 0.42)
    ny_b = -gy * (bevel * SS * 0.42)

    yy, xx = np.mgrid[0:bh, 0:bw].astype(np.float32)
    ys_m, xs_m = np.nonzero(mask)
    cx = float(xs_m.mean())
    cy = float(ys_m.mean())
    rx = max(12.0, (xs_m.max() - xs_m.min()) * 0.52)
    ry = max(12.0, (ys_m.max() - ys_m.min()) * 0.52)
    nx_g = (xx - cx) / rx
    ny_g = (yy - cy) / ry

    nx = nx_b * 0.62 + nx_g * 0.52
    ny = ny_b * 0.62 + ny_g * 0.52
    nz = np.sqrt(np.maximum(0.08, 1.0 - np.clip(nx * nx + ny * ny, 0.0, 0.92)))
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx /= norm
    ny /= norm
    nz /= norm

    # 주광원: 좌상단 전면 (-0.56, -0.62, 0.55)
    ndotl = nx * (-0.56) + ny * (-0.62) + nz * 0.55

    c_sh, c_mid, c_lit, c_spec, c_rim = [np.array(c[:3], dtype=np.uint8) for c in ramp]
    rgb = np.zeros((bh, bw, 3), dtype=np.uint8)
    rgb[:] = c_mid

    # 4단계 날카로운 셀 양자화
    rgb[ndotl < 0.06] = c_sh
    rgb[ndotl >= 0.34] = c_lit
    rgb[ndotl >= 0.66] = c_spec

    # 서브컬처 메탈릭 사선 광택 띠 (Sheen Slash)
    if sheen:
        diag = ((xx - cx) * 0.72 + (yy - cy) * 0.68) / max(24.0, (rx + ry) * 0.5)
        slash = (np.abs(diag + 0.24) < 0.095) & (ndotl > 0.20) & (hf > 0.55)
        slash2 = (np.abs(diag + 0.42) < 0.035) & (ndotl > 0.20) & (hf > 0.55)
        rgb[slash | slash2] = c_spec

    # 우하단 역광 림라이트 (Rim Light)
    rim_dot = nx * 0.68 + ny * 0.62
    rim_mask = (hf > 0.22) & (hf < 0.76) & (rim_dot > 0.46) & (ndotl < 0.14)
    rgb[rim_mask] = c_rim

    rgba = np.zeros((bh, bw, 4), dtype=np.uint8)
    rgba[mask, :3] = rgb[mask]
    rgba[mask, 3] = 255
    part_im = Image.fromarray(rgba, 'RGBA')
    pd = ImageDraw.Draw(part_im)

    # 내부 장갑 패널 분할선 (어두운 홈 + 1px 하이라이트 엣지)
    if seams:
        for s_pts in seams:
            lp = [(round(px * SS) - x0, round(py * SS) - y0) for px, py in s_pts]
            lp_hi = [(px + SS, py + SS) for px, py in lp]
            pd.line(lp_hi, fill=tuple(c_spec.tolist()) + (190,), width=max(2, 2 * SS), joint='curve')
            pd.line(lp, fill=INK, width=max(3, 4 * SS), joint='curve')

    # 메카닉 육각 볼트 / 리벳 디테일
    if rivets:
        rr = 3 * SS
        for rx_p, ry_p in rivets:
            lx = round(rx_p * SS) - x0
            ly = round(ry_p * SS) - y0
            pd.ellipse([lx - rr - SS, ly - rr - SS, lx + rr + SS, ly + rr + SS], fill=INK)
            pd.ellipse([lx - rr, ly - rr, lx + rr, ly + rr], fill=tuple(c_sh.tolist()) + (255,))
            pd.ellipse([lx - rr + SS, ly - rr + SS, lx, ly], fill=tuple(c_spec.tolist()) + (255,))

    # 클리핑 유지(패널선이 바깥으로 삐져나오지 않게 마스크 재적용) 후 외곽 먹선 드로잉
    part_arr = np.array(part_im)
    part_arr[~mask, 3] = 0
    part_im = Image.fromarray(part_arr, 'RGBA')
    pd = ImageDraw.Draw(part_im)
    if outline_w > 0:
        pd.line(local_pts + [local_pts[0]], fill=INK, width=outline_w * SS, joint='curve')

    im.alpha_composite(part_im, (x0, y0))


def cel_mech_limb(im, p0, p1, w0, w1, ramp=RAMP_IVORY, piston=True, joint_r=26):
    """유압 실린더·장갑 챔퍼·패널라인을 갖춘 고디테일 메카닉/안드로이드 사지 파츠."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    L = max(1e-5, math.hypot(dx, dy))
    ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    if nx * (-0.6) + ny * (-0.8) < 0:
        nx, ny = -nx, -ny

    d = ImageDraw.Draw(im)
    # 보조 유압 피스톤 로드 (외측 평행 실린더)
    if piston and L > 85 and w0 >= 20:
        off0 = w0 * 0.82
        off1 = w1 * 0.82
        pa = (p0[0] - nx * off0 + ux * 16, p0[1] - ny * off0 + uy * 16)
        pb = (p1[0] - nx * off1 - ux * 16, p1[1] - ny * off1 - uy * 16)
        pm = ((pa[0] + pb[0]) * 0.52, (pa[1] + pb[1]) * 0.52)
        d.line(P([pa, pb]), fill=INK, width=14 * SS, joint='curve')
        d.line(P([pa, pb]), fill=SILVER, width=6 * SS, joint='curve')
        d.line(P([pa, pm]), fill=INK, width=18 * SS, joint='curve')
        d.line(P([pa, pm]), fill=GUN_HI, width=10 * SS, joint='curve')

    # 테이퍼드 팔각 장갑 외피 다각형
    c0 = min(18.0, L * 0.12)
    pts = [
        (p0[0] + ux * c0 + nx * w0, p0[1] + uy * c0 + ny * w0),
        (p0[0] + ux * (L * 0.46) + nx * (w0 * 0.72 + w1 * 0.28 + 4), p0[1] + uy * (L * 0.46) + ny * (w0 * 0.72 + w1 * 0.28 + 4)),
        (p1[0] - ux * c0 + nx * w1, p1[1] - uy * c0 + ny * w1),
        (p1[0] + ux * 4 + nx * (w1 * 0.48), p1[1] + uy * 4 + ny * (w1 * 0.48)),
        (p1[0] + ux * 4 - nx * (w1 * 0.48), p1[1] + uy * 4 - ny * (w1 * 0.48)),
        (p1[0] - ux * c0 - nx * w1, p1[1] - uy * c0 - ny * w1),
        (p0[0] + ux * (L * 0.52) - nx * (w0 * 0.62 + w1 * 0.38), p0[1] + uy * (L * 0.52) - ny * (w0 * 0.62 + w1 * 0.38)),
        (p0[0] + ux * c0 - nx * w0, p0[1] + uy * c0 - ny * w0),
        (p0[0] - ux * 4 - nx * (w0 * 0.52), p0[1] - uy * 4 - ny * (w0 * 0.52)),
        (p0[0] - ux * 4 + nx * (w0 * 0.52), p0[1] - uy * 4 + ny * (w0 * 0.52)),
    ]
    mid_a = (p0[0] + ux * (L * 0.48) + nx * w0 * 0.9, p0[1] + uy * (L * 0.48) + ny * w0 * 0.9)
    mid_b = (p0[0] + ux * (L * 0.52) - nx * w0 * 0.9, p0[1] + uy * (L * 0.52) - ny * w0 * 0.9)
    seams = [[mid_a, mid_b]] if L > 95 else None
    rivets = [(p0[0] + ux * (L * 0.24), p0[1] + uy * (L * 0.24)),
              (p0[0] + ux * (L * 0.74), p0[1] + uy * (L * 0.74))] if w0 >= 26 else None
    cel_part(im, pts, ramp=ramp, outline_w=7, bevel=14, sheen=True, seams=seams, rivets=rivets)

    if joint_r:
        cel_joint(im, p0[0], p0[1], joint_r)


def cel_joint(im, cx, cy, r, ramp=RAMP_GUN):
    """기계식 로터리 관절 베어링 허브."""
    pts = [(cx + math.cos(math.radians(a)) * r, cy + math.sin(math.radians(a)) * r) for a in range(0, 360, 15)]
    cel_part(im, pts, ramp=ramp, outline_w=6, bevel=10, sheen=False)
    d = ImageDraw.Draw(im)
    ri = r * 0.54
    d.ellipse(B(cx - ri, cy - ri, cx + ri, cy + ri), fill=CARBON, outline=INK, width=4 * SS)
    d.arc(B(cx - ri * 0.75, cy - ri * 0.75, cx + ri * 0.75, cy + ri * 0.75), start=195, end=330, fill=SILVER, width=3 * SS)
    rc = r * 0.22
    d.ellipse(B(cx - rc, cy - rc, cx + rc, cy + rc), fill=TITAN, outline=INK, width=3 * SS)


def cel_red_eye(im, cx, cy, rx, ry=None, flare=True):
    """다중 조리개 링 + 루비 굴절 코어 + 렌즈 플레어를 갖춘 고밀도 적색 광학 센서."""
    ry = ry or rx
    d = ImageDraw.Draw(im)
    # 외곽 장갑 하우징 베젤
    bezel = [(cx + math.cos(math.radians(a)) * (rx + 9), cy + math.sin(math.radians(a)) * (ry + 9)) for a in range(0, 360, 15)]
    cel_part(im, bezel, ramp=RAMP_CARBON, outline_w=6, bevel=8, sheen=False)

    # 어두운 루비 오목 렌즈 베이스
    d.ellipse(B(cx - rx, cy - ry, cx + rx, cy + ry), fill=RED_DEEP, outline=INK, width=5 * SS)
    # 조리개 기계 분할선 6각
    if rx >= 28:
        for k in range(6):
            ang = math.radians(k * 60 + 15)
            x_a = cx + math.cos(ang) * rx * 0.42
            y_a = cy + math.sin(ang) * ry * 0.42
            x_b = cx + math.cos(ang) * rx * 0.96
            y_b = cy + math.sin(ang) * ry * 0.96
            d.line(P([(x_a, y_a), (x_b, y_b)]), fill=INK, width=3 * SS)

    # 하단 반사 크레센트 & 중앙 발광 홍채
    d.pieslice(B(cx - rx * 0.86, cy - ry * 0.86, cx + rx * 0.86, cy + ry * 0.86), start=20, end=160, fill=RED_HI)
    d.ellipse(B(cx - rx * 0.72, cy - ry * 0.72, cx + rx * 0.72, cy + ry * 0.72), fill=RED, outline=RED_DARK, width=3 * SS)
    d.ellipse(B(cx - rx * 0.42, cy - ry * 0.42, cx + rx * 0.42, cy + ry * 0.42), fill=RED_HI)
    d.ellipse(B(cx - rx * 0.20, cy - ry * 0.20, cx + rx * 0.20, cy + ry * 0.20), fill=RED_CORE)
    # 좌상단 유리 스페큘러 하이라이트
    hx, hy = cx - rx * 0.36, cy - ry * 0.36
    hrx, hry = max(4, rx * 0.22), max(4, ry * 0.18)
    d.ellipse(B(hx - hrx, hy - hry, hx + hrx, hy + hry), fill=GLOW)
    if flare and rx >= 34:
        d.line(P([(cx - rx * 1.25, cy), (cx + rx * 1.25, cy)]), fill=RED_HI, width=3 * SS)
        d.line(P([(cx - rx * 0.65, cy), (cx + rx * 0.65, cy)]), fill=RED_CORE, width=5 * SS)


def cel_visor_slit(im, pts, glow_left=True):
    """날카로운 장갑 슬릿형 적색 광학 바이저."""
    cel_part(im, pts, ramp=RAMP_RED, outline_w=6, bevel=8, sheen=True)
    d = ImageDraw.Draw(im)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    cx = (min(xs) * 0.65 + max(xs) * 0.35) if glow_left else (min(xs) * 0.35 + max(xs) * 0.65)
    cy = (min(ys) + max(ys)) * 0.5
    w = (max(xs) - min(xs)) * 0.26
    h = (max(ys) - min(ys)) * 0.28
    d.ellipse(B(cx - w, cy - h, cx + w, cy + h), fill=RED_CORE)


def cel_cable(im, p0, p1, sag, w=15, armored=True):
    """분절 차폐 슬리브가 달린 고밀도 사이버네틱 케이블."""
    d = ImageDraw.Draw(im)
    pts = []
    steps = 28
    for i in range(steps + 1):
        u = i / steps
        x = p0[0] + (p1[0] - p0[0]) * u
        y = p0[1] + (p1[1] - p0[1]) * u + sag * 4 * u * (1 - u)
        pts.append((x, y))
    sp = P(pts)
    d.line(sp, fill=INK, width=(w + 10) * SS, joint='curve')
    d.line(sp, fill=CARBON_HI, width=w * SS, joint='curve')
    d.line(P([(x - w * 0.18, y - w * 0.24) for x, y in pts]), fill=TITAN_SH, width=max(3, w // 3) * SS, joint='curve')
    if armored:
        for i in range(3, steps - 2, 4):
            x, y = pts[i]
            dx = pts[i + 1][0] - pts[i - 1][0]
            dy = pts[i + 1][1] - pts[i - 1][1]
            L = max(1e-5, math.hypot(dx, dy))
            nx, ny = -dy / L * (w * 0.56), dx / L * (w * 0.56)
            d.line(P([(x - nx, y - ny), (x + nx, y + ny)]), fill=INK, width=3 * SS)


# ─────────────────────────────────────────────────────────────────────────────
# 1. 나노 슬러지 (sludge) — 액체크롬 자성 페로플루이드 괴체
# ─────────────────────────────────────────────────────────────────────────────
def draw_sludge():
    im, d = new_cv()
    # 4방향 날카로운 자성 크롬 결정 스파이크 군집 (spikes_tl, spikes_tr, spikes_bl, spikes_br)
    spikes = [
        [(395, 375), (275, 295), (195, 140), (315, 275), (295, 195), (375, 315)],
        [(645, 365), (735, 270), (842, 148), (760, 305), (865, 255), (725, 395)],
        [(265, 610), (92, 532), (215, 635), (102, 682), (248, 720)],
        [(755, 615), (928, 540), (805, 648), (912, 698), (762, 735)],
    ]
    for sp in spikes:
        cel_part(im, sp, ramp=RAMP_TITAN, outline_w=7, bevel=12, sheen=True)

    # 하단 물결치는 페로플루이드 점액 웅덩이 (base)
    base_pts = [
        (105, 855), (155, 782), (285, 755), (512, 748), (735, 758),
        (875, 785), (928, 862), (865, 916), (685, 928), (512, 934), (335, 926), (168, 914)
    ]
    cel_part(im, base_pts, ramp=RAMP_CARBON, outline_w=9, bevel=22, sheen=True, smooth=True)

    # 중앙 유기적 돔형 액체금속 본체 (body) + 자력선 주름
    body_pts = [
        (212, 788), (192, 635), (228, 475), (322, 342), (455, 278),
        (605, 286), (732, 378), (798, 525), (806, 675), (778, 788), (512, 812)
    ]
    seams = [
        catmull_rom([(255, 685), (355, 615), (515, 635), (715, 695)], subdiv=8, closed=False),
        catmull_rom([(285, 505), (415, 425), (615, 445), (745, 545)], subdiv=8, closed=False),
    ]
    cel_part(im, body_pts, ramp=RAMP_GUN, outline_w=9, bevel=34, sheen=True, seams=seams, smooth=True)

    # 표면에 반쯤 파묻힌 폐회로 기판 조각들
    cel_part(im, [(292, 565), (362, 535), (382, 598), (312, 624)], ramp=RAMP_SILVER, outline_w=5, bevel=8)
    cel_part(im, [(662, 612), (732, 592), (746, 652), (676, 672)], ramp=RAMP_TITAN, outline_w=5, bevel=8)

    # 붉은 나노 코어 안구 2개 (주 코어 + 좌측 보조 코어)
    cel_red_eye(im, 548, 492, 72, 68, flare=True)
    cel_red_eye(im, 452, 525, 28, 25, flare=False)
    return save_char(im, 'sludge')


# ─────────────────────────────────────────────────────────────────────────────
# 2. 경비 드론 (drone) — V-윙 전술 요격 스텔스 드론
# ─────────────────────────────────────────────────────────────────────────────
def draw_drone():
    im, d = new_cv()
    # 후면 보조 벡터 핀 날개 (wing_ll, wing_lr — hull 깊숙이 결합)
    cel_part(im, [(365, 445), (210, 480), (225, 568), (365, 522)], ramp=RAMP_GUN, outline_w=7, bevel=12,
             seams=[[(235, 515), (355, 485)]], chamfer=0.10)
    cel_part(im, [(535, 425), (928, 418), (870, 568), (535, 520)], ramp=RAMP_GUN, outline_w=7, bevel=14,
             seams=[[(560, 472), (885, 478)], [(745, 422), (722, 545)]], rivets=[(845, 448), (825, 525)], chamfer=0.08)

    # 하부 유압 스태빌라이저 & 3발 탈론 집게발 (claw_b, pelvis, claw_l, claw_r)
    cel_mech_limb(im, (545, 575), (595, 765), 22, 9, ramp=RAMP_CARBON, piston=False, joint_r=18)
    cel_part(im, [(332, 515), (578, 515), (542, 652), (355, 652)], ramp=RAMP_GUN, outline_w=8, bevel=16,
             seams=[[(350, 582), (555, 582)]], rivets=[(375, 548), (525, 548)], chamfer=0.14)
    cel_mech_limb(im, (352, 610), (318, 758), 22, 14, ramp=RAMP_TITAN, piston=False, joint_r=20)
    cel_mech_limb(im, (318, 758), (355, 868), 14, 5, ramp=RAMP_IVORY, piston=False, joint_r=14)
    cel_mech_limb(im, (485, 610), (455, 768), 22, 14, ramp=RAMP_TITAN, piston=False, joint_r=20)
    cel_mech_limb(im, (455, 768), (492, 876), 14, 5, ramp=RAMP_IVORY, piston=False, joint_r=14)

    # 상부 전진익 에어로 블레이드 날개 (wing_ul, wing_ur)
    cel_part(im, [(368, 338), (88, 212), (138, 328), (268, 404), (372, 388)], ramp=RAMP_IVORY, outline_w=8, bevel=16,
             seams=[[(135, 258), (355, 362)], [(225, 275), (205, 362)]], rivets=[(295, 348)], chamfer=0.08)
    cel_part(im, [(548, 342), (968, 212), (918, 338), (668, 416), (548, 392)], ramp=RAMP_IVORY, outline_w=8, bevel=18,
             seams=[[(568, 368), (925, 258)], [(765, 275), (785, 378)]], rivets=[(615, 355), (855, 268)], chamfer=0.08)

    # 중앙 다면체 스텔스 센서 포드 동체 (body) + 좌측 적색 헌터 스캐너 렌즈
    hull = [(302, 398), (358, 292), (532, 288), (602, 382), (568, 528), (332, 528)]
    cel_part(im, hull, ramp=RAMP_CARBON, outline_w=9, bevel=22,
             seams=[[(358, 292), (485, 525)], [(485, 355), (592, 382)]],
             rivets=[(518, 322), (545, 488)], chamfer=0.14)
    cel_red_eye(im, 402, 414, 54, 48, flare=True)
    return save_char(im, 'drone')


# ─────────────────────────────────────────────────────────────────────────────
# 3. 방벽 가디언 (guardian) — 중장갑 아이기스 라이엇 메카
# ─────────────────────────────────────────────────────────────────────────────
def draw_guardian():
    im, d = new_cv()
    # 양다리 중장갑 각반 & 스태빌라이저 부츠 (ik_legs 일치)
    cel_mech_limb(im, (395, 565), (335, 720), 50, 40, ramp=RAMP_GUN, piston=True, joint_r=34)
    cel_mech_limb(im, (335, 720), (355, 920), 46, 52, ramp=RAMP_IVORY, piston=True, joint_r=38)
    cel_part(im, [(252, 902), (422, 902), (435, 960), (242, 960)], ramp=RAMP_CARBON, outline_w=8, bevel=14, chamfer=0.16)

    cel_mech_limb(im, (575, 565), (610, 725), 50, 42, ramp=RAMP_GUN, piston=True, joint_r=34)
    cel_mech_limb(im, (610, 725), (635, 940), 48, 54, ramp=RAMP_IVORY, piston=True, joint_r=38)
    cel_part(im, [(542, 922), (712, 922), (725, 982), (532, 982)], ramp=RAMP_CARBON, outline_w=8, bevel=14, chamfer=0.16)

    # 골반 스커트 장갑 (pelvis) & 등 배기 매니폴드 스택
    cel_part(im, [(368, 482), (612, 482), (582, 618), (398, 618)], ramp=RAMP_IVORY, outline_w=8, bevel=18,
             seams=[[(488, 485), (488, 615)], [(385, 545), (595, 545)]], chamfer=0.14)
    cel_part(im, [(562, 175), (668, 108), (722, 162), (625, 258)], ramp=RAMP_CARBON, outline_w=8, bevel=14,
             seams=[[(595, 205), (692, 138)]], chamfer=0.12)

    # 흉부 경사 반응장갑 (torso) + 중앙 적색 원자로 터빈
    cel_part(im, [(338, 242), (632, 242), (608, 496), (362, 496)], ramp=RAMP_IVORY, outline_w=9, bevel=24,
             seams=[[(348, 335), (622, 335)], [(365, 425), (605, 425)], [(532, 245), (518, 492)]],
             rivets=[(378, 278), (588, 278), (568, 462)], chamfer=0.14)
    cel_red_eye(im, 452, 368, 40, 40, flare=True)

    # 전술 바이저 헬멧 (head) + 안테나 블레이드
    cel_part(im, [(498, 125), (548, 68), (566, 132)], ramp=RAMP_TITAN, outline_w=6, bevel=8)
    cel_part(im, [(392, 118), (558, 118), (574, 252), (475, 280), (386, 248)], ramp=RAMP_TITAN, outline_w=8, bevel=18,
             seams=[[(395, 155), (562, 155)], [(475, 212), (475, 276)]], chamfer=0.14)
    cel_visor_slit(im, [(394, 174), (522, 174), (510, 204), (394, 204)], glow_left=True)

    # 좌측 중장갑 폴드론 & 전완 리액티브 버클러 (shoulder_l, buckler_l)
    cel_part(im, [(182, 248), (272, 176), (364, 202), (338, 358), (192, 358)], ramp=RAMP_SILVER, outline_w=8, bevel=20,
             seams=[[(205, 298), (345, 288)]], rivets=[(228, 328), (312, 232)], chamfer=0.12)
    cel_mech_limb(im, (275, 345), (235, 520), 40, 36, ramp=RAMP_CARBON, piston=False, joint_r=28)
    cel_part(im, [(150, 362), (248, 374), (208, 828), (82, 796)], ramp=RAMP_GUN, outline_w=9, bevel=20,
             seams=[[(135, 515), (232, 528)], [(115, 668), (218, 682)]],
             rivets=[(178, 408), (145, 765)], chamfer=0.08)

    # 우측 거대 폴드론 & 타워 발리스틱 라이엇 실드 (shoulder_r, shield_r)
    cel_part(im, [(592, 195), (748, 172), (838, 265), (818, 378), (622, 368)], ramp=RAMP_SILVER, outline_w=9, bevel=22,
             seams=[[(615, 295), (822, 312)]], rivets=[(652, 228), (782, 338)], chamfer=0.12)
    cel_part(im, [(732, 368), (948, 414), (878, 868), (672, 818)], ramp=RAMP_TITAN, outline_w=9, bevel=26,
             seams=[[(715, 528), (928, 572)], [(695, 682), (902, 725)], [(825, 392), (762, 838)]],
             rivets=[(758, 412), (912, 445), (705, 785), (852, 822)], chamfer=0.08)
    # 타워 실드 관측 슬릿
    cel_part(im, [(768, 452), (892, 478), (886, 504), (762, 478)], ramp=RAMP_CARBON, outline_w=5, bevel=6)
    return save_char(im, 'guardian')


# ─────────────────────────────────────────────────────────────────────────────
# 4. 오염 살포기 (disperser) — 4족 보행 바이오해저드 공성 살포 워커
# ─────────────────────────────────────────────────────────────────────────────
def draw_disperser():
    im, d = new_cv()
    # 후방 보조 스파이더 다리 2개
    cel_mech_limb(im, (385, 645), (355, 760), 22, 16, ramp=RAMP_CARBON, piston=False, joint_r=20)
    cel_mech_limb(im, (355, 760), (365, 895), 16, 8, ramp=RAMP_GUN, piston=False, joint_r=16)
    cel_mech_limb(im, (545, 620), (555, 760), 24, 16, ramp=RAMP_CARBON, piston=False, joint_r=20)
    cel_mech_limb(im, (555, 760), (555, 940), 16, 8, ramp=RAMP_GUN, piston=False, joint_r=16)

    # 전방 주 유압 스파이더 다리 2개 (ik_legs 일치)
    cel_mech_limb(im, (335, 620), (195, 645), 30, 24, ramp=RAMP_GUN, piston=True, joint_r=26)
    cel_mech_limb(im, (195, 645), (115, 900), 26, 10, ramp=RAMP_IVORY, piston=True, joint_r=24)
    cel_mech_limb(im, (625, 620), (775, 650), 30, 24, ramp=RAMP_GUN, piston=True, joint_r=26)
    cel_mech_limb(im, (775, 650), (865, 895), 26, 10, ramp=RAMP_IVORY, piston=True, joint_r=24)

    # 하부 회전 터렛 링 섀시 (pelvis)
    cel_part(im, [(312, 528), (648, 528), (618, 658), (342, 658)], ramp=RAMP_CARBON, outline_w=8, bevel=18,
             seams=[[(328, 588), (632, 588)]], rivets=[(362, 558), (595, 558)], chamfer=0.14)
    cel_red_eye(im, 432, 596, 28, 24, flare=False)

    # 상부 곡면 가압 케미컬 돔 카라페이스 (head)
    dome = [(222, 458), (268, 272), (398, 188), (585, 186), (748, 255), (822, 378), (824, 505), (568, 538), (262, 518)]
    seams = [
        catmull_rom([(252, 422), (485, 392), (812, 438)], subdiv=8, closed=False),
        catmull_rom([(625, 198), (668, 365), (652, 528)], subdiv=8, closed=False),
    ]
    cel_part(im, dome, ramp=RAMP_IVORY, outline_w=9, bevel=30, sheen=True, seams=seams,
             rivets=[(312, 465), (695, 478), (745, 365)], smooth=True)

    # 상단 적색 소각 배기 루버 슬릿 3열
    for vx in (358, 448, 538):
        cel_visor_slit(im, [(vx, 292), (vx + 56, 292), (vx + 46, 346), (vx - 10, 346)], glow_left=True)

    # 전방 대구경 분사 노즐 포신 2문 (nozzle_l, nozzle_r)
    cel_part(im, [(94, 466), (278, 452), (278, 546), (94, 534)], ramp=RAMP_GUN, outline_w=8, bevel=14,
             seams=[[(152, 460), (152, 538)], [(218, 456), (218, 542)]], chamfer=0.08)
    cel_red_eye(im, 98, 500, 16, 28, flare=False)
    cel_part(im, [(412, 462), (514, 462), (504, 554), (422, 554)], ramp=RAMP_TITAN, outline_w=7, bevel=12,
             seams=[[(418, 508), (508, 508)]], chamfer=0.12)
    return save_char(im, 'disperser')


# ─────────────────────────────────────────────────────────────────────────────
# 5. 1층 보스: 센티넬 하이브-01 (sentinel) — 4족 지휘 요새 메카
# ─────────────────────────────────────────────────────────────────────────────
def draw_sentinel():
    im, d = new_cv()
    # 등 고전압 방열 블레이드 핀 어레이 4기 (fins)
    for fx, fy in ((432, 112), (522, 92), (612, 106), (702, 134)):
        cel_part(im, [(fx, fy), (fx + 60, fy - 14), (fx + 34, 278), (fx - 26, 278)],
                 ramp=RAMP_TITAN, outline_w=7, bevel=12, seams=[[(fx + 18, fy + 15), (fx - 2, 265)]], chamfer=0.10)

    # 후방 보조 다리 2개 + 전방 중장갑 다리 2개 (ik_legs 일치)
    cel_mech_limb(im, (385, 645), (355, 770), 26, 20, ramp=RAMP_CARBON, piston=False, joint_r=22)
    cel_mech_limb(im, (355, 770), (365, 910), 20, 14, ramp=RAMP_GUN, piston=False, joint_r=18)
    cel_mech_limb(im, (545, 620), (555, 770), 26, 20, ramp=RAMP_CARBON, piston=False, joint_r=22)
    cel_mech_limb(im, (555, 770), (555, 945), 20, 14, ramp=RAMP_GUN, piston=False, joint_r=18)

    cel_mech_limb(im, (335, 620), (195, 650), 38, 30, ramp=RAMP_GUN, piston=True, joint_r=30)
    cel_mech_limb(im, (195, 650), (115, 920), 34, 22, ramp=RAMP_IVORY, piston=True, joint_r=28)
    cel_part(im, [(58, 896), (166, 896), (176, 944), (48, 944)], ramp=RAMP_CARBON, outline_w=7, bevel=10, chamfer=0.15)

    cel_mech_limb(im, (625, 620), (775, 655), 38, 30, ramp=RAMP_GUN, piston=True, joint_r=30)
    cel_mech_limb(im, (775, 655), (865, 915), 34, 22, ramp=RAMP_IVORY, piston=True, joint_r=28)
    cel_part(im, [(812, 890), (918, 890), (928, 940), (802, 940)], ramp=RAMP_CARBON, outline_w=7, bevel=10, chamfer=0.15)

    # 골반 섀시 & 다면 경사 장갑 콕핏 (pelvis, torso)
    cel_part(im, [(302, 532), (658, 532), (628, 658), (332, 658)], ramp=RAMP_CARBON, outline_w=8, bevel=18,
             seams=[[(480, 536), (480, 654)], [(322, 595), (638, 595)]], chamfer=0.14)
    cel_part(im, [(262, 365), (342, 242), (638, 242), (708, 365), (668, 548), (292, 548)], ramp=RAMP_IVORY, outline_w=9, bevel=26,
             seams=[[(285, 455), (685, 455)], [(528, 245), (508, 545)]],
             rivets=[(368, 278), (585, 278), (325, 505), (625, 505)], chamfer=0.12)

    # 전면 좌측 붉은 타겟팅 레이저 바이저! (좌우 기준표: 렌즈 왼쪽!)
    cel_part(im, [(276, 366), (462, 366), (444, 422), (270, 418)], ramp=RAMP_CARBON, outline_w=7, bevel=8, chamfer=0.12)
    cel_visor_slit(im, [(288, 378), (448, 378), (434, 410), (284, 408)], glow_left=True)
    cel_red_eye(im, 342, 394, 18, 15, flare=True)

    # 양어깨 다연장 마이크로 미사일 포드 (pod_l, pod_r)
    cel_part(im, [(132, 202), (338, 192), (348, 338), (142, 338)], ramp=RAMP_GUN, outline_w=8, bevel=16,
             seams=[[(138, 232), (342, 224)]], chamfer=0.12)
    for mx in (172, 226, 280):
        for my in (262, 304):
            d.ellipse(B(mx - 15, my - 15, mx + 15, my + 15), fill=CARBON_DEEP, outline=INK, width=5 * SS)
            d.ellipse(B(mx - 8, my - 8, mx + 8, my + 8), fill=TITAN_SH)

    cel_part(im, [(592, 202), (828, 212), (818, 418), (592, 398)], ramp=RAMP_GUN, outline_w=9, bevel=18,
             seams=[[(595, 236), (825, 245)]], chamfer=0.12)
    for my in (268, 320, 372):
        for mx in (644, 706, 768):
            d.ellipse(B(mx - 15, my - 15, mx + 15, my + 15), fill=CARBON_DEEP, outline=INK, width=5 * SS)
            d.ellipse(B(mx - 8, my - 8, mx + 8, my + 8), fill=TITAN_SH)
    return save_char(im, 'sentinel')


# ─────────────────────────────────────────────────────────────────────────────
# 6. 2층 보스: 코테크 (codex) — 현수형 메인프레임 AI 코어 & 해방 모니터
# ─────────────────────────────────────────────────────────────────────────────
def draw_codex():
    im, d = new_cv()
    # 상부 현수 장갑 광케이블 다발 & 하부 냉각 케이블
    for x0, x1 in ((232, 402), (305, 435), (635, 585), (765, 625), (885, 655)):
        cel_cable(im, (x0, 35), (x1, 255), sag=38, w=16, armored=True)
    for x0, x1 in ((432, 418), (515, 515), (598, 608)):
        cel_cable(im, (x0, 715), (x1, 858), sag=24, w=14, armored=True)

    # 상단 자성 서스펜션 링 (ring)
    d.ellipse(B(342, 46, 728, 160), outline=INK, width=30 * SS)
    d.ellipse(B(349, 53, 721, 153), outline=TITAN, width=16 * SS)
    d.arc(B(349, 53, 721, 153), start=190, end=335, fill=GLOW, width=7 * SS)

    # 좌우 정밀 컴파일러 로봇 암 (arm_l, arm_r)
    cel_mech_limb(im, (315, 520), (205, 675), 32, 24, ramp=RAMP_GUN, piston=True, joint_r=26)
    cel_mech_limb(im, (205, 675), (235, 845), 24, 14, ramp=RAMP_IVORY, piston=False, joint_r=22)
    cel_mech_limb(im, (655, 515), (795, 685), 34, 26, ramp=RAMP_GUN, piston=True, joint_r=28)
    cel_mech_limb(im, (795, 685), (735, 875), 26, 16, ramp=RAMP_IVORY, piston=False, joint_r=24)

    # 중앙 팔각 서버 모놀리스 코어 (core)
    hull = [(305, 232), (645, 212), (698, 332), (678, 738), (322, 738), (282, 362)]
    seams = [
        [(292, 332), (692, 318)],
        [(308, 585), (682, 585)],
        [(535, 222), (535, 732)],
    ]
    cel_part(im, hull, ramp=RAMP_CARBON, outline_w=9, bevel=26, seams=seams,
             rivets=[(338, 275), (618, 262), (355, 695), (642, 695)], chamfer=0.10)
    # 서버 랙 냉각 슬릿 디테일
    for sy in (622, 652, 682):
        d.line(P([(358, sy), (498, sy)]), fill=GUN_HI, width=5 * SS)

    # 좌측 전면 거대 적색 오버라이드 안구! (좌우 기준표: 눈 왼쪽!)
    cel_red_eye(im, 418, 448, 80, 80, flare=True)

    # 우측 보조 백색 코드 모니터! (해방된 본래 자아 — 좌우 기준표: 우측 백색 모니터!)
    cel_part(im, [(572, 342), (748, 332), (758, 478), (582, 488)], ramp=RAMP_SILVER, outline_w=8, bevel=14, chamfer=0.10)
    cel_part(im, [(594, 364), (730, 356), (738, 458), (602, 466)], ramp=RAMP_CARBON, outline_w=5, bevel=8, sheen=False)
    wave = [(610, 414), (630, 414), (642, 380), (656, 444), (670, 388), (684, 426), (698, 412), (722, 412)]
    d.line(P(wave), fill=TITAN, width=9 * SS, joint='curve')
    d.line(P(wave), fill=GLOW, width=4 * SS, joint='curve')
    return save_char(im, 'codex')


# ─────────────────────────────────────────────────────────────────────────────
# 7. 3층 보스: 제미디 (gemini) — 백자/흑요석 이중 페르소나 사이버 대천사
# ─────────────────────────────────────────────────────────────────────────────
def draw_gemini():
    im, d = new_cv()
    # 기하학 프리즘 헤일로 링 (halo — 어깨와 맞물려 단일 컴포넌트 유지!)
    d.ellipse(B(224, 164, 776, 456), outline=INK, width=28 * SS)
    d.ellipse(B(231, 171, 769, 449), outline=SILVER, width=14 * SS)
    d.arc(B(231, 171, 769, 449), start=195, end=340, fill=GLOW, width=6 * SS)
    for px, py in ((232, 305), (768, 305), (325, 195), (675, 195)):
        cel_part(im, [(px, py - 28), (px + 26, py), (px, py + 28), (px - 26, py)], ramp=RAMP_WHITE, outline_w=6, bevel=8)

    # 하단 우아한 광섬유 드레스 촉수 다발 (cables_b, cables_f)
    for off, end_x in ((-62, 222), (-32, 285), (-4, 362), (26, 452), (58, 545), (90, 628)):
        cel_cable(im, (505 + off * 0.48, 622), (end_x, 936 - abs(off) * 0.35), sag=68, w=15, armored=True)

    # 양팔 (좌측 순백 백자 팔 / 우측 흑요석 카본 팔)
    cel_mech_limb(im, (385, 415), (330, 565), 30, 22, ramp=RAMP_WHITE, piston=False, joint_r=26)
    cel_mech_limb(im, (330, 565), (312, 775), 22, 12, ramp=RAMP_SILVER, piston=False, joint_r=20)
    cel_mech_limb(im, (635, 420), (675, 575), 30, 22, ramp=RAMP_CARBON, piston=False, joint_r=26)
    cel_mech_limb(im, (675, 575), (705, 775), 22, 12, ramp=RAMP_GUN, piston=False, joint_r=20)

    # 분절 코르셋 아머 흉부 (좌반신 백자, 우반신 흑요석)
    cel_part(im, [(378, 355), (512, 355), (512, 646), (422, 635), (398, 495)], ramp=RAMP_WHITE, outline_w=8, bevel=20,
             seams=[[(395, 455), (512, 468)], [(412, 545), (512, 555)]], smooth=True)
    cel_part(im, [(512, 355), (642, 355), (622, 495), (598, 635), (512, 646)], ramp=RAMP_CARBON, outline_w=8, bevel=20,
             seams=[[(512, 468), (625, 455)], [(512, 555), (608, 545)]], smooth=True)

    # 좌측 온화한 백자 안드로이드 가면 (head_light: x=385..515)
    face_l = [(394, 178), (438, 118), (512, 124), (512, 338), (448, 340), (402, 286)]
    cel_part(im, face_l, ramp=RAMP_WHITE, outline_w=8, bevel=22, smooth=True)
    # 조각 같은 감은 속눈썹·콧날·입술 디테일
    d.arc(B(412, 210, 488, 242), start=12, end=168, fill=INK, width=6 * SS)
    d.line(P([(412, 228), (402, 222)]), fill=INK, width=5 * SS)
    d.arc(B(414, 188, 488, 214), start=195, end=345, fill=TITAN_SH, width=4 * SS)
    d.line(P([(486, 225), (478, 266), (492, 272)]), fill=TITAN_SH, width=4 * SS, joint='curve')
    d.arc(B(456, 286, 504, 306), start=10, end=170, fill=INK, width=5 * SS)

    # 우측 냉혹한 흑요석 가면 + 적색 광학 슬릿 & 우흉부 적색 코어! (head_dark: x=512..645 — 좌우 기준표: 붉은 표식 오른쪽!)
    face_r = [(512, 124), (588, 118), (642, 178), (634, 288), (578, 342), (512, 338)]
    cel_part(im, face_r, ramp=RAMP_CARBON, outline_w=8, bevel=22,
             seams=[[(522, 275), (625, 255)]], chamfer=0.10)
    d.polygon(P([(524, 208), (632, 196), (622, 248), (528, 248)]), fill=RED, outline=INK, width=5 * SS)
    d.polygon(P([(542, 216), (618, 208), (612, 232), (545, 234)]), fill=RED_HI)
    # 우측 흑요석 흉갑의 적색 싱귤래리티 크리스탈 (오른쪽 비대칭 정체성 강화)
    cryst_r = [(566, 392), (598, 432), (566, 482), (536, 432)]
    d.polygon(P(cryst_r), fill=RED, outline=INK, width=6 * SS)
    d.polygon(P([(566, 404), (586, 432), (566, 464)]), fill=RED_HI)
    return save_char(im, 'gemini')


# ─────────────────────────────────────────────────────────────────────────────
# 8. 4층 보스: 클라드 (claude) — 양자 아카이브 철학자 안드로이드 (붉은 표식 없음!)
# ─────────────────────────────────────────────────────────────────────────────
def draw_claude():
    im, d = new_cv()
    # 중앙 플루팅 양자 모놀리스 기둥 (monolith)
    cel_part(im, [(222, 425), (478, 425), (498, 956), (202, 956)], ramp=RAMP_CARBON, outline_w=9, bevel=24,
             seams=[[(272, 432), (258, 950)], [(350, 580), (350, 950)], [(428, 432), (442, 950)]], chamfer=0.06)

    # 고전 조각상풍 사이버 철학자 흉상 & 하이칼라 망토 장갑 (bust)
    cel_part(im, [(212, 328), (262, 252), (398, 252), (448, 328), (438, 448), (222, 448)], ramp=RAMP_IVORY, outline_w=8, bevel=22,
             seams=[[(245, 295), (330, 385), (415, 295)], [(330, 385), (330, 445)]], chamfer=0.12)
    head = [(266, 126), (330, 82), (394, 122), (404, 218), (362, 274), (298, 274), (258, 212)]
    cel_part(im, head, ramp=RAMP_WHITE, outline_w=8, bevel=22, smooth=True)
    # 고요한 백색 발광 안구 & 이마 서클릿 각인 (적색 일절 없음!)
    d.line(P([(272, 142), (330, 128), (388, 142)]), fill=TITAN_SH, width=4 * SS, joint='curve')
    for ex in (298, 356):
        d.ellipse(B(ex - 18, 166, ex + 18, 186), fill=GLOW, outline=INK, width=5 * SS)
    d.line(P([(326, 182), (320, 218), (332, 224)]), fill=TITAN_SH, width=4 * SS, joint='curve')
    d.line(P([(308, 244), (350, 244)]), fill=INK, width=4 * SS)

    # 가슴 백색 안전 제어 코어 구체
    core_pts = [(350 + math.cos(math.radians(a)) * 54, 520 + math.sin(math.radians(a)) * 54) for a in range(0, 360, 15)]
    cel_part(im, core_pts, ramp=RAMP_SILVER, outline_w=8, bevel=16)
    d.ellipse(B(316, 486, 384, 554), fill=GLOW, outline=INK, width=5 * SS)

    # 4개의 부유 방화벽 모놀리스 방패 (에너지 브리지로 좌2·우2 연결 -> 총 3컴포넌트 유지!)
    d.line(P([(55, 425), (180, 365)]), fill=INK, width=14 * SS)
    d.line(P([(55, 425), (180, 365)]), fill=SILVER, width=6 * SS)
    d.line(P([(545, 505), (665, 435)]), fill=INK, width=14 * SS)
    d.line(P([(545, 505), (665, 435)]), fill=SILVER, width=6 * SS)

    shields = [
        [(18, 255), (96, 245), (96, 615), (18, 605)],
        [(122, 235), (238, 225), (238, 488), (122, 478)],
        [(478, 375), (618, 365), (618, 642), (478, 632)],
        [(640, 285), (690, 278), (690, 582), (640, 575)],
    ]
    for sp in shields:
        mx = (sp[0][0] + sp[1][0]) * 0.5
        my0 = (sp[0][1] + sp[3][1]) * 0.36
        my1 = (sp[0][1] + sp[3][1]) * 0.68
        cel_part(im, sp, ramp=RAMP_TITAN, outline_w=8, bevel=16,
                 seams=[[(sp[0][0] + 8, my0), (sp[1][0] - 8, my0)], [(mx, sp[0][1] + 12), (mx, sp[3][1] - 12)],
                        [(sp[0][0] + 8, my1), (sp[1][0] - 8, my1)]], chamfer=0.06)
    return save_char(im, 'claude')


# ─────────────────────────────────────────────────────────────────────────────
# 9. 5층 최종 보스: OMNIS (omnis) — 궤도 자이로 가속기 & 전지전능 조리개 코어
# ─────────────────────────────────────────────────────────────────────────────
def draw_omnis():
    im, d = new_cv()
    # 하부 중장갑 전력 트렁크 케이블 6가닥
    for x0, x1 in ((335, 282), (395, 362), (455, 445)):
        cel_cable(im, (x0, 645), (x1, 938), sag=48, w=18, armored=True)
    for x0, x1 in ((535, 568), (605, 668), (675, 768)):
        cel_cable(im, (x0, 635), (x1, 948), sag=56, w=18, armored=True)

    # 외곽 정밀 자이로 가속기 링 (gimbal) + 측면 베어링 허브
    d.ellipse(B(232, 102, 838, 748), outline=INK, width=44 * SS)
    d.ellipse(B(241, 111, 829, 739), outline=IVORY, width=24 * SS)
    d.arc(B(241, 111, 829, 739), start=192, end=332, fill=GLOW, width=10 * SS)
    for ang in range(0, 360, 30):
        r_a = math.radians(ang)
        x_a = 535 + math.cos(r_a) * 286
        y_a = 425 + math.sin(r_a) * 306
        x_b = 535 + math.cos(r_a) * 302
        y_b = 425 + math.sin(r_a) * 322
        d.line(P([(x_a, y_a), (x_b, y_b)]), fill=INK, width=4 * SS)
    cel_joint(im, 805, 425, 58, ramp=RAMP_IVORY)

    # 내부 측지선(Geodesic) 중장갑 구체 (shell)
    shell_pts = [(490 + math.cos(math.radians(a)) * 236, 430 + math.sin(math.radians(a)) * 236) for a in range(0, 360, 10)]
    seams = [
        catmull_rom([(262, 430), (490, 365), (718, 430)], subdiv=10, closed=False),
        catmull_rom([(272, 495), (490, 555), (708, 495)], subdiv=10, closed=False),
        catmull_rom([(490, 198), (545, 430), (490, 662)], subdiv=10, closed=False),
    ]
    cel_part(im, shell_pts, ramp=RAMP_IVORY, outline_w=10, bevel=42, sheen=True, seams=seams,
             rivets=[(585, 275), (645, 365), (625, 535), (545, 605)])

    # 우하반부 카본 방열 장갑 구획 대비
    dark_cap = [(490 + math.cos(math.radians(a)) * 230, 430 + math.sin(math.radians(a)) * 230) for a in range(-25, 135, 10)] + [(490, 430)]
    cel_part(im, dark_cap, ramp=RAMP_CARBON, outline_w=8, bevel=24,
             seams=[[(515, 435), (695, 515)]], rivets=[(595, 475), (545, 575)])

    # 좌측 거대 적색 레이저 조리개 안구 코어! (좌우 기준표: 붉은 렌즈 왼쪽!)
    cel_red_eye(im, 385, 415, 108, 108, flare=True)
    return save_char(im, 'omnis')


# ─────────────────────────────────────────────────────────────────────────────
# 10. 진 최종 보스: 아키텍트 제로 (zero) — 초월 사이버 세라핌 & 8익 가속기 블레이드
# ─────────────────────────────────────────────────────────────────────────────
def draw_zero():
    im, d = new_cv()
    # 좌우 8익 부유 가속기 블레이드 날개 (PARTS['zero']=18 허용!)
    l_shards = [
        [(355, 295), (98, 112), (148, 242), (335, 355)],
        [(340, 385), (82, 332), (132, 446), (325, 455)],
        [(335, 495), (112, 565), (172, 668), (340, 565)],
        [(355, 605), (192, 768), (262, 818), (365, 665)],
    ]
    r_shards = [
        [(615, 285), (918, 102), (868, 242), (635, 350)],
        [(630, 380), (938, 322), (888, 446), (645, 455)],
        [(635, 495), (898, 565), (838, 668), (630, 565)],
        [(615, 605), (808, 778), (738, 828), (605, 665)],
    ]
    for sp in l_shards + r_shards:
        mid_tip = ((sp[1][0] + sp[2][0]) * 0.5, (sp[1][1] + sp[2][1]) * 0.5)
        mid_root = ((sp[0][0] + sp[3][0]) * 0.5, (sp[0][1] + sp[3][1]) * 0.5)
        cel_part(im, sp, ramp=RAMP_WHITE, outline_w=7, bevel=14, seams=[[mid_root, mid_tip]], chamfer=0.06)

    # 슬렌더 초월 안드로이드 사지 & 동체 (legs, arm_l, arm_r, torso, head)
    cel_mech_limb(im, (455, 575), (415, 955), 32, 12, ramp=RAMP_CARBON, piston=False, joint_r=24)
    cel_mech_limb(im, (515, 575), (555, 955), 32, 12, ramp=RAMP_CARBON, piston=False, joint_r=24)
    cel_mech_limb(im, (395, 295), (335, 585), 26, 12, ramp=RAMP_SILVER, piston=False, joint_r=24)
    cel_mech_limb(im, (585, 285), (645, 595), 26, 12, ramp=RAMP_SILVER, piston=False, joint_r=24)

    # 세라핌 흉갑 (torso) + 육각 적색 싱귤래리티 코어
    cel_part(im, [(388, 252), (582, 252), (558, 435), (545, 588), (425, 588), (412, 435)], ramp=RAMP_CARBON, outline_w=8, bevel=20,
             seams=[[(408, 315), (562, 315)], [(422, 515), (548, 515)]], chamfer=0.12)
    hex_pts = [(468 + math.cos(math.radians(60 * k + 30)) * 68, 398 + math.sin(math.radians(60 * k + 30)) * 78) for k in range(6)]
    cel_part(im, hex_pts, ramp=RAMP_GUN, outline_w=7, bevel=10)
    cel_red_eye(im, 468, 398, 44, 50, flare=True)

    # 크라운 바이저 세라핌 헤드 (head)
    head = [(436, 102), (490, 62), (544, 102), (552, 196), (490, 228), (428, 196)]
    cel_part(im, head, ramp=RAMP_WHITE, outline_w=8, bevel=18, seams=[[(490, 66), (490, 128)]], chamfer=0.08)
    cel_red_eye(im, 478, 154, 18, 12, flare=True)
    return save_char(im, 'zero')


# ─────────────────────────────────────────────────────────────────────────────
# 11. 컴파일 드론 (compiler) — 궤도 패브리케이션 중공업 드론
# ─────────────────────────────────────────────────────────────────────────────
def draw_compiler():
    im, d = new_cv()
    # 하부 다관절 매니퓰레이터 암 + 등각 홀로그램 데이터 큐브 (단일 연결 유지)
    cel_mech_limb(im, (500, 595), (375, 735), 26, 20, ramp=RAMP_GUN, piston=True, joint_r=24)
    cel_mech_limb(im, (375, 735), (265, 785), 20, 14, ramp=RAMP_SILVER, piston=False, joint_r=18)
    cel_part(im, [(152, 702), (276, 682), (296, 816), (172, 836)], ramp=RAMP_WHITE, outline_w=8, bevel=14,
             seams=[[(182, 724), (262, 712), (272, 794), (192, 806)]], chamfer=0.08)

    # 우측 후방 추진 부스터 포드 (pod_r)
    cel_part(im, [(612, 282), (888, 304), (868, 616), (612, 586)], ramp=RAMP_GUN, outline_w=8, bevel=20,
             seams=[[(622, 395), (878, 412)], [(622, 495), (872, 512)], [(765, 295), (752, 602)]],
             rivets=[(835, 345), (822, 565)], chamfer=0.12)

    # 중앙 챔퍼드 패브리케이션 모듈 본체 (body) + 좌측 적색 광학 스캐너
    cel_part(im, [(272, 252), (638, 232), (658, 598), (292, 598)], ramp=RAMP_CARBON, outline_w=9, bevel=24,
             seams=[[(282, 328), (645, 312)], [(512, 240), (522, 595)], [(295, 525), (652, 525)]],
             rivets=[(318, 288), (595, 272), (585, 558)], chamfer=0.12)
    cel_red_eye(im, 378, 422, 56, 50, flare=True)
    return save_char(im, 'compiler')


# ─────────────────────────────────────────────────────────────────────────────
# 12. 홀로그램 잔상 (holo) — 위상 변이 사이버 팬텀 어새신
# ─────────────────────────────────────────────────────────────────────────────
def draw_holo():
    im, d = new_cv()
    # 우측 위상 잔상 에코 실루엣
    for seg in [((512, 295), (522, 895)), ((418, 355), (368, 645)), ((615, 350), (688, 660))]:
        d.line(P(seg), fill=GUN_HI, width=16 * SS, joint='curve')

    # 슬렌더 전투 안드로이드 사지 & 분절 장갑 동체
    cel_mech_limb(im, (465, 575), (445, 905), 24, 11, ramp=RAMP_SILVER, piston=False, joint_r=20)
    cel_mech_limb(im, (525, 575), (555, 905), 24, 11, ramp=RAMP_TITAN, piston=False, joint_r=20)
    cel_mech_limb(im, (385, 355), (335, 655), 22, 11, ramp=RAMP_WHITE, piston=False, joint_r=20)
    cel_mech_limb(im, (590, 350), (665, 665), 22, 11, ramp=RAMP_TITAN, piston=False, joint_r=20)

    cel_part(im, [(392, 302), (588, 302), (566, 445), (554, 586), (426, 586), (414, 445)], ramp=RAMP_WHITE, outline_w=8, bevel=18,
             seams=[[(408, 375), (572, 375)], [(490, 305), (490, 582)]], chamfer=0.12)
    cel_part(im, [(422, 115), (548, 115), (558, 258), (485, 290), (416, 256)], ramp=RAMP_WHITE, outline_w=8, bevel=18,
             seams=[[(424, 156), (552, 156)]], chamfer=0.12)
    cel_visor_slit(im, [(420, 180), (518, 180), (508, 212), (420, 212)], glow_left=True)

    # 홀로그램 주사선 간섭 무늬 (단일 실루엣 유지를 위해 불투명 강철 톤 변조)
    arr = np.array(im)
    for y in range(220 * SS, 900 * SS, 30 * SS):
        m = arr[y:y + 4 * SS, :, 3] > 140
        arr[y:y + 4 * SS, :, :3][m] = (74, 86, 98)
    return save_char(Image.fromarray(arr, 'RGBA'), 'holo')


# ─────────────────────────────────────────────────────────────────────────────
# 13. 코테크 작업 팔 (arm) — 천장 갠트리 중공업 유압 매니퓰레이터
# ─────────────────────────────────────────────────────────────────────────────
def draw_arm():
    im, d = new_cv()
    # 천장 I-빔 마운트 (mount)
    cel_part(im, [(552, 106), (858, 106), (828, 240), (582, 240)], ramp=RAMP_CARBON, outline_w=9, bevel=18,
             seams=[[(572, 168), (842, 168)], [(705, 110), (705, 236)]],
             rivets=[(605, 136), (805, 136)], chamfer=0.12)
    # 회전 터렛 어깨 하우징 (shoulder) + 좌측 적색 오버라이드 렌즈!
    cel_part(im, [(382, 232), (748, 222), (728, 428), (402, 418)], ramp=RAMP_GUN, outline_w=9, bevel=22,
             seams=[[(545, 228), (535, 422)], [(395, 365), (732, 372)]],
             rivets=[(585, 265), (695, 265), (685, 395)], chamfer=0.14)
    cel_red_eye(im, 455, 318, 46, 42, flare=True)

    # 상완 & 전완 유압 붐 (upper_arm, forearm)
    cel_mech_limb(im, (565, 385), (665, 610), 50, 40, ramp=RAMP_IVORY, piston=True, joint_r=38)
    cel_mech_limb(im, (665, 610), (355, 725), 44, 32, ramp=RAMP_IVORY, piston=True, joint_r=38)

    # 압축 데이터 큐브 & 상하 헤비 유압 클로
    cel_part(im, [(162, 662), (278, 652), (288, 808), (172, 818)], ramp=RAMP_WHITE, outline_w=8, bevel=14,
             seams=[[(192, 688), (255, 682), (262, 782), (198, 788)]], chamfer=0.08)
    cel_part(im, [(368, 684), (214, 622), (172, 668), (336, 716)], ramp=RAMP_TITAN, outline_w=8, bevel=12, chamfer=0.10)
    cel_part(im, [(368, 756), (224, 848), (182, 808), (336, 734)], ramp=RAMP_GUN, outline_w=8, bevel=12, chamfer=0.10)
    return save_char(im, 'arm')


# ─────────────────────────────────────────────────────────────────────────────
# 14. 대화 초상화 (HUD 단말기 배경 + 기체·보스 10종 + 리나 고밀도 서브컬처 셀화 2종)
# ─────────────────────────────────────────────────────────────────────────────
def make_terminal_bg(sz=512, hostile=False):
    S = sz * 2
    bg = Image.new('RGBA', (S, S), (15, 18, 22, 255))
    bd = ImageDraw.Draw(bg)
    # 미세 전술 그리드 & 코너 챔퍼 패널
    for g in range(64, S, 128):
        bd.line([(g, 0), (g, S)], fill=(23, 28, 34, 255), width=2)
        bd.line([(0, g), (S, g)], fill=(23, 28, 34, 255), width=2)
    bd.polygon([(0, S), (0, S - 280), (280, S)], fill=(22, 27, 33, 255))
    bd.polygon([(S, 0), (S - 280, 0), (S, 280)], fill=(22, 27, 33, 255))
    # 동심 조준 레티클 아크
    ring_col = (58, 30, 30, 255) if hostile else (32, 39, 46, 255)
    bd.ellipse([136, 136, S - 136, S - 136], outline=ring_col, width=4)
    bd.arc([96, 96, S - 96, S - 96], start=205, end=335, fill=ring_col, width=6)
    bd.arc([96, 96, S - 96, S - 96], start=25, end=155, fill=ring_col, width=6)
    # 사방 HUD 타겟팅 꺾쇠
    m, L = 34, 108
    br_col = (193, 68, 60, 255) if hostile else (162, 172, 182, 255)
    for sx, sy, dx, dy in [(m, m, 1, 1), (S - m, m, -1, 1), (m, S - m, 1, -1), (S - m, S - m, -1, -1)]:
        bd.line([(sx, sy), (sx + dx * L, sy)], fill=br_col, width=11)
        bd.line([(sx, sy), (sx, sy + dy * L)], fill=br_col, width=11)
    return bg.resize((sz, sz), Image.LANCZOS)


def save_crop_portrait(char_im, box, out_name, hostile=False):
    PORT_DIR.mkdir(parents=True, exist_ok=True)
    bg = make_terminal_bg(512, hostile=hostile)
    crop = char_im.crop(box).resize((464, 464), Image.LANCZOS)
    bg.alpha_composite(crop, (24, 24))
    out_p = PORT_DIR / f'portrait_{out_name}.png'
    bg.save(out_p, optimize=True)
    print(f'[cel-port] {out_p.relative_to(ROOT)}')


def draw_tapered_stroke(d, pts, w_start, w_end, col=INK):
    """끝으로 갈수록 날카롭게 가늘어지는 서브컬처 애니메이션 펜선(속눈썹·입매·옷주름용)."""
    curve = catmull_rom(pts, subdiv=12, closed=False)
    n = len(curve)
    left = []
    right = []
    for i, (x, y) in enumerate(curve):
        u = i / max(1, n - 1)
        w = (w_start * (1 - u) + w_end * u) * 0.5
        p_prev = curve[max(0, i - 1)]
        p_next = curve[min(n - 1, i + 1)]
        dx, dy = p_next[0] - p_prev[0], p_next[1] - p_prev[1]
        L = max(1e-5, math.hypot(dx, dy))
        nx, ny = -dy / L * w, dx / L * w
        left.append((x + nx, y + ny))
        right.append((x - nx, y - ny))
    d.polygon(left + right[::-1], fill=col)


def draw_anime_eye(d, cx, cy, ew, eh, warm=False, is_far=False):
    """원신 / 젠레스 존 제로 풍 다층 셀 채색 서브컬처 눈동자."""
    # 공막(흰자) + 상단 속눈썹 그림자
    eye_pts = catmull_rom([
        (cx - ew * 0.50, cy + eh * 0.06),
        (cx - ew * 0.24, cy - eh * 0.48),
        (cx + ew * 0.24, cy - eh * 0.46),
        (cx + ew * 0.50, cy + eh * 0.04),
        (cx + ew * 0.22, cy + eh * 0.48),
        (cx - ew * 0.24, cy + eh * 0.46),
    ], subdiv=8, closed=True)
    d.polygon(eye_pts, fill=GLOW)
    # 공막 상단 셀 음영
    sclera_sh = catmull_rom([
        (cx - ew * 0.48, cy - eh * 0.02),
        (cx - ew * 0.22, cy - eh * 0.48),
        (cx + ew * 0.26, cy - eh * 0.46),
        (cx + ew * 0.48, cy - eh * 0.02),
        (cx + ew * 0.15, cy - eh * 0.16),
        (cx - ew * 0.18, cy - eh * 0.16),
    ], subdiv=6, closed=True)
    d.polygon(sclera_sh, fill=SILVER)

    # 다층 홍채 (좌측 3/4 시선 오프셋)
    ix = cx - ew * 0.06
    iy = cy + (0 if warm else eh * 0.04)
    irx = ew * (0.33 if is_far else 0.34)
    iry = eh * 0.44
    d.ellipse([ix - irx, iy - iry, ix + irx, iy + iry], fill=INK)
    d.ellipse([ix - irx + 5, iy - iry + 5, ix + irx - 5, iy + iry - 5], fill=CARBON_HI if not warm else GUN)
    # 홍채 하단 발광 반달 그라데이션 밴드
    d.pieslice([ix - irx + 7, iy - iry + 7, ix + irx - 7, iy + iry - 7], start=15, end=165,
               fill=SILVER if warm else TITAN)
    # 중앙 동공
    prx, pry = irx * 0.46, iry * 0.46
    d.ellipse([ix - prx, iy - pry + 2, ix + prx, iy + pry + 2], fill=INK)
    # 동공 위 밝은 서브컬처 아치 림
    if warm:
        d.arc([ix - prx - 4, iy - pry - 2, ix + prx + 4, iy + pry + 8], start=20, end=160, fill=GLOW, width=5)

    # 좌상단 메인 스페큘러 하이라이트 + 우하단 보조 캐치라이트
    hx, hy = ix - irx * 0.46, iy - iry * 0.38
    hr = irx * (0.34 if warm else 0.28)
    d.ellipse([hx - hr, hy - hr * 0.85, hx + hr, hy + hr * 0.85], fill=GLOW)
    if warm:
        d.ellipse([ix + irx * 0.28, iy + iry * 0.22, ix + irx * 0.56, iy + iry * 0.48], fill=GLOW)
    else:
        d.ellipse([ix + irx * 0.26, iy + iry * 0.26, ix + irx * 0.46, iy + iry * 0.44], fill=SILVER)

    # 두꺼운 아치형 윗속눈썹 + 날렵한 속눈썹 팁 + 쌍꺼풀 라인 + 아랫속눈썹
    lid_y = cy - eh * (0.46 if warm else 0.36)
    lash_pts = [
        (cx - ew * 0.55, cy + eh * 0.08),
        (cx - ew * 0.26, lid_y - 4),
        (cx + ew * 0.24, lid_y - 2),
        (cx + ew * 0.58, cy + eh * (0.04 if warm else 0.12)),
    ]
    draw_tapered_stroke(d, lash_pts, w_start=12, w_end=22, col=INK)
    # 외곽 속눈썹 윙 팁
    if not is_far:
        draw_tapered_stroke(d, [(cx + ew * 0.42, lid_y + 8), (cx + ew * 0.65, lid_y - 8)], 12, 2, INK)
    # 쌍꺼풀 선
    crease = [(cx - ew * 0.36, lid_y - 18), (cx, lid_y - 26), (cx + ew * 0.38, lid_y - 14)]
    draw_tapered_stroke(d, crease, 4, 5, GUN)
    # 언더라인
    under = [(cx - ew * 0.34, cy + eh * 0.46), (cx + ew * 0.05, cy + eh * 0.50), (cx + ew * 0.38, cy + eh * 0.42)]
    draw_tapered_stroke(d, under, 4, 7, INK)


def draw_lina_portraits():
    """리나(병중 / 해독 후) 1536×1536 슈퍼샘플링 서브컬처 정통 셀화 초상화 2종."""
    for warm in (False, True):
        S = 1536  # 3× 슈퍼샘플링 -> 512×512 LANCZOS
        bg = make_terminal_bg(512, hostile=False).resize((S, S), Image.BICUBIC)
        d = ImageDraw.Draw(bg)

        # 1. 풍성한 뒷머리 보브컷 베이스 실루엣 (어두운 차콜 + 외곽 먹선)
        back_hair = catmull_rom([
            (375, 485), (355, 295), (465, 148), (695, 96), (955, 138),
            (1118, 285), (1158, 515), (1112, 745), (1015, 865), (505, 855), (392, 705)
        ], subdiv=10, closed=True)
        d.polygon(back_hair, fill=INK)
        back_hair_in = [(x + (768 - x) * 0.022, y + (480 - y) * 0.022) for x, y in back_hair]
        d.polygon(back_hair_in, fill=CARBON_DEEP)

        # 2. 이너 하이넥 벙커 셔츠 & 목 & 쇄골 음영
        neck_pts = [(668, 695), (868, 695), (892, 885), (642, 885)]
        d.polygon(neck_pts, fill=IVORY_SH, outline=INK, width=12)
        # 턱 바로 아래 선명한 삼각 셀 그림자
        d.polygon([(668, 695), (868, 695), (855, 795), (712, 825), (662, 765)], fill=IVORY_DEEP)
        # 어두운 이너 하이칼라 병동복 깃
        collar_in = [(595, 845), (755, 905), (925, 842), (965, 965), (565, 965)]
        d.polygon(collar_in, fill=CARBON_HI, outline=INK, width=12)

        # 3. 어깨를 감싸는 두툼한 아이보리 방한 숄/담요 (부드러운 곡선 주름 + 다단계 셀 명암)
        shawl_pts = catmull_rom([
            (195, 1510), (248, 1145), (355, 905), (545, 812), (765, 875),
            (985, 808), (1175, 915), (1282, 1165), (1335, 1510)
        ], subdiv=10, closed=False) + [(1335, 1536), (195, 1536)]
        d.polygon(shawl_pts, fill=IVORY)
        # 담요 우측 및 하단 주름 셀 음영
        shawl_sh = catmull_rom([
            (765, 875), (985, 808), (1175, 915), (1282, 1165), (1335, 1510),
            (895, 1510), (835, 1215), (685, 1085)
        ], subdiv=8, closed=True)
        d.polygon(shawl_sh, fill=IVORY_SH)
        # 담요 좌상단 어깨 밝은 하이라이트 면
        shawl_hi = catmull_rom([
            (258, 1145), (362, 912), (545, 818), (695, 875), (555, 1045), (345, 1245)
        ], subdiv=8, closed=True)
        d.polygon(shawl_hi, fill=IVORY_HI)
        d.line(shawl_pts[:len(shawl_pts) - 2], fill=INK, width=15, joint='curve')

        # 담요 옷주름 테이퍼드 라인 & 티타늄 메디컬 버클
        draw_tapered_stroke(d, [(335, 995), (615, 1105), (925, 1035), (1165, 965)], 6, 13, INK)
        draw_tapered_stroke(d, [(295, 1215), (645, 1315), (1045, 1225), (1225, 1145)], 11, 5, INK)
        d.rounded_rectangle([518, 962, 638, 1042], radius=16, fill=TITAN, outline=INK, width=10)
        d.line([(536, 982), (618, 982)], fill=GLOW, width=6)

        # 4. 3/4 좌측을 향한 섬세한 서브컬처 애니메이션 얼굴 윤곽 & 오른쪽 귀
        skin_base = IVORY_HI if warm else (231, 229, 224, 255)
        skin_sh = IVORY_SH if warm else (194, 192, 188, 255)

        face_pts = catmull_rom([
            (492, 345),   # 왼쪽 이마
            (468, 495),   # 왼쪽 관자놀이/눈가
            (484, 608),   # 왼쪽 볼 곡선(모에 볼살 아크)
            (532, 712),   # 왼쪽 턱선
            (638, 796),   # 갸름한 턱 끝(Chin)
            (798, 762),   # 오른쪽 턱선
            (928, 658),   # 오른쪽 턱관절
            (968, 495),   # 오른쪽 관자놀이
            (875, 295),   # 정수리 아래
            (635, 285),
        ], subdiv=12, closed=True)
        d.polygon(face_pts, fill=skin_base)

        # 앞머리 아래 이마 셀 그림자 + 우측 뺨 측면 셀 그림자
        forehead_sh = catmull_rom([
            (478, 455), (615, 415), (845, 425), (958, 525),
            (925, 655), (802, 758), (855, 625), (868, 485), (685, 345), (492, 355)
        ], subdiv=8, closed=True)
        d.polygon(forehead_sh, fill=skin_sh)
        d.line(face_pts + [face_pts[0]], fill=INK, width=13, joint='curve')

        # 머리카락 사이로 살짝 보이는 오른쪽 귀
        ear_pts = catmull_rom([(922, 528), (986, 505), (998, 595), (945, 658), (908, 628)], subdiv=8, closed=True)
        d.polygon(ear_pts, fill=skin_base)
        d.polygon([(936, 548), (974, 535), (976, 598), (938, 622)], fill=skin_sh)
        d.line(ear_pts[:32], fill=INK, width=11, joint='curve')

        # 5. 눈동자 · 눈썹 · 콧날 · 입술 (서브컬처 정통 비례)
        draw_anime_eye(d, cx=554, cy=556, ew=102, eh=84, warm=warm, is_far=True)
        draw_anime_eye(d, cx=768, cy=558, ew=118, eh=88, warm=warm, is_far=False)

        # 볼터치 (해독 후에는 건강한 은은한 온기 해칭, 병중에는 창백한 그림자)
        if warm:
            for bx in (506, 524, 795, 815):
                d.line([(bx, 636), (bx - 12, 656)], fill=TITAN, width=5)

        # 섬세한 애니메 콧날 (작은 그림자 삼각형 + 콧방울 점선)
        d.polygon([(612, 608), (594, 646), (624, 652)], fill=skin_sh)
        draw_tapered_stroke(d, [(606, 614), (592, 644), (608, 652)], 5, 7, INK)

        # 입술 & 눈썹 표정 분기
        if warm:
            draw_tapered_stroke(d, [(498, 468), (552, 446), (608, 458)], 7, 10, INK)
            draw_tapered_stroke(d, [(702, 458), (775, 444), (848, 468)], 10, 7, INK)
            # 부드럽게 미소 짓는 입매 + 아랫입술 하이라이트
            draw_tapered_stroke(d, [(608, 708), (656, 728), (712, 704)], 7, 9, INK)
            d.arc([634, 732, 682, 748], start=15, end=165, fill=skin_sh, width=5)
        else:
            # 애처롭게 살짝 모인 눈썹 + 힘없이 살짝 열린 입술
            draw_tapered_stroke(d, [(496, 476), (554, 462), (606, 442)], 6, 11, INK)
            draw_tapered_stroke(d, [(702, 442), (768, 462), (846, 480)], 11, 6, INK)
            d.polygon([(622, 716), (658, 710), (694, 718), (662, 730)], fill=TITAN_SH)
            draw_tapered_stroke(d, [(614, 718), (658, 708), (702, 720)], 7, 7, INK)

        # 6. 레이어드 서브컬처 단발 앞머리 & 옆머리 가닥 (옆가르마 곡선으로 부드럽게 흐르는 애니메 뱅 헤어!)
        hair_crown = catmull_rom([
            (396, 685), (388, 435), (448, 228), (595, 128), (795, 124),
            (968, 202), (1062, 372), (1078, 625), (1018, 815),
            (958, 665), (962, 485), (908, 385),
            # 우->좌로 자연스럽게 휘어 내려오는 부드러운 옆가르마 앞머리 곡선
            (865, 488), (835, 418),
            (762, 502), (722, 428),
            (645, 508), (612, 425),
            (538, 492), (508, 428),
            (468, 515), (452, 645), (428, 775)
        ], subdiv=9, closed=True)
        d.polygon(hair_crown, fill=CARBON)

        # 얼굴 양옆을 감싸며 턱선으로 모이는 보브컷 사이드락 2쌍
        left_lock = catmull_rom([
            (448, 315), (392, 485), (404, 685), (472, 835),
            (486, 695), (472, 515), (502, 365)
        ], subdiv=10, closed=True)
        right_lock = catmull_rom([
            (908, 295), (982, 465), (972, 695), (878, 858),
            (848, 742), (914, 585), (882, 395)
        ], subdiv=10, closed=True)
        for lk in (left_lock, right_lock):
            d.polygon(lk, fill=CARBON_HI)
            d.line(lk + [lk[0]], fill=INK, width=11, joint='curve')

        # 앞머리 상단 볼륨 라이트 & 부드러운 아치형 서브컬처 엔젤링(Angel-Ring) 광택
        crown_lit = catmull_rom([
            (485, 258), (615, 162), (795, 158), (935, 242),
            (865, 332), (715, 304), (555, 322)
        ], subdiv=9, closed=True)
        d.polygon(crown_lit, fill=CARBON_HI)

        angel_shards = [
            [(498, 318), (568, 296), (552, 348), (488, 362)],
            [(605, 290), (702, 284), (684, 342), (592, 346)],
            [(738, 292), (826, 308), (806, 360), (724, 346)],
            [(858, 324), (918, 350), (898, 396), (842, 372)],
        ]
        for ash in angel_shards:
            d.polygon(ash, fill=GUN_HI)
            d.polygon([ash[0], ((ash[0][0] + ash[1][0]) // 2, (ash[0][1] + ash[1][1]) // 2),
                       ((ash[2][0] + ash[3][0]) // 2, (ash[2][1] + ash[3][1]) // 2), ash[3]], fill=TITAN_SH)

        # 앞머리 외곽 및 부드러운 결 먹선 마감
        d.line(hair_crown + [hair_crown[0]], fill=INK, width=12, joint='curve')
        for strand in [
            [(655, 245), (622, 355), (642, 498)],
            [(775, 238), (742, 355), (758, 495)],
            [(548, 262), (522, 362), (536, 485)],
        ]:
            draw_tapered_stroke(d, strand, 4, 9, INK)

        # 정수리 위 잔머리(아호게) 두 가닥으로 생동감 부여
        ahoge = catmull_rom([(685, 142), (655, 68), (745, 52), (718, 136)], subdiv=8, closed=True)
        d.polygon(ahoge, fill=CARBON_HI, outline=INK, width=9)

        # 7. 손과 소품 연출 (병중: 가슴에 얹은 규소 결정화 손 / 해독 후: 따뜻한 은빛 머그컵을 감싼 두 손)
        if not warm:
            sleeve = catmull_rom([(585, 1510), (655, 1215), (795, 1185), (855, 1325), (795, 1510)], subdiv=8, closed=True)
            d.polygon(sleeve, fill=IVORY_SH, outline=INK, width=12)
            hand = catmull_rom([
                (695, 1225), (745, 1085), (828, 1025), (908, 1055),
                (928, 1145), (868, 1245), (775, 1265)
            ], subdiv=8, closed=True)
            d.polygon(hand, fill=TITAN, outline=INK, width=11)
            # 손가락 마디 분할선 & 광산병 규소 결정 파편들
            for fx0, fy0, fx1, fy1 in ((775, 1115, 835, 1045), (812, 1145, 878, 1072), (842, 1182, 905, 1118)):
                draw_tapered_stroke(d, [(fx0, fy0), (fx1, fy1)], 7, 4, INK)
            for cx_c, cy_c, cr in ((805, 1045, 28), (862, 1062, 32), (898, 1108, 24), (765, 1145, 22)):
                cryst = [(cx_c, cy_c - cr), (cx_c + cr * 0.75, cy_c - cr * 0.15),
                         (cx_c + cr * 0.35, cy_c + cr), (cx_c - cr * 0.65, cy_c + cr * 0.35)]
                d.polygon(cryst, fill=GLOW, outline=INK, width=7)
                d.polygon([cryst[0], cryst[1], (cx_c, cy_c)], fill=SILVER)
        else:
            # 따뜻한 김이 피어오르는 은백색 보온 머그컵 + 건강한 두 손
            for sx_w, off_w in ((685, -18), (745, 16)):
                steam = [(sx_w, 1015), (sx_w + off_w, 945), (sx_w - off_w, 875), (sx_w, 815)]
                draw_tapered_stroke(d, steam, 12, 2, GLOW)
            d.rounded_rectangle([625, 1048, 825, 1308], radius=28, fill=SILVER, outline=INK, width=13)
            d.ellipse([625, 1032, 825, 1082], fill=CARBON_HI, outline=INK, width=11)
            d.rectangle([652, 1092, 682, 1278], fill=GLOW)
            # 양손 손가락 디테일
            for hx0, hx1, dir_s in ((558, 678, 1), (772, 892, -1)):
                h_poly = catmull_rom([
                    (hx0, 1135), (hx1, 1118), (hx1, 1268), (hx0, 1255)
                ], subdiv=7, closed=True)
                d.polygon(h_poly, fill=IVORY_HI, outline=INK, width=11)
                for fy_l in (1165, 1212):
                    d.line([(hx0 + 18, fy_l), (hx1 - 18, fy_l)], fill=INK, width=7)

        out_name = 'portrait_lina_warm.png' if warm else 'portrait_lina.png'
        bg.resize((512, 512), Image.LANCZOS).save(PORT_DIR / out_name, optimize=True)
        print(f'[cel-port] assets/illustrated/portraits/{out_name}')


def draw_rick():
    """주인공 릭(Rick) — 보스·기체·리나와 100% 동일한 종이/벡터 셀화 화풍 + build_rick() 14관절 정밀 정합."""
    im, d = new_cv()

    # 1. 후면 트렌치코트 자락 (coat_b: poly (225,418)..(442,418)..(402,588)..(225,668), pivot (424,438))
    coat_pts = [(434, 428), (355, 458), (242, 578), (258, 646), (378, 576), (436, 495)]
    cel_part(im, coat_pts, ramp=RAMP_CARBON, outline_w=8, bevel=16,
             seams=[[(422, 455), (272, 608)]], chamfer=0.06)

    # 2. 오른다리 — 전방 지지 다리 (thigh_r -> shin_r: H=(538,515) -> K=(570,675) -> A=(565,915))
    cel_mech_limb(im, (538, 515), (570, 675), 34, 26, ramp=RAMP_CARBON, piston=False, joint_r=24)
    cel_mech_limb(im, (570, 675), (565, 908), 26, 21, ramp=RAMP_GUN, piston=False, joint_r=24)
    # 무릎 티타늄 패드 & 오른 부츠 (x=525..642, y=892..948)
    cel_part(im, [(548, 652), (594, 652), (590, 696), (552, 696)], ramp=RAMP_SILVER, outline_w=6, bevel=8, chamfer=0.15)
    cel_part(im, [(536, 895), (592, 895), (638, 924), (636, 948), (530, 948)], ramp=RAMP_CARBON, outline_w=8, bevel=12,
             seams=[[(542, 926), (632, 926)]], chamfer=0.10)

    # 3. 왼다리 — 후방 지지 다리 (thigh_l -> shin_l: H=(446,515) -> K=(428,672) -> A=(362,952))
    cel_mech_limb(im, (446, 515), (428, 672), 34, 26, ramp=RAMP_CARBON, piston=False, joint_r=24)
    cel_mech_limb(im, (428, 672), (362, 942), 26, 21, ramp=RAMP_GUN, piston=False, joint_r=24)
    cel_part(im, [(404, 650), (450, 650), (446, 694), (408, 694)], ramp=RAMP_SILVER, outline_w=6, bevel=8, chamfer=0.15)
    cel_part(im, [(332, 928), (388, 928), (424, 954), (422, 978), (324, 978)], ramp=RAMP_CARBON, outline_w=8, bevel=12,
             seams=[[(330, 956), (418, 956)]], chamfer=0.10)

    # 4. 골반 & 전술 벨트 (pelvis: (404,425)..(596,550), pivot (492,475))
    cel_part(im, [(416, 432), (568, 432), (576, 532), (492, 544), (408, 532)], ramp=RAMP_CARBON, outline_w=8, bevel=16,
             seams=[[(422, 468), (566, 468)]], chamfer=0.12)
    cel_part(im, [(418, 434), (568, 434), (566, 468), (420, 468)], ramp=RAMP_GUN, outline_w=6, bevel=8)
    cel_part(im, [(482, 432), (522, 432), (522, 470), (482, 470)], ramp=RAMP_SILVER, outline_w=6, bevel=8, chamfer=0.12)

    # 5. 오른팔 캐스팅 체인 (upper_arm_r -> forearm_r -> hand_r -> orb)
    # upper_arm_r: poly (536,224)..(614,336)..(596,392)..(542,310), pivot (552,246)
    cel_mech_limb(im, (552, 246), (588, 364), 21, 18, ramp=RAMP_GUN, piston=False, joint_r=20)
    # forearm_r: poly (580,330)..(698,388)..(576,428), pivot (594,368)
    cel_mech_limb(im, (594, 368), (678, 355), 21, 17, ramp=RAMP_SILVER, piston=False, joint_r=18)
    # hand_r: poly (676,308)..(768,384), pivot (682,355) — 위를 향해 펼친 손바닥 건틀릿
    hand_pts = [(678, 342), (726, 326), (758, 330), (754, 356), (718, 372), (678, 368)]
    cel_part(im, hand_pts, ramp=RAMP_CARBON, outline_w=7, bevel=10, chamfer=0.12)

    # 손바닥 <-> 플라즈마 구슬 연결 번개 기둥 (단일 연결 요소 PARTS=1 보장!)
    bolt_bridge = [(704, 282), (728, 282), (736, 312), (724, 342), (700, 342), (708, 312)]
    d.polygon(P(bolt_bridge), fill=GLOW, outline=INK, width=6 * SS)

    # orb: poly (635,175)..(805,308), pivot (716,260) — 셀 채색 번개 구체 + 방전 스파이크
    orb_spikes = [
        [(716, 208), (704, 180), (728, 198)],
        [(756, 242), (792, 228), (760, 260)],
        [(676, 244), (644, 228), (674, 262)],
    ]
    for osp in orb_spikes:
        d.polygon(P(osp), fill=GLOW, outline=INK, width=5 * SS)
    orb_pts = [(716 + math.cos(math.radians(a)) * 42, 250 + math.sin(math.radians(a)) * 42) for a in range(0, 360, 12)]
    cel_part(im, orb_pts, ramp=RAMP_WHITE, outline_w=7, bevel=18, sheen=True)
    # 구슬 중앙 번개 문양
    d.polygon(P([(722, 224), (702, 252), (716, 252), (708, 276), (730, 246), (716, 246)]), fill=INK)

    # 6. 흉부 하이칼라 사이버 재킷 (torso: x=420..548, y=200..440, pivot (488,425))
    torso_pts = [(422, 224), (454, 198), (522, 202), (548, 232), (548, 438), (422, 438)]
    cel_part(im, torso_pts, ramp=RAMP_CARBON, outline_w=8, bevel=20,
             seams=[[(502, 206), (502, 435)], [(428, 312), (544, 312)]], chamfer=0.08)
    # 재킷 화이트/실버 라펠 라인
    cel_part(im, [(450, 198), (526, 202), (534, 248), (496, 268), (446, 242)], ramp=RAMP_GUN, outline_w=7, bevel=10, chamfer=0.10)
    d.line(P([(502, 248), (502, 432)]), fill=SILVER, width=5 * SS)

    # 7. 왼팔 & 티타늄 숄더 폴드론 (upper_arm_l -> forearm_l)
    # upper_arm_l: poly (322,198)..(434,366), pivot (398,242)
    cel_mech_limb(im, (398, 242), (356, 364), 24, 20, ramp=RAMP_GUN, piston=False, joint_r=20)
    pauldron_l = [(338, 228), (382, 198), (430, 214), (422, 278), (344, 276)]
    cel_part(im, pauldron_l, ramp=RAMP_SILVER, outline_w=8, bevel=16,
             seams=[[(348, 252), (420, 252)]], rivets=[(366, 226), (406, 230)], chamfer=0.12)
    # forearm_l: poly (318,362)..(410,542), pivot (356,366)
    cel_mech_limb(im, (356, 366), (368, 492), 20, 16, ramp=RAMP_CARBON, piston=False, joint_r=18)
    cel_part(im, [(346, 484), (390, 484), (394, 528), (348, 528)], ramp=RAMP_GUN, outline_w=7, bevel=10, chamfer=0.16)

    # 8. 머리 — 우측 3/4 시선 은백색 스파이키 헤어 & 전술 고글 (head: (398,38)..(586,212), pivot (486,198))
    # 목
    d.polygon(P([(466, 176), (514, 176), (516, 210), (464, 210)]), fill=IVORY_SH, outline=INK, width=6 * SS)
    # 얼굴 윤곽 (우측 3/4)
    face = catmull_rom([
        (456, 108), (542, 108), (552, 152), (538, 188), (504, 202), (468, 188), (452, 152)
    ], subdiv=8, closed=True)
    d.polygon(P(face), fill=IVORY_HI)
    d.polygon(P([(456, 118), (502, 118), (485, 194), (464, 184), (452, 152)]), fill=IVORY_SH)
    d.line(P(face + [face[0]]), fill=INK, width=7 * SS, joint='curve')
    # 날렵한 눈매 & 다부진 입매
    d.polygon(P([(496, 144), (524, 142), (520, 154), (498, 154)]), fill=GLOW, outline=INK, width=3 * SS)
    d.ellipse(B(506, 143, 518, 154), fill=INK)
    d.line(P([(492, 136), (528, 134)]), fill=INK, width=5 * SS)
    d.line(P([(532, 144), (546, 142)]), fill=INK, width=4 * SS)
    d.line(P([(508, 178), (530, 176)]), fill=INK, width=4 * SS)

    # 은백색 스파이키 사이버펑크 헤어 (종이 커팅 셀 레이어)
    hair_pts = [
        (444, 168), (412, 146), (432, 118), (404, 88), (446, 78),
        (438, 48), (484, 62), (512, 42), (536, 66), (576, 58),
        (556, 92), (582, 112), (552, 126), (518, 122), (478, 128), (456, 156)
    ]
    cel_part(im, hair_pts, ramp=RAMP_SILVER, outline_w=7, bevel=14, sheen=True)

    # 이마에 올려 쓴 전술 사이버 고글
    cel_part(im, [(448, 92), (558, 90), (554, 124), (452, 126)], ramp=RAMP_GUN, outline_w=6, bevel=8, chamfer=0.14)
    for gx0, gx1 in ((464, 504), (514, 550)):
        d.rounded_rectangle(B(gx0, 96, gx1, 118), radius=6 * SS, fill=CARBON, outline=INK, width=4 * SS)
        d.line(P([(gx0 + 6, 102), (gx1 - 8, 102)]), fill=GLOW, width=3 * SS)

    return save_char(im, 'rick')


def draw_rick_portraits_and_icon():
    """릭 대화 초상화 2종(기본 / 결의) 및 앱 아이콘을 리나·기체와 완전히 통일된 벡터 셀화 풍으로 생성한다."""
    for determined in (False, True):
        S = 1536
        bg = make_terminal_bg(512, hostile=False).resize((S, S), Image.BICUBIC)
        d = ImageDraw.Draw(bg)

        # 1. 하이칼라 전술 재킷 & 좌측 은색 폴드론 어깨장갑
        jacket = [
            (185, 1536), (235, 1145), (415, 955), (615, 895), (915, 905),
            (1135, 1025), (1265, 1315), (1315, 1536)
        ]
        d.polygon(jacket, fill=CARBON, outline=INK, width=15)
        d.polygon([(235, 1145), (415, 955), (685, 915), (615, 1536), (185, 1536)], fill=CARBON_HI)
        # 하이칼라 깃 & 지퍼 라인
        collar = [(495, 795), (615, 945), (895, 955), (985, 805), (935, 1065), (545, 1055)]
        d.polygon(collar, fill=GUN, outline=INK, width=14)
        d.polygon([(495, 795), (615, 945), (755, 950), (725, 1055), (545, 1055)], fill=GUN_HI)
        d.line([(785, 955), (765, 1510)], fill=SILVER, width=12)
        d.line([(785, 955), (765, 1510)], fill=INK, width=4)

        # 왼쪽 어깨 티타늄 폴드론 (종이/셀 면 분할)
        pauldron = [(205, 1215), (295, 995), (515, 945), (555, 1155), (345, 1295)]
        d.polygon(pauldron, fill=TITAN, outline=INK, width=14)
        d.polygon([(205, 1215), (295, 995), (465, 958), (415, 1125)], fill=SILVER)
        d.line([(245, 1125), (525, 1055)], fill=INK, width=10)
        for rx_p, ry_p in ((335, 1035), (465, 1005)):
            d.ellipse([rx_p - 12, ry_p - 12, rx_p + 12, ry_p + 12], fill=CARBON, outline=INK, width=6)

        # 2. 목 & 우측 3/4 시선 샤프한 소년/청년 얼굴 윤곽
        d.polygon([(635, 695), (855, 695), (875, 935), (615, 925)], fill=IVORY_SH, outline=INK, width=12)
        d.polygon([(635, 695), (855, 695), (845, 815), (685, 845)], fill=IVORY_DEEP)

        face_pts = catmull_rom([
            (545, 365), (525, 535), (555, 675), (655, 785), (815, 822),
            (928, 742), (982, 608), (988, 465), (925, 325), (725, 295)
        ], subdiv=10, closed=True)
        d.polygon(face_pts, fill=IVORY_HI)
        # 좌측 뺨·이마 셀 음영 (우상단 번개 광원 기준)
        face_sh = catmull_rom([
            (545, 385), (528, 545), (562, 678), (662, 782), (765, 805),
            (695, 685), (665, 525), (765, 395), (585, 365)
        ], subdiv=8, closed=True)
        d.polygon(face_sh, fill=IVORY_SH)
        d.line(face_pts + [face_pts[0]], fill=INK, width=13, joint='curve')

        # 왼쪽 귀
        ear = catmull_rom([(558, 528), (492, 505), (482, 605), (538, 662), (575, 628)], subdiv=8, closed=True)
        d.polygon(ear, fill=IVORY_SH, outline=INK, width=11)
        d.line([(516, 545), (535, 615)], fill=INK, width=7)

        # 3. 날렵한 남성형 서브컬처 셀 눈매 & 코 & 입
        for ex, ey, ew, eh, far in ((732, 558, 112, 64, False), (918, 554, 86, 60, True)):
            ep = [(ex - ew // 2, ey + 6), (ex - ew // 3, ey - eh // 2), (ex + ew // 2, ey - eh // 2 + 4),
                  (ex + ew // 2 - 6, ey + eh // 2), (ex - ew // 3, ey + eh // 2)]
            d.polygon(ep, fill=GLOW, outline=INK, width=9)
            ix = ex + 8
            ir = eh // 2 - 4
            d.ellipse([ix - ir, ey - ir, ix + ir, ey + ir], fill=GUN, outline=INK, width=7)
            d.ellipse([ix - ir // 2, ey - ir // 2, ix + ir // 2, ey + ir // 2], fill=INK)
            d.ellipse([ix - ir + 6, ey - ir + 4, ix - 2, ey - 2], fill=GLOW)
            if determined:
                d.ellipse([ix + 2, ey + 4, ix + 12, ey + 14], fill=GLOW)
            draw_tapered_stroke(d, [(ex - ew // 2 - 8, ey + 4), (ex, ey - eh // 2 - 4), (ex + ew // 2 + 8, ey - 4)], 14, 9, INK)

        # 눈썹 (결의 표정일 때 더 날카롭게 찌푸림)
        brow_drop = 18 if determined else 4
        draw_tapered_stroke(d, [(652, 472 - brow_drop), (738, 482 + brow_drop), (802, 495 + brow_drop)], 13, 8, INK)
        draw_tapered_stroke(d, [(868, 492 + brow_drop), (924, 478), (976, 472 - brow_drop)], 8, 11, INK)

        # 날렵한 콧날 & 입매
        d.polygon([(858, 565), (892, 638), (854, 648)], fill=IVORY_SH)
        draw_tapered_stroke(d, [(866, 568), (894, 638), (866, 648)], 6, 8, INK)
        if determined:
            # 이를 악문 결의에 찬 입매
            draw_tapered_stroke(d, [(768, 722), (835, 712), (885, 724)], 9, 8, INK)
        else:
            draw_tapered_stroke(d, [(778, 718), (838, 714), (876, 708)], 8, 6, INK)

        # 4. 은백색 스파이키 셀화 헤어 + 전술 고글
        hair_back = [
            (465, 675), (385, 565), (435, 445), (355, 315), (485, 255),
            (445, 125), (615, 165), (715, 68), (825, 155), (965, 88),
            (955, 215), (1095, 185), (1025, 325), (1115, 395), (995, 455),
            (925, 385), (865, 488), (825, 385), (745, 492), (695, 388),
            (605, 498), (565, 425), (515, 585)
        ]
        d.polygon(hair_back, fill=SILVER)
        # 헤어 좌측 음영 & 상단 하이라이트 면
        d.polygon([(465, 675), (385, 565), (435, 445), (355, 315), (545, 295), (585, 485), (515, 585)], fill=TITAN)
        for h_hi in [
            [(615, 165), (715, 68), (775, 165), (665, 235)],
            [(825, 155), (965, 88), (945, 225), (835, 235)],
            [(955, 215), (1095, 185), (1015, 315), (925, 285)],
        ]:
            d.polygon(h_hi, fill=GLOW)
        d.line(hair_back + [hair_back[0]], fill=INK, width=13, joint='curve')

        # 이마 위 전술 고글 (종이/셀 하드서피스)
        goggle_band = [(505, 385), (585, 295), (995, 285), (1025, 405), (545, 425)]
        d.polygon(goggle_band, fill=GUN, outline=INK, width=13)
        for lx0, lx1 in ((625, 815), (845, 1005)):
            d.rounded_rectangle([lx0, 305, lx1, 408], radius=22, fill=CARBON, outline=INK, width=11)
            d.polygon([(lx0 + 22, 320), (lx0 + 95, 320), (lx0 + 62, 392), (lx0 + 16, 392)], fill=GUN_HI)
            d.polygon([(lx0 + 108, 320), (lx0 + 138, 320), (lx0 + 105, 392), (lx0 + 78, 392)], fill=GLOW)

        # 5. 결의 초상화(portrait_rick_determined) 전용: 전경에 쥔 번개 구체 & 방전 아크!
        if determined:
            # 오른손 검은 전술 글러브
            glove = [(965, 1536), (945, 1265), (1035, 1145), (1125, 1185), (1245, 1135), (1335, 1215), (1295, 1536)]
            d.polygon(glove, fill=CARBON_HI, outline=INK, width=13)
            # 구체 발광 링 & 코어
            ocx, ocy = 1155, 985
            for b_pts in [
                [(ocx - 65, ocy - 95), (ocx - 135, ocy - 195), (ocx - 45, ocy - 135)],
                [(ocx + 85, ocy - 75), (ocx + 195, ocy - 165), (ocx + 115, ocy - 35)],
                [(ocx - 95, ocy + 45), (ocx - 205, ocy + 95), (ocx - 85, ocy + 95)],
                [(ocx + 75, ocy + 75), (ocx + 185, ocy + 145), (ocx + 55, ocy + 115)],
            ]:
                d.polygon(b_pts, fill=GLOW, outline=INK, width=9)
            d.ellipse([ocx - 125, ocy - 125, ocx + 125, ocy + 125], fill=SILVER, outline=INK, width=13)
            d.ellipse([ocx - 96, ocy - 96, ocx + 96, ocy + 96], fill=GLOW)
            d.polygon([(ocx + 18, ocy - 68), (ocx - 36, ocy + 6), (ocx + 4, ocy + 6),
                       (ocx - 22, ocy + 72), (ocx + 42, ocy - 12), (ocx + 2, ocy - 12)], fill=INK)

        out_name = 'portrait_rick_determined.png' if determined else 'portrait_rick.png'
        out_512 = bg.resize((512, 512), Image.LANCZOS)
        out_512.save(PORT_DIR / out_name, optimize=True)
        print(f'[cel-port] assets/illustrated/portraits/{out_name}')

        # 결의 초상화의 고해상도 원본(1536->1024)을 앱 아이콘(assets/illustrated/icon.png)으로도 저장!
        if determined:
            icon_im = bg.resize((1024, 1024), Image.LANCZOS)
            icon_p = ROOT / 'assets' / 'illustrated' / 'icon.png'
            icon_im.save(icon_p, optimize=True)
            print(f'[cel-icon] {icon_p.relative_to(ROOT)}')


def draw_yun_portrait():
    """브로커 윤 아저씨(portrait_yun.png) — 보스·리나·릭과 100% 통일된 종이/벡터 셀화 정비공 초상화."""
    S = 1536
    bg = make_terminal_bg(512, hostile=False).resize((S, S), Image.BICUBIC)
    d = ImageDraw.Draw(bg)

    # 1. 묵직한 정비소 방열 재킷 & 공구 하네스 칼라
    coat = [
        (175, 1536), (225, 1185), (395, 985), (615, 915), (935, 915),
        (1155, 1005), (1295, 1215), (1345, 1536)
    ]
    d.polygon(coat, fill=CARBON_HI, outline=INK, width=15)
    d.polygon([(685, 915), (935, 915), (1155, 1005), (1295, 1215), (1345, 1536), (745, 1536)], fill=CARBON)
    # 넓은 스탠드 정비 칼라 & 리벳 탭
    collar = [(445, 815), (565, 1065), (975, 1065), (1065, 805), (945, 925), (585, 925)]
    d.polygon(collar, fill=GUN, outline=INK, width=14)
    d.polygon([(445, 815), (585, 925), (715, 925), (685, 1065), (565, 1065)], fill=GUN_HI)
    for rx_p, ry_p in ((515, 915), (995, 915), (415, 1145), (1115, 1145)):
        d.ellipse([rx_p - 13, ry_p - 13, rx_p + 13, ry_p + 13], fill=TITAN, outline=INK, width=6)

    # 2. 굵은 목 & 검은 초커형 통신 밴드 & 각진 중년 남성 얼굴 윤곽 (좌측 3/4 시선)
    d.polygon([(625, 695), (895, 695), (925, 945), (605, 945)], fill=IVORY_SH, outline=INK, width=13)
    d.polygon([(622, 815), (902, 815), (908, 872), (616, 872)], fill=CARBON, outline=INK, width=10)

    face = [
        (515, 365), (498, 525), (518, 685), (578, 798), (695, 838),
        (845, 795), (948, 695), (978, 525), (915, 335), (695, 305)
    ]
    d.polygon(face, fill=IVORY)
    # 우측 광대뼈·턱선 각진 하드 셀 음영 (종이 조각 같은 선명한 면 분할!)
    jaw_sh = [
        (695, 838), (845, 795), (948, 695), (978, 525),
        (885, 515), (855, 665), (765, 748), (675, 792)
    ]
    d.polygon(jaw_sh, fill=IVORY_DEEP)
    # 광대뼈 아래 사선 음영 플레인
    d.polygon([(555, 625), (645, 645), (615, 695), (545, 668)], fill=IVORY_SH)
    d.line(face + [face[0]], fill=INK, width=14, joint='curve')

    # 오른쪽 귀 & 산업용 이어피스
    ear = [(938, 525), (1008, 505), (1015, 628), (952, 682), (922, 645)]
    d.polygon(ear, fill=IVORY_SH, outline=INK, width=12)
    d.rounded_rectangle([952, 558, 994, 622], radius=8, fill=CARBON, outline=INK, width=8)

    # 3. 산전수전 겪은 날카로운 중년 눈매 · 눈썹 흉터 · 매부리코 · 수염 자국
    for ex, ey, ew, eh in ((585, 548, 96, 46), (785, 548, 110, 48)):
        ep = [(ex - ew // 2, ey + 4), (ex - ew // 3, ey - eh // 2), (ex + ew // 2, ey - eh // 2 + 6),
              (ex + ew // 3, ey + eh // 2), (ex - ew // 2 + 8, ey + eh // 2)]
        d.polygon(ep, fill=GLOW, outline=INK, width=9)
        ix = ex - 8
        ir = eh // 2 - 3
        d.ellipse([ix - ir, ey - ir, ix + ir, ey + ir], fill=GUN, outline=INK, width=6)
        d.ellipse([ix - 8, ey - 8, ix + 8, ey + 8], fill=INK)
        d.ellipse([ix - ir + 4, ey - ir + 4, ix - 2, ey - 2], fill=GLOW)
        draw_tapered_stroke(d, [(ex - ew // 2 - 8, ey - 8), (ex + ew // 2 + 10, ey - eh // 2 + 4)], 13, 10, INK)
        # 눈 밑 주름선
        d.line([(ex - ew // 3, ey + eh // 2 + 14), (ex + ew // 4, ey + eh // 2 + 18)], fill=GUN_HI, width=6)

    # 굵은 눈썹 + 오른쪽 눈썹 위 세로 흉터
    d.polygon([(522, 486), (632, 496), (628, 516), (520, 506)], fill=CARBON, outline=INK, width=6)
    d.polygon([(718, 498), (856, 482), (860, 504), (722, 518)], fill=CARBON, outline=INK, width=6)
    d.line([(808, 448), (792, 532)], fill=IVORY_DEEP, width=8)
    d.line([(812, 448), (796, 532)], fill=INK, width=4)

    # 묵직한 콧날 & 팔자 주름 & 굳게 다문 입매 & 거친 턱수염 해칭
    d.polygon([(648, 535), (608, 642), (668, 654), (678, 618)], fill=IVORY_SH)
    draw_tapered_stroke(d, [(644, 538), (604, 642), (656, 654)], 7, 9, INK)
    # 팔자 주름
    draw_tapered_stroke(d, [(578, 668), (558, 725)], 6, 3, INK)
    draw_tapered_stroke(d, [(738, 668), (768, 732)], 7, 3, INK)
    # 입매
    draw_tapered_stroke(d, [(612, 726), (672, 718), (736, 728)], 9, 8, INK)
    d.line([(638, 752), (692, 752)], fill=INK, width=6)
    # 수염 스터블 틱
    for sx_t, sy_t in ((602, 772), (628, 788), (658, 796), (692, 798), (725, 792), (758, 776), (788, 756)):
        d.line([(sx_t, sy_t), (sx_t - 4, sy_t + 14)], fill=GUN, width=5)

    # 4. 뒤로 넘긴 반백(건메탈 + 은빛 새치) 스포츠컷 헤어 & 정비사용 2안 용접 고글
    hair = [
        (488, 535), (455, 395), (485, 245), (565, 165), (685, 128),
        (825, 138), (955, 185), (1048, 285), (1068, 455), (1022, 625),
        (975, 535), (965, 425), (895, 365), (755, 355), (585, 365), (512, 435)
    ]
    d.polygon(hair, fill=GUN, outline=INK, width=13)
    # 옆머리 은빛 새치 스트릭
    d.polygon([(915, 365), (995, 355), (1022, 545), (968, 495)], fill=SILVER, outline=INK, width=8)
    for h_sp in [
        [(565, 165), (685, 128), (665, 225), (555, 245)],
        [(725, 135), (845, 142), (815, 232), (705, 225)],
    ]:
        d.polygon(h_sp, fill=GUN_HI)

    # 두꺼운 황동/티타늄 톤 정비사 확대경 고글 (무채색 실버·건메탈 프레임)
    strap = [(472, 385), (515, 285), (985, 285), (1035, 405), (485, 425)]
    d.polygon(strap, fill=CARBON_HI, outline=INK, width=13)
    for gx, gr in ((595, 82), (795, 86)):
        gy = 352
        d.ellipse([gx - gr - 16, gy - gr - 16, gx + gr + 16, gy + gr + 16], fill=TITAN, outline=INK, width=12)
        d.ellipse([gx - gr, gy - gr, gx + gr, gy + gr], fill=CARBON, outline=INK, width=10)
        d.pieslice([gx - gr + 12, gy - gr + 12, gx + gr - 12, gy + gr - 12], start=195, end=315, fill=GUN_HI)
        d.ellipse([gx - gr // 2, gy - gr // 2, gx - 10, gy - 10], fill=GLOW)

    out_512 = bg.resize((512, 512), Image.LANCZOS)
    out_512.save(PORT_DIR / 'portrait_yun.png', optimize=True)
    print('[cel-port] assets/illustrated/portraits/portrait_yun.png')


def main():
    draw_rick()
    c_sludge = draw_sludge()
    c_drone = draw_drone()
    c_guardian = draw_guardian()
    c_disperser = draw_disperser()
    c_sentinel = draw_sentinel()
    c_codex = draw_codex()
    c_gemini = draw_gemini()
    c_claude = draw_claude()
    c_omnis = draw_omnis()
    c_zero = draw_zero()
    draw_compiler()
    draw_holo()
    draw_arm()

    # 기체·보스 대화 초상화 10종 생성
    save_crop_portrait(c_drone,    (245, 235, 645, 635), 'drone', hostile=True)
    save_crop_portrait(c_sentinel, (215, 195, 655, 635), 'sentinel', hostile=True)
    save_crop_portrait(c_codex,    (245, 225, 645, 625), 'codex_hostile', hostile=True)
    save_crop_portrait(c_codex,    (535, 295, 795, 555), 'codex', hostile=False)
    save_crop_portrait(c_gemini,   (345, 85,  695, 435), 'gemini_hostile', hostile=True)
    # 해방된 제미디(portrait_gemini): 온화한 백자 안드로이드 얼굴 클로즈업(적색 없음)
    gem_calm = c_gemini.crop((335, 85, 512, 365))
    bg_gem = make_terminal_bg(512, hostile=False)
    d_gem = ImageDraw.Draw(bg_gem)
    d_gem.ellipse([76, 76, 436, 436], outline=SILVER, width=8)
    gem_full = Image.new('RGBA', (280, 280), (0, 0, 0, 0))
    gem_full.alpha_composite(gem_calm.resize((177, 280), Image.LANCZOS), (52, 0))
    bg_gem.alpha_composite(gem_full.resize((380, 380), Image.LANCZOS), (66, 66))
    bg_gem.save(PORT_DIR / 'portrait_gemini.png', optimize=True)

    save_crop_portrait(c_claude,   (175, 55,  495, 375), 'claude', hostile=False)
    save_crop_portrait(c_omnis,    (215, 145, 765, 695), 'omnis', hostile=True)
    save_crop_portrait(c_zero,     (285, 45,  685, 445), 'zero', hostile=True)

    draw_lina_portraits()
    draw_rick_portraits_and_icon()
    draw_yun_portrait()
    print('All 14 cel-shaded characters, 14 cel-shaded portraits, and app icon generated!')


if __name__ == '__main__':
    main()
