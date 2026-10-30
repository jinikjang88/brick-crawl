// 헤드리스 밸런스 시뮬레이터
// 사용법: node tools/sim.mjs [원정 횟수=60] [시드=20261006] [결과.json]
// 환경 변수: SIM_TREE=all(스킬 트리 전부 찍은 계정) · SIM_TREE=main(본편 35점으로 살 수 있는 만큼) · SIM_ABYSS=1(심연 원정)
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
const reach = new Array(40).fill(0), bossHp = [], finals = [];
let kings = 0;   // 근원(성벽의 왕) 격파 수
// SIM_BUILD: 봇이 한 가지 덱 컨셉만 모은다(조합별로 원정이 성립하는지 비교). 없으면 예전처럼 늘 첫 카드
// 해금 구슬은 컨셉에 들어가므로 이 모드에서는 모두 풀린 계정으로 돈다(보스 구슬 해금은 best 25)
const BUILDS = {
  poison:{ orbs:['venom','toxin'], relics:['sting','plague','alchemy','antidote'] },
  counter:{ orbs:['guard','mirror','thorn'], relics:['counter','thorns','armor','buckler','endure'] },
  split:{ orbs:['split','chain','bounce'], relics:['giant','combo','leech'] },
  bomb:{ orbs:['bomb','drill','wreck','hammer'], relics:['crusher','brace'] },
  debuff:{ orbs:['weaken','disarm','rust','stun','time'], relics:['hourglass','endure'] },
  heavy:{ orbs:['heavy','comet','crown'], relics:['whetstone','pact','wrath','kingsword'] },
};
const BUILD = BUILDS[process.env.SIM_BUILD] || null;
const buildShare = [];   // 원정이 끝날 때 덱에서 컨셉 구슬이 차지한 비율(컨셉이 실제로 모였는지)
if (process.env.SIM_BUILD && !BUILD) throw new Error('SIM_BUILD는 ' + Object.keys(BUILDS).join('·') + ' 중 하나');
// 컨셉 밖 유물은 누구에게나 쓸모 있는 것부터
const GOOD_RELICS = ['heart','combo','medkit','armor','endure','ring','hourglass','focus','warp','callus','brace'];
const kindOf = o => o.replace(/\+\d*$/, ''), lvOf = o => { const m = o.match(/\+(\d*)$/); return m ? (+m[1] || 1) : 0; };
const wants = o => BUILD.orbs.includes(kindOf(o));
// 컨셉 구슬을 더 받을 수 있나: 덱에 자리가 있거나, 바꿔 낼 컨셉 밖 구슬이 있어야 한다(아니면 교체 화면에서 취소 → 다시 고르기가 끝없이 돈다)
const canTake = RUN => RUN.deck.length < 5 + (RUN.relics.pouch ? 1 : 0) || RUN.deck.some(o => !wants(o));
// 컨셉 봇의 고르기: 고를 카드 번호, 또는 -1(건너뛰기·취소·나가기)
function buildPick(mode, RUN){
  const uniq = a => [...new Set(a)];
  if (mode === 'reward' && RUN.reward){
    const st = RUN.reward.stock, orb = RUN.reward.kind === 'orb' || RUN.reward.kind.endsWith('-orb');
    let i = st.findIndex(id => orb ? wants(id) && canTake(RUN) : BUILD.relics.includes(id));
    if (i >= 0) return i;
    if (orb) return RUN.deck.some(o => wants(o) && lvOf(o) < 5) ? st.length : -1;   // 컨셉 구슬 강화 카드, 없으면 건너뛰기
    i = st.findIndex(id => GOOD_RELICS.includes(id)); return i >= 0 ? i : 0;
  }
  if (mode === 'upgrade'){
    const ks = uniq(RUN.deck.filter(o => lvOf(o) < 5)), i = ks.findIndex(wants);
    return i >= 0 ? i : 0;
  }
  if (mode === 'swap'){
    const ks = uniq(RUN.deck); let i = ks.indexOf('basic'); if (i < 0) i = ks.findIndex(o => !wants(o));
    return i;
  }
  return 0;
}
let s1clear = 0;

for (let run = 0; run < N; run++){
  Math.random = seededRandom(seed + run);
  const entered = new Set();
  const els = {}, L = {}, store = {};
  // SIM_TREE: 스킬 트리를 찍은 계정으로 돌린다(심연·엔드게임 밸런스 확인용)
  // all = 전부, main = 본편 완주 포인트(35)로 찍을 법한 조합(공격 줄기·방어 줄기·핵심 하나)
  const TREE_SET = { all:['a1','a2','a3','a4','a5','a6','d1','d2','d3','d4','d5','d6','o1','o2','o3','o4','o5','o6','e1','e2','e3','e4','e5','e6'],
    main:['a1','a2','a5','a6','d1','d2','d3','d4','o1'] }[process.env.SIM_TREE];
  const abyss = !!process.env.SIM_ABYSS;
  // SIM_ASC=n: 고난 n단계가 열려 있고 골라 둔 계정(본편 완주 기록 포함)
  const ASCN = +process.env.SIM_ASC || 0;
  const unlock = BUILD ? { venom:1, counter:1, demolish:1, oneshot:1, rich:1 } : {};
  if (TREE_SET || abyss || BUILD || ASCN) store['brickquest:meta:v4'] = JSON.stringify({ best:abyss || ASCN || BUILD ? 25 : 0, abyssBest:BUILD ? 15 : 0, runs:0, clears:abyss || ASCN ? 1 : 0, pts:0, badges:unlock,
    asc:ASCN, ascPick:ASCN, story:{ intro:1, end1:1 },
    tree:Object.fromEntries((TREE_SET || []).map(k => [k, 1])) });
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
  (abyss ? $('mAbyss') : $('mNew')).onclick({ currentTarget:abyss ? $('mAbyss') : $('mNew') });

  let prog = 0, done = false, want = null, wait = -1, lastTurn = '';
  for (let f = 0; f < 60 * 60 * 120 && !done; f++){
    const { RUN, G, mode } = __h.st();
    if (RUN && !entered.has(RUN.s)){ entered.add(RUN.s); session(RUN.s).entered++; }
    if (mode === 'map'){ __h.enterNode(pickOne(__h.reachable())); continue; }
    // 이야기 장면은 건너뛴다(대사는 게임 결과와 무관)
    if (mode === 'story'){ $('tSkip').onclick(); continue; }
    if (['reward','rest','shop','remove','upgrade','swap','gift','result'].includes(mode)){
      if (mode === 'result'){ done = true; break; }
      const cards = $('cCards').children.filter(c => !c.disabled), btns = $('cBtns').children.filter(c => !c.disabled);
      // 상점: 살 수 있는 구슬을 사고 나간다. 구슬 보상이 정예·보스·상점으로 줄어 상점을 안 쓰는 봇은 실제보다 약하다
      if (mode === 'shop'){
        const all = $('cCards').children, i = (RUN.shop || []).findIndex(it => !it.sold && RUN.coins >= it.price
          && (BUILD ? (it.k === 'orb' && wants(it.id) && canTake(RUN)) || (it.k === 'relic' && BUILD.relics.includes(it.id)) : it.k === 'orb'));
        if (i >= 0 && all[i] && !all[i].disabled){ all[i].onclick(); continue; }
        btns[btns.length - 1].onclick(); continue;
      }
      if (BUILD && ['reward','upgrade','swap'].includes(mode)){
        const all = $('cCards').children, i = buildPick(mode, RUN);
        if (i >= 0 && all[i] && !all[i].disabled){ all[i].onclick(); continue; }
        btns[btns.length - 1].onclick(); continue;
      }
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
      // 고난 6에서는 군주 뒤 근원까지 잡아야 완주다
      if (G.phase === 'win' && G.node.t === 'boss' && !G.__rec && G.cfg.final && (G.cfg.king || (RUN.asc || 0) < 6)) finals.push(G.p.hp / G.p.max);
      if (G.phase === 'win' && G.node.t === 'boss' && !G.__rec && G.cfg.king) kings++;
      if (G.phase === 'win' && G.node.t === 'boss' && !G.__rec){ G.__rec = 1; bossHp.push(G.p.hp / G.p.max); const ss = session(RUN.s); ss.cleared++; ss.hp.push(G.p.hp / G.p.max); ss.turns.push(G.turn); if (RUN.s === 0) s1clear++; }
    }
    now += 16.7; raf(now);
    const st = __h.st();
    if (st.RUN && st.RUN.pos) prog = Math.max(prog, st.RUN.s * 5 + st.RUN.pos.r + 1);
  }
  reach[Math.min(prog, 39)]++;
  { const fin = __h.st().RUN; if (BUILD && fin) buildShare.push(fin.deck.filter(wants).length / fin.deck.length); }
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
console.log(`원정 완주(최종 보스 격파) ${finals.length}/${N} (${(finals.length / N * 100).toFixed(0)}%)`,
            finals.length ? `/ 격파 순간 남은 체력 중앙값 ${(med(finals) * 100).toFixed(0)}%` : '');
if (+process.env.SIM_ASC >= 6) console.log(`근원(성벽의 왕) 격파 ${kings}/${N}`);
if (BUILD) console.log(`컨셉 ${process.env.SIM_BUILD}: 끝날 때 덱의 컨셉 구슬 비율 평균 ${(buildShare.reduce((a, b) => a + b, 0) / buildShare.length * 100).toFixed(0)}%`);
console.log(`재현 시드 ${seed}; 시간 제한 도달 ${runs.filter(r => !r.completed).length}회`);
const report = sessions.map((s, i) => ({ session:i + 1, entered:s.entered, cleared:s.cleared,
  reachPct:100 * s.entered / N, conditionalClearPct:100 * s.cleared / s.entered,
  cumulativeClearPct:100 * s.cleared / N, medianBossHpPct:s.hp.length ? med(s.hp) * 100 : null,
  medianBossTurns:s.turns.length ? med(s.turns) : null }));
console.table(report);
if (process.argv[4]) fs.writeFileSync(process.argv[4], JSON.stringify({ count:N, seed, timedOut:runs.filter(r => !r.completed).length, sessions:report }, null, 2) + '\n');
