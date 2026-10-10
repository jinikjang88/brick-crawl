// 회귀 검사: 검토 문서(docs/tasks/04-project-review.md)에서 재현한 버그가 다시 생기지 않는지 본다
// 실행: node tools/regress.mjs (실패가 있으면 종료 코드 1)
// 시뮬레이터와 같은 방식(index.html의 script 순서대로 이어 붙여 가짜 DOM에서 eval)으로 실제 게임 코드를 돌린다
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(x => x[1]);
const EXPOSE = 'globalThis.__t={get G(){return G},get RUN(){return RUN},get mode(){return mode},get PROFILE(){return PROFILE},'
  + 'META:()=>META,hurtPlayer,enemyUpdate,battleEnd,newBattle,WALL,reachable,enterNode,saveRun,recordRun,flushRecords,trimQueue,genMap,rollOrbs,rollRelics,burst,spawnRow,showShop,resetAim,showUpgrade,catchChoice:()=>{ const got = []; showChoice = o => got.push(o); return got; }};';
const code = '(() => {' + srcs.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n') + '\n' + EXPOSE + '})();';

function mk(){
  return { children:[], classList:{ add(){}, remove(){}, toggle(){} }, style:{ setProperty(){} }, dataset:{}, setAttribute(){}, focus(){},
    addEventListener(){}, append(){}, querySelector(){ return null; },
    getContext(){ return new Proxy({}, { get:() => () => {}, set:() => true }); },
    getBoundingClientRect(){ return { left:0, top:0, width:180, height:340 }; } };
}
// 저장소 내용(store)을 정해 게임을 새로 띄운다. broken = localStorage 접근이 모두 예외를 던지는 환경
// net = 기록 서버 흉내(path, body) → { status, data } | null(통신 실패). 없으면 시뮬레이터처럼 통신이 꺼진다
let els;
function boot(store = {}, broken = false, net = null, mathSeed = 20261010){
  if (net){
    globalThis.location = { protocol:'http:', origin:'http://test' };
    globalThis.fetch = async (url, o) => {
      const r = net(url.split('/api/')[1], JSON.parse(o.body));
      if (!r) throw new Error('오프라인');
      return { ok:r.status < 300, status:r.status, json:async () => r.data || {} };
    };
  } else { delete globalThis.location; delete globalThis.fetch; }
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
  let seed = mathSeed; Math.random = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
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
const RUN_KEY = 'brickquest:run:v3', META_KEY = 'brickquest:meta:v3', PROF_KEY = 'brickquest:profile:v1';
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

// ── R05: 미전송 기록은 일시 실패에 남고, 성공하면 한 번만 빠진다
const PROF = (queue, registered = true) => ({ [PROF_KEY]:JSON.stringify({ id:'00000000-0000-4000-8000-000000000000', name:'가나다 라마바 사아자', registered, queue }) });
const Q = (n, at = 0) => ({ rid:'r' + n, progress:n, at });
async function flushWith(queue, reply, registered = true){
  const sent = [];
  const t = boot(PROF(queue, registered), false, (path, body) => { sent.push(path + ':' + (body.rid || '')); return reply(path, body, sent); });
  await t.flushRecords(); await t.flushRecords();
  return { t, sent, left:t.PROFILE.queue.map(q => q.rid).join() };
}
for (const [name, st] of [['통신 실패', null], ['500', 500], ['503', 503], ['429', 429], ['408', 408]]){
  const { left } = await flushWith([Q(1), Q(2)], p => p === 'board' ? { status:200 } : st === null ? null : { status:st, data:{ error:'x' } });
  ok('R05 ' + name + ': 대기열 유지', left === 'r1,r2');
}
{ const { left, sent } = await flushWith([Q(1), Q(2)], () => ({ status:200, data:{ ok:true } }));
  ok('R05 성공: 각각 한 번만 보내고 비움', left === '' && sent.filter(s => s.startsWith('record')).length === 2); }
{ const { left } = await flushWith([Q(1), Q(2)], (p, b) => b.rid === 'r1' ? { status:400, data:{ error:'progress' } } : { status:200, data:{ ok:true } });
  ok('R05 형식 오류(400): 그 기록만 빼고 다음 기록 전송', left === ''); }
{ // 서버에서 플레이어가 사라짐 → 다시 등록하고 같은 기록을 재전송
  let known = false;
  const { left, sent } = await flushWith([Q(1)], p => {
    if (p === 'player'){ known = true; return { status:200, data:{ ok:true } }; }
    if (p === 'record') return known ? { status:200, data:{ ok:true } } : { status:404, data:{ error:'player' } };
    return { status:200 };
  });
  ok('R05 플레이어 없음(404): 재등록 후 재전송', left === '' && sent.filter(s => !s.startsWith('board')).join() === 'record:r1,player:,record:r1'); }
{ // 재등록해도 계속 404면 한 번만 시도하고 기록은 남긴다(무한 반복 금지)
  const { left, sent } = await flushWith([Q(1)], p => p === 'record' ? { status:404, data:{ error:'player' } } : { status:200, data:{ ok:true } });
  ok('R05 계속 404: 반복 없이 대기열 유지', left === 'r1' && sent.filter(s => s.startsWith('player')).length <= 2); }
{ // 50개를 넘으면 오래된 것부터 버리되 최고 기록은 남긴다
  const t = boot(); const q = [Q(40, 0)]; for (let i = 1; i <= 60; i++) q.push(Q(i % 30, i)); t.trimQueue(q);
  ok('R05 대기열 50개 제한: 가장 오래된 최고 기록 유지', q.length === 50 && q[0].rid === 'r40' && q[1].at === 12); }
{ // 서버가 없어도 원정 종료와 새 원정은 그대로
  let err = null, t; try { t = boot({ [RUN_KEY]:JSON.stringify(goodRun) }, false, () => null); click('mNew'); click('mNew'); } catch(e){ err = e; }
  ok('R05 서버 없음: 원정 덮어쓰기·새 원정' + (err ? ' (' + err.message + ')' : ''), !err && t.mode === 'map' && t.PROFILE.queue.length === 1); }

// ── R06: 게임 결과 난수는 원정 시드에서, 연출 난수는 Math.random에서
const snap = t => ({ map:JSON.stringify(t.RUN.map), bricks:JSON.stringify(t.G.bricks.map(b => [b.r, b.c, b.type, b.hp])), draw:t.G.draw.join(), aim:t.G.aim.toFixed(6) });
function seeded(mathSeed, seed = 777){
  // Math.random 시드가 달라도(=연출·닉네임·uuid 소비가 달라도) 원정 시드가 같으면 같은 결과여야 한다
  const t = boot({}, false, null, mathSeed); click('mNew');
  t.RUN.seed = seed; t.RUN.rng = { reward:12345 }; t.RUN.map = t.genMap(0, false, seed);
  const n = t.RUN.map[0].find(x => x.t === 'battle'); t.newBattle(n);
  return { t, n };
}
{ const a = seeded(1), b = seeded(99999), A = snap(a.t), B = snap(b.t);
  ok('R06 같은 시드: 지도 재현', A.map === B.map);
  ok('R06 같은 시드: 첫 전투 벽돌·덱 순서·첫 조준 재현', A.bricks === B.bricks && A.draw === B.draw && A.aim === B.aim);
  ok('R06 같은 시드: 보상 후보 재현', a.t.rollOrbs().join() === b.t.rollOrbs().join() && a.t.rollRelics(3, true).join() === b.t.rollRelics(3, true).join());
  const c = seeded(1, 778); ok('R06 다른 시드: 지도가 달라진다', snap(c.t).map !== A.map); }
{ // 파티클을 많이 뿌려도 다음 벽돌 줄이 그대로
  const a = seeded(5), b = seeded(5);
  for (let i = 0; i < 50; i++) b.t.burst(50, 50, '#000', 20);
  a.t.spawnRow(0, true); b.t.spawnRow(0, true);
  ok('R06 연출 난수와 분리: 파티클 수와 무관하게 같은 벽돌 줄', snap(a.t).bricks === snap(b.t).bricks); }
{ // 전투 칸에서 새로고침 → 같은 판
  const store = {}; const t = boot(store); click('mNew');
  const n = t.reachable().find(x => x.t === 'battle') || t.reachable()[0]; t.enterNode(n); const A = snap(t);
  const u = boot(store, false, null, 4242); click('mContinue');
  ok('R06 전투 중 새로고침: 같은 벽돌·덱 순서·첫 조준', u.G && snap(u).bricks === A.bricks && snap(u).draw === A.draw && snap(u).aim === A.aim); }
{ // 상점 진열·보상 흐름은 저장된다: 다시 열어도 같고, 저장된 흐름 상태로 이어진다
  const store = {}; const t = boot(store); click('mNew'); const before = t.RUN.rng.reward;
  t.showShop(); const shop = JSON.stringify(t.RUN.shop);
  const saved = JSON.parse(store[RUN_KEY]);
  ok('R06 보상 흐름 저장: 상점을 연 뒤 rng.reward 진행이 저장됨', saved.rng.reward !== before && JSON.stringify(saved.shop) === shop); }
{ // 강화 결과: 같은 저장에서 몇 번을 시도해도(새로고침) 같은 결과, 고른 즉시 저장
  const store = {}; const t = boot(store); click('mNew'); t.RUN.deck = ['bomb+3', 'basic', 'basic']; t.saveRun();
  const base = store[RUN_KEY], res = [];
  let savedOk = true;
  for (const ms of [1, 2, 3]){
    const st = { [RUN_KEY]:base }; const u = boot(st, false, null, ms); click('mContinue');
    const got = u.catchChoice(); u.showUpgrade(() => {}, () => {});
    got[0].cards.find(c => c.orb === 'bomb+3').onPick();
    res.push(u.RUN.deck.join());
    savedOk = savedOk && JSON.parse(st[RUN_KEY]).deck.join() === u.RUN.deck.join();
  }
  ok('R06 강화 결과 고정: 다시 시도해도 같은 결과(' + res[0] + ')', res.every(x => x === res[0]));
  ok('R06 강화 결과: 고른 즉시 저장', savedOk); }
{ // v2 원정 저장 → v3로 옮겨 이어하기
  const v2 = JSON.parse(JSON.stringify(goodRun)); v2.v = 2; delete v2.seed; delete v2.rng;
  const store = { 'brickquest:run:v2':JSON.stringify(v2) }; const t = boot(store); click('mContinue');
  const s3 = store[RUN_KEY] && JSON.parse(store[RUN_KEY]);
  ok('R06 v2 저장 이전: 이어하기, v3 키에 시드 저장, v2 키 삭제', t.mode === 'map' && s3 && s3.v === 3 && Number.isInteger(s3.seed)
    && typeof s3.rng.reward === 'number' && !('brickquest:run:v2' in store) && JSON.stringify(s3.map) === JSON.stringify(v2.map)); }

{ // v2 → v3 옮기기에서 새 키 쓰기만 실패해도 원정은 이어하고 옛 키는 남긴다
  const v2 = JSON.parse(JSON.stringify(goodRun)); v2.v = 2; delete v2.seed; delete v2.rng;
  const store = { 'brickquest:run:v2':JSON.stringify(v2) }; const t = boot(store);
  // 메인 화면이 띄워지며 이미 옮겼으니 v2 상태로 되돌리고 새 키 쓰기를 막은 뒤 이어하기
  store['brickquest:run:v2'] = JSON.stringify(v2); delete store[RUN_KEY];
  const ls = globalThis.localStorage, set = ls.setItem;
  ls.setItem = (k, v) => { if (k === RUN_KEY) throw new Error('용량 초과'); return set(k, v); };
  click('mContinue'); ls.setItem = set;
  ok('R06 v2 이전 쓰기 실패: 이어하기 유지, v2 키 보존', t.mode === 'map' && 'brickquest:run:v2' in store && !(RUN_KEY in store)); }

process.exit(fail ? 1 : 0);
