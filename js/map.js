// 원정 상태와 갈림길 지도 생성
'use strict';

// ── 원정 상태
let RUN = null, G = null, mode = 'main', prevMode = null;
function freshRun(abyss, asc = 0){
  // rid: 기록 서버에서 같은 원정을 두 번 세지 않게 하는 원정 식별자
  // abyss: 심연 원정(본편과 같은 규칙, 몬스터만 더 세고 끝이 없다). revived: 불사조(트리)를 이미 썼는지
  // seed: 원정 시드(지도·보상·전투 난수의 뿌리). rng.reward: 저장되는 보상 흐름 상태
  const seed = Math.floor(Math.random() * 4294967296) >>> 0;
  // deck = 차고에서 장전한 구슬(작업 08). cargo = 적재함: 정비소에서 송신해야 차고에 남는다
  // 최대 체력은 릭 레벨마다 +1(작업 08 6절). load = 장전 슬롯마다 차고 구슬 번호(구슬 경험치를 돌려줄 곳)
  const hp = 24 + rickLv() - 1, lo = loadout(baseSlots());
  return { v:5, seed, rng:{ reward:seedOf(seed, 'reward') }, rid:uuid(), abyss:!!abyss, asc:abyss ? 0 : asc, king:false, s:0, hp, maxHp:hp, coins:0, deck:lo.deck, load:lo.load, relics:{},
           cargo:{ cores:{}, circs:{}, scrap:0 },
           map:genMap(0, abyss, seed), pos:null, pending:null, path:[], pendingReward:null, shop:null, revived:false, pts:0 };
}

// ── 갈림길 지도: 5갈래 × 4칸 + 보스. 같은 칸으로는 항상, 옆 칸으로는 40% 확률로 이어진다
// 갈래를 3 → 5로 늘려 고를 길이 많아졌다(같은 갈래만 따라가도 되고, 옆으로 갈아탈 기회도 늘었다)
const LANES = 5, BOSS_L = 2;
const NODE_NAME = { battle:'전투', elite:'정예', rest:'충전소', shop:'브로커', boss:'보스' };
function genMap(s, abyss, seed){
  RNG.map = seedOf(seed, 'map', s, abyss ? 1 : 0);
  // 층별 등장 구성(ROSTER, 작업 08 2단계). 앞 층 기체가 PREV_MIX 확률로 섞인다.
  // 심층부는 모든 층 기체가 섞여 첫 칸부터 아무 기체나 나온다. 본편 1층 첫 칸은 나노 슬러지로 몸을 푼다
  const ro = ROSTER[Math.min(s, ROSTER.length - 1)], prev = ROSTER[Math.max(0, Math.min(s, ROSTER.length - 1) - 1)];
  const allMons = ROSTER.flatMap(x => x.mons), allElite = ROSTER.flatMap(x => x.elite);
  const battleMon = r => abyss ? pickOne(allMons, 'map') : s === 0 && r === 0 ? 'slime'
    : s > 0 && rand('map') < PREV_MIX ? pickOne(prev.mons, 'map') : pickOne(ro.mons, 'map');
  // 길을 먼저 잇고 칸 종류를 정한다
  const rows = [];
  for (let r = 0; r < 4; r++){
    const row = [];
    for (let l = 0; l < LANES; l++) row.push({ r, l, t:'battle', mon:null, to:[] });
    rows.push(row);
  }
  for (let r = 0; r < 3; r++) for (const n of rows[r]){
    n.to = [n.l];
    if (n.l > 0 && rand('map') < .4) n.to.push(n.l - 1);
    if (n.l < LANES - 1 && rand('map') < .4) n.to.push(n.l + 1);
  }
  // 충전소·브로커는 층마다 하나씩만(2026-11-06 소유자 결정): 회복·구매 기회가 귀해져 어느 길로 갈지가 무거워진다.
  // 충전소는 예전 가중치처럼 보스 앞 줄에 더 자주 둔다. 첫 줄(r 0)은 늘 전투
  const late = rows.slice(1).flat();
  const restAt = pickW(Object.fromEntries(late.map((n, i) => [i, n.r === 3 ? 34 : 18])), 'map');
  const shopAt = pickW(Object.fromEntries(late.map((n, i) => [i, 1]).filter(([i]) => i !== +restAt)), 'map');
  late[restAt].t = 'rest'; late[shopAt].t = 'shop';
  for (let r = 0; r < 4; r++) for (const n of rows[r]){
    if (r > 0 && n.t === 'battle') n.t = pickW({ battle:45, elite:r === 1 ? 10 : 16 }, 'map');
    n.mon = n.t === 'elite' ? pickOne(abyss ? allElite : ro.elite, 'map') : n.t === 'battle' ? battleMon(r) : null;
  }
  for (const n of rows[3]) n.to = [BOSS_L];
  rows.push([{ r:4, l:BOSS_L, t:'boss', mon:!abyss && s === FINAL_S ? 'lord' : 'boss', to:[] }]);
  RNG.map = null;
  return rows;
}
const nodeAt = (r, l) => RUN.map[r].find(n => n.l === l);
function reachable(){
  if (!RUN.pos) return RUN.map[0];
  if (RUN.pos.r >= 4) return [];
  const cur = nodeAt(RUN.pos.r, RUN.pos.l);
  return RUN.map[RUN.pos.r + 1].filter(n => cur.to.includes(n.l));
}
