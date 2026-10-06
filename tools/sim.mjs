// 헤드리스 밸런스 시뮬레이터
// 사용법: node tools/sim.mjs [원정 횟수=60] [시드=20261006] [결과.json]
//
// index.html이 불러오는 js/*.js를 순서대로 이어 붙여 가짜 DOM 위에서 돌리고, "조준 봇"이 원정을 끝까지 플레이한다.
// 봇은 사람보다 약하다(목표 열을 단순하게 고르고, 지도·보상은 무작위). 절대값보다 "변경 전후 비교"에 쓴다.
//
// 주의: 게임 코드의 특정 줄을 문자열로 찾아 테스트 훅을 끼워 넣는다(HOOK_*).
// 그 줄이 바뀌면 이 스크립트가 "훅 삽입 실패"로 멈춘다. 그때는 훅 위치를 새 코드에 맞게 고칠 것.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(x => x[1]);
if (!srcs.length) throw new Error('index.html에서 <script src>를 찾지 못했다');

const HOOK_STATE = "let RUN = null, G = null, mode = 'main', prevMode = null;";
const HOOK_BREAK = "br.dead = true; onBreak(br); ballBreak(b, br); }";
const HOOK_CEIL = 'b.hits++;';
const HOOK_FIRE = "g.phase = 'fire'; g.fireT = 1;";
let code = srcs.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
for (const h of [HOOK_STATE, HOOK_BREAK, HOOK_CEIL, HOOK_FIRE])
  if (code.split(h).length !== 2) throw new Error('훅 삽입 실패: ' + h);
code = 'globalThis.ST=globalThis.ST||{br:0,ch:0,sh:0};' + code
  .replace(HOOK_STATE, HOOK_STATE + ' globalThis.__h={st:()=>({RUN,G,mode}),reachable:()=>reachable(),enterNode:n=>enterNode(n)};')
  .replace(HOOK_BREAK, HOOK_BREAK.replace('br.dead = true;', 'br.dead = true; ST.br++;'))
  .replace(HOOK_CEIL, 'b.hits++; ST.ch++;')
  .replace(HOOK_FIRE, 'ST.sh++; ' + HOOK_FIRE);
// 브라우저에선 파일들이 전역 스코프를 공유하지만, 여기선 원정마다 다시 eval하므로 IIFE로 감싸 재선언 오류를 막는다
code = '(() => {' + code + '\n})();';

// ── 가짜 DOM: 게임이 쓰는 최소한만 흉내 낸다
function mk(){
  const o = { children:[], classList:{ add(){}, remove(){}, toggle(){} }, style:{ setProperty(){} }, dataset:{}, disabled:false, className:'', hidden:false,
    setAttribute(){}, focus(){}, addEventListener(){}, append(...c){ this.children.push(...c.filter(x => typeof x === 'object')); },
    querySelector(){ return null; },
    getContext(){ return new Proxy({}, { get:(t, k) => k === 'globalAlpha' ? 1 : () => {}, set:() => true }); },
    getBoundingClientRect(){ return { left:0, top:0, width:180, height:340 }; } };
  let tc = ''; Object.defineProperty(o, 'textContent', { get:() => tc, set:v => { tc = v; if (v === '') o.children = []; } });
  return o;
}
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const N = +process.argv[2] || 60;
const seed = Number(process.argv[3] || 20261006) >>> 0;
const nativeRandom = Math.random;
const sessions = [], runs = [];
const session = i => sessions[i] || (sessions[i] = { entered:0, cleared:0, hp:[], turns:[] });
// 실행마다 같은 원정을 재현해 작은 수치 변경과 표본 변동을 구분한다. 게임 저장 RNG와는 별개다.
function seededRandom(value){
  return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const reach = new Array(20).fill(0), bossHp = [];
let s1clear = 0;

for (let run = 0; run < N; run++){
  Math.random = seededRandom(seed + run);
  const entered = new Set();
  const els = {}, L = {}, store = {};
  globalThis.document = { getElementById:id => els[id] || (els[id] = mk()), documentElement:{}, createElement:() => mk(),
    createElementNS:() => mk(), addEventListener(){}, hidden:false };
  globalThis.getComputedStyle = () => ({ getPropertyValue:() => '#000' });
  globalThis.matchMedia = () => ({ addEventListener(){} });
  globalThis.localStorage = { getItem:k => store[k] || null, setItem:(k, v) => store[k] = v, removeItem:k => delete store[k] };
  globalThis.addEventListener = (t, f) => L[t] = f;
  let raf; globalThis.requestAnimationFrame = f => raf = f;
  let now = 0; globalThis.performance = { now:() => now };
  globalThis.setTimeout = () => 0; globalThis.clearTimeout = () => {};
  (0, eval)(code);
  const $ = id => document.getElementById(id);
  $('mNew').onclick({ currentTarget:$('mNew') });

  let prog = 0, done = false, want = null, wait = -1, lastTurn = '';
  for (let f = 0; f < 60 * 60 * 120 && !done; f++){
    const { RUN, G, mode } = __h.st();
    if (RUN && !entered.has(RUN.s)){ entered.add(RUN.s); session(RUN.s).entered++; }
    if (mode === 'map'){ __h.enterNode(pickOne(__h.reachable())); continue; }
    if (['reward','rest','shop','remove','upgrade','gift','result'].includes(mode)){
      if (mode === 'result'){ done = true; break; }
      const cards = $('cCards').children.filter(c => !c.disabled), btns = $('cBtns').children.filter(c => !c.disabled);
      if (mode === 'shop'){ btns[btns.length - 1].onclick(); continue; }
      if (cards.length) cards[0].onclick(); else btns[btns.length - 1].onclick();
      continue;
    }
    if (mode === 'play' && G){
      if (G.phase === 'aim'){
        const key = G.turn + '_' + G.node.r + '_' + RUN.s;
        if (key !== lastTurn){
          // 턴마다 목표를 정한다: 붕괴선 근처 벽돌 우선, 없으면 가장 얇은 열의 천장
          lastTurn = key; wait = -1;
          const bs = G.bricks.filter(b => !b.dead);
          let t = bs.filter(b => b.r >= 9).sort((a, b) => b.r - a.r)[0];
          if (!t){
            const col = [0,0,0,0,0,0,0]; bs.forEach(b => col[b.c] += b.hp);
            let best = 0; col.forEach((v, i) => { if (v < col[best] || (v === col[best] && Math.random() < .5)) best = i; });
            t = { c:best, y:98 };
          }
          want = Math.max(-Math.PI + 0.22, Math.min(-0.22, Math.atan2(t.y + 6 - 328, 6 + t.c * 24 + 12 - G.lx)));
        }
        // 조준선이 목표 각도를 지날 때 0~4프레임 늦게 누른다(사람의 반응 오차 흉내)
        if (wait < 0 && G.aimT > 0.2 && Math.abs(G.aim - want) < 0.03) wait = Math.floor(Math.random() * 5);
        if (wait === 0){ L.keydown({ key:' ', preventDefault(){} }); wait = -2; } else if (wait > 0) wait--;
      }
      if (G.phase === 'win' && G.node.t === 'boss' && !G.__rec){ G.__rec = 1; bossHp.push(G.p.hp / G.p.max); const ss = session(RUN.s); ss.cleared++; ss.hp.push(G.p.hp / G.p.max); ss.turns.push(G.turn); if (RUN.s === 0) s1clear++; }
    }
    now += 16.7; raf(now);
    const st = __h.st();
    if (st.RUN && st.RUN.pos) prog = Math.max(prog, st.RUN.s * 5 + st.RUN.pos.r + 1);
  }
  reach[Math.min(prog, 19)]++;
  runs.push({ run, completed:done, progress:prog });
}

const med = a => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
console.log(`원정 ${N}회`);
console.log('발사당 벽돌 파괴', (ST.br / ST.sh).toFixed(2), '/ 발사당 천장 타격', (ST.ch / ST.sh).toFixed(2));
console.log('완료한 칸 수 분포 (5 = 1세션 보스까지 완료):', reach.map((v, i) => v ? `${i}:${v}` : '').filter(Boolean).join(' '));
console.log(`1세션 돌파 ${s1clear}/${N} (${(s1clear / N * 100).toFixed(0)}%)`);
console.log('보스 격파 순간 남은 체력 중앙값', bossHp.length ? (med(bossHp) * 100).toFixed(0) + '%' : '-',
            `/ 30% 이하로 이긴 비율 ${bossHp.filter(x => x <= .3).length}/${bossHp.length}`);

Math.random = nativeRandom;
console.log(`재현 시드 ${seed}; 시간 제한 도달 ${runs.filter(r => !r.completed).length}회`);
const report = sessions.map((s, i) => ({ session:i + 1, entered:s.entered, cleared:s.cleared,
  reachPct:100 * s.entered / N, conditionalClearPct:100 * s.cleared / s.entered,
  cumulativeClearPct:100 * s.cleared / N, medianBossHpPct:s.hp.length ? med(s.hp) * 100 : null,
  medianBossTurns:s.turns.length ? med(s.turns) : null }));
console.table(report);
if (process.argv[4]) fs.writeFileSync(process.argv[4], JSON.stringify({ count:N, seed, timedOut:runs.filter(r => !r.completed).length, sessions:report }, null, 2) + '\n');
