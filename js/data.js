// 데이터: 몬스터(MON)·성벽·구슬(ORBS)·유물(RELICS)
'use strict';

// ── 몬스터: 숫자 인플레이션을 막기 위해 세션 상승폭은 작게(체력 +35%, 공·방 +1)
// 공격은 배율 없이 {t:'atk', n}: n턴 연속으로 매 턴 공격력만큼 때린다.
// 배율(×2.5 등)을 두면 화면의 ⚔ 숫자와 실제 피해가 어긋나 읽히지 않아서, 피해는 항상 ⚔ 숫자 그대로다
const MON = {
  slime: { name:'슬라임', spr:'slime', hp:6, atk:1, def:0, sweep:1.1,
    pattern:[{t:'atk',n:2},{t:'wait'}],
    row:{ d:.55, hard:0, stat:.5, w:{ atk:1 } } },
  bat: { name:'박쥐', spr:'bat', hp:8, atk:1, def:0, sweep:1.3,
    pattern:[{t:'atk',n:3},{t:'wait'}],
    row:{ d:.6, hard:.2, stat:.4, w:{ atk:1, def:1 } } },
  golem: { name:'골렘', spr:'golem', hp:9, atk:1, def:2, sweep:1.5,
    pattern:[{t:'atk',n:2},{t:'guard',v:2}],
    row:{ d:.6, hard:.25, stat:.4, w:{ atk:2, def:1 } } },
  shroom: { name:'독버섯', spr:'shroom', hp:9, atk:1, def:1, sweep:1.7,
    pattern:[{t:'atk',n:1},{t:'poison',v:2},{t:'atk',n:1},{t:'spore'}],
    row:{ d:.62, hard:.3, stat:.4, w:{ atk:1, def:1, heal:1 }, poison:.2 } },
  boss: { name:'탑의 주인', spr:'boss', hp:20, atk:1, def:1, sweep:2.0, boss:true,
    // 세션마다 공격력이 +1씩 오르므로 연속 턴이 길면 후반 한 묶음 피해가 최대 체력을 넘는다(3세션 2페이즈 4×6=24). 턴 수로 묶음 크기를 누른다
    pattern:[{t:'atk',n:3},{t:'summon'}],
    pattern2:[{t:'atk',n:4},{t:'summon'}],
    row:{ d:.62, hard:.35, stat:.35, w:{ atk:1, def:1, heal:1 }, poison:.3 } },
};
// 성벽 밀도·시작 줄 수: 구슬이 튕기는 구조라 틈이 있어야 천장까지 길을 낼 수 있다
const WALL = { dens:0.5, init:3, every:2, hpMul:0.6 };
const SCALE = { hp:0.35, atk:1, def:1, sweep:0.15, sweepMax:2.6, elite:1.5 };
// ── 무한 심연(엔드게임 시험판): 3세션(s=2)까지가 본편, 그 뒤 s=3부터 "심연 1층".
// 층마다 체력이 곱으로(×1.3) 늘어 덧셈 성장만으로는 언젠가 막힌다. 스킬 트리 핵심 노드(곱연산)가 버티는 수단이고,
// 얼마나 깊이 내려갔는지가 랭킹(도달 칸)이 된다. 최종 구조(5세션 + 챕터)는 docs/tasks/02-chapters.md
const ABYSS_FROM = 3, ABYSS = { hp:1.3, atk:1 };
const abyssDepth = s => Math.max(0, s - ABYSS_FROM + 1);
const stageName = s => abyssDepth(s) ? `심연 ${abyssDepth(s)}층` : `세션 ${s + 1}`;
function monCfg(id, s, elite){
  const b = MON[id], dp = abyssDepth(s);
  return Object.assign({}, b, {
    id, elite:!!elite, name:(elite ? '정예 ' : '') + b.name,
    hp: Math.max(3, Math.round(b.hp * WALL.hpMul * (1 + SCALE.hp * s) * (elite ? SCALE.elite : 1) * Math.pow(ABYSS.hp, dp))),
    atk: b.atk + SCALE.atk * s + ABYSS.atk * dp,
    def: b.def + SCALE.def * s + (elite ? 1 : 0),
    sweep: Math.min(SCALE.sweepMax, b.sweep + SCALE.sweep * s + (elite ? 0.1 : 0)),
  });
}

// ── 구슬: 덱에서 한 턴에 하나씩 꺼내 쏜다. 구슬마다 손맛이 달라야 한다
const ORBS = {
  basic: { name:'기본 구슬',   icon:'o_basic', rar:0, desc:'특별한 효과 없음', up:'천장을 한 번 더 칠 수 있다' },
  bomb:  { name:'폭탄 구슬',   icon:'o_bomb',  rar:1, desc:'처음 부순 벽돌의 주변 8칸이 함께 터진다', up:'주변 8칸에 2씩 피해' },
  drill: { name:'송곳 구슬',   icon:'o_drill', rar:1, desc:'어떤 벽돌이든 3개까지 한 번에 뚫는다', up:'어떤 벽돌이든 5개까지 뚫는다' },
  guard: { name:'방패 구슬',   icon:'shield',  rar:1, desc:'벽돌을 부술 때마다 방어도 +1', up:'벽돌을 부술 때마다 방어도 +2' },
  split: { name:'분열 구슬',   icon:'o_split', rar:2, desc:'세 갈래로 갈라져 발사된다', up:'다섯 갈래로 갈라져 발사된다' },
  venom: { name:'독 구슬',     icon:'skull',   rar:2, desc:'천장을 칠 때마다 몬스터에게 독 +1', up:'천장을 칠 때마다 몬스터에게 독 +2' },
  heavy: { name:'묵직한 구슬', icon:'o_heavy', rar:2, desc:'한 방이 무겁다', up:'한 방이 더 무겁다' },
};
// 구슬마다 기본 피해가 있다. 천장 타격 피해 = 구슬 피해 + (공격력 - 1).
// 공격력은 ⚔ 벽돌로 전투 중에만 오르는 덧셈 보너스라, 구슬을 고르는 이유(피해)와 벽돌을 노리는 이유(공격력)가 따로 선다
const ORB_DMG = { basic:1, bomb:1, drill:1, guard:1, split:1, venom:1, heavy:3 };
const ORB_DMG_UP = { heavy:4 };
// 강화 구슬은 덱에 'bomb+'처럼 끝에 +를 붙여 담는다. 숫자를 키우는 대신 구슬 고유 효과를 한 단계 올린다(질적 성장)
const orbKind = o => o.replace('+', '');
const orbUp = o => o.endsWith('+');
const orbName = o => ORBS[orbKind(o)].name + (orbUp(o) ? '+' : '');
const orbDmg = o => orbUp(o) && ORB_DMG_UP[orbKind(o)] ? ORB_DMG_UP[orbKind(o)] : ORB_DMG[orbKind(o)];
const orbDesc = o => `피해 ${orbDmg(o)} · ` + (orbUp(o) ? ORBS[orbKind(o)].up : ORBS[orbKind(o)].desc);
// ── 유물: 원정 내내 유지되는 패시브
const RELICS = {
  combo:    { name:'천장 연타', max:2, desc:'구슬 하나가 천장을 칠 수 있는 횟수 +1 (기본 3회)' },
  counter:  { name:'반격',      max:1, desc:'몬스터 공격을 방어도로 막은 만큼 되돌려준다' },
  antidote: { name:'해독',      max:1, desc:'독 피해를 받을 때마다 독이 2씩 줄어든다' },
  focus:    { name:'집중',      max:2, desc:'조준선이 15% 느려진다' },
  brace:    { name:'지지대',    max:1, desc:'무너지는 벽돌 피해가 1개당 2에서 1로' },
  harvest:  { name:'수확',      max:2, desc:'⚔·🛡 벽돌 효과 +1' },
  medkit:   { name:'구급상자',  max:2, desc:'전투에서 이길 때마다 체력 +2' },
  // 후반 몬스터의 연속 공격에 버틸 수단: 막는(갑옷·인내) 쪽과 버는(흡혈) 쪽을 둘 다 둔다
  armor:    { name:'갑옷',      max:2, desc:'전투를 시작할 때 방어도 +3' },
  leech:    { name:'흡혈',      max:1, desc:'구슬 하나가 천장을 세 번째 칠 때 체력 +1' },
  endure:   { name:'인내',      max:1, desc:'몬스터 연속 공격의 첫 타를 막는다' },
};
// ── 스킬 트리(영구 성장): 원정이 끝날 때 도달 칸만큼 영혼석을 얻어 노드를 찍는다(POE2식 갈래).
// 갈래마다 앞 노드를 찍어야 다음이 열린다. 갈래 끝 핵심 노드(key)만 곱연산이다:
// 원정 안의 성장은 여전히 덧셈·질적 성장이고, 곱연산은 3세션 이후 심연(엔드게임)에서 버티라고 영구 성장에만 둔다
const TREE = [
  { id:'root', name:'원정의 서약',  cost:0, req:null, x:50, y:50, desc:'모든 갈래의 출발점' },
  { id:'a1', name:'날 세우기',  cost:2, req:'root', x:50, y:35, desc:'모든 구슬 피해 +1' },
  { id:'a2', name:'연타',       cost:4, req:'a1',   x:50, y:21, desc:'구슬마다 천장 타격 상한 +1' },
  { id:'a3', name:'파괴자',     cost:8, req:'a2',   x:50, y:7,  key:true, desc:'천장 타격 피해 ×1.5' },
  { id:'d1', name:'단련된 몸',  cost:2, req:'root', x:50, y:65, desc:'최대 체력 +4' },
  { id:'d2', name:'방패술',     cost:4, req:'d1',   x:50, y:79, desc:'전투 시작 방어도 +2' },
  { id:'d3', name:'불굴',       cost:8, req:'d2',   x:50, y:93, key:true, desc:'몬스터·붕괴 피해 ×0.75' },
  { id:'o1', name:'숙련',       cost:2, req:'root', x:30, y:50, desc:'시작 폭탄 구슬이 폭탄 구슬+' },
  { id:'o2', name:'눈썰미',     cost:4, req:'o1',   x:17, y:40, desc:'구슬 보상 후보 +1장' },
  { id:'o3', name:'공명',       cost:8, req:'o2',   x:8,  y:26, key:true, desc:'강화(+) 구슬의 천장 타격 피해 ×2' },
  { id:'e1', name:'두둑한 주머니', cost:2, req:'root', x:70, y:50, desc:'시작 코인 +30' },
  { id:'e2', name:'흥정',       cost:4, req:'e1',   x:83, y:60, desc:'상점 가격 -20%' },
  { id:'e3', name:'보물 사냥꾼', cost:8, req:'e2',  x:92, y:74, key:true, desc:'무작위 유물 하나를 지니고 출발' },
];
const tree = id => !!(META.tree && META.tree[id]);
const rel = id => (RUN && RUN.relics[id]) || 0;
const hitCap = () => 3 + rel('combo') + (tree('a2') ? 1 : 0);
