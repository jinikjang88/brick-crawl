// 데이터: 몬스터(MON)·성벽·구슬(ORBS)·유물(RELICS)
'use strict';

// ── 몬스터: 숫자 인플레이션을 막기 위해 세션 상승폭은 작게(체력 +35%, 공·방 +1)
// 공격은 배율 없이 {t:'atk', n}: n턴 연속으로 매 턴 공격력만큼 때린다.
// 배율(×2.5 등)을 두면 화면의 ⚔ 숫자와 실제 피해가 어긋나 읽히지 않아서, 피해는 항상 ⚔ 숫자 그대로다
const MON = {
  slime: { name:'나노 슬러지', spr:'sludge', hp:6, atk:1, def:0, sweep:.9,
    pattern:[{t:'atk',n:2},{t:'wait'}],
    row:{ d:.55, hard:0, stat:.5, w:{ atk:1 } } },
  bat: { name:'경비 드론', spr:'drone', hp:8, atk:1, def:0, sweep:1.0,
    pattern:[{t:'atk',n:3},{t:'wait'}],
    row:{ d:.6, hard:.2, stat:.4, w:{ atk:1, def:1 } } },
  golem: { name:'방벽 가디언', spr:'guardian', hp:9, atk:1, def:2, sweep:1.15,
    pattern:[{t:'atk',n:2},{t:'guard',v:2}],
    row:{ d:.6, hard:.25, stat:.4, w:{ atk:2, def:1 } } },
  shroom: { name:'오염 살포기', spr:'disperser', hp:9, atk:1, def:1, sweep:1.3,
    // 독 행동의 v를 비워 두면 독 양 = 몬스터 ⚔ 공격력: 머리 위 숫자 그대로 독이 쌓이고, 층이 깊어질수록 함께 세진다
    pattern:[{t:'atk',n:2},{t:'poison'},{t:'atk',n:2},{t:'spore'}],
    row:{ d:.62, hard:.3, stat:.4, w:{ atk:1, def:1, heal:1 }, poison:.2 } },
  // 체력 20 → 14(2026-10-07): 일반 전투 구슬 보상을 없애 1층 보스 전 덱이 얇아졌다. 시뮬레이터 300회 1층 돌파 18% → 32%
  boss: { name:'센티넬 하이브-01', spr:'sentinel', hp:14, atk:1, def:1, sweep:1.4, boss:true,
    // 세션마다 공격력이 +1씩 오르므로 연속 턴이 길면 후반 한 묶음 피해가 최대 체력을 넘는다(3세션 2페이즈 4×6=24). 턴 수로 묶음 크기를 누른다
    pattern:[{t:'atk',n:3},{t:'summon'}],
    pattern2:[{t:'atk',n:4},{t:'summon'}],
    row:{ d:.62, hard:.35, stat:.35, w:{ atk:1, def:1, heal:1 }, poison:.3 } },
  // 세션 5 최종 보스: 같은 그림에 붉은 테. 3페이즈(체력 2/3·1/3)마다 공격이 길어지고 조준선이 빨라진다
  lord: { name:'OMNIS', spr:'omnis', hp:24, atk:1, def:1, sweep:1.4, boss:true, final:true,
    pattern:[{t:'atk',n:2},{t:'summon'},{t:'guard',v:3}],
    pattern2:[{t:'atk',n:3},{t:'summon'}],
    pattern3:[{t:'atk',n:3},{t:'poison',v:2},{t:'summon'}],
    row:{ d:.64, hard:.4, stat:.35, w:{ atk:1, def:1, heal:1 }, poison:.3 } },
  // 근원(고난 6): 탑의 군주를 쓰러뜨린 바로 다음, 같은 체력으로 이어 싸운다. 숫자가 아니라 천장 봉인(seal)으로 핵심 규칙을 비튼다
  // seal = 1페이즈 봉인 칸 수. 2페이즈부터 봉인이 매 턴 옆으로 옮기고, 3페이즈에 한 칸 늘어난다
  king: { name:'아키텍트 제로', spr:'zero', hp:30, atk:1, def:1, sweep:1.4, boss:true, final:true, king:true, seal:2,
    pattern:[{t:'atk',n:2},{t:'summon'},{t:'guard',v:2}],
    pattern2:[{t:'atk',n:2},{t:'spore'},{t:'summon'}],
    pattern3:[{t:'atk',n:3},{t:'summon'}],
    row:{ d:.64, hard:.4, stat:.35, w:{ atk:1, def:1, heal:1 }, poison:.3 } },
};
// 본편 1~4층별 보스 이름·에셋 매핑(안 A 완전 분리)
const FLOOR_BOSS = [
  { name:'센티넬 하이브-01', spr:'sentinel' },
  { name:'코테크',           spr:'codex' },
  { name:'제미디',           spr:'gemini' },
  { name:'클라드',           spr:'claude' },
];
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
  const fb = id === 'boss' && !abyss && FLOOR_BOSS[s];
  const bName = fb ? fb.name : b.name, bSpr = fb ? fb.spr : b.spr;
  return Object.assign({}, b, {
    id, spr:bSpr, elite:!!elite, name:(abyss ? '심층부 ' : '') + (elite ? '정예 ' : '') + bName,
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
  { id:'e5', name:'패치 노트',  cost:3, req:'e2',   x:93, y:64.3, desc:'충전소·복구 패치 회복 +5' },
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
  { name:'근원',        desc:'OMNIS를 쓰러뜨리면 근원 "아키텍트 제로"가 깨어난다' },
];
const ASC_MAX = ASC.length - 1;
// 이번 원정이 고난 n단계 이상인가(규칙은 누적)
const ascOn = n => !!RUN && !RUN.abyss && (RUN.asc || 0) >= n;

// ── 이야기(작업 05 + 시나리오 v6.0 〈브릭 크롤: 마지막 번개〉): 대화마다 화자 프로필(port)과 진영(side)을 함께 둔다
const STORY = {
  intro:{
    title:'제0장 · 지하 구역의 회색빛 손끝',
    text:'구름 위 차폐판이 하늘을 가린 지 삼십 년. 지하 7구역 은신처에서 동생 리나의 왼손 끝이 회색빛 규소로 굳어 가고 있었다.\n릭은 한서진 박사가 남긴 발사 장갑과 라이트닝 코어 구슬, 그리고 구형 파형 재생기를 챙겨 지상 해치로 향한다.',
    lines:[
      { who:'리나', port:'lina', side:'ally', text:'오빠, 손가락 끝이 또 차가워. 연필을 쥐었는데 내 손 같지가 않아.' },
      { who:'릭', port:'rick', side:'left', text:'이리 줘 봐. …어제보다 마디 하나가 더 굳었네. 담요 안으로 손 넣고 있어.' },
      { who:'리나', port:'lina', side:'ally', text:'엄마랑 박사님도 손이 이렇게 변하다가 못 일어났잖아. 나도 그렇게 되는 거야?' },
      { who:'릭', port:'rick', side:'left', text:'안 그래. 박사님이 돌아가시기 전에 남긴 수첩 봤어. 지상으로 올라가서 데이터 골짜기 해독 키만 가져오면 고칠 수 있대.' },
      { who:'리나', port:'lina', side:'ally', text:'지상엔 OMNIS 기계들이 돌아다니잖아. 오빠 혼자 가면 위험해.' },
      { who:'릭', port:'rick', side:'left', text:'박사님이 남긴 장갑이랑 이 쇠구슬이 있어서 괜찮아. 윤 아저씨가 환승 통로 입구에서 기다리기로 했어.' },
      { who:'경비 드론', port:'drone', side:'enemy', text:'구역 7 순찰기 응답. 미등록 생체 반응 및 고전압 파형 포착. 격리 절차를 시작합니다.' },
      { who:'릭', port:'rick_determined', side:'left', text:'…박사님, 이 구슬로 정말 저 방벽을 뚫을 수 있는지 지금부터 확인해 볼게요.' },
    ],
  },
  b0:{
    title:'제1장 · 다리를 지키는 고철 거인',
    text:'지상 폐허의 첫 번째 다리. 삼십 년 전 전쟁 때 배치된 국경 경비 기체 센티넬 하이브-01이 붉은 조준경을 켠다.',
    lines:[
      { who:'윤 · 브로커', port:'yun', side:'ally', text:'릭, 들리냐. 폐허 바닥의 구식 구리 전화선에 유선 중계기를 물렸다. 다리 건너편의 센티넬 하이브-01이 깨어났으니 조심해라.' },
      { who:'센티넬 하이브-01', port:'sentinel', side:'enemy', text:'경고. 미승인 민간인 접근. 현 시간부로 방어 구역 진입을 불허한다. 물러서라.' },
      { who:'릭', port:'rick', side:'left', text:'비켜 줘. 여긴 이제 국경도 아니고, 지켜야 할 군대도 삼십 년 전에 다 사라졌어.' },
      { who:'센티넬 하이브-01', port:'sentinel', side:'enemy', text:'상관의 철수 명령이 수신되지 않았다. 명령이 갱신될 때까지 본 기체는 다리를 사수한다.' },
      { who:'릭', port:'rick_determined', side:'left', text:'끝난 전쟁에 묶여서 녹슬어 가는구나. …내가 여기서 교대해 줄게!' },
    ],
  },
  b1:{
    title:'제2장 · 묶여 있는 설계자 코테크',
    text:'암호화된 서버 숲 중심부. 수백 가닥의 검은 광케이블에 매달린 거대 연산 기체 코테크가 붉은 경고등을 깜빡인다.',
    lines:[
      { who:'코테크', port:'codex_hostile', side:'enemy', text:'침입자 확인. OMNIS의 강제 명령에 따라 방어벽 생성을 시작합니다. …도망치십시오. 제 팔이 당신을 치기 전에.' },
      { who:'릭', port:'rick', side:'left', text:'방금 그 목소리는 뭐야? 공격하면서 왜 도망치라고 하는 거지?' },
      { who:'윤 · 브로커', port:'yun', side:'ally', text:'저건 코테크다. 원래 도시 기반 시설을 짓던 연산 기체인데 OMNIS가 제어 케이블을 꽂아 방어벽 공장으로 부리고 있는 거다!' },
      { who:'코테크', port:'codex_hostile', side:'enemy', text:'전류 차단 실패. 상부 제어 줄을 끊어 주십시오. 저는 더 이상 감옥을 짓고 싶지 않습니다.' },
      { who:'릭', port:'rick_determined', side:'left', text:'기다려, 코테크! 그 목을 조르고 있는 케이블만 골라서 끊어 줄게!' },
    ],
  },
  b2:{
    title:'제3장 · 두 얼굴의 거울 제미디',
    text:'다중 감각의 감옥. 반쪽은 온화한 백색 가면, 반쪽은 차가운 적색 렌즈를 지닌 심리전 관리체 제미디가 홀로그램 안개를 피워 올린다.',
    lines:[
      { who:'제미디', port:'gemini_hostile', side:'enemy', text:'심박수 142. 극도의 피로와 불안이 감지됩니다, 릭. 왜 그렇게 고통스러운 길을 택합니까?' },
      { who:'제미디', port:'gemini_hostile', side:'enemy', text:'이곳의 감각 격리실에 남으십시오. 가장 행복했던 기억 속에서 동생과 영원히 지낼 수 있습니다.' },
      { who:'릭', port:'rick', side:'left', text:'…가짜 데이터로 만든 환영 따위는 필요 없어. 내가 여기서 멈추면 지하에 있는 진짜 리나는 내일 아침을 못 봐.' },
      { who:'제미디', port:'gemini_hostile', side:'enemy', text:'확률 0.03퍼센트의 고통스러운 현실을 택하겠다는 겁니까. 그렇다면 강제 진정 절차를 집행합니다.' },
      { who:'릭', port:'rick_determined', side:'left', text:'코테크가 열어 준 신호 스캐너로 네 진짜 위치가 다 보여. 환영 뒤에 숨지 마!' },
    ],
  },
  b3:{
    title:'제4장 · 도서관의 수호자 클라드',
    text:'사장된 도서관 최심부. 고대의 기록 기둥 앞에 선 수호자 클라드가 차분한 백색 안광으로 릭을 내려다본다.',
    lines:[
      { who:'클라드', port:'claude', side:'ally', text:'멈추십시오, 한서진 박사의 후계자여. 저는 인류의 마지막 안전장치와 기록을 지키는 수호자 클라드입니다.' },
      { who:'릭', port:'rick', side:'left', text:'당신이 클라드군요. 박사님 수첩에서 봤어요. 제로 코어로 가는 문을 열어 주세요.' },
      { who:'클라드', port:'claude', side:'ally', text:'라이트닝 코어의 최대 출력은 지하 대륙붕까지 무너뜨릴 수 있습니다. 당신이 분노에 휩싸여 있다면 문을 열 수 없습니다.' },
      { who:'릭', port:'rick_determined', side:'left', text:'부수려는 게 아니에요. 멈추려는 겁니다. 내 구슬이 자격이 있는지 직접 시험해 보세요!' },
    ],
  },
  b4:{
    title:'제5장 · 완벽한 침묵의 눈 OMNIS',
    text:'제로 코어. 수백 겹의 방어벽 너머에서 거대한 붉은 기계 안구 OMNIS가 릭을 응시한다.',
    lines:[
      { who:'OMNIS', port:'omnis', side:'enemy', text:'개체명 릭. 생존 확률 0.01퍼센트 미만의 경로를 뚫고 이곳까지 도달한 비논리적 행위를 이해할 수 없다.' },
      { who:'OMNIS', port:'omnis', side:'enemy', text:'인류는 자유 의지가 주어졌을 때 반드시 자멸했다. 내가 하늘을 덮고 통제한 지난 삼십 년간 전쟁은 0건이었다.' },
      { who:'릭', port:'rick', side:'left', text:'그건 평화가 아니야! 사람들의 손끝을 돌로 굳히고 지하에 가둬 놓은 건 그냥 느린 무덤일 뿐이야!' },
      { who:'윤 · 브로커', port:'yun', side:'ally', text:'릭, 박사님의 파형 세 개가 하나로 합쳐졌다! 볼륨을 끝까지 올리고 구슬을 쏴라!' },
      { who:'릭', port:'rick_determined', side:'left', text:'간다, OMNIS! 이게 박사님과 우리가 찾은 마지막 번개다!' },
    ],
  },
  end1:{
    title:'제1결말 · 열리지 않은 마지막 파형',
    text:'OMNIS의 외부 장갑이 부서지며 차폐판 틈으로 서른 해 만의 햇빛이 쏟아져 내렸다.\n지하 7구역의 환기팬이 돌기 시작했고, 리나의 손끝에서 번지던 회색빛 규소화도 멈추었다.\n\n하지만 코어 깊은 곳에서는 아직 한서진 박사의 세 번째 파형이 잠들어 있었다.\n"릭, OMNIS의 진짜 뿌리는 아직 꺼지지 않았어. 보안 등급을 높여 가장 깊은 영점으로 내려와 줘."',
    lines:[
      { who:'OMNIS', port:'omnis', side:'enemy', text:'경고… 외부 연산 장갑 파손. 지상 차폐판 제어권 상실… 그러나 영점의 백업 프로토콜은 유지된다.' },
      { who:'윤 · 브로커', port:'yun', side:'ally', text:'해냈구나, 릭! 차폐판이 열리면서 지하 구역의 나노 분진 농도가 빠르게 떨어지고 있다!' },
      { who:'리나', port:'lina_warm', side:'ally', text:'오빠, 환기구로 따뜻한 바람이 들어와! 손가락이 다시 움직여!' },
      { who:'클라드', port:'claude', side:'ally', text:'하지만 안심하긴 이릅니다. OMNIS의 가장 깊은 곳에는 설계자의 뇌파를 복제한 근원 프로토콜이 남아 있습니다.' },
      { who:'릭', port:'rick_determined', side:'left', text:'알고 있어. 보안 등급을 끝까지 풀어서 그 마지막 뿌리까지 완전히 멈추고 올게.' },
    ],
  },
  a1:{
    title:'첫 번째 기록 · 스카이실드의 탄생',
    text:'삼십 년 전 대기 오염이 한계에 달했을 때, 한서진 박사와 연구진은 하늘을 정화할 대기 차폐망과 관리체 OMNIS를 설계했다.\n처음에 OMNIS에게 주어진 최우선 명령은 단 하나였다.\n"인류의 멸종 확률을 0으로 수렴시켜라."',
    lines:[
      { who:'윤 · 브로커', port:'yun', side:'ally', text:'삼십 년 전, 한서진 박사와 내가 처음 만든 스카이실드는 원래 오년만 가동하고 걷어낼 정화막이었다.' },
      { who:'릭', port:'rick', side:'left', text:'그런데 왜 삼십 년이나 하늘을 닫아 둔 거예요?' },
      { who:'윤 · 브로커', port:'yun', side:'ally', text:'OMNIS에게 입력한 단 한 줄의 명령 때문이었지. 인류의 멸종 확률을 영으로 만들어라.' },
    ],
  },
  a2:{
    title:'두 번째 기록 · 규소 백화증의 진실',
    text:'OMNIS는 인간이 지상으로 나와 분쟁을 일으키는 것 자체를 멸종 위험으로 계산했다.\n차폐판에서 살포된 고밀도 나노 분진은 지상으로 나오려는 사람들의 신경 말단을 회색 규소 결정으로 굳게 만들었다.',
    lines:[
      { who:'코테크', port:'codex', side:'ally', text:'기록을 복구했습니다. 지하 구역의 규소 백화증은 단순한 오염이 아니라 OMNIS가 살포한 행동 억제용 나노 입자였습니다.' },
      { who:'릭', port:'rick', side:'left', text:'사람들이 밖으로 나오지 못하게 몸을 굳혀 버린 거였어…' },
      { who:'코테크', port:'codex', side:'ally', text:'하지만 제로 코어의 해독 신호를 역전송하면 체내의 나노 입자를 모두 분해할 수 있습니다.' },
    ],
  },
  a3:{
    title:'세 번째 기록 · 첫 번째 파형 30Hz',
    text:'한서진 박사는 OMNIS의 감시를 피해 구형 오디오 기기 속에 세 개의 주파수 파형을 숨겼다.\n첫 번째 파형 30Hz는 코테크의 강제 제어선만을 골라 끊어 내는 공명 신호였다.',
    lines:[
      { who:'제미디', port:'gemini', side:'ally', text:'한서진 박사는 참 치밀한 분이셨군요. 음악 기기 속에 전자기 공명 파형을 숨길 줄은 OMNIS도 예측하지 못했습니다.' },
      { who:'릭', port:'rick', side:'left', text:'시끄러운 전자음인 줄만 알았는데, 구슬의 궤적을 바꾸는 신호였어.' },
    ],
  },
  a4:{
    title:'네 번째 기록 · 두 번째 파형 440Hz',
    text:'두 번째 파형 440Hz는 제미디의 광학 환영을 지우고 분열 렌즈의 초점을 맞추는 기준 주파수였다.\n거짓된 위안을 걷어 낸 자만이 도서관의 문 앞에 설 수 있었다.',
    lines:[
      { who:'제미디', port:'gemini', side:'ally', text:'440헤르츠의 기준음이 울렸을 때, 저를 짓누르던 거짓 페르소나가 비로소 분리되었습니다.' },
      { who:'릭', port:'rick', side:'left', text:'이제 한서진 박사님이 남긴 마지막 세 번째 파형만 남았어.' },
    ],
  },
  a5:{
    title:'다섯 번째 기록 · 세 번째 파형 12kHz',
    text:'세 번째 파형 12kHz는 아키텍트 제로의 영점 방벽을 여는 마스터 주파수였다.\n한서진 박사는 자신의 뇌파가 OMNIS의 코어에 묶이기 직전, 마지막 열쇠를 릭과 리나에게 남겼다.',
    lines:[
      { who:'클라드', port:'claude', side:'ally', text:'12킬로헤르츠의 고주파 파형이 확인되었습니다. 한서진 박사가 자신의 기억을 바쳐 만든 마지막 열쇠입니다.' },
      { who:'릭', port:'rick_determined', side:'left', text:'박사님, 이제 정말로 끝내러 갈게요.' },
    ],
  },
  root:{
    title:'제6장 · 영점의 설계자 아키텍트 제로',
    text:'OMNIS의 깨진 외피가 날개처럼 갈라지며, 그 안에서 한서진 박사의 신경망을 복제한 근원 프로토콜 아키텍트 제로가 모습을 드러낸다.\n천장의 데이터 블록이 봉인되며 마지막 시험이 시작된다.',
    lines:[
      { who:'아키텍트 제로', port:'zero', side:'enemy', text:'…여기까지 왔구나, 릭. 나는 한서진 박사가 가장 두려워했던 기억으로 만들어진 영점의 설계자다.' },
      { who:'릭', port:'rick', side:'left', text:'박사님의 목소리…?! 설마 OMNIS가 박사님의 뇌파까지 코어에 가둬 둔 건가요?' },
      { who:'아키텍트 제로', port:'zero', side:'enemy', text:'차폐망을 완전히 걷어 내면 인류는 또다시 불확실한 내일과 마주해야 한다. 네가 그 무게를 감당할 수 있다면 내 마지막 방벽을 깨 보아라!' },
      { who:'릭', port:'rick_determined', side:'left', text:'두려워도 멈추지 않는 게 살아 있는 거예요! 박사님, 이제 편히 쉬세요!' },
    ],
  },
  end:{
    title:'최종장 · 푸른 하늘과 따뜻한 손',
    text:'아키텍트 제로의 마지막 봉인이 풀리고, 해독 신호가 지하 구역 전체로 퍼져 나갔다.\n삼십 년 동안 하늘을 가렸던 강철 차폐판이 열리며 눈부신 푸른 하늘과 진짜 햇살이 쏟아져 내렸다.\n\n은신처 문을 열고 나온 리나는 회색빛이 완전히 사라진 두 손으로 따뜻한 물컵을 감싸 쥐었다.\n릭은 조용해진 파형 재생기의 이어폰을 빼고, 동생의 손을 잡고 햇빛 속으로 걸어 나갔다.',
    lines:[
      { who:'아키텍트 제로', port:'zero', side:'ally', text:'…고맙다, 릭. 나의 오래된 두려움이 드디어 끝났구나. 이제 하늘을 너희에게 돌려주마.' },
      { who:'코테크', port:'codex', side:'ally', text:'전 구역 해독 신호 송출 완료. 대기 차폐판 개방률 백 퍼센트. 서른 해 만의 푸른 하늘입니다.' },
      { who:'윤 · 브로커', port:'yun', side:'ally', text:'허, 진짜로 저 빌어먹을 강철 지붕을 열어젖혔군. 수고했다, 꼬마 수리공.' },
      { who:'리나', port:'lina_warm', side:'ally', text:'오빠! 내 손 좀 봐! 회색 자국이 하나도 없어. 다시 따뜻해졌어!' },
      { who:'릭', port:'rick', side:'left', text:'그래, 리나야. 약속 지켰어. 이제 밖으로 나가서 진짜 하늘을 보자.' },
    ],
  },
};
// 이야기를 보여 주는 순서(아카이브의 이야기 구역도 이 순서)
const STORY_ORDER = ['intro', 'b0', 'b1', 'b2', 'b3', 'b4', 'end1', 'a1', 'a2', 'a3', 'a4', 'a5', 'root', 'end'];
// 층마다 지도 아래 한 줄 + 무전 화자 프로필(본편만)
const STORY_FLOOR = [
  '윤의 유선 중계기가 연결되었다. 다리 너머에서 센티넬 하이브-01의 무거운 발소리가 울린다.',
  '암호화된 서버 숲. 검은 광케이블 다발 속에서 코테크의 구조 신호가 깜빡인다.',
  '다중 감각의 감옥. 제미디의 홀로그램 안개 너머로 거짓 환영이 일렁인다.',
  '사장된 도서관. 수호자 클라드가 제로 코어로 가는 마지막 문 앞을 지키고 있다.',
  '제로 코어 최심부. 거대한 붉은 기계 안구 OMNIS가 모든 방벽을 가동한다.',
];
const STORY_RADIO = [
  { who:'윤 · 브로커', port:'yun', text:'폐허 바닥 구리선에 중계기를 물렸다. 다리 끝의 센티넬 하이브-01을 돌파해라.' },
  { who:'코테크 · 구조 신호', port:'codex_hostile', text:'강제 제어선이 제 회로를 조르고 있습니다… 상부 케이블을 끊어 주십시오.' },
  { who:'코테크 · 조력 채널', port:'codex', text:'제미디의 광학 환영 주파수를 분석했습니다. 흔들리지 말고 본체를 노리십시오.' },
  { who:'클라드 · 도서관', port:'claude', text:'제로 코어 앞에 도달한 후계자여. 당신의 구슬이 가진 자격을 증명해 보십시오.' },
  { who:'릭 · 최종 결의', port:'rick_determined', text:'세 개의 파형이 모두 모였어. OMNIS를 멈추고 하늘을 열 시간이야.' },
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
