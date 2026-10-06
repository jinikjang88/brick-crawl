// 저장: localStorage 원정·메타
'use strict';

// ── 저장: 원정 진행(전투 사이 시점)과 최고 기록을 따로 보관
const SAVE_KEY = 'brickquest:run:v2', META_KEY = 'brickquest:meta:v2';
let META = { best:0, runs:0 };
try { const m = JSON.parse(localStorage.getItem(META_KEY)); if (m && typeof m.best === 'number') META = m; } catch(e){}
// 출발 선물 시절의 누적 칸(xp)은 영혼석으로 옮긴다. 필드만 늘어나는 변경이라 키 버전(v2)은 그대로 둔다
if (typeof META.soul !== 'number') META.soul = META.xp || 0;
if (!META.tree || typeof META.tree !== 'object') META.tree = {};
delete META.xp;
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
const progLabel = p => `${Math.floor((p - 1) / 5) + 1}-${(p - 1) % 5 + 1}`;
