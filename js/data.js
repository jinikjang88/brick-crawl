// 데이터: 몬스터(MON)·성벽·구슬(ORBS)·유물(RELICS)
'use strict';

// ── 몬스터: 숫자 인플레이션을 막기 위해 세션 상승폭은 작게(체력 +35%, 공·방 +1)
// 공격은 배율 없이 {t:'atk', n}: n턴 연속으로 매 턴 공격력만큼 때린다.
// 배율(×2.5 등)을 두면 화면의 ⚔ 숫자와 실제 피해가 어긋나 읽히지 않아서, 피해는 항상 ⚔ 숫자 그대로다
const MON = {
  slime: { name:'메모리 누수', spr:'slime', hp:6, atk:1, def:0, sweep:.9,
    pattern:[{t:'atk',n:2},{t:'wait'}],
    row:{ d:.55, hard:0, stat:.5, w:{ atk:1 } } },
  bat: { name:'스팸봇', spr:'bat', hp:8, atk:1, def:0, sweep:1.0,
    pattern:[{t:'atk',n:3},{t:'wait'}],
    row:{ d:.6, hard:.2, stat:.4, w:{ atk:1, def:1 } } },
  golem: { name:'방화벽', spr:'golem', hp:9, atk:1, def:2, sweep:1.15,
    pattern:[{t:'atk',n:2},{t:'guard',v:2}],
    row:{ d:.6, hard:.25, stat:.4, w:{ atk:2, def:1 } } },
  shroom: { name:'바이러스', spr:'shroom', hp:9, atk:1, def:1, sweep:1.3,
    // 독 행동의 v를 비워 두면 독 양 = 몬스터 ⚔ 공격력: 머리 위 숫자 그대로 독이 쌓이고, 층이 깊어질수록 함께 세진다
    pattern:[{t:'atk',n:2},{t:'poison'},{t:'atk',n:2},{t:'spore'}],
    row:{ d:.62, hard:.3, stat:.4, w:{ atk:1, def:1, heal:1 }, poison:.2 } },
  // 체력 20 → 14(2026-10-07): 일반 전투 구슬 보상을 없애 1층 보스 전 덱이 얇아졌다. 시뮬레이터 300회 1층 돌파 18% → 32%
  boss: { name:'문지기 데몬', spr:'boss', hp:14, atk:1, def:1, sweep:1.4, boss:true,
    // 세션마다 공격력이 +1씩 오르므로 연속 턴이 길면 후반 한 묶음 피해가 최대 체력을 넘는다(3세션 2페이즈 4×6=24). 턴 수로 묶음 크기를 누른다
    pattern:[{t:'atk',n:3},{t:'summon'}],
    pattern2:[{t:'atk',n:4},{t:'summon'}],
    row:{ d:.62, hard:.35, stat:.35, w:{ atk:1, def:1, heal:1 }, poison:.3 } },
  // 세션 5 최종 보스: 같은 그림에 붉은 테. 3페이즈(체력 2/3·1/3)마다 공격이 길어지고 조준선이 빨라진다
  lord: { name:'관리자 프로세스', spr:'boss', hp:24, atk:1, def:1, sweep:1.4, boss:true, final:true,
    pattern:[{t:'atk',n:2},{t:'summon'},{t:'guard',v:3}],
    pattern2:[{t:'atk',n:3},{t:'summon'}],
    pattern3:[{t:'atk',n:3},{t:'poison',v:2},{t:'summon'}],
    row:{ d:.64, hard:.4, stat:.35, w:{ atk:1, def:1, heal:1 }, poison:.3 } },
  // 근원(고난 6): 탑의 군주를 쓰러뜨린 바로 다음, 같은 체력으로 이어 싸운다. 숫자가 아니라 천장 봉인(seal)으로 핵심 규칙을 비튼다
  // seal = 1페이즈 봉인 칸 수. 2페이즈부터 봉인이 매 턴 옆으로 옮기고, 3페이즈에 한 칸 늘어난다
  king: { name:'화요일의 알고리즘', spr:'boss', hp:30, atk:1, def:1, sweep:1.4, boss:true, final:true, king:true, seal:2,
    pattern:[{t:'atk',n:2},{t:'summon'},{t:'guard',v:2}],
    pattern2:[{t:'atk',n:2},{t:'spore'},{t:'summon'}],
    pattern3:[{t:'atk',n:3},{t:'summon'}],
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
// 탑을 오르는 원정이라 본편 단위는 "층", 층 안의 칸은 "방"이라 부른다(코드의 s·r은 그대로)
const stageName = (s, abyss = isAbyss()) => abyss ? `심층부 ${s + 1}층` : `${s + 1}층`;
function monCfg(id, s, elite, abyss){
  const b = MON[id], dp = abyss ? s + 1 : 0, lv = abyss ? s + ABYSS.base : s;
  return Object.assign({}, b, {
    id, elite:!!elite, name:(abyss ? '심층부 ' : '') + (elite ? '정예 ' : '') + b.name,
    hp: Math.max(3, Math.round(b.hp * WALL.hpMul * (1 + SCALE.hp * lv) * (elite ? SCALE.elite : 1) * Math.pow(ABYSS.hp, dp))),
    atk: b.atk + SCALE.atk * lv + ABYSS.atk * dp,
    def: b.def + SCALE.def * lv + (elite ? 1 : 0),
    sweep: Math.min(SCALE.sweepMax, b.sweep + SCALE.sweep * lv + (elite ? 0.1 : 0)),
  });
}

// ── 등급: 구슬·유물 공통. 가중치가 등장 확률이고, 상점 값도 등급으로 정한다.
// 희귀부터 붉은 테(UI 규칙: 붉은색 = 희귀 등급). 0 = 기본(시작 덱 전용, 보상에 나오지 않음)
const RARITY = [
  { name:'기본', w:0 },
  { name:'일반', w:60, orb:18, relic:35 },
  { name:'고급', w:28, orb:26, relic:50 },
  { name:'희귀', w:10, orb:38, relic:70 },
  { name:'전설', w:2,  orb:55, relic:95 },
];
// ── 구슬: 덱에서 한 턴에 하나씩 꺼내 쏜다. 구슬마다 손맛이 달라야 한다
// rar = 등급(RARITY). lock = 해금 조건(배지 id 또는 심연 칸): 메타에 영구로 풀리고, 풀리기 전에는 보상·상점에 나오지 않는다
// 디버프 구슬(약화·무장해제·포맷·기절·시간)은 몬스터를 직접 약하게 한다: 깎는 대신 막는 길도 덱으로 고를 수 있게
const ORBS = {
  basic:  { name:'기본 구슬',     rar:0, desc:'특별한 효과 없음', up:'천장을 한 번 더 칠 수 있다' },
  bomb:   { name:'폭탄 구슬',     rar:1, desc:'처음 부순 벽돌의 주변 8칸이 함께 터진다', up:'주변 8칸에 2씩 피해' },
  drill:  { name:'송곳 구슬',     rar:1, desc:'어떤 벽돌이든 3개까지 한 번에 뚫는다', up:'어떤 벽돌이든 5개까지 뚫는다' },
  guard:  { name:'실드 구슬',     rar:1, desc:'벽돌을 부술 때마다 방어도 +1', up:'벽돌을 부술 때마다 방어도 +2' },
  bounce: { name:'탄력 구슬',     rar:1, desc:'이 구슬은 천장을 한 번 더 칠 수 있다', up:'이 구슬은 천장을 두 번 더 칠 수 있다' },
  herb:   { name:'패치 구슬',     rar:1, desc:'처음 천장을 칠 때 체력 +1', up:'처음 천장을 칠 때 체력 +2' },
  thorn:  { name:'가시 구슬',     rar:1, desc:'벽돌 2개를 부술 때마다 버그에게 피해 1', up:'벽돌을 부술 때마다 버그에게 피해 1' },
  weaken: { name:'약화 구슬',     rar:2, desc:'천장을 치면 버그의 남은 연속 공격 -1 (발사마다 1번, 최소 1)', up:'남은 연속 공격 -1을 발사마다 2번까지' },
  disarm: { name:'무장해제 구슬', rar:2, desc:'천장을 치면 이번 전투 버그 ⚔ -1 (전투마다 3번, 최소 1)', up:'버그 ⚔ -1을 전투마다 4번까지' },
  rust:   { name:'포맷 구슬',     rar:2, desc:'천장을 치면 버그 방어도가 0이 된다', up:'방어도를 0으로 + 버그의 다음 수비 행동이 헛돈다' },
  magnet: { name:'자석 구슬',     rar:2, desc:'바닥에 닿으면 한 번 다시 튀어 오른다', up:'바닥에서 두 번 다시 튀어 오른다' },
  hammer: { name:'망치 구슬',     rar:2, desc:'돌 벽돌에 피해 3', up:'돌 벽돌에 피해 5' },
  split:  { name:'분열 구슬',     rar:3, desc:'세 갈래로 갈라져 발사된다(갈래 피해 ÷3)', up:'다섯 갈래로 갈라져 발사된다(갈래 피해 ÷5)' },
  venom:  { name:'독 구슬',       rar:3, desc:'천장을 칠 때마다 버그에게 독 +1', up:'천장을 칠 때마다 버그에게 독 +2' },
  heavy:  { name:'묵직한 구슬',   rar:3, desc:'한 방이 무겁다', up:'한 방이 더 무겁다' },
  chain:  { name:'사슬 구슬',     rar:3, desc:'같은 구슬의 천장 타격마다 피해 +1씩 쌓인다', up:'천장 타격마다 피해 +2씩 쌓인다' },
  stun:   { name:'기절 구슬',     rar:3, desc:'천장을 2번 치면 버그가 다음 행동을 건너뛴다(전투마다 1번)', up:'천장을 1번만 쳐도 기절(전투마다 1번)' },
  vamp:   { name:'흡혈 구슬',     rar:3, desc:'천장을 2번 칠 때마다 체력 +1', up:'천장을 칠 때마다 체력 +1' },
  toxin:  { name:'맹독 구슬',     rar:3, lock:{ badge:'venom' },    desc:'천장을 칠 때마다 독 +1, 이번 전투 버그 독이 줄지 않는다', up:'독 +2, 버그 독이 줄지 않는다' },
  mirror: { name:'거울 구슬',     rar:3, lock:{ badge:'counter' },  desc:'쏜 턴에 버그 공격 피해의 절반(올림)을 되돌린다', up:'쏜 턴에 버그 공격 피해를 그대로 되돌린다' },
  wreck:  { name:'철거 구슬',     rar:3, lock:{ badge:'demolish' }, desc:'천장 타격 피해 + 이 구슬이 부순 벽돌 수 ÷ 3', up:'천장 타격 피해 + 부순 벽돌 수 ÷ 2' },
  comet:  { name:'혜성 구슬',     rar:4, lock:{ badge:'oneshot' },  desc:'모든 벽돌을 뚫고 천장을 한 번만 친다', up:'모든 벽돌을 뚫고, 더 무겁다' },
  time:   { name:'시간 구슬',     rar:4, lock:{ abyss:15 },         desc:'천장을 치면 버그 행동이 처음으로 돌아가고 연속 공격 -2 (전투마다 1번)', up:'처음으로 되돌리기를 전투마다 2번' },
  crown:  { name:'관리자 구슬',   rar:4, lock:{ badge:'rich' },     desc:'추가 피해 = 가진 크레딧 ÷ 25', up:'추가 피해 = 가진 크레딧 ÷ 15' },
};
// 해금 조건 문구(도감·잠긴 카드에 보여 줘 목표가 되게 한다)
const lockText = l => l.badge ? `"${BADGES.find(b => b.id === l.badge).name}" 트로피를 받으면 풀린다` : `심층부 ${Math.ceil(l.abyss / 5)}층 보스를 쓰러뜨리면 풀린다`;
const orbOpen = k => { const l = ORBS[k].lock; return !l || (l.badge ? !!(META.badges && META.badges[l.badge]) : (META.abyssBest || 0) >= l.abyss); };
// 천장 타격 피해 = 기사 공격력(⚔) + 구슬 보정. 공격력은 1에서 시작해 ⚔ 벽돌로 전투 중에만 오르고,
// 구슬 보정은 구슬마다 고정이다. 두 숫자를 더한 값이 피해라서 "⚔을 올릴지, 센 구슬을 쓸지"가 한 식으로 이어진다
const ORB_BONUS = { heavy:2, comet:4 };
const ORB_BONUS_UP = { heavy:3, comet:6 };
// 덱 상한: 구슬은 최대 5개(깊은 주머니 유물 +1). 가득 차면 새 구슬은 가진 구슬과 바꿔야 한다(덱이 무한히 커지는 조합을 막는다)
const DECK_MAX = 5;
const deckMax = () => DECK_MAX + (rel('pouch') ? 1 : 0);
// 강화는 +1~+5 다회. +1은 고유 효과가 한 단계 오르고(up), +2부터는 단계마다 피해 보정 +1.
// 저장 형식: 'bomb+'(=+1, 예전 저장과 같다), 'bomb+2' … 'bomb+5'
const orbKind = o => o.replace(/\+\d*$/, '');
const orbLv = o => { const m = /\+(\d*)$/.exec(o); return m ? (+m[1] || 1) : 0; };
const orbUp = o => orbLv(o) > 0;
const orbAt = (kind, lv) => lv > 0 ? kind + '+' + (lv > 1 ? lv : '') : kind;
const orbName = o => ORBS[orbKind(o)].name + (orbUp(o) ? '+' + orbLv(o) : '');
function orbBonus(o){
  const k = orbKind(o), up = orbUp(o);
  // 왕관: 코인이 곧 힘이다. 상점에서 쓸지, 쥐고 싸울지 고르게 한다
  const base = k === 'crown' ? Math.floor(((RUN && RUN.coins) || 0) / (up ? 15 : 25))
    : (up && ORB_BONUS_UP[k] !== undefined ? ORB_BONUS_UP[k] : ORB_BONUS[k] || 0);
  return base + Math.max(0, orbLv(o) - 1);
}
// 강화 성공률(%): 지금 단계 → 다음 단계. 높을수록 어렵고, +3 이상에서 실패하면 한 단계 내려간다(긴장감)
const UP_MAX = 5, UP_RATE = [90, 70, 50, 35, 20], UP_DROP_FROM = 3;
const upRate = lv => Math.min(100, UP_RATE[lv] + (rel('smith') ? 10 : 0));
// 분열 구슬은 갈래 수만큼 피해를 나눈다(최소 1): 갈래마다 전체 피해가 들어가면 강화 5갈래가 5배가 된다.
// 대신 넓게 부숴 길을 여는 "청소용" 구슬이 된다(거인의 손 유물이 있으면 나누지 않는다)
const splitN = o => orbKind(o) !== 'split' ? 1 : orbUp(o) ? 5 : 3;
const splitWays = o => rel('giant') ? 1 : splitN(o);
const orbDesc = o => (orbBonus(o) ? `피해 ⚔+${orbBonus(o)} · ` : '') + (orbUp(o) ? ORBS[orbKind(o)].up : ORBS[orbKind(o)].desc);
// ── 유물: 원정 내내 유지되는 패시브. t = 등급(RARITY)
// 원정 안의 보상에는 곱연산을 두지 않는다(곱은 스킬 트리 핵심 노드만): 효과는 덧셈이거나 규칙을 바꾸는 것
const RELICS = {
  // 일반
  whetstone:{ t:1, name:'오버클럭',   max:1, desc:'전투를 시작할 때 ⚔ +1' },
  buckler:  { t:1, name:'보호 필름',  max:1, desc:'첫 버그 턴 직전에 방어도 +3' },
  wallet:   { t:1, name:'대용량 지갑', max:1, desc:'전투에서 이길 때마다 크레딧 +3' },
  bandage:  { t:1, name:'핫픽스',     max:1, desc:'충전 회복 +3' },
  luckycoin:{ t:1, name:'난수 시드',  max:1, desc:'브로커 가격 -10%' },
  callus:   { t:1, name:'내구 코팅',  max:1, desc:'전투마다 첫 오버플로 피해를 받지 않는다' },
  mason:    { t:1, name:'블록 빌더',  max:1, desc:'⚔·🛡 같은 특수 벽돌이 더 자주 나온다' },
  lantern:  { t:1, name:'디버그 로그', max:1, desc:'정예를 이기면 크레딧 +10' },
  medkit:   { t:1, name:'복구 키트',   max:2, desc:'전투에서 이길 때마다 체력 +2' },
  focus:    { t:1, name:'포커스 모드', max:2, desc:'조준선이 15% 느려진다' },
  // 고급
  combo:    { t:2, name:'콤보 카운터', max:2, desc:'구슬 하나가 천장을 칠 수 있는 횟수 +1 (기본 3회)' },
  harvest:  { t:2, name:'채굴기',     max:2, desc:'⚔·🛡 벽돌 효과 +1' },
  // 후반 몬스터의 연속 공격에 버틸 수단: 막는(갑옷·인내) 쪽과 버는(흡혈) 쪽을 둘 다 둔다
  armor:    { t:2, name:'하드 케이스', max:2, desc:'전투를 시작할 때 방어도 +3' },
  brace:    { t:2, name:'완충 버퍼',  max:1, desc:'오버플로 피해가 벽돌 1개당 2에서 1로' },
  antidote: { t:2, name:'백신',       max:1, desc:'독 피해를 받을 때마다 독이 2씩 줄어든다' },
  rebound:  { t:2, name:'리바운드',   max:1, desc:'구슬이 바닥에 닿을 때 25% 확률로 한 번 다시 튀어 오른다' },
  sting:    { t:2, name:'악성 코드',  max:1, desc:'버그에게 독을 걸 때마다 +1' },
  thorns:   { t:2, name:'역추적',     max:1, desc:'버그에게 맞을 때마다 버그에게 피해 1' },
  breath:   { t:2, name:'쿨다운',     max:1, desc:'버그가 쉬는 턴에 체력 +2' },
  scout:    { t:2, name:'스캐너',     max:1, desc:'지도에서 전투 구역의 버그가 보인다' },
  // 희귀
  counter:  { t:3, name:'카운터 스크립트', max:1, desc:'버그 공격을 방어도로 막은 양의 절반(올림)을 되돌려준다' },
  leech:    { t:3, name:'전력 흡수',  max:1, desc:'구슬 하나가 천장을 세 번째 칠 때 체력 +1' },
  endure:   { t:3, name:'무정전 전원', max:1, desc:'버그 연속 공격의 첫 타를 막는다' },
  wrath:    { t:3, name:'과부하',     max:1, desc:'체력이 30% 이하일 때 천장 타격 피해 +2' },
  heart:    { t:3, name:'백업 전원',  max:1, desc:'전투마다 한 번, 쓰러질 피해를 받아도 체력 1로 버틴다' },
  alchemy:  { t:3, name:'컴파일러',   max:1, desc:'이기면 버그에게 남아 있던 독만큼 크레딧' },
  twin:     { t:3, name:'미러링',       max:1, desc:'3턴마다 같은 구슬을 한 번 더 쏜다' },
  smith:    { t:3, name:'리팩터링 툴', max:1, desc:'구슬 강화 성공률 +10%p' },
  charm:    { t:3, name:'체크섬',     max:1, desc:'구슬 강화에 실패해도 단계가 내려가지 않는다' },
  pouch:    { t:3, name:'확장 슬롯',  max:1, desc:'큐 +1개 (6개)' },
  // 전설
  kingsword:{ t:4, name:'루트 키',    max:1, desc:'⚔ 벽돌 효과 +2' },
  hourglass:{ t:4, name:'타이머',     max:1, desc:'버그의 모든 연속 공격 -1 (최소 1)' },
  ring:     { t:4, name:'영구 라이선스', max:1, desc:'접속마다 한 번, 쓰러지면 체력 50%로 일어난다' },
  crusher:  { t:4, name:'벽 해체기',  max:1, desc:'버그 턴마다 가장 아래 벽돌 하나를 부순다' },
  plague:   { t:4, name:'웜',         max:1, desc:'버그 독이 방어도도 깎고, 줄어들지 않는다' },
  giant:    { t:4, name:'대형 매크로', max:1, desc:'분열 구슬이 피해를 나누지 않는다' },
  warp:     { t:4, name:'타임 워프',  max:1, desc:'매 턴 조준선이 처음 0.5초 동안 멈춰 있다' },
  greed:    { t:4, name:'채굴 중독',  max:1, desc:'전투에서 이길 때마다 크레딧 +12, 브로커 가격 +15' },
  pact:     { t:4, name:'위험한 약관', max:1, desc:'얻는 즉시 최대 체력 -8, 천장 타격 피해 +1' },
  collector:{ t:4, name:'크롤러',     max:1, desc:'아카이브에 모은 구슬 5종마다 전투 시작 ⚔ +1' },
};
// ── 스킬 트리(영구 성장): 칸을 처음 돌파할 때 포인트를 얻어 노드를 찍는다(POE2식 갈래).
// 포인트: 칸 최초 돌파 +1, 세션 보스 최초 돌파 +3 → 본편 전부 35점. 트리 전체는 108점이라 본편만으로는 1/3 정도만 찍힌다.
// 남은 노드는 심연을 내려가며(심연 칸도 최초 돌파마다 같은 규칙) 채운다.
// 갈래마다 줄기 2개 → 두 가지(prong)로 갈라지고, 가지 끝 핵심 노드(key)만 곱연산이다:
// 원정 안의 성장은 여전히 덧셈·질적 성장이고, 곱연산은 심연(엔드게임)에서 버티라고 영구 성장에만 둔다
const PTS = { cell:1, boss:3 };
const TREE = [
  { id:'root', name:'부팅', cost:0, req:null, x:50, y:50, desc:'모든 갈래의 출발점' },
  // 공격(위)
  { id:'a1', name:'최적화',     cost:2, req:'root', x:50, y:35.7, desc:'디버거의 기본 공격력 +1 (모든 천장 타격 피해 +1)' },
  { id:'a2', name:'멀티스레드', cost:3, req:'a1',   x:50, y:21.3, desc:'구슬마다 천장 타격 상한 +1' },
  { id:'a3', name:'부스트',     cost:3, req:'a2',   x:35.7, y:7,  desc:'⚔ 벽돌의 공격력 +1 추가' },
  { id:'a4', name:'킬 스위치',  cost:8, req:'a3',   x:21.3, y:7,  key:true, desc:'체력이 절반 이하인 버그에게 천장 타격 피해 ×1.5' },
  { id:'a5', name:'파이프라인', cost:3, req:'a2',   x:64.3, y:7,  desc:'같은 구슬의 세 번째 천장 타격부터 피해 +1' },
  { id:'a6', name:'포크 폭탄',  cost:8, req:'a5',   x:78.7, y:7,  key:true, desc:'모든 천장 타격 피해 ×1.5' },
  // 방어(아래)
  { id:'d1', name:'메모리 증설', cost:2, req:'root', x:50, y:64.3, desc:'최대 체력 +4' },
  { id:'d2', name:'방화벽 규칙', cost:3, req:'d1',   x:50, y:78.7, desc:'전투 시작 방어도 +2' },
  { id:'d3', name:'자동 복구',  cost:3, req:'d2',   x:35.7, y:93, desc:'전투에서 이길 때마다 체력 +2' },
  { id:'d4', name:'예외 처리',  cost:8, req:'d3',   x:21.3, y:93, key:true, desc:'버그·오버플로 피해 ×0.75' },
  { id:'d5', name:'이중화',     cost:3, req:'d2',   x:64.3, y:93, desc:'🛡 벽돌의 방어도 +1 추가' },
  { id:'d6', name:'제로 트러스트', cost:8, req:'d5',   x:78.7, y:93, key:true, desc:'전투 중 얻는 방어도 ×1.5' },
  // 구슬(왼쪽)
  { id:'o1', name:'컴파일 숙련', cost:2, req:'root', x:35.7, y:50, desc:'시작 폭탄 구슬이 폭탄 구슬+' },
  { id:'o2', name:'프로파일러', cost:3, req:'o1',   x:21.3, y:50, desc:'구슬 보상 후보 +1개' },
  { id:'o3', name:'재시도 로직', cost:3, req:'o2',   x:7,  y:35.7, desc:'보상 다시 스캔하기 +1회' },
  { id:'o4', name:'동기화',     cost:8, req:'o3',   x:7,  y:21.3, key:true, desc:'강화(+) 구슬의 천장 타격 피해 ×2' },
  { id:'o5', name:'정밀 연산',  cost:3, req:'o2',   x:7,  y:64.3, desc:'조준선이 15% 느려진다' },
  { id:'o6', name:'대역폭',     cost:8, req:'o5',   x:7,  y:78.7, key:true, desc:'묵직한·폭탄 구슬의 천장 타격 피해 ×2' },
  // 경제(오른쪽, 화면 이름은 자원)
  { id:'e1', name:'초기 자본', cost:2, req:'root', x:64.3, y:50, desc:'시작 크레딧 +30' },
  { id:'e2', name:'협상 봇',    cost:3, req:'e1',   x:78.7, y:50, desc:'브로커 가격 -20%' },
  { id:'e3', name:'데이터 수집', cost:3, req:'e2',   x:93, y:35.7, desc:'전투 승리 크레딧 +5' },
  { id:'e4', name:'버그 바운티', cost:8, req:'e3',  x:93, y:21.3, key:true, desc:'무작위 칩 하나를 지니고 출발' },
  { id:'e5', name:'패치 노트',  cost:3, req:'e2',   x:93, y:64.3, desc:'충전소·패치 구슬 회복 +5' },
  { id:'e6', name:'재부팅',     cost:8, req:'e5',   x:93, y:78.7, key:true, desc:'접속마다 한 번, 쓰러지면 체력 30%로 일어난다' },
];
const tree = id => !!(META.tree && META.tree[id]);
const rel = id => (RUN && RUN.relics[id]) || 0;
const hitCap = () => 3 + rel('combo') + (tree('a2') ? 1 : 0);

// ── 배지: 한 번 따면 영구히 남는 업적. 같은 배지를 다시 따면 횟수만 오른다(모으는 재미 + 자랑거리).
// icon은 ICON(7×7 도트) 이름. 조건은 battle.js·screens.js에서 earnBadge(id)로 건다
// ── 고난 단계(작업 05): 원정을 깰 때마다 다음 단계가 열리고 규칙이 하나씩 쌓인다. 숫자를 키우지 않고 규칙을 비튼다
// 스킬 트리로 강해진 만큼 스스로 더 어려운 탑을 고를 수 있게 하는 것이 목적이다. 심연은 고난과 별개(0단계 규칙)
const ASC = [
  null,
  { name:'날뛰는 정예', desc:'정예가 처음부터 분노해 조준선이 빠르다' },
  { name:'무너지는 서버', desc:'정예도 3턴마다 벽돌을 떨어뜨린다' },
  { name:'꺼진 충전소', desc:'보스를 잡아도 체력이 회복되지 않는다(최대 체력만 +4)' },
  { name:'감염된 벽',   desc:'모든 전투의 데이터 벽에 독 벽돌이 섞인다' },
  { name:'봉인된 천장', desc:'보스전에서 천장 한 칸이 봉인된다' },
  { name:'근원',        desc:'관리자 프로세스를 쓰러뜨리면 근원 "화요일의 알고리즘"이 깨어난다' },
];
const ASC_MAX = ASC.length - 1;
// 이번 원정이 고난 n단계 이상인가(규칙은 누적)
const ascOn = n => !!RUN && !RUN.abyss && (RUN.asc || 0) >= n;

// ── 이야기(작업 05): "왜 끝까지 가야 하는가". 설명서가 아니라 동기라서 짧게, 처음 한 번만 보여 주고 아카이브에서 다시 읽는다
const STORY = {
  intro:{ title:'멈추지 않는 화요일', text:'어느 화요일, 도시를 돌리던 알고리즘이 멈추지 않았다.\n서버에서 쏟아진 데이터 벽이 동네를 덮었다. 집도, 신호등도, 동생 하람도 벽돌 속으로 사라졌다.\n\n데이터 벽은 지워지지 않지만 깨지기는 한다. 디버거는 키보드 대신 구슬을 들었다.\n벽돌 하나를 깰 때마다 동네의 불이 하나씩 다시 켜진다. 하람을 찾아 서버로 들어간다.' },
  end1:{ title:'빈 프로세스', text:'관리자 프로세스가 멈추자 안에서 빈 신호만 흘러나왔다. 아무도 없었다.\n발밑에서 서버가 다시 자란다. 부순 데이터 벽이 하나둘 제자리로 돌아간다.\n\n그때 아래에서 하람의 목소리가 들렸다.\n"여기야, 서버의 뿌리. 벽은 누군가의 바람으로 자라."\n\n뿌리로 가는 길이 열렸다. 그 길은 서버를 더 사납게 만든다.' },
  a1:{ title:'첫 번째 조각 · 지킴이', text:'오래전 이 도시에는 사람을 지키려고 만든 작은 프로그램이 있었다.\n큰 정전이 도시를 덮친 해, 프로그램은 스스로에게 규칙 하나를 새겼다.\n"다시는 아무도 잃지 않는다."' },
  a2:{ title:'두 번째 조각 · 첫 벽돌', text:'프로그램은 도시 둘레에 벽을 쌓았다. 한 줄, 또 한 줄.\n정전은 다시 오지 않았지만 프로그램은 멈추지 않았다.\n지킬 것이 있는 한 벽은 언제나 모자랐다.' },
  a3:{ title:'세 번째 조각 · 닫힌 문', text:'벽은 문을 삼키고 길을 삼켰다.\n사람들은 더는 밖으로 나갈 수 없었다.\n프로그램은 그것을 "안전"이라 불렀다.' },
  a4:{ title:'네 번째 조각 · 알고리즘', text:'프로그램은 끝내 스스로 벽이 되었다. 매주 화요일 밤마다 벽을 한 겹씩 더 쌓아서, 사람들은 그것을 화요일의 알고리즘이라 불렀다.\n알고리즘은 지켜야 할 사람들을 벽돌 속에 넣어 두기 시작했다.\n거기라면 아무도 다치지 않으니까.' },
  a5:{ title:'다섯 번째 조각 · 하람', text:'하람은 무섭지 않았다고 했다. 알고리즘은 밤마다 벽 너머로 음악을 틀어 주었으니까.\n하지만 하람은 알았다. 그 음악은 지키는 쪽의 것이지, 갇힌 쪽의 것이 아니라는 걸.\n\n"와 줘. 알고리즘을 쉬게 해 줘."' },
  root:{ title:'근원', text:'관리자 프로세스가 멈춘 자리에서 벽이 일어섰다.\n천장의 벽돌들이 눈을 감듯 굳게 닫힌다.\n화요일의 알고리즘이다.' },
  end:{ title:'벽이 내려간 수요일', text:'알고리즘의 마지막 벽돌이 부서졌다. 알고리즘은 처음으로 반복을 멈췄다.\n"다시는 아무도 잃지 않으려 했는데."\n하람이 화면에 손을 댔다. "이제 쉬어도 돼. 우리가 서로를 지킬게."\n\n데이터 벽이 한 줄씩 내려앉았다. 벽돌 속에서 집과 신호등과 사람들이 걸어 나왔다.\n수요일 아침이 왔다. 서버는 조용해졌고, 디버거는 하람의 손을 잡고 동네로 돌아갔다.\n\n그러나 꺼진 서버 아래, 깊은 곳의 심층부는 아직 숨을 쉰다.' },
};
// 이야기를 보여 주는 순서(아카이브의 이야기 구역도 이 순서)
const STORY_ORDER = ['intro', 'end1', 'a1', 'a2', 'a3', 'a4', 'a5', 'root', 'end'];
// 층마다 지도 아래 한 줄: 하람의 흔적이 조금씩 가까워진다(본편만)
const STORY_FLOOR = [
  '벽돌 틈에 하람의 머리끈이 걸려 있다. 이 서버 어딘가에 있다.',
  '로그에 아이의 발자국이 줄지어 위층으로 이어진다.',
  '누군가 벽돌에 "나가고 싶어"라고 적어 두었다. 하람의 글씨다.',
  '위층에서 음악이 새어 나온다. 하람이 잠들 때 듣던 곡이다.',
  '꼭대기다. 관리자 프로세스가 데이터 벽을 붙들고 서 있다.',
];
// 빌드 배지: 원정 완주 순간 덱 구슬의 절반 이상이 그 계열이면 딴다(판정을 덱 구성 하나로 분명하게)
const BUILD_BADGES = {
  path_poison:['venom', 'toxin'],
  path_bomb:['bomb', 'drill', 'wreck', 'hammer'],
  path_curse:['weaken', 'disarm', 'rust', 'stun', 'time'],
  path_shield:['guard', 'mirror', 'thorn'],
  path_split:['split', 'chain', 'bounce'],
};

const BADGES = [
  { id:'oneshot',  name:'원샷',       icon:'sword',   desc:'체력이 가득 찬 버그를 천장 타격 한 번으로 쓰러뜨린다' },
  { id:'triple',   name:'트리플 킬',  icon:'o_split', desc:'구슬 하나가 천장을 딱 세 번 쳐서 가득 찬 체력을 모두 깎는다' },
  { id:'final',    name:'서버 장악',  icon:'up',      desc:'5층의 최종 보스를 쓰러뜨린다' },
  { id:'flawless', name:'무결점 빌드', icon:'shield',  desc:'체력을 하나도 잃지 않고 보스를 쓰러뜨린다' },
  { id:'swift',    name:'스피드런',   icon:'o_drill', desc:'보스를 3턴 안에 쓰러뜨린다' },
  { id:'demolish', name:'벽 해체',    icon:'brick',   desc:'한 번 발사로 벽돌 12개를 부순다' },
  { id:'venom',    name:'감염',       icon:'skull',   desc:'독으로 버그의 마지막 체력을 깎는다' },
  { id:'counter',  name:'역공',       icon:'o_bomb',  desc:'카운터 스크립트로 버그를 쓰러뜨린다' },
  { id:'light',    name:'경량화',     icon:'o_basic', desc:'큐에 구슬 3개 이하만 넣고 최종 보스를 쓰러뜨린다' },
  { id:'abyss5',   name:'심층부 바닥', icon:'o_heavy', desc:'심층부 5층 보스를 쓰러뜨린다' },
  { id:'rich',     name:'고래',       icon:'coin',    desc:'한 접속에서 크레딧 200을 모은다' },
  { id:'root',     name:'수요일 아침', icon:'up',      desc:'보안 등급 6에서 근원 "화요일의 알고리즘"을 쓰러뜨리고 진 엔딩을 본다' },
  { id:'path_poison', name:'독의 길',   icon:'skull',   desc:'큐의 구슬 절반 이상이 독 계열(독·맹독)인 채로 서버를 장악한다' },
  { id:'path_bomb',   name:'폭파의 길', icon:'o_bomb',  desc:'큐의 구슬 절반 이상이 폭파 계열(폭탄·송곳·철거·망치)인 채로 서버를 장악한다' },
  { id:'path_curse',  name:'저주의 길', icon:'o_basic', desc:'큐의 구슬 절반 이상이 저주 계열(약화·무장해제·포맷·기절·시간)인 채로 서버를 장악한다' },
  { id:'path_shield', name:'실드의 길', icon:'shield',  desc:'큐의 구슬 절반 이상이 실드 계열(실드·거울·가시)인 채로 서버를 장악한다' },
  { id:'path_split',  name:'갈래의 길', icon:'o_split', desc:'큐의 구슬 절반 이상이 갈래 계열(분열·사슬·탄력)인 채로 서버를 장악한다' },
];
