// 데이터: 몬스터(MON)·성벽·구슬(ORBS)·유물(RELICS)
'use strict';

// ── 몬스터: 숫자 인플레이션을 막기 위해 세션 상승폭은 작게(체력 +35%, 공·방 +1)
// 공격은 배율 없이 {t:'atk', n}: n턴 연속으로 매 턴 공격력만큼 때린다.
// 배율(×2.5 등)을 두면 화면의 ⚔ 숫자와 실제 피해가 어긋나 읽히지 않아서, 피해는 항상 ⚔ 숫자 그대로다
const MON = {
  slime: { name:'슬라임', spr:'slime', hp:6, atk:1, def:0, sweep:.9,
    pattern:[{t:'atk',n:2},{t:'wait'}],
    row:{ d:.55, hard:0, stat:.5, w:{ atk:1 } } },
  bat: { name:'박쥐', spr:'bat', hp:8, atk:1, def:0, sweep:1.0,
    pattern:[{t:'atk',n:3},{t:'wait'}],
    row:{ d:.6, hard:.2, stat:.4, w:{ atk:1, def:1 } } },
  golem: { name:'골렘', spr:'golem', hp:9, atk:1, def:2, sweep:1.15,
    pattern:[{t:'atk',n:2},{t:'guard',v:2}],
    row:{ d:.6, hard:.25, stat:.4, w:{ atk:2, def:1 } } },
  shroom: { name:'독버섯', spr:'shroom', hp:9, atk:1, def:1, sweep:1.3,
    pattern:[{t:'atk',n:1},{t:'poison',v:2},{t:'atk',n:1},{t:'spore'}],
    row:{ d:.62, hard:.3, stat:.4, w:{ atk:1, def:1, heal:1 }, poison:.2 } },
  boss: { name:'탑의 주인', spr:'boss', hp:20, atk:1, def:1, sweep:1.4, boss:true,
    // 세션마다 공격력이 +1씩 오르므로 연속 턴이 길면 후반 한 묶음 피해가 최대 체력을 넘는다(3세션 2페이즈 4×6=24). 턴 수로 묶음 크기를 누른다
    pattern:[{t:'atk',n:3},{t:'summon'}],
    pattern2:[{t:'atk',n:4},{t:'summon'}],
    row:{ d:.62, hard:.35, stat:.35, w:{ atk:1, def:1, heal:1 }, poison:.3 } },
  // 세션 5 최종 보스: 같은 그림에 붉은 테. 3페이즈(체력 2/3·1/3)마다 공격이 길어지고 조준선이 빨라진다
  lord: { name:'탑의 군주', spr:'boss', hp:24, atk:1, def:1, sweep:1.4, boss:true, final:true,
    pattern:[{t:'atk',n:2},{t:'summon'},{t:'guard',v:3}],
    pattern2:[{t:'atk',n:3},{t:'summon'}],
    pattern3:[{t:'atk',n:3},{t:'poison',v:2},{t:'summon'}],
    row:{ d:.64, hard:.4, stat:.35, w:{ atk:1, def:1, heal:1 }, poison:.3 } },
};
// 성벽 밀도·시작 줄 수: 구슬이 튕기는 구조라 틈이 있어야 천장까지 길을 낼 수 있다
const WALL = { dens:0.5, init:3, every:2, hpMul:0.6 };
const SCALE = { hp:0.35, atk:1, def:1, sweep:0.1, sweepMax:2.0, elite:1.5 };
// 조준선 가속: 정예는 체력 절반 이하에서, 보스는 페이즈가 오를 때마다 빨라진다(기본 속도를 낮춘 대신 결정적인 순간에 긴장을 준다)
const ENRAGE = { elite:1.35, phase:0.3 };
// ── 원정 = 세션 5개. 세션 5(s=4) 보스가 최종 보스이고, 깨면 원정이 끝난다
const FINAL_S = 4, SESSIONS = FINAL_S + 1;
// ── 심연(엔드게임): 본편을 한 번 깨면 메인에서 따로 들어가는 끝없는 원정. RUN.abyss로 구분한다.
// 층(s)마다 체력이 곱으로 늘어 덧셈 성장만으로는 언젠가 막힌다. 스킬 트리 핵심 노드(곱연산)가 버티는 수단이다.
// base: 심연 1층 몬스터를 본편 몇 세션 세기로 시작할지(새 덱으로 들어가므로 본편 끝보다 낮게 둔다)
const ABYSS = { base:1, hp:1.25, atk:1 };
const isAbyss = () => !!(RUN && RUN.abyss);
const stageName = (s, abyss = isAbyss()) => abyss ? `심연 ${s + 1}층` : `세션 ${s + 1}`;
function monCfg(id, s, elite, abyss){
  const b = MON[id], dp = abyss ? s + 1 : 0, lv = abyss ? s + ABYSS.base : s;
  return Object.assign({}, b, {
    id, elite:!!elite, name:(abyss ? '심연의 ' : '') + (elite ? '정예 ' : '') + b.name,
    hp: Math.max(3, Math.round(b.hp * WALL.hpMul * (1 + SCALE.hp * lv) * (elite ? SCALE.elite : 1) * Math.pow(ABYSS.hp, dp))),
    atk: b.atk + SCALE.atk * lv + ABYSS.atk * dp,
    def: b.def + SCALE.def * lv + (elite ? 1 : 0),
    sweep: Math.min(SCALE.sweepMax, b.sweep + SCALE.sweep * lv + (elite ? 0.1 : 0)),
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
// 천장 타격 피해 = 기사 공격력(⚔) + 구슬 보정. 공격력은 1에서 시작해 ⚔ 벽돌로 전투 중에만 오르고,
// 구슬 보정은 구슬마다 고정이다. 두 숫자를 더한 값이 피해라서 "⚔을 올릴지, 센 구슬을 쓸지"가 한 식으로 이어진다
const ORB_BONUS = { basic:0, bomb:0, drill:0, guard:0, split:0, venom:0, heavy:2 };
const ORB_BONUS_UP = { heavy:3 };
// 덱 상한: 구슬은 최대 5개. 가득 차면 새 구슬은 가진 구슬과 바꿔야 한다(덱이 무한히 커지는 조합을 막는다)
const DECK_MAX = 5;
// 강화 구슬은 덱에 'bomb+'처럼 끝에 +를 붙여 담는다. 숫자를 키우는 대신 구슬 고유 효과를 한 단계 올린다(질적 성장)
const orbKind = o => o.replace('+', '');
const orbUp = o => o.endsWith('+');
const orbName = o => ORBS[orbKind(o)].name + (orbUp(o) ? '+' : '');
const orbBonus = o => orbUp(o) && ORB_BONUS_UP[orbKind(o)] !== undefined ? ORB_BONUS_UP[orbKind(o)] : ORB_BONUS[orbKind(o)];
const orbDesc = o => (orbBonus(o) ? `피해 ⚔+${orbBonus(o)} · ` : '') + (orbUp(o) ? ORBS[orbKind(o)].up : ORBS[orbKind(o)].desc);
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
// ── 스킬 트리(영구 성장): 칸을 처음 돌파할 때 포인트를 얻어 노드를 찍는다(POE2식 갈래).
// 포인트: 칸 최초 돌파 +1, 세션 보스 최초 돌파 +3 → 본편 전부 35점. 트리 전체는 108점이라 본편만으로는 1/3 정도만 찍힌다.
// 남은 노드는 심연을 내려가며(심연 칸도 최초 돌파마다 같은 규칙) 채운다.
// 갈래마다 줄기 2개 → 두 가지(prong)로 갈라지고, 가지 끝 핵심 노드(key)만 곱연산이다:
// 원정 안의 성장은 여전히 덧셈·질적 성장이고, 곱연산은 심연(엔드게임)에서 버티라고 영구 성장에만 둔다
const PTS = { cell:1, boss:3 };
const TREE = [
  { id:'root', name:'원정의 서약', cost:0, req:null, x:50, y:50, desc:'모든 갈래의 출발점' },
  // 공격(위)
  { id:'a1', name:'날 세우기',  cost:2, req:'root', x:50, y:36, desc:'기사의 기본 공격력 +1 (모든 천장 타격 피해 +1)' },
  { id:'a2', name:'연타',       cost:3, req:'a1',   x:50, y:21, desc:'구슬마다 천장 타격 상한 +1' },
  { id:'a3', name:'전투 함성',  cost:3, req:'a2',   x:36, y:7,  desc:'⚔ 벽돌의 공격력 +1 추가' },
  { id:'a4', name:'처형자',     cost:8, req:'a3',   x:21, y:7,  key:true, desc:'체력이 절반 이하인 몬스터에게 천장 타격 피해 ×1.5' },
  { id:'a5', name:'연쇄',       cost:3, req:'a2',   x:64, y:7,  desc:'같은 구슬의 세 번째 천장 타격부터 피해 +1' },
  { id:'a6', name:'파괴자',     cost:8, req:'a5',   x:79, y:7,  key:true, desc:'모든 천장 타격 피해 ×1.5' },
  // 방어(아래)
  { id:'d1', name:'단련된 몸',  cost:2, req:'root', x:50, y:64, desc:'최대 체력 +4' },
  { id:'d2', name:'방패술',     cost:3, req:'d1',   x:50, y:79, desc:'전투 시작 방어도 +2' },
  { id:'d3', name:'재생',       cost:3, req:'d2',   x:36, y:93, desc:'전투에서 이길 때마다 체력 +2' },
  { id:'d4', name:'불굴',       cost:8, req:'d3',   x:21, y:93, key:true, desc:'몬스터·붕괴 피해 ×0.75' },
  { id:'d5', name:'단단한 벽',  cost:3, req:'d2',   x:64, y:93, desc:'🛡 벽돌의 방어도 +1 추가' },
  { id:'d6', name:'철벽',       cost:8, req:'d5',   x:79, y:93, key:true, desc:'전투 중 얻는 방어도 ×1.5' },
  // 구슬(왼쪽)
  { id:'o1', name:'숙련',       cost:2, req:'root', x:36, y:50, desc:'시작 폭탄 구슬이 폭탄 구슬+' },
  { id:'o2', name:'눈썰미',     cost:3, req:'o1',   x:21, y:50, desc:'구슬 보상 후보 +1장' },
  { id:'o3', name:'재도전',     cost:3, req:'o2',   x:7,  y:36, desc:'보상 다시 뽑기 +1회' },
  { id:'o4', name:'공명',       cost:8, req:'o3',   x:7,  y:21, key:true, desc:'강화(+) 구슬의 천장 타격 피해 ×2' },
  { id:'o5', name:'정조준',     cost:3, req:'o2',   x:7,  y:64, desc:'조준선이 15% 느려진다' },
  { id:'o6', name:'대구경',     cost:8, req:'o5',   x:7,  y:79, key:true, desc:'묵직한·폭탄 구슬의 천장 타격 피해 ×2' },
  // 경제(오른쪽)
  { id:'e1', name:'두둑한 주머니', cost:2, req:'root', x:64, y:50, desc:'시작 코인 +30' },
  { id:'e2', name:'흥정',       cost:3, req:'e1',   x:79, y:50, desc:'상점 가격 -20%' },
  { id:'e3', name:'전리품',     cost:3, req:'e2',   x:93, y:36, desc:'전투 승리 코인 +5' },
  { id:'e4', name:'보물 사냥꾼', cost:8, req:'e3',  x:93, y:21, key:true, desc:'무작위 유물 하나를 지니고 출발' },
  { id:'e5', name:'약초학',     cost:3, req:'e2',   x:93, y:64, desc:'휴식·약초 회복 +5' },
  { id:'e6', name:'불사조',     cost:8, req:'e5',   x:93, y:79, key:true, desc:'원정마다 한 번, 쓰러지면 체력 30%로 일어난다' },
];
const tree = id => !!(META.tree && META.tree[id]);
const rel = id => (RUN && RUN.relics[id]) || 0;
const hitCap = () => 3 + rel('combo') + (tree('a2') ? 1 : 0);

// ── 배지: 한 번 따면 영구히 남는 업적. 같은 배지를 다시 따면 횟수만 오른다(모으는 재미 + 자랑거리).
// icon은 ICON(7×7 도트) 이름. 조건은 battle.js·screens.js에서 earnBadge(id)로 건다
const BADGES = [
  { id:'oneshot',  name:'일격',       icon:'sword',   desc:'체력이 가득 찬 몬스터를 천장 타격 한 번으로 쓰러뜨린다' },
  { id:'triple',   name:'삼연타',     icon:'o_split', desc:'구슬 하나가 천장을 딱 세 번 쳐서 가득 찬 체력을 모두 깎는다' },
  { id:'final',    name:'탑의 정복자', icon:'up',      desc:'세션 5의 최종 보스를 쓰러뜨린다' },
  { id:'flawless', name:'무결',       icon:'shield',  desc:'체력을 하나도 잃지 않고 보스를 쓰러뜨린다' },
  { id:'swift',    name:'속전속결',   icon:'o_drill', desc:'보스를 3턴 안에 쓰러뜨린다' },
  { id:'demolish', name:'철거반',     icon:'brick',   desc:'한 번 발사로 벽돌 12개를 부순다' },
  { id:'venom',    name:'독살',       icon:'skull',   desc:'독으로 몬스터의 마지막 체력을 깎는다' },
  { id:'counter',  name:'되갚기',     icon:'o_bomb',  desc:'반격으로 몬스터를 쓰러뜨린다' },
  { id:'light',    name:'가벼운 짐',  icon:'o_basic', desc:'구슬 3개 이하의 덱으로 최종 보스를 쓰러뜨린다' },
  { id:'abyss5',   name:'심연의 바닥', icon:'o_heavy', desc:'심연 5층 보스를 쓰러뜨린다' },
  { id:'rich',     name:'큰손',       icon:'coin',    desc:'한 원정에서 코인 200개를 모은다' },
];
