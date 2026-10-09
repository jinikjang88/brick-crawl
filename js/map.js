// 원정 상태와 갈림길 지도 생성
'use strict';

// ── 원정 상태
let RUN = null, G = null, mode = 'main', prevMode = null;
function freshRun(abyss){
  // rid: 기록 서버에서 같은 원정을 두 번 세지 않게 하는 원정 식별자
  // abyss: 심연 원정(본편과 같은 규칙, 몬스터만 더 세고 끝이 없다). revived: 불사조(트리)를 이미 썼는지
  return { v:2, rid:uuid(), abyss:!!abyss, s:0, hp:24, maxHp:24, coins:0, deck:['basic','basic','bomb'], relics:{},
           map:genMap(0, abyss), pos:null, pending:null, path:[], pendingReward:null, shop:null, revived:false, pts:0 };
}

// ── 갈림길 지도: 5갈래 × 4칸 + 보스. 같은 칸으로는 항상, 옆 칸으로는 40% 확률로 이어진다
// 갈래를 3 → 5로 늘려 고를 길이 많아졌다(같은 갈래만 따라가도 되고, 옆으로 갈아탈 기회도 늘었다)
const LANES = 5, BOSS_L = 2;
const NODE_NAME = { battle:'전투', elite:'정예', rest:'휴식', shop:'상점', boss:'보스' };
function genMap(s, abyss){
  // 심연은 첫 칸부터 아무 몬스터나 나온다(본편처럼 슬라임으로 몸을 풀 틈을 주지 않는다)
  const pools = abyss ? [['slime','bat','golem'], ['bat','golem','shroom'], ['golem','shroom','bat'], ['shroom','golem','bat']]
    : [['slime'], ['bat','golem'], ['golem','shroom'], ['shroom','golem','bat']];
  // 길을 먼저 잇고 칸 종류를 정한다: 이어진 앞 칸이 휴식이면 휴식, 상점이면 상점이 다시 나오지 않게(연속 휴식·상점 금지)
  const rows = [];
  for (let r = 0; r < 4; r++){
    const row = [];
    for (let l = 0; l < LANES; l++) row.push({ r, l, t:'battle', mon:null, to:[] });
    rows.push(row);
  }
  for (let r = 0; r < 3; r++) for (const n of rows[r]){
    n.to = [n.l];
    if (n.l > 0 && Math.random() < .4) n.to.push(n.l - 1);
    if (n.l < LANES - 1 && Math.random() < .4) n.to.push(n.l + 1);
  }
  for (let r = 0; r < 4; r++) for (const n of rows[r]){
    if (r > 0){
      const w = { battle:45, elite:r === 1 ? 10 : 16, shop:17, rest:r === 3 ? 34 : 18 };
      for (const p of rows[r - 1]) if (p.to.includes(n.l) && (p.t === 'rest' || p.t === 'shop')) delete w[p.t];
      n.t = pickW(w);
    }
    n.mon = n.t === 'elite' ? pickOne(['bat','golem','shroom']) : n.t === 'battle' ? pickOne(pools[r]) : null;
  }
  for (const n of rows[3]) n.to = [BOSS_L];
  rows.push([{ r:4, l:BOSS_L, t:'boss', mon:!abyss && s === FINAL_S ? 'lord' : 'boss', to:[] }]);
  return rows;
}
const nodeAt = (r, l) => RUN.map[r].find(n => n.l === l);
function reachable(){
  if (!RUN.pos) return RUN.map[0];
  if (RUN.pos.r >= 4) return [];
  const cur = nodeAt(RUN.pos.r, RUN.pos.l);
  return RUN.map[RUN.pos.r + 1].filter(n => cur.to.includes(n.l));
}
