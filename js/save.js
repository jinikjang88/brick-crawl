// 저장: localStorage 원정·메타
'use strict';

// ── 저장: 원정 진행(전투 사이 시점)과 영구 기록(메타)을 따로 보관
// v4(2026-10-16): 이야기·고난 단계가 들어간 새 시작에 맞춰 모든 사용자의 진행도를 초기화했다(사용자 결정).
// 옛 원정·메타(v2·v3)는 옮기지 않고 지운다. 프로필(닉네임·플레이어 id)은 그대로 둔다(profile.js)
const SAVE_KEY = 'brickquest:run:v4', META_KEY = 'brickquest:meta:v4';
const OLD_KEYS = ['brickquest:run:v2', 'brickquest:run:v3', 'brickquest:meta:v2', 'brickquest:meta:v3'];
for (const k of OLD_KEYS) try { localStorage.removeItem(k); } catch(e){}
// seen = 도감: 한 번이라도 손에 넣은 구슬·유물. 필드만 늘었고 예전 메타도 빈 도감으로 그대로 읽히므로 키 버전은 올리지 않는다
// asc = 열린 최고 고난 단계, ascPick = 메인에서 고른 단계, ascClear = 단계별 완주 횟수, story = 본 이야기 조각(작업 05).
// 필드만 늘어 예전 메타도 기본값으로 읽히므로 키 버전은 그대로다
const META_BASE = () => ({ best:0, abyssBest:0, runs:0, clears:0, pts:0, tree:{}, badges:{}, seen:{ orb:{}, relic:{} }, asc:0, ascPick:0, ascClear:{}, story:{} });
// p칸까지 처음 돌파하며 받는 포인트 합계(본편·심연 모두 5칸째가 보스)
const ptsUpTo = p => { let t = 0; for (let i = 1; i <= p; i++) t += i % 5 === 0 ? PTS.boss : PTS.cell; return t; };
let META = META_BASE();
(function loadMeta(){
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY));
    // best 하나가 깨졌다고 통째로 버리면 다음 saveMeta()가 정상 포인트·트리·배지까지 덮어쓴다. 칸별 보정은 아래에서
    if (m && typeof m === 'object' && !Array.isArray(m)){ META = Object.assign(META_BASE(), m); return; }
  } catch(e){}
})();
// 메타는 원정보다 소중하다(포인트·배지·도감): 버리지 않고 깨진 칸만 기본값으로 메운다
for (const k of ['best', 'abyssBest', 'runs', 'clears', 'pts', 'asc', 'ascPick'])
  if (typeof META[k] !== 'number' || !isFinite(META[k]) || META[k] < 0) META[k] = 0;
if (!META.tree || typeof META.tree !== 'object') META.tree = {};
if (!META.badges || typeof META.badges !== 'object') META.badges = {};
if (!META.seen || typeof META.seen !== 'object') META.seen = {};
for (const k of ['ascClear', 'story']) if (!META[k] || typeof META[k] !== 'object') META[k] = {};
// 고난 단계가 생기기 전에 이미 완주한 계정은 고난 1이 열린 상태로 옮긴다(다시 5층을 깨야 열리는 일이 없게)
if (META.clears > 0 && META.asc < 1) META.asc = 1;
META.asc = Math.min(Math.floor(META.asc), ASC_MAX); META.ascPick = Math.min(Math.floor(META.ascPick), META.asc);
for (const k of ['orb', 'relic']) if (!META.seen[k] || typeof META.seen[k] !== 'object') META.seen[k] = {};
function markSeen(kind, id){ if (META.seen[kind][id]) return; META.seen[kind][id] = 1; saveMeta(); }
// 데이터에서 빠진 옛 id는 세지 않는다
const seenCount = kind => Object.keys(META.seen[kind]).filter(k => (kind === 'orb' ? ORBS : RELICS)[k]).length;
function saveMeta(){ try { localStorage.setItem(META_KEY, JSON.stringify(META)); } catch(e){} }
function saveRun(){ try { localStorage.setItem(SAVE_KEY, JSON.stringify(RUN)); } catch(e){} }
function loadRun(){
  try { return fixRun(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch(e){}
  return null;
}
// 원정 저장 검사: JSON이 읽혔다고 쓸 수 있는 저장은 아니다. 메인 화면도 이 저장으로 배경 전투를 그리므로
// 깨진 값이 하나라도 지나가면 이어하기 전에 메인부터 멈춘다.
// 고칠 수 있는 값(빠진 필드·범위 밖 수치·사라진 구슬/유물 id)은 기본값으로 메우고, 지도·덱처럼 되살릴 수 없으면 버린다
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const numOr = (x, d, lo = 0) => typeof x === 'number' && isFinite(x) && x >= lo ? x : d;
function fixMap(map){
  if (!Array.isArray(map) || map.length !== 5) return false;
  for (let r = 0; r < 5; r++){
    const row = map[r];
    if (!Array.isArray(row) || !row.length) return false;
    for (const n of row){
      if (!isObj(n) || n.r !== r || !isInt(n.l, 0, LANES - 1) || !NODE_NAME[n.t] || !Array.isArray(n.to)) return false;
      // 싸우는 칸은 몬스터가 있어야 이어하기에서 전투를 만들 수 있다
      if ((n.t === 'battle' || n.t === 'elite' || n.t === 'boss') && !(typeof n.mon === 'string' && MON[n.mon])) return false;
      // 다음 줄에 없는 칸으로 이어지면 지도에서 길이 끊긴다
      if (r < 4 && (!n.to.length || n.to.some(l => !map[r + 1].some(m => m && m.l === l)))) return false;
    }
  }
  return map[4].some(n => n.t === 'boss');
}
const cellOk = (map, c) => isObj(c) && isInt(c.r, 0, 4) && map[c.r].some(n => n.l === c.l);
function fixRun(r){
  if (!isObj(r) || r.v !== 4 || !fixMap(r.map)) return null;
  // 시드가 없거나 깨졌으면 새로 붙인다. 이미 정해진 지도·보상 후보·상점은 저장된 그대로 쓰므로 진행이 바뀌지 않는다
  if (!isInt(r.seed, 0, 4294967295)) r.seed = Math.floor(Math.random() * 4294967296) >>> 0;
  if (!isObj(r.rng) || !isInt(r.rng.reward, 0, 4294967295)) r.rng = { reward:seedOf(r.seed, 'reward') };

  if (!Array.isArray(r.deck)) return null;
  r.deck = r.deck.filter(o => typeof o === 'string' && ORBS[orbKind(o)] && orbLv(o) <= UP_MAX);
  if (!r.deck.length) return null;
  const relics = {};
  if (isObj(r.relics)) for (const k in r.relics)
    if (RELICS[k] && isInt(r.relics[k], 1, 99)) relics[k] = Math.min(r.relics[k], RELICS[k].max || 1);
  r.relics = relics;
  r.abyss = !!r.abyss;
  r.asc = r.abyss ? 0 : isInt(r.asc, 0, ASC_MAX) ? r.asc : 0;
  // 근원 표시는 고난 6·마지막 층·최종 보스 칸 대기 중일 때만 뜻이 있다. 그 밖이면 중간 층 보스가 근원으로 바뀌어 원정이 잘못 끝난다
  r.king = r.king === true && r.asc >= ASC_MAX && r.s === FINAL_S && !!r.pending && r.pending.r === 4;
  r.s = isInt(r.s, 0, r.abyss ? 9999 : SESSIONS - 1) ? r.s : 0;
  r.maxHp = Math.round(numOr(r.maxHp, 24, 1));
  r.hp = Math.max(1, Math.min(r.maxHp, Math.round(numOr(r.hp, r.maxHp))));
  r.coins = Math.floor(numOr(r.coins, 0));
  r.pts = Math.floor(numOr(r.pts, 0));
  if (typeof r.rid !== 'string') r.rid = uuid();
  r.tk = r.tk === true;   // 서버가 원정 시작 표를 받았는지(net.js ticketRun). 모르면 다시 보낸다
  r.pos = cellOk(r.map, r.pos) ? { r:r.pos.r, l:r.pos.l } : null;
  r.pending = cellOk(r.map, r.pending) ? { r:r.pending.r, l:r.pending.l } : null;
  r.path = Array.isArray(r.path) ? r.path.filter(p => Array.isArray(p) && cellOk(r.map, { r:p[0], l:p[1] })) : [];
  if (typeof r.pendingReward !== 'string') r.pendingReward = null;
  // 보상 후보·상점 진열은 다시 뽑으면 된다: 하나라도 이상하면 통째로 비운다
  const idOk = (k, id) => k === 'orb' ? !!ORBS[id] : k === 'relic' ? !!RELICS[id] : ['heal', 'upgrade', 'remove'].includes(k);
  // 구슬 보상엔 구슬만, 유물 보상엔 유물만: 엇갈리면 보상 화면이 다른 표에서 이름을 찾다 멈춘다
  if (!(isObj(r.reward) && typeof r.reward.kind === 'string' && Array.isArray(r.reward.stock)
    && r.reward.stock.every(id => (isOrbReward(r.reward.kind) ? ORBS : RELICS)[id]))) r.reward = null;
  else r.reward.reroll = Math.floor(numOr(r.reward.reroll, 0));
  if (!(Array.isArray(r.shop) && r.shop.every(it => isObj(it) && idOk(it.k, it.id) && numOr(it.price, -1) >= 0))) r.shop = null;
  return r;
}
function clearRun(){ try { localStorage.removeItem(SAVE_KEY); } catch(e){} }
// 칸 번호 → 화면 표기. 본편은 1~25("세션-칸"), 그 위는 심연(26 = 심연 1층 1칸)
const MAIN_CELLS = SESSIONS * 5;
const progLabel = p => p > MAIN_CELLS ? `심연 ${Math.floor((p - MAIN_CELLS - 1) / 5) + 1}-${(p - MAIN_CELLS - 1) % 5 + 1}`
  : `${Math.floor((p - 1) / 5) + 1}-${(p - 1) % 5 + 1}`;
const abyssOpen = () => META.clears > 0;
