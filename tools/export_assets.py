#!/usr/bin/env python3
"""브릭 크롤 에셋 내보내기: 게임 JS/CSS에 정의된 도트 리소스를 PNG·GIF로 뽑는다.

원본은 언제나 게임 코드다. 스프라이트·아이콘·폰트·구슬 각인은 js/sprites.js를,
색은 css/style.css의 토큰을 정규식으로 읽어 온다. 그래서 게임에서 도트를 고치면
이 툴을 다시 돌리기만 하면 이미지가 따라온다(두 곳에 그림을 나눠 두지 않는다).

애니메이션은 게임의 연출 공식(battle.js의 burst·pop·projs·lunge·deadT, moveBall 물리)을
그대로 옮겨 재현한다. 여기에 툴 전용 연출 두 가지(충격파 링, 히트스톱)를 더했다.
게임에는 아직 없으므로, 마음에 들면 게임 쪽으로 옮길 후보로 본다.

사용법:
    pip install pillow
    python3 tools/export_assets.py                    # docs/assets/light 에 전부
    python3 tools/export_assets.py --theme both       # 라이트·다크 둘 다
    python3 tools/export_assets.py --only sprites,fx  # 일부만
"""
import argparse
import copy
import math
import random
import re
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # 개발 도구라 게임 본체에는 영향이 없다. 설치 안내만 하고 끝낸다
    sys.exit('Pillow가 필요합니다: pip install pillow')

ROOT = Path(__file__).resolve().parent.parent
FPS = 25
DT = 1 / FPS

# ── 게임 상수: js/config.js 와 같은 값이어야 장면 배치가 게임과 일치한다
W, H, BT, FLOOR = 180, 340, 110, 330
COLS, CW, OX, ROWH, BRH, MAXROW = 7, 24, 6, 14, 12, 11
RIGHT = OX + COLS * CW
CRASH_Y = BT + 4 + MAXROW * ROWH - 1
PX, MX, BALL_SPEED = 44, 136, 300


def row_y(r):
    return BT + 4 + r * ROWH


# ═════════════════════════════════════════════ 1. 게임 소스 파싱
def _block(src, anchor):
    """anchor 다음에 오는 첫 { ... } 를 괄호 짝을 맞춰 잘라낸다."""
    i = src.index(anchor)
    j = src.index('{', i)
    depth = 0
    for k in range(j, len(src)):
        if src[k] == '{':
            depth += 1
        elif src[k] == '}':
            depth -= 1
            if depth == 0:
                return src[j:k + 1]
    raise ValueError(f'블록이 닫히지 않음: {anchor}')


def _str_arrays(text):
    out = {}
    for m in re.finditer(r'(\w+)\s*:\s*\[(.*?)\]', text, re.S):
        out[m.group(1)] = re.findall(r'"([^"]*)"', m.group(2))
    return out


def load_game():
    js = (ROOT / 'js/sprites.js').read_text(encoding='utf-8')
    css = (ROOT / 'css/style.css').read_text(encoding='utf-8')
    spr = _str_arrays(_block(js, 'const SPR'))
    icon = _str_arrays(_block(js, 'const ICON'))
    icon.update(_str_arrays(_block(js, 'Object.assign(ICON')))
    font = dict(re.findall(r"'(.)'\s*:\s*'([01]{15})'", _block(js, 'const FONT')))
    logo_font = _str_arrays(_block(js, 'const LOGO_FONT'))
    lw, lh = map(int, re.search(r'LOGO_W\s*=\s*(\d+),\s*LOGO_H\s*=\s*(\d+)', js).groups())

    # 구슬 각인: drawOrbSprite 안의 rect(C.색, x, y, w, h) 호출을 공통부와 종류별 분기로 나눈다
    body = js[js.index('function drawOrbSprite'):]
    body = body[:body.index('g.restore()')]
    rect_re = re.compile(r'rect\(C\.(\w+),\s*(-?\d+),\s*(-?\d+),\s*(\d+),\s*(\d+)\)')
    marks = list(re.finditer(r"kind === '(\w+)'", body))
    base_end = body.index('if (kind') if marks else len(body)
    # basic은 분기가 없는 무각인 구슬이라 맨 앞에 둔다(목록 순서 = 희귀도 순)
    orb = {'_base': [(c, *map(int, r)) for c, *r in rect_re.findall(body[:base_end])], 'basic': []}
    for n, m in enumerate(marks):
        end = marks[n + 1].start() if n + 1 < len(marks) else len(body)
        orb[m.group(1)] = [(c, *map(int, r)) for c, *r in rect_re.findall(body[m.end():end])]

    def tokens(block):
        return {k: v for k, v in re.findall(r'--(\w+):\s*(#[0-9A-Fa-f]{6})', block)}
    light = tokens(_block(css, ':root'))
    dark = tokens(_block(css, ':root[data-theme="dark"]'))
    return dict(spr=spr, icon=icon, font=font, logo_font=logo_font, logo_wh=(lw, lh),
                orb=orb, themes={'light': light, 'dark': dark})


# ═════════════════════════════════════════════ 2. 캔버스(게임 ctx의 최소 대역)
def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


class Canvas:
    """fillRect·globalAlpha·이동 변환(흔들림)만 흉내 낸다. 게임 렌더가 쓰는 건 이것뿐이다."""

    def __init__(self, w, h, bg=None):
        self.w, self.h = w, h
        self.img = Image.new('RGBA', (w, h), (*hex_rgb(bg), 255) if bg else (0, 0, 0, 0))
        self.px = self.img.load()
        self.alpha = 1.0
        self.ox = self.oy = 0

    def rect(self, x, y, w, h, col):
        x0, y0 = round(x + self.ox), round(y + self.oy)
        x1, y1 = x0 + max(0, round(w)), y0 + max(0, round(h))
        self.rect_edges(x0, y0, x1, y1, col)

    def rect_edges(self, x0, y0, x1, y1, col):
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(self.w, x1), min(self.h, y1)
        if x0 >= x1 or y0 >= y1 or self.alpha <= 0:
            return
        r, g, b = hex_rgb(col)
        a = min(1.0, self.alpha)
        px = self.px
        for yy in range(y0, y1):
            for xx in range(x0, x1):
                if a >= 1:
                    px[xx, yy] = (r, g, b, 255)
                else:
                    pr, pg, pb, pa = px[xx, yy]
                    na = a + pa / 255 * (1 - a)
                    if na <= 0:
                        continue
                    k = a / na
                    px[xx, yy] = (round(r * k + pr * (1 - k)), round(g * k + pg * (1 - k)),
                                  round(b * k + pb * (1 - k)), round(na * 255))

    def scaled(self, s):
        return self.img.resize((self.w * s, self.h * s), Image.NEAREST)


# ═════════════════════════════════════════════ 3. 그리기 헬퍼(sprites.js 이식)
class Art:
    def __init__(self, game, theme):
        self.g = game
        self.C = game['themes'][theme]
        self.theme = theme
        self._orb_cache = {}

    def text(self, cv, s, x, y, col, sc=1, align='left'):
        w = (len(s) * 4 - 1) * sc
        x0 = round(x - w / 2 if align == 'center' else x)
        y = round(y)
        for i, ch in enumerate(s):
            f = self.g['font'].get(ch)
            if not f:
                continue
            for p in range(15):
                if f[p] == '1':
                    cv.rect(x0 + (i * 4 + p % 3) * sc, y + (p // 3) * sc, sc, sc, col)
        return w

    def icon(self, cv, name, x, y, col, sc=1):
        m = self.g['icon'].get(name)
        if not m:
            return
        x, y = round(x), round(y)
        for r in range(7):
            for c in range(7):
                if m[r][c] == '#':
                    cv.rect(x + c * sc, y + r * sc, sc, sc, col)

    def sprite(self, cv, mp, x, y, sc, main, alt, eye):
        x, y = round(x), round(y)
        for r, row in enumerate(mp):
            for c, ch in enumerate(row):
                if ch == '.':
                    continue
                cv.rect(x + c * sc, y + r * sc, sc, sc, main if ch == '#' else alt if ch == '+' else eye)

    def orb(self, cv, kind, x, y, size=9):
        """drawOrbSprite: 12단위 격자를 size로 축소. 브라우저의 안티에일리어싱 대신 경계를 반올림한다."""
        u = size / 12
        tx, ty = round(x - size / 2), round(y - size / 2)
        for col, a, b, w, h in self.g['orb']['_base'] + self.g['orb'].get(kind, []):
            cv.rect_edges(round(tx + a * u + cv.ox), round(ty + b * u + cv.oy),
                          round(tx + (a + w) * u + cv.ox), round(ty + (b + h) * u + cv.oy), self.C[col])

    def logo(self):
        lw, lh = self.g['logo_wh']
        lf = self.g['logo_font']
        cv = Canvas(lw, lh)

        def word(wd, y):
            width = sum(len(lf[ch][0]) + 1 for ch in wd) - 1
            x = (lw - width) // 2
            for ch in wd:
                for j, row in enumerate(lf[ch]):
                    for i, v in enumerate(row):
                        if v == '#':
                            cv.rect(x + i, y + j, 1, 1, self.C['ink'])
                x += len(lf[ch][0]) + 1
        word('BRICK', 1)
        word('CRAWL', 8)
        for k in range(6):
            if k != 3:
                cv.rect(1 + k * 5, 19, 4, 2, self.C['ink3'])
        cv.rect(17, 16, 1, 1, self.C['ink'])
        return cv


# ═════════════════════════════════════════════ 4. 장면(battle.js·render.js 이식)
MON_STAT = {  # data.js MON의 0세션 기본값(체력은 WALL.hpMul 0.6 반영). 장면 HUD 표시용
    'slime': (4, 1, 0), 'bat': (5, 1, 0), 'golem': (5, 1, 2), 'shroom': (5, 1, 1), 'boss': (10, 1, 1),
}


class Scene:
    def __init__(self, art, mon='slime', seed=1, elite=False, view_h=H, top=0):
        self.a, self.C = art, art.C
        self.rng = random.Random(seed)
        hp, atk, df = MON_STAT[mon]
        self.mon, self.elite, self.boss = mon, elite, mon == 'boss'
        self.p = dict(hp=20, max=20, atk=1, df=0, poison=0, flash=0.0, squash=0.0)
        self.m = dict(hp=hp, max=hp, atk=atk, df=df, poison=0, phase=1, flash=0.0, lunge=0.0,
                      dead=False, deadT=0.0, recoil=0.0)
        self.bricks, self.balls, self.projs, self.pops, self.parts, self.cf, self.rings = [], [], [], [], [], [], []
        self.shake = 0.0
        self.time = 0.0
        self.freeze = 0      # 히트스톱(프레임 단위). 툴 전용 연출
        self.intent = None   # ('atk', 값) 등. None이면 표시 안 함
        self.aim = None
        self.lx = W / 2
        self.launcher = None
        self.view_h, self.top = view_h, top
        self.on_arrive = None

    # ── 연출 원본: battle.js의 burst·pop
    def burst(self, x, y, col, n):
        for _ in range(n):
            a = self.rng.random() * math.pi * 2
            s = 25 + self.rng.random() * 55
            self.parts.append(dict(x=x, y=y, vx=math.cos(a) * s, vy=math.sin(a) * s - 20,
                                   t=0.35 + self.rng.random() * 0.3, col=col))

    def pop(self, x, y, txt, col, icon=None):
        self.pops.append(dict(x=x, y=y, txt=txt, col=col, icon=icon, t=0.9))

    def ring(self, x, y, col, r1=18, dur=0.3):
        self.rings.append(dict(x=x, y=y, col=col, r1=r1, t=0.0, dur=dur))

    def brick(self, r, c, typ='n', hp=1, instant=True):
        b = dict(r=r, c=c, y=row_y(r) if instant else row_y(r) - ROWH, hp=hp, type=typ, flash=0.0, dead=False)
        self.bricks.append(b)
        return b

    # ── 피해 처리
    @staticmethod
    def hurt(t, v):
        ab = min(t['df'], v)
        t['df'] -= ab
        t['hp'] = max(0, t['hp'] - (v - ab))
        return ab, v - ab

    def hurt_player(self, v, icon=None):
        ab, hit = self.hurt(self.p, v)
        C = self.C
        if ab:
            self.pop(PX, 42, f'-{ab}', C['ink2'], 'shield')
        if hit:
            self.p['flash'] = 0.18
            self.p['squash'] = 0.2
            self.shake = max(self.shake, 5)
            self.burst(PX, 66, C['accent'], 10)
            self.pop(PX, 28 if ab else 30, f'-{hit}', C['accent'], icon)
            self.freeze = 2
        else:
            self.burst(PX, 66, C['ink3'], 6)
            self.ring(PX, 66, C['ink3'], 14, 0.25)

    def kill(self):
        m = self.m
        m['dead'] = True
        self.balls = []
        self.shake = 6
        self.burst(MX, 62, self.C['ink'], 26)
        self.ring(MX, 62, self.C['ink'], 30, 0.45)
        self.freeze = 4

    def on_break(self, b):
        C = self.C
        bx, by = OX + b['c'] * CW + CW / 2, b['y'] + BRH / 2
        if b['type'] in ('n', 'stone'):
            self.burst(bx, by, C['ink3'], 4)
        elif b['type'] == 'poison':
            self.projs.append(dict(x0=bx, y0=by, x1=PX, y1=66, t=0, dur=0.36, kind='poison', v=1))
            self.burst(bx, by, C['accent'], 7)
        else:
            self.projs.append(dict(x0=bx, y0=by, x1=PX, y1=66, t=0, dur=0.36, kind=b['type'], v=1))
            self.burst(bx, by, C['ink'], 5)

    def ball_break(self, ball, br):
        C = self.C
        if ball['kind'] == 'guard':
            self.p['df'] += 1
            self.pop(PX + 12, 88, '+1', C['ink2'], 'shield')
        if ball['kind'] == 'bomb' and not ball.get('bombed'):
            ball['bombed'] = True
            self.shake = max(self.shake, 3)
            cx, cy = OX + br['c'] * CW + CW / 2, br['y'] + BRH / 2
            self.burst(cx, cy, C['ink'], 16)
            self.ring(cx, cy, C['ink2'], 26, 0.32)
            self.freeze = 3
            for o in self.bricks:
                if o['dead'] or o is br or abs(o['r'] - br['r']) > 1 or abs(o['c'] - br['c']) > 1:
                    continue
                o['hp'] -= 1
                o['flash'] = 0.1
                if o['hp'] <= 0:
                    o['dead'] = True
                    self.on_break(o)

    def arrive(self, pr):
        C, m, p = self.C, self.m, self.p
        if pr['kind'] == 'dmg':
            if m['dead']:
                return
            ab, hit = self.hurt(m, pr['v'])
            m['flash'] = 0.1
            m['recoil'] = 0.15
            jx = MX + (self.rng.random() * 16 - 8)
            if ab:
                self.pop(jx, 44, f'-{ab}', C['ink2'], 'shield')
            if hit:
                self.pop(jx, 32 if ab else 44, f'-{hit}', C['ink'])
            if pr.get('venom'):
                m['poison'] += 1
                self.pop(MX + 20, 30, '+1', C['accent'], 'skull')
            if m['hp'] == 0:
                self.kill()
        elif pr['kind'] == 'atk':
            p['atk'] += 1
            self.pop(PX - 26, 88, '+1', C['ink'], 'sword')
        elif pr['kind'] == 'def':
            p['df'] += 2
            self.pop(PX + 12, 88, '+2', C['ink'], 'shield')
        elif pr['kind'] == 'heal':
            before = p['hp']
            p['hp'] = min(p['max'], p['hp'] + 4)
            self.pop(PX, 30, f'+{p["hp"] - before}', C['ink'], 'heart')
        elif pr['kind'] == 'poison':
            p['poison'] += pr['v']
            self.pop(PX, 30, f'+{pr["v"]}', C['accent'], 'skull')
        if self.on_arrive:
            self.on_arrive(pr)

    # ── 구슬 물리(moveBall·hitBricks 이식)
    def shoot(self, angle, kind='basic', x=None, y=FLOOR - 2):
        self.balls.append(dict(x=self.lx if x is None else x, y=y, vx=math.cos(angle) * BALL_SPEED,
                               vy=math.sin(angle) * BALL_SPEED, hits=0, kind=kind,
                               drill=3 if kind == 'drill' else 0, trail=[], impact=0.0, done=False))

    def _hit_bricks(self, b):
        for br in self.bricks:
            if br['dead']:
                continue
            x = OX + br['c'] * CW + 1
            l, r, t, bo = x - 1.5, x + CW - 2 + 1.5, br['y'] - 1.5, br['y'] + BRH + 1.5
            if b['x'] < l or b['x'] > r or b['y'] < t or b['y'] > bo:
                continue
            drilled = b['drill'] > 0
            if drilled:
                b['drill'] -= 1
                br['hp'] = 0
            else:
                br['hp'] -= 1
            br['flash'] = 0.07
            b['impact'] = 0.12
            if br['hp'] <= 0:
                br['dead'] = True
                self.on_break(br)
                self.ball_break(b, br)
            if drilled:
                return
            ox, oy = min(b['x'] - l, r - b['x']), min(b['y'] - t, bo - b['y'])
            if ox < oy:
                if b['x'] - l < r - b['x']:
                    b['x'], b['vx'] = l, -abs(b['vx'])
                else:
                    b['x'], b['vx'] = r, abs(b['vx'])
            else:
                if b['y'] - t < bo - b['y']:
                    b['y'], b['vy'] = t, -abs(b['vy'])
                else:
                    b['y'], b['vy'] = bo, abs(b['vy'])
            return

    def _move_ball(self, b, dt):
        b['trail'].append((b['x'], b['y']))
        if len(b['trail']) > 5:
            b['trail'].pop(0)
        b['impact'] = max(0, b['impact'] - dt)
        n = max(1, math.ceil(BALL_SPEED * dt / 1.5))
        for _ in range(n):
            b['x'] += b['vx'] * dt / n
            b['y'] += b['vy'] * dt / n
            if b['x'] < OX + 1.5:
                b['x'], b['vx'] = OX + 1.5, abs(b['vx'])
            elif b['x'] > RIGHT - 1.5:
                b['x'], b['vx'] = RIGHT - 1.5, -abs(b['vx'])
            if b['y'] < BT + 1.5:
                b['y'], b['vy'] = BT + 1.5, abs(b['vy'])
                if not self.m['dead'] and b['hits'] < 3:
                    b['hits'] += 1
                    v = self.p['atk'] * (2 if b['kind'] == 'heavy' else 1)
                    self.projs.append(dict(x0=b['x'], y0=BT, x1=MX, y1=62, t=0, dur=0.28, kind='dmg', v=v,
                                           venom=b['kind'] == 'venom'))
                    self.cf.append(dict(x=b['x'], t=0.25))
                    self.burst(b['x'], BT + 1, self.C['ink'], 6)
            if abs(b['vy']) < BALL_SPEED * 0.12:
                b['vy'] = (-1 if b['vy'] < 0 else 1) * BALL_SPEED * 0.12
            self._hit_bricks(b)
            if b['vy'] > 0 and b['y'] >= FLOOR - 2:
                b['done'] = True
                return
        v = math.hypot(b['vx'], b['vy']) or 1
        b['vx'], b['vy'] = b['vx'] / v * BALL_SPEED, b['vy'] / v * BALL_SPEED

    # ── 시간 진행(update 이식)
    def step(self, dt=DT):
        if self.freeze > 0:   # 히트스톱: 화면을 멈춰 타격감을 준다. 흔들림만 계속 돈다
            self.freeze -= 1
            return
        self.time += dt
        m, p = self.m, self.p
        m['flash'] = max(0, m['flash'] - dt)
        p['flash'] = max(0, p['flash'] - dt)
        m['recoil'] = max(0, m['recoil'] - dt)
        p['squash'] = max(0, p['squash'] - dt)
        self.shake = max(0, self.shake - dt * 20)
        if m['lunge'] > 0:
            m['lunge'] += dt
            if m['lunge'] > 0.4:
                m['lunge'] = 0
        if m['dead']:
            m['deadT'] += dt
        for b in self.bricks:
            b['y'] += (row_y(b['r']) - b['y']) * min(1, dt * 12)
            if b['flash'] > 0:
                b['flash'] -= dt
        self.bricks = [b for b in self.bricks if not b['dead']]
        for pr in self.projs:
            pr['t'] += dt
            if pr['t'] >= pr['dur'] and not pr.get('hit'):
                pr['hit'] = True
                self.arrive(pr)
        self.projs = [q for q in self.projs if not q.get('hit')]
        for q in self.pops:
            q['y'] -= 14 * dt
            q['t'] -= dt
        self.pops = [q for q in self.pops if q['t'] > 0]
        for q in self.parts:
            q['x'] += q['vx'] * dt
            q['y'] += q['vy'] * dt
            q['vy'] += 180 * dt
            q['t'] -= dt
        self.parts = [q for q in self.parts if q['t'] > 0]
        for f in self.cf:
            f['t'] -= dt
        self.cf = [f for f in self.cf if f['t'] > 0]
        for r in self.rings:
            r['t'] += dt
        self.rings = [r for r in self.rings if r['t'] < r['dur']]
        for b in self.balls:
            self._move_ball(b, dt)
        self.balls = [b for b in self.balls if not b['done']]

    # ── 그리기(render.js draw 이식)
    def _hp_block(self, cv, cx, hp, mx, danger, poison):
        a, C = self.a, self.C
        a.icon(cv, 'heart', cx - 36, 5, C['accent'] if danger else C['ink'])
        a.text(cv, str(hp), cx - 27, 4, C['accent'] if danger else C['ink'], 2)
        cv.rect(cx - 36, 17, 72, 4, C['line'])
        hw = round(72 * hp / mx)
        cv.rect(cx - 36, 17, hw, 4, C['accent'] if danger else C['ink'])
        if poison > 0:
            pw = round(72 * min(poison, hp) / mx)
            cv.rect(cx - 36 + hw - pw, 17, pw, 4, C['accent'])
            a.icon(cv, 'skull', cx + 12, 5, C['accent'])
            a.text(cv, str(poison), cx + 21, 4, C['accent'], 2)

    def _stat_row(self, cv, cx, atk, df):
        a, C = self.a, self.C
        a.icon(cv, 'sword', cx - 36, 94, C['ink'])
        a.text(cv, str(atk), cx - 27, 93, C['ink'], 2)
        a.icon(cv, 'shield', cx + 2, 94, C['ink'])
        a.text(cv, str(df), cx + 11, 93, C['ink'], 2)

    def _draw_brick(self, cv, b):
        a, C = self.a, self.C
        x, y, w, h = OX + b['c'] * CW + 1, round(b['y']), CW - 2, BRH
        if b['type'] in ('n', 'stone'):
            fill = C['ink'] if b['type'] == 'stone' or b['hp'] >= 3 else C['ink2'] if b['hp'] == 2 else C['ink3']
            if b['flash'] > 0:
                fill = C['line']
            cv.rect(x, y, w, h, fill)
            if b['type'] == 'stone':
                for k in range(2, w, 4):
                    cv.rect(x + k, y + 1, 1, 1, C['field'])
            cv.rect(x + 1, y + 1, w - 2, 1, C['line'])
            cv.rect(x + 1, y + h - 2, w - 2, 1, C['ink'])
            if b['hp'] > 1:
                a.text(cv, str(b['hp']), x + w / 2, y + 4, C['field'], 1, 'center')
        else:
            border = C['accent'] if b['type'] == 'poison' else C['ink']
            cv.rect(x, y, w, h, C['line'] if b['flash'] > 0 else C['panel'])
            cv.rect(x, y, w, 1, border)
            cv.rect(x, y + h - 1, w, 1, border)
            cv.rect(x, y, 1, h, border)
            cv.rect(x + w - 1, y, 1, h, border)
            ic = {'atk': 'sword', 'def': 'shield', 'heal': 'heart'}.get(b['type'], 'skull')
            a.icon(cv, ic, x + 7.5, y + 2.5, border)

    def _draw_ring(self, cv, r):
        k = r['t'] / r['dur']
        rad = 3 + (r['r1'] - 3) * (1 - (1 - k) ** 2)   # 감속하며 퍼져야 터지는 느낌이 난다
        cv.alpha = 1 - k
        pts = set()
        for i in range(max(16, int(rad * 6))):
            ang = i / max(16, int(rad * 6)) * math.pi * 2
            pts.add((round(r['x'] + math.cos(ang) * rad), round(r['y'] + math.sin(ang) * rad)))
        for x, y in pts:
            cv.rect(x, y, 1, 1, r['col'])
        cv.alpha = 1

    def draw(self):
        a, C = self.a, self.C
        cv = Canvas(W, self.view_h, C['field'])
        cv.rect(0, 0, W, min(BT, self.view_h), C['bg'])
        cv.oy = -self.top
        if self.shake > 0:
            cv.ox += round((self.rng.random() - .5) * self.shake)
            cv.oy += round((self.rng.random() - .5) * self.shake)
        p, m = self.p, self.m
        self._hp_block(cv, PX, p['hp'], p['max'], p['hp'] <= p['max'] * 0.3, p['poison'])
        self._stat_row(cv, PX, p['atk'], p['df'])
        # 맞은 기사는 한 박자 납작해진다(툴 전용 스쿼시): 아래 한 줄을 겹쳐 그려 키를 줄인 듯 보이게
        sq = 3 if p['squash'] > 0.1 else 0
        a.sprite(cv, self.a.g['spr']['knight'], PX - 18, 50 + sq, 3,
                 C['accent'] if p['flash'] > 0 else C['ink'], C['ink2'], C['bg'])
        angry = self.boss and m['phase'] == 2
        if not m['dead'] or math.floor(m['deadT'] * 10) % 2 == 0:
            self._hp_block(cv, MX, m['hp'], m['max'], False, m['poison'])
            self._stat_row(cv, MX, m['atk'], m['df'])
            lunge = -math.sin(math.pi * m['lunge'] / 0.4) * 14 if m['lunge'] > 0 else 0
            recoil = round(m['recoil'] / 0.15 * 3)
            sink = min(20, m['deadT'] * 30) if m['dead'] else 0
            cv.alpha = max(0, 1 - m['deadT']) if m['dead'] else 1
            a.sprite(cv, self.a.g['spr'][self.mon], MX - 24 + lunge + recoil, 38 + sink, 3,
                     C['ink3'] if m['flash'] > 0 else C['ink'], C['ink2'],
                     C['accent'] if (angry or self.elite) else C['bg'])
            cv.alpha = 1
        if not m['dead'] and self.intent:
            t, v = self.intent
            if t == 'atk':
                a.icon(cv, 'sword', MX - 14, 27, C['accent'])
                a.text(cv, str(v), MX - 4, 25, C['accent'], 2)
            elif t == 'guard':
                a.icon(cv, 'shield', MX - 14, 27, C['ink'])
                a.text(cv, f'+{v}', MX - 4, 25, C['ink'], 2)
            elif t == 'poison':
                a.icon(cv, 'skull', MX - 14, 27, C['accent'])
                a.text(cv, f'+{v}', MX - 4, 25, C['accent'], 2)
            elif t == 'charge':
                a.icon(cv, 'up', MX - 4, 27, C['ink'])
            elif t == 'summon':
                a.icon(cv, 'brick', MX - 4, 27, C['ink'])

        cv.rect(0, BT - 2, W, 2, C['ink'])
        for f in self.cf:
            cv.alpha = max(0, min(1, f['t'] * 4))
            cv.rect(round(f['x']) - 7, BT - 5, 14, 3, C['ink'])
        cv.alpha = 1
        for b in self.bricks:
            self._draw_brick(cv, b)
        if self.view_h + self.top > CRASH_Y:
            low = max([b['r'] for b in self.bricks] or [0])
            col = C['accent'] if low >= MAXROW - 2 and math.floor(self.time * 5) % 2 == 0 else C['ink3']
            for x in range(OX, RIGHT, 4):
                cv.rect(x, CRASH_Y, 2, 1, col)
            for x in range(OX, RIGHT, 4):
                cv.rect(x, FLOOR, 2, 1, C['line'])
        if self.aim is not None:
            dx, dy = math.cos(self.aim), math.sin(self.aim)
            x, y, ln = self.lx, FLOOR - 2, 0
            for _ in range(400):
                x += dx * 1.5
                y += dy * 1.5
                ln += 1.5
                if x < OX + 1.5 or x > RIGHT - 1.5 or y < BT + 1.5 or self._brick_at(x, y):
                    break
            d = 10
            while d < ln:
                cv.rect(round(self.lx + dx * d), round(FLOOR - 2 + dy * d), 1, 1, C['ink2'])
                d += 6
            cv.rect(round(x) - 1, round(y) - 1, 3, 1, C['ink2'])
            cv.rect(round(x) - 1, round(y) + 1, 3, 1, C['ink2'])
        if self.launcher:
            cv.rect(self.lx - 7, FLOOR - 1, 14, 2, C['ink2'])
            a.orb(cv, self.launcher, self.lx, FLOOR - 7, 9)
        for b in self.balls:
            tr = b['trail']
            for i, (tx, ty) in enumerate(tr):
                cv.alpha = (i + 1) / len(tr) * .3
                cv.rect(round(tx) - 1, round(ty) - 1, 2, 2, C['accent'] if b['kind'] == 'venom' else C['ink2'])
            cv.alpha = 1
            a.orb(cv, b['kind'], b['x'], b['y'], 7 if b['kind'] == 'heavy' else 5)
            if b['impact'] > 0:
                cv.alpha = b['impact'] / .12
                cv.rect(b['x'] - 6, b['y'], 3, 1, C['panel'])
                cv.rect(b['x'] + 4, b['y'], 3, 1, C['panel'])
                cv.rect(b['x'], b['y'] - 6, 1, 3, C['panel'])
                cv.alpha = 1
        for pr in self.projs:
            k = max(0, min(1, pr['t'] / pr['dur']))
            x = pr['x0'] + (pr['x1'] - pr['x0']) * k * k
            y = pr['y0'] + (pr['y1'] - pr['y0']) * k - math.sin(math.pi * k) * 18
            if pr['kind'] == 'dmg':
                cv.rect(round(x) - 1, round(y) - 1, 3, 3, C['accent'] if pr.get('venom') else C['ink'])
            elif pr['kind'] == 'poison':
                a.icon(cv, 'skull', x - 3, y - 3, C['accent'])
            else:
                a.icon(cv, {'atk': 'sword', 'def': 'shield'}.get(pr['kind'], 'heart'), x - 3, y - 3, C['ink'])
        for r in self.rings:
            self._draw_ring(cv, r)
        for q in self.parts:
            cv.alpha = max(0, min(1, q['t'] * 2.5))
            cv.rect(round(q['x']), round(q['y']), 2, 2, q['col'])
        for q in self.pops:
            cv.alpha = max(0, min(1, q['t'] * 1.8))
            tw = (len(q['txt']) * 4 - 1) * 2 if q['txt'] else 0
            iw = 9 if q['icon'] else 0
            x0 = q['x'] - (tw + iw) / 2
            if q['icon']:
                a.icon(cv, q['icon'], x0, q['y'] + 1, q['col'])
            if q['txt']:
                a.text(cv, q['txt'], x0 + iw, q['y'], q['col'], 2)
        cv.alpha = 1
        return cv

    def _brick_at(self, x, y):
        for b in self.bricks:
            bx = OX + b['c'] * CW + 1
            if bx - 1.5 <= x <= bx + CW - 2 + 1.5 and b['y'] - 1.5 <= y <= b['y'] + BRH + 1.5:
                return True
        return False


# ═════════════════════════════════════════════ 5. 내보내기
class Out:
    def __init__(self, base, theme):
        self.dir = base / theme
        self.made = []

    def png(self, rel, img):
        path = self.dir / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path, optimize=True)
        self.made.append(rel)

    def gif(self, rel, frames, scale):
        """GIF는 알파가 없으므로 배경을 채운 프레임을 쓴다.
        팔레트를 프레임마다 따로 만들면 뷰어마다 합성이 어긋나 화면이 튄다. 전 프레임 공통 팔레트 하나로 고정한다."""
        path = self.dir / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        rgb = [f.img.convert('RGB') for f in frames]
        atlas = Image.new('RGB', (rgb[0].width, rgb[0].height * len(rgb)))
        for i, f in enumerate(rgb):
            atlas.paste(f, (0, i * f.height))
        pal = atlas.quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        seq = [f.quantize(palette=pal, dither=Image.Dither.NONE).resize((f.width * scale, f.height * scale), Image.NEAREST)
               for f in rgb]
        seq[0].save(path, save_all=True, append_images=seq[1:], duration=round(1000 / FPS),
                    loop=0, disposal=1, optimize=False)
        self.made.append(rel)


def record(scene, seconds, script=None, slow=1.0):
    """script(i, scene)는 매 프레임 직전에 불려 장면에 사건을 일으킨다.
    slow<1이면 슬로모션: 게임 속도(300px/s)로는 25fps 한 프레임에 12px씩 건너뛰어 순간이 안 보인다."""
    frames = []
    for i in range(round(seconds * FPS)):
        if script:
            script(i, scene)
        frames.append(scene.draw())
        scene.step(DT * slow)
    return frames


def _shoot_to(scene, tx, ty, kind='basic', x=None):
    sx = scene.lx if x is None else x
    scene.shoot(math.atan2(ty - (FLOOR - 2), tx - sx), kind, x=sx)


# ── 정지 이미지
def export_static(art, out, scale):
    g, C = art.g, art.C
    eye_bg = C['bg']
    for name, mp in g['spr'].items():
        h, w = len(mp), len(mp[0])
        variants = {'': (C['ink'], eye_bg), '_elite': (C['ink'], C['accent']), '_hit': (C['ink3'], eye_bg)}
        if name == 'knight':
            variants = {'': (C['ink'], eye_bg), '_hurt': (C['accent'], eye_bg)}
        for suf, (main, eye) in variants.items():
            cv = Canvas(w, h)
            art.sprite(cv, mp, 0, 0, 1, main, C['ink2'], eye)
            out.png(f'sprites/{name}{suf}.png', cv.img)
            out.png(f'sprites/{name}{suf}@{scale * 2}x.png', cv.scaled(scale * 2))
    for name in g['icon']:
        cv = Canvas(7, 7)
        art.icon(cv, name, 0, 0, C['accent'] if name == 'skull' else C['ink'])
        out.png(f'icons/{name}.png', cv.img)
        out.png(f'icons/{name}@{scale * 2}x.png', cv.scaled(scale * 2))
    for kind in [k for k in g['orb'] if k != '_base']:
        cv = Canvas(18, 18)
        art.orb(cv, kind, 9, 9, 12)
        out.png(f'orbs/{kind}.png', cv.img)
        out.png(f'orbs/{kind}@{scale * 2}x.png', cv.scaled(scale * 2))
    chars = ''.join(g['font'])
    cv = Canvas(len(chars) * 4 + 1, 7)
    art.text(cv, chars, 1, 1, C['ink'])
    out.png('font.png', cv.scaled(scale * 2))
    lg = art.logo()
    out.png('logo.png', lg.img)
    out.png(f'logo@{scale * 2}x.png', lg.scaled(scale * 2))
    out.png('contact_sheet.png', contact_sheet(art, scale))


def contact_sheet(art, scale):
    """모든 정적 에셋을 한 장에 모은 목록. 라벨은 영문 id(툴 출력이라 한글 폰트 의존을 피한다)."""
    g, C = art.g, art.C
    s = scale
    try:
        font = ImageFont.load_default(size=12)
    except TypeError:
        font = ImageFont.load_default()
    pad, cell = 16, 22 * s
    groups = [
        ('SPRITES', [(n, mp, 'spr') for n, mp in g['spr'].items()]),
        ('ICONS', [(n, None, 'icon') for n in g['icon']]),
        ('ORBS', [(k, None, 'orb') for k in g['orb'] if k != '_base']),
    ]
    cols = 8
    rows = sum(math.ceil(len(items) / cols) for _, items in groups)
    sheet_w = pad * 2 + cols * cell
    lg_h = art.g['logo_wh'][1] * s * 2
    sheet_h = pad * 3 + len(groups) * 34 + rows * (cell + 18) + lg_h
    img = Image.new('RGBA', (sheet_w, sheet_h), (*hex_rgb(C['bg']), 255))
    dr = ImageDraw.Draw(img)
    y = pad
    for title, items in groups:
        dr.text((pad, y), title, fill=hex_rgb(C['ink2']), font=font)
        y += 26
        for i, (name, mp, kind) in enumerate(items):
            cx, cy = pad + (i % cols) * cell, y + (i // cols) * (cell + 18)
            if kind == 'spr':
                cv = Canvas(16, 16)
                art.sprite(cv, mp, (16 - len(mp[0])) // 2, (16 - len(mp)) // 2, 1, C['ink'], C['ink2'], C['bg'])
                tile = cv.scaled(s)
            elif kind == 'icon':
                cv = Canvas(9, 9)
                art.icon(cv, name, 1, 1, C['accent'] if name == 'skull' else C['ink'])
                tile = cv.scaled(s * 2)
            else:
                cv = Canvas(18, 18)
                art.orb(cv, name, 9, 9, 12)
                tile = cv.scaled(s)
            img.alpha_composite(tile, (cx + (cell - tile.width) // 2, cy + (cell - tile.height) // 2))
            dr.text((cx + 4, cy + cell), name, fill=hex_rgb(C['ink3']), font=font)
        y += math.ceil(len(items) / cols) * (cell + 18) + 8
    lg = art.logo().scaled(s * 2)
    img.alpha_composite(lg, (pad, y))
    return img.crop((0, 0, sheet_w, y + lg.height + pad))


# ── 애니메이션
def fx_idle(art, out, scale):
    """대기 동작(툴 전용 제안): 1px 숨쉬기 + 가끔 눈 깜빡임. 정예는 눈이 붉다."""
    C, g = art.C, art.g
    for name, mp in g['spr'].items():
        for elite in ([False, True] if name != 'knight' else [False]):
            frames = []
            for i in range(40):
                cv = Canvas(20, 20, C['bg'])
                bob = 1 if math.sin(i / 40 * math.pi * 2) > 0.3 else 0
                blink = i in (30, 31, 32)
                eye = C['ink'] if blink else (C['accent'] if elite else C['bg'])
                cv.rect(4, 18, 12, 1, C['line'])   # 그림자: 떠 있는 느낌 대신 바닥을 잡아 준다
                art.sprite(cv, mp, (20 - len(mp[0])) // 2, 2 + bob + (16 - len(mp)), 1, C['ink'], C['ink2'], eye)
                frames.append(cv)
            out.gif(f'fx/idle_{name}{"_elite" if elite else ""}.gif', frames, scale * 2)


def fx_attack(art, out, scale, mon):
    """몬스터 공격: 예고 → 돌진(lunge) → 기사 피격(붉은 번쩍·흔들림·히트스톱·숫자)."""
    sc = Scene(art, mon, seed=3, view_h=BT)
    sc.intent = ('atk', 2)

    def script(i, s):
        if i == 12:
            s.m['lunge'] = 0.001
        if i == 17:
            s.hurt_player(2, 'sword')
        if i == 50:
            s.intent = None
    out.gif(f'fx/attack_{mon}.gif', record(sc, 2.4, script), scale)


def fx_hit(art, out, scale, mon, kind='basic'):
    """천장 타격: 구슬이 천장을 치면 피해 탄이 포물선으로 날아가 몬스터가 번쩍이고 밀린다."""
    sc = Scene(art, mon, seed=5, view_h=150)
    sc.m['hp'] = sc.m['max'] = 9

    def script(i, s):
        if i in (2, 20):
            s.shoot(-math.pi / 2 + (0.35 if i == 2 else -0.3), kind, x=W / 2, y=148)
    out.gif(f'fx/hit_{mon}{"" if kind == "basic" else "_" + kind}.gif', record(sc, 2.6, script, slow=0.6), scale)


def fx_death(art, out, scale, mon):
    """결정타: 히트스톱 → 큰 파편·충격파 → 깜빡이며 가라앉고 사라진다."""
    sc = Scene(art, mon, seed=7, view_h=150)
    sc.m['hp'] = 1
    sc.m['df'] = 0

    def script(i, s):
        if i == 2:
            s.shoot(-math.pi / 2 + 0.25, 'heavy', x=W / 2, y=148)
    out.gif(f'fx/death_{mon}.gif', record(sc, 2.8, script, slow=0.7), scale)


def fx_rage(art, out, scale):
    """보스 2페이즈: 눈이 붉게 바뀌고 크게 흔들리며 붉은 충격파가 두 번 퍼진다."""
    sc = Scene(art, 'boss', seed=9, view_h=BT)
    sc.m['hp'] = 5

    def script(i, s):
        if i == 10:
            s.m['phase'] = 2
            s.m['atk'] += 1
            s.m['df'] += 2
            s.shake = 8
            s.freeze = 3
            s.ring(MX, 55, art.C['accent'], 34, 0.5)
            s.burst(MX, 55, art.C['accent'], 14)
        if i == 22:
            s.ring(MX, 55, art.C['accent'], 44, 0.6)
        if i == 30:
            s.intent = ('atk', 5)
    out.gif('fx/boss_rage.gif', record(sc, 2.4, script), scale)


def fx_bricks(art, out, scale):
    """벽돌 종류별 파괴: 성벽은 파편만, 강화 벽돌은 아이콘이 기사에게 날아가 능력치가 오른다."""
    sc = Scene(art, 'slime', seed=11, view_h=190)
    types = [('n', 1), ('n', 2), ('stone', 3), ('atk', 1), ('def', 1), ('heal', 1), ('poison', 1)]
    sc.p['hp'] = 14
    for c, (t, hp) in enumerate(types):
        sc.brick(4, c, t, hp)

    def script(i, s):
        for c, (_, hp) in enumerate(types):
            for k in range(hp):
                if i == 4 + c * 9 + k * 6:
                    x = OX + c * CW + CW / 2
                    s.shoot(-math.pi / 2, 'basic', x=x, y=189)
        # 위로 튕긴 구슬은 화면을 보기 좋게 비우려고 천장 근처에서 거둔다
        for bl in s.balls:
            if bl['vy'] > 0 and bl['y'] > 186:
                bl['done'] = True
    out.gif('fx/bricks.gif', record(sc, 4.4, script, slow=0.8), scale)


def fx_bomb(art, out, scale):
    """폭탄 구슬: 처음 부순 벽돌의 주변 8칸이 함께 터진다. 충격파·히트스톱으로 한 방을 강조."""
    sc = Scene(art, 'golem', seed=13, view_h=240)
    for r in range(2, 6):
        for c in range(1, 6):
            sc.brick(r, c, 'n', 2 if (r + c) % 3 == 0 else 1)
    sc.brick(3, 3, 'atk')
    sc.bricks = [b for b in sc.bricks if not (b['r'] == 3 and b['c'] == 3 and b['type'] == 'n')]
    sc.lx = OX + 3 * CW + CW / 2

    def script(i, s):
        if i == 6:
            s.shoot(-math.pi / 2 + 0.12, 'bomb', x=s.lx - 8, y=238)
    out.gif('fx/bomb.gif', record(sc, 3.2, script, slow=0.45), scale)


def fx_orbs(art, out, scale):
    """구슬별 대기 연출(툴 전용 제안): 종류의 성격을 움직임으로 보여 준다."""
    C = art.C
    for kind in [k for k in art.g['orb'] if k != '_base']:
        rng = random.Random(kind)
        parts = []
        frames = []
        for i in range(40):
            t = i / 40
            cv = Canvas(32, 32, C['field'])
            bob = round(math.sin(t * math.pi * 2) * 1.5)
            cx, cy = 16, 15 + bob
            cv.rect(11, 27, 10, 1, C['line'])
            if kind == 'bomb':       # 심지 불꽃이 튄다(붉은색 = 위험)
                if i % 3 == 0:
                    parts.append([cx + 4, cy - 9, rng.uniform(-14, 14), rng.uniform(-30, -10), 0.4])
            elif kind == 'venom':    # 독이 방울져 떨어진다
                if i % 10 == 0:
                    parts.append([cx + rng.uniform(-3, 3), cy + 5, 0, 10, 0.9])
            elif kind == 'drill':    # 위로 뚫고 나가는 속도선
                for k in range(3):
                    yy = (cy + 14 - ((i * 2 + k * 9) % 22))
                    cv.rect(cx - 5 + k * 5, yy, 1, 3, C['ink3'])
            elif kind == 'split':    # 세 갈래 잔상이 벌어졌다 모인다
                off = round(abs(math.sin(t * math.pi * 2)) * 6)
                cv.alpha = 0.35
                art.orb(cv, 'basic', cx - off, cy, 12)
                art.orb(cv, 'basic', cx + off, cy, 12)
                cv.alpha = 1
            elif kind == 'heavy':    # 묵직하게 내려앉아 먼지가 인다
                bob = 0 if i % 20 > 3 else 2
                cy = 15 + bob
                if i % 20 == 0:
                    for d in (-1, 1):
                        parts.append([cx + d * 5, 26, d * 18, -8, 0.4])
            elif kind == 'guard':    # 방패 펄스
                if i % 20 < 6:
                    r = 8 + i % 20
                    cv.alpha = 1 - (i % 20) / 6
                    for k in range(24):
                        a = k / 24 * math.pi * 2
                        cv.rect(round(cx + math.cos(a) * r), round(cy + math.sin(a) * r), 1, 1, C['ink3'])
                    cv.alpha = 1
            art.orb(cv, kind, cx, cy, 12)
            if kind == 'basic':      # 반짝임이 표면을 지나간다
                sx = round(-8 + (i % 40) * 0.8)
                if -6 < sx < 6:
                    cv.rect(cx + sx, cy - 3, 1, 4, C['panel'])
            for p in parts:
                p[0] += p[2] * DT
                p[1] += p[3] * DT
                p[3] += 60 * DT
                p[4] -= DT
                cv.alpha = max(0, min(1, p[4] * 3))
                col = C['accent'] if kind in ('bomb', 'venom') else C['ink3']
                cv.rect(round(p[0]), round(p[1]), 1, 1, col)
            cv.alpha = 1
            parts = [p for p in parts if p[4] > 0]
            frames.append(cv)
        out.gif(f'fx/orb_{kind}.gif', frames, scale * 2)


def best_angle(scene, kind):
    """조준 봇처럼 각도 후보를 미리 굴려 보고 천장을 가장 많이 치는 각도를 고른다.
    아무 각도로나 쏘면 성벽에 막혀 연출이 밋밋해진다."""
    best, best_score = -math.pi / 2, -1
    lo, hi = -math.pi + 0.22, -0.22
    for k in range(48):
        a = lo + (hi - lo) * (k + .5) / 48
        sim = copy.deepcopy(scene, memo={id(scene.a): scene.a})
        sim.aim = None
        angles = [a - .16, a, a + .16] if kind == 'split' else [a]
        for x in angles:
            sim.shoot(max(lo, min(hi, x)), kind)
        hits = 0
        for _ in range(FPS * 6):
            hits += sum(1 for q in sim.projs if q['kind'] == 'dmg' and q['t'] == 0)
            sim.step()
            if not sim.balls:
                break
        score = hits * 10 + len(scene.bricks) - len(sim.bricks)
        if score > best_score:
            best, best_score = a, score
    return best


def fx_battle(art, out, scale):
    """전투 한 장면 재현: 조준선 → 송곳·폭탄·분열 구슬 → 몬스터 반격 → 성벽 하강 → 결정타."""
    sc = Scene(art, 'shroom', seed=21)
    sc.m['hp'] = sc.m['max'] = 16
    rng = random.Random(4)
    for r in range(5, -1, -1):
        for c in range(COLS):
            if rng.random() < 0.55:
                t = rng.choice(['n'] * 10 + ['atk', 'def', 'heal', 'poison'])
                sc.brick(r, c, t, 2 if t == 'n' and rng.random() < .3 else 1)
    plan = ['drill', 'bomb', 'split', 'heavy', 'venom', 'basic']
    st = dict(shot=0, phase='aim', t=0, aim=-2.4, dir=1, target=None)

    def script(i, s):
        st['t'] += DT
        if st['phase'] == 'aim':
            kind = plan[st['shot'] % len(plan)]
            if st['target'] is None:
                st['target'] = best_angle(s, kind)
            target = st['target']
            s.launcher = kind
            s.intent = ('atk', 2) if st['shot'] % 2 == 0 else ('poison', 2)
            # 조준선이 왕복하다가 목표 각도에서 발사한다(실제 플레이 흐름)
            st['aim'] += st['dir'] * 1.7 * DT
            if st['aim'] > -0.22 or st['aim'] < -math.pi + 0.22:
                st['dir'] *= -1
            s.aim = st['aim']
            if st['t'] > 0.7 and abs(st['aim'] - target) < 0.08:
                angles = [target - .16, target, target + .16] if kind == 'split' else [target]
                st.update(phase='fire', t=0, q=angles, kind=kind, target=None)
                s.aim = None
        elif st['phase'] == 'fire':
            if st['q']:   # 분열 구슬은 프레임마다 한 발씩(게임은 0.07초 간격)
                s.shoot(st['q'].pop(0), st['kind'])
                if not st['q']:
                    s.launcher = None
            if not st['q'] and not s.balls and not s.projs:
                if s.m['dead']:
                    st['phase'] = 'end'
                else:
                    st.update(phase='enemy', t=0, step=0)
                    s.lx = st.get('lastx', s.lx)
        elif st['phase'] == 'enemy':
            if st['step'] == 0:
                st['step'] = 1
                s.m['lunge'] = 0.001
            if st['step'] == 1 and st['t'] >= 0.2:
                st['step'] = 2
                if s.intent[0] == 'atk':
                    s.hurt_player(2, None)
                else:
                    s.p['poison'] += 2
                    s.burst(PX, 66, art.C['accent'], 8)
                    s.pop(PX, 30, '+2', art.C['accent'], 'skull')
            if st['step'] == 2 and st['t'] >= 0.6:
                st['step'] = 3
                for b in s.bricks:
                    b['r'] += 1
                for c in range(COLS):
                    if rng.random() < 0.3:
                        s.brick(0, c, 'n', 1, instant=False)
            if st['step'] == 3 and st['t'] >= 0.95:
                if s.p['poison'] > 0:
                    d = s.p['poison']
                    s.p['hp'] -= d
                    s.p['poison'] -= 1
                    s.p['flash'] = 0.18
                    s.burst(PX, 66, art.C['accent'], 8)
                    s.pop(PX, 30, f'-{d}', art.C['accent'], 'skull')
                st['shot'] += 1
                st.update(phase='aim', t=0)
        # 구슬이 바닥에 돌아온 자리에서 다음 발사: 게임의 nextLx 규칙
        for b in s.balls:
            if b['vy'] > 0 and b['y'] >= FLOOR - 3:
                st['lastx'] = max(OX + 4, min(RIGHT - 4, b['x']))

    frames = []
    for i in range(FPS * 22):
        script(i, sc)
        frames.append(sc.draw())
        sc.step()
        if st['phase'] == 'end' and sc.m['deadT'] > 1.2:
            break
    out.gif('fx/battle.gif', frames, max(1, scale - 1))


def write_index(base, themes, made):
    """GitHub에서 바로 훑어볼 수 있게 생성물 목록을 마크다운으로 남긴다."""
    lines = ['# 브릭 크롤 에셋 미리보기', '',
             '> `tools/export_assets.py`가 게임 코드(`js/sprites.js`, `css/style.css`)를 읽어 생성한 파일이다.',
             '> 직접 고치지 말고 게임 코드를 고친 뒤 툴을 다시 돌린다.', '']
    for theme in themes:
        files = made[theme]
        lines += [f'## {theme}', '', f'![contact sheet]({theme}/contact_sheet.png)', '']
        fx = sorted(f for f in files if f.startswith('fx/'))
        if fx:
            lines += ['### 연출(GIF)', '', '| 파일 | 미리보기 |', '|---|---|']
            lines += [f'| `{f}` | <img src="{theme}/{f}" height="160"> |' for f in fx]
            lines.append('')
    (base / 'README.md').write_text('\n'.join(lines), encoding='utf-8')


def main():
    ap = argparse.ArgumentParser(description='브릭 크롤 도트 에셋을 PNG·GIF로 내보낸다')
    ap.add_argument('--out', default=str(ROOT / 'docs/assets'), help='출력 폴더 (기본 docs/assets)')
    ap.add_argument('--theme', choices=['light', 'dark', 'both'], default='light')
    ap.add_argument('--scale', type=int, default=3, help='게임 픽셀 1칸을 몇 px로 키울지 (기본 3)')
    ap.add_argument('--only', default='static,idle,orbs,fx,battle',
                    help='static,idle,orbs,fx,battle 중 쉼표로')
    args = ap.parse_args()
    if args.scale < 1:
        ap.error('--scale은 1 이상')
    game = load_game()
    want = set(args.only.split(','))
    themes = ['light', 'dark'] if args.theme == 'both' else [args.theme]
    base = Path(args.out)
    made = {}
    for theme in themes:
        art, out = Art(game, theme), Out(base, theme)
        s = args.scale
        if 'static' in want:
            export_static(art, out, s)
        if 'idle' in want:
            fx_idle(art, out, s)
        if 'orbs' in want:
            fx_orbs(art, out, s)
        if 'fx' in want:
            for mon in MON_STAT:
                fx_attack(art, out, s, mon)
                fx_hit(art, out, s, mon)
                fx_death(art, out, s, mon)
            fx_hit(art, out, s, 'golem', 'venom')
            fx_rage(art, out, s)
            fx_bricks(art, out, s)
            fx_bomb(art, out, s)
        if 'battle' in want:
            fx_battle(art, out, s)
        made[theme] = out.made
        print(f'[{theme}] {len(out.made)}개 → {out.dir}')
    write_index(base, themes, made)


if __name__ == '__main__':
    main()
