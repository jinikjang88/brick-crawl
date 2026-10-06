// 일러스트 에셋(assets/game) 불러오기와 그리기. 원본은 assets/illustrated, 변환은 tools/build_game_assets.py
'use strict';

// 이미지는 <img>로 불러온다: fetch·모듈과 달리 file://에서도 막히지 않는다.
// 로드 전·실패·Node(시뮬레이터)에서는 각 그리기 함수가 false를 돌려주고, 호출부가 기존 도트로 그린다
const ART = { img:{}, tint:{} };
const ART_CHARS = ['knight', 'slime', 'bat', 'golem', 'shroom', 'boss'];
const ART_FILES = ['dungeon', 'coin', 'spark', 'rubble', 'merchant', 'campfire', ...ART_CHARS, ...ART_CHARS.map(n => n + '_actions'),
  ...['basic', 'bomb', 'drill', 'guard', 'split', 'venom', 'heavy'].map(k => 'orb_' + k),
  ...['n', 'stone', 'atk', 'def', 'heal', 'poison'].map(k => 'brick_' + k)];
// 캐릭터 화면 상자(논리 px). 원본 크기가 제각각이라 발밑을 같은 바닥선에 맞추고 상자 안에 비율대로 넣는다.
// 위로는 의도 아이콘(y 25~35), 아래로는 공·방 숫자(y 93)를 가리지 않는 높이로 정했다
const ART_BOX = {
  knight:{ w:46, h:50 }, slime:{ w:54, h:40 }, bat:{ w:62, h:40, lift:10, bob:2, rate:4.5 },
  golem:{ w:58, h:54 }, shroom:{ w:52, h:52 }, boss:{ w:62, h:54 },
};
const ART_FOOT = 90;
// 대기 중에만 숨쉬기를 더한다. 공격·피격·사망은 별도 시트의 실제 포즈를 재생한다.
// 동작 줄이기 설정이면 끈다: 정보가 없는 장식 움직임이고, CSS 쪽 장식 애니메이션도 같은 설정에서 끈다
let artCalm = null;
try { artCalm = matchMedia('(prefers-reduced-motion: reduce)'); } catch(e){}
function artBob(name, t){
  if (artCalm && artCalm.matches) return 0;
  const box = ART_BOX[name] || {};
  return Math.sin(t * (box.rate || 2.2) + name.length) * (box.bob || .75);
}

(function loadArt(){
  if (typeof Image === 'undefined') return;
  for (const n of ART_FILES){
    const im = new Image();
    im.onerror = () => { delete ART.img[n]; };
    im.src = 'assets/game/' + n + '.png';
    ART.img[n] = im;
  }
})();

function artImg(name){
  const im = ART.img[name];
  return im && im.complete && im.naturalWidth ? im : null;
}
// 피격 번쩍임·정예 테두리용 단색 실루엣. 픽셀을 읽지 않고 합성(source-in)만 쓰므로 file://의 캔버스 오염과 무관하다.
// 다크 모드 전환으로 색이 바뀌면 키가 달라져 새로 만든다
function artTint(name, col){
  const key = name + col;
  if (ART.tint[key]) return ART.tint[key];
  const im = artImg(name); if (!im) return null;
  const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  return ART.tint[key] = c;
}

let artDarkKey = '', artDark = false;
// 일러스트는 밝은 상아색이라 다크 모드에서는 배경만 어둡게 덮는다. 테마 판정은 --bg 밝기로 한다
function isDarkTheme(){
  if (artDarkKey !== C.bg){
    artDarkKey = C.bg;
    const m = /^#?([0-9a-f]{6})$/i.exec(C.bg || '');
    const v = m ? parseInt(m[1], 16) : 0xffffff;
    artDark = (((v >> 16) & 255) * .299 + ((v >> 8) & 255) * .587 + (v & 255) * .114) < 128;
  }
  return artDark;
}

function drawBgArt(){
  const im = artImg('dungeon'); if (!im) return false;
  ctx.drawImage(im, 0, 0, W, H);
  // 벽돌판은 조준선·숫자가 올라가는 곳이라 바닥 무늬를 눌러 대비를 확보한다
  ctx.globalAlpha = isDarkTheme() ? .78 : .2; ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, BT);
  ctx.globalAlpha = isDarkTheme() ? .84 : .45; ctx.fillStyle = C.field; ctx.fillRect(0, BT, W, H - BT);
  ctx.globalAlpha = 1;
  return true;
}

// 동작 아틀라스 배치(tools/build_action_assets.py가 다시 쓴다). 칸은 넘친 팔·무기까지 품는 정사각형이고,
// 모든 프레임이 칸의 (ax, foot)을 발밑 기준점으로 공유한다. iw·ih는 대기 포즈 크기: 화면 상자에 맞출 배율을 여기서 구한다
const ART_SHEET = { cell:320, ax:160, foot:314,
  knight:{ iw:176, ih:209 }, slime:{ iw:217, ih:170 }, bat:{ iw:279, ih:258 }, golem:{ iw:238, ih:249 }, shroom:{ iw:213, ih:200 }, boss:{ iw:265, ih:262 } };
// 각 동작은 여섯 포즈. 공격의 타격 프레임을 짧게 두고 복귀에 여유를 준다.
const ART_ACTIONS = {
  attack:{ row:0, times:[.06,.06,.05,.06,.09,.10] },
  hit:{ row:1, times:[.035,.04,.055,.05,.06,.08] },
  death:{ row:2, times:[.10,.10,.12,.12,.14,.16] },
};
function artPose(actor, action){
  if (!actor || (actor.artAction === 'death' && action !== 'death')) return;
  actor.artAction = action; actor.artElapsed = 0;
}
function artAdvance(actor, dt){
  if (!actor.artAction) return;
  actor.artElapsed += dt;
  const clip = ART_ACTIONS[actor.artAction];
  if (actor.artAction !== 'death' && actor.artElapsed >= clip.times.reduce((a,b) => a+b, 0)) actor.artAction = null;
}
function artFrame(action, elapsed){
  const clip = ART_ACTIONS[action];
  if (!clip) return null;
  if (artCalm && artCalm.matches) return { row:clip.row, col:action === 'death' ? 5 : 3 };
  let col = 0;
  while (col < 5 && elapsed >= clip.times[col]) elapsed -= clip.times[col++];
  return { row:clip.row, col };
}

// cx: 가운데, 발밑은 ART_FOOT + dy. o = { flash:색, flashA, outline:색 }
function drawCharArt(name, cx, dy, o = {}){
  const box = ART_BOX[name];
  const pose = o.actor && (artFrame(o.actor.artAction, o.actor.artElapsed) || { row:0, col:5 });
  const sheet = pose && artImg(name + '_actions');
  const meta = ART_SHEET[name];
  if (sheet && box && meta){
    // 대기 포즈를 상자에 맞춘 배율을 모든 프레임에 쓴다. 팔·무기는 상자 밖으로 뻗고, 누운 포즈도 커지지 않는다
    const cell = ART_SHEET.cell, src = sheet.naturalWidth / 6;
    const k = Math.min(box.w / meta.iw, box.h / meta.ih), size = cell * k;
    // 날던 박쥐는 사망 앞 세 포즈(0.32초) 동안 바닥으로 내려온다. 한 번에 0으로 떨어지면 첫 프레임이 순간이동해 보인다
    const lift = (box.lift || 0) * (o.actor.artAction === 'death' ? Math.max(0, 1 - o.actor.artElapsed / .32) : 1);
    const x = cx - ART_SHEET.ax * k, y = ART_FOOT - lift - ART_SHEET.foot * k + (o.actor.artAction ? 0 : dy);
    const paint = (im, ox=0, oy=0) => ctx.drawImage(im, pose.col*src, pose.row*src, src, src, x+ox, y+oy, size, size);
    if (o.outline){
      const tint = artTint(name + '_actions', o.outline);
      if (tint) for (const [ox,oy] of [[-1,0],[1,0],[0,-1],[0,1]]) paint(tint, ox, oy);
    }
    paint(sheet);
    if (o.flash){
      const tint = artTint(name + '_actions', o.flash), alpha = ctx.globalAlpha;
      if (tint){ ctx.globalAlpha = alpha * (o.flashA ?? .35); paint(tint); ctx.globalAlpha = alpha; }
    }
    return true;
  }
  const im = artImg(name); if (!im || !box) return false;
  const k = Math.min(box.w / im.naturalWidth, box.h / im.naturalHeight);
  const w = im.naturalWidth * k, h = im.naturalHeight * k;
  const x = cx - w / 2, y = ART_FOOT - (box.lift || 0) - h + dy;
  const a0 = ctx.globalAlpha;
  if (o.outline){
    // 정예·분노한 보스: 붉은 윤곽(= 위험)을 실루엣을 8방향으로 살짝 밀어 그려 만든다
    const t = artTint(name, o.outline);
    if (t) for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1],[-.7,-.7],[.7,-.7],[-.7,.7],[.7,.7]]) ctx.drawImage(t, x + ox, y + oy, w, h);
  }
  ctx.drawImage(im, x, y, w, h);
  if (o.flash){
    const t = artTint(name, o.flash);
    if (t){ ctx.globalAlpha = a0 * (o.flashA ?? .65); ctx.drawImage(t, x, y, w, h); ctx.globalAlpha = a0; }
  }
  return true;
}

const BRICK_ART = { n:'brick_n', stone:'brick_stone', atk:'brick_atk', def:'brick_def', heal:'brick_heal', poison:'brick_poison' };
function drawBrickArt(b, x, y, w, h){
  const im = artImg(BRICK_ART[b.type]); if (!im) return false;
  ctx.drawImage(im, x, y, w, h);
  // 일반 벽돌의 남은 체력은 어둡기로도 겹쳐 보여 준다(숫자를 못 읽어도 단단한 벽돌이 눈에 띄게)
  if (b.type === 'n' && b.hp > 1){ ctx.globalAlpha = Math.min(.45, (b.hp - 1) * .16); ctx.fillStyle = '#1B1A18'; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1; }
  if (b.flash > 0){ ctx.globalAlpha = .7; ctx.fillStyle = '#FFFDF8'; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1; }
  if (b.hp > 1){
    // 돌 질감 위에서도 읽히도록 숫자 뒤에 어두운 판을 깐다. 일러스트 색이 고정이라 판·숫자 색도 테마와 무관하게 고정
    const s = String(b.hp), tw = s.length * 4 - 1;
    ctx.fillStyle = '#1B1A18'; ctx.fillRect(Math.round(x + w / 2 - tw / 2) - 2, y + 3, tw + 4, 7);
    drawText(s, x + w / 2, y + 4, '#F9F6EF', 1, 'center');
  }
  return true;
}

function drawSparkArt(x, y, a){
  const im = artImg('spark'); if (!im) return false;
  ctx.globalAlpha = a; ctx.drawImage(im, x - 5, y - 5, 10, 10); ctx.globalAlpha = 1;
  return true;
}

// 성벽 벽돌이 부서질 때 돌 파편 그림 하나가 튀어 오르며 돌다 사라진다(battle.js burst의 img 파티클)
function drawPartArt(q){
  const im = artImg(q.img); if (!im) return false;
  ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot || 0);
  ctx.drawImage(im, -q.size / 2, -q.size / 2, q.size, q.size);
  ctx.restore();
  return true;
}
