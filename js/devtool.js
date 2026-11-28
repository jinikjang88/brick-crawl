// 개발 도구: index.html?dev 로 열 때만 켜진다(2026-11-29 소유자 요청: 매번 처음부터 플레이하지 않고 원하는 화면·상황으로 바로 가서 시험).
// 플레이어 화면에는 아무것도 생기지 않는다. 켜지면
//  - 저장을 따로 쓴다: localStorage의 'brickquest:*' 키를 'brickquest-dev:*'로 바꿔 읽고 쓴다(실제 진행도·순위표 이름을 건드리지 않게).
//    그래서 이 파일은 저장을 읽는 파일(audio·save·profile)보다 먼저 불러온다.
//  - 기록 서버 통신을 끈다(js/net.js API_BASE): 시험 침투가 순위표에 섞이면 안 된다.
'use strict';

const DEV = (() => {
  try { return typeof location !== 'undefined' && /[?&]dev(=|&|$)/.test(location.search || ''); } catch(e){ return false; }
})();
let DEV_SPEED = 1, DEV_BEAT = false;   // 전투 배속(js/main.js frame), 음악 없이 박자 연출 흉내(js/main.js beatTick)
const DEV_PREFIX = 'brickquest-dev:';
if (DEV) try {
  const P = Storage.prototype, re = k => typeof k === 'string' && k.startsWith('brickquest:') ? DEV_PREFIX + k.slice(11) : k;
  for (const f of ['getItem', 'setItem', 'removeItem']){ const o = P[f]; P[f] = function(k, ...a){ return o.call(this, re(k), ...a); }; }
} catch(e){}

// ── 상황 만들기
// 그 층에서 새 시험 침투를 만든다(층 보스를 넘긴 만큼 최대 체력 +4씩, 실제 침투와 비슷하게)
function devRun(s, abyss){
  RUN = freshRun(abyss); applyTreeStart(RUN);
  RUN.s = s; RUN.map = genMap(s, abyss, RUN.seed);
  RUN.maxHp += s * 4; RUN.hp = RUN.maxHp;
  setRealm(abyss); saveRun();
}
// 지금 저장된 침투가 있으면 그대로, 없으면 고른 층으로 새로
function devEnsureRun(){
  const r = loadRun();
  if (r) RUN = r; else devRun(devVal('dvFloor', 0), devChk('dvAbyss'));
  setRealm(RUN.abyss);
}
const devVal = (id, d) => { const e = $(id); return e ? +e.value : d; };
const devChk = id => { const e = $(id); return !!(e && e.checked); };
const devIsElite = k => ROSTER.some(x => x.elite.includes(k));
// 고른 기체와 바로 싸운다. 보스 계열은 보스 칸, 정예는 정예, 나머지는 첫 줄 전투 칸을 빌려 쓴다(이기면 그 칸을 지난 것으로 지도에 남는다)
function devFight(mon){
  devRun(devVal('dvFloor', 0), devChk('dvAbyss'));
  const m = MON[mon], n = m.boss ? RUN.map[4][0] : RUN.map[0][0];
  if (!m.boss){ n.t = devIsElite(mon) ? 'elite' : 'battle'; }
  n.mon = mon;
  RUN.pending = { r:n.r, l:n.l }; saveRun();
  devClose(); startBattle(n);
}
function devMeta(f){ f(META); saveMeta(); if (mode === 'main') showMain(); devToast('계정 바뀜'); }
function devToast(t){ try { toast('개발 · ' + t); } catch(e){} }
const devInBattle = () => G && (mode === 'play' || mode === 'pause') && G.phase !== 'win' && G.phase !== 'lose';

// ── 패널: 처음 열 때 만든다(데이터 표는 뒤 파일에 있다)
function devBuild(){
  const p = document.createElement('div'); p.className = 'devPanel'; p.id = 'devPanel'; p.hidden = true;
  p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', '개발 도구');
  const sec = (title) => { const s = document.createElement('section'); const h = document.createElement('h3'); h.textContent = title; s.append(h); p.append(s); return s; };
  const btn = (s, label, f) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'devB'; b.textContent = label; b.onclick = () => { try { f(); } catch(e){ devToast('실패: ' + e.message); console.error(e); } }; s.append(b); return b; };
  const sel = (s, id, opts, label) => {
    const l = document.createElement('label'); l.className = 'devL'; l.textContent = label;
    const e = document.createElement('select'); e.id = id;
    for (const [v, t] of opts){ const o = document.createElement('option'); o.value = v; o.textContent = t; e.append(o); }
    l.append(e); s.append(l); return e;
  };
  const chk = (s, id, label, f) => {
    const l = document.createElement('label'); l.className = 'devL devC';
    const e = document.createElement('input'); e.type = 'checkbox'; e.id = id; if (f) e.onchange = () => f(e.checked);
    l.append(e, label); s.append(l); return e;
  };
  const head = document.createElement('div'); head.className = 'devHead';
  const ttl = document.createElement('b'); ttl.textContent = '개발 도구 · 저장 분리 · 순위표 꺼짐';
  const x = document.createElement('button'); x.type = 'button'; x.className = 'devB'; x.textContent = '닫기'; x.onclick = devClose;
  head.append(ttl, x); p.append(head);

  // 이동
  let s = sec('장소');
  sel(s, 'dvFloor', [0, 1, 2, 3, 4].map(i => [i, `${i + 1}층`]), '층');
  chk(s, 'dvAbyss', '심층부');
  btn(s, '이 층 새 지도', () => { devRun(devVal('dvFloor', 0), devChk('dvAbyss')); devClose(); showMap(); });
  btn(s, '이 층 보스 방', () => { devRun(devVal('dvFloor', 0), devChk('dvAbyss')); const n = RUN.map[4][0]; RUN.pending = { r:4, l:n.l }; saveRun(); devClose(); startBattle(n); });
  btn(s, '브로커', () => { devEnsureRun(); devClose(); showShop(); });
  btn(s, '충전소', () => { devEnsureRun(); devClose(); showRest(); });
  btn(s, '칩 보상(정예)', () => { devEnsureRun(); RUN.pendingReward = 'elite'; RUN.reward = null; saveRun(); devClose(); showReward('elite'); });
  btn(s, '칩 보상(보스)', () => { devEnsureRun(); RUN.pendingReward = 'boss'; RUN.reward = null; saveRun(); devClose(); showReward('boss'); });
  btn(s, '터미널', () => { devClose(); showMain(); });
  btn(s, '차고', () => { devClose(); showGarage(showMain, false); });
  btn(s, '모듈', () => { devClose(); treePick = null; showTree(showMain); });
  btn(s, '아카이브', () => { devClose(); showBadges(); });

  s = sec('기체와 바로 전투');
  const monSel = sel(s, 'dvMon', Object.keys(MON).map(k => [k, `${MON[k].name}${MON[k].boss ? ' (보스)' : devIsElite(k) ? ' (정예)' : ''}`]), '기체');
  btn(s, '싸우기', () => devFight(monSel.value));

  s = sec('이야기');
  const stSel = sel(s, 'dvStory', STORY_ORDER.map(k => [k, STORY[k].title]), '장면');
  btn(s, '보기', () => { devClose(); showStory(stSel.value, showMain, '터미널'); });

  s = sec('전투 중');
  btn(s, '즉시 승리', () => { if (!devInBattle()) return devToast('전투 중이 아니다'); if (mode === 'pause') closeMenu(); G.m.hp = 0; G.m.dead = true; G.phase = 'win'; G.timer = 0; devClose(); });
  btn(s, '즉시 패배', () => { if (!devInBattle()) return devToast('전투 중이 아니다'); if (mode === 'pause') closeMenu(); G.p.hp = 0; setLose(G); devClose(); });
  btn(s, '기체 체력 1', () => { if (!devInBattle()) return devToast('전투 중이 아니다'); G.m.hp = 1; devToast('기체 체력 1'); });
  btn(s, '릭 체력 가득', () => { if (G && G.p) G.p.hp = G.p.max; if (RUN){ RUN.hp = RUN.maxHp; saveRun(); } refreshHud(); devToast('체력 가득'); });
  sel(s, 'dvSpeed', [[1, '1배'], [0.25, '0.25배 (느리게 보기)'], [0.5, '0.5배'], [2, '2배'], [4, '4배'], [8, '8배']], '배속').onchange = e => { DEV_SPEED = +e.target.value; };

  s = sec('침투');
  btn(s, '크레딧 +100', () => { devEnsureRun(); RUN.coins += 100; saveRun(); refreshHud(); devToast('크레딧 +100'); });
  btn(s, '최대 체력 +10', () => { devEnsureRun(); RUN.maxHp += 10; RUN.hp += 10; saveRun(); refreshHud(); devToast('최대 체력 +10'); });
  const chipSel = sel(s, 'dvChip', Object.keys(RELICS).map(k => [k, RELICS[k].name]), '칩');
  btn(s, '칩 받기', () => { devEnsureRun(); gainRelic(chipSel.value); saveRun(); refreshHud(); devToast(RELICS[chipSel.value].name); });

  s = sec('계정');
  btn(s, '설계도 +10', () => devMeta(m => { m.pts += 10; }));
  btn(s, '릭 최고 레벨', () => devMeta(m => { m.lv = RICK_LV_MAX; m.xp = 0; }));
  btn(s, '부품 전부 +2 · 고철 +100', () => devMeta(m => { for (const k of CORES) m.g.cores[k] = (m.g.cores[k] || 0) + 2; for (const k of CIRCS) m.g.circs[k] = (m.g.circs[k] || 0) + 2; m.g.scrap += 100; }));
  btn(s, '심층부·보안 등급 전부 열기', () => devMeta(m => { m.clears = Math.max(1, m.clears); m.asc = ASC_MAX; }));
  btn(s, '아카이브 전부 해제', () => devMeta(m => {
    for (const k of Object.keys(ORBS)) m.seen.orb[k] = 1; for (const k of Object.keys(RELICS)) m.seen.relic[k] = 1;
    for (const r of RESONANCE) m.res[r.id] = 1; for (const b of BADGES) m.badges[b.id] = m.badges[b.id] || 1; for (const k of STORY_ORDER) m.story[k] = 1; }));
  btn(s, '아카이브 전부 잠금', () => devMeta(m => { m.seen = { orb:{}, relic:{} }; m.res = {}; m.badges = {}; m.story = {}; }));
  btn(s, '이야기만 전부 해제', () => devMeta(m => { for (const k of STORY_ORDER) m.story[k] = 1; }));

  s = sec('보기');
  chk(s, 'dvBeat', '음악 없이 박자 연출(122 BPM)', on => { DEV_BEAT = on; });
  btn(s, '개발 저장 전부 지우기', () => {
    try { for (let i = localStorage.length - 1; i >= 0; i--){ const k = localStorage.key(i); if (k && k.startsWith(DEV_PREFIX)) localStorage.removeItem(k); } } catch(e){}
    location.reload();
  });
  document.body.append(p);
  return p;
}
function devOpen(){ const p = $('devPanel') || devBuild(); p.hidden = false; const f = p.querySelector('button'); if (f) f.focus(); }
function devClose(){ const p = $('devPanel'); if (p) p.hidden = true; }
if (DEV){
  const b = document.createElement('button'); b.type = 'button'; b.className = 'devBtn'; b.textContent = 'DEV';
  b.setAttribute('aria-label', '개발 도구 열기 (` 키)');
  b.onclick = () => { const p = $('devPanel'); p && !p.hidden ? devClose() : devOpen(); };
  document.body.append(b);
  // ` 키로도 연다(입력칸 밖에서)
  addEventListener('keydown', e => { if (e.key === '`' && !(e.target && /INPUT|SELECT/.test(e.target.tagName))){ e.preventDefault(); const p = $('devPanel'); p && !p.hidden ? devClose() : devOpen(); } });
}
