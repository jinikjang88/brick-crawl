// 상점·휴식 장면: 선택 화면 위쪽 작은 캔버스에 상인·모닥불을 움직여 보여 준다(게임 결과와 무관한 연출)
'use strict';

// 장면 캔버스는 논리 180×84. 게임 캔버스와 같은 이유로 표시 크기를 덮는 정수배로 백버퍼를 맞춘다
const SW = 180, SH = 84;
const scv = $('sceneCv'), sctx = scv.getContext('2d');
let SCENE = null, sceneT = 0, sceneRes = 0, sceneSparks = [];

function setScene(kind){
  SCENE = kind || null; sceneT = 0; sceneSparks = [];
  scv.hidden = !SCENE;
}
function fitScene(){
  const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio > 0) ? devicePixelRatio : 1;
  const n = clamp(Math.ceil((scv.clientWidth || SW) * dpr / SW - 0.05), 2, 8);
  if (n !== sceneRes){ sceneRes = n; scv.width = SW * n; scv.height = SH * n; }
}

// 랜턴·모닥불 빛: 그라디언트 대신 동심원 몇 겹을 옅게 겹쳐 도트 느낌의 계단 빛을 만든다
function glowRings(g, x, y, r, a){
  g.fillStyle = '#F6E6BC';
  for (let k = 3; k >= 1; k--){
    g.globalAlpha = a * (4 - k) / 6;
    g.beginPath(); g.arc(x, y, r * k / 3, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}

function drawScene(dt){
  if (!SCENE || scv.hidden) return;
  sceneT += dt; fitScene();
  const g = sctx, calm = artCalm && artCalm.matches;
  g.setTransform(sceneRes, 0, 0, sceneRes, 0, 0);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  // 배경: 던전 그림의 아치 부분을 잘라 쓰고, 장면 분위기에 맞게 어둡게 덮는다
  const bg = artImg('dungeon');
  if (bg){
    const sw = bg.naturalWidth, sh = sw * SH / SW;
    g.drawImage(bg, 0, bg.naturalHeight * .22, sw, sh, 0, 0, SW, SH);
  } else { g.fillStyle = '#3A322A'; g.fillRect(0, 0, SW, SH); }
  g.fillStyle = '#15110D'; g.globalAlpha = SCENE === 'rest' ? .72 : .38; g.fillRect(0, 0, SW, SH); g.globalAlpha = 1;
  if (SCENE === 'shop') drawShopScene(g, calm); else drawRestScene(g, dt, calm);
}

function drawShopScene(g, calm){
  const t = sceneT, bob = calm ? 0 : Math.sin(t * 2) * .6;
  const mer = artImg('merchant');
  const flick = calm ? .8 : .75 + Math.sin(t * 9) * .08 + Math.sin(t * 23) * .05;
  // 랜턴 빛이 상인 뒤 벽을 비춘다
  glowRings(g, 112, 40 + bob, 34, .32 * flick);
  if (mer) g.drawImage(mer, 84, 8 + bob, 56, 60);
  glowRings(g, 128.5, 46 + bob, 9, .5 * flick);
  // 카운터: 나무 상판 + 황동 테
  g.fillStyle = '#463222'; g.fillRect(0, 62, SW, 22);
  g.fillStyle = '#7C5B3E'; g.fillRect(0, 62, SW, 3);
  g.fillStyle = '#A07D45'; g.fillRect(0, 65, SW, 1);
  g.fillStyle = '#2E2116'; for (let x = 20; x < SW; x += 40) g.fillRect(x, 66, 1, 18);
  // 진열: 이번 상점의 팔지 않은 구슬, 그리고 코인 더미
  const items = (RUN && RUN.shop || []).filter(it => it.k === 'orb' && !it.sold);
  items.forEach((it, i) => {
    const x = 26 + i * 24, y = 55 + (calm ? 0 : Math.sin(t * 3 + i) * .4);
    const im = artImg('orb_' + it.id);
    if (im) g.drawImage(im, x - 7, y - 7, 14, 14); else drawOrbSprite(it.id, x, y, 12, g);
  });
  const coin = artImg('coin');
  if (coin) for (let i = 0; i < 4; i++) g.drawImage(coin, 150 + (i % 2) * 6, 56 - Math.floor(i / 2) * 3 - (i % 2), 9, 9);
}

function drawRestScene(g, dt, calm){
  const t = sceneT, fire = artImg('campfire'), knight = artImg('knight');
  const flick = calm ? .85 : .8 + Math.sin(t * 11) * .08 + Math.sin(t * 27) * .06;
  glowRings(g, 104, 58, 58, .34 * flick);
  // 바닥: 어두운 돌바닥 띠
  g.fillStyle = '#1F1813'; g.fillRect(0, 74, SW, 10);
  // 기사는 불 곁에서 쉰다(숨쉬기만, 불빛 쪽으로 조금 밝게)
  if (knight){
    const kb = calm ? 0 : Math.sin(t * 1.6) * .5;
    g.drawImage(knight, 40, 30 + kb, 42, 42 * knight.naturalHeight / knight.naturalWidth);
  }
  // 모닥불: 3프레임 띠를 초당 8장으로 돌린다
  if (fire){
    const fw = fire.naturalWidth / 3, fh = fire.naturalHeight;
    const f = calm ? 0 : Math.floor(t * 8) % 3;
    g.drawImage(fire, f * fw, 0, fw, fh, 92, 44, 36, 33);
  }
  // 불티: 위로 흔들리며 올라가다 사라진다
  if (!calm){
    if (Math.random() < dt * 9) sceneSparks.push({ x:110 + (Math.random() - .5) * 10, y:50, v:12 + Math.random() * 10, p:Math.random() * 6, t:1.4 });
    for (const s of sceneSparks){ s.y -= s.v * dt; s.t -= dt; s.x += Math.sin(t * 4 + s.p) * dt * 6; }
    sceneSparks = sceneSparks.filter(s => s.t > 0);
    for (const s of sceneSparks){ g.globalAlpha = Math.min(1, s.t); g.fillStyle = s.t > .7 ? '#FFF8E6' : '#C9A766'; g.fillRect(Math.round(s.x), Math.round(s.y), 1, 1); }
    g.globalAlpha = 1;
  }
}
