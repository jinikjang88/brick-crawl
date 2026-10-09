// 저장: localStorage 원정·메타
'use strict';

// ── 저장: 원정 진행(전투 사이 시점)과 영구 기록(메타)을 따로 보관
// 메타 v3: 스킬 포인트가 "원정 끝날 때 도달 칸만큼"에서 "칸 최초 돌파마다"로 바뀌고 트리 노드도 새로 짜였다.
// 같은 id(a1 등)가 다른 효과를 뜻하게 됐으므로 찍은 노드는 비우고, 지금까지의 최고 기록으로 받을 포인트를 다시 계산해 돌려준다
const SAVE_KEY = 'brickquest:run:v2', META_KEY = 'brickquest:meta:v3', META_KEY_V2 = 'brickquest:meta:v2';
// seen = 도감: 한 번이라도 손에 넣은 구슬·유물. 필드만 늘었고 예전 메타도 빈 도감으로 그대로 읽히므로 키 버전은 올리지 않는다
const META_BASE = () => ({ best:0, abyssBest:0, runs:0, clears:0, pts:0, tree:{}, badges:{}, seen:{ orb:{}, relic:{} } });
// p칸까지 처음 돌파하며 받는 포인트 합계(본편·심연 모두 5칸째가 보스)
const ptsUpTo = p => { let t = 0; for (let i = 1; i <= p; i++) t += i % 5 === 0 ? PTS.boss : PTS.cell; return t; };
let META = META_BASE();
(function loadMeta(){
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY));
    if (m && typeof m.best === 'number'){ META = Object.assign(META_BASE(), m); return; }
  } catch(e){}
  try {
    const o = JSON.parse(localStorage.getItem(META_KEY_V2));
    if (o && typeof o.best === 'number'){
      // 이전 본편은 3세션 + 심연이 같은 칸 번호로 이어졌다. 본편 25칸을 넘는 기록은 본편 완주로 본다
      const best = Math.min(o.best, SESSIONS * 5);
      META = Object.assign(META_BASE(), { best, runs:o.runs || 0, clears:best >= SESSIONS * 5 ? 1 : 0, pts:ptsUpTo(best) });
      saveMeta();
    }
  } catch(e){}
})();
if (!META.tree || typeof META.tree !== 'object') META.tree = {};
if (!META.badges || typeof META.badges !== 'object') META.badges = {};
if (!META.seen || typeof META.seen !== 'object') META.seen = {};
for (const k of ['orb', 'relic']) if (!META.seen[k] || typeof META.seen[k] !== 'object') META.seen[k] = {};
function markSeen(kind, id){ if (META.seen[kind][id]) return; META.seen[kind][id] = 1; saveMeta(); }
// 데이터에서 빠진 옛 id는 세지 않는다
const seenCount = kind => Object.keys(META.seen[kind]).filter(k => (kind === 'orb' ? ORBS : RELICS)[k]).length;
function saveMeta(){ try { localStorage.setItem(META_KEY, JSON.stringify(META)); } catch(e){} }
function saveRun(){ try { localStorage.setItem(SAVE_KEY, JSON.stringify(RUN)); } catch(e){} }
function loadRun(){
  try {
    const r = JSON.parse(localStorage.getItem(SAVE_KEY));
    // 구조가 맞지 않는 저장은 버린다(이전 버전 데이터 등)
    if (r && r.v === 2 && Array.isArray(r.deck) && Array.isArray(r.map) && r.map.length === 5) return r;
  } catch(e){}
  return null;
}
function clearRun(){ try { localStorage.removeItem(SAVE_KEY); } catch(e){} }
// 칸 번호 → 화면 표기. 본편은 1~25("세션-칸"), 그 위는 심연(26 = 심연 1층 1칸)
const MAIN_CELLS = SESSIONS * 5;
const progLabel = p => p > MAIN_CELLS ? `심연 ${Math.floor((p - MAIN_CELLS - 1) / 5) + 1}-${(p - MAIN_CELLS - 1) % 5 + 1}`
  : `${Math.floor((p - 1) / 5) + 1}-${(p - 1) % 5 + 1}`;
const abyssOpen = () => META.clears > 0;
