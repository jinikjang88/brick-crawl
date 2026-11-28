#!/usr/bin/env python3
"""사이버펑크 캐릭터 8종(rick, sentinel, sludge, drone, guardian, disperser, gemini, omnis)의
6×4 동작 아틀라스(assets/game/<name>_actions.png, 1920×1280)를 생성하고 js/art.js의 ART_SHEET를 갱신한다.

핵심 구조 (2D Skeletal Bone Skinning + 2-Bone Leg IK + FK Joint Locking):
  - 모든 관절(어깨·팔꿈치·목·허리·날개·집게)은 부모 관절점 J에서 M_child(J) == M_parent(J)를 엄격히 만족해
    절대로 파츠가 몸에서 떨어져 나가지 않는다.
  - 지면에 딛고 서는 다리(가디언·살포기·센티널)는 골반(pelvis) 이동에 맞춰 2-Bone IK(고관절 H - 무릎 K - 발목 A)를
    풀어, 발바닥(A)은 바닥에 완전히 고정된 채 무릎(K)과 허벅지·정강이 관절만 자연스럽게 굽혀진다.
  - 파츠 경계는 가우시안 보간 가중치(Linear Blend Skinning)로 매끄럽게 연결하여 절단선이나 구멍이 생기지 않는다.
"""
import math
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

from build_action_assets import CELL, FOOT_ROOM, PAD, ROOT, build as build_legacy, segment

CHAR_DIR = ROOT / 'assets' / 'illustrated' / 'characters'
ACT_DIR = ROOT / 'assets' / 'illustrated' / 'actions'
GAME_DIR = ROOT / 'assets' / 'game'
ART_JS = ROOT / 'js' / 'art.js'

GX, GY = CELL // 2, CELL - FOOT_ROOM  # (160, 314)

# 연출 색(2026-11-12): 옛 중세 팔레트(황동·따뜻한 먹색)를 화면과 같은 무채색 + 화(#C1443C)로 바꿨다.
# 이름은 호출부가 많아 그대로 둔다: C_SILVER = 밝은 티타늄, C_BRASS = 티타늄(더는 황동이 아니다)
C_INK = (11, 13, 16, 255)
C_IVORY = (230, 226, 214, 255)
C_WHITE = (244, 247, 248, 255)
C_SILVER = (200, 208, 212, 255)
C_BRASS = (150, 160, 166, 255)
C_RED = (193, 68, 60, 255)
C_RED_HI = (235, 110, 95, 255)
C_SMOKE = (66, 74, 81, 190)


def crop_tight(im):
    a = np.array(im)
    ys, xs = np.nonzero(a[..., 3] > 20)
    return im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def drop_strays(cell, ratio=0.012):
    """몸에서 떨어져 떠 있는 작은 조각을 지운다(연출을 그리기 전의 포즈 그림에만 쓴다).
    파츠를 자르는 다각형 경계와 가려진 곳을 메우는 처리에서 삼각형 부스러기가 몸 밖에 남았다(가디언 발 옆, 센티넬 포드 옆).
    클라드의 떠 있는 패널처럼 원래 떨어져 있는 큰 부품은 넓이 비율로 남긴다."""
    a = np.array(cell)
    mask = a[..., 3] > 20
    total = int(mask.sum())
    if not total:
        return cell
    h, w = mask.shape
    seen = np.zeros_like(mask)
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        stack = [(y0, x0)]; seen[y0, x0] = True
        pts = []
        while stack:
            y, x = stack.pop(); pts.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1), (y + 1, x + 1), (y - 1, x - 1), (y + 1, x - 1), (y - 1, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; stack.append((ny, nx))
        if len(pts) < total * ratio:
            ys, xs = zip(*pts)
            a[ys, xs] = 0
    # 반투명 가장자리 찌꺼기도 함께 지운다
    a[(a[..., 3] <= 20)] = 0
    return Image.fromarray(a, 'RGBA')


def draw_pixel_burst(draw, cx, cy, radii, color, outline=C_INK, n_rays=8, angle_offset=0.0):
    for i in range(n_rays):
        ang = angle_offset + i * (2 * math.pi / n_rays)
        r0, r1 = radii[0], radii[1] * (0.85 + 0.3 * (i % 2))
        x0, y0 = round(cx + math.cos(ang) * r0), round(cy + math.sin(ang) * r0)
        x1, y1 = round(cx + math.cos(ang) * r1), round(cy + math.sin(ang) * r1)
        draw.line([(x0, y0), (x1, y1)], fill=outline, width=5)
        draw.line([(x0, y0), (x1, y1)], fill=color, width=3)


def draw_pixel_ring(draw, cx, cy, rx, ry, color, outline=C_INK, width=3, dashed=False):
    bbox = [round(cx - rx), round(cy - ry), round(cx + rx), round(cy + ry)]
    if dashed:
        for deg in range(0, 360, 45):
            draw.arc(bbox, start=deg, end=deg + 26, fill=outline, width=width + 2)
            draw.arc(bbox, start=deg + 2, end=deg + 24, fill=color, width=width)
    else:
        draw.ellipse(bbox, outline=outline, width=width + 2)
        draw.ellipse(bbox, outline=color, width=width)


def draw_lightning_arc(draw, pts, color=C_WHITE, core_col=C_IVORY, width=3):
    draw.line(pts, fill=C_INK, width=width + 2)
    draw.line(pts, fill=color, width=width)
    if width >= 3:
        draw.line(pts, fill=core_col, width=1)


def draw_hex_shield(draw, cx, cy, r, color=C_IVORY, border=C_BRASS, fill_alpha=65):
    pts = []
    for k in range(6):
        a = math.pi / 6 + k * math.pi / 3
        pts.append((round(cx + math.cos(a) * r), round(cy + math.sin(a) * r * 1.15)))
    # ImageDraw는 RGBA 그림 위에서 섞지 않고 덮어쓴다: 반투명 면을 바로 칠하면 캐릭터가 지워지고 탁한 판이 남는다.
    # 따로 그린 면을 알파 합성으로 얹어 방벽 너머로 몸이 비쳐 보이게 한다
    base = draw._image
    layer = Image.new('RGBA', base.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).polygon(pts, fill=(*color[:3], fill_alpha))
    base.alpha_composite(layer)
    draw.line(pts + [pts[0]], fill=C_INK, width=4)
    draw.line(pts + [pts[0]], fill=border, width=2)


def draw_laser_beam(draw, x0, y0, x1, y1, color=C_RED, core=C_WHITE, h=10):
    draw.line([(x0, y0), (x1, y1)], fill=C_INK, width=h + 4)
    draw.line([(x0, y0), (x1, y1)], fill=color, width=h)
    draw.line([(x0, y0), (x1, y1)], fill=core, width=max(2, h // 3))


def draw_spores(draw, cx, cy, spread, count, color=C_RED, highlight=C_RED_HI):
    for i in range(count):
        a = i * 2.39996 + 0.5
        d = spread * (0.25 + 0.75 * ((i * 7 + 3) % count) / max(1, count))
        px = round(cx + math.cos(a) * d * 1.2 - spread * 0.25)
        py = round(cy + math.sin(a) * d * 0.85)
        r = 3 + (i % 4) * 2
        draw.ellipse([px - r - 1, py - r - 1, px + r + 1, py + r + 1], fill=C_INK)
        draw.ellipse([px - r, py - r, px + r, py + r], fill=color)
        draw.rectangle([px - r // 2, py - r // 2, px, py], fill=highlight)


def draw_hit_spark(cell_im, cx, cy, is_red=True):
    out = cell_im.copy()
    d = ImageDraw.Draw(out)
    col = C_RED_HI if is_red else C_WHITE
    draw_pixel_burst(d, cx, cy, (8, 32), col, C_INK, n_rays=8, angle_offset=0.3)
    draw_pixel_ring(d, cx, cy, 13, 13, C_WHITE, C_INK, width=2)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# 2D 스켈레탈 본 스키닝 (Linear Blend Skinning) + 2-Bone IK 엔진
# ─────────────────────────────────────────────────────────────────────────────

def local_matrix(pivot, rot=0.0, dx=0.0, dy=0.0, sx=1.0, sy=1.0):
    px, py = pivot
    rad = math.radians(rot)
    c, s = math.cos(rad), math.sin(rad)
    T_neg = np.array([[1, 0, -px], [0, 1, -py], [0, 0, 1]], dtype=np.float64)
    S = np.array([[sx, 0, 0], [0, sy, 0], [0, 0, 1]], dtype=np.float64)
    R = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], dtype=np.float64)
    T_pos = np.array([[1, 0, px + dx], [0, 1, py + dy], [0, 0, 1]], dtype=np.float64)
    return T_pos @ R @ S @ T_neg


def apply_mat_pt(M, pt):
    v = M @ np.array([pt[0], pt[1], 1.0], dtype=np.float64)
    return (float(v[0]), float(v[1]))


def segment_align_matrix(A0, B0, A1, B1):
    """선분 A0->B0를 A1->B1로 정확히 매핑하는 강체 회전+스케일(길이 보존)+이동 3×3 행렬."""
    vx0, vy0 = B0[0] - A0[0], B0[1] - A0[1]
    vx1, vy1 = B1[0] - A1[0], B1[1] - A1[1]
    len0 = max(1e-6, math.hypot(vx0, vy0))
    len1 = max(1e-6, math.hypot(vx1, vy1))
    ang0 = math.atan2(vy0, vx0)
    ang1 = math.atan2(vy1, vx1)
    d_ang = ang1 - ang0
    c, s = math.cos(d_ang), math.sin(d_ang)
    scale_y = len1 / len0
    # A0를 원점으로 -> 회전축 정렬 -> 길이 스케일 -> 새 각도 회전 -> A1으로 이동
    c0, s0 = math.cos(-ang0), math.sin(-ang0)
    c1, s1 = math.cos(ang1), math.sin(ang1)
    T0 = np.array([[1, 0, -A0[0]], [0, 1, -A0[1]], [0, 0, 1]], dtype=np.float64)
    R0 = np.array([[c0, -s0, 0], [s0, c0, 0], [0, 0, 1]], dtype=np.float64)
    S = np.array([[scale_y, 0, 0], [0, 1.0, 0], [0, 0, 1]], dtype=np.float64)
    R1 = np.array([[c1, -s1, 0], [s1, c1, 0], [0, 0, 1]], dtype=np.float64)
    T1 = np.array([[1, 0, A1[0]], [0, 1, A1[1]], [0, 0, 1]], dtype=np.float64)
    return T1 @ R1 @ S @ R0 @ T0


def solve_2bone_ik(H0, K0, A0, H1, A1):
    """고관절 H0, 무릎 K0, 발목 A0의 기본 길이와 무릎 굽힘 방향을 유지하면서
    새 고관절 H1과 새 발목 A1을 잇는 새 무릎 좌표 K1을 구한다.
    """
    L1 = math.hypot(K0[0] - H0[0], K0[1] - H0[1])
    L2 = math.hypot(A0[0] - K0[0], A0[1] - K0[1])
    dx, dy = A1[0] - H1[0], A1[1] - H1[1]
    d = math.hypot(dx, dy)
    # 기본 무릎(K0)이 H0->A0 단위벡터의 법선 (-uy0, ux0) 방향과 이루는 내적 부호를 보존한다.
    # 그래야 대기 포즈(H1==H0, A1==A0)에서 K1==K0가 정확히 복원되고, 굽힘 시 무릎이 역관절로 뒤집히지 않는다.
    dx0, dy0 = A0[0] - H0[0], A0[1] - H0[1]
    d0 = max(1e-6, math.hypot(dx0, dy0))
    dot0 = (K0[0] - H0[0]) * (-dy0 / d0) + (K0[1] - H0[1]) * (dx0 / d0)
    sign = 1.0 if dot0 >= 0 else -1.0

    d_clamped = max(abs(L1 - L2) + 0.5, min(L1 + L2 - 0.5, d))
    a = (L1 * L1 - L2 * L2 + d_clamped * d_clamped) / (2.0 * d_clamped)
    h = math.sqrt(max(0.0, L1 * L1 - a * a))

    ux, uy = dx / max(1e-6, d), dy / max(1e-6, d)
    nx, ny = -uy * sign, ux * sign
    kx = H1[0] + a * ux + h * nx
    ky = H1[1] + a * uy + h * ny
    return (kx, ky)


def bilinear_sample_rgba(src_arr, xs, ys):
    """src_arr (H, W, 4)에서 실수 좌표 (xs, ys)를 프리멀티플라이드 알파 양선형 보간으로 샘플링한다."""
    H, W = src_arr.shape[:2]
    valid = (xs >= 0) & (xs < W - 1) & (ys >= 0) & (ys < H - 1)
    x0 = np.clip(np.floor(xs).astype(np.int32), 0, W - 2)
    y0 = np.clip(np.floor(ys).astype(np.int32), 0, H - 2)
    fx = (xs - x0)[..., None]
    fy = (ys - y0)[..., None]

    c00 = src_arr[y0, x0].astype(np.float32)
    c10 = src_arr[y0, x0 + 1].astype(np.float32)
    c01 = src_arr[y0 + 1, x0].astype(np.float32)
    c11 = src_arr[y0 + 1, x0 + 1].astype(np.float32)

    # 프리멀티플라이드 알파 보간(외곽선 테두리 번짐 방지)
    for c in (c00, c10, c01, c11):
        c[..., :3] *= (c[..., 3:4] / 255.0)

    top = c00 * (1.0 - fx) + c10 * fx
    bot = c01 * (1.0 - fx) + c11 * fx
    val = top * (1.0 - fy) + bot * fy

    alpha = val[..., 3:4]
    rgb = np.where(alpha > 1.0, val[..., :3] / np.maximum(1e-6, alpha / 255.0), 0.0)
    out = np.concatenate([rgb, alpha], axis=-1)
    out[~valid] = 0.0
    return np.clip(out, 0, 255).astype(np.uint8)


def dilate_bool(m, steps=1):
    out = m.copy()
    for _ in range(steps):
        p = np.pad(out, 1, mode='constant', constant_values=False)
        out = (
            p[1:-1, 1:-1] | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
            | p[:-2, :-2] | p[:-2, 2:] | p[2:, :-2] | p[2:, 2:]
        )
    return out


def erode_bool(m, steps=1):
    out = m.copy()
    for _ in range(steps):
        p = np.pad(out, 1, mode='constant', constant_values=False)
        out = (
            p[1:-1, 1:-1] & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
        )
    return out


def extend_under_occlusion(raw_arr, chain_mask, occluder_mask, steps=54):
    """전면 파츠(occluder_mask)가 회전해 비켜날 때 뒤쪽 파츠(chain_mask)에 빈 구멍이 보이지 않도록
    chain_mask 내부 색상을 occluder_mask 아래로 steps 픽셀만큼 자연스럽게 확장(언더필)한다.
    """
    H, W = chain_mask.shape
    out = np.zeros_like(raw_arr)
    out[chain_mask] = raw_arr[chain_mask]

    if not occluder_mask.any() or not chain_mask.any():
        return out, chain_mask.copy()

    ys, xs = np.nonzero(chain_mask)
    pad = steps + 6
    y0, y1 = max(0, int(ys.min()) - pad), min(H, int(ys.max()) + 1 + pad)
    x0, x1 = max(0, int(xs.min()) - pad), min(W, int(xs.max()) + 1 + pad)

    c_crop = chain_mask[y0:y1, x0:x1]
    o_crop = occluder_mask[y0:y1, x0:x1]
    if not o_crop.any():
        return out, chain_mask.copy()

    raw_crop = raw_arr[y0:y1, x0:x1]
    near_occ = dilate_bool(o_crop, 3)
    # 얇은 조각이나 1~4px 파편이 54px 덩어리로 부풀어 오르지 않도록 형태학적 열기(erode->dilate)로 본체 내부만 시드로 삼는다
    core_seed = dilate_bool(erode_bool(c_crop & (~near_occ), 4), 4) & c_crop & (~near_occ)
    seed = core_seed if core_seed.any() else (c_crop & (~near_occ))
    if not seed.any():
        seed = c_crop.copy()

    work = np.zeros_like(raw_crop, dtype=np.float32)
    work[seed] = raw_crop[seed].astype(np.float32)
    filled = seed.copy()
    target = o_crop | (c_crop & (~seed))

    total_steps = steps + 3
    for s in range(total_steps):
        todo = target & (~filled)
        if not todo.any():
            break
        p_fill = np.pad(filled, 1, mode='constant', constant_values=False)
        p_work = np.pad(work, ((1, 1), (1, 1), (0, 0)), mode='edge')

        nb_u, w_u = p_fill[:-2, 1:-1], p_work[:-2, 1:-1]
        nb_d, w_d = p_fill[2:, 1:-1], p_work[2:, 1:-1]
        nb_l, w_l = p_fill[1:-1, :-2], p_work[1:-1, :-2]
        nb_r, w_r = p_fill[1:-1, 2:], p_work[1:-1, 2:]

        cnt = (
            nb_u.astype(np.float32)
            + nb_d.astype(np.float32)
            + nb_l.astype(np.float32)
            + nb_r.astype(np.float32)
        )
        new_pix = todo & (cnt > 0)
        if not new_pix.any():
            break

        rgb_sum = (
            w_u[..., :3] * nb_u[..., None]
            + w_d[..., :3] * nb_d[..., None]
            + w_l[..., :3] * nb_l[..., None]
            + w_r[..., :3] * nb_r[..., None]
        )
        avg_rgb = rgb_sum / np.maximum(1.0, cnt[..., None])
        shade = 0.993 if s >= 3 else 1.0
        # 마지막 6단계는 알파를 부드럽게 감쇠해 날카로운 절단선이 보이지 않게 한다
        rem_ratio = max(0.0, min(1.0, (total_steps - s) / 6.0))
        work[new_pix, :3] = avg_rgb[new_pix] * shade
        work[new_pix, 3] = 255.0 * rem_ratio
        filled[new_pix] = True

    # 원래 chain_mask 픽셀은 원본 그대로 보존
    work[c_crop] = raw_crop[c_crop].astype(np.float32)

    out[y0:y1, x0:x1] = np.clip(work, 0, 255).astype(np.uint8)
    ext_mask = chain_mask.copy()
    ext_mask[y0:y1, x0:x1] = filled
    return out, ext_mask


class SkinnedEnemy:
    """체계적 다중 체인(Kinematic Chain Layers) 스키닝 + 2-Bone IK 다리 + 관절 용접(Joint Welding) 리깅 클래스.

    왜 체인별 분리 레이어 스키닝인가:
      1. 서로 연결되지 않은 파츠(예: 전면 방패와 뒷다리, 위 날개와 아래 발톱)는 다른 체인으로 분리되어
         가중치가 섞이거나 빈 허공에서 좌표가 평균화되는 현상(파편 노이즈)이 원천 차단된다.
      2. 같은 체인 안의 부모-자식 파츠(예: 허벅지-정강이, 골반-몸통-머리, 상박-전완)는 관절점 J에서
         M_child(J) == M_parent(J)를 만족하며 연속 가중치로 매끄럽게 굽혀진다.
      3. 전면 체인 아래에 가려진 후면 체인은 extend_under_occlusion으로 28px 언더필되어,
         팔·방패·날개가 크게 회전해 비켜나도 몸통이나 다리에 빈 구멍이 절대 생기지 않는다.
    """

    def __init__(self, name, parts_spec, ik_legs=None, chains=None, base_size=228, blur_radius=16):
        self.name = name
        self.ik_legs = ik_legs or []
        raw = Image.open(CHAR_DIR / f'{name}.png').convert('RGBA')
        self.W, self.H = raw.size
        self.raw_arr = np.array(raw)
        full_alpha = self.raw_arr[..., 3]

        ys, xs = np.nonzero(full_alpha > 20)
        self.bbox = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
        self.foot_cx = (self.bbox[0] + self.bbox[2]) / 2.0
        self.foot_y = float(self.bbox[3])
        bw = self.bbox[2] - self.bbox[0]
        bh = self.bbox[3] - self.bbox[1]
        self.scale = min(base_size / bw, base_size / bh)
        self.iw = round(bw * self.scale)
        self.ih = round(bh * self.scale)

        claimed = np.zeros((self.H, self.W), dtype=bool)
        self.parts = {}
        self.part_names = []
        self.part_masks = {}

        opaque = (full_alpha > 15)
        for spec in parts_spec:
            pname = spec['name']
            self.part_names.append(pname)
            if spec.get('poly') is None and spec.get('polys') is None:
                mask = opaque & (~claimed)
            else:
                mask_im = Image.new('L', (self.W, self.H), 0)
                d = ImageDraw.Draw(mask_im)
                for poly in (spec.get('polys') or [spec['poly']]):
                    d.polygon(poly, fill=255)
                mask = (np.array(mask_im) > 127) & opaque & (~claimed)
            claimed |= mask
            self.part_masks[pname] = mask
            self.parts[pname] = {
                'name': pname,
                'pivot': spec['pivot'],
                'parent': spec.get('parent'),
                'blur': spec.get('blur', blur_radius),
                'weld_radius': spec.get('weld_radius', 54),
            }

        # 체인 목록이 주어지지 않으면 IK 다리 -> 루트 몸통 -> 자식 파츠 순으로 자동 구성
        if chains is None:
            ik_set = set()
            auto_chains = []
            for leg in self.ik_legs:
                auto_chains.append([leg['thigh'], leg['shin']])
                ik_set.add(leg['thigh'])
                ik_set.add(leg['shin'])
            roots = [p for p in self.part_names if not self.parts[p]['parent'] and p not in ik_set]
            for r_name in roots:
                auto_chains.append([r_name])
            for p in self.part_names:
                if p not in ik_set and p not in roots:
                    auto_chains.append([p])
            chains = auto_chains

        self.chains_spec = chains
        gy_src, gx_src = np.meshgrid(
            np.arange(self.H, dtype=np.float32),
            np.arange(self.W, dtype=np.float32),
            indexing='ij',
        )

        # 각 체인의 원본 마스크 합집합 계산
        raw_chain_masks = []
        for ch_bones in chains:
            cm = np.zeros((self.H, self.W), dtype=bool)
            for b in ch_bones:
                cm |= self.part_masks[b]
            raw_chain_masks.append(cm)

        # 체인별 언더필 텍스처 + 관절 용접(Weld) + 체인 내부 스키닝 가중치 사전 계산
        self.compiled_chains = []
        for c_idx, ch_bones in enumerate(chains):
            cm = raw_chain_masks[c_idx]
            # 자신보다 상위(전면) 레이어에 있는 모든 체인들의 마스크 합집합 = 가림막(occluder)
            occluder = np.zeros((self.H, self.W), dtype=bool)
            for higher_idx in range(c_idx + 1, len(chains)):
                occluder |= raw_chain_masks[higher_idx]

            # 1) 전면 체인 아래로 54px 언더필 확장
            chain_src, ext_cm = extend_under_occlusion(self.raw_arr, cm, occluder, steps=54)

            # 2) 체인 루트 본(b_root)이 다른 체인의 부모 본(b_parent)에 붙어 있으면 관절점 주변을 부드럽게 용접
            b_root = ch_bones[0]
            b_parent = self.parts[b_root]['parent']
            # IK 다리의 경우 ik_legs의 hip_parent를 부모 본으로 사용
            if not b_parent:
                for leg in self.ik_legs:
                    if leg['thigh'] == b_root:
                        b_parent = leg['hip_parent']
                        break

            active_bones = list(ch_bones)
            bone_masks_for_w = {}
            for b in ch_bones:
                bone_masks_for_w[b] = self.part_masks[b].copy()
            # 언더필된 픽셀은 체인 내 가장 가까운 본에 정확히 귀속(동심 팽창)
            only_ext = ext_cm & (~cm)
            if only_ext.any():
                if len(ch_bones) == 1:
                    bone_masks_for_w[ch_bones[0]] |= only_ext
                else:
                    rem = only_ext.copy()
                    grown = {b: self.part_masks[b].copy() for b in ch_bones}
                    for _ in range(60):
                        if not rem.any():
                            break
                        for b in ch_bones:
                            grown[b] = dilate_bool(grown[b], 1)
                            take = rem & grown[b]
                            bone_masks_for_w[b] |= take
                            rem &= (~take)
                    if rem.any():
                        bone_masks_for_w[ch_bones[-1]] |= rem

            weld_r = self.parts[b_root]['weld_radius']
            if b_parent and b_parent in self.part_masks and weld_r > 0:
                px, py = self.parts[b_root]['pivot']
                dist_piv = np.hypot(gx_src - px, gy_src - py)
                p_mask = self.part_masks[b_parent]
                near_root = dilate_bool(self.part_masks[b_root], 18)
                weld_zone = p_mask & near_root & (dist_piv <= weld_r)

                if weld_zone.any():
                    active_bones.append(b_parent)
                    # 부모 본이 더 아래 레이어(후면)에 있으면 weld_zone 알파를 가장자리로 갈수록 0으로 페더링해 경계선을 없앤다
                    parent_chain_idx = next(
                        (i for i, cb in enumerate(chains) if b_parent in cb), -1
                    )
                    if parent_chain_idx < c_idx:
                        root_u8 = Image.fromarray(
                            (self.part_masks[b_root].astype(np.uint8) * 255), 'L'
                        )
                        feather = (
                            np.array(
                                root_u8.filter(ImageFilter.GaussianBlur(radius=9)),
                                dtype=np.float32,
                            )
                            / 255.0
                        )
                        feather = np.clip(feather * 2.2, 0.0, 1.0)
                        wz_rgba = self.raw_arr[weld_zone].astype(np.float32)
                        wz_rgba[..., 3] *= feather[weld_zone]
                        chain_src[weld_zone] = np.clip(wz_rgba, 0, 255).astype(np.uint8)
                        ext_cm |= weld_zone
                        bone_masks_for_w[b_parent] = (
                            p_mask & dilate_bool(self.part_masks[b_root], 28) & (dist_piv <= weld_r + 14)
                        )
                    else:
                        # 부모 본이 더 위 레이어(전면, 예: 골반이 허벅지 위)에 있으면 이미 언더필된 영역 중 관절 근처에 부모 가중치 부여
                        bone_masks_for_w[b_parent] = weld_zone
                        bone_masks_for_w[b_root] &= (~weld_zone)

            # 3) 체인 활성 본들의 연속 가중치 계산 (각 본 자신의 마스크 주변 r_b + 4px 안에서만 가중치 존재!)
            envelope = dilate_bool(ext_cm, 12)
            w_list = []
            for b in active_bones:
                bm = bone_masks_for_w[b]
                r_b = self.parts[b]['blur']
                bone_env = dilate_bool(bm, r_b + 4) & envelope
                m_u8 = Image.fromarray((bm.astype(np.uint8) * 255), 'L')
                w_blur = (
                    np.array(m_u8.filter(ImageFilter.GaussianBlur(radius=r_b)), dtype=np.float32)
                    / 255.0
                )
                w_b = np.where(bone_env, w_blur + bm.astype(np.float32) * 0.8, 0.0)
                w_list.append(w_b)

            w_stack = np.stack(w_list, axis=0)
            w_sum = w_stack.sum(axis=0, keepdims=True)
            chain_weights = np.where(w_sum > 1e-3, w_stack / np.maximum(1e-6, w_sum), 0.0)

            self.compiled_chains.append({
                'bones': active_bones,
                'src': chain_src,
                'weights': chain_weights,
            })

        # 320×320 셀 픽셀 그리드 미리 생성
        gy, gx = np.meshgrid(np.arange(CELL, dtype=np.float64), np.arange(CELL, dtype=np.float64), indexing='ij')
        self.grid_x = gx
        self.grid_y = gy

    def render_pose(self, pose_dict, brightness=1.0, desat=0.0):
        world_mats = {}
        ik_thigh_names = {leg['thigh'] for leg in self.ik_legs}
        ik_shin_names = {leg['shin'] for leg in self.ik_legs}

        def get_fk_mat(pname):
            if pname in world_mats:
                return world_mats[pname]
            p = self.parts[pname]
            tr = pose_dict.get(pname, {})
            parent = p['parent']
            dx = tr.get('dx', 0.0) if not parent else tr.get('joint_dx', 0.0)
            dy = tr.get('dy', 0.0) if not parent else tr.get('joint_dy', 0.0)
            M_loc = local_matrix(
                p['pivot'],
                rot=tr.get('rot', 0.0),
                dx=dx,
                dy=dy,
                sx=tr.get('sx', 1.0),
                sy=tr.get('sy', 1.0),
            )
            if parent and parent in self.parts:
                M = get_fk_mat(parent) @ M_loc
            else:
                M = M_loc
            world_mats[pname] = M
            return M

        # 1) 먼저 IK가 아닌 파츠(골반·몸통·머리·팔·날개 등)의 FK 행렬 계산
        for pname in self.part_names:
            if pname not in ik_thigh_names and pname not in ik_shin_names:
                get_fk_mat(pname)

        # 2) 2-Bone IK 다리(고관절 H -> 무릎 K -> 발목 A) 행렬 계산
        for leg in self.ik_legs:
            M_hip_parent = get_fk_mat(leg['hip_parent'])
            H0, K0, A0 = leg['H'], leg['K'], leg['A']
            H1 = apply_mat_pt(M_hip_parent, H0)
            shin_tr = pose_dict.get(leg['shin'], {})
            A1 = (A0[0] + shin_tr.get('foot_dx', 0.0), A0[1] + shin_tr.get('foot_dy', 0.0))
            K1 = solve_2bone_ik(H0, K0, A0, H1, A1)
            world_mats[leg['thigh']] = segment_align_matrix(H0, K0, H1, K1)
            world_mats[leg['shin']] = segment_align_matrix(K0, A0, K1, A1)

        # 3) 소스(1024×1024) -> 셀(320×320) 변환 행렬 및 본별 역변환 좌표 캐시
        s = self.scale
        M_to_cell = np.array([
            [s, 0, GX - self.foot_cx * s],
            [0, s, GY - self.foot_y * s],
            [0, 0, 1.0],
        ], dtype=np.float64)

        bone_inv_coords = {}
        for pname in self.part_names:
            M_total = M_to_cell @ world_mats[pname]
            M_inv = np.linalg.inv(M_total)
            sx_i = M_inv[0, 0] * self.grid_x + M_inv[0, 1] * self.grid_y + M_inv[0, 2]
            sy_i = M_inv[1, 0] * self.grid_x + M_inv[1, 1] * self.grid_y + M_inv[1, 2]
            ix = np.clip(np.round(sx_i).astype(np.int32), 0, self.W - 1)
            iy = np.clip(np.round(sy_i).astype(np.int32), 0, self.H - 1)
            in_b = (sx_i >= 0) & (sx_i < self.W) & (sy_i >= 0) & (sy_i < self.H)
            bone_inv_coords[pname] = (sx_i, sy_i, ix, iy, in_b)

        # 4) 후면 체인부터 전면 체인 순으로 독립 스키닝 후 알파 합성
        cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
        for ch in self.compiled_chains:
            bones = ch['bones']
            weights = ch['weights']
            if len(bones) == 1:
                b = bones[0]
                sx_i, sy_i, _, _, in_b = bone_inv_coords[b]
                final_sx = np.where(in_b, sx_i, -10.0)
                final_sy = np.where(in_b, sy_i, -10.0)
            else:
                acc_x = np.zeros((CELL, CELL), dtype=np.float64)
                acc_y = np.zeros((CELL, CELL), dtype=np.float64)
                acc_w = np.zeros((CELL, CELL), dtype=np.float64)
                for b_idx, b in enumerate(bones):
                    sx_i, sy_i, ix, iy, in_b = bone_inv_coords[b]
                    w_i = np.where(in_b, weights[b_idx, iy, ix], 0.0)
                    acc_x += w_i * sx_i
                    acc_y += w_i * sy_i
                    acc_w += w_i
                valid = acc_w > 0.05
                final_sx = np.where(valid, acc_x / np.maximum(1e-6, acc_w), -10.0)
                final_sy = np.where(valid, acc_y / np.maximum(1e-6, acc_w), -10.0)

            layer_arr = bilinear_sample_rgba(ch['src'], final_sx, final_sy)
            cell.alpha_composite(Image.fromarray(layer_arr, 'RGBA'))

        if brightness != 1.0:
            rgb = ImageEnhance.Brightness(cell.convert('RGB')).enhance(brightness)
            cell = Image.merge('RGBA', (*rgb.split(), cell.split()[3]))

        if desat > 0:
            arr = np.array(cell, dtype=np.float32)
            gray = arr[..., 0] * 0.299 + arr[..., 1] * 0.587 + arr[..., 2] * 0.114
            for c in range(3):
                arr[..., c] = arr[..., c] * (1 - desat) + gray * desat
            red_mask = (arr[..., 0] > arr[..., 1] * 1.35) & (arr[..., 0] > 90) & (arr[..., 3] > 20)
            if desat > 0.4:
                arr[red_mask, 0] *= (1 - desat * 0.75)
                arr[red_mask, 1] *= (1 - desat * 0.5)
                arr[red_mask, 2] *= (1 - desat * 0.5)
            cell = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')

        return drop_strays(cell)


N_COLS = 10


def draw_crescent_slash(cell_im, cx, cy, rx, ry, deg0, deg1, thick=18, color=C_WHITE, mid_col=C_SILVER):
    """2배 슈퍼샘플링으로 날카롭게 끝이 모이는 애니메이션풍 초승달 스미어(검기/타격 궤적)를 합성한다."""
    SS = 2
    layer = Image.new('RGBA', (CELL * SS, CELL * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    steps = 28
    outer, inner = [], []
    for i in range(steps + 1):
        u = i / steps
        ang = math.radians(deg0 + (deg1 - deg0) * u)
        w = math.sin(math.pi * u) ** 0.75 * thick
        ox = (cx + math.cos(ang) * (rx + w * 0.55)) * SS
        oy = (cy + math.sin(ang) * (ry + w * 0.55)) * SS
        ix = (cx + math.cos(ang) * max(2.0, rx - w * 0.45)) * SS
        iy = (cy + math.sin(ang) * max(2.0, ry - w * 0.45)) * SS
        outer.append((ox, oy))
        inner.append((ix, iy))
    poly = outer + inner[::-1]
    d.line(poly + [poly[0]], fill=C_INK, width=5)
    d.polygon(poly, fill=(*mid_col[:3], 225))
    # 안쪽 고휘도 코어 궤적
    core_pts = []
    for i in range(3, steps - 2):
        u = i / steps
        ang = math.radians(deg0 + (deg1 - deg0) * u)
        w = math.sin(math.pi * u) * (thick * 0.32)
        core_pts.append(((cx + math.cos(ang) * (rx + w * 0.25)) * SS, (cy + math.sin(ang) * (ry + w * 0.25)) * SS))
    for i in range(steps - 3, 2, -1):
        u = i / steps
        ang = math.radians(deg0 + (deg1 - deg0) * u)
        w = math.sin(math.pi * u) * (thick * 0.32)
        core_pts.append(((cx + math.cos(ang) * (rx - w * 0.15)) * SS, (cy + math.sin(ang) * (ry - w * 0.15)) * SS))
    if len(core_pts) >= 3:
        d.polygon(core_pts, fill=color)
    out = cell_im.copy()
    out.alpha_composite(layer.resize((CELL, CELL), Image.LANCZOS))
    return out


def draw_plasma_bolts(cell_im, cx, cy, r0, r1, phase=0.0, n_bolts=5, color=C_WHITE):
    """구체·건틀릿 주변에 뻗어 나오는 예리한 셀화풍 분기 번개 아크."""
    SS = 2
    layer = Image.new('RGBA', (CELL * SS, CELL * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(n_bolts):
        ang = phase + i * (2 * math.pi / n_bolts)
        pts = []
        segs = 4
        for k in range(segs + 1):
            u = k / segs
            rr = r0 + (r1 - r0) * u
            jag = (5.5 if k % 2 == 1 else -4.5) * math.sin(math.pi * u) * (1 if i % 2 == 0 else -1)
            na = ang + jag * 0.025
            pts.append((round((cx + math.cos(na) * rr) * SS), round((cy + math.sin(na) * rr) * SS)))
        d.line(pts, fill=C_INK, width=7)
        d.line(pts, fill=color, width=3)
    out = cell_im.copy()
    out.alpha_composite(layer.resize((CELL, CELL), Image.LANCZOS))
    return out


def draw_railgun_blast(cell_im, x0, y0, x1, y1, h=18, color=C_IVORY, core=C_WHITE):
    """다중 충격파 링 + 나선형 플라즈마 번개 + 고휘도 레일건 빔 합성."""
    out = cell_im.copy()
    d = ImageDraw.Draw(out)
    draw_laser_beam(d, x0, y0, x1, y1, color=C_SILVER, core=core, h=h)
    # 빔 위아래를 감싸는 고전압 지그재그 번개 두 줄
    span = x1 - x0
    if abs(span) > 24:
        top_arc = [(x0, y0 - 4), (x0 + span * 0.32, y0 - h * 0.95), (x0 + span * 0.66, y0 + h * 0.65), (x1, y1 - 3)]
        bot_arc = [(x0, y0 + 4), (x0 + span * 0.36, y0 + h * 0.95), (x0 + span * 0.72, y0 - h * 0.65), (x1, y1 + 3)]
        draw_lightning_arc(d, [(round(px), round(py)) for px, py in top_arc], C_WHITE, C_WHITE, width=3)
        draw_lightning_arc(d, [(round(px), round(py)) for px, py in bot_arc], C_IVORY, C_WHITE, width=2)
    draw_pixel_ring(d, x0 + 14, y0, 14, round(h * 1.9), C_WHITE, C_INK, width=3)
    draw_pixel_ring(d, x0 + 34, y0, 10, round(h * 1.35), C_SILVER, C_INK, width=2, dashed=True)
    draw_pixel_burst(d, x1 - 10, y1, (8, round(h * 1.9)), C_WHITE, C_INK, n_rays=8, angle_offset=0.25)
    return out


def build_rick():
    """릭(Rick) — 서브컬처 셀화풍 마스터 스프라이트 기반 14파츠 인체 다관절 리깅(어깨-상완-전완-손목 3단 체인 + 양다리 정방향 무릎 2-Bone IK + 코트·어깨장갑) × 50프레임(10×5)."""
    parts_spec = [
        {'name': 'orb',         'poly': [(635, 175), (805, 175), (805, 308), (635, 308)], 'pivot': (716, 260), 'parent': 'hand_r',      'blur': 8,  'weld_radius': 0},
        {'name': 'hand_r',      'poly': [(676, 308), (768, 308), (768, 384), (676, 384)], 'pivot': (682, 355), 'parent': 'forearm_r',   'blur': 10, 'weld_radius': 30},
        {'name': 'forearm_r',   'poly': [(580, 330), (682, 328), (698, 388), (576, 428)], 'pivot': (594, 368), 'parent': 'upper_arm_r', 'blur': 12, 'weld_radius': 42},
        {'name': 'upper_arm_r', 'poly': [(536, 224), (590, 224), (614, 336), (596, 392), (554, 392), (542, 310)], 'pivot': (552, 246), 'parent': 'torso', 'blur': 14, 'weld_radius': 48},
        {'name': 'head',        'poly': [(398, 38),  (586, 38),  (586, 204), (518, 212), (444, 202)], 'pivot': (486, 198), 'parent': 'torso', 'blur': 12, 'weld_radius': 38},
        {'name': 'forearm_l',   'poly': [(318, 362), (396, 362), (410, 542), (334, 542)], 'pivot': (356, 366), 'parent': 'upper_arm_l', 'blur': 12, 'weld_radius': 42},
        {'name': 'upper_arm_l', 'poly': [(322, 198), (434, 198), (418, 315), (396, 366), (320, 366)], 'pivot': (398, 242), 'parent': 'torso', 'blur': 14, 'weld_radius': 50},
        {'name': 'coat_b',      'poly': [(225, 418), (442, 418), (402, 588), (225, 668)], 'pivot': (424, 438), 'parent': 'pelvis',      'blur': 16, 'weld_radius': 48},
        {'name': 'shin_l',      'poly': [(302, 672), (456, 672), (456, 986), (302, 986)], 'pivot': (362, 952), 'parent': None,          'blur': 14},
        {'name': 'thigh_l',     'poly': [(372, 515), (496, 515), (466, 686), (352, 686)], 'pivot': (446, 515), 'parent': 'pelvis',      'blur': 14},
        {'name': 'shin_r',      'poly': [(502, 675), (662, 675), (662, 956), (502, 956)], 'pivot': (565, 915), 'parent': None,          'blur': 14},
        {'name': 'thigh_r',     'poly': [(496, 515), (604, 515), (606, 688), (502, 688)], 'pivot': (538, 515), 'parent': 'pelvis',      'blur': 14},
        {'name': 'pelvis',      'poly': [(404, 425), (590, 425), (596, 550), (394, 550)], 'pivot': (492, 475), 'parent': None,          'blur': 15},
        {'name': 'torso',       'poly': None, 'pivot': (488, 425), 'parent': 'pelvis',    'blur': 15, 'weld_radius': 52},
    ]
    # 두 무릎 K 모두 우측(+x, 진행 방향)으로 자연스럽게 굽혀지도록 무릎 기준점 설정
    ik_legs = [
        {'thigh': 'thigh_l', 'shin': 'shin_l', 'hip_parent': 'pelvis', 'H': (446, 515), 'K': (428, 672), 'A': (362, 952)},
        {'thigh': 'thigh_r', 'shin': 'shin_r', 'hip_parent': 'pelvis', 'H': (538, 515), 'K': (570, 675), 'A': (565, 915)},
    ]
    chains = [
        ['coat_b'],
        ['thigh_r', 'shin_r'],
        ['thigh_l', 'shin_l'],
        ['pelvis', 'torso', 'head'],
        ['upper_arm_l', 'forearm_l'],
        ['upper_arm_r', 'forearm_r', 'hand_r'],
        ['orb'],
    ]
    rig = SkinnedEnemy('rick', parts_spec, ik_legs=ik_legs, chains=chains, base_size=244, blur_radius=14)

    # 0행: 공격(10프레임) — 무게중심 후방 이동 & 팔꿈치 깊은 굴곡 차징(f0~f2) -> 골반·흉곽 회전 + 어깨·팔꿈치 완전 신전 채찍 타격(f3~f5) -> 반동 및 완만한 복귀(f6~f9)
    atk = [
        # f0: 예비 동작 시작 — 무릎을 살짝 굽히며 오른 팔꿈치를 몸쪽으로 당긴다
        ({'pelvis': {'dx': -10, 'dy': 10, 'rot': -2.5}, 'torso': {'rot': -5}, 'head': {'rot': 4}, 'coat_b': {'rot': 9},
          'upper_arm_l': {'rot': 10}, 'forearm_l': {'rot': -12},
          'upper_arm_r': {'rot': 14}, 'forearm_r': {'rot': -18}, 'hand_r': {'rot': -6}, 'orb': {'sx': 0.95, 'sy': 0.95}}, 1.01, 0.0, None),
        # f1: 깊은 코일링 — 뒷다리에 체중을 싣고 건틀릿에 고전압 응축
        ({'pelvis': {'dx': -22, 'dy': 22, 'rot': -5}, 'torso': {'rot': -10}, 'head': {'rot': 8}, 'coat_b': {'rot': 18},
          'upper_arm_l': {'rot': 20}, 'forearm_l': {'rot': -22},
          'upper_arm_r': {'rot': 26}, 'forearm_r': {'rot': -34}, 'hand_r': {'rot': -12}, 'orb': {'sx': 0.90, 'sy': 0.90}}, 1.04, 0.0,
         lambda c, r: draw_plasma_bolts(c, GX + 36, GY - 190, 10, 26, phase=0.2, n_bolts=4)),
        # f2: 최대 압축(점화 직전) — 구체 발광 팽창 & 수렴 링
        ({'pelvis': {'dx': -28, 'dy': 28, 'rot': -6.5}, 'torso': {'rot': -13}, 'head': {'rot': 11}, 'coat_b': {'rot': 25},
          'upper_arm_l': {'rot': 25}, 'forearm_l': {'rot': -28},
          'upper_arm_r': {'rot': 32}, 'forearm_r': {'rot': -42}, 'hand_r': {'rot': -16}, 'orb': {'sx': 1.14, 'sy': 1.14}}, 1.08, 0.0,
         lambda c, r: (
             draw_pixel_ring(ImageDraw.Draw(c), GX + 32, GY - 192, 26, 26, C_WHITE, C_INK, 2, dashed=True),
             draw_plasma_bolts(c, GX + 32, GY - 192, 12, 34, phase=0.9, n_bolts=5))[1]),
        # f3: 폭발적 하체·어깨 회전 시작 — 초승달 스미어 궤적과 함께 팔이 펴지기 시작!
        ({'pelvis': {'dx': 14, 'dy': 14, 'rot': 4}, 'shin_r': {'foot_dx': 8}, 'torso': {'rot': 8}, 'head': {'rot': -5}, 'coat_b': {'rot': -16},
          'upper_arm_l': {'rot': -18}, 'forearm_l': {'rot': -6},
          'upper_arm_r': {'rot': -38}, 'forearm_r': {'rot': 34}, 'hand_r': {'rot': 6}, 'orb': {'joint_dx': 16, 'joint_dy': 12, 'sx': 1.20, 'sy': 1.16}}, 1.12, 0.0,
         lambda c, r: draw_crescent_slash(c, GX + 36, GY - 168, 56, 44, -68, 38, thick=18, color=C_WHITE, mid_col=C_SILVER)),
        # f4: 팔꿈치 180도 완전 신전(최대 타격 임팩트!) — 전방 런지 + 초고출력 레일건 번개 포격!
        ({'pelvis': {'dx': 32, 'dy': 20, 'rot': 7.5}, 'shin_r': {'foot_dx': 16}, 'torso': {'rot': 13}, 'head': {'rot': -9}, 'coat_b': {'rot': -28},
          'upper_arm_l': {'rot': -32}, 'forearm_l': {'rot': 10},
          'upper_arm_r': {'rot': -66}, 'forearm_r': {'rot': 64}, 'hand_r': {'rot': 12}, 'orb': {'joint_dx': 44, 'joint_dy': 22, 'sx': 1.32, 'sy': 1.14}}, 1.16, 0.0,
         lambda c, r: draw_railgun_blast(
             draw_crescent_slash(c, GX + 52, GY - 165, 68, 52, -52, 46, thick=22, color=C_WHITE, mid_col=C_IVORY),
             GX + 72, GY - 165, CELL - 6, GY - 165, h=18)),
        # f5: 격발 여진 및 손목 반동(팔로우 스루) — 이중 충격파 확산
        ({'pelvis': {'dx': 28, 'dy': 18, 'rot': 6.5}, 'shin_r': {'foot_dx': 14}, 'torso': {'rot': 11}, 'head': {'rot': -7}, 'coat_b': {'rot': -25},
          'upper_arm_l': {'rot': -28}, 'forearm_l': {'rot': 8},
          'upper_arm_r': {'rot': -60}, 'forearm_r': {'rot': 56}, 'hand_r': {'rot': -8}, 'orb': {'joint_dx': 68, 'joint_dy': 20, 'sx': 1.24, 'sy': 1.06}}, 1.10, 0.0,
         lambda c, r: (
             draw_laser_beam(ImageDraw.Draw(c), GX + 78, GY - 165, CELL - 8, GY - 165, C_SILVER, C_WHITE, h=10),
             draw_pixel_ring(ImageDraw.Draw(c), GX + 96, GY - 165, 18, 42, C_WHITE, C_INK, 3, dashed=True),
             draw_plasma_bolts(c, GX + 90, GY - 165, 14, 42, phase=1.7, n_bolts=5))[2]),
        # f6: 잔류 스파크 & 팔꿈치 자연 이완 시작
        ({'pelvis': {'dx': 18, 'dy': 12, 'rot': 4}, 'shin_r': {'foot_dx': 8}, 'torso': {'rot': 6}, 'head': {'rot': -4}, 'coat_b': {'rot': -16},
          'upper_arm_l': {'rot': -16}, 'forearm_l': {'rot': 4},
          'upper_arm_r': {'rot': -36}, 'forearm_r': {'rot': 32}, 'hand_r': {'rot': -5}, 'orb': {'joint_dx': 24, 'joint_dy': 8, 'sx': 0.96, 'sy': 0.96}}, 1.05, 0.0,
         lambda c, r: draw_plasma_bolts(c, GX + 68, GY - 175, 8, 24, phase=2.4, n_bolts=4)),
        # f7: 복귀 1 — 가드 자세로 회수
        ({'pelvis': {'dx': 8, 'dy': 6, 'rot': 1.8}, 'shin_r': {'foot_dx': 3}, 'torso': {'rot': 2.5}, 'head': {'rot': -2}, 'coat_b': {'rot': -7},
          'upper_arm_l': {'rot': -7}, 'forearm_l': {'rot': 2},
          'upper_arm_r': {'rot': -16}, 'forearm_r': {'rot': 14}, 'hand_r': {'rot': -2}}, 1.02, 0.0, None),
        # f8: 복귀 2 — 무릎·코트 잔진동 안착
        ({'pelvis': {'dx': 2, 'dy': 2, 'rot': 0.5}, 'torso': {'rot': 0.8}, 'coat_b': {'rot': -2},
          'upper_arm_l': {'rot': -2}, 'upper_arm_r': {'rot': -5}, 'forearm_r': {'rot': 4}}, 1.0, 0.0, None),
        # f9: 완벽한 대기 포즈 이음매
        ({}, 1.0, 0.0, None),
    ]

    # 1행: 피격(10프레임) — 충격 스파크 -> 무릎 굴곡 & 전완 건틀릿 안면 크로스 가드 -> 다관절 탄성 복귀
    hit = [
        ({'pelvis': {'dx': -12, 'dy': 10, 'rot': -4}, 'torso': {'rot': -8}, 'head': {'rot': 9}, 'coat_b': {'rot': 14},
          'upper_arm_l': {'rot': 14}, 'forearm_l': {'rot': -16},
          'upper_arm_r': {'rot': -14}, 'forearm_r': {'rot': -22}, 'hand_r': {'rot': -8}}, 1.24, 0.0,
         lambda c, r: draw_hit_spark(c, GX + 24, GY - 165, is_red=False)),
        ({'pelvis': {'dx': -24, 'dy': 20, 'rot': -7}, 'torso': {'rot': -14}, 'head': {'rot': 15}, 'coat_b': {'rot': 24},
          'upper_arm_l': {'rot': 24}, 'forearm_l': {'rot': -26},
          'upper_arm_r': {'rot': -24}, 'forearm_r': {'rot': -36}, 'hand_r': {'rot': -12}}, 1.14, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX + 6, GY - 172, (10, 30), C_WHITE, C_INK, 8), c)[1]),
        ({'pelvis': {'dx': -32, 'dy': 26, 'rot': -9}, 'shin_l': {'foot_dx': -6}, 'torso': {'rot': -18}, 'head': {'rot': 18}, 'coat_b': {'rot': 32},
          'upper_arm_l': {'rot': 30}, 'forearm_l': {'rot': -32},
          'upper_arm_r': {'rot': -28}, 'forearm_r': {'rot': -44}, 'hand_r': {'rot': -14}}, 0.96, 0.0,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX - 18, GY - 8, 22, 4, C_SMOKE, C_SILVER), c)[1]),
        ({'pelvis': {'dx': -28, 'dy': 23, 'rot': -8}, 'shin_l': {'foot_dx': -5}, 'torso': {'rot': -15}, 'head': {'rot': 15}, 'coat_b': {'rot': 28},
          'upper_arm_l': {'rot': 26}, 'forearm_l': {'rot': -28},
          'upper_arm_r': {'rot': -24}, 'forearm_r': {'rot': -38}, 'hand_r': {'rot': -10}}, 0.97, 0.0, None),
        ({'pelvis': {'dx': -20, 'dy': 16, 'rot': -5.5}, 'shin_l': {'foot_dx': -3}, 'torso': {'rot': -11}, 'head': {'rot': 11}, 'coat_b': {'rot': 20},
          'upper_arm_l': {'rot': 18}, 'forearm_l': {'rot': -20},
          'upper_arm_r': {'rot': -16}, 'forearm_r': {'rot': -26}, 'hand_r': {'rot': -6}}, 0.99, 0.0, None),
        ({'pelvis': {'dx': -12, 'dy': 10, 'rot': -3.5}, 'torso': {'rot': -7}, 'head': {'rot': 7}, 'coat_b': {'rot': 12},
          'upper_arm_l': {'rot': 11}, 'forearm_l': {'rot': -12},
          'upper_arm_r': {'rot': -10}, 'forearm_r': {'rot': -15}}, 1.0, 0.0, None),
        ({'pelvis': {'dx': -6, 'dy': 5, 'rot': -1.8}, 'torso': {'rot': -3.5}, 'head': {'rot': 3.5}, 'coat_b': {'rot': 6},
          'upper_arm_l': {'rot': 5}, 'forearm_l': {'rot': -6},
          'upper_arm_r': {'rot': -5}, 'forearm_r': {'rot': -7}}, 1.0, 0.0, None),
        ({'pelvis': {'dx': -2.5, 'dy': 2, 'rot': -0.7}, 'torso': {'rot': -1.5}, 'head': {'rot': 1.5}, 'coat_b': {'rot': 2.5},
          'upper_arm_r': {'rot': -2}, 'forearm_r': {'rot': -3}}, 1.0, 0.0, None),
        ({'pelvis': {'dx': -0.8, 'dy': 0.5}, 'torso': {'rot': -0.4}, 'coat_b': {'rot': 0.8}}, 1.0, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]

    # 2행: 사망(10프레임) — 치명타 피격 -> 무릎 굴복 -> 한쪽 무릎 꿇기 -> 지면 쓰러짐 & 코어 소멸
    death = [
        ({'pelvis': {'dx': -14, 'dy': 16, 'rot': -5}, 'torso': {'rot': -10}, 'head': {'rot': 12}, 'coat_b': {'rot': 16},
          'upper_arm_l': {'rot': 16}, 'upper_arm_r': {'rot': 8}, 'forearm_r': {'rot': 12}, 'orb': {'sx': 0.90, 'sy': 0.90}}, 1.16, 0.08,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX + 6, GY - 155, (10, 36), C_WHITE, C_INK, 8), c)[1]),
        ({'pelvis': {'dx': -18, 'dy': 36, 'rot': -2}, 'shin_l': {'foot_dx': -10}, 'shin_r': {'foot_dx': 8},
          'torso': {'rot': 4}, 'head': {'rot': 16}, 'coat_b': {'rot': 8},
          'upper_arm_l': {'rot': 8}, 'forearm_l': {'rot': 10}, 'upper_arm_r': {'rot': 14}, 'forearm_r': {'rot': 22}, 'orb': {'sx': 0.78, 'sy': 0.78}}, 0.98, 0.20, None),
        ({'pelvis': {'dx': -12, 'dy': 64, 'rot': 4}, 'shin_l': {'foot_dx': -22}, 'shin_r': {'foot_dx': 18},
          'torso': {'rot': 12}, 'head': {'rot': 20}, 'coat_b': {'rot': -6},
          'upper_arm_l': {'rot': -8}, 'forearm_l': {'rot': 16}, 'upper_arm_r': {'rot': 18}, 'forearm_r': {'rot': 32}, 'orb': {'joint_dy': 18, 'sx': 0.65, 'sy': 0.65}}, 0.90, 0.34, None),
        ({'pelvis': {'dx': -4, 'dy': 94, 'rot': 10}, 'shin_l': {'foot_dx': -34}, 'shin_r': {'foot_dx': 28},
          'torso': {'rot': 20}, 'head': {'rot': 25}, 'coat_b': {'rot': -14},
          'upper_arm_l': {'rot': -18}, 'forearm_l': {'rot': 22}, 'upper_arm_r': {'rot': 22}, 'forearm_r': {'rot': 40}, 'orb': {'joint_dy': 34, 'sx': 0.52, 'sy': 0.52}}, 0.84, 0.48, None),
        ({'pelvis': {'dx': 2, 'dy': 122, 'rot': 16}, 'shin_l': {'foot_dx': -46}, 'shin_r': {'foot_dx': 38},
          'torso': {'rot': 27}, 'head': {'rot': 30}, 'coat_b': {'rot': -22},
          'upper_arm_l': {'rot': -26}, 'forearm_l': {'rot': 28}, 'upper_arm_r': {'rot': 26}, 'forearm_r': {'rot': 48}, 'orb': {'joint_dy': 50, 'sx': 0.40, 'sy': 0.40}}, 0.78, 0.60,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX, GY - 22, 44, 5, C_SMOKE, C_SILVER), c)[1]),
        ({'pelvis': {'dx': 8, 'dy': 146, 'rot': 21}, 'shin_l': {'foot_dx': -54}, 'shin_r': {'foot_dx': 46},
          'torso': {'rot': 33}, 'head': {'rot': 34}, 'coat_b': {'rot': -28},
          'upper_arm_l': {'rot': -32}, 'forearm_l': {'rot': 32}, 'upper_arm_r': {'rot': 30}, 'forearm_r': {'rot': 54}, 'orb': {'joint_dy': 64, 'sx': 0.28, 'sy': 0.28}}, 0.72, 0.72, None),
        ({'pelvis': {'dx': 12, 'dy': 164, 'rot': 25}, 'shin_l': {'foot_dx': -60}, 'shin_r': {'foot_dx': 52},
          'torso': {'rot': 37}, 'head': {'rot': 37}, 'coat_b': {'rot': -32},
          'upper_arm_l': {'rot': -36}, 'forearm_l': {'rot': 35}, 'upper_arm_r': {'rot': 32}, 'forearm_r': {'rot': 58}, 'orb': {'joint_dy': 74, 'sx': 0.18, 'sy': 0.18}}, 0.66, 0.82, None),
        ({'pelvis': {'dx': 15, 'dy': 176, 'rot': 28}, 'shin_l': {'foot_dx': -64}, 'shin_r': {'foot_dx': 56},
          'torso': {'rot': 40}, 'head': {'rot': 39}, 'coat_b': {'rot': -35},
          'upper_arm_l': {'rot': -39}, 'forearm_l': {'rot': 37}, 'upper_arm_r': {'rot': 34}, 'forearm_r': {'rot': 61}, 'orb': {'joint_dy': 82, 'sx': 0.10, 'sy': 0.10}}, 0.62, 0.89, None),
        ({'pelvis': {'dx': 17, 'dy': 182, 'rot': 29.5}, 'shin_l': {'foot_dx': -66}, 'shin_r': {'foot_dx': 58},
          'torso': {'rot': 41.5}, 'head': {'rot': 40}, 'coat_b': {'rot': -36},
          'upper_arm_l': {'rot': -41}, 'forearm_l': {'rot': 38}, 'upper_arm_r': {'rot': 35}, 'forearm_r': {'rot': 63}, 'orb': {'joint_dy': 86, 'sx': 0.05, 'sy': 0.05}}, 0.59, 0.93, None),
        ({'pelvis': {'dx': 18, 'dy': 185, 'rot': 30}, 'shin_l': {'foot_dx': -67}, 'shin_r': {'foot_dx': 59},
          'torso': {'rot': 42}, 'head': {'rot': 40.5}, 'coat_b': {'rot': -37},
          'upper_arm_l': {'rot': -42}, 'forearm_l': {'rot': 39}, 'upper_arm_r': {'rot': 36}, 'forearm_r': {'rot': 64}, 'orb': {'joint_dy': 88, 'sx': 0.02, 'sy': 0.02}}, 0.57, 0.96, None),
    ]

    # 3행: 스킬(10프레임) — 과전압 파형 공명(오버드라이브): 지면 자기장 응축 -> 건틀릿 고각 거상 -> 육각 전자기 필드 & 번개 기둥 폭발 -> 복귀
    skill = [
        ({'pelvis': {'dy': 10}, 'torso': {'rot': -3}, 'head': {'rot': 3}, 'coat_b': {'rot': 8},
          'upper_arm_l': {'rot': 10}, 'forearm_l': {'rot': -10},
          'upper_arm_r': {'rot': -16}, 'forearm_r': {'rot': -10}, 'orb': {'sx': 1.06, 'sy': 1.06}}, 1.04, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX, GY - 6, 48, 11, C_SILVER, C_INK, 2), c)[1]),
        ({'pelvis': {'dx': -8, 'dy': 18, 'rot': -3}, 'torso': {'rot': -7}, 'head': {'rot': 5}, 'coat_b': {'rot': 18},
          'upper_arm_l': {'rot': 20}, 'forearm_l': {'rot': -18},
          'upper_arm_r': {'rot': -34}, 'forearm_r': {'rot': -18}, 'orb': {'sx': 1.16, 'sy': 1.16}}, 1.10, 0.0,
         lambda c, r: (
             draw_pixel_ring(ImageDraw.Draw(c), GX, GY - 6, 66, 15, C_IVORY, C_INK, 2),
             draw_plasma_bolts(c, GX + 54, GY - 210, 10, 32, phase=0.5, n_bolts=5))[1]),
        ({'pelvis': {'dx': -12, 'dy': 22, 'rot': -4}, 'torso': {'rot': -10}, 'head': {'rot': 6}, 'coat_b': {'rot': 26},
          'upper_arm_l': {'rot': 26}, 'forearm_l': {'rot': -24},
          'upper_arm_r': {'rot': -48}, 'forearm_r': {'rot': -22}, 'orb': {'sx': 1.26, 'sy': 1.26}}, 1.16, 0.0,
         lambda c, r: (
             draw_pixel_ring(ImageDraw.Draw(c), GX + 48, GY - 220, 38, 38, C_WHITE, C_INK, 3, dashed=True),
             draw_lightning_arc(ImageDraw.Draw(c), [(GX - 36, GY - 10), (GX - 46, GY - 82), (GX - 28, GY - 160)], C_WHITE, width=3),
             draw_plasma_bolts(c, GX + 48, GY - 220, 14, 42, phase=1.2, n_bolts=6))[2]),
        ({'pelvis': {'dx': 12, 'dy': 14, 'rot': 4}, 'shin_r': {'foot_dx': 8}, 'torso': {'rot': 7}, 'head': {'rot': -5}, 'coat_b': {'rot': -16},
          'upper_arm_l': {'rot': -18}, 'forearm_l': {'rot': 6},
          'upper_arm_r': {'rot': -56}, 'forearm_r': {'rot': 46}, 'hand_r': {'rot': 8}, 'orb': {'joint_dx': 24, 'joint_dy': 12, 'sx': 1.32, 'sy': 1.32}}, 1.22, 0.0,
         lambda c, r: (
             draw_hex_shield(ImageDraw.Draw(c), GX + 52, GY - 155, 52, color=C_WHITE, border=C_SILVER, fill_alpha=70),
             draw_crescent_slash(c, GX + 44, GY - 165, 64, 58, -75, 55, thick=20, color=C_WHITE, mid_col=C_IVORY))[1]),
        ({'pelvis': {'dx': 26, 'dy': 18, 'rot': 7}, 'shin_r': {'foot_dx': 14}, 'torso': {'rot': 11}, 'head': {'rot': -8}, 'coat_b': {'rot': -26},
          'upper_arm_l': {'rot': -28}, 'forearm_l': {'rot': 10},
          'upper_arm_r': {'rot': -64}, 'forearm_r': {'rot': 60}, 'hand_r': {'rot': 12}, 'orb': {'joint_dx': 48, 'joint_dy': 20, 'sx': 1.38, 'sy': 1.24}}, 1.24, 0.0,
         lambda c, r: (
             draw_hex_shield(ImageDraw.Draw(c), GX + 64, GY - 158, 60, color=C_IVORY, border=C_WHITE, fill_alpha=75),
             draw_railgun_blast(c, GX + 68, GY - 165, CELL - 6, GY - 165, h=20))[1]),
        ({'pelvis': {'dx': 22, 'dy': 15, 'rot': 5.5}, 'shin_r': {'foot_dx': 10}, 'torso': {'rot': 9}, 'head': {'rot': -6}, 'coat_b': {'rot': -22},
          'upper_arm_l': {'rot': -22}, 'forearm_l': {'rot': 8},
          'upper_arm_r': {'rot': -54}, 'forearm_r': {'rot': 50}, 'hand_r': {'rot': -6}, 'orb': {'joint_dx': 36, 'joint_dy': 14, 'sx': 1.20, 'sy': 1.14}}, 1.14, 0.0,
         lambda c, r: (
             draw_pixel_ring(ImageDraw.Draw(c), GX, GY - 6, 82, 16, C_WHITE, C_INK, 2, dashed=True),
             draw_plasma_bolts(c, GX + 84, GY - 165, 16, 46, phase=2.1, n_bolts=6))[1]),
        ({'pelvis': {'dx': 14, 'dy': 10, 'rot': 3.5}, 'shin_r': {'foot_dx': 6}, 'torso': {'rot': 5}, 'head': {'rot': -3}, 'coat_b': {'rot': -13},
          'upper_arm_l': {'rot': -14}, 'upper_arm_r': {'rot': -34}, 'forearm_r': {'rot': 30}, 'orb': {'joint_dx': 16, 'sx': 1.06, 'sy': 1.06}}, 1.06, 0.0,
         lambda c, r: draw_plasma_bolts(c, GX + 66, GY - 172, 10, 28, phase=2.9, n_bolts=4)),
        ({'pelvis': {'dx': 6, 'dy': 5, 'rot': 1.5}, 'shin_r': {'foot_dx': 2}, 'torso': {'rot': 2}, 'coat_b': {'rot': -6},
          'upper_arm_l': {'rot': -6}, 'upper_arm_r': {'rot': -15}, 'forearm_r': {'rot': 13}}, 1.02, 0.0, None),
        ({'pelvis': {'dx': 2, 'dy': 1.5}, 'torso': {'rot': 0.6}, 'coat_b': {'rot': -2},
          'upper_arm_r': {'rot': -4}, 'forearm_r': {'rot': 3}}, 1.0, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]

    # 4행: 대기(10프레임 연속 루프) — 양발은 지면에 완전히 고정된 채 무릎·골반·흉곽 호흡, 코트 뒷자락 위상차 흔들림, 건틀릿 팔꿈치·손목 탄력 + 구체 방전
    idle = []
    for i in range(N_COLS):
        th = 2.0 * math.pi * i / N_COLS
        pose = {
            'pelvis':      {'dx': 3.2 * math.sin(th), 'dy': 7.0 * (0.5 - 0.5 * math.cos(th)), 'rot': 0.8 * math.sin(th)},
            'torso':       {'rot': 1.8 * math.sin(th - 0.55)},
            'head':        {'rot': -1.6 * math.sin(th - 0.85)},
            'coat_b':      {'rot': 6.0 * math.sin(th - 1.15)},
            'upper_arm_l': {'rot': -2.8 * math.sin(th - 0.45)},
            'forearm_l':   {'rot': -3.6 * math.sin(th - 0.95)},
            'upper_arm_r': {'rot': 3.5 * math.sin(th - 0.35)},
            'forearm_r':   {'rot': -6.2 * math.sin(th - 0.80)},
            'hand_r':      {'rot': 4.5 * math.sin(th - 1.20)},
            'orb':         {'joint_dy': -9.0 * math.sin(th - 1.10), 'sx': 1.0 + 0.05 * math.sin(2 * th), 'sy': 1.0 + 0.05 * math.sin(2 * th)},
        }
        ph_i = th + 0.4
        fx_i = (lambda ph: lambda c, r: draw_plasma_bolts(c, GX + 54, GY - 186, 12, 24, phase=ph, n_bolts=3))(ph_i)
        idle.append((pose, 1.0 + 0.02 * math.sin(th), 0.0, fx_i))

    return assemble_sheet('rick', rig, atk, hit, death, skill, idle_frames=idle)


def lerp_pose_dicts(p0, p1, u):
    """두 포즈 딕셔너리를 부드러운 스무스스텝(3u^2 - 2u^3)으로 보간한다."""
    s = u * u * (3.0 - 2.0 * u)
    bones = set(p0.keys()) | set(p1.keys())
    out = {}
    for b in bones:
        d0, d1 = p0.get(b, {}), p1.get(b, {})
        keys = set(d0.keys()) | set(d1.keys())
        bd = {}
        for k in keys:
            default = 1.0 if k in ('sx', 'sy') else 0.0
            v0, v1 = d0.get(k, default), d1.get(k, default)
            val = v0 + (v1 - v0) * s
            if abs(val - default) > 1e-4:
                bd[k] = val
        if bd:
            out[b] = bd
    return out


def resample_track(frames, target_n=N_COLS, is_death=False):
    """6프레임 키프레임 트랙을 10프레임 연속 관절 궤적으로 매끄럽게 리샘플링한다."""
    if len(frames) == target_n:
        return frames
    m = len(frames)
    # 6프레임 키 위치: [0, 1, 2, 3, 4, 5] -> 10프레임 인덱스 [0..9]에 매핑
    # 마지막 프레임(9)은 항상 원본 마지막 키프레임(대기 포즈 복귀 또는 사망 완료)과 정확히 일치시킨다
    fx_map = {}
    for idx, (_, _, _, fx) in enumerate(frames):
        if fx is not None:
            mapped = round(idx * (target_n - 1) / (m - 1))
            if not is_death and mapped >= target_n - 1:
                mapped = target_n - 2
            fx_map[mapped] = fx

    out = []
    for i in range(target_n):
        if i == target_n - 1:
            p, br, ds, fx = frames[-1]
            out.append((p, br, ds, fx if is_death else None))
            continue
        pos = i * (m - 1) / (target_n - 1)
        k0 = min(m - 2, int(math.floor(pos)))
        u = pos - k0
        p0, br0, ds0, _ = frames[k0]
        p1, br1, ds1, _ = frames[k0 + 1]
        s = u * u * (3.0 - 2.0 * u)
        out.append((
            lerp_pose_dicts(p0, p1, u),
            br0 + (br1 - br0) * s,
            ds0 + (ds1 - ds0) * s,
            fx_map.get(i),
        ))
    return out


def generate_enemy_idle(name, rig, n_cols=N_COLS):
    """기체 13종 각각의 관절 해부학에 맞춘 10프레임 연속 대기(idle) 루프를 생성한다."""
    frames = []
    pnames = set(rig.part_names)
    has_ik = bool(rig.ik_legs)
    for i in range(n_cols):
        th = 2.0 * math.pi * i / n_cols
        s0 = math.sin(th)
        s1 = math.sin(th - 0.7)
        s2 = math.sin(th - 1.3)
        c0 = 0.5 - 0.5 * math.cos(th)
        pose = {}
        if has_ik and 'pelvis' in pnames:
            # 지면 보행 기체(가디언·살포기·센티넬): 발은 땅에 완전히 고정된 채 무릎·골반·상체·방패·포드가 살아 숨쉰다
            pose['pelvis'] = {'dx': 3.5 * s0, 'dy': 10.0 * c0, 'rot': 1.0 * s0}
            if 'torso' in pnames:
                pose['torso'] = {'rot': 2.5 * s1}
            if 'head' in pnames:
                pose['head'] = {'rot': -2.8 * s2}
            for sh in ('shoulder_l', 'pod_l', 'nozzle_l'):
                if sh in pnames:
                    pose[sh] = {'rot': 3.5 * s1}
            for sh in ('shoulder_r', 'pod_r', 'nozzle_r'):
                if sh in pnames:
                    pose[sh] = {'rot': -3.5 * s1}
            for sub in ('buckler_l', 'shield_r', 'fins'):
                if sub in pnames:
                    pose[sub] = {'rot': 4.0 * s2}
        elif name == 'drone':
            pose['body'] = {'dy': -6.0 * s0, 'rot': 2.0 * s1}
            pose['wing_ul'] = {'rot': 9.0 * s0}
            pose['wing_ur'] = {'rot': -9.0 * s0}
            pose['wing_ll'] = {'rot': -7.0 * s1}
            pose['wing_lr'] = {'rot': 7.0 * s1}
            pose['claw_l'] = {'rot': 5.0 * s2}
            pose['claw_r'] = {'rot': -5.0 * s2}
        elif name == 'sludge':
            pose['base'] = {'sx': 1.0 + 0.03 * s0, 'sy': 1.0 - 0.025 * s0}
            pose['body'] = {'rot': 2.5 * s1, 'sy': 1.0 + 0.035 * s1}
            pose['core'] = {'joint_dx': -6.0 * s0, 'joint_dy': -4.0 * s1, 'sx': 1.0 + 0.05 * s0, 'sy': 1.0 + 0.05 * s0}
            pose['spikes_tl'] = {'rot': -5.0 * s2}
            pose['spikes_tr'] = {'rot': 5.0 * s2}
        elif name == 'omnis':
            pose['shell'] = {'dy': -5.0 * s0, 'rot': 2.0 * s1}
            pose['gimbal'] = {'rot': -6.5 * s0}
            pose['eye'] = {'joint_dx': -5.0 * s1, 'sx': 1.0 + 0.04 * s2, 'sy': 1.0 + 0.04 * s2}
            pose['cables_l'] = {'rot': 5.0 * s2}
            pose['cables_r'] = {'rot': -5.0 * s2}
        elif name == 'claude':
            pose['monolith'] = {'dy': -3.5 * s0}
            pose['bust'] = {'rot': 2.0 * s1}
            pose['shield_far_l'] = {'joint_dy': -8.0 * s0, 'rot': 3.5 * s1}
            pose['shield_near_l'] = {'joint_dy': 7.0 * s1, 'rot': -3.0 * s2}
            pose['shield_near_r'] = {'joint_dy': -7.0 * s2, 'rot': 3.0 * s0}
            pose['shield_far_r'] = {'joint_dy': 8.0 * s0, 'rot': -3.5 * s1}
        elif name == 'gemini':
            pose['torso'] = {'dy': -5.0 * s0, 'rot': 1.8 * s1}
            pose['halo'] = {'rot': 6.0 * s0}
            pose['head_light'] = {'rot': -2.5 * s1}
            pose['head_dark'] = {'rot': 2.5 * s1}
            pose['arm_l'] = {'rot': 4.5 * s1}
            pose['forearm_l'] = {'rot': 5.5 * s2}
            pose['arm_r'] = {'rot': -4.5 * s1}
            pose['forearm_r'] = {'rot': -5.5 * s2}
            pose['cables_f'] = {'rot': 4.0 * s2}
            pose['cables_b'] = {'rot': -4.0 * s2}
        elif name == 'codex':
            pose['core'] = {'dy': -5.0 * s0, 'rot': 1.8 * s1}
            pose['ring'] = {'rot': 5.0 * s0}
            pose['arm_l'] = {'rot': 5.0 * s1}
            pose['arm_r'] = {'rot': -5.0 * s1}
            pose['cables_b'] = {'rot': 4.0 * s2}
        elif name == 'zero':
            pose['torso'] = {'dy': -5.5 * s0, 'rot': 1.8 * s1}
            pose['wing_l'] = {'rot': 5.5 * s0}
            pose['wing_r'] = {'rot': -5.5 * s0}
            pose['arm_l'] = {'rot': 4.5 * s1}
            pose['arm_r'] = {'rot': -4.5 * s1}
            pose['legs'] = {'rot': -3.0 * s2}
        elif name == 'arm':
            pose['shoulder'] = {'rot': 3.5 * s0}
            pose['upper_arm'] = {'rot': -6.0 * s1}
            pose['forearm'] = {'rot': 8.0 * s2}
        else:
            # compiler, holo 등
            root = rig.part_names[-1]
            pose[root] = {'dy': -4.5 * s0, 'rot': 1.8 * s1}
            for arm_k in ('arm', 'arm_l', 'pod_r'):
                if arm_k in pnames:
                    pose[arm_k] = {'rot': 5.0 * s1}
            if 'arm_r' in pnames:
                pose['arm_r'] = {'rot': -5.0 * s1}
        frames.append((pose, 1.0, 0.0, None))
    return frames


def assemble_sheet(name, rig, atk_frames, hit_frames, death_frames, skill_frames, idle_frames=None):
    atk_10 = resample_track(atk_frames, N_COLS, is_death=False)
    hit_10 = resample_track(hit_frames, N_COLS, is_death=False)
    death_10 = resample_track(death_frames, N_COLS, is_death=True)
    skill_10 = resample_track(skill_frames, N_COLS, is_death=False)
    idle_10 = idle_frames if idle_frames is not None else generate_enemy_idle(name, rig, N_COLS)

    all_rows = [atk_10, hit_10, death_10, skill_10, idle_10]
    atlas = Image.new('RGBA', (CELL * N_COLS, CELL * len(all_rows)), (0, 0, 0, 0))
    for r, row_specs in enumerate(all_rows):
        for c, (pose, br, desat, fx_fn) in enumerate(row_specs):
            cell = rig.render_pose(pose, brightness=br, desat=desat)
            if fx_fn:
                res = fx_fn(cell, rig)
                if isinstance(res, Image.Image):
                    cell = res
            atlas.alpha_composite(cell, (c * CELL, r * CELL))
    target = GAME_DIR / f'{name}_actions.png'
    atlas.save(target, optimize=True)
    meta = {'iw': rig.iw, 'ih': rig.ih}
    print(target.relative_to(ROOT), target.stat().st_size, meta)
    return meta


def build_guardian():
    """방화벽 가디언(Guardian) — 2-Bone IK 양다리 + 허리·목·양어깨·양팔꿈치·양방패 다관절 리깅."""
    parts_spec = [
        {'name': 'shield_r',   'poly': [(645, 360), (975, 360), (975, 895), (665, 895), (645, 650)], 'pivot': (715, 430), 'parent': 'shoulder_r', 'blur': 18},
        {'name': 'shoulder_r', 'poly': [(585, 165), (845, 165), (845, 435), (615, 435), (585, 315)], 'pivot': (645, 265), 'parent': 'torso',      'blur': 18, 'weld_radius': 72},
        {'name': 'buckler_l',  'poly': [(40, 355), (330, 355), (315, 560), (245, 725), (185, 855), (40, 855)],   'pivot': (265, 385), 'parent': 'shoulder_l', 'blur': 20},
        {'name': 'shoulder_l', 'poly': [(160, 170), (365, 170), (345, 300), (330, 395), (160, 395)], 'pivot': (330, 265), 'parent': 'torso',      'blur': 20, 'weld_radius': 95},
        {'name': 'head',       'poly': [(380, 90), (575, 90), (575, 265), (515, 295), (415, 295), (380, 250)], 'pivot': (475, 265), 'parent': 'torso', 'blur': 16},
        {'name': 'shin_l',     'poly': [(180, 710), (455, 735), (455, 975), (180, 975)], 'pivot': (355, 945), 'parent': None},
        {'name': 'thigh_l',    'poly': [(235, 535), (465, 565), (455, 740), (215, 715)], 'pivot': (395, 565), 'parent': 'pelvis'},
        {'name': 'shin_r',     'poly': [(510, 715), (745, 715), (745, 998), (510, 998)], 'pivot': (635, 965), 'parent': None},
        {'name': 'thigh_r',    'poly': [(495, 555), (695, 520), (720, 725), (510, 725)], 'pivot': (575, 565), 'parent': 'pelvis'},
        {'name': 'pelvis',     'poly': [(350, 470), (630, 470), (610, 635), (370, 635)], 'pivot': (485, 565), 'parent': None},
        {'name': 'torso',      'poly': None, 'pivot': (485, 510), 'parent': 'pelvis'},
    ]
    ik_legs = [
        {'thigh': 'thigh_l', 'shin': 'shin_l', 'hip_parent': 'pelvis', 'H': (395, 565), 'K': (335, 720), 'A': (355, 945)},
        {'thigh': 'thigh_r', 'shin': 'shin_r', 'hip_parent': 'pelvis', 'H': (575, 565), 'K': (610, 725), 'A': (635, 965)},
    ]
    chains = [
        ['thigh_l', 'shin_l'],
        ['thigh_r', 'shin_r'],
        ['pelvis', 'torso', 'head'],
        ['shoulder_l', 'buckler_l'],
        ['shoulder_r', 'shield_r'],
    ]
    rig = SkinnedEnemy('guardian', parts_spec, ik_legs=ik_legs, chains=chains, base_size=234, blur_radius=16)

    # 0행: 공격 — 양발은 지면에 고정된 채 무릎을 굽히고, 양어깨·팔꿈치 관절을 회전시켜 방패 강타!
    atk = [
        ({'pelvis': {'dx': 14, 'dy': 16, 'rot': 4}, 'torso': {'rot': 8}, 'head': {'rot': -6},
          'shoulder_l': {'rot': -8}, 'buckler_l': {'rot': -10}, 'shoulder_r': {'rot': -14}, 'shield_r': {'rot': -14}}, 1.0, 0.0, None),
        ({'pelvis': {'dx': 26, 'dy': 28, 'rot': 7}, 'torso': {'rot': 14}, 'head': {'rot': -12},
          'shoulder_l': {'rot': -14}, 'buckler_l': {'rot': -18}, 'shoulder_r': {'rot': -24}, 'shield_r': {'rot': -22}}, 1.04, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX + 42, GY - 155, (8, 24), C_RED_HI, C_INK, 6), c)[1]),
        ({'pelvis': {'dx': -28, 'dy': 26, 'rot': -7}, 'torso': {'rot': -14}, 'head': {'rot': 10},
          'shoulder_l': {'rot': 14}, 'buckler_l': {'rot': 18}, 'shoulder_r': {'rot': 18}, 'shield_r': {'rot': 20}}, 1.08, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 62, GY - 115, 22, 54, C_SILVER, C_INK, width=3, dashed=True), c)[1]),
        ({'pelvis': {'dx': -42, 'dy': 38, 'rot': -10}, 'torso': {'rot': -18}, 'head': {'rot': 14},
          'shoulder_l': {'rot': 18}, 'buckler_l': {'rot': 24}, 'shoulder_r': {'rot': 26}, 'shield_r': {'rot': 26}}, 1.12, 0.0,
         lambda c, r: (
             draw_hex_shield(ImageDraw.Draw(c), GX - 92, GY - 115, 46, color=C_IVORY, border=C_BRASS, fill_alpha=85),
             draw_pixel_burst(ImageDraw.Draw(c), GX - 102, GY - 115, (14, 42), C_WHITE, C_INK, 8), c)[2]),
        ({'pelvis': {'dx': -16, 'dy': 14, 'rot': -4}, 'torso': {'rot': -8}, 'head': {'rot': 6},
          'shoulder_l': {'rot': 8}, 'buckler_l': {'rot': 10}, 'shoulder_r': {'rot': 10}, 'shield_r': {'rot': 12}}, 1.02, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]

    # 1행: 피격 — 발은 땅에 버틴 채 무릎이 꺾이고, 상체와 머리가 뒤로 젖혀지며 양쪽 방패 팔이 어깨·팔꿈치 관절에서 젖혀진다!
    hit = [
        ({'pelvis': {'dx': 18, 'dy': 18, 'rot': 5}, 'torso': {'rot': 8}, 'head': {'rot': 12},
          'shoulder_l': {'rot': 8}, 'buckler_l': {'rot': 10}, 'shoulder_r': {'rot': -14}, 'shield_r': {'rot': -14}}, 1.22, 0.0,
         lambda c, r: draw_hit_spark(c, GX - 16, GY - 125, is_red=True)),
        ({'pelvis': {'dx': 32, 'dy': 34, 'rot': 8}, 'torso': {'rot': 14}, 'head': {'rot': 18},
          'shoulder_l': {'rot': 12}, 'buckler_l': {'rot': 14}, 'shoulder_r': {'rot': -22}, 'shield_r': {'rot': -22}}, 1.10, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX, GY - 135, (10, 28), C_IVORY, C_INK, 7), c)[1]),
        ({'pelvis': {'dx': 38, 'dy': 42, 'rot': 10}, 'torso': {'rot': 16}, 'head': {'rot': 22},
          'shoulder_l': {'rot': 14}, 'buckler_l': {'rot': 16}, 'shoulder_r': {'rot': -26}, 'shield_r': {'rot': -26}}, 0.95, 0.0,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX + 12, GY - 120, 36, 5, C_SMOKE, C_SILVER), c)[1]),
        ({'pelvis': {'dx': 20, 'dy': 22, 'rot': 5}, 'torso': {'rot': 8}, 'head': {'rot': 12},
          'shoulder_l': {'rot': 8}, 'buckler_l': {'rot': 10}, 'shoulder_r': {'rot': -14}, 'shield_r': {'rot': -14}}, 0.98, 0.0, None),
        ({'pelvis': {'dx': 8, 'dy': 10, 'rot': 2}, 'torso': {'rot': 4}, 'head': {'rot': 6},
          'shoulder_l': {'rot': 4}, 'buckler_l': {'rot': 4}, 'shoulder_r': {'rot': -6}, 'shield_r': {'rot': -6}}, 1.0, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]

    # 2행: 사망 — 무릎이 완전히 꺾이며 골반이 내려앉고, 상체와 고개가 앞으로 숙여지며 양팔 방패가 축 늘어진다
    death = [
        ({'pelvis': {'dx': 16, 'dy': 32, 'rot': 6}, 'torso': {'rot': 12}, 'head': {'rot': 16},
          'shoulder_l': {'rot': 12}, 'buckler_l': {'rot': 14}, 'shoulder_r': {'rot': -16}, 'shield_r': {'rot': -16}}, 1.15, 0.10,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX, GY - 120, (12, 42), C_RED_HI, C_INK, 8), c)[1]),
        ({'pelvis': {'dx': 8, 'dy': 75, 'rot': -8}, 'shin_l': {'foot_dx': -28}, 'shin_r': {'foot_dx': 28},
          'torso': {'rot': -12}, 'head': {'rot': -16}, 'shoulder_l': {'rot': 12}, 'buckler_l': {'rot': 14}, 'shoulder_r': {'rot': 14}, 'shield_r': {'rot': 16}}, 0.92, 0.28,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX + 8, GY - 95, 42, 6, C_SMOKE, C_SILVER), c)[1]),
        ({'pelvis': {'dx': 4, 'dy': 125, 'rot': -14}, 'shin_l': {'foot_dx': -52}, 'shin_r': {'foot_dx': 52},
          'torso': {'rot': -18}, 'head': {'rot': -22}, 'shoulder_l': {'rot': 16}, 'buckler_l': {'rot': 18}, 'shoulder_r': {'rot': 20}, 'shield_r': {'rot': 20}}, 0.82, 0.48,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX, GY - 45, 58, 7, C_SMOKE, C_BRASS), c)[1]),
        ({'pelvis': {'dx': 0, 'dy': 165, 'rot': -18}, 'shin_l': {'foot_dx': -70}, 'shin_r': {'foot_dx': 70},
          'torso': {'rot': -22}, 'head': {'rot': -26}, 'shoulder_l': {'rot': 18}, 'buckler_l': {'rot': 22}, 'shoulder_r': {'rot': 24}, 'shield_r': {'rot': 24}}, 0.72, 0.68, None),
        ({'pelvis': {'dx': 0, 'dy': 192, 'rot': -20}, 'shin_l': {'foot_dx': -82}, 'shin_r': {'foot_dx': 82},
          'torso': {'rot': -24}, 'head': {'rot': -28}, 'shoulder_l': {'rot': 20}, 'buckler_l': {'rot': 24}, 'shoulder_r': {'rot': 26}, 'shield_r': {'rot': 26}}, 0.64, 0.84, None),
        ({'pelvis': {'dx': 0, 'dy': 206, 'rot': -22}, 'shin_l': {'foot_dx': -88}, 'shin_r': {'foot_dx': 88},
          'torso': {'rot': -26}, 'head': {'rot': -30}, 'shoulder_l': {'rot': 22}, 'buckler_l': {'rot': 26}, 'shoulder_r': {'rot': 28}, 'shield_r': {'rot': 28}}, 0.58, 0.92, None),
    ]

    # 3행: 스킬 — 무릎을 깊게 굽혀 방어 태세를 잡고, 좌우 양팔 방패를 몸통 안쪽으로 모아 육각 배리어 전개!
    skill = [
        ({'pelvis': {'dy': 22}, 'torso': {'rot': -4}, 'head': {'rot': 6},
          'shoulder_l': {'rot': -10}, 'buckler_l': {'rot': -14}, 'shoulder_r': {'rot': 14}, 'shield_r': {'rot': 16}}, 1.06, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX, GY - 10, 76, 16, C_BRASS, C_INK, 3), c)[1]),
        ({'pelvis': {'dy': 40}, 'torso': {'rot': -8}, 'head': {'rot': 10},
          'shoulder_l': {'rot': -16}, 'buckler_l': {'rot': -22}, 'shoulder_r': {'rot': 22}, 'shield_r': {'rot': 26}}, 1.12, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX, GY - 10, 88, 18, C_BRASS, C_INK, 3), c)[1]),
        ({'pelvis': {'dy': 48}, 'torso': {'rot': -10}, 'head': {'rot': 12},
          'shoulder_l': {'rot': -18}, 'buckler_l': {'rot': -26}, 'shoulder_r': {'rot': 26}, 'shield_r': {'rot': 30}}, 1.18, 0.0,
         lambda c, r: (draw_hex_shield(ImageDraw.Draw(c), GX - 64, GY - 115, 48, color=C_IVORY, border=C_BRASS, fill_alpha=75), c)[1]),
        ({'pelvis': {'dy': 48}, 'torso': {'rot': -10}, 'head': {'rot': 12},
          'shoulder_l': {'rot': -20}, 'buckler_l': {'rot': -28}, 'shoulder_r': {'rot': 28}, 'shield_r': {'rot': 32}}, 1.22, 0.0,
         lambda c, r: (
             draw_hex_shield(ImageDraw.Draw(c), GX - 74, GY - 115, 58, color=C_IVORY, border=C_BRASS, fill_alpha=80),
             draw_hex_shield(ImageDraw.Draw(c), GX - 26, GY - 125, 40, color=C_SILVER, border=C_IVORY, fill_alpha=55), c)[2]),
        ({'pelvis': {'dy': 24}, 'torso': {'rot': -5},
          'shoulder_l': {'rot': -10}, 'buckler_l': {'rot': -14}, 'shoulder_r': {'rot': 14}, 'shield_r': {'rot': 16}}, 1.06, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 64, GY - 115, (16, 44), C_IVORY, C_INK, 6), c)[1]),
        ({}, 1.0, 0.0, None),
    ]
    return assemble_sheet('guardian', rig, atk, hit, death, skill)


def build_disperser():
    """바이러스 살포기(Disperser) — 4족 보행 다리 2-Bone IK + 목 볼조인트(head) + 양쪽 분사 노즐 리깅."""
    parts_spec = [
        {'name': 'nozzle_l', 'poly': [(75, 440), (295, 440), (295, 575), (75, 575)],   'pivot': (265, 480), 'parent': 'head',   'z_weight': 1.3},
        {'name': 'nozzle_r', 'poly': [(410, 445), (520, 445), (520, 565), (410, 565)], 'pivot': (465, 480), 'parent': 'head',   'z_weight': 1.3},
        {'name': 'head',     'poly': [(180, 165), (860, 165), (860, 555), (575, 540), (355, 535), (180, 520)], 'pivot': (475, 530), 'parent': 'pelvis', 'z_weight': 1.2},
        {'name': 'shin_l',   'poly': [(40, 555), (215, 555), (215, 935), (40, 935)],   'pivot': (115, 900), 'parent': None},
        {'name': 'thigh_l',  'poly': [(170, 565), (355, 565), (320, 775), (165, 775)], 'pivot': (335, 620), 'parent': 'pelvis'},
        {'name': 'shin_r',   'poly': [(745, 555), (960, 555), (960, 935), (745, 935)], 'pivot': (865, 895), 'parent': None},
        {'name': 'thigh_r',  'poly': [(615, 565), (795, 565), (795, 780), (615, 780)], 'pivot': (625, 620), 'parent': 'pelvis'},
        {'name': 'leg_bl',   'poly': [(315, 730), (435, 730), (435, 925), (315, 925)], 'pivot': (365, 895), 'parent': None},
        {'name': 'leg_bl_u', 'poly': [(315, 620), (435, 620), (435, 745), (315, 745)], 'pivot': (385, 645), 'parent': 'pelvis'},
        {'name': 'leg_br',   'poly': [(495, 740), (625, 740), (625, 975), (495, 975)], 'pivot': (555, 940), 'parent': None},
        {'name': 'leg_br_u', 'poly': [(495, 565), (625, 565), (625, 755), (495, 755)], 'pivot': (545, 620), 'parent': 'pelvis'},
        {'name': 'pelvis',   'poly': None, 'pivot': (475, 620), 'parent': None},
    ]
    ik_legs = [
        {'thigh': 'thigh_l',  'shin': 'shin_l', 'hip_parent': 'pelvis', 'H': (335, 620), 'K': (195, 645), 'A': (115, 900)},
        {'thigh': 'thigh_r',  'shin': 'shin_r', 'hip_parent': 'pelvis', 'H': (625, 620), 'K': (775, 650), 'A': (865, 895)},
        {'thigh': 'leg_bl_u', 'shin': 'leg_bl', 'hip_parent': 'pelvis', 'H': (385, 645), 'K': (355, 760), 'A': (365, 895)},
        {'thigh': 'leg_br_u', 'shin': 'leg_br', 'hip_parent': 'pelvis', 'H': (545, 620), 'K': (555, 760), 'A': (555, 940)},
    ]
    chains = [
        ['leg_bl_u', 'leg_bl'],
        ['leg_br_u', 'leg_br'],
        ['thigh_l', 'shin_l'],
        ['thigh_r', 'shin_r'],
        ['pelvis', 'head'],
        ['nozzle_l'],
        ['nozzle_r'],
    ]
    rig = SkinnedEnemy('disperser', parts_spec, ik_legs=ik_legs, chains=chains, base_size=224, blur_radius=16)

    # 0행: 공격 — 네 발은 바닥에 고정된 채 골반이 뒤로 높였다가 앞으로 낮게 돌진하며, 목 관절에서 상단 돔 포탑이 숙여지고 노즐이 분사!
    atk = [
        ({'pelvis': {'dx': 18, 'dy': -16, 'rot': 4}, 'head': {'rot': 14}, 'nozzle_l': {'rot': 10}, 'nozzle_r': {'rot': 10}}, 1.0, 0.0, None),
        ({'pelvis': {'dx': 32, 'dy': -28, 'rot': 8}, 'head': {'rot': 24}, 'nozzle_l': {'rot': 18}, 'nozzle_r': {'rot': 18}}, 1.05, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 42, GY - 110, (8, 22), C_RED_HI, C_INK, 6), c)[1]),
        ({'pelvis': {'dx': -28, 'dy': 32, 'rot': -6}, 'head': {'rot': -18}, 'nozzle_l': {'rot': -14, 'sx': 1.15}, 'nozzle_r': {'rot': -14, 'sx': 1.15}}, 1.08, 0.0,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX - 62, GY - 98, 34, 8, C_RED, C_RED_HI), c)[1]),
        ({'pelvis': {'dx': -42, 'dy': 46, 'rot': -10}, 'head': {'rot': -26}, 'nozzle_l': {'rot': -20, 'sx': 1.25}, 'nozzle_r': {'rot': -20, 'sx': 1.25}}, 1.12, 0.0,
         lambda c, r: (
             draw_laser_beam(ImageDraw.Draw(c), GX - 38, GY - 92, 16, GY - 84, C_RED, C_RED_HI, h=14),
             draw_spores(ImageDraw.Draw(c), GX - 82, GY - 92, 48, 12, C_RED, C_RED_HI), c)[2]),
        ({'pelvis': {'dx': -16, 'dy': 18, 'rot': -3}, 'head': {'rot': -10}, 'nozzle_l': {'rot': -6}, 'nozzle_r': {'rot': -6}}, 1.02, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]

    # 1행: 피격 — 발은 지면에 고정된 채 네 다리 무릎이 굽혀지며 골반이 뒤로 밀리고, 상단 돔 포탑이 목 관절에서 뒤로 크게 젖혀진다!
    hit = [
        ({'pelvis': {'dx': 20, 'dy': 22, 'rot': 6}, 'head': {'rot': 22}, 'nozzle_l': {'rot': 16}, 'nozzle_r': {'rot': 16}}, 1.24, 0.0,
         lambda c, r: draw_hit_spark(c, GX - 24, GY - 115, is_red=True)),
        ({'pelvis': {'dx': 36, 'dy': 38, 'rot': 10}, 'head': {'rot': 36}, 'nozzle_l': {'rot': 28}, 'nozzle_r': {'rot': 28}}, 1.10, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX + 4, GY - 125, (10, 28), C_IVORY, C_INK, 7), c)[1]),
        ({'pelvis': {'dx': 44, 'dy': 46, 'rot': 12}, 'head': {'rot': 42}, 'nozzle_l': {'rot': 32}, 'nozzle_r': {'rot': 32}}, 0.94, 0.0,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX + 16, GY - 110, 36, 5, C_SMOKE, C_SILVER), c)[1]),
        ({'pelvis': {'dx': 22, 'dy': 24, 'rot': 6}, 'head': {'rot': 20}, 'nozzle_l': {'rot': 14}, 'nozzle_r': {'rot': 14}}, 0.98, 0.0, None),
        ({'pelvis': {'dx': 8, 'dy': 10, 'rot': 2}, 'head': {'rot': 8}}, 1.0, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]

    # 2행: 사망 — 다리가 바깥으로 미끄러져 벌어지며 골반이 바닥까지 주저앉고, 돔 포탑이 앞으로 푹 꺾인다
    death = [
        ({'pelvis': {'dx': 14, 'dy': 36, 'rot': 8}, 'head': {'rot': 22}}, 1.15, 0.10,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX, GY - 105, (12, 42), C_RED_HI, C_INK, 8), c)[1]),
        ({'pelvis': {'dy': 85, 'rot': -8}, 'shin_l': {'foot_dx': -35}, 'shin_r': {'foot_dx': 35}, 'head': {'rot': -16}}, 0.92, 0.28,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX, GY - 85, 42, 6, C_SMOKE, C_SILVER), c)[1]),
        ({'pelvis': {'dy': 135, 'rot': -16}, 'shin_l': {'foot_dx': -65}, 'shin_r': {'foot_dx': 65}, 'head': {'rot': -28}}, 0.82, 0.48,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX, GY - 40, 58, 7, C_SMOKE, C_BRASS), c)[1]),
        ({'pelvis': {'dy': 175, 'rot': -22}, 'shin_l': {'foot_dx': -90}, 'shin_r': {'foot_dx': 90}, 'head': {'rot': -36}}, 0.72, 0.68, None),
        ({'pelvis': {'dy': 198, 'rot': -26}, 'shin_l': {'foot_dx': -105}, 'shin_r': {'foot_dx': 105}, 'head': {'rot': -40}}, 0.64, 0.84, None),
        ({'pelvis': {'dy': 210, 'rot': -28}, 'shin_l': {'foot_dx': -112}, 'shin_r': {'foot_dx': 112}, 'head': {'rot': -42}}, 0.58, 0.92, None),
    ]

    # 3행: 스킬 — 네 다리로 깊게 웅크렸다가 솟구치며 상단 돔 포탑을 치켜들고 맹독 포자 구름 분출!
    skill = [
        ({'pelvis': {'dy': 36}, 'head': {'rot': -14}}, 1.06, 0.0, None),
        ({'pelvis': {'dy': -22}, 'head': {'rot': 18}, 'nozzle_l': {'rot': 16}, 'nozzle_r': {'rot': -14}}, 1.14, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX, GY - 115, 52, 34, C_RED, C_INK, 3, dashed=True), c)[1]),
        ({'pelvis': {'dy': -34}, 'head': {'rot': 26}, 'nozzle_l': {'rot': 24}, 'nozzle_r': {'rot': -20}}, 1.20, 0.0,
         lambda c, r: (
             draw_pixel_ring(ImageDraw.Draw(c), GX, GY - 118, 68, 44, C_RED, C_INK, 3, dashed=True),
             draw_spores(ImageDraw.Draw(c), GX - 18, GY - 115, 64, 16, C_RED, C_RED_HI), c)[2]),
        ({'pelvis': {'dx': -22, 'dy': 28}, 'head': {'rot': -20}, 'nozzle_l': {'rot': -18, 'sx': 1.2}, 'nozzle_r': {'rot': 14, 'sx': 1.2}}, 1.22, 0.0,
         lambda c, r: (
             draw_pixel_ring(ImageDraw.Draw(c), GX, GY - 112, 84, 54, C_RED, C_INK, 3, dashed=True),
             draw_spores(ImageDraw.Draw(c), GX - 24, GY - 112, 88, 22, C_RED, C_RED_HI), c)[2]),
        ({'pelvis': {'dy': 12}, 'head': {'rot': -8}}, 1.06, 0.0,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX - 20, GY - 112, 96, 14, C_RED, C_RED_HI), c)[1]),
        ({}, 1.0, 0.0, None),
    ]
    return assemble_sheet('disperser', rig, atk, hit, death, skill)


def build_sentinel():
    """센티넬 하이브-01(Sentinel) — 4족 다리 2-Bone IK + 허리(torso) + 양어깨 미사일 포드(pod_l, pod_r) + 방열판(fins) 리깅."""
    parts_spec = [
        {'name': 'pod_l',    'poly': [(120, 185), (355, 185), (355, 345), (120, 345)], 'pivot': (310, 310), 'parent': 'torso',  'z_weight': 1.2},
        {'name': 'pod_r',    'poly': [(570, 185), (845, 185), (845, 455), (570, 420)], 'pivot': (635, 330), 'parent': 'torso',  'z_weight': 1.3},
        {'name': 'fins',     'poly': [(360, 75),  (795, 75),  (740, 290), (360, 260)], 'pivot': (515, 255), 'parent': 'torso',  'z_weight': 1.1},
        {'name': 'torso',    'poly': [(245, 215), (725, 215), (725, 550), (245, 550)], 'pivot': (475, 520), 'parent': 'pelvis', 'z_weight': 1.2},
        {'name': 'shin_l',   'poly': [(40, 560),  (215, 560), (215, 960), (40, 960)],  'pivot': (115, 920), 'parent': None},
        {'name': 'thigh_l',  'poly': [(165, 565), (355, 565), (320, 785), (165, 785)], 'pivot': (335, 620), 'parent': 'pelvis'},
        {'name': 'shin_r',   'poly': [(745, 560), (960, 560), (960, 960), (745, 960)], 'pivot': (865, 915), 'parent': None},
        {'name': 'thigh_r',  'poly': [(615, 565), (795, 565), (795, 785), (615, 785)], 'pivot': (625, 620), 'parent': 'pelvis'},
        {'name': 'leg_bl',   'poly': [(315, 730), (435, 730), (435, 945), (315, 945)], 'pivot': (365, 910), 'parent': None},
        {'name': 'leg_bl_u', 'poly': [(315, 620), (435, 620), (435, 745), (315, 745)], 'pivot': (385, 645), 'parent': 'pelvis'},
        {'name': 'leg_br',   'poly': [(495, 740), (625, 740), (625, 975), (495, 975)], 'pivot': (555, 945), 'parent': None},
        {'name': 'leg_br_u', 'poly': [(495, 565), (625, 565), (625, 755), (495, 755)], 'pivot': (545, 620), 'parent': 'pelvis'},
        {'name': 'pelvis',   'poly': None, 'pivot': (475, 620), 'parent': None},
    ]
    ik_legs = [
        {'thigh': 'thigh_l',  'shin': 'shin_l', 'hip_parent': 'pelvis', 'H': (335, 620), 'K': (195, 650), 'A': (115, 920)},
        {'thigh': 'thigh_r',  'shin': 'shin_r', 'hip_parent': 'pelvis', 'H': (625, 620), 'K': (775, 655), 'A': (865, 915)},
        {'thigh': 'leg_bl_u', 'shin': 'leg_bl', 'hip_parent': 'pelvis', 'H': (385, 645), 'K': (355, 770), 'A': (365, 910)},
        {'thigh': 'leg_br_u', 'shin': 'leg_br', 'hip_parent': 'pelvis', 'H': (545, 620), 'K': (555, 770), 'A': (555, 945)},
    ]
    chains = [
        ['leg_bl_u', 'leg_bl'],
        ['leg_br_u', 'leg_br'],
        ['thigh_l', 'shin_l'],
        ['thigh_r', 'shin_r'],
        ['fins'],
        ['pelvis', 'torso'],
        ['pod_l'],
        ['pod_r'],
    ]
    rig = SkinnedEnemy('sentinel', parts_spec, ik_legs=ik_legs, chains=chains, base_size=242, blur_radius=16)

    # 0행: 공격 — 네 발은 바닥에 고정된 채 다리 무릎이 굽혀지고, 콕핏 상체가 전방으로 숙여지며 양어깨 미사일 포드와 방열판이 조준 발사!
    atk = [
        ({'pelvis': {'dx': 16, 'dy': -14, 'rot': 4}, 'torso': {'rot': 10}, 'fins': {'rot': 12}, 'pod_l': {'rot': 14}, 'pod_r': {'rot': 16}}, 1.0, 0.0, None),
        ({'pelvis': {'dx': 28, 'dy': -26, 'rot': 8}, 'torso': {'rot': 18}, 'fins': {'rot': 22}, 'pod_l': {'rot': 26}, 'pod_r': {'rot': 28}}, 1.05, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX, GY - 175, (10, 28), C_RED_HI, C_INK, 6), c)[1]),
        ({'pelvis': {'dx': -26, 'dy': 28, 'rot': -6}, 'torso': {'rot': -16}, 'fins': {'rot': -14}, 'pod_l': {'rot': -22}, 'pod_r': {'rot': -26}}, 1.08, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 48, GY - 125, 20, 48, C_RED_HI, C_INK, 3, dashed=True), c)[1]),
        ({'pelvis': {'dx': -38, 'dy': 42, 'rot': -10}, 'torso': {'rot': -22}, 'fins': {'rot': -18}, 'pod_l': {'rot': -30}, 'pod_r': {'rot': -34}}, 1.12, 0.0,
         lambda c, r: (
             draw_laser_beam(ImageDraw.Draw(c), GX - 36, GY - 112, 10, GY - 112, C_RED, C_WHITE, h=12),
             draw_laser_beam(ImageDraw.Draw(c), GX - 44, GY - 155, 16, GY - 175, C_BRASS, C_IVORY, h=8),
             draw_pixel_burst(ImageDraw.Draw(c), 24, GY - 112, (10, 34), C_WHITE, C_INK, 8), c)[3]),
        ({'pelvis': {'dx': -14, 'dy': 16, 'rot': -3}, 'torso': {'rot': -8}, 'fins': {'rot': -6}, 'pod_l': {'rot': -10}, 'pod_r': {'rot': -12}}, 1.02, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]

    # 1행: 피격 — 발은 지면에 고정된 채 무릎이 굽혀지고, 상체 콕핏이 허리에서 뒤로 젖혀지며 좌우 미사일 포드와 방열판이 뒤로 꺾인다!
    hit = [
        ({'pelvis': {'dx': 20, 'dy': 20, 'rot': 6}, 'torso': {'rot': 18}, 'fins': {'rot': 22}, 'pod_l': {'rot': 24}, 'pod_r': {'rot': 28}}, 1.24, 0.0,
         lambda c, r: draw_hit_spark(c, GX - 26, GY - 128, is_red=True)),
        ({'pelvis': {'dx': 34, 'dy': 34, 'rot': 10}, 'torso': {'rot': 30}, 'fins': {'rot': 36}, 'pod_l': {'rot': 38}, 'pod_r': {'rot': 42}}, 1.10, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX + 4, GY - 140, (10, 28), C_IVORY, C_INK, 7), c)[1]),
        ({'pelvis': {'dx': 42, 'dy': 42, 'rot': 12}, 'torso': {'rot': 36}, 'fins': {'rot': 42}, 'pod_l': {'rot': 44}, 'pod_r': {'rot': 48}}, 0.94, 0.0,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX + 16, GY - 135, 38, 6, C_SMOKE, C_SILVER), c)[1]),
        ({'pelvis': {'dx': 20, 'dy': 20, 'rot': 6}, 'torso': {'rot': 16}, 'fins': {'rot': 18}, 'pod_l': {'rot': 20}, 'pod_r': {'rot': 22}}, 0.98, 0.0, None),
        ({'pelvis': {'dx': 8, 'dy': 8, 'rot': 2}, 'torso': {'rot': 6}, 'pod_l': {'rot': 8}, 'pod_r': {'rot': 10}}, 1.0, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]

    # 3행: 스킬 — 네 다리로 깊게 버티며 등 방열판과 양쪽 미사일 포드를 치켜올렸다가 전탄 포격 + 육각 방벽 전개!
    skill = [
        ({'pelvis': {'dy': 22}, 'torso': {'rot': 8}, 'fins': {'rot': 14, 'sy': 1.1}, 'pod_l': {'rot': 18}, 'pod_r': {'rot': 20}}, 1.06, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX, GY - 12, 86, 18, C_RED, C_INK, 3), c)[1]),
        ({'pelvis': {'dy': 34}, 'torso': {'rot': 14}, 'fins': {'rot': 24, 'sy': 1.2}, 'pod_l': {'rot': 30}, 'pod_r': {'rot': 34}}, 1.14, 0.0,
         lambda c, r: (
             draw_pixel_burst(ImageDraw.Draw(c), GX - 34, GY - 178, (12, 36), C_RED_HI, C_INK, 8),
             draw_pixel_burst(ImageDraw.Draw(c), GX + 36, GY - 178, (12, 36), C_RED_HI, C_INK, 8), c)[2]),
        ({'pelvis': {'dx': -16, 'dy': 38}, 'torso': {'rot': -12}, 'fins': {'rot': -10, 'sy': 1.2}, 'pod_l': {'rot': -22}, 'pod_r': {'rot': -26}}, 1.18, 0.0,
         lambda c, r: (
             draw_hex_shield(ImageDraw.Draw(c), GX - 72, GY - 120, 42, color=C_RED_HI, border=C_RED, fill_alpha=55),
             draw_pixel_ring(ImageDraw.Draw(c), GX, GY - 125, 95, 95, C_RED, C_INK, 3, dashed=True), c)[2]),
        ({'pelvis': {'dx': -26, 'dy': 44}, 'torso': {'rot': -18}, 'fins': {'rot': -16, 'sy': 1.2}, 'pod_l': {'rot': -30}, 'pod_r': {'rot': -34}}, 1.22, 0.0,
         lambda c, r: (
             draw_laser_beam(ImageDraw.Draw(c), GX - 32, GY - 118, 12, GY - 118, C_RED, C_WHITE, h=14),
             draw_laser_beam(ImageDraw.Draw(c), GX - 42, GY - 165, 16, GY - 195, C_BRASS, C_IVORY, h=8),
             draw_laser_beam(ImageDraw.Draw(c), GX + 16, GY - 165, 24, GY - 150, C_BRASS, C_IVORY, h=8),
             draw_hex_shield(ImageDraw.Draw(c), GX - 92, GY - 122, 52, color=C_RED_HI, border=C_IVORY, fill_alpha=75), c)[4]),
        ({'pelvis': {'dy': 16}, 'torso': {'rot': -6}, 'pod_l': {'rot': -10}, 'pod_r': {'rot': -12}}, 1.05, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 70, GY - 122, 28, 56, C_RED, C_INK, 2, dashed=True), c)[1]),
        ({}, 1.0, 0.0, None),
    ]

    # 2행: 사망 — 네 다리가 벌어지며 주저앉고, 포드와 방열판이 앞으로 떨어진다.
    # 예전에는 이 줄만 옛 AI 시트(actions/sentinel.png)에서 잘라 왔는데, 포드 모양이 다른 그림이라 쓰러지는 순간
    # 다른 기체로 바뀌어 보였고 불꽃도 주황색이었다. 다른 줄과 같은 그림(리그)으로 만든다
    death = [
        ({'pelvis': {'dx': 14, 'dy': 30, 'rot': 6}, 'torso': {'rot': 14}, 'fins': {'rot': 18}, 'pod_l': {'rot': 20}, 'pod_r': {'rot': 24}}, 1.15, 0.10,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX, GY - 125, (12, 42), C_RED_HI, C_INK, 8), c)[1]),
        ({'pelvis': {'dy': 70, 'rot': -6}, 'shin_l': {'foot_dx': -24}, 'shin_r': {'foot_dx': 24},
          'torso': {'rot': -10}, 'fins': {'rot': -8}, 'pod_l': {'rot': -18}, 'pod_r': {'rot': -22}}, 0.92, 0.28,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX, GY - 95, 42, 6, C_SMOKE, C_SILVER), c)[1]),
        ({'pelvis': {'dy': 108, 'rot': -12}, 'shin_l': {'foot_dx': -46}, 'shin_r': {'foot_dx': 46},
          'torso': {'rot': -16}, 'fins': {'rot': -14}, 'pod_l': {'rot': -30}, 'pod_r': {'rot': -34}}, 0.82, 0.48,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX, GY - 50, 58, 7, C_SMOKE, C_BRASS), c)[1]),
        ({'pelvis': {'dy': 138, 'rot': -16}, 'shin_l': {'foot_dx': -64}, 'shin_r': {'foot_dx': 64},
          'torso': {'rot': -20}, 'fins': {'rot': -18}, 'pod_l': {'rot': -38}, 'pod_r': {'rot': -42}}, 0.72, 0.68, None),
        ({'pelvis': {'dy': 154, 'rot': -19}, 'shin_l': {'foot_dx': -74}, 'shin_r': {'foot_dx': 74},
          'torso': {'rot': -23}, 'fins': {'rot': -21}, 'pod_l': {'rot': -44}, 'pod_r': {'rot': -48}}, 0.64, 0.84, None),
        ({'pelvis': {'dy': 162, 'rot': -20}, 'shin_l': {'foot_dx': -78}, 'shin_r': {'foot_dx': 78},
          'torso': {'rot': -24}, 'fins': {'rot': -22}, 'pod_l': {'rot': -46}, 'pod_r': {'rot': -50}}, 0.58, 0.92, None),
    ]
    return assemble_sheet('sentinel', rig, atk, hit, death, skill)


def build_drone():
    """정찰 드론(Drone) — 4날개 경첩(wing_ul, wing_ur, wing_ll, wing_lr) + 하부 관절 발톱(claw_l, claw_r, claw_b) 스키닝."""
    parts_spec = [
        {'name': 'wing_ul', 'poly': [(75, 195), (405, 195), (365, 395), (245, 425), (75, 310)],  'pivot': (345, 340), 'parent': 'body',   'z_weight': 1.2},
        {'name': 'wing_ll', 'poly': [(215, 445), (305, 445), (295, 585), (215, 585)],            'pivot': (285, 470), 'parent': 'body'},
        {'name': 'wing_ur', 'poly': [(535, 195), (985, 195), (985, 315), (615, 435), (535, 375)],'pivot': (575, 345), 'parent': 'body',   'z_weight': 1.2},
        {'name': 'wing_lr', 'poly': [(570, 395), (950, 395), (950, 598), (680, 598), (570, 480)],'pivot': (615, 435), 'parent': 'body'},
        {'name': 'claw_l',  'poly': [(295, 575), (395, 575), (400, 885), (295, 885)],            'pivot': (350, 610), 'parent': 'pelvis', 'z_weight': 1.2},
        {'name': 'claw_r',  'poly': [(400, 585), (535, 585), (535, 895), (400, 895)],            'pivot': (485, 610), 'parent': 'pelvis', 'z_weight': 1.2},
        {'name': 'claw_b',  'poly': [(515, 555), (625, 555), (625, 790), (515, 790)],            'pivot': (555, 595), 'parent': 'pelvis'},
        {'name': 'pelvis',  'poly': [(310, 520), (605, 520), (540, 710), (340, 710)],            'pivot': (445, 545), 'parent': 'body'},
        {'name': 'body',    'poly': None, 'pivot': (445, 420), 'parent': None},
    ]
    chains = [
        ['wing_ll'],
        ['wing_lr'],
        ['claw_b'],
        ['body', 'pelvis'],
        ['claw_l'],
        ['claw_r'],
        ['wing_ul'],
        ['wing_ur'],
    ]
    rig = SkinnedEnemy('drone', parts_spec, chains=chains, base_size=232, blur_radius=15)

    # 0행: 공격 — 날개가 경첩에서 위아래로 크게 퍼덕이고, 하부 관절 발톱이 뒤로 접혔다가 전방으로 할퀴며 레이저 발사!
    atk = [
        ({'body': {'rot': 8, 'dx': 14, 'dy': -14},
          'wing_ul': {'rot': 22}, 'wing_ur': {'rot': -24}, 'wing_ll': {'rot': 16}, 'wing_lr': {'rot': -18},
          'pelvis': {'rot': 12}, 'claw_l': {'rot': -24}, 'claw_r': {'rot': -28}, 'claw_b': {'rot': -18}}, 1.0, 0.0, None),
        ({'body': {'rot': 14, 'dx': 24, 'dy': -26},
          'wing_ul': {'rot': 38}, 'wing_ur': {'rot': -42}, 'wing_ll': {'rot': 28}, 'wing_lr': {'rot': -32},
          'pelvis': {'rot': 22}, 'claw_l': {'rot': -42}, 'claw_r': {'rot': -48}, 'claw_b': {'rot': -30}}, 1.05, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 36, GY - 105, (8, 22), C_RED_HI, C_INK, 6), c)[1]),
        ({'body': {'rot': -14, 'dx': -26, 'dy': 14},
          'wing_ul': {'rot': -28}, 'wing_ur': {'rot': 32}, 'wing_ll': {'rot': -22}, 'wing_lr': {'rot': 26},
          'pelvis': {'rot': -18}, 'claw_l': {'rot': 38}, 'claw_r': {'rot': 34}, 'claw_b': {'rot': -16}}, 1.08, 0.0,
         lambda c, r: (draw_lightning_arc(ImageDraw.Draw(c), [(GX - 28, GY - 92), (GX - 68, GY - 80), (GX - 110, GY - 88)], C_RED_HI), c)[1]),
        ({'body': {'rot': -18, 'dx': -38, 'dy': 22},
          'wing_ul': {'rot': -38}, 'wing_ur': {'rot': 44}, 'wing_ll': {'rot': -30}, 'wing_lr': {'rot': 36},
          'pelvis': {'rot': -24}, 'claw_l': {'rot': 52}, 'claw_r': {'rot': 46}, 'claw_b': {'rot': -22}}, 1.12, 0.0,
         lambda c, r: (
             draw_laser_beam(ImageDraw.Draw(c), GX - 34, GY - 98, 10, GY - 72, C_RED, C_WHITE, h=12),
             draw_pixel_burst(ImageDraw.Draw(c), 24, GY - 76, (10, 34), C_WHITE, C_INK, 8), c)[2]),
        ({'body': {'rot': -6, 'dx': -14, 'dy': 6},
          'wing_ul': {'rot': -12}, 'wing_ur': {'rot': 14}, 'wing_ll': {'rot': -10}, 'wing_lr': {'rot': 12},
          'pelvis': {'rot': -8}, 'claw_l': {'rot': 18}, 'claw_r': {'rot': 16}}, 1.02, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]

    # 1행: 피격 — 좌우 날개가 비대칭 각도로 퍼덕이며 꺾이고, 하부 집게발톱이 관성으로 뒤로 흔들린다!
    hit = [
        ({'body': {'rot': 10, 'dx': 16, 'dy': -8},
          'wing_ul': {'rot': 24}, 'wing_ur': {'rot': 14}, 'wing_ll': {'rot': -18}, 'wing_lr': {'rot': 20},
          'pelvis': {'rot': -12}, 'claw_l': {'rot': -20}, 'claw_r': {'rot': -24}, 'claw_b': {'rot': -16}}, 1.24, 0.0,
         lambda c, r: draw_hit_spark(c, GX - 28, GY - 102, is_red=True)),
        ({'body': {'rot': 16, 'dx': 28, 'dy': -14},
          'wing_ul': {'rot': 36}, 'wing_ur': {'rot': 22}, 'wing_ll': {'rot': -28}, 'wing_lr': {'rot': 30},
          'pelvis': {'rot': -18}, 'claw_l': {'rot': -28}, 'claw_r': {'rot': -34}, 'claw_b': {'rot': -22}}, 1.10, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 6, GY - 110, (10, 28), C_IVORY, C_INK, 7), c)[1]),
        ({'body': {'rot': 20, 'dx': 34, 'dy': -16},
          'wing_ul': {'rot': 42}, 'wing_ur': {'rot': 26}, 'wing_ll': {'rot': -32}, 'wing_lr': {'rot': 36},
          'pelvis': {'rot': -22}, 'claw_l': {'rot': -32}, 'claw_r': {'rot': -38}, 'claw_b': {'rot': -26}}, 0.94, 0.0,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX + 12, GY - 98, 36, 5, C_SMOKE, C_SILVER), c)[1]),
        ({'body': {'rot': 10, 'dx': 16, 'dy': -6},
          'wing_ul': {'rot': 20}, 'wing_ur': {'rot': 12}, 'wing_ll': {'rot': -14}, 'wing_lr': {'rot': 16},
          'pelvis': {'rot': -10}, 'claw_l': {'rot': -16}, 'claw_r': {'rot': -20}}, 0.98, 0.0, None),
        ({'body': {'rot': 4, 'dx': 6}, 'wing_ul': {'rot': 8}, 'wing_ur': {'rot': 5}, 'pelvis': {'rot': -4}, 'claw_l': {'rot': -6}, 'claw_r': {'rot': -8}}, 1.0, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]

    # 2행: 사망 — 양쪽 날개가 아래로 축 처지고 발톱이 벌어지며 지면으로 추락
    death = [
        ({'body': {'rot': 12, 'dy': 12}, 'wing_ul': {'rot': 28}, 'wing_ur': {'rot': -28}, 'pelvis': {'rot': -14}, 'claw_l': {'rot': -22}, 'claw_r': {'rot': 18}}, 1.15, 0.10,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX, GY - 95, (12, 42), C_RED_HI, C_INK, 8), c)[1]),
        ({'body': {'rot': -12, 'dy': 55}, 'wing_ul': {'rot': -22}, 'wing_ur': {'rot': 24}, 'wing_ll': {'rot': -18}, 'wing_lr': {'rot': 20},
          'pelvis': {'rot': 12}, 'claw_l': {'rot': 22}, 'claw_r': {'rot': -22}}, 0.92, 0.28,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX, GY - 80, 42, 6, C_SMOKE, C_SILVER), c)[1]),
        ({'body': {'rot': -20, 'dy': 110}, 'wing_ul': {'rot': -32}, 'wing_ur': {'rot': 34}, 'wing_ll': {'rot': -26}, 'wing_lr': {'rot': 28},
          'pelvis': {'rot': 18}, 'claw_l': {'rot': 30}, 'claw_r': {'rot': -30}}, 0.82, 0.48,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX, GY - 40, 56, 7, C_SMOKE, C_BRASS), c)[1]),
        ({'body': {'rot': -26, 'dy': 155}, 'wing_ul': {'rot': -38}, 'wing_ur': {'rot': 40}, 'wing_ll': {'rot': -32}, 'wing_lr': {'rot': 34},
          'pelvis': {'rot': 22}, 'claw_l': {'rot': 36}, 'claw_r': {'rot': -36}}, 0.72, 0.68, None),
        ({'body': {'rot': -30, 'dy': 180}, 'wing_ul': {'rot': -42}, 'wing_ur': {'rot': 44}, 'wing_ll': {'rot': -36}, 'wing_lr': {'rot': 38},
          'pelvis': {'rot': 26}, 'claw_l': {'rot': 40}, 'claw_r': {'rot': -40}}, 0.64, 0.84, None),
        ({'body': {'rot': -32, 'dy': 192}, 'wing_ul': {'rot': -44}, 'wing_ur': {'rot': 46}, 'wing_ll': {'rot': -38}, 'wing_lr': {'rot': 40},
          'pelvis': {'rot': 28}, 'claw_l': {'rot': 42}, 'claw_r': {'rot': -42}}, 0.58, 0.92, None),
    ]

    # 3행: 스킬 — 4장의 날개가 X자로 활짝 펼쳐지고 하부 발톱이 전방으로 모아지며 수렴 레이저 발사!
    skill = [
        ({'body': {'dy': -12}, 'wing_ul': {'rot': 18}, 'wing_ur': {'rot': -18}, 'wing_ll': {'rot': -18}, 'wing_lr': {'rot': 18},
          'claw_l': {'rot': 18}, 'claw_r': {'rot': -18}}, 1.06, 0.0, None),
        ({'body': {'dy': -24}, 'wing_ul': {'rot': 32}, 'wing_ur': {'rot': -32}, 'wing_ll': {'rot': -32}, 'wing_lr': {'rot': 32},
          'claw_l': {'rot': 32}, 'claw_r': {'rot': 24}}, 1.14, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 28, GY - 102, 34, 34, C_RED_HI, C_INK, 3, dashed=True), c)[1]),
        ({'body': {'dy': -32}, 'wing_ul': {'rot': 42}, 'wing_ur': {'rot': -42}, 'wing_ll': {'rot': -42}, 'wing_lr': {'rot': 42},
          'claw_l': {'rot': 44}, 'claw_r': {'rot': 36}}, 1.20, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 28, GY - 104, 48, 48, C_RED_HI, C_INK, 3, dashed=True), c)[1]),
        ({'body': {'rot': -10, 'dx': -22, 'dy': -16},
          'wing_ul': {'rot': -24}, 'wing_ur': {'rot': 24}, 'wing_ll': {'rot': -36}, 'wing_lr': {'rot': 36},
          'pelvis': {'rot': -14}, 'claw_l': {'rot': 50}, 'claw_r': {'rot': 42}}, 1.22, 0.0,
         lambda c, r: (
             draw_laser_beam(ImageDraw.Draw(c), GX - 34, GY - 102, 8, GY - 102, C_RED, C_WHITE, h=16),
             draw_pixel_ring(ImageDraw.Draw(c), GX - 82, GY - 102, 18, 42, C_RED_HI, C_INK, 3), c)[2]),
        ({'body': {'rot': -4, 'dx': -8, 'dy': -6}, 'wing_ul': {'rot': -8}, 'wing_ur': {'rot': 8}, 'claw_l': {'rot': 18}, 'claw_r': {'rot': 14}}, 1.06, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 30, GY - 102, (8, 26), C_RED, C_INK, 6), c)[1]),
        ({}, 1.0, 0.0, None),
    ]
    return assemble_sheet('drone', rig, atk, hit, death, skill)


def build_gemini():
    """제미니(Gemini) — 양어깨·팔꿈치(arm_l, forearm_l, arm_r, forearm_r) + 두 얼굴(head_light, head_dark) + 헤일로(halo) + 하단 촉수(cables_f, cables_b)."""
    parts_spec = [
        {'name': 'forearm_l',  'poly': [(265, 545), (362, 545), (358, 815), (265, 815)], 'pivot': (330, 565), 'parent': 'arm_l', 'blur': 16},
        {'name': 'arm_l',      'poly': [(280, 365), (392, 365), (375, 445), (362, 565), (280, 565)], 'pivot': (385, 415), 'parent': 'torso', 'blur': 18, 'weld_radius': 68},
        {'name': 'forearm_r',  'poly': [(630, 550), (755, 550), (755, 810), (630, 810)], 'pivot': (675, 575), 'parent': 'arm_r', 'blur': 16},
        {'name': 'arm_r',      'poly': [(615, 370), (720, 370), (720, 575), (625, 575)], 'pivot': (635, 420), 'parent': 'torso', 'blur': 18, 'weld_radius': 68},
        {'name': 'head_light', 'poly': [(375, 100), (535, 100), (510, 355), (375, 355)], 'pivot': (465, 335), 'parent': 'torso', 'blur': 18},
        {'name': 'head_dark',  'poly': [(500, 100), (665, 100), (665, 365), (505, 365)], 'pivot': (560, 335), 'parent': 'torso', 'blur': 18},
        {'name': 'halo',       'polys': [[(200, 140), (390, 140), (370, 465), (200, 465)],
                                         [(635, 170), (790, 170), (790, 455), (650, 455)]], 'pivot': (495, 305), 'parent': 'torso', 'weld_radius': 0},
        {'name': 'cables_f',   'poly': [(170, 625), (505, 625), (475, 955), (170, 955)], 'pivot': (455, 645), 'parent': 'torso', 'blur': 22},
        {'name': 'cables_b',   'poly': [(450, 625), (670, 625), (670, 975), (420, 975)], 'pivot': (535, 645), 'parent': 'torso', 'blur': 22},
        {'name': 'torso',      'poly': None, 'pivot': (515, 620), 'parent': None, 'blur': 20},
    ]
    # 몸통·두 머리·하단 케이블을 하나의 연속 체인으로 묶어 목과 케이블 갈래 사이에 빈틈이 절대 생기지 않게 한다
    chains = [
        ['halo'],
        ['torso', 'head_dark', 'head_light', 'cables_b', 'cables_f'],
        ['arm_r', 'forearm_r'],
        ['arm_l', 'forearm_l'],
    ]
    rig = SkinnedEnemy('gemini', parts_spec, chains=chains, base_size=232, blur_radius=18)

    # 0행: 공격 — 어깨와 팔꿈치 관절로 왼팔을 들어 올려 휘두르고, 오른팔은 뒤로 균형을 잡으며 하단 케이블이 물결친다!
    atk = [
        ({'torso': {'rot': 5, 'dx': 10, 'dy': -8}, 'halo': {'rot': 12},
          'head_light': {'rot': -8}, 'head_dark': {'rot': 10},
          'arm_l': {'rot': 16}, 'forearm_l': {'rot': 18}, 'arm_r': {'rot': -14}, 'forearm_r': {'rot': -14},
          'cables_f': {'rot': 12}, 'cables_b': {'rot': 6}}, 1.0, 0.0, None),
        ({'torso': {'rot': 10, 'dx': 18, 'dy': -14}, 'halo': {'rot': 22},
          'head_light': {'rot': -14}, 'head_dark': {'rot': 16},
          'arm_l': {'rot': 28}, 'forearm_l': {'rot': 28}, 'arm_r': {'rot': -22}, 'forearm_r': {'rot': -22},
          'cables_f': {'rot': 20}, 'cables_b': {'rot': 10}}, 1.05, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 38, GY - 155, (8, 22), C_RED_HI, C_INK, 6), c)[1]),
        ({'torso': {'rot': -8, 'dx': -16, 'dy': 6}, 'halo': {'rot': -18},
          'head_light': {'rot': 10}, 'head_dark': {'rot': -12},
          'arm_l': {'rot': 34}, 'forearm_l': {'rot': 18}, 'arm_r': {'rot': -26}, 'forearm_r': {'rot': -18},
          'cables_f': {'rot': -18}, 'cables_b': {'rot': -10}}, 1.08, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 46, GY - 118, 28, 48, C_IVORY, C_INK, 2, dashed=True), c)[1]),
        ({'torso': {'rot': -12, 'dx': -24, 'dy': 10}, 'halo': {'rot': -28},
          'head_light': {'rot': 14}, 'head_dark': {'rot': -16},
          'arm_l': {'rot': 40}, 'forearm_l': {'rot': 24}, 'arm_r': {'rot': -32}, 'forearm_r': {'rot': -22},
          'cables_f': {'rot': -24}, 'cables_b': {'rot': -14}}, 1.12, 0.0,
         lambda c, r: (
             draw_laser_beam(ImageDraw.Draw(c), GX - 28, GY - 135, 10, GY - 120, C_IVORY, C_WHITE, h=10),
             draw_laser_beam(ImageDraw.Draw(c), GX - 28, GY - 102, 10, GY - 120, C_RED, C_RED_HI, h=10),
             draw_pixel_burst(ImageDraw.Draw(c), 20, GY - 120, (10, 36), C_WHITE, C_INK, 8), c)[3]),
        ({'torso': {'rot': -5, 'dx': -10, 'dy': 4}, 'halo': {'rot': -10},
          'head_light': {'rot': 6}, 'head_dark': {'rot': -6},
          'arm_l': {'rot': 18}, 'forearm_l': {'rot': 10}, 'arm_r': {'rot': -12},
          'cables_f': {'rot': -10}, 'cables_b': {'rot': -6}}, 1.02, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]

    # 1행: 피격 — 두 머리가 목 관절에서 양옆/뒤로 젖혀지고 양팔이 어깨·팔꿈치에서 바깥으로 튕기며 하단 케이블이 쏠린다!
    hit = [
        ({'torso': {'rot': 8, 'dx': 14, 'dy': -6}, 'halo': {'rot': 16},
          'head_light': {'rot': -14}, 'head_dark': {'rot': 16},
          'arm_l': {'rot': 20}, 'forearm_l': {'rot': 16}, 'arm_r': {'rot': -22}, 'forearm_r': {'rot': -18},
          'cables_f': {'rot': -16}, 'cables_b': {'rot': -20}}, 1.24, 0.0,
         lambda c, r: draw_hit_spark(c, GX - 18, GY - 125, is_red=True)),
        ({'torso': {'rot': 14, 'dx': 24, 'dy': -10}, 'halo': {'rot': 26},
          'head_light': {'rot': -22}, 'head_dark': {'rot': 26},
          'arm_l': {'rot': 30}, 'forearm_l': {'rot': 24}, 'arm_r': {'rot': -32}, 'forearm_r': {'rot': -26},
          'cables_f': {'rot': -26}, 'cables_b': {'rot': -30}}, 1.10, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX + 4, GY - 135, (10, 28), C_IVORY, C_INK, 7), c)[1]),
        ({'torso': {'rot': 18, 'dx': 30, 'dy': -12}, 'halo': {'rot': 32},
          'head_light': {'rot': -26}, 'head_dark': {'rot': 30},
          'arm_l': {'rot': 34}, 'forearm_l': {'rot': 28}, 'arm_r': {'rot': -36}, 'forearm_r': {'rot': -30},
          'cables_f': {'rot': -30}, 'cables_b': {'rot': -34}}, 0.94, 0.0,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX + 16, GY - 125, 36, 5, C_SMOKE, C_SILVER), c)[1]),
        ({'torso': {'rot': 8, 'dx': 14, 'dy': -6}, 'halo': {'rot': 14},
          'head_light': {'rot': -12}, 'head_dark': {'rot': 14},
          'arm_l': {'rot': 18}, 'forearm_l': {'rot': 12}, 'arm_r': {'rot': -20}, 'forearm_r': {'rot': -16},
          'cables_f': {'rot': -14}, 'cables_b': {'rot': -18}}, 0.98, 0.0, None),
        ({'torso': {'rot': 3, 'dx': 6}, 'halo': {'rot': 6}, 'head_light': {'rot': -5}, 'head_dark': {'rot': 6},
          'arm_l': {'rot': 8}, 'arm_r': {'rot': -8}}, 1.0, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]

    # 2행: 사망 — 양팔과 두 머리가 아래로 축 늘어지며 케이블이 바닥에 감기듯 주저앉는다
    death = [
        ({'torso': {'rot': 10, 'dy': 15}, 'halo': {'rot': 18}, 'head_light': {'rot': -14}, 'head_dark': {'rot': 16},
          'arm_l': {'rot': 22}, 'arm_r': {'rot': -22}, 'cables_f': {'rot': -14}, 'cables_b': {'rot': -18}}, 1.15, 0.10,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX, GY - 120, (12, 42), C_RED_HI, C_INK, 8), c)[1]),
        ({'torso': {'rot': -10, 'dy': 65}, 'halo': {'rot': -18}, 'head_light': {'rot': -16}, 'head_dark': {'rot': -12},
          'arm_l': {'rot': 22}, 'forearm_l': {'rot': 14}, 'arm_r': {'rot': 16}, 'forearm_r': {'rot': 12},
          'cables_f': {'rot': 20}, 'cables_b': {'rot': 24}}, 0.92, 0.28,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX, GY - 95, 42, 6, C_SMOKE, C_SILVER), c)[1]),
        ({'torso': {'rot': -18, 'dy': 120}, 'halo': {'rot': -28}, 'head_light': {'rot': -22}, 'head_dark': {'rot': -18},
          'arm_l': {'rot': 28}, 'forearm_l': {'rot': 20}, 'arm_r': {'rot': 22}, 'forearm_r': {'rot': 16},
          'cables_f': {'rot': 30}, 'cables_b': {'rot': 34}}, 0.82, 0.48,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX, GY - 45, 58, 7, C_SMOKE, C_BRASS), c)[1]),
        ({'torso': {'rot': -24, 'dy': 165}, 'halo': {'rot': -36}, 'head_light': {'rot': -26}, 'head_dark': {'rot': -22},
          'arm_l': {'rot': 32}, 'forearm_l': {'rot': 24}, 'arm_r': {'rot': 26}, 'forearm_r': {'rot': 20},
          'cables_f': {'rot': 36}, 'cables_b': {'rot': 40}}, 0.72, 0.68, None),
        ({'torso': {'rot': -28, 'dy': 192}, 'halo': {'rot': -42}, 'head_light': {'rot': -28}, 'head_dark': {'rot': -24},
          'arm_l': {'rot': 36}, 'forearm_l': {'rot': 26}, 'arm_r': {'rot': 28}, 'forearm_r': {'rot': 22},
          'cables_f': {'rot': 40}, 'cables_b': {'rot': 44}}, 0.64, 0.84, None),
        ({'torso': {'rot': -30, 'dy': 205}, 'halo': {'rot': -45}, 'head_light': {'rot': -30}, 'head_dark': {'rot': -26},
          'arm_l': {'rot': 38}, 'forearm_l': {'rot': 28}, 'arm_r': {'rot': 30}, 'forearm_r': {'rot': 24},
          'cables_f': {'rot': 42}, 'cables_b': {'rot': 46}}, 0.58, 0.92, None),
    ]

    # 3행: 스킬 — 양팔을 좌우 대칭으로 들어 올리고 두 얼굴이 공명하며 프리즘 파동 발사!
    skill = [
        ({'torso': {'dy': -10}, 'halo': {'rot': 14}, 'head_light': {'rot': -8}, 'head_dark': {'rot': 8},
          'arm_l': {'rot': 20}, 'forearm_l': {'rot': 16}, 'arm_r': {'rot': -20}, 'forearm_r': {'rot': -16},
          'cables_f': {'rot': 12}, 'cables_b': {'rot': -12}}, 1.06, 0.0, None),
        ({'torso': {'dy': -20}, 'halo': {'rot': 28}, 'head_light': {'rot': -14}, 'head_dark': {'rot': 14},
          'arm_l': {'rot': 32}, 'forearm_l': {'rot': 24}, 'arm_r': {'rot': -32}, 'forearm_r': {'rot': -24},
          'cables_f': {'rot': 20}, 'cables_b': {'rot': -20}}, 1.14, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX, GY - 150, 62, 62, C_RED_HI, C_INK, 3, dashed=True), c)[1]),
        ({'torso': {'dy': -26}, 'halo': {'rot': 40}, 'head_light': {'rot': -18}, 'head_dark': {'rot': 18},
          'arm_l': {'rot': 38}, 'forearm_l': {'rot': 30}, 'arm_r': {'rot': -38}, 'forearm_r': {'rot': -30},
          'cables_f': {'rot': 26}, 'cables_b': {'rot': -26}}, 1.20, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX, GY - 152, 74, 74, C_IVORY, C_INK, 3, dashed=True), c)[1]),
        ({'torso': {'rot': -8, 'dx': -14, 'dy': -12}, 'halo': {'rot': -24},
          'head_light': {'rot': 12}, 'head_dark': {'rot': -12},
          'arm_l': {'rot': 42}, 'forearm_l': {'rot': 22}, 'arm_r': {'rot': -28}, 'forearm_r': {'rot': -20},
          'cables_f': {'rot': -20}, 'cables_b': {'rot': -12}}, 1.22, 0.0,
         lambda c, r: (
             draw_hex_shield(ImageDraw.Draw(c), GX - 78, GY - 118, 44, color=C_IVORY, border=C_RED, fill_alpha=65),
             draw_laser_beam(ImageDraw.Draw(c), GX - 22, GY - 152, 12, GY - 118, C_RED_HI, C_WHITE, h=12), c)[2]),
        ({'torso': {'dy': -6}, 'halo': {'rot': -10}, 'head_light': {'rot': -5}, 'head_dark': {'rot': 5},
          'arm_l': {'rot': 18}, 'forearm_l': {'rot': 10}, 'arm_r': {'rot': -14}}, 1.06, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]
    return assemble_sheet('gemini', rig, atk, hit, death, skill)


def build_omnis():
    """옴니스(Omnis) — 외곽 자이로 짐벌 링(gimbal) + 내부 장갑 구체(shell) + 안구 코어(eye) + 하단 케이블(cables_l, cables_r)."""
    parts_spec = [
        {'name': 'eye',      'poly': [(265, 280), (515, 280), (515, 550), (265, 550)], 'pivot': (385, 415), 'parent': 'shell', 'blur': 16, 'weld_radius': 45},
        {'name': 'gimbal',   'polys': [[(240, 60), (790, 60), (885, 290), (885, 580), (650, 775), (555, 765), (655, 585), (645, 235), (410, 115), (240, 195)],
                                       [(730, 320), (890, 320), (890, 515), (730, 515)]], 'pivot': (490, 425), 'parent': 'shell', 'blur': 22, 'weld_radius': 180},
        {'name': 'cables_l', 'poly': [(240, 650), (495, 650), (495, 955), (240, 955)], 'pivot': (375, 675), 'parent': 'shell', 'blur': 18, 'weld_radius': 64},
        {'name': 'cables_r', 'poly': [(495, 510), (860, 510), (860, 975), (495, 975)], 'pivot': (655, 665), 'parent': 'shell', 'blur': 18, 'weld_radius': 64},
        {'name': 'shell',    'poly': None, 'pivot': (490, 425), 'parent': None, 'blur': 18},
    ]
    chains = [
        ['shell'],
        ['cables_l'],
        ['cables_r'],
        ['gimbal'],
        ['eye'],
    ]
    rig = SkinnedEnemy('omnis', parts_spec, chains=chains, base_size=236, blur_radius=18)

    # 0행: 공격 — 외곽 짐벌 링과 내부 구체가 역회전하고 안구 렌즈가 전방으로 팽창·주시하며 고출력 레이저 발사!
    atk = [
        ({'shell': {'rot': 5, 'dx': 10, 'dy': -6}, 'gimbal': {'rot': -10},
          'eye': {'joint_dx': 10, 'joint_dy': -4, 'sx': 0.94, 'sy': 0.94},
          'cables_l': {'rot': -12}, 'cables_r': {'rot': -14}}, 1.0, 0.0, None),
        ({'shell': {'rot': 10, 'dx': 18, 'dy': -12}, 'gimbal': {'rot': -18},
          'eye': {'joint_dx': 16, 'joint_dy': -8, 'sx': 0.88, 'sy': 0.88},
          'cables_l': {'rot': -20}, 'cables_r': {'rot': -24}}, 1.05, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 26, GY - 125, (8, 24), C_RED_HI, C_INK, 6), c)[1]),
        ({'shell': {'rot': -10, 'dx': -18, 'dy': 6}, 'gimbal': {'rot': 16},
          'eye': {'joint_dx': -16, 'joint_dy': 4, 'sx': 1.12, 'sy': 1.12},
          'cables_l': {'rot': 22}, 'cables_r': {'rot': 26}}, 1.08, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 34, GY - 125, 28, 28, C_RED_HI, C_INK, 3), c)[1]),
        ({'shell': {'rot': -14, 'dx': -26, 'dy': 10}, 'gimbal': {'rot': 22},
          'eye': {'joint_dx': -22, 'joint_dy': 6, 'sx': 1.18, 'sy': 1.18},
          'cables_l': {'rot': 30}, 'cables_r': {'rot': 34}}, 1.12, 0.0,
         lambda c, r: (
             draw_laser_beam(ImageDraw.Draw(c), GX - 30, GY - 125, 8, GY - 125, C_RED, C_WHITE, h=18),
             draw_pixel_ring(ImageDraw.Draw(c), GX - 78, GY - 125, 20, 48, C_RED_HI, C_INK, 3),
             draw_pixel_burst(ImageDraw.Draw(c), 22, GY - 125, (12, 42), C_WHITE, C_INK, 8), c)[3]),
        ({'shell': {'rot': -5, 'dx': -10}, 'gimbal': {'rot': 8},
          'eye': {'joint_dx': -10, 'sx': 1.05, 'sy': 1.05},
          'cables_l': {'rot': 12}, 'cables_r': {'rot': 14}}, 1.02, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]

    # 1행: 피격 — 짐벌 링과 구체가 엇갈려 흔들리고 안구가 소켓 안쪽으로 수축하며 하단 케이블이 앞으로 튀어 오른다!
    hit = [
        ({'shell': {'rot': 10, 'dx': 14, 'dy': -6}, 'gimbal': {'rot': -14},
          'eye': {'joint_dx': 12, 'joint_dy': -6, 'sx': 0.88, 'sy': 0.85},
          'cables_l': {'rot': -20}, 'cables_r': {'rot': -18}}, 1.24, 0.0,
         lambda c, r: draw_hit_spark(c, GX - 24, GY - 125, is_red=True)),
        ({'shell': {'rot': 16, 'dx': 24, 'dy': -12}, 'gimbal': {'rot': -22},
          'eye': {'joint_dx': 18, 'joint_dy': -10, 'sx': 0.84, 'sy': 0.80},
          'cables_l': {'rot': -32}, 'cables_r': {'rot': -28}}, 1.10, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 4, GY - 135, (10, 28), C_IVORY, C_INK, 7), c)[1]),
        ({'shell': {'rot': 20, 'dx': 30, 'dy': -14}, 'gimbal': {'rot': -26},
          'eye': {'joint_dx': 22, 'joint_dy': -12, 'sx': 0.82, 'sy': 0.76},
          'cables_l': {'rot': -36}, 'cables_r': {'rot': -32}}, 0.94, 0.0,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX + 14, GY - 125, 36, 5, C_SMOKE, C_SILVER), c)[1]),
        ({'shell': {'rot': 10, 'dx': 14, 'dy': -6}, 'gimbal': {'rot': -12},
          'eye': {'joint_dx': 10, 'joint_dy': -6, 'sx': 0.90, 'sy': 0.88},
          'cables_l': {'rot': -16}, 'cables_r': {'rot': -14}}, 0.98, 0.0, None),
        ({'shell': {'rot': 4, 'dx': 6}, 'gimbal': {'rot': -5}, 'eye': {'joint_dx': 4, 'joint_dy': -2}, 'cables_l': {'rot': -6}, 'cables_r': {'rot': -5}}, 1.0, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]

    # 2행: 사망 — 짐벌 링이 멈추며 기울고 안구가 아래로 처져 꺼지며 바닥에 가라앉는다
    death = [
        ({'shell': {'rot': 10, 'dy': 15}, 'gimbal': {'rot': -14}, 'eye': {'joint_dx': 10, 'joint_dy': -6, 'sx': 0.88},
          'cables_l': {'rot': 16}, 'cables_r': {'rot': -16}}, 1.15, 0.10,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX, GY - 120, (12, 42), C_RED_HI, C_INK, 8), c)[1]),
        ({'shell': {'rot': -10, 'dy': 60}, 'gimbal': {'rot': 16}, 'eye': {'joint_dx': -8, 'joint_dy': 12, 'sx': 0.84},
          'cables_l': {'rot': 28}, 'cables_r': {'rot': -28}}, 0.92, 0.28,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX, GY - 95, 42, 6, C_SMOKE, C_SILVER), c)[1]),
        ({'shell': {'rot': -18, 'dy': 115}, 'gimbal': {'rot': 24}, 'eye': {'joint_dx': -12, 'joint_dy': 18, 'sx': 0.80},
          'cables_l': {'rot': 38}, 'cables_r': {'rot': -38}}, 0.82, 0.48,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX, GY - 45, 58, 7, C_SMOKE, C_BRASS), c)[1]),
        ({'shell': {'rot': -24, 'dy': 160}, 'gimbal': {'rot': 30}, 'eye': {'joint_dx': -16, 'joint_dy': 22, 'sx': 0.76},
          'cables_l': {'rot': 46}, 'cables_r': {'rot': -46}}, 0.72, 0.68, None),
        ({'shell': {'rot': -28, 'dy': 185}, 'gimbal': {'rot': 34}, 'eye': {'joint_dx': -18, 'joint_dy': 24, 'sx': 0.74},
          'cables_l': {'rot': 50}, 'cables_r': {'rot': -50}}, 0.64, 0.84, None),
        ({'shell': {'rot': -30, 'dy': 198}, 'gimbal': {'rot': 36}, 'eye': {'joint_dx': -20, 'joint_dy': 26, 'sx': 0.72},
          'cables_l': {'rot': 54}, 'cables_r': {'rot': -54}}, 0.58, 0.92, None),
    ]

    # 3행: 스킬 — 짐벌 링과 구체가 역회전하고 하단 케이블이 양옆으로 펼쳐지며 코어 과부하 파동 방출!
    skill = [
        ({'shell': {'rot': -6, 'dy': -10}, 'gimbal': {'rot': 12},
          'eye': {'sx': 1.06, 'sy': 1.06}, 'cables_l': {'rot': 14}, 'cables_r': {'rot': -14}}, 1.06, 0.0, None),
        ({'shell': {'rot': 10, 'dy': -20}, 'gimbal': {'rot': -20},
          'eye': {'joint_dx': -10, 'sx': 1.14, 'sy': 1.14}, 'cables_l': {'rot': 24}, 'cables_r': {'rot': -24}}, 1.14, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 16, GY - 125, 64, 64, C_RED, C_INK, 3, dashed=True), c)[1]),
        ({'shell': {'rot': -14, 'dy': -28}, 'gimbal': {'rot': 26},
          'eye': {'joint_dx': -14, 'sx': 1.20, 'sy': 1.20}, 'cables_l': {'rot': 34}, 'cables_r': {'rot': -34}}, 1.20, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 16, GY - 128, 84, 84, C_BRASS, C_INK, 3, dashed=True), c)[1]),
        ({'shell': {'rot': 10, 'dx': -16, 'dy': -14}, 'gimbal': {'rot': -22},
          'eye': {'joint_dx': -18, 'sx': 1.24, 'sy': 1.24}, 'cables_l': {'rot': 40}, 'cables_r': {'rot': -40}}, 1.22, 0.0,
         lambda c, r: (
             draw_hex_shield(ImageDraw.Draw(c), GX - 84, GY - 125, 52, color=C_RED_HI, border=C_IVORY, fill_alpha=70),
             draw_lightning_arc(ImageDraw.Draw(c), [(GX - 20, GY - 165), (GX - 68, GY - 130), (GX - 128, GY - 150)], C_WHITE),
             draw_lightning_arc(ImageDraw.Draw(c), [(GX - 20, GY - 85), (GX - 72, GY - 110), (GX - 128, GY - 90)], C_RED_HI), c)[3]),
        ({'shell': {'rot': -5, 'dy': -6}, 'gimbal': {'rot': 10},
          'eye': {'joint_dx': -8, 'sx': 1.06, 'sy': 1.06}, 'cables_l': {'rot': 14}, 'cables_r': {'rot': -14}}, 1.06, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 16, GY - 125, 104, 104, C_BRASS, C_INK, 3, dashed=True), c)[1]),
        ({}, 1.0, 0.0, None),
    ]
    return assemble_sheet('omnis', rig, atk, hit, death, skill)


def build_sludge():
    """글리치 슬러지(Sludge) — 바닥 점액 받침(base) 고정 + 상부 아가리(body) + 내부 붉은 눈 코어(core) + 4방향 뿔(spikes_*)."""
    parts_spec = [
        {'name': 'core',      'poly': [(465, 345), (750, 345), (750, 640), (465, 640)], 'pivot': (605, 495), 'parent': 'body', 'blur': 16, 'weld_radius': 0},
        {'name': 'spikes_tl', 'poly': [(145, 95),  (455, 95),  (445, 435), (145, 435)], 'pivot': (365, 340), 'parent': 'body', 'blur': 16},
        {'name': 'spikes_tr', 'poly': [(590, 105), (890, 105), (885, 455), (675, 360), (590, 265)], 'pivot': (715, 295), 'parent': 'body', 'blur': 16},
        {'name': 'spikes_bl', 'poly': [(50, 470),  (250, 470), (225, 765), (50, 765)],  'pivot': (215, 610), 'parent': 'body', 'blur': 16},
        {'name': 'spikes_br', 'poly': [(745, 475), (955, 475), (955, 775), (745, 775)], 'pivot': (785, 620), 'parent': 'body', 'blur': 16},
        {'name': 'base',      'poly': [(45, 745),  (980, 745), (980, 950), (45, 950)],  'pivot': (512, 885), 'parent': None,   'blur': 20},
        {'name': 'body',      'poly': None, 'pivot': (510, 760), 'parent': 'base', 'blur': 20},
    ]
    chains = [
        ['base', 'body'],
        ['spikes_tl'],
        ['spikes_tr'],
        ['spikes_bl'],
        ['spikes_br'],
        ['core'],
    ]
    rig = SkinnedEnemy('sludge', parts_spec, chains=chains, base_size=216, blur_radius=18)

    # 0행: 공격 — 바닥 점액은 땅에 붙은 채 상부 아가리가 앞으로 쏠리고, 내부 붉은 코어가 전방으로 부풀어 오르며 가시들이 곤두선다!
    atk = [
        ({'base': {'sx': 1.04, 'sy': 0.96}, 'body': {'rot': 6, 'sy': 0.95},
          'core': {'joint_dx': 14, 'joint_dy': 6, 'sx': 0.92, 'sy': 0.92},
          'spikes_tl': {'rot': 14}, 'spikes_tr': {'rot': 16}, 'spikes_bl': {'rot': 12}, 'spikes_br': {'rot': 14}}, 1.0, 0.0, None),
        ({'base': {'sx': 1.08, 'sy': 0.92}, 'body': {'rot': 12, 'sy': 0.90},
          'core': {'joint_dx': 24, 'joint_dy': 10, 'sx': 0.86, 'sy': 0.86},
          'spikes_tl': {'rot': 24}, 'spikes_tr': {'rot': 28}, 'spikes_bl': {'rot': 20}, 'spikes_br': {'rot': 24}}, 1.05, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 24, GY - 98, (8, 22), C_RED_HI, C_INK, 6), c)[1]),
        ({'base': {'sx': 0.96, 'sy': 1.02}, 'body': {'rot': -12, 'sy': 1.05},
          'core': {'rot': -8, 'joint_dx': -28, 'joint_dy': -8, 'sx': 1.14, 'sy': 1.14},
          'spikes_tl': {'rot': -22}, 'spikes_tr': {'rot': -26}, 'spikes_bl': {'rot': -18}, 'spikes_br': {'rot': -22}}, 1.08, 0.0,
         lambda c, r: (
             draw_laser_beam(ImageDraw.Draw(c), GX - 20, GY - 98, GX - 125, GY - 106, C_SILVER, C_IVORY, h=10),
             draw_spores(ImageDraw.Draw(c), GX - 108, GY - 98, 32, 6, C_RED, C_RED_HI), c)[2]),
        ({'base': {'sx': 0.94, 'sy': 1.04}, 'body': {'rot': -18, 'sy': 1.08},
          'core': {'rot': -12, 'joint_dx': -38, 'joint_dy': -12, 'sx': 1.22, 'sy': 1.22},
          'spikes_tl': {'rot': -30}, 'spikes_tr': {'rot': -36}, 'spikes_bl': {'rot': -26}, 'spikes_br': {'rot': -30}}, 1.12, 0.0,
         lambda c, r: (
             draw_laser_beam(ImageDraw.Draw(c), GX - 12, GY - 98, 14, GY - 110, C_SILVER, C_WHITE, h=14),
             draw_laser_beam(ImageDraw.Draw(c), GX - 16, GY - 68, 22, GY - 58, C_RED, C_RED_HI, h=10),
             draw_pixel_burst(ImageDraw.Draw(c), 26, GY - 108, (8, 32), C_RED_HI, C_INK, 8), c)[3]),
        ({'base': {'sx': 0.98}, 'body': {'rot': -6},
          'core': {'joint_dx': -14, 'sx': 1.06, 'sy': 1.06},
          'spikes_tl': {'rot': -10}, 'spikes_tr': {'rot': -14}, 'spikes_bl': {'rot': -8}, 'spikes_br': {'rot': -10}}, 1.02, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]

    # 1행: 피격 — 바닥 점액은 고정된 채 상부 몸통이 뒤로 젖혀지고 내부 코어가 뒤로 움츠러들며 가시들이 바깥으로 솟구친다!
    hit = [
        ({'base': {'sx': 1.06, 'sy': 0.95}, 'body': {'rot': 10, 'sy': 0.92},
          'core': {'rot': 12, 'joint_dx': 22, 'joint_dy': -10, 'sx': 0.84, 'sy': 0.76},
          'spikes_tl': {'rot': -22}, 'spikes_tr': {'rot': 26}, 'spikes_bl': {'rot': -18}, 'spikes_br': {'rot': 22}}, 1.24, 0.0,
         lambda c, r: draw_hit_spark(c, GX - 18, GY - 98, is_red=True)),
        ({'base': {'sx': 1.12, 'sy': 0.90}, 'body': {'rot': 18, 'sy': 0.86},
          'core': {'rot': 20, 'joint_dx': 36, 'joint_dy': -16, 'sx': 0.78, 'sy': 0.68},
          'spikes_tl': {'rot': -34}, 'spikes_tr': {'rot': 38}, 'spikes_bl': {'rot': -28}, 'spikes_br': {'rot': 34}}, 1.10, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX + 8, GY - 108, (10, 28), C_IVORY, C_INK, 7), c)[1]),
        ({'base': {'sx': 1.14, 'sy': 0.88}, 'body': {'rot': 22, 'sy': 0.84},
          'core': {'rot': 24, 'joint_dx': 42, 'joint_dy': -18, 'sx': 0.74, 'sy': 0.64},
          'spikes_tl': {'rot': -40}, 'spikes_tr': {'rot': 44}, 'spikes_bl': {'rot': -34}, 'spikes_br': {'rot': 40}}, 0.94, 0.0,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX + 18, GY - 95, 36, 5, C_SMOKE, C_SILVER), c)[1]),
        ({'base': {'sx': 1.06, 'sy': 0.95}, 'body': {'rot': 10, 'sy': 0.94},
          'core': {'rot': 10, 'joint_dx': 18, 'joint_dy': -8, 'sx': 0.88, 'sy': 0.84},
          'spikes_tl': {'rot': -18}, 'spikes_tr': {'rot': 20}, 'spikes_bl': {'rot': -14}, 'spikes_br': {'rot': 16}}, 0.98, 0.0, None),
        ({'base': {'sx': 1.02}, 'body': {'rot': 4}, 'core': {'joint_dx': 8}, 'spikes_tl': {'rot': -6}, 'spikes_tr': {'rot': 6}}, 1.0, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]

    # 2행: 사망 — 점액이 넓게 퍼지며 가시들이 양옆으로 눕고 내부 코어가 납작하게 가라앉는다
    death = [
        ({'base': {'sx': 1.08, 'sy': 0.92}, 'body': {'rot': 10, 'sy': 0.84}, 'core': {'joint_dy': 18, 'sy': 0.80},
          'spikes_tl': {'rot': -22}, 'spikes_tr': {'rot': 26}}, 1.15, 0.10,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX, GY - 98, (12, 42), C_RED_HI, C_INK, 8), c)[1]),
        ({'base': {'sx': 1.16, 'sy': 0.78}, 'body': {'rot': 14, 'sy': 0.68}, 'core': {'joint_dy': 38, 'sy': 0.65},
          'spikes_tl': {'rot': -38}, 'spikes_tr': {'rot': 42}, 'spikes_bl': {'rot': -25}, 'spikes_br': {'rot': 25}}, 0.92, 0.28,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX, GY - 80, 42, 6, C_SMOKE, C_SILVER), c)[1]),
        ({'base': {'sx': 1.22, 'sy': 0.62}, 'body': {'rot': 18, 'sy': 0.52}, 'core': {'joint_dy': 58, 'sy': 0.50},
          'spikes_tl': {'rot': -52}, 'spikes_tr': {'rot': 56}, 'spikes_bl': {'rot': -38}, 'spikes_br': {'rot': 38}}, 0.82, 0.48,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX, GY - 35, 58, 7, C_SMOKE, C_BRASS), c)[1]),
        ({'base': {'sx': 1.26, 'sy': 0.48}, 'body': {'rot': 14, 'sy': 0.38}, 'core': {'joint_dy': 72, 'sy': 0.38},
          'spikes_tl': {'rot': -62}, 'spikes_tr': {'rot': 66}, 'spikes_bl': {'rot': -48}, 'spikes_br': {'rot': 48}}, 0.72, 0.68, None),
        ({'base': {'sx': 1.30, 'sy': 0.38}, 'body': {'rot': 8, 'sy': 0.30}, 'core': {'joint_dy': 82, 'sy': 0.30},
          'spikes_tl': {'rot': -68}, 'spikes_tr': {'rot': 72}, 'spikes_bl': {'rot': -54}, 'spikes_br': {'rot': 54}}, 0.64, 0.84, None),
        ({'base': {'sx': 1.32, 'sy': 0.32}, 'body': {'rot': 4, 'sy': 0.26}, 'core': {'joint_dy': 88, 'sy': 0.25},
          'spikes_tl': {'rot': -72}, 'spikes_tr': {'rot': 75}, 'spikes_bl': {'rot': -58}, 'spikes_br': {'rot': 58}}, 0.58, 0.92, None),
    ]

    # 3행: 스킬 — 사방 가시들이 일제히 곤두서며 내부 코어가 팽창해 맹독 포자 분출!
    skill = [
        ({'base': {'sx': 1.06, 'sy': 0.94}, 'body': {'sy': 0.94},
          'core': {'sx': 1.08, 'sy': 1.08},
          'spikes_tl': {'rot': -14}, 'spikes_tr': {'rot': 14}, 'spikes_bl': {'rot': -14}, 'spikes_br': {'rot': 14}}, 1.06, 0.0, None),
        ({'base': {'sx': 0.96, 'sy': 1.04}, 'body': {'sy': 1.06},
          'core': {'joint_dx': -16, 'joint_dy': -8, 'sx': 1.16, 'sy': 1.16},
          'spikes_tl': {'rot': -26}, 'spikes_tr': {'rot': 26}, 'spikes_bl': {'rot': -24}, 'spikes_br': {'rot': 24}}, 1.14, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX, GY - 98, 60, 50, C_RED, C_INK, 3, dashed=True), c)[1]),
        ({'base': {'sx': 0.94, 'sy': 1.06}, 'body': {'sy': 1.10},
          'core': {'joint_dx': -24, 'joint_dy': -12, 'sx': 1.24, 'sy': 1.24},
          'spikes_tl': {'rot': -34}, 'spikes_tr': {'rot': 34}, 'spikes_bl': {'rot': -32}, 'spikes_br': {'rot': 32}}, 1.20, 0.0,
         lambda c, r: (
             draw_pixel_ring(ImageDraw.Draw(c), GX, GY - 98, 78, 64, C_RED, C_INK, 3),
             draw_spores(ImageDraw.Draw(c), GX - 20, GY - 98, 78, 14, C_RED, C_RED_HI), c)[2]),
        ({'base': {'sx': 1.02, 'sy': 0.98}, 'body': {'rot': -10, 'sy': 1.04},
          'core': {'joint_dx': -30, 'sx': 1.20, 'sy': 1.20},
          'spikes_tl': {'rot': -24}, 'spikes_tr': {'rot': -20}, 'spikes_bl': {'rot': -20}, 'spikes_br': {'rot': 20}}, 1.22, 0.0,
         lambda c, r: (
             draw_pixel_ring(ImageDraw.Draw(c), GX, GY - 98, 96, 78, C_RED, C_INK, 3, dashed=True),
             draw_spores(ImageDraw.Draw(c), GX - 24, GY - 98, 100, 18, C_RED, C_RED_HI), c)[2]),
        ({'body': {'rot': -4}, 'core': {'joint_dx': -12, 'sx': 1.08, 'sy': 1.08},
          'spikes_tl': {'rot': -10}, 'spikes_tr': {'rot': 10}}, 1.06, 0.0,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX - 20, GY - 98, 112, 16, C_RED, C_RED_HI), c)[1]),
        ({}, 1.0, 0.0, None),
    ]
    return assemble_sheet('sludge', rig, atk, hit, death, skill)




def build_claude():
    """클라드(Claude/Clad) — 4층 보스: 중앙 아카이브 모놀리스(monolith) + 철학자 흉상(bust) + 4개의 부유 방패(shield_far_l, shield_near_l, shield_near_r, shield_far_r)."""
    parts_spec = [
        {'name': 'bust',          'poly': [(190, 50), (460, 50), (460, 445), (325, 455), (190, 445)], 'pivot': (330, 440), 'parent': 'monolith', 'blur': 16, 'weld_radius': 45},
        {'name': 'shield_far_l',  'poly': [(0, 240), (105, 240), (105, 630), (0, 630)],               'pivot': (50, 430),  'parent': 'monolith', 'blur': 18, 'weld_radius': 60},
        {'name': 'shield_near_l', 'poly': [(110, 220), (250, 220), (250, 500), (110, 500)],            'pivot': (180, 360), 'parent': 'monolith', 'blur': 18, 'weld_radius': 60},
        {'name': 'shield_near_r', 'poly': [(465, 360), (628, 360), (628, 655), (465, 655)],            'pivot': (545, 500), 'parent': 'monolith', 'blur': 18, 'weld_radius': 60},
        {'name': 'shield_far_r',  'poly': [(635, 270), (695, 270), (695, 595), (635, 595)],            'pivot': (665, 430), 'parent': 'monolith', 'blur': 18, 'weld_radius': 60},
        {'name': 'monolith',      'poly': None, 'pivot': (350, 700), 'parent': None, 'blur': 18},
    ]
    chains = [
        ['monolith'],
        ['bust'],
        ['shield_far_l'],
        ['shield_near_l'],
        ['shield_near_r'],
        ['shield_far_r'],
    ]
    rig = SkinnedEnemy('claude', parts_spec, chains=chains, base_size=236, blur_radius=18)

    # 0행: 공격 — 4개의 부유 방패가 본체 주변을 돌며 가속, 전방(좌측)으로 돌진하며 공명 파동 방출!
    atk = [
        ({'monolith': {'dx': 6, 'dy': -4}, 'bust': {'rot': 4},
          'shield_far_l': {'joint_dx': 12, 'joint_dy': -8, 'rot': 6},
          'shield_near_l': {'joint_dx': 16, 'joint_dy': -6, 'rot': 8},
          'shield_near_r': {'joint_dx': 8, 'joint_dy': -10, 'rot': 4},
          'shield_far_r': {'joint_dx': 10, 'joint_dy': -8, 'rot': 6}}, 1.0, 0.0, None),
        ({'monolith': {'dx': 14, 'dy': -8}, 'bust': {'rot': 8},
          'shield_far_l': {'joint_dx': 22, 'joint_dy': -16, 'rot': 12},
          'shield_near_l': {'joint_dx': 28, 'joint_dy': -12, 'rot': 16},
          'shield_near_r': {'joint_dx': 18, 'joint_dy': -18, 'rot': 10},
          'shield_far_r': {'joint_dx': 20, 'joint_dy': -16, 'rot': 12}}, 1.04, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 20, GY - 120, (10, 28), C_WHITE, C_INK, 6), c)[1]),
        ({'monolith': {'dx': -12, 'dy': 4}, 'bust': {'rot': -6},
          'shield_far_l': {'joint_dx': -34, 'joint_dy': 6, 'rot': -12, 'sx': 1.08, 'sy': 1.08},
          'shield_near_l': {'joint_dx': -28, 'joint_dy': 8, 'rot': -10, 'sx': 1.08, 'sy': 1.08},
          'shield_near_r': {'joint_dx': -20, 'joint_dy': 4, 'rot': -6},
          'shield_far_r': {'joint_dx': -16, 'joint_dy': 2, 'rot': -4}}, 1.08, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 40, GY - 120, 24, 36, C_WHITE, C_INK, 3), c)[1]),
        ({'monolith': {'dx': -20, 'dy': 8}, 'bust': {'rot': -10},
          'shield_far_l': {'joint_dx': -56, 'joint_dy': 10, 'rot': -20, 'sx': 1.15, 'sy': 1.15},
          'shield_near_l': {'joint_dx': -48, 'joint_dy': 12, 'rot': -16, 'sx': 1.15, 'sy': 1.15},
          'shield_near_r': {'joint_dx': -32, 'joint_dy': 8, 'rot': -10},
          'shield_far_r': {'joint_dx': -24, 'joint_dy': 4, 'rot': -8}}, 1.12, 0.0,
         lambda c, r: (
             draw_laser_beam(ImageDraw.Draw(c), GX - 36, GY - 120, 8, GY - 120, C_RED, C_WHITE, h=22),
             draw_pixel_ring(ImageDraw.Draw(c), GX - 80, GY - 120, 24, 48, C_RED_HI, C_INK, 3),
             draw_pixel_burst(ImageDraw.Draw(c), 20, GY - 120, (14, 40), C_WHITE, C_INK, 8), c)[3]),
        ({'monolith': {'dx': -8}, 'bust': {'rot': -4},
          'shield_far_l': {'joint_dx': -24, 'joint_dy': 4, 'rot': -8},
          'shield_near_l': {'joint_dx': -18, 'joint_dy': 4, 'rot': -6},
          'shield_near_r': {'joint_dx': -10, 'joint_dy': 2, 'rot': -4},
          'shield_far_r': {'joint_dx': -8, 'rot': -2}}, 1.03, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]

    # 1행: 피격 — 기둥과 흉상이 뒤로 밀리고 방패들이 사방으로 튕기며 스파크
    hit = [
        ({'monolith': {'dx': 12, 'rot': 4}, 'bust': {'rot': 8, 'joint_dy': -4},
          'shield_far_l': {'joint_dx': -14, 'joint_dy': -10, 'rot': -12},
          'shield_near_l': {'joint_dx': 8, 'joint_dy': -14, 'rot': 10},
          'shield_near_r': {'joint_dx': 16, 'joint_dy': 10, 'rot': 14},
          'shield_far_r': {'joint_dx': 22, 'joint_dy': -8, 'rot': -8}}, 1.20, 0.0,
         lambda c, r: draw_hit_spark(c, GX - 16, GY - 120, is_red=True)),
        ({'monolith': {'dx': 20, 'rot': 6}, 'bust': {'rot': 12, 'joint_dy': -8},
          'shield_far_l': {'joint_dx': -22, 'joint_dy': -16, 'rot': -20},
          'shield_near_l': {'joint_dx': 14, 'joint_dy': -20, 'rot': 16},
          'shield_near_r': {'joint_dx': 24, 'joint_dy': 16, 'rot': 20},
          'shield_far_r': {'joint_dx': 30, 'joint_dy': -12, 'rot': -14}}, 1.10, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX, GY - 130, (10, 26), C_WHITE, C_INK, 7), c)[1]),
        ({'monolith': {'dx': 24, 'rot': 4}, 'bust': {'rot': 8},
          'shield_far_l': {'joint_dx': -18, 'joint_dy': -12, 'rot': -14},
          'shield_near_l': {'joint_dx': 10, 'joint_dy': -14, 'rot': 12},
          'shield_near_r': {'joint_dx': 18, 'joint_dy': 12, 'rot': 14},
          'shield_far_r': {'joint_dx': 24, 'joint_dy': -8, 'rot': -10}}, 1.04, 0.0, None),
        ({'monolith': {'dx': 14, 'rot': 2}, 'bust': {'rot': 4},
          'shield_far_l': {'joint_dx': -10, 'joint_dy': -6, 'rot': -8},
          'shield_near_l': {'joint_dx': 6, 'joint_dy': -8, 'rot': 6},
          'shield_near_r': {'joint_dx': 10, 'joint_dy': 6, 'rot': 8},
          'shield_far_r': {'joint_dx': 12, 'joint_dy': -4, 'rot': -4}}, 1.01, 0.0, None),
        ({'monolith': {'dx': 6}, 'bust': {'rot': 2},
          'shield_far_l': {'joint_dx': -4, 'rot': -4},
          'shield_near_l': {'joint_dx': 2, 'rot': 2},
          'shield_near_r': {'joint_dx': 4, 'rot': 4},
          'shield_far_r': {'joint_dx': 4, 'rot': -2}}, 1.0, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]

    # 2행: 사망 — 흉상이 고개를 떨구고, 방패들이 지면으로 추락하며 균열
    death = [
        ({'monolith': {'dx': 6, 'dy': 4}, 'bust': {'rot': 10, 'joint_dy': 8},
          'shield_far_l': {'joint_dx': -8, 'joint_dy': 24, 'rot': 16},
          'shield_near_l': {'joint_dx': 6, 'joint_dy': 32, 'rot': -14},
          'shield_near_r': {'joint_dx': 12, 'joint_dy': 28, 'rot': 20},
          'shield_far_r': {'joint_dx': 16, 'joint_dy': 20, 'rot': -18}}, 1.15, 0.10,
         lambda c, r: draw_hit_spark(c, GX - 20, GY - 120, is_red=True)),
        ({'monolith': {'dx': 4, 'dy': 12}, 'bust': {'rot': 22, 'joint_dy': 18},
          'shield_far_l': {'joint_dx': -16, 'joint_dy': 64, 'rot': 32},
          'shield_near_l': {'joint_dx': 12, 'joint_dy': 78, 'rot': -28},
          'shield_near_r': {'joint_dx': 20, 'joint_dy': 70, 'rot': 38},
          'shield_far_r': {'joint_dx': 26, 'joint_dy': 58, 'rot': -34}}, 0.92, 0.28,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX - 20, GY - 90, 42, 6, C_SMOKE, C_SILVER), c)[1]),
        ({'monolith': {'dy': 20}, 'bust': {'rot': 34, 'joint_dy': 28},
          'shield_far_l': {'joint_dx': -24, 'joint_dy': 120, 'rot': 55},
          'shield_near_l': {'joint_dx': 18, 'joint_dy': 135, 'rot': -45},
          'shield_near_r': {'joint_dx': 28, 'joint_dy': 128, 'rot': 60},
          'shield_far_r': {'joint_dx': 34, 'joint_dy': 110, 'rot': -50}}, 0.82, 0.48,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 20, GY - 40, (12, 34), C_WHITE, C_INK, 8), c)[1]),
        ({'monolith': {'dy': 28}, 'bust': {'rot': 40, 'joint_dy': 36},
          'shield_far_l': {'joint_dx': -30, 'joint_dy': 170, 'rot': 75},
          'shield_near_l': {'joint_dx': 22, 'joint_dy': 185, 'rot': -65},
          'shield_near_r': {'joint_dx': 34, 'joint_dy': 178, 'rot': 80},
          'shield_far_r': {'joint_dx': 40, 'joint_dy': 160, 'rot': -70}}, 0.72, 0.68, None),
        ({'monolith': {'dy': 32}, 'bust': {'rot': 44, 'joint_dy': 40},
          'shield_far_l': {'joint_dx': -34, 'joint_dy': 185, 'rot': 85},
          'shield_near_l': {'joint_dx': 24, 'joint_dy': 195, 'rot': -75},
          'shield_near_r': {'joint_dx': 38, 'joint_dy': 190, 'rot': 88},
          'shield_far_r': {'joint_dx': 44, 'joint_dy': 175, 'rot': -80}}, 0.64, 0.84, None),
        ({'monolith': {'dy': 32}, 'bust': {'rot': 44, 'joint_dy': 40},
          'shield_far_l': {'joint_dx': -34, 'joint_dy': 185, 'rot': 85},
          'shield_near_l': {'joint_dx': 24, 'joint_dy': 195, 'rot': -75},
          'shield_near_r': {'joint_dx': 38, 'joint_dy': 190, 'rot': 88},
          'shield_far_r': {'joint_dx': 44, 'joint_dy': 175, 'rot': -80}}, 0.58, 0.92, None),
    ]

    # 3행: 스킬 — 4개의 방패가 본체 앞을 둘러싸며 방화벽 배리어 결집 전개
    skill = [
        ({'monolith': {'dy': -4}, 'bust': {'rot': -2},
          'shield_far_l': {'joint_dx': 16, 'joint_dy': -4, 'rot': -8},
          'shield_near_l': {'joint_dx': -8, 'joint_dy': 6, 'rot': 6},
          'shield_near_r': {'joint_dx': -16, 'joint_dy': 4, 'rot': -8},
          'shield_far_r': {'joint_dx': -20, 'joint_dy': -4, 'rot': 10}}, 1.0, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 20, GY - 100, (6, 18), C_WHITE, C_INK, 5), c)[1]),
        ({'monolith': {'dy': -8}, 'bust': {'rot': -4},
          'shield_far_l': {'joint_dx': 32, 'joint_dy': -8, 'rot': -14, 'sx': 1.05, 'sy': 1.05},
          'shield_near_l': {'joint_dx': -18, 'joint_dy': 12, 'rot': 12, 'sx': 1.05, 'sy': 1.05},
          'shield_near_r': {'joint_dx': -34, 'joint_dy': 8, 'rot': -16, 'sx': 1.05, 'sy': 1.05},
          'shield_far_r': {'joint_dx': -42, 'joint_dy': -8, 'rot': 20, 'sx': 1.05, 'sy': 1.05}}, 1.0, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 24, GY - 105, 32, 42, C_WHITE, C_INK, 3), c)[1]),
        ({'monolith': {'dy': -12}, 'bust': {'rot': -6},
          'shield_far_l': {'joint_dx': 45, 'joint_dy': -12, 'rot': -20, 'sx': 1.10, 'sy': 1.10},
          'shield_near_l': {'joint_dx': -28, 'joint_dy': 18, 'rot': 18, 'sx': 1.10, 'sy': 1.10},
          'shield_near_r': {'joint_dx': -48, 'joint_dy': 14, 'rot': -24, 'sx': 1.10, 'sy': 1.10},
          'shield_far_r': {'joint_dx': -60, 'joint_dy': -12, 'rot': 28, 'sx': 1.10, 'sy': 1.10}}, 1.0, 0.0,
         lambda c, r: (draw_hex_shield(ImageDraw.Draw(c), GX - 60, GY - 120, 48, color=C_WHITE, border=C_RED, fill_alpha=75), c)[1]),
        ({'monolith': {'dy': -10}, 'bust': {'rot': -4},
          'shield_far_l': {'joint_dx': 42, 'joint_dy': -10, 'rot': -18, 'sx': 1.12, 'sy': 1.12},
          'shield_near_l': {'joint_dx': -26, 'joint_dy': 16, 'rot': 16, 'sx': 1.12, 'sy': 1.12},
          'shield_near_r': {'joint_dx': -44, 'joint_dy': 12, 'rot': -20, 'sx': 1.12, 'sy': 1.12},
          'shield_far_r': {'joint_dx': -55, 'joint_dy': -10, 'rot': 24, 'sx': 1.12, 'sy': 1.12}}, 1.0, 0.0,
         lambda c, r: (draw_hex_shield(ImageDraw.Draw(c), GX - 64, GY - 120, 54, color=C_RED_HI, border=C_RED, fill_alpha=85),
                       draw_pixel_burst(ImageDraw.Draw(c), GX - 64, GY - 120, (14, 38), C_WHITE, C_INK, 8), c)[2]),
        ({'monolith': {'dy': -4}, 'bust': {'rot': -2},
          'shield_far_l': {'joint_dx': 20, 'joint_dy': -4, 'rot': -8},
          'shield_near_l': {'joint_dx': -10, 'joint_dy': 8, 'rot': 8},
          'shield_near_r': {'joint_dx': -20, 'joint_dy': 6, 'rot': -10},
          'shield_far_r': {'joint_dx': -25, 'joint_dy': -4, 'rot': 12}}, 1.0, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 28, GY - 105, 36, 46, C_WHITE, C_INK, 2), c)[1]),
        ({}, 1.0, 0.0, None),
    ]

    return assemble_sheet('claude', rig, atk, hit, death, skill)


def build_codex():
    """코테크(Codex/Cotech) — 2층 보스: 상부 링·케이블 서스펜션 + 중앙 메인프레임 코어 + 좌우 컴파일러 암."""
    parts_spec = [
        {'name': 'ring',     'poly': [(330, 25), (745, 25), (745, 175), (330, 175)], 'pivot': (535, 95),  'parent': 'core', 'blur': 14, 'weld_radius': 35},
        {'name': 'cables_u', 'polys': [[(195, 0), (470, 0), (430, 235), (195, 235)],
                                       [(520, 0), (985, 0), (985, 495), (725, 495), (705, 215), (520, 215)]], 'pivot': (540, 180), 'parent': 'core', 'blur': 18, 'weld_radius': 55},
        {'name': 'arm_l',    'poly': [(120, 485), (320, 485), (335, 745), (275, 875), (120, 875)], 'pivot': (285, 535), 'parent': 'core', 'blur': 16, 'weld_radius': 55},
        {'name': 'arm_r',    'poly': [(595, 455), (885, 455), (885, 910), (605, 910)],             'pivot': (665, 520), 'parent': 'core', 'blur': 16, 'weld_radius': 60},
        {'name': 'cables_b', 'poly': [(395, 725), (635, 725), (635, 865), (395, 865)],             'pivot': (515, 740), 'parent': 'core', 'blur': 14, 'weld_radius': 40},
        {'name': 'core',     'poly': None, 'pivot': (485, 470), 'parent': None, 'blur': 18},
    ]
    chains = [
        ['cables_u'],
        ['cables_b'],
        ['arm_l'],
        ['core'],
        ['ring'],
        ['arm_r'],
    ]
    rig = SkinnedEnemy('codex', parts_spec, chains=chains, base_size=238, blur_radius=16)

    atk = [
        ({'core': {'rot': 5, 'dx': 10, 'dy': -6}, 'ring': {'rot': -4}, 'cables_u': {'rot': -4},
          'arm_l': {'rot': 16}, 'arm_r': {'rot': -18}, 'cables_b': {'rot': -8}}, 1.0, 0.0, None),
        ({'core': {'rot': 10, 'dx': 18, 'dy': -12}, 'ring': {'rot': -8}, 'cables_u': {'rot': -7},
          'arm_l': {'rot': 28}, 'arm_r': {'rot': -32}, 'cables_b': {'rot': -14}}, 1.05, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 42, GY - 135, (8, 22), C_RED_HI, C_INK, 6), c)[1]),
        ({'core': {'rot': -8, 'dx': -16, 'dy': 8}, 'ring': {'rot': 6}, 'cables_u': {'rot': 5},
          'arm_l': {'rot': -24}, 'arm_r': {'rot': 26}, 'cables_b': {'rot': 12}}, 1.08, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 52, GY - 125, 26, 36, C_RED_HI, C_INK, 3), c)[1]),
        ({'core': {'rot': -12, 'dx': -24, 'dy': 12}, 'ring': {'rot': 10}, 'cables_u': {'rot': 8},
          'arm_l': {'rot': -34}, 'arm_r': {'rot': 38}, 'cables_b': {'rot': 18}}, 1.12, 0.0,
         lambda c, r: (
             draw_laser_beam(ImageDraw.Draw(c), GX - 44, GY - 128, 10, GY - 118, C_RED, C_WHITE, h=16),
             draw_pixel_burst(ImageDraw.Draw(c), 22, GY - 118, (12, 38), C_WHITE, C_INK, 8), c)[2]),
        ({'core': {'rot': -4, 'dx': -8, 'dy': 4}, 'arm_l': {'rot': -12}, 'arm_r': {'rot': 14}}, 1.02, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]
    hit = [
        ({'core': {'rot': 8, 'dx': 14, 'dy': -6}, 'ring': {'rot': -10}, 'arm_l': {'rot': 18}, 'arm_r': {'rot': 16}, 'cables_b': {'rot': -14}}, 1.22, 0.0,
         lambda c, r: draw_hit_spark(c, GX - 32, GY - 128, is_red=True)),
        ({'core': {'rot': 14, 'dx': 24, 'dy': -10}, 'ring': {'rot': -16}, 'arm_l': {'rot': 28}, 'arm_r': {'rot': 26}, 'cables_b': {'rot': -22}}, 1.10, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 10, GY - 135, (10, 26), C_IVORY, C_INK, 7), c)[1]),
        ({'core': {'rot': 18, 'dx': 28, 'dy': -12}, 'ring': {'rot': -20}, 'arm_l': {'rot': 32}, 'arm_r': {'rot': 30}, 'cables_b': {'rot': -26}}, 0.96, 0.0, None),
        ({'core': {'rot': 9, 'dx': 14, 'dy': -5}, 'ring': {'rot': -10}, 'arm_l': {'rot': 16}, 'arm_r': {'rot': 14}}, 0.99, 0.0, None),
        ({'core': {'rot': 3, 'dx': 5}, 'ring': {'rot': -4}, 'arm_l': {'rot': 6}, 'arm_r': {'rot': 5}}, 1.0, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]
    death = [
        ({'core': {'rot': 8, 'dy': 14}, 'ring': {'rot': -12, 'joint_dy': 8}, 'arm_l': {'rot': 14}, 'arm_r': {'rot': -14}}, 1.14, 0.10,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 20, GY - 125, (12, 40), C_RED_HI, C_INK, 8), c)[1]),
        ({'core': {'rot': -8, 'dy': 42}, 'ring': {'rot': 14, 'joint_dy': 20}, 'arm_l': {'rot': -18}, 'arm_r': {'rot': 18}}, 0.92, 0.28,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX - 10, GY - 95, 42, 6, C_SMOKE, C_SILVER), c)[1]),
        ({'core': {'rot': -14, 'dy': 72}, 'ring': {'rot': 22, 'joint_dy': 34}, 'arm_l': {'rot': -28}, 'arm_r': {'rot': 26}}, 0.82, 0.48,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX - 10, GY - 55, 54, 7, C_SMOKE, C_BRASS), c)[1]),
        ({'core': {'rot': -18, 'dy': 96}, 'ring': {'rot': 28, 'joint_dy': 44}, 'arm_l': {'rot': -34}, 'arm_r': {'rot': 32}}, 0.72, 0.68, None),
        ({'core': {'rot': -21, 'dy': 110}, 'ring': {'rot': 32, 'joint_dy': 50}, 'arm_l': {'rot': -38}, 'arm_r': {'rot': 36}}, 0.64, 0.84, None),
        ({'core': {'rot': -22, 'dy': 116}, 'ring': {'rot': 34, 'joint_dy': 52}, 'arm_l': {'rot': -40}, 'arm_r': {'rot': 38}}, 0.58, 0.92, None),
    ]
    skill = [
        ({'core': {'dy': -8}, 'ring': {'rot': 8}, 'arm_l': {'rot': 18}, 'arm_r': {'rot': -18}}, 1.05, 0.0, None),
        ({'core': {'dy': -16}, 'ring': {'rot': 16}, 'arm_l': {'rot': 30}, 'arm_r': {'rot': -30}}, 1.12, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 24, GY - 125, 58, 58, C_RED, C_INK, 3, dashed=True), c)[1]),
        ({'core': {'dy': -20}, 'ring': {'rot': 24}, 'arm_l': {'rot': 36}, 'arm_r': {'rot': -36}}, 1.18, 0.0,
         lambda c, r: (draw_hex_shield(ImageDraw.Draw(c), GX - 64, GY - 115, 44, color=C_IVORY, border=C_RED, fill_alpha=65), c)[1]),
        ({'core': {'rot': -6, 'dx': -12, 'dy': -8}, 'ring': {'rot': -12}, 'arm_l': {'rot': -26}, 'arm_r': {'rot': 28}}, 1.20, 0.0,
         lambda c, r: (
             draw_hex_shield(ImageDraw.Draw(c), GX - 72, GY - 115, 50, color=C_RED_HI, border=C_IVORY, fill_alpha=75),
             draw_lightning_arc(ImageDraw.Draw(c), [(GX - 30, GY - 150), (GX - 70, GY - 120), (GX - 115, GY - 135)], C_WHITE), c)[2]),
        ({'core': {'dy': -4}, 'arm_l': {'rot': -10}, 'arm_r': {'rot': 10}}, 1.04, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]
    return assemble_sheet('codex', rig, atk, hit, death, skill)


def build_zero():
    """아키텍트 제로(Architect Zero) — 보안 등급 6 진보스: 좌우 파편 링 날개 + 신경 케이블 체구 + 가슴 붉은 육각 케이지."""
    parts_spec = [
        {'name': 'wing_l', 'poly': [(65, 80), (390, 80), (355, 315), (310, 625), (365, 845), (65, 845)],   'pivot': (365, 330), 'parent': 'torso', 'blur': 16, 'weld_radius': 0},
        {'name': 'wing_r', 'poly': [(615, 65), (965, 65), (965, 865), (645, 865), (675, 565), (615, 295)], 'pivot': (625, 320), 'parent': 'torso', 'blur': 16, 'weld_radius': 0},
        {'name': 'head',   'poly': [(425, 65), (560, 65), (560, 225), (425, 225)],                         'pivot': (490, 210), 'parent': 'torso', 'blur': 14},
        {'name': 'arm_l',  'poly': [(305, 275), (405, 275), (410, 615), (305, 615)],                       'pivot': (395, 295), 'parent': 'torso', 'blur': 16, 'weld_radius': 48},
        {'name': 'arm_r',  'poly': [(565, 245), (675, 245), (675, 635), (575, 635)],                       'pivot': (585, 285), 'parent': 'torso', 'blur': 16, 'weld_radius': 48},
        {'name': 'legs',   'poly': [(365, 560), (610, 560), (610, 1005), (365, 1005)],                     'pivot': (485, 575), 'parent': 'torso', 'blur': 18},
        {'name': 'torso',  'poly': None, 'pivot': (485, 415), 'parent': None, 'blur': 18},
    ]
    chains = [
        ['wing_l'],
        ['wing_r'],
        ['torso', 'head', 'legs'],
        ['arm_l'],
        ['arm_r'],
    ]
    rig = SkinnedEnemy('zero', parts_spec, chains=chains, base_size=240, blur_radius=16)

    atk = [
        ({'torso': {'rot': 4, 'dx': 8, 'dy': -8}, 'head': {'rot': -4}, 'wing_l': {'rot': 14}, 'wing_r': {'rot': -16},
          'arm_l': {'rot': 18}, 'arm_r': {'rot': -16}, 'legs': {'rot': -6}}, 1.0, 0.0, None),
        ({'torso': {'rot': 8, 'dx': 16, 'dy': -16}, 'head': {'rot': -8}, 'wing_l': {'rot': 26}, 'wing_r': {'rot': -28},
          'arm_l': {'rot': 32}, 'arm_r': {'rot': -28}, 'legs': {'rot': -10}}, 1.06, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 18, GY - 152, (8, 24), C_RED_HI, C_INK, 6), c)[1]),
        ({'torso': {'rot': -8, 'dx': -16, 'dy': 6}, 'head': {'rot': 6}, 'wing_l': {'rot': -20}, 'wing_r': {'rot': 22},
          'arm_l': {'rot': 42}, 'arm_r': {'rot': 18}, 'legs': {'rot': 10}}, 1.10, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 36, GY - 145, 30, 44, C_RED_HI, C_INK, 3), c)[1]),
        ({'torso': {'rot': -12, 'dx': -24, 'dy': 10}, 'head': {'rot': 10}, 'wing_l': {'rot': -30}, 'wing_r': {'rot': 32},
          'arm_l': {'rot': 50}, 'arm_r': {'rot': 26}, 'legs': {'rot': 14}}, 1.14, 0.0,
         lambda c, r: (
             draw_laser_beam(ImageDraw.Draw(c), GX - 26, GY - 148, 8, GY - 135, C_RED, C_WHITE, h=18),
             draw_lightning_arc(ImageDraw.Draw(c), [(GX - 24, GY - 170), (GX - 78, GY - 145), (18, GY - 160)], C_WHITE),
             draw_pixel_burst(ImageDraw.Draw(c), 20, GY - 135, (12, 42), C_WHITE, C_INK, 8), c)[3]),
        ({'torso': {'rot': -4, 'dx': -8, 'dy': 3}, 'wing_l': {'rot': -10}, 'wing_r': {'rot': 12}, 'arm_l': {'rot': 18}}, 1.03, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]
    hit = [
        ({'torso': {'rot': 8, 'dx': 14, 'dy': -4}, 'head': {'rot': 10}, 'wing_l': {'rot': -16}, 'wing_r': {'rot': 18},
          'arm_l': {'rot': 20}, 'arm_r': {'rot': -22}, 'legs': {'rot': -8}}, 1.22, 0.0,
         lambda c, r: draw_hit_spark(c, GX - 18, GY - 148, is_red=True)),
        ({'torso': {'rot': 14, 'dx': 24, 'dy': -8}, 'head': {'rot': 16}, 'wing_l': {'rot': -26}, 'wing_r': {'rot': 28},
          'arm_l': {'rot': 32}, 'arm_r': {'rot': -34}, 'legs': {'rot': -14}}, 1.10, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX, GY - 155, (10, 28), C_IVORY, C_INK, 7), c)[1]),
        ({'torso': {'rot': 18, 'dx': 28, 'dy': -10}, 'head': {'rot': 20}, 'wing_l': {'rot': -30}, 'wing_r': {'rot': 32},
          'arm_l': {'rot': 36}, 'arm_r': {'rot': -38}, 'legs': {'rot': -16}}, 0.96, 0.0, None),
        ({'torso': {'rot': 8, 'dx': 12, 'dy': -4}, 'head': {'rot': 8}, 'wing_l': {'rot': -14}, 'wing_r': {'rot': 16},
          'arm_l': {'rot': 16}, 'arm_r': {'rot': -18}}, 0.99, 0.0, None),
        ({'torso': {'rot': 3, 'dx': 4}, 'wing_l': {'rot': -5}, 'wing_r': {'rot': 6}}, 1.0, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]
    death = [
        ({'torso': {'rot': 8, 'dy': 12}, 'head': {'rot': 12}, 'wing_l': {'rot': -18}, 'wing_r': {'rot': 18}}, 1.16, 0.10,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 14, GY - 145, (14, 44), C_WHITE, C_INK, 8), c)[1]),
        ({'torso': {'rot': -6, 'dy': 45}, 'head': {'rot': -14}, 'wing_l': {'rot': -32, 'joint_dy': 20}, 'wing_r': {'rot': 32, 'joint_dy': 20},
          'arm_l': {'rot': -18}, 'arm_r': {'rot': 18}, 'legs': {'rot': 14}}, 0.96, 0.28,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX, GY - 110, 44, 6, C_IVORY, C_WHITE), c)[1]),
        ({'torso': {'rot': -12, 'dy': 85}, 'head': {'rot': -22}, 'wing_l': {'rot': -44, 'joint_dy': 36}, 'wing_r': {'rot': 44, 'joint_dy': 36},
          'arm_l': {'rot': -26}, 'arm_r': {'rot': 26}, 'legs': {'rot': 24}}, 0.86, 0.48, None),
        ({'torso': {'rot': -18, 'dy': 122}, 'head': {'rot': -28}, 'wing_l': {'rot': -54, 'joint_dy': 48}, 'wing_r': {'rot': 54, 'joint_dy': 48},
          'arm_l': {'rot': -32}, 'arm_r': {'rot': 32}, 'legs': {'rot': 30}}, 0.76, 0.68, None),
        ({'torso': {'rot': -22, 'dy': 146}, 'head': {'rot': -32}, 'wing_l': {'rot': -60, 'joint_dy': 56}, 'wing_r': {'rot': 60, 'joint_dy': 56},
          'arm_l': {'rot': -36}, 'arm_r': {'rot': 36}, 'legs': {'rot': 34}}, 0.68, 0.84, None),
        ({'torso': {'rot': -24, 'dy': 158}, 'head': {'rot': -34}, 'wing_l': {'rot': -64, 'joint_dy': 60}, 'wing_r': {'rot': 64, 'joint_dy': 60},
          'arm_l': {'rot': -38}, 'arm_r': {'rot': 38}, 'legs': {'rot': 36}}, 0.62, 0.92, None),
    ]
    skill = [
        ({'torso': {'dy': -10}, 'wing_l': {'rot': 16}, 'wing_r': {'rot': -16}, 'arm_l': {'rot': 20}, 'arm_r': {'rot': -20}}, 1.06, 0.0, None),
        ({'torso': {'dy': -20}, 'wing_l': {'rot': 30}, 'wing_r': {'rot': -30}, 'arm_l': {'rot': 34}, 'arm_r': {'rot': -34}}, 1.14, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 12, GY - 148, 68, 68, C_RED_HI, C_INK, 3, dashed=True), c)[1]),
        ({'torso': {'dy': -26}, 'wing_l': {'rot': 40}, 'wing_r': {'rot': -40}, 'arm_l': {'rot': 42}, 'arm_r': {'rot': -42}}, 1.20, 0.0,
         lambda c, r: (draw_hex_shield(ImageDraw.Draw(c), GX - 56, GY - 140, 48, color=C_RED_HI, border=C_WHITE, fill_alpha=70), c)[1]),
        ({'torso': {'rot': -6, 'dx': -14, 'dy': -12}, 'wing_l': {'rot': -22}, 'wing_r': {'rot': 22}, 'arm_l': {'rot': 48}, 'arm_r': {'rot': 20}}, 1.22, 0.0,
         lambda c, r: (
             draw_hex_shield(ImageDraw.Draw(c), GX - 72, GY - 140, 56, color=C_WHITE, border=C_RED, fill_alpha=75),
             draw_lightning_arc(ImageDraw.Draw(c), [(GX - 18, GY - 175), (GX - 68, GY - 140), (GX - 120, GY - 155)], C_RED_HI), c)[2]),
        ({'torso': {'dy': -5}, 'wing_l': {'rot': -8}, 'wing_r': {'rot': 8}}, 1.05, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]
    return assemble_sheet('zero', rig, atk, hit, death, skill)


def build_compiler():
    """컴파일 드론(Compiler Drone) — 2층 일반: 본체 + 우측 추진 팩 + 하부 데이터 블록 사출 암."""
    parts_spec = [
        {'name': 'arm',   'poly': [(125, 555), (625, 555), (625, 935), (125, 935)], 'pivot': (500, 595), 'parent': 'body', 'blur': 14, 'weld_radius': 50},
        {'name': 'pod_r', 'poly': [(595, 255), (930, 255), (930, 655), (595, 655)], 'pivot': (640, 435), 'parent': 'body', 'blur': 16, 'weld_radius': 55},
        {'name': 'body',  'poly': None, 'pivot': (475, 420), 'parent': None, 'blur': 16},
    ]
    chains = [['body'], ['pod_r'], ['arm']]
    rig = SkinnedEnemy('compiler', parts_spec, chains=chains, base_size=224, blur_radius=15)

    atk = [
        ({'body': {'rot': 6, 'dx': 12, 'dy': -10}, 'pod_r': {'rot': -6}, 'arm': {'rot': -16}}, 1.0, 0.0, None),
        ({'body': {'rot': 12, 'dx': 20, 'dy': -18}, 'pod_r': {'rot': -12}, 'arm': {'rot': -28}}, 1.05, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 56, GY - 115, (8, 20), C_RED_HI, C_INK, 6), c)[1]),
        ({'body': {'rot': -10, 'dx': -18, 'dy': 8}, 'pod_r': {'rot': 10}, 'arm': {'rot': 22}}, 1.08, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 68, GY - 48, 22, 22, C_WHITE, C_INK, 2), c)[1]),
        ({'body': {'rot': -14, 'dx': -28, 'dy': 14}, 'pod_r': {'rot': 14}, 'arm': {'rot': 34}}, 1.12, 0.0,
         lambda c, r: (
             draw_laser_beam(ImageDraw.Draw(c), GX - 58, GY - 112, 12, GY - 98, C_RED, C_WHITE, h=12),
             draw_pixel_burst(ImageDraw.Draw(c), 24, GY - 98, (10, 32), C_WHITE, C_INK, 8), c)[2]),
        ({'body': {'rot': -5, 'dx': -10, 'dy': 4}, 'arm': {'rot': 12}}, 1.02, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]
    hit = [
        ({'body': {'rot': 10, 'dx': 16, 'dy': -6}, 'pod_r': {'rot': 10}, 'arm': {'rot': -18}}, 1.22, 0.0,
         lambda c, r: draw_hit_spark(c, GX - 48, GY - 115, is_red=True)),
        ({'body': {'rot': 16, 'dx': 26, 'dy': -12}, 'pod_r': {'rot': 16}, 'arm': {'rot': -28}}, 1.10, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 12, GY - 125, (10, 26), C_IVORY, C_INK, 7), c)[1]),
        ({'body': {'rot': 20, 'dx': 30, 'dy': -14}, 'pod_r': {'rot': 20}, 'arm': {'rot': -32}}, 0.95, 0.0, None),
        ({'body': {'rot': 9, 'dx': 14, 'dy': -5}, 'pod_r': {'rot': 8}, 'arm': {'rot': -14}}, 0.99, 0.0, None),
        ({'body': {'rot': 3, 'dx': 5}, 'arm': {'rot': -5}}, 1.0, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]
    death = [
        ({'body': {'rot': 10, 'dy': 12}, 'pod_r': {'rot': 12}, 'arm': {'rot': -18}}, 1.14, 0.10,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 10, GY - 110, (12, 38), C_RED_HI, C_INK, 8), c)[1]),
        ({'body': {'rot': -10, 'dy': 48}, 'pod_r': {'rot': -12}, 'arm': {'rot': 16}}, 0.92, 0.28,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX, GY - 85, 38, 6, C_SMOKE, C_SILVER), c)[1]),
        ({'body': {'rot': -18, 'dy': 92}, 'pod_r': {'rot': -18}, 'arm': {'rot': 26}}, 0.82, 0.48, None),
        ({'body': {'rot': -24, 'dy': 128}, 'pod_r': {'rot': -22}, 'arm': {'rot': 32}}, 0.72, 0.68, None),
        ({'body': {'rot': -28, 'dy': 148}, 'pod_r': {'rot': -26}, 'arm': {'rot': 36}}, 0.64, 0.84, None),
        ({'body': {'rot': -30, 'dy': 158}, 'pod_r': {'rot': -28}, 'arm': {'rot': 38}}, 0.58, 0.92, None),
    ]
    skill = [
        ({'body': {'dy': -8}, 'arm': {'rot': 12}}, 1.05, 0.0, None),
        ({'body': {'dy': -16}, 'arm': {'rot': 24}}, 1.12, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 64, GY - 48, 28, 28, C_WHITE, C_INK, 2, dashed=True), c)[1]),
        ({'body': {'dy': -20}, 'arm': {'rot': 34}}, 1.18, 0.0,
         lambda c, r: (draw_hex_shield(ImageDraw.Draw(c), GX - 68, GY - 54, 34, color=C_WHITE, border=C_SILVER, fill_alpha=70), c)[1]),
        ({'body': {'rot': -8, 'dx': -16, 'dy': -10}, 'arm': {'rot': 42}}, 1.20, 0.0,
         lambda c, r: (
             draw_hex_shield(ImageDraw.Draw(c), GX - 78, GY - 60, 40, color=C_IVORY, border=C_RED, fill_alpha=75),
             draw_pixel_burst(ImageDraw.Draw(c), GX - 78, GY - 60, (10, 32), C_WHITE, C_INK, 6), c)[2]),
        ({'body': {'dy': -4}, 'arm': {'rot': 14}}, 1.04, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]
    return assemble_sheet('compiler', rig, atk, hit, death, skill)


def build_holo():
    """홀로그램 잔상(Hologram Afterimage) — 3층 일반: 스캔라인 안드로이드 환영."""
    parts_spec = [
        {'name': 'head',  'poly': [(380, 95), (595, 95), (595, 295), (380, 295)],   'pivot': (485, 285), 'parent': 'torso', 'blur': 14},
        {'name': 'arm_l', 'poly': [(290, 325), (395, 325), (395, 685), (290, 685)], 'pivot': (385, 355), 'parent': 'torso', 'blur': 14, 'weld_radius': 45},
        {'name': 'arm_r', 'poly': [(565, 305), (725, 305), (725, 695), (565, 695)], 'pivot': (590, 350), 'parent': 'torso', 'blur': 14, 'weld_radius': 45},
        {'name': 'legs',  'poly': [(380, 565), (630, 565), (630, 930), (380, 930)], 'pivot': (495, 575), 'parent': 'torso', 'blur': 16},
        {'name': 'torso', 'poly': None, 'pivot': (485, 455), 'parent': None, 'blur': 16},
    ]
    chains = [['torso', 'head', 'legs'], ['arm_l'], ['arm_r']]
    rig = SkinnedEnemy('holo', parts_spec, chains=chains, base_size=220, blur_radius=14)

    atk = [
        ({'torso': {'rot': 6, 'dx': 12, 'dy': -6}, 'head': {'rot': -4}, 'arm_l': {'rot': 18}, 'arm_r': {'rot': -18}, 'legs': {'rot': -6}}, 1.0, 0.0, None),
        ({'torso': {'rot': 12, 'dx': 22, 'dy': -12}, 'head': {'rot': -8}, 'arm_l': {'rot': 32}, 'arm_r': {'rot': -32}, 'legs': {'rot': -12}}, 1.06, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX + 8, GY - 120, 38, 68, C_SILVER, C_INK, 2, dashed=True), c)[1]),
        ({'torso': {'rot': -12, 'dx': -22, 'dy': 6}, 'head': {'rot': 8}, 'arm_l': {'rot': 46}, 'arm_r': {'rot': 20}, 'legs': {'rot': 12}}, 1.10, 0.0,
         lambda c, r: (draw_lightning_arc(ImageDraw.Draw(c), [(GX - 22, GY - 155), (GX - 68, GY - 135), (GX - 110, GY - 145)], C_WHITE), c)[1]),
        ({'torso': {'rot': -16, 'dx': -32, 'dy': 10}, 'head': {'rot': 12}, 'arm_l': {'rot': 56}, 'arm_r': {'rot': 28}, 'legs': {'rot': 16}}, 1.14, 0.0,
         lambda c, r: (
             draw_laser_beam(ImageDraw.Draw(c), GX - 26, GY - 162, 12, GY - 132, C_RED, C_WHITE, h=12),
             draw_pixel_burst(ImageDraw.Draw(c), 22, GY - 132, (10, 34), C_WHITE, C_INK, 8), c)[2]),
        ({'torso': {'rot': -6, 'dx': -12, 'dy': 3}, 'arm_l': {'rot': 22}}, 1.03, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]
    hit = [
        ({'torso': {'rot': 10, 'dx': 18, 'dy': -4}, 'head': {'rot': 12}, 'arm_l': {'rot': 22}, 'arm_r': {'rot': -24}, 'legs': {'rot': -10}}, 1.24, 0.0,
         lambda c, r: draw_hit_spark(c, GX - 18, GY - 135, is_red=True)),
        ({'torso': {'rot': 16, 'dx': 28, 'dy': -8}, 'head': {'rot': 18}, 'arm_l': {'rot': 34}, 'arm_r': {'rot': -36}, 'legs': {'rot': -16}}, 1.10, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX + 16, GY - 125, 34, 62, C_WHITE, C_INK, 2, dashed=True), c)[1]),
        ({'torso': {'rot': 20, 'dx': 34, 'dy': -10}, 'head': {'rot': 22}, 'arm_l': {'rot': 38}, 'arm_r': {'rot': -40}, 'legs': {'rot': -18}}, 0.94, 0.0, None),
        ({'torso': {'rot': 10, 'dx': 16, 'dy': -4}, 'head': {'rot': 10}, 'arm_l': {'rot': 18}, 'arm_r': {'rot': -20}}, 0.98, 0.0, None),
        ({'torso': {'rot': 4, 'dx': 6}, 'arm_l': {'rot': 6}, 'arm_r': {'rot': -6}}, 1.0, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]
    death = [
        ({'torso': {'rot': 8, 'dy': 14}, 'head': {'rot': 14}, 'arm_l': {'rot': -20}, 'arm_r': {'rot': 20}}, 1.16, 0.10,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX, GY - 125, (12, 38), C_WHITE, C_INK, 8), c)[1]),
        ({'torso': {'rot': -8, 'dy': 52, 'sx': 1.08, 'sy': 0.86}, 'arm_l': {'rot': -28}, 'arm_r': {'rot': 28}}, 0.92, 0.28, None),
        ({'torso': {'rot': -14, 'dy': 98, 'sx': 1.14, 'sy': 0.68}, 'arm_l': {'rot': -36}, 'arm_r': {'rot': 36}}, 0.82, 0.48, None),
        ({'torso': {'rot': -18, 'dy': 138, 'sx': 1.18, 'sy': 0.52}}, 0.72, 0.68, None),
        ({'torso': {'rot': -20, 'dy': 164, 'sx': 1.22, 'sy': 0.38}}, 0.64, 0.84, None),
        ({'torso': {'rot': -22, 'dy': 178, 'sx': 1.25, 'sy': 0.28}}, 0.58, 0.92, None),
    ]
    skill = [
        ({'torso': {'dx': -12, 'dy': -8}, 'arm_l': {'rot': 20}, 'arm_r': {'rot': -20}}, 1.08, 0.0, None),
        ({'torso': {'dx': 16, 'dy': -14}, 'arm_l': {'rot': 32}, 'arm_r': {'rot': -32}}, 1.14, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 18, GY - 120, 42, 74, C_WHITE, C_INK, 2, dashed=True), c)[1]),
        ({'torso': {'dx': -18, 'dy': -18}, 'arm_l': {'rot': 40}, 'arm_r': {'rot': -40}}, 1.20, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX + 18, GY - 120, 42, 74, C_RED_HI, C_INK, 2, dashed=True), c)[1]),
        ({'torso': {'dx': 10, 'dy': -10}, 'arm_l': {'rot': 30}, 'arm_r': {'rot': -30}}, 1.22, 0.0,
         lambda c, r: (draw_hex_shield(ImageDraw.Draw(c), GX - 48, GY - 120, 42, color=C_WHITE, border=C_SILVER, fill_alpha=65), c)[1]),
        ({'torso': {'dy': -4}, 'arm_l': {'rot': 12}, 'arm_r': {'rot': -12}}, 1.05, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]
    return assemble_sheet('holo', rig, atk, hit, death, skill)


def build_arm():
    """코테크 작업 팔(Cotech Work Arm) — 2층 정예: 천장 마운트 -> 어깨 -> 상완 -> 전완+집게 4단 다관절 체인."""
    parts_spec = [
        {'name': 'mount',     'poly': [(535, 95), (870, 95), (870, 250), (535, 250)],   'pivot': (680, 155), 'parent': None,        'blur': 14},
        {'name': 'shoulder',  'poly': [(335, 215), (785, 215), (785, 455), (335, 455)], 'pivot': (650, 245), 'parent': 'mount',     'blur': 16},
        {'name': 'upper_arm', 'poly': [(480, 385), (765, 385), (765, 625), (480, 625)], 'pivot': (565, 365), 'parent': 'shoulder',  'blur': 16},
        {'name': 'forearm',   'poly': None,                                             'pivot': (665, 610), 'parent': 'upper_arm', 'blur': 16},
    ]
    chains = [['mount', 'shoulder', 'upper_arm', 'forearm']]
    rig = SkinnedEnemy('arm', parts_spec, chains=chains, base_size=234, blur_radius=16)

    atk = [
        ({'shoulder': {'rot': 6}, 'upper_arm': {'rot': -14}, 'forearm': {'rot': 18}}, 1.0, 0.0, None),
        ({'shoulder': {'rot': 12}, 'upper_arm': {'rot': -26}, 'forearm': {'rot': 34}}, 1.05, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX - 34, GY - 150, (8, 22), C_RED_HI, C_INK, 6), c)[1]),
        ({'shoulder': {'rot': -8}, 'upper_arm': {'rot': 16}, 'forearm': {'rot': -20}}, 1.08, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 78, GY - 48, 28, 28, C_WHITE, C_INK, 3), c)[1]),
        ({'shoulder': {'rot': -14}, 'upper_arm': {'rot': 26}, 'forearm': {'rot': -32}}, 1.12, 0.0,
         lambda c, r: (
             draw_laser_beam(ImageDraw.Draw(c), GX - 38, GY - 148, 12, GY - 85, C_RED, C_WHITE, h=14),
             draw_pixel_burst(ImageDraw.Draw(c), GX - 86, GY - 42, (12, 38), C_WHITE, C_INK, 8), c)[2]),
        ({'shoulder': {'rot': -5}, 'upper_arm': {'rot': 10}, 'forearm': {'rot': -12}}, 1.02, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]
    hit = [
        ({'shoulder': {'rot': 10}, 'upper_arm': {'rot': -18}, 'forearm': {'rot': -14}}, 1.22, 0.0,
         lambda c, r: draw_hit_spark(c, GX - 32, GY - 148, is_red=True)),
        ({'shoulder': {'rot': 18}, 'upper_arm': {'rot': -28}, 'forearm': {'rot': -24}}, 1.10, 0.0,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX, GY - 135, (10, 26), C_IVORY, C_INK, 7), c)[1]),
        ({'shoulder': {'rot': 22}, 'upper_arm': {'rot': -34}, 'forearm': {'rot': -28}}, 0.95, 0.0, None),
        ({'shoulder': {'rot': 10}, 'upper_arm': {'rot': -16}, 'forearm': {'rot': -12}}, 0.99, 0.0, None),
        ({'shoulder': {'rot': 4}, 'upper_arm': {'rot': -6}, 'forearm': {'rot': -4}}, 1.0, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]
    death = [
        ({'mount': {'dy': 6}, 'shoulder': {'rot': 10}, 'upper_arm': {'rot': -16}, 'forearm': {'rot': -14}}, 1.14, 0.10,
         lambda c, r: (draw_pixel_burst(ImageDraw.Draw(c), GX + 10, GY - 160, (12, 40), C_RED_HI, C_INK, 8), c)[1]),
        ({'mount': {'dy': 26}, 'shoulder': {'rot': -12}, 'upper_arm': {'rot': 14}, 'forearm': {'rot': -18}}, 0.92, 0.28,
         lambda c, r: (draw_spores(ImageDraw.Draw(c), GX, GY - 110, 42, 6, C_SMOKE, C_SILVER), c)[1]),
        ({'mount': {'dy': 58}, 'shoulder': {'rot': -22}, 'upper_arm': {'rot': 26}, 'forearm': {'rot': -30}}, 0.82, 0.48, None),
        ({'mount': {'dy': 88}, 'shoulder': {'rot': -30}, 'upper_arm': {'rot': 34}, 'forearm': {'rot': -38}}, 0.72, 0.68, None),
        ({'mount': {'dy': 108}, 'shoulder': {'rot': -34}, 'upper_arm': {'rot': 38}, 'forearm': {'rot': -42}}, 0.64, 0.84, None),
        ({'mount': {'dy': 118}, 'shoulder': {'rot': -36}, 'upper_arm': {'rot': 40}, 'forearm': {'rot': -44}}, 0.58, 0.92, None),
    ]
    skill = [
        ({'shoulder': {'rot': 8}, 'upper_arm': {'rot': -16}, 'forearm': {'rot': 14}}, 1.05, 0.0, None),
        ({'shoulder': {'rot': 16}, 'upper_arm': {'rot': -28}, 'forearm': {'rot': 26}}, 1.12, 0.0,
         lambda c, r: (draw_pixel_ring(ImageDraw.Draw(c), GX - 72, GY - 65, 36, 36, C_RED, C_INK, 3, dashed=True), c)[1]),
        ({'shoulder': {'rot': 20}, 'upper_arm': {'rot': -34}, 'forearm': {'rot': 34}}, 1.18, 0.0,
         lambda c, r: (draw_hex_shield(ImageDraw.Draw(c), GX - 76, GY - 72, 42, color=C_IVORY, border=C_RED, fill_alpha=70), c)[1]),
        ({'shoulder': {'rot': -10}, 'upper_arm': {'rot': 18}, 'forearm': {'rot': -22}}, 1.20, 0.0,
         lambda c, r: (
             draw_hex_shield(ImageDraw.Draw(c), GX - 82, GY - 54, 48, color=C_RED_HI, border=C_WHITE, fill_alpha=75),
             draw_pixel_burst(ImageDraw.Draw(c), GX - 82, GY - 54, (12, 36), C_WHITE, C_INK, 8), c)[2]),
        ({'shoulder': {'rot': -4}, 'upper_arm': {'rot': 8}, 'forearm': {'rot': -8}}, 1.04, 0.0, None),
        ({}, 1.0, 0.0, None),
    ]
    return assemble_sheet('arm', rig, atk, hit, death, skill)

def update_art_js(metas):
    body = ', '.join(f"{n}:{{ iw:{m['iw']}, ih:{m['ih']} }}" for n, m in metas.items())
    block = (
        f'const ART_SHEET = {{ cell:{CELL}, ax:{GX}, foot:{GY},\n'
        f'  {body} }};'
    )
    src = ART_JS.read_text(encoding='utf8')
    new, n = re.subn(r'const ART_SHEET = \{.*?\};', block, src, count=1, flags=re.S)
    assert n == 1, 'js/art.js에서 ART_SHEET 블록을 찾지 못함'
    ART_JS.write_text(new, encoding='utf8')


def main():
    metas = {}
    metas['rick'] = build_rick()
    metas['sentinel'] = build_sentinel()
    metas['codex'] = build_codex()
    metas['sludge'] = build_sludge()
    metas['drone'] = build_drone()
    metas['guardian'] = build_guardian()
    metas['disperser'] = build_disperser()
    metas['gemini'] = build_gemini()
    metas['omnis'] = build_omnis()
    metas['claude'] = build_claude()
    metas['zero'] = build_zero()
    metas['compiler'] = build_compiler()
    metas['holo'] = build_holo()
    metas['arm'] = build_arm()
    update_art_js(metas)


if __name__ == '__main__':
    main()
