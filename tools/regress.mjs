// 회귀 검사: 검토 문서(docs/tasks/04-project-review.md)에서 재현한 버그가 다시 생기지 않는지 본다
// 실행: node tools/regress.mjs (실패가 있으면 종료 코드 1)
// 시뮬레이터와 같은 방식(index.html의 script 순서대로 이어 붙여 가짜 DOM에서 eval)으로 실제 게임 코드를 돌린다
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(x => x[1]);
const EXPOSE = 'globalThis.__t={get G(){return G},get RUN(){return RUN},get mode(){return mode},get PROFILE(){return PROFILE},'
  + 'META:()=>META,hurtPlayer,enemyUpdate,battleEnd,newBattle,WALL,reachable,enterNode,saveRun,recordRun,flushRecords,ticketRun,deleteProfile,setLose,openMenu,loadRun,startBattle,trimQueue,genMap,rollOrbs,rollRelics,burst,spawnRow,showShop,resetAim,showUpgrade,'
  // 화면 내용(카드·버튼)을 가로채 검사한다. 원래 화면 전환도 그대로 일어나게 원본을 함께 부른다
  + 'catchChoice:()=>{ const got = [], orig = showChoice; showChoice = o => { got.push(o); orig(o); }; return got; },'
  + 'update,victory,bossDropsNow,sealedAt,NICK_A,NICK_B,NICK_C,BAD_NAME,badName,validName};';
// 프롤로그(첫 원정의 이야기)는 따로 검사한다. 다른 검사는 새 원정 → 바로 지도를 기대하므로 본 것으로 둔다
let FRESH_STORY = false;
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
  if (!FRESH_STORY) try { globalThis.__t.META().story.intro = 1; } catch(e){}
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
const RUN_KEY = 'brickquest:run:v4', META_KEY = 'brickquest:meta:v4', PROF_KEY = 'brickquest:profile:v2';
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
  // 상속 키(코드 리뷰 2026-10-26): ORBS['constructor'] 같은 조회가 참이라 검사를 통과하고 전투가 끝나지 않았다
  '상속 키 몬스터(toString)': mut(r => { const n = r.map[0][0]; n.t = 'battle'; n.mon = 'toString'; r.pending = { r:0, l:n.l }; }),
  '상속 키 구슬·유물': mut(r => { r.deck = ['constructor', 'basic']; r.relics = { toString:1 }; }),
  '모르는 배지 id': mut(r => { r.badges = ['nope', 'final']; }),
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
const PROF = (queue, registered = true) => ({ [PROF_KEY]:JSON.stringify({ id:'00000000-0000-4000-8000-000000000000', name:'가나다 라마바 사아자', registered, queue, epoch:2 }) });
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
{ let ep = []; await flushWith([Q(1)], (p, b) => { if (p === 'record') ep.push(b.epoch); return { status:200, data:{ ok:true } }; });
  ok('원정 기록에 초기화 회차(epoch 2)를 실어 보낸다', ep.length === 1 && ep[0] === 2); }
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
{ // 전체 진행도 초기화(2026-10-16): 옛 원정·메타(v2·v3)는 읽지 않고 지운다. 프로필(닉네임·id)은 남고 못 보낸 옛 기록만 비운다
  const old = { v:3, deck:['bomb+5'], map:goodRun.map, hp:24, maxHp:24 };
  const store = { 'brickquest:run:v3':JSON.stringify(old), 'brickquest:run:v2':JSON.stringify(old),
    'brickquest:meta:v3':JSON.stringify({ best:25, clears:3, pts:30, tree:{ a1:1 }, badges:{ final:2 } }), 'brickquest:meta:v2':JSON.stringify({ best:9 }),
    'brickquest:profile:v1':JSON.stringify({ id:'00000000-0000-4000-8000-000000000001', name:'바삭한 우울한 냉장고', registered:true, queue:[{ rid:'x', progress:25, at:1 }] }) };
  const t = boot(store); const M = t.META();
  ok('초기화: 옛 메타는 읽지 않음(포인트·트리·배지·완주 0, 고난 닫힘)', M.best === 0 && M.pts === 0 && !M.tree.a1 && !M.badges.final && M.clears === 0 && M.asc === 0);
  ok('초기화: 옛 원정 없음(이어하기 숨김)·옛 키 삭제', els.mContinue.hidden === true && !['brickquest:run:v3', 'brickquest:run:v2', 'brickquest:meta:v3', 'brickquest:meta:v2'].some(k => k in store));
  ok('초기화: 프로필 v1 → v2(닉네임·id·등록 유지, 옛 대기열 버림, v1 키 삭제)', t.PROFILE.name === '바삭한 우울한 냉장고' && t.PROFILE.id.endsWith('0001') && t.PROFILE.registered === true
    && t.PROFILE.queue.length === 0 && !('brickquest:profile:v1' in store) && JSON.parse(store[PROF_KEY]).name === '바삭한 우울한 냉장고');
  const u = boot(store); click('mNew'); ok('초기화 뒤 새 원정은 v4 키에 저장', JSON.parse(store[RUN_KEY]).v === 4);
  const w = boot(store); ok('초기화는 한 번만: 다음 접속 때 v4 진행도 유지', w.META().runs === 1 && els.mContinue.hidden === false);
}

// ── 작업 05: 고난 단계·근원·이야기
{ // 고난 규칙: 1 정예 분노, 2 정예 벽돌 낙하, 3 보스 회복 없음, 4 독 안개, 5 보스 천장 봉인 1칸
  const t = boot(); click('mNew'); const R = t.RUN;
  const elite = { r:1, l:0, t:'elite', mon:'bat' }, boss = { r:4, l:2, t:'boss', mon:'boss' };
  R.asc = 0; t.newBattle(elite); const calm = t.G.m.rage;
  R.asc = 1; t.newBattle(elite); ok('고난 1: 정예가 처음부터 분노', calm === false && t.G.m.rage === true);
  t.G.turn = 3; const d1 = t.bossDropsNow(); R.asc = 2; const d2 = t.bossDropsNow();
  ok('고난 2: 정예도 3턴마다 벽돌 낙하', d1 === false && d2 === true);
  // 독 안개: 독 벽돌이 없는 슬라임 줄에도 섞인다
  const countPoison = a => { R.asc = a; t.newBattle({ r:0, l:0, t:'battle', mon:'slime' }); for (let i = 0; i < 60; i++) t.spawnRow(0, true); return t.G.bricks.filter(b => b.type === 'poison').length; };
  ok('고난 4: 독 안개(슬라임 줄에 독 벽돌)', countPoison(3) === 0 && countPoison(4) > 0);
  R.asc = 4; t.newBattle(boss); const s4 = t.G.seal.length; R.asc = 5; t.newBattle(boss);
  ok('고난 5: 보스전 천장 1칸 봉인', s4 === 0 && t.G.seal.length === 1);
  // 꺼진 모닥불: 보스를 잡아도 체력 그대로, 최대 체력만 +4
  for (const [a, want] of [[2, 'heal'], [3, 'none']]){
    R.asc = a; t.newBattle(boss); R.pending = { r:4, l:2 }; R.maxHp = 30; t.G.p.hp = 10; R.relics.medkit = 0;
    t.battleEnd(true); ok(`고난 ${a}: 보스 처치 후 체력 ${want === 'heal' ? '회복' : '그대로'}`, R.maxHp === 34 && (want === 'heal' ? R.hp > 10 : R.hp === 10));
  }
  // 심연에는 고난 규칙이 걸리지 않는다
  R.abyss = true; R.asc = 6; t.newBattle(elite); ok('심연: 고난 규칙 없음', t.G.m.rage === false); R.abyss = false;
}
{ // 봉인된 천장 칸에 닿은 구슬은 피해를 주지 않는다(같은 자리, 봉인만 다르게)
  const shoot = sealed => {
    const t = boot(); click('mNew'); t.newBattle({ r:0, l:0, t:'battle', mon:'slime' }); const G = t.G;
    G.bricks = []; G.seal = sealed ? [3] : []; G.phase = 'fire'; G.queue = []; G.fireEl = 0; G.shot = { full:true, hits:0, broke:0 };
    G.balls = [{ x:6 + 3 * 24 + 12, y:40, vx:0, vy:-300, hits:0, orb:'basic', kind:'basic', up:false, broke:0, bombed:false, drill:0, bounces:0 }];
    for (let i = 0; i < 10; i++) t.update(1 / 60);
    return { hits:G.balls[0] ? G.balls[0].hits : -1, projs:G.projs.filter(p => p.kind === 'dmg').length };
  };
  const a = shoot(false), b = shoot(true);
  ok(`봉인 판정: 봉인 칸은 타격 없음·튕기기만(열림 ${a.projs}, 봉인 ${b.projs})`, a.projs === 1 && b.projs === 0 && b.hits === 0);
}
{ // 근원: 고난 6에서 군주를 쓰러뜨리면 이야기 → 같은 칸에서 성벽의 왕. 새로고침해도 근원부터
  const store = {}; const t = boot(store); const M = t.META(); M.asc = 6; M.ascPick = 6; click('mNew');
  const R = t.RUN; R.s = 4; R.map = t.genMap(4, false, R.seed); R.pos = { r:3, l:2 }; t.saveRun();
  const got = t.catchChoice(); t.enterNode(R.map[4][0]);
  ok('고난 6: 5층 보스는 먼저 탑의 군주', t.G.cfg.name === '탑의 군주');
  t.G.p.hp = 17; t.battleEnd(true);
  const st = got.find(o => o.mode === 'story');
  ok('고난 6: 군주 격파 → 근원 이야기 → 저장에 근원 표시', R.king === true && st && st.title === '근원' && JSON.parse(store[RUN_KEY]).king === true);
  st.buttons[0].onClick();
  ok('근원: 성벽의 왕, 천장 2칸 봉인, 체력 이어짐', t.G.cfg.name === '성벽의 왕' && t.G.seal.length === 2 && t.G.p.hp === 17);
  const u = boot(store); click('mContinue');
  ok('근원 중 새로고침 → 성벽의 왕부터 이어하기', !!u.G && u.G.cfg.name === '성벽의 왕');
  const got2 = u.catchChoice(); u.G.m.hp = 0; u.G.m.dead = true; u.battleEnd(true);
  const M2 = u.META();
  ok('근원 격파: 진 엔딩 이야기·아침 배지·고난 6 완주 기록', got2.some(o => o.mode === 'story' && o.title === '성벽이 내려간 아침') && M2.badges.root >= 1 && M2.ascClear[6] === 1);
  const fin = got2.find(o => o.mode === 'story'); fin.buttons[0].onClick();
  ok('진 엔딩 → 결과 화면 "탑이 무너졌다"', got2.some(o => o.mode === 'result' && o.title === '탑이 무너졌다'));
}
{ // 근원 페이즈: 2페이즈부터 다음 봉인 예고·턴마다 이동, 3페이즈 봉인 3칸
  const t = boot(); click('mNew'); t.newBattle({ r:4, l:2, t:'boss', mon:'king' }); const G = t.G;
  const s1 = G.seal.join(); G.m.hp = Math.floor(G.m.max * .45); G.phase = 'enemy'; G.eStep = 0; G.timer = 0;
  // checkRage는 피해가 들어갈 때 불린다: 몬스터 독으로 한 번 깎아 페이즈를 올린다
  G.m.poison = 1; G.phase = 'aim'; G.balls = []; G.queue = [];
  const before = G.sealNext; t.G.m.hp = Math.floor(G.m.max * .45);
  // 직접 페이즈 판정을 부르는 경로가 없으므로 피해 투사체를 하나 보낸다
  G.projs.push({ x0:0, y0:0, x1:0, y1:0, t:1, dur:0.01, kind:'dmg', v:1, venom:0, shot:null });
  for (let i = 0; i < 3; i++) t.update(1 / 60);
  ok('근원 2페이즈: 다음 봉인 예고가 생긴다', before === null && Array.isArray(G.sealNext) && G.m.phase === 2);
  const cur = G.seal.join(), next = G.sealNext.join();
  G.m.def = 0; G.m.hp = Math.floor(G.m.max / 3) + 1;
  G.projs.push({ x0:0, y0:0, x1:0, y1:0, t:1, dur:0.01, kind:'dmg', v:1, venom:0, shot:null });
  for (let i = 0; i < 3; i++) t.update(1 / 60);
  ok('근원 3페이즈: 봉인 3칸', G.m.phase === 3 && G.seal.length === 3 && s1 !== '' && cur !== next);
}
{ // 고난 해금: 열린 최고 단계를 깨면 다음 단계가 열리고 골라지며, 이야기 조각을 한 번만
  const t = boot(); const M = t.META(); M.asc = 1; M.ascPick = 1; M.story = { intro:1, end1:1 }; click('mNew');
  const R = t.RUN; t.newBattle({ r:4, l:2, t:'boss', mon:'lord' }); R.pending = { r:4, l:2 };
  const got = t.catchChoice(); t.victory();
  ok('고난 1 완주: 고난 2 열림·골라짐, 조각 a1', M.asc === 2 && M.ascPick === 2 && M.story.a1 === 1 && got.some(o => o.title === '첫 번째 조각 · 성주'));
  const t2 = boot(); const M2 = t2.META(); M2.asc = 3; M2.ascPick = 1; M2.story = { intro:1, end1:1, a1:1 }; click('mNew');
  t2.newBattle({ r:4, l:2, t:'boss', mon:'lord' }); t2.RUN.pending = { r:4, l:2 }; const g2 = t2.catchChoice(); t2.victory();
  ok('낮은 단계 재완주: 해금 없음·이미 본 조각은 다시 안 보임', M2.asc === 3 && !g2.some(o => o.mode === 'story'));
  const t3 = boot(); const M3 = t3.META(); click('mNew');
  t3.newBattle({ r:4, l:2, t:'boss', mon:'lord' }); t3.RUN.pending = { r:4, l:2 }; const g3 = t3.catchChoice(); t3.victory();
  ok('첫 완주: 결말 1 "빈 갑옷" → 고난 1 열림', M3.asc === 1 && g3.some(o => o.title === '빈 갑옷'));
}
{ // 첫 원정: 프롤로그 → 지도. 두 번째 원정은 바로 지도
  FRESH_STORY = true;
  const store = {}; const t = boot(store); const got = t.catchChoice(); click('mNew');
  ok('첫 원정: 프롤로그', t.mode === 'story' && got[0] && got[0].title === '성벽이 내려온 밤');
  got[0].buttons[0].onClick(); ok('프롤로그 → 지도', t.mode === 'map');
  const u = boot(store); click('mNew'); click('mNew'); ok('두 번째 원정: 프롤로그 없이 지도', u.mode === 'map');
  FRESH_STORY = false;
}
{ // 빌드 배지: 덱 절반 이상이 한 계열이면
  const t = boot(); const M = t.META(); M.story = { intro:1, end1:1 }; click('mNew');
  t.RUN.deck = ['venom', 'toxin+2', 'basic', 'bomb']; t.newBattle({ r:4, l:2, t:'boss', mon:'lord' }); t.RUN.pending = { r:4, l:2 }; t.catchChoice(); t.victory();
  ok('빌드 배지: 독 2/4 → 독의 길, 폭파 1/4 → 없음', M.badges.path_poison === 1 && !M.badges.path_bomb);
}
{ // 저장 보정: 범위 밖 고난 단계
  const t = boot({ [META_KEY]:JSON.stringify({ best:25, asc:99, ascPick:-3, ascClear:null, story:'x' }), [RUN_KEY]:mut(r => { r.asc = 42; }) }); const M = t.META();
  ok('메타 보정: asc ≤ 6, ascPick 0, ascClear·story 객체', M.asc === 6 && M.ascPick === 0 && typeof M.ascClear === 'object' && typeof M.story === 'object');
  click('mContinue'); ok('원정 보정: 범위 밖 asc → 0', t.RUN.asc === 0);
}
{ // 메인: 고난 버튼은 완주 전엔 숨고, 누르면 열린 단계까지 돈다
  boot(); ok('고난 버튼: 완주 전 숨김', els.mAsc.hidden === true);
  const u = boot({ [META_KEY]:JSON.stringify({ best:25, clears:1, asc:2, ascPick:0 }) }); const M = u.META();
  const seq = []; for (let i = 0; i < 4; i++){ click('mAsc'); seq.push(M.ascPick); }
  ok('고난 버튼: 0→1→2→0 순환', els.mAsc.hidden === false && seq.join() === '1,2,0,1');
  click('mNew'); ok('고른 고난 단계로 원정 시작', u.RUN.asc === 1);
}

{ // 리뷰 반영(PR #29): 기존 완주 계정은 고난 1이 열려 있다
  const t = boot({ [META_KEY]:JSON.stringify({ best:25, clears:2, pts:5 }) }); const M = t.META();
  ok('기존 완주 기록 → 고난 1 열림', M.asc === 1 && els.mAsc.hidden === false);
}
{ // 리뷰 반영: 군주 → 근원 전환에는 승리 회복(구급상자·재생)이 붙지 않는다
  const t = boot(); const M = t.META(); M.asc = 6; M.ascPick = 6; M.tree = { d1:1, d2:1, d3:1 }; click('mNew');
  const R = t.RUN; R.relics.medkit = 2; R.s = 4; R.map = t.genMap(4, false, R.seed); R.pos = { r:3, l:2 };
  const got = t.catchChoice(); t.enterNode(R.map[4][0]); t.G.p.hp = 9; t.battleEnd(true);
  got.find(o => o.mode === 'story').buttons[0].onClick();
  ok('근원 전환: 회복 없이 군주전 체력 그대로(9)', t.G.cfg.name === '성벽의 왕' && t.G.p.hp === 9);
  M.tree = {};
}
{ // 리뷰 반영: 성벽의 왕 2페이즈는 체력 절반부터(2/3 아님)
  const t = boot(); click('mNew'); t.newBattle({ r:4, l:2, t:'boss', mon:'king' }); const G = t.G;
  G.m.def = 0; G.m.hp = Math.floor(G.m.max * .6) + 1; G.phase = 'aim'; G.balls = []; G.queue = [];
  G.projs.push({ x0:0, y0:0, x1:0, y1:0, t:1, dur:0.01, kind:'dmg', v:1, venom:0, shot:null });
  for (let i = 0; i < 3; i++) t.update(1 / 60);
  ok('성벽의 왕: 체력 60%에서는 아직 1페이즈', G.m.phase === 1 && G.sealNext === null);
}
{ // 리뷰 반영: 깨진 근원 표시는 고난 6·5층·보스 칸 대기 중일 때만 유지
  const bad = boot({ [RUN_KEY]:mut(r => { r.king = 'yes'; r.asc = 2; r.s = 1; }) }); click('mContinue');
  ok('근원 표시 보정: 조건 밖이면 지움', bad.RUN.king === false);
  const keep = mut(r => { r.king = true; r.asc = 6; r.s = 4; r.map = JSON.parse(JSON.stringify(goodRun.map)); r.map[4] = [{ r:4, l:2, t:'boss', mon:'lord', to:[] }]; r.map[3].forEach(n => n.to = [2]); r.pending = { r:4, l:2 }; });
  const ok2 = boot({ [RUN_KEY]:keep }); click('mContinue');
  ok('근원 표시 보정: 조건 안이면 유지 → 성벽의 왕', ok2.RUN.king === true && !!ok2.G && ok2.G.cfg.name === '성벽의 왕');
}

// ── 닉네임 변경(일주일에 한 번)
async function renameWith(reply, prof = {}){
  const sent = [];
  const t = boot({ [PROF_KEY]:JSON.stringify(Object.assign({ id:'00000000-0000-4000-8000-000000000002', name:'바삭한 우울한 냉장고', registered:true, queue:[] }, prof)) }, false,
    (path, body) => { sent.push(path); return reply(path, body); });
  click('mRename'); return { t, sent };
}
{ const { t, sent } = await renameWith(p => p === 'rename' ? { status:200, data:{ ok:true, name:'새 기사', nameAt:Date.now() } } : { status:200, data:{} });
  els.nameIn.value = '  새   기사 '; await els.renameForm.onsubmit({ preventDefault(){} });
  ok('닉네임 변경: 공백 정리 후 서버 반영·화면·저장', t.PROFILE.name === '새 기사' && els.mName.textContent === '새 기사' && els.renameForm.hidden === true && sent.includes('rename') && t.PROFILE.nameAt > 0); }
{ const { t, sent } = await renameWith(() => ({ status:200, data:{} }));
  for (const bad of ['a', '열세글자를넘는아주긴닉네임', '<b>', '이모지🙂']){ els.nameIn.value = bad; await els.renameForm.onsubmit({ preventDefault(){} }); }
  ok('닉네임 변경: 형식이 틀리면 서버에 보내지 않고 안내', !sent.includes('rename') && /2~12자/.test(els.nameMsg.textContent) && t.PROFILE.name === '바삭한 우울한 냉장고'); }
{ const { t } = await renameWith(p => p === 'rename' ? { status:409, data:{ error:'name taken' } } : { status:200, data:{} });
  els.nameIn.value = '하람'; await els.renameForm.onsubmit({ preventDefault(){} });
  ok('닉네임 변경: 중복(409) 안내·이름 유지', /이미/.test(els.nameMsg.textContent) && t.PROFILE.name === '바삭한 우울한 냉장고'); }
{ const next = Date.now() + 3 * 864e5;
  const { t } = await renameWith(p => p === 'rename' ? { status:429, data:{ error:'wait', nextAt:next } } : { status:200, data:{} });
  els.nameIn.value = '하람'; await els.renameForm.onsubmit({ preventDefault(){} });
  ok('닉네임 변경: 서버 7일 제한(429) → 다음 가능 시각 안내·기억', /다시 바꿀 수 있다/.test(els.nameMsg.textContent) && t.PROFILE.nameAt === next - 7 * 864e5); }
{ const { t, sent } = await renameWith(() => ({ status:200, data:{} }), { nameAt:Date.now() - 864e5 });
  ok('닉네임 변경: 7일 안이면 폼이 잠기고 날짜 안내(서버에 안 보냄)', els.nameSave.disabled === true && els.nameIn.disabled === true && /다시 바꿀 수 있다/.test(els.nameMsg.textContent) && !sent.includes('rename')); }
{ const { t } = await renameWith(() => null);
  els.nameIn.value = '하람'; await els.renameForm.onsubmit({ preventDefault(){} });
  ok('닉네임 변경: 오프라인이면 안내·이름 유지', /인터넷에 연결/.test(els.nameMsg.textContent) && t.PROFILE.name === '바삭한 우울한 냉장고'); }

// ── 닉네임 금지어
{ const t = boot();
  // 서버와 클라이언트가 같은 목록을 쓰는지(한쪽만 고치면 화면은 통과시키는데 서버가 거절하거나 그 반대가 된다)
  const srv = fs.readFileSync(path.join(ROOT, 'functions/api/[[path]].js'), 'utf8').match(/const BAD_NAME = (\[[\s\S]*?\]);/);
  ok('금지어 목록: 서버와 클라이언트가 같다', !!srv && JSON.stringify(eval(srv[1])) === JSON.stringify(t.BAD_NAME));
  const line = (src, n) => (src.match(new RegExp('^const ' + n + ' = .*$', 'm')) || [''])[0];
  const cli = fs.readFileSync(path.join(ROOT, 'js/profile.js'), 'utf8'), sv = fs.readFileSync(path.join(ROOT, 'functions/api/[[path]].js'), 'utf8');
  ok('금지어 판정 코드(normName·badName): 서버와 클라이언트가 같다', ['normName', 'badName'].every(n => line(cli, n) && line(cli, n).trim() === line(sv, n).trim()));
  const bad = ['시발놈', '씨 발', '시1발', '병신같이', '개새끼', 'FuCk you', 'f u c k', '운영자', 'Admin', '미친놈아', '좆밥', 'sex123', '시a발', 'f한uck', '병X신', 'S하e나x'];
  const good = ['새 기사', '하람', '바삭한 우울한 냉장고', 'Knight 7', '성벽의 왕', '구슬장인', '시바견', '보리차'];
  const missed = bad.filter(n => !t.badName(n)), wrong = good.filter(n => t.badName(n));
  ok(`금지어: 우회(공백·숫자·대소문자)까지 거름${missed.length ? ' 놓침 ' + missed.join(',') : ''}`, missed.length === 0);
  // '시바견'처럼 금지어를 품은 정상 단어는 막혀도 어쩔 수 없다(목록에 '시바'가 있다). 아래는 막히면 안 되는 이름만 본다
  const mustPass = good.filter(n => n !== '시바견'), wrong2 = mustPass.filter(n => t.badName(n));
  ok(`금지어: 정상 이름은 통과${wrong2.length ? ' 잘못 막음 ' + wrong2.join(',') : ''}`, wrong2.length === 0);
  // 자동 닉네임(약 15만 개)은 하나도 걸리면 안 된다: 처음 접속 때 서버 등록이 막힌다
  let hits = [];
  for (const a of t.NICK_A) for (const b of t.NICK_B) for (const c of t.NICK_C){ const n = a + ' ' + b + ' ' + c; if (t.badName(n) || !t.validName(n)) hits.push(n); }
  // 사물 낱말은 정확히 3음절 한글(세 묶음 길이를 맞춰 이름 폭이 고르게, 12자 상한 안에 들게)
  const odd = t.NICK_C.filter(w => !/^[가-힣]{3}$/.test(w)).concat(t.NICK_C.filter((w, i) => t.NICK_C.indexOf(w) !== i));
  ok(`자동 닉네임 사물: 모두 3음절·중복 없음${odd.length ? ' 어긋남 ' + odd.join(',') : ''}`, odd.length === 0);
  ok(`금지어·형식: 자동 닉네임 ${t.NICK_A.length * t.NICK_B.length * t.NICK_C.length}개 중 걸린 것 ${hits.length}개${hits.length ? ' 예: ' + hits.slice(0, 3).join(' / ') : ''}`, hits.length === 0);
}
{ const { t, sent } = await renameWith(() => ({ status:200, data:{ ok:true } }));
  els.nameIn.value = '시1발'; await els.renameForm.onsubmit({ preventDefault(){} });
  ok('닉네임 변경: 금지어면 서버에 보내지 않고 안내', !sent.includes('rename') && /쓸 수 없는 단어/.test(els.nameMsg.textContent) && t.PROFILE.name === '바삭한 우울한 냉장고'); }
{ const { t } = await renameWith(p => p === 'rename' ? { status:400, data:{ error:'bad' } } : { status:200, data:{} });
  els.nameIn.value = '평범한이름'; await els.renameForm.onsubmit({ preventDefault(){} });
  ok('닉네임 변경: 서버가 금지어로 거절(400 bad)하면 같은 안내', /쓸 수 없는 단어/.test(els.nameMsg.textContent)); }

// ── 원정 시작 표(2026-10-26 남용 방지): 받으면 기억해 다시 보내지 않고, 실패하면 다음에 다시 보낸다
{ const sent = [];
  const t = boot(PROF([]), false, (p, b) => { sent.push(p); return p === 'start' ? { status:200, data:{ ok:true } } : { status:200, data:{ ok:true } }; });
  const r = { rid:'11111111-1111-4111-8111-111111111111' };
  await t.ticketRun(r); await t.ticketRun(r);
  ok('시작 표: 성공하면 r.tk, 두 번째는 보내지 않음', r.tk === true && sent.filter(x => x === 'start').length === 1); }
{ const t = boot(PROF([]), false, p => p === 'start' ? null : { status:200, data:{ ok:true } });
  const r = { rid:'11111111-1111-4111-8111-111111111112' }; await t.ticketRun(r);
  ok('시작 표: 통신 실패면 tk 없음(다음에 다시)', !r.tk); }
{ const t = boot(PROF([]), false, p => p === 'start' ? { status:429, data:{ error:'rate' } } : { status:200, data:{ ok:true } });
  const r = { rid:'11111111-1111-4111-8111-111111111113' }; await t.ticketRun(r);
  ok('시작 표: 속도 제한(429)이면 tk 없음', !r.tk); }
{ let n = 0; const t = boot(PROF([], false), false, p => { if (p === 'player') n++; return { status:200, data:{ ok:true } }; });
  await Promise.all([t.ticketRun({ rid:'11111111-1111-4111-8111-111111111114' }), t.ticketRun({ rid:'11111111-1111-4111-8111-111111111114' }), t.flushRecords()]);
  ok('동시에 불러도 닉네임 등록 요청은 하나', n === 1); }
{ const names = []; const t = boot(PROF([], false), false, (p, b) => { if (p !== 'player') return { status:200, data:{ ok:true } }; names.push(b.name); return names.length === 1 ? { status:400, data:{ error:'bad' } } : { status:200, data:{ ok:true } }; });
  await t.flushRecords();
  ok('서버가 자동 닉네임을 거절(400 bad)하면 새로 뽑아 등록', names.length === 2 && names[0] !== names[1] && t.PROFILE.registered === true); }
// ── 내 기록 삭제(2026-10-26): 성공하면 새 id·새 닉네임·빈 대기열, 실패하면 아무것도 바꾸지 않는다(대기열만 비움)
{ const sent = []; const t = boot(PROF([Q(3)]), false, (p, b) => { sent.push(p + ':' + b.id); return { status:200, data:{ ok:true } }; });
  const old = t.PROFILE.id, r = await t.deleteProfile();
  ok('기록 삭제: 서버에 옛 id로 요청, 새 id·미등록·빈 대기열', r.ok && sent.includes('delete:' + old) && t.PROFILE.id !== old && !t.PROFILE.registered && t.PROFILE.queue.length === 0); }
{ const t = boot(PROF([Q(3)]), false, p => p === 'delete' || p === 'record' ? null : { status:200, data:{ ok:true } });
  const old = t.PROFILE.id, r = await t.deleteProfile();
  ok('기록 삭제: 오프라인이면 offline, id·못 보낸 기록 유지', r.error === 'offline' && t.PROFILE.id === old && t.PROFILE.queue.map(q => q.rid).join() === 'r3'); }
{ const t = boot(PROF([]), false, p => p === 'delete' ? { status:429, data:{ error:'rate' } } : { status:200, data:{ ok:true } });
  ok('기록 삭제: 속도 제한이면 busy', (await t.deleteProfile()).error === 'busy'); }
{ // 올리는 중에 삭제를 누르면: 지금 보내는 기록까지만 가고, 다음 기록은 지울 id로 보내지 않는다
  const sent = [];
  const t = boot(PROF([Q(1), Q(2)]), false, (p, b) => { sent.push(p + ':' + (b.rid || '')); return { status:200, data:{ ok:true } }; });
  const f = t.flushRecords(); const d = t.deleteProfile(); await f; const r = await d;
  ok('기록 삭제: 전송 중이면 다음 기록은 멈추고 삭제', r.ok && sent.filter(x => x.startsWith('record')).length <= 1 && sent.includes('delete:')); }
// ── 코드 리뷰(2026-10-26) 회귀
{ // 패배가 확정되는 순간 저장이 지워진다: 쓰러지는 연출 중 메뉴·새로고침으로 진 전투를 되돌릴 수 없다
  const store = {}; const t = boot(store); click('mNew'); t.startBattle(BATTLE);
  const had = !!store[RUN_KEY]; t.setLose(t.G);
  const before = t.mode; t.openMenu();
  ok('패배 확정: 저장 즉시 삭제 + 연출 중 메뉴 안 열림', had && !store[RUN_KEY] && t.mode === before && t.PROFILE.queue.length === 1); }
{ const t = boot(); click('mNew'); t.startBattle(BATTLE); t.G.phase = 'win'; const m = t.mode; t.openMenu();
  ok('승리 연출 중 메뉴 안 열림', t.mode === m); }
{ const t = boot({ [RUN_KEY]:mut(r => { r.badges = ['nope', 'final']; r.relics = { toString:1, whetstone:1 }; r.deck = ['constructor', 'basic']; }) });
  const R = t.loadRun();
  ok('저장 보정: 상속 키 구슬·유물·모르는 배지 제거', R && R.deck.join() === 'basic' && JSON.stringify(R.relics) === '{"whetstone":1}' && R.badges.join() === 'final'); }
{ const t = boot({ [RUN_KEY]:mut(r => { r.asc = 6; r.s = 4; r.king = true; r.pending = { r:4, l:99 }; }) });
  const R = t.loadRun();
  ok('저장 보정: 깨진 pending이면 근원 표시도 지움', R && R.pending === null && R.king === false); }
{ const t = boot({ [META_KEY]:'{"__proto__":{"polluted":1},"pts":3}' });
  const M2 = t.META();
  ok('메타 불러오기: "__proto__" 키가 프로토타입을 바꾸지 않음', M2.pts === 3 && Object.getPrototypeOf(M2) === Object.prototype && M2.polluted === undefined); }
process.exit(fail ? 1 : 0);
