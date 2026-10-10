// 회귀 검사: 검토 문서(docs/tasks/04-project-review.md)에서 재현한 버그가 다시 생기지 않는지 본다
// 실행: node tools/regress.mjs (실패가 있으면 종료 코드 1)
// 시뮬레이터와 같은 방식(index.html의 script 순서대로 이어 붙여 가짜 DOM에서 eval)으로 실제 게임 코드를 돌린다
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(x => x[1]);
const EXPOSE = 'globalThis.__t={get G(){return G},get RUN(){return RUN},get mode(){return mode},get PROFILE(){return PROFILE},'
  + 'META:()=>META,hurtPlayer,enemyUpdate,battleEnd,newBattle,WALL,reachable,enterNode,saveRun};';
const code = '(() => {' + srcs.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n') + '\n' + EXPOSE + '})();';

function mk(){
  return { children:[], classList:{ add(){}, remove(){}, toggle(){} }, style:{ setProperty(){} }, dataset:{}, setAttribute(){}, focus(){},
    addEventListener(){}, append(){}, querySelector(){ return null; },
    getContext(){ return new Proxy({}, { get:() => () => {}, set:() => true }); },
    getBoundingClientRect(){ return { left:0, top:0, width:180, height:340 }; } };
}
// 저장소 내용(store)을 정해 게임을 새로 띄운다. broken = localStorage 접근이 모두 예외를 던지는 환경
let els;
function boot(store = {}, broken = false){
  els = {};
  globalThis.document = { getElementById:id => els[id] || (els[id] = mk()), documentElement:{}, createElement:mk, createElementNS:mk, addEventListener(){}, hidden:false };
  globalThis.getComputedStyle = () => ({ getPropertyValue:() => '#000' });
  globalThis.matchMedia = () => ({ addEventListener(){} });
  const no = () => { throw new Error('저장소 막힘'); };
  globalThis.localStorage = broken ? { getItem:no, setItem:no, removeItem:no }
    : { getItem:k => k in store ? store[k] : null, setItem:(k, v) => store[k] = v, removeItem:k => delete store[k] };
  globalThis.addEventListener = () => {}; globalThis.requestAnimationFrame = () => {};
  globalThis.performance = { now:() => 0 }; globalThis.setTimeout = () => 0;
  // 지도·보상이 실행마다 달라지면 검사가 들쭉날쭉해진다: 띄울 때마다 같은 시드로
  let seed = 20261010; Math.random = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  (0, eval)(code);
  return globalThis.__t;
}
const click = id => els[id].onclick({ currentTarget:els[id] });
let fail = 0;
const ok = (name, c) => { console.log((c ? '통과' : '실패') + ' ' + name); if (!c) fail++; };

// ── R01: 불굴(d4)만 피해를 줄이고, 재생(d3)은 승리 회복만 준다. 방어도 0, 체력 24, 피해 8
// 전투 검사는 지도와 무관하게 슬라임 전투 하나를 직접 연다
const BATTLE = { r:0, l:0, t:'battle', mon:'slime' };
let T = boot(), M = T.META();
click('mNew'); T.newBattle(BATTLE);
if (!T.G) throw new Error('전투 시작 실패');
function hit(tr, v = 8){ M.tree = Object.fromEntries(tr.map(k => [k, 1])); T.G.p.def = 0; T.G.p.hp = 24; T.hurtPlayer(v); return 24 - T.G.p.hp; }
ok('R01 트리 없음 피해 8', hit([]) === 8);
ok('R01 재생(d3)만 피해 8', hit(['d1', 'd2', 'd3']) === 8);
ok('R01 불굴(d4) 피해 8→6', hit(['d1', 'd2', 'd3', 'd4']) === 6);
ok('R01 불굴 올림: 피해 3→3', hit(['d1', 'd2', 'd3', 'd4'], 3) === 3);
M.tree = { d1:1, d2:1, d3:1, d4:1 }; T.G.p.def = 2; T.G.p.hp = 24; T.hurtPlayer(8);
ok('R01 불굴 감소 후 방어도 흡수(8→6, 방어 2 → 체력 -4)', 24 - T.G.p.hp === 4);
M.tree = { d1:1, d2:1, d3:1 }; T.RUN.maxHp = 40; T.RUN.relics.medkit = 0; T.G.p.hp = 20; T.battleEnd(true);
ok('R01 재생: 승리 회복 +2', T.RUN.hp === 22);
M.tree = {}; T.newBattle(BATTLE);

// ── R04: 다음 하강으로 붕괴선을 넘는 벽돌을 놓고 몬스터 턴의 하강 단계만 실행한다
function descend(rows, crusher, o = {}){
  const G = T.G; T.RUN.relics.crusher = crusher ? 1 : 0; T.RUN.relics.callus = o.callus ? 1 : 0; T.RUN.relics.brace = o.brace ? 1 : 0; G.callus = false;
  M.tree = o.d4 ? { d1:1, d2:1, d3:1, d4:1 } : {};
  G.p.hp = 24; G.p.def = 0; G.m.dead = false; G.m.boss = false;
  G.bricks = rows.map(([r, c]) => ({ r, c, y:0, hp:1, type:'n', dead:false }));
  G.turn = T.WALL.every; G.cur = { t:'wait' }; G.eStep = 2; G.timer = 1;
  T.enemyUpdate(0); return 24 - G.p.hp;
}
ok('R04 파쇄기 없음: 벽돌 1개 붕괴 피해 2', descend([[10, 3]], false) === 2);
ok('R04 파쇄기: 파쇄한 벽돌은 붕괴 피해 없음', descend([[10, 3]], true) === 0);
ok('R04 파쇄기: 2개 중 1개만 제외 → 피해 2', descend([[10, 3], [10, 4]], true) === 2);
ok('R04+불굴: 붕괴 2개(피해 4) → 3', descend([[10, 3], [10, 4]], false, { d4:1 }) === 3);
ok('R04+불굴: 파쇄 후 남은 1개(피해 2) → 2', descend([[10, 3], [10, 4]], true, { d4:1 }) === 2);
ok('R04+지지대+불굴: 파쇄 후 남은 2개(피해 2) → 2', descend([[10, 3], [10, 4], [10, 5]], true, { brace:1, d4:1 }) === 2);
ok('R04+굳은살: 파쇄로 붕괴가 없으면 굳은살을 아낀다', descend([[10, 3]], true, { callus:1 }) === 0 && T.G.callus === false);
ok('R04+굳은살: 남은 벽돌 붕괴는 굳은살이 막는다', descend([[10, 3], [10, 4]], true, { callus:1 }) === 0 && T.G.callus === true);
M.tree = {};

// ── R02: 깨진 저장으로도 메인이 뜨고, 이어하기·새 원정이 막히지 않는다
const RUN_KEY = 'brickquest:run:v2', META_KEY = 'brickquest:meta:v3', PROF_KEY = 'brickquest:profile:v1';
const goodRun = (() => { const t = boot(); click('mNew'); return JSON.parse(JSON.stringify(t.RUN)); })();
const mut = f => { const r = JSON.parse(JSON.stringify(goodRun)); f(r); return JSON.stringify(r); };
const cases = {
  '검토 문서 재현 데이터': JSON.stringify({ v:2, deck:['basic'], map:[[], [], [], [], []] }),
  '깨진 JSON': '{"v":2,',
  'null': 'null',
  '숫자': '42',
  '지도 없음': mut(r => delete r.map),
  '지도 길이 끊김': mut(r => { r.map[0][0].to = [9]; }),
  '덱 빈 배열': mut(r => r.deck = []),
  '알 수 없는 구슬만': mut(r => r.deck = ['nope', 'zzz+2']),
  '유물 null': mut(r => r.relics = null),
  '알 수 없는 유물': mut(r => r.relics = { nope:1, whetstone:'x' }),
  '체력 문자열': mut(r => { r.hp = 'a'; r.maxHp = null; }),
  '잘못된 위치·대기 칸': mut(r => { r.pos = { r:9, l:0 }; r.pending = { r:1, l:99 }; r.path = 'x'; }),
  '잘못된 보상 단계': mut(r => { r.pendingReward = {}; r.reward = { kind:'orb', stock:['nope'] }; }),
  '잘못된 상점': mut(r => r.shop = [{ k:'orb', id:'nope', price:10 }]),
  '유물 보상에 구슬 후보': mut(r => { r.pendingReward = 'boss'; r.reward = { kind:'boss', stock:['bomb'], reroll:0 }; }),
  '대기 전투 칸의 몬스터 없음': mut(r => { const n = r.map[0][0]; n.t = 'battle'; n.mon = 'nope'; r.pending = { r:0, l:n.l }; }),
};
for (const [name, data] of Object.entries(cases)){
  let t, err = null;
  try {
    t = boot({ [RUN_KEY]:data }); click('mContinue');
    t = boot({ [RUN_KEY]:data }); click('mNew'); if (t.mode === 'main') click('mNew');   // 살아남은 저장이면 덮어쓰기 확인을 한 번 더 누른다
  } catch(e){ err = e; }
  ok('R02 ' + name + ': 메인·이어하기·새 원정' + (err ? ' (' + err.message + ')' : ''), !err && t.RUN && t.RUN.deck.length > 0 && t.mode === 'map');
}
{ // 고칠 수 있는 값은 메워서 이어한다
  const t = boot({ [RUN_KEY]:mut(r => { r.deck = ['nope', 'bomb+2', 'basic']; r.relics = { nope:1, whetstone:5 }; r.hp = 'a'; r.coins = -3; r.pos = { r:9, l:0 }; }) });
  click('mContinue'); const R = t.RUN;
  ok('R02 보정: 사라진 구슬·유물 제거, 수치 기본값, 위치 초기화', t.mode === 'map' && R.deck.join() === 'bomb+2,basic'
    && JSON.stringify(R.relics) === '{"whetstone":1}' && R.hp === R.maxHp && R.coins === 0 && R.pos === null);
}
{ const t = boot({ [RUN_KEY]:mut(r => { r.pendingReward = 'elite'; }) }); click('mContinue'); ok('R02 정상 저장: 보상 이어하기', t.mode === 'reward'); }
{ const t = boot({ [RUN_KEY]:JSON.stringify(goodRun) }); click('mContinue');
  const n = t.reachable()[0]; t.RUN.pending = { r:n.r, l:n.l };
  const u = boot({ [RUN_KEY]:JSON.stringify(t.RUN) }); click('mContinue');
  ok('R02 정상 저장: 대기 칸 이어하기', ['play', 'shop', 'rest'].includes(u.mode)); }
{ // 메타는 버리지 않고 깨진 칸만 메운다
  const t = boot({ [META_KEY]:JSON.stringify({ best:7, pts:'x', runs:null, tree:null, badges:{ oneshot:1 }, seen:{ orb:null } }) }), m = t.META();
  ok('R02 메타 보정: 최고 기록·배지 유지, 깨진 칸 기본값', t.mode === 'main' && m.best === 7 && m.pts === 0 && m.runs === 0
    && m.badges.oneshot === 1 && typeof m.seen.orb === 'object'); }
{ // best 하나만 깨져도 나머지 메타를 지킨다(다음 저장 때 덮어쓰지 않게)
  const store = { [META_KEY]:JSON.stringify({ best:'x', pts:9, tree:{ a1:1 }, badges:{ rich:1 }, seen:{ orb:{ bomb:1 }, relic:{} } }) };
  const t = boot(store); click('mNew'); const m = JSON.parse(store[META_KEY]);
  ok('R02 메타 best 손상: 포인트·트리·배지 유지', t.META().best === 0 && m.pts === 9 && m.tree.a1 === 1 && m.badges.rich === 1); }
{ let err = null, t; try { t = boot({}, true); click('mNew'); } catch(e){ err = e; }
  ok('R02 localStorage 예외: 새 원정 시작' + (err ? ' (' + err.message + ')' : ''), !err && t.mode === 'map'); }
{ // 프로필 대기열이 깨져도 원정 종료 기록(덮어쓰기)이 멈추지 않는다
  let err = null, t;
  try { t = boot({ [PROF_KEY]:JSON.stringify({ id:'x', name:'y', queue:null }), [RUN_KEY]:JSON.stringify(goodRun) }); click('mNew'); click('mNew'); } catch(e){ err = e; }
  ok('R02 프로필 queue:null: 덮어쓰기 기록 후 새 원정' + (err ? ' (' + err.message + ')' : ''), !err && t.mode === 'map' && t.PROFILE.queue.length === 1); }

process.exit(fail ? 1 : 0);
