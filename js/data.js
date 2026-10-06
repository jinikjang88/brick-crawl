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
function monCfg(id, s, elite){
  const b = MON[id];
  return Object.assign({}, b, {
    id, elite:!!elite, name:(elite ? '정예 ' : '') + b.name,
    hp: Math.max(3, Math.round(b.hp * WALL.hpMul * (1 + SCALE.hp * s) * (elite ? SCALE.elite : 1))),
    atk: b.atk + SCALE.atk * s,
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
  heavy: { name:'묵직한 구슬', icon:'o_heavy', rar:2, desc:'천장 타격 피해가 2배', up:'천장 타격 피해가 3배' },
};
// 강화 구슬은 덱에 'bomb+'처럼 끝에 +를 붙여 담는다. 숫자를 키우는 대신 구슬 고유 효과를 한 단계 올린다(질적 성장)
const orbKind = o => o.replace('+', '');
const orbUp = o => o.endsWith('+');
const orbName = o => ORBS[orbKind(o)].name + (orbUp(o) ? '+' : '');
const orbDesc = o => orbUp(o) ? ORBS[orbKind(o)].up : ORBS[orbKind(o)].desc;
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
// ── 출발 선물(메타 성장): 원정마다 도달한 칸 수를 쌓아(META.xp) 해금한다. 새 원정을 시작할 때 하나를 고른다.
// 시작을 조금 편하게 할 뿐 원정 안의 성장 규칙(질적 성장)은 그대로다
const GIFTS = [
  { id:'coins',  need:0,  name:'두둑한 주머니', desc:'코인 +30' },
  { id:'vital',  need:0,  name:'튼튼한 몸',     desc:'최대 체력 +4' },
  { id:'temper', need:8,  name:'벼린 폭탄',     desc:'시작 폭탄 구슬이 폭탄 구슬+로' },
  { id:'pick',   need:20, name:'고른 구슬',     desc:'희귀 구슬 하나를 골라 덱에 넣는다' },
  { id:'relic',  need:40, name:'오래된 유물',   desc:'무작위 유물 하나를 지니고 떠난다' },
];
const rel = id => (RUN && RUN.relics[id]) || 0;
const hitCap = () => 3 + rel('combo');
