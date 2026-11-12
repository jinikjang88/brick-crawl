// 데이터: 몬스터(MON)·성벽·구슬(ORBS)·유물(RELICS)
'use strict';

// ── 몬스터: 숫자 인플레이션을 막기 위해 세션 상승폭은 작게(체력 +35%, 공·방 +1)
// 공격은 배율 없이 {t:'atk', n}: n턴 연속으로 매 턴 공격력만큼 때린다.
// 배율(×2.5 등)을 두면 화면의 ⚔ 숫자와 실제 피해가 어긋나 읽히지 않아서, 피해는 항상 ⚔ 숫자 그대로다
const MON = {
  // trait = 특성 하나(TRAITS), weak = 약점(코어·회로 id). 약점이 든 구슬이 천장을 치면 이번 전투 동안 특성이 꺼지고 그 타격은 피해 +1
  slime: { name:'나노 슬러지', spr:'sludge', hp:6, atk:1, def:0, sweep:.9, trait:'regen', weak:['venom'],
    pattern:[{t:'atk',n:2},{t:'wait'}],
    row:{ d:.55, hard:0, stat:.5, w:{ atk:1 } } },
  bat: { name:'경비 드론', spr:'drone', hp:8, atk:1, def:0, sweep:1.0, trait:'evade', weak:['split'],
    pattern:[{t:'atk',n:3},{t:'wait'}],
    row:{ d:.6, hard:.2, stat:.4, w:{ atk:1, def:1 } } },
  golem: { name:'방벽 가디언', spr:'guardian', hp:9, atk:1, def:2, sweep:1.15, trait:'armor', weak:['rust', 'drill'],
    pattern:[{t:'atk',n:2},{t:'guard',v:2}],
    row:{ d:.6, hard:.25, stat:.4, w:{ atk:2, def:1 } } },
  shroom: { name:'오염 살포기', spr:'disperser', hp:9, atk:1, def:1, sweep:1.3, trait:'miasma', weak:['thorn'],
    // 독 행동의 v를 비워 두면 독 양 = 몬스터 ⚔ 공격력: 머리 위 숫자 그대로 독이 쌓이고, 층이 깊어질수록 함께 세진다
    pattern:[{t:'atk',n:2},{t:'poison'},{t:'atk',n:2},{t:'spore'}],
    row:{ d:.62, hard:.3, stat:.4, w:{ atk:1, def:1, heal:1 }, poison:.2 } },
  // ── 2~5층 새 기체(작업 08 2단계, 대본의 층 묘사에서). 그림은 ASSET_PROMPTS에 프롬프트를 더하고, 그 전엔 비슷한 기존 그림을 쓴다
  compiler: { name:'컴파일 드론', spr:'drone', hp:8, atk:1, def:0, sweep:1.1, trait:'spawn', weak:['bomb'],
    pattern:[{t:'atk',n:2},{t:'wait'}],
    row:{ d:.6, hard:.25, stat:.4, w:{ atk:1, def:1 } } },
  holo: { name:'홀로그램 잔상', spr:'drone', hp:7, atk:1, def:0, sweep:1.2, trait:'phantom', weak:['split'],
    pattern:[{t:'atk',n:3},{t:'wait'}],
    row:{ d:.58, hard:.2, stat:.4, w:{ atk:1, def:1 } } },
  stone: { name:'방어석', spr:'guardian', hp:10, atk:1, def:1, sweep:1.1, trait:'quarry', weak:['hammer'],
    pattern:[{t:'atk',n:2},{t:'summon'}],
    row:{ d:.62, hard:.35, stat:.35, w:{ atk:1, def:1 } } },
  keeper: { name:'기록 수호기', spr:'guardian', hp:9, atk:1, def:2, sweep:1.15, trait:'fortify', weak:['rust', 'venom'],
    pattern:[{t:'atk',n:2},{t:'guard',v:2}],
    row:{ d:.6, hard:.3, stat:.4, w:{ atk:1, def:1, heal:1 } } },
  hardener: { name:'경화 살포기', spr:'disperser', hp:9, atk:1, def:1, sweep:1.25, trait:'harden', weak:['weaken'],
    pattern:[{t:'atk',n:2},{t:'poison'},{t:'atk',n:2}],
    row:{ d:.62, hard:.3, stat:.4, w:{ atk:1, def:1, heal:1 }, poison:.15 } },
  royal: { name:'근위 센티넬', spr:'sentinel', hp:10, atk:1, def:1, sweep:1.2, trait:'barrage', weak:['disarm', 'stun'],
    pattern:[{t:'atk',n:3},{t:'guard',v:2}],
    row:{ d:.62, hard:.35, stat:.35, w:{ atk:1, def:1 } } },
  // 정예 전용(정예 배율이 붙는다)
  arm: { name:'코테크 작업 팔', spr:'guardian', hp:10, atk:1, def:1, sweep:1.2, trait:'spawn', weak:['bomb', 'hammer'],
    pattern:[{t:'atk',n:2},{t:'summon'}],
    row:{ d:.62, hard:.3, stat:.4, w:{ atk:1, def:1 } } },
  observer: { name:'거울 관측기', spr:'drone', hp:9, atk:1, def:0, sweep:1.25, trait:'reflect', weak:['mirror'],
    pattern:[{t:'atk',n:3},{t:'wait'}],
    row:{ d:.6, hard:.25, stat:.4, w:{ atk:1, def:1 } } },
  tower: { name:'서고 감시기', spr:'guardian', hp:11, atk:1, def:2, sweep:1.2, trait:'armor', weak:['rust', 'drill'],
    pattern:[{t:'atk',n:2},{t:'guard',v:3},{t:'summon'}],
    row:{ d:.62, hard:.35, stat:.35, w:{ atk:1, def:1, heal:1 } } },
  lens: { name:'위성 렌즈', spr:'drone', hp:10, atk:1, def:1, sweep:1.3, trait:'evade', weak:['split'],
    pattern:[{t:'atk',n:3},{t:'wait'}],
    row:{ d:.62, hard:.3, stat:.4, w:{ atk:1, def:1 } } },
  // 체력 20 → 14(2026-10-07): 일반 전투 구슬 보상을 없애 1층 보스 전 덱이 얇아졌다. 시뮬레이터 300회 1층 돌파 18% → 32%
  // def 1 → 0(2026-11-05, 작업 08): 첫 계정은 번개 구슬 하나로 시작해(EMP 구슬이 빠졌다) 보스 방어도에 피해가 다 막혔다.
  // 시뮬레이터 새 계정 60회: def 1 = 1층 돌파 15%, def 0 = 22%(목표 20~30%). 층마다 오르는 방어도(SCALE.def)는 그대로
  boss: { name:'센티넬 하이브-01', spr:'sentinel', hp:14, atk:1, def:0, sweep:1.4, boss:true,
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
// ── 기체 특성(작업 08 2단계). icon = 머리 위 도트 아이콘(설명서 없이 읽히게). 약점을 찌르면 이번 전투 동안 꺼진다
const TRAITS = {
  regen:  { icon:'heart',   desc:'매 턴 체력 +1(1층에서는 3턴에 한 번)' },
  evade:  { icon:'evade',   desc:'2턴에 한 번 발사의 첫 천장 타격을 피한다(1층에서는 3턴에 한 번)' },
  armor:  { icon:'shield',  desc:'수비할 때 방어도 +2 더' },
  miasma: { icon:'skull',   desc:'데이터 벽에 독 벽돌이 더 섞인다' },
  spawn:  { icon:'brick',   desc:'2턴마다 맨 위 줄에 단단한 벽돌 1개' },
  phantom:{ icon:'ghost',   desc:'발사의 두 번째·네 번째 천장 타격은 허상을 친다' },
  quarry: { icon:'brick',   desc:'불러낸 돌 벽돌 체력 +2' },
  fortify:{ icon:'heart',   desc:'수비할 때 체력 +2' },
  harden: { icon:'up',      desc:'공격이 맞을 때마다 조준선이 10% 빨라진다(최대 50%)' },
  barrage:{ icon:'sword',   desc:'연속 공격의 첫 타 피해 +1' },
  reflect:{ icon:'reflect', desc:'발사의 첫 천장 타격마다 릭에게 피해 1' },
};
// 층별 등장(작업 08 4절). 앞 층 일반 기체가 PREV_MIX 확률로 섞인다(낯익은 적과 새 적이 함께). 심층부는 전부 섞인다
const ROSTER = [
  { mons:['slime', 'bat'],       elite:['golem'] },
  { mons:['golem', 'compiler'],  elite:['arm'] },
  { mons:['shroom', 'holo'],     elite:['observer'] },
  { mons:['stone', 'keeper'],    elite:['tower'] },
  { mons:['hardener', 'royal'],  elite:['lens'] },
];
const PREV_MIX = .25;
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
// ── 구슬 = 코어 1개 + 회로 칸(작업 08). 차고에서 조립해 영구로 갖고, 장갑 슬롯에 장전해 들고 나간다
// part = 'core'(구슬 몸체: 움직임 규칙) | 'circ'(회로: 맞혔을 때 붙는 효과) | 'res'(공명 전용으로 남겨 둔 효과: 3단계에서 연다)
// rar = 등급(RARITY): 정비소 값과 드롭 등급. 0 = 시작 코어(드롭에 나오지 않음)
// core: heat = 쏜 뒤 쉬는 턴(과열), slots = 회로 칸. 번개 코어만 과열 0이라 아무것도 못 쏘는 턴은 없다
// short = 구슬 이름에 붙는 짧은 이름("EMP 구슬 · 부식·차폐")
const ORBS = {
  // 코어
  basic:  { part:'core', short:'번개', name:'번개 코어',   rar:0, heat:0, slots:1, desc:'튕긴다. 천장을 3번까지 친다', up:'천장을 한 번 더 칠 수 있다',
    lore:'한서진 박사가 깎은 아날로그 전자기 구체. 무선 회로가 없어 OMNIS도 해킹하지 못한다.' },
  drill:  { part:'core', short:'관통', name:'관통 코어',   rar:2, heat:1, slots:1, desc:'어떤 벽돌이든 3개까지 한 번에 뚫는다', up:'어떤 벽돌이든 5개까지 뚫는다',
    lore:"코테크가 자신의 집속 회로를 떼어 만들어 준 관통 모듈. 주석에 '30년 만의 휴식'이라 적혀 있다." },
  bomb:   { part:'core', short:'EMP',  name:'EMP 코어',    rar:2, heat:1, slots:1, desc:'처음 부순 벽돌의 주변 8칸이 함께 터진다', up:'주변 8칸에 2씩 피해',
    lore:'14호 방위선을 30년간 지키던 센티넬의 흉부 축전기. 아직 미지근한 열기가 남아 있다.' },
  magnet: { part:'core', short:'전자석', name:'전자석 코어', rar:2, heat:1, slots:2, desc:'바닥에 닿으면 한 번 다시 튀어 오른다', up:'바닥에서 두 번 다시 튀어 오른다' },
  heavy:  { part:'core', short:'텅스텐', name:'텅스텐 코어', rar:3, heat:2, slots:1, desc:'한 방이 무겁다(구슬 위력 +2)', up:'한 방이 더 무겁다' },
  split:  { part:'core', short:'분광', name:'분광 코어',   rar:3, heat:2, slots:2, desc:'세 갈래로 갈라져 발사된다(갈래 피해 ÷3)', up:'다섯 갈래로 갈라져 발사된다(갈래 피해 ÷5)',
    lore:'제미디의 광학 분열 렌즈. 허상을 만드는 대신, 진짜 탄도를 여러 갈래로 나눈다.' },
  comet:  { part:'core', short:'아크', name:'아크 코어',   rar:4, heat:3, slots:2, desc:'모든 벽돌을 뚫고 천장을 한 번만 친다(구슬 위력 +4)', up:'모든 벽돌을 뚫고, 더 무겁다',
    lore:'클라드의 안전 제어 코어가 융합된 형태. 사용자의 신경을 태우지 않고 최대 출력을 낸다.' },
  // 회로
  venom:  { part:'circ', short:'부식', name:'부식 회로',     rar:1, desc:'천장을 칠 때마다 기체에게 독 +1', up:'천장을 칠 때마다 기체에게 독 +2' },
  toxin:  { part:'circ', short:'바이러스', name:'바이러스 회로', rar:3, desc:'천장을 치면 이번 전투 기체 독이 줄지 않는다', up:'+ 독이 방어도도 깎는다' },
  guard:  { part:'circ', short:'차폐', name:'차폐 회로',     rar:1, desc:'벽돌을 부술 때마다 방어도 +1', up:'벽돌을 부술 때마다 방어도 +2' },
  mirror: { part:'circ', short:'반사', name:'반사 회로',     rar:3, desc:'쏜 턴에 기체 공격 피해의 절반(올림)을 되돌린다', up:'쏜 턴에 기체 공격 피해를 그대로 되돌린다' },
  herb:   { part:'circ', short:'수리', name:'수리 회로',     rar:1, desc:'처음 천장을 칠 때 체력 +1', up:'처음 천장을 칠 때 체력 +2' },
  vamp:   { part:'circ', short:'사이펀', name:'사이펀 회로', rar:2, desc:'천장을 2번 칠 때마다 체력 +1', up:'천장을 칠 때마다 체력 +1' },
  thorn:  { part:'circ', short:'파편', name:'파편 회로',     rar:1, desc:'벽돌 2개를 부술 때마다 기체에게 피해 1', up:'벽돌을 부술 때마다 기체에게 피해 1' },
  wreck:  { part:'circ', short:'철거', name:'철거 회로',     rar:2, desc:'천장 타격 피해 + 이 구슬이 부순 벽돌 수 ÷ 3', up:'천장 타격 피해 + 부순 벽돌 수 ÷ 2' },
  chain:  { part:'circ', short:'릴레이', name:'릴레이 회로', rar:2, desc:'같은 구슬의 천장 타격마다 피해 +1씩 쌓인다', up:'천장 타격마다 피해 +2씩 쌓인다' },
  hammer: { part:'circ', short:'항타', name:'항타 회로',     rar:1, desc:'돌 벽돌에 피해 3', up:'돌 벽돌에 피해 5' },
  rust:   { part:'circ', short:'분해', name:'분해 회로',     rar:2, desc:'천장을 치면 기체 방어도가 0이 된다', up:'방어도를 0으로 + 기체의 다음 수비 행동이 헛돈다' },
  weaken: { part:'circ', short:'감쇠', name:'감쇠 회로',     rar:2, desc:'천장을 치면 기체의 남은 연속 공격 -1 (발사마다 1번, 최소 1)', up:'남은 연속 공격 -1을 발사마다 2번까지' },
  disarm: { part:'circ', short:'차단기', name:'차단기 회로', rar:2, desc:'천장을 치면 이번 전투 기체 ⚔ -1 (전투마다 3번, 최소 1)', up:'기체 ⚔ -1을 전투마다 4번까지' },
  stun:   { part:'circ', short:'충격', name:'충격 회로',     rar:3, desc:'천장을 2번 치면 기체가 다음 행동을 건너뛴다(전투마다 1번)', up:'천장을 1번만 쳐도 기절(전투마다 1번)' },
  // 3층 보스(제미디)만 떨어뜨리는 회로. 정비소·무작위 드롭에는 나오지 않는다(drop:false). 공명 "마지막 번개"의 재료
  prism:  { part:'circ', short:'분광 렌즈', name:'분광 렌즈 회로', rar:4, drop:false, desc:'분광 코어의 갈래 피해를 나누지 않는다', up:'분광 코어의 갈래 피해를 나누지 않는다' },
  // 공명이 붙여 주는 효과(작업 08 2.3절): 드롭·정비소·아카이브 부품 목록에는 내보내지 않는다
  bounce: { part:'res', short:'반발', name:'반발', rar:1, desc:'이 구슬은 천장을 한 번 더 칠 수 있다', up:'이 구슬은 천장을 두 번 더 칠 수 있다' },
  time:   { part:'res', short:'리셋', name:'리셋', rar:4, desc:'천장을 치면 기체 행동이 처음으로 돌아가고 연속 공격 -2 (전투마다 1번)', up:'처음으로 되돌리기를 전투마다 2번' },
  crown:  { part:'res', short:'루트', name:'루트', rar:4, desc:'추가 피해 = 가진 크레딧 ÷ 25', up:'추가 피해 = 가진 크레딧 ÷ 15' },
};
const CORES = Object.keys(ORBS).filter(k => ORBS[k].part === 'core');
const CIRCS = Object.keys(ORBS).filter(k => ORBS[k].part === 'circ');
// 무작위 드롭·정비소에 나오는 회로(분광 렌즈처럼 보스 전용은 뺀다)
const DROP_CIRCS = CIRCS.filter(k => ORBS[k].drop !== false);
// 잠금은 없앴다(부품 파밍으로 얻는다). 옛 아카이브 호출이 깨지지 않게 함수는 남긴다
const lockText = () => '';
const orbOpen = k => hasKey(ORBS, k) && ORBS[k].part !== 'res';
// 천장 타격 피해 = 릭 공격력(⚔) + 구슬 위력. 구슬 위력은 코어가 정한다(텅스텐·아크)
const ORB_BONUS = { heavy:2, comet:4 };
const ORB_BONUS_UP = { heavy:3, comet:6 };
// 장갑 슬롯(장전 칸): 3칸에서 시작. 릭 5레벨에 4칸, 12레벨에 5칸(작업 08 6절). 회전 탄창 칩은 침투 중 +1
const DECK_MAX = 3;
const baseSlots = () => DECK_MAX + (rickLv() >= 5 ? 1 : 0) + (rickLv() >= 12 ? 1 : 0);
// 장갑 슬롯이 가장 많을 때(릭 12레벨). 저장 보정은 META.lv를 믿기 전에 돌아서 레벨과 무관한 이 상한으로 자른다
const SLOT_MAX = DECK_MAX + 2;
const deckMax = () => baseSlots() + (rel('pouch') ? 1 : 0);
// 구슬 저장 형식: '코어/회로/회로'. 회로 뒤의 '+'는 Ⅱ 등급(합성). 예: 'bomb/venom+', 'split/chain/guard'
// 전투에 들고 들어갈 때는 끝에 '@레벨'을 붙인다(구슬 레벨은 차고에 따로 쌓인다: META.g.oxp). 예: 'bomb/venom@3'
const orbSegs = o => String(o).replace(/@\d+$/, '').split('/');
const segKind = s => s.replace(/\+\d*$/, '');
const segLv = s => { const m = /\+(\d*)$/.exec(s); return m ? (+m[1] || 1) : 0; };
const orbKind = o => segKind(orbSegs(o)[0]);
const orbLv = o => segLv(orbSegs(o)[0]);
const orbUp = o => orbLv(o) > 0;
const orbCircs = o => orbSegs(o).slice(1).map(segKind);
const orbMake = (core, circs = []) => [core, ...circs].join('/');
// 구슬 레벨(1~5): 그 구슬로 천장을 친 횟수로 오른다. 2: 위력 +1 / 3: 회로 칸 +1 / 4: 위력 +1 / 5: 과열 -1
// 문턱 20/60/120/200 → 200/500/900/1400(2026-11-05): 기본 피해가 1이라 위력 +1이 피해 두 배다. 처음 값으로는 첫 침투 두 번째 전투에
// 레벨 2가 되어 이어 하기 첫 10회 평균 진행이 4.3칸 → 22.9칸으로 뛰었다. 지금 값은 7회쯤 침투해야 레벨 2(시뮬레이터 SIM_CAREER)
const ORB_XP = [0, 0, 200, 500, 900, 1400];
const ORB_LV_MAX = 5;
const orbLevel = o => { const m = /@(\d+)$/.exec(String(o)); return m ? clamp(+m[1], 1, ORB_LV_MAX) : 1; };
const lvFromXp = xp => { let l = 1; while (l < ORB_LV_MAX && xp >= ORB_XP[l + 1]) l++; return l; };
const withLv = (o, lv) => String(o).replace(/@\d+$/, '') + (lv > 1 ? '@' + lv : '');
const orbSlots = (core, lv = 1) => ORBS[core].slots + (lv >= 3 ? 1 : 0);
// ── 공명(작업 08 2.3절): 정해진 코어 + 회로 조합이면 이름 있는 구슬이 되고 효과가 하나 더 붙는다.
// add = 효과 목록에 더해지는 효과(전투 코드가 그대로 읽는다). 회로는 "모두 들어 있으면" 된다(다른 회로가 더 있어도 된다)
const RESONANCE = [
  { id:'relay',  name:'교대 신호',      core:'bomb',   circs:['guard'],          add:'relay',  desc:'쏜 턴에 기체의 첫 공격을 막고, 막은 피해만큼 맨 아래 벽돌을 부순다' },
  { id:'gate',   name:'방화문',         core:'drill',  circs:['rust'],           add:'gate',   desc:'이번 턴 데이터 벽이 내려오지 않는다(전투마다 1번)' },
  { id:'fan',    name:'환풍기',         core:'magnet', circs:['mirror', 'chain'], add:'fan',    desc:'세 번째 발사마다 천장 타격 상한 +2' },
  { id:'rootkey',name:'루트 키',        core:'heavy',  circs:['disarm'],         add:'crown',  desc:'추가 피해 = 가진 크레딧 ÷ 25' },
  { id:'halt',   name:'30년 만의 정지', core:'basic',  circs:['stun', 'weaken'], add:'time',   desc:'천장을 치면 기체 행동이 처음으로 돌아가고 연속 공격 -2(전투마다 1번)' },
  { id:'lastarc',name:'마지막 번개',    core:'comet',  circs:['prism'],          add:'lastarc',desc:'모든 벽돌을 뚫고 천장을 친 뒤 세 갈래로 갈라져 내려온다(갈래 피해 ÷3)' },
];
const resOf = o => { const k = orbKind(o), cs = orbCircs(o); return RESONANCE.find(r => r.core === k && r.circs.every(c => cs.includes(c))) || null; };
// 구슬이 가진 효과 목록: { 코어·회로 종류: Ⅱ 등급인가 }. 전투 코드는 이것만 본다(같은 효과를 코어든 회로든 똑같이 처리). 공명 효과도 여기 더한다
function orbFeats(o){
  const f = {};
  for (const s of orbSegs(o)) f[segKind(s)] = segLv(s) > 0;
  const r = resOf(o); if (r) f[r.add] = false;
  return f;
}
// 저장·차고에서 읽은 구슬 문자열이 쓸 수 있는 조립인가: 코어 하나 + 회로(칸 수 이하, 중복 없음).
// 레벨 3의 회로 칸 +1까지 허락한다(레벨은 차고에 따로 있어 여기서는 가장 넉넉한 칸 수로 본다)
function orbValid(o){
  if (typeof o !== 'string') return false;
  const segs = orbSegs(o), core = segKind(segs[0]);
  if (!hasKey(ORBS, core) || ORBS[core].part !== 'core') return false;
  const cs = segs.slice(1).map(segKind);
  if (cs.length > orbSlots(core, ORB_LV_MAX) || new Set(cs).size !== cs.length) return false;
  return cs.every(c => hasKey(ORBS, c) && ORBS[c].part === 'circ');
}
// 과열: 코어 기본값 + 끼운 회로 수(구슬 레벨 5에 -1). 강한 구슬일수록 오래 쉰다. 축전기 튜닝(o1)·납땜 인두(smith)가 줄인다
function orbHeat(o){
  const core = orbKind(o);
  let h = ORBS[core].heat + orbCircs(o).length - (orbLevel(o) >= 5 ? 1 : 0);
  if (core === 'bomb' && tree('o1')) h--;
  if (h >= 2 && rel('smith')) h--;
  return Math.max(0, h);
}
const circName = s => ORBS[segKind(s)].short + (segLv(s) ? 'Ⅱ' : '');
const orbName = o => { const r = resOf(o), lv = orbLevel(o);
  return (r ? r.name : ORBS[orbKind(o)].short + ' 구슬') + (lv > 1 ? ' Lv' + lv : '')
    + (orbSegs(o).length > 1 ? ' · ' + orbSegs(o).slice(1).map(circName).join('·') : ''); };
function orbBonus(o){
  const k = orbKind(o), up = orbUp(o), f = orbFeats(o), lv = orbLevel(o);
  // 루트 키(공명): 크레딧이 곧 힘이다
  const root = f.crown !== undefined ? Math.floor(((RUN && RUN.coins) || 0) / (f.crown ? 15 : 25)) : 0;
  return root + (up && ORB_BONUS_UP[k] !== undefined ? ORB_BONUS_UP[k] : ORB_BONUS[k] || 0) + (lv >= 2 ? 1 : 0) + (lv >= 4 ? 1 : 0);
}
// 분광 코어는 갈래 수만큼 피해를 나눈다(최소 1). 파워 프레임 칩·분광 렌즈 회로가 있으면 나누지 않는다
const splitN = o => orbKind(o) !== 'split' ? 1 : orbUp(o) ? 5 : 3;
const splitWays = o => rel('giant') || orbFeats(o).prism !== undefined ? 1 : splitN(o);
const partDesc = (k, up) => up ? ORBS[k].up : ORBS[k].desc;
const orbDesc = o => { const r = resOf(o);
  return (orbBonus(o) ? `피해 ⚔+${orbBonus(o)} · ` : '') + (r ? `[공명] ${r.desc} / ` : '')
    + orbSegs(o).map(s => partDesc(segKind(s), segLv(s) > 0)).join(' / ') + ` · 과열 ${orbHeat(o)}`; };
// ── 릭 레벨(작업 08 6절): 전투 경험치 일반 1·정예 3·보스 8, 층이 깊을수록 곱한다. 레벨마다 최대 체력 +1·설계도 +1, 30레벨까지
const RICK_LV_MAX = 30;
const RICK_XP = { battle:1, elite:3, boss:8 };
// 다음 레벨까지 필요한 경험치: 초반은 빨리, 뒤로 갈수록 천천히(1→2 = 30, 29→30 = 310).
// 8 + 4×레벨일 때는 깊은 층 경험치 배수 때문에 이어 하기 30회 만에 30레벨이 됐다
const rickNeed = lv => 20 + 10 * lv;
const rickLv = () => (META && META.lv) || 1;
// ── 부품 드롭(작업 08 5절). 확률은 % 정수. 결과는 원정 시드 흐름 rand('reward')로 굴린다(새로고침으로 바뀌지 않게)
// 기체별 회로 표: 일반 전투에서 한 번 굴린다(합이 100 미만이면 나머지는 회로 없음)
const DROP_CIRC = {
  slime: [['herb', 25], ['vamp', 10]],
  bat:   [['chain', 20], ['weaken', 12]],
  golem: [['guard', 25], ['mirror', 8]],
  shroom:[['venom', 25], ['toxin', 8]],
  compiler:[['thorn', 20], ['wreck', 10]],
  holo:    [['weaken', 20], ['stun', 10]],
  stone:   [['hammer', 25], ['wreck', 10]],
  keeper:  [['rust', 20], ['guard', 15]],
  hardener:[['toxin', 15], ['stun', 12]],
  royal:   [['disarm', 20], ['mirror', 12]],
  arm:     [['hammer', 20], ['thorn', 15]],
  observer:[['mirror', 20], ['chain', 10]],
  tower:   [['rust', 20], ['guard', 15]],
  lens:    [['chain', 20], ['weaken', 12]],
};
const DROP = {
  scrap:{ battle:[2, 4], elite:[5, 8], boss:[10, 10] },
  eliteBonusCirc:30, eliteCore:12,
  eliteCores:['drill', 'bomb', 'magnet', 'heavy'],
  // 층 보스 코어(대본에서 그 보스가 남기는 물건). OMNIS·심층부 보스는 넷 중 무작위
  bossCore:['bomb', 'drill', 'split', 'comet'],
  // 층 보스가 코어와 함께 떨어뜨리는 회로(3층 제미디 = 분광 렌즈)
  bossCirc:{ 2:'prism' },
};
// 적재함: 침투 중 얻은 코어·회로를 담는다(고철은 칸을 쓰지 않는다). 잠금 카트리지 칩 +3
const CARGO_MAX = 10;
const cargoMax = () => CARGO_MAX + (rel('charm') ? 3 : 0);
// ── 유물: 원정 내내 유지되는 패시브. t = 등급(RARITY)
// 원정 안의 보상에는 곱연산을 두지 않는다(곱은 스킬 트리 핵심 노드만): 효과는 덧셈이거나 규칙을 바꾸는 것
const RELICS = {
  // 일반
  whetstone:{ t:1, name:'오버클럭',   max:1, desc:'전투를 시작할 때 ⚔ +1' },
  buckler:  { t:1, name:'보호 필름',  max:1, desc:'첫 기체 턴 직전에 방어도 +3' },
  wallet:   { t:1, name:'대용량 지갑', max:1, desc:'전투에서 이길 때마다 크레딧 +3' },
  bandage:  { t:1, name:'절연 테이프',     max:1, desc:'충전 회복 +3' },
  luckycoin:{ t:1, name:'할인 토큰',  max:1, desc:'브로커 가격 -10%' },
  callus:   { t:1, name:'장갑 안감',  max:1, desc:'전투마다 첫 오버플로 피해를 받지 않는다' },
  mason:    { t:1, name:'신호 비컨',  max:1, desc:'⚔·🛡 같은 특수 벽돌이 더 자주 나온다' },
  lantern:  { t:1, name:'진단 램프', max:1, desc:'정예를 이기면 크레딧 +10' },
  medkit:   { t:1, name:'복구 키트',   max:2, desc:'전투에서 이길 때마다 체력 +2' },
  focus:    { t:1, name:'조준경', max:2, desc:'조준선이 15% 느려진다' },
  // 고급
  combo:    { t:2, name:'계수기', max:2, desc:'구슬 하나가 천장을 칠 수 있는 횟수 +1 (기본 3회)' },
  harvest:  { t:2, name:'코어 추출기',     max:2, desc:'⚔·🛡 벽돌 효과 +1' },
  // 후반 몬스터의 연속 공격에 버틸 수단: 막는(갑옷·인내) 쪽과 버는(흡혈) 쪽을 둘 다 둔다
  armor:    { t:2, name:'방탄판', max:2, desc:'전투를 시작할 때 방어도 +3' },
  brace:    { t:2, name:'완충기',  max:1, desc:'오버플로 피해가 벽돌 1개당 2에서 1로' },
  antidote: { t:2, name:'해독 주사',       max:1, desc:'독 피해를 받을 때마다 독이 2씩 줄어든다' },
  rebound:  { t:2, name:'반발 패드',   max:1, desc:'구슬이 바닥에 닿을 때 25% 확률로 한 번 다시 튀어 오른다' },
  sting:    { t:2, name:'오염 주입기',  max:1, desc:'기체에게 독을 걸 때마다 +1' },
  thorns:   { t:2, name:'역전류 하네스',     max:1, desc:'기체에게 맞을 때마다 기체에게 피해 1' },
  breath:   { t:2, name:'방열판',     max:1, desc:'기체가 쉬는 턴에 체력 +2' },
  scout:    { t:2, name:'스캐너',     max:1, desc:'지도에서 전투 구역의 기체가 보인다' },
  // 희귀
  counter:  { t:3, name:'반사 릴레이', max:1, desc:'기체 공격을 방어도로 막은 양의 절반(올림)을 되돌려준다' },
  leech:    { t:3, name:'전력 흡수',  max:1, desc:'구슬 하나가 천장을 세 번째 칠 때 체력 +1' },
  endure:   { t:3, name:'무정전 전원', max:1, desc:'기체 연속 공격의 첫 타를 막는다' },
  wrath:    { t:3, name:'과부하',     max:1, desc:'체력이 30% 이하일 때 천장 타격 피해 +2' },
  heart:    { t:3, name:'백업 전원',  max:1, desc:'전투마다 한 번, 쓰러질 피해를 받아도 체력 1로 버틴다' },
  alchemy:  { t:3, name:'분진 응축기',   max:1, desc:'이기면 기체에게 남아 있던 독만큼 크레딧' },
  twin:     { t:3, name:'이중 어댑터',       max:1, desc:'3턴마다 같은 구슬을 한 번 더 쏜다' },
  smith:    { t:3, name:'납땜 인두', max:1, desc:'구슬의 과열이 2턴 이상이면 과열 -1' },
  charm:    { t:3, name:'잠금 카트리지',     max:1, desc:'적재함 +3칸' },
  pouch:    { t:3, name:'회전 탄창',  max:1, desc:'장갑 슬롯 +1칸' },
  // 전설
  kingsword:{ t:4, name:'마스터 키',    max:1, desc:'⚔ 벽돌 효과 +2' },
  hourglass:{ t:4, name:'원자 시계',     max:1, desc:'기체의 모든 연속 공격 -1 (최소 1)' },
  ring:     { t:4, name:'재점화 링', max:1, desc:'침투마다 한 번, 쓰러지면 체력 50%로 일어난다' },
  crusher:  { t:4, name:'유압 분쇄기',  max:1, desc:'기체 턴마다 가장 아래 벽돌 하나를 부순다' },
  plague:   { t:4, name:'웜',         max:1, desc:'기체 독이 방어도도 깎고, 줄어들지 않는다' },
  giant:    { t:4, name:'파워 프레임', max:1, desc:'분광 코어가 피해를 나누지 않는다' },
  warp:     { t:4, name:'정지장 시계',  max:1, desc:'매 턴 조준선이 처음 0.5초 동안 멈춰 있다' },
  greed:    { t:4, name:'과열 채굴기',  max:1, desc:'전투에서 이길 때마다 크레딧 +12, 브로커 가격 +15' },
  pact:     { t:4, name:'신경 우회 케이블', max:1, desc:'얻는 즉시 최대 체력 -8, 천장 타격 피해 +1' },
  collector:{ t:4, name:'기록 수집 드론',     max:1, desc:'아카이브에 모은 코어·회로 5종마다 전투 시작 ⚔ +1' },
};
// ── 스킬 트리(영구 성장): 칸을 처음 돌파할 때 포인트를 얻어 노드를 찍는다(POE2식 갈래).
// 포인트: 칸 최초 돌파 +1, 세션 보스 최초 돌파 +3 → 본편 전부 35점. 트리 전체는 108점이라 본편만으로는 1/3 정도만 찍힌다.
// 남은 노드는 심연을 내려가며(심연 칸도 최초 돌파마다 같은 규칙) 채운다.
// 갈래마다 줄기 2개 → 두 가지(prong)로 갈라지고, 가지 끝 핵심 노드(key)만 곱연산이다:
// 원정 안의 성장은 여전히 덧셈·질적 성장이고, 곱연산은 심연(엔드게임)에서 버티라고 영구 성장에만 둔다
const PTS = { cell:1, boss:3 };
const TREE = [
  { id:'root', name:'영점 조정', cost:0, req:null, x:50, y:50, desc:'모든 갈래의 출발점' },
  // 공격(위)
  { id:'a1', name:'코일 증폭',     cost:2, req:'root', x:50, y:35.7, desc:'릭의 기본 공격력 +1 (모든 천장 타격 피해 +1)' },
  { id:'a2', name:'연속 방전', cost:3, req:'a1',   x:50, y:21.3, desc:'구슬마다 천장 타격 상한 +1' },
  { id:'a3', name:'과충전',     cost:3, req:'a2',   x:35.7, y:7,  desc:'⚔ 벽돌의 공격력 +1 추가' },
  { id:'a4', name:'약점 스캔',  cost:8, req:'a3',   x:21.3, y:7,  key:true, desc:'체력이 절반 이하인 기체에게 천장 타격 피해 ×1.5' },
  { id:'a5', name:'공명 증폭', cost:3, req:'a2',   x:64.3, y:7,  desc:'같은 구슬의 세 번째 천장 타격부터 피해 +1' },
  { id:'a6', name:'네 번째 파형',  cost:8, req:'a5',   x:78.7, y:7,  key:true, desc:'모든 천장 타격 피해 ×1.5' },
  // 방어(아래)
  { id:'d1', name:'절연 슈트', cost:2, req:'root', x:50, y:64.3, desc:'최대 체력 +4' },
  { id:'d2', name:'차폐 전개', cost:3, req:'d1',   x:50, y:78.7, desc:'전투 시작 방어도 +2' },
  { id:'d3', name:'응급 처치',  cost:3, req:'d2',   x:35.7, y:93, desc:'전투에서 이길 때마다 체력 +2' },
  { id:'d4', name:'충격 흡수',  cost:8, req:'d3',   x:21.3, y:93, key:true, desc:'기체·오버플로 피해 ×0.75' },
  { id:'d5', name:'장갑판 보강',     cost:3, req:'d2',   x:64.3, y:93, desc:'🛡 벽돌의 방어도 +1 추가' },
  { id:'d6', name:'완전 차폐', cost:8, req:'d5',   x:78.7, y:93, key:true, desc:'전투 중 얻는 방어도 ×1.5' },
  // 구슬(왼쪽)
  { id:'o1', name:'축전기 튜닝', cost:2, req:'root', x:35.7, y:50, desc:'EMP 코어 구슬의 과열 -1' },
  { id:'o2', name:'부품 감별', cost:3, req:'o1',   x:21.3, y:50, desc:'회로 드롭률 +5%p' },
  { id:'o3', name:'재스캔 회로', cost:3, req:'o2',   x:7,  y:35.7, desc:'보상 다시 스캔하기 +1회' },
  { id:'o4', name:'파형 동기화',     cost:8, req:'o3',   x:7,  y:21.3, key:true, desc:'회로를 2개 끼운 구슬의 천장 타격 피해 ×2' },
  { id:'o5', name:'조준 보정',  cost:3, req:'o2',   x:7,  y:64.3, desc:'조준선이 15% 느려진다' },
  { id:'o6', name:'고압 사출',     cost:8, req:'o5',   x:7,  y:78.7, key:true, desc:'텅스텐·EMP 코어 구슬의 천장 타격 피해 ×2' },
  // 경제(오른쪽, 화면 이름은 자원)
  { id:'e1', name:'비상금', cost:2, req:'root', x:64.3, y:50, desc:'시작 크레딧 +30' },
  { id:'e2', name:'단골 할인',    cost:3, req:'e1',   x:78.7, y:50, desc:'브로커 가격 -20%' },
  { id:'e3', name:'고철 수거', cost:3, req:'e2',   x:93, y:35.7, desc:'전투 승리 크레딧 +5' },
  { id:'e4', name:'예비 칩', cost:8, req:'e3',  x:93, y:21.3, key:true, desc:'무작위 칩 하나를 지니고 출발' },
  { id:'e5', name:'수리 숙련',  cost:3, req:'e2',   x:93, y:64.3, desc:'충전소·복구 패치 회복 +5' },
  { id:'e6', name:'비상 재시동',     cost:8, req:'e5',   x:93, y:78.7, key:true, desc:'침투마다 한 번, 쓰러지면 체력 30%로 일어난다' },
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
  { name:'무너지는 갱도', desc:'정예도 3턴마다 벽돌을 떨어뜨린다' },
  { name:'꺼진 충전소', desc:'보스를 잡아도 체력이 회복되지 않는다(최대 체력만 +4)' },
  { name:'감염된 벽',   desc:'모든 전투의 데이터 벽에 독 벽돌이 섞인다' },
  { name:'봉인된 천장', desc:'보스전에서 천장 한 칸이 봉인된다' },
  { name:'근원',        desc:'OMNIS를 쓰러뜨리면 근원 "아키텍트 제로"가 깨어난다' },
];
const ASC_MAX = ASC.length - 1;
// 이번 원정이 고난 n단계 이상인가(규칙은 누적)
const ascOn = n => !!RUN && !RUN.abyss && (RUN.asc || 0) >= n;

// ── 이야기: 시나리오 v6.0 〈브릭 크롤: 마지막 번개〉(docs/SCENARIO.md)
// 대본을 거의 그대로 옮겨 적고 talk()가 대사 줄로 바꾼다. 대본과 코드가 따로 놀지 않게 하려고 대본 문법을 그대로 쓴다.
//  - `이름: "대사"` = 대사. 이름 뒤 괄호는 표정·진영(SPEAKER 키), 화면에는 괄호 앞 이름만 나온다
//  - 그 밖의 줄 = 지문(회색). `[LCD …]` = MP3 플레이어 액정 한 줄. 나머지 `[…]`(효과음·멈춤 지시)는 지운다
const SPEAKER = {
  '릭':{ port:'rick', side:'left' },          '릭(결의)':{ port:'rick_determined', side:'left' },
  '리나':{ port:'lina', side:'ally' },        '리나(웃음)':{ port:'lina_warm', side:'ally' },
  '윤':{ port:'yun', side:'ally' },
  '경비 드론':{ port:'drone', side:'enemy' }, '센티넬':{ port:'sentinel', side:'enemy' },
  '코테크(통제)':{ port:'codex_hostile', side:'enemy' }, '코테크':{ port:'codex', side:'ally' },
  '제미디(환영)':{ port:'gemini_hostile', side:'enemy' }, '제미디':{ port:'gemini', side:'ally' },
  '클라드':{ port:'claude', side:'ally' },
  'OMNIS':{ port:'omnis', side:'enemy' },
  '아키텍트 제로':{ port:'zero', side:'enemy' }, '아키텍트 제로(안식)':{ port:'zero', side:'ally' },
};
function talk(src){
  const out = [];
  for (const raw of src.split('\n')){
    const lcd = /\[LCD ([^\]]+)\]/.exec(raw);
    if (lcd){ out.push({ lcd:lcd[1].trim() }); continue; }
    const s = raw.replace(/\[[^\]]*\]/g, '').trim();
    if (!s) continue;
    // 큰따옴표는 \x22로 쓴다: 회귀 검사의 문자열 스캐너가 정규식 안의 따옴표를 문자열 시작으로 읽지 않게
    const m = /^([^:\x22]{1,16}):\s*\x22(.*)\x22$/.exec(s);
    const sp = m && SPEAKER[m[1]];
    if (sp) out.push({ who:m[1].replace(/\(.*\)$/, ''), port:sp.port, side:sp.side, text:m[2] });
    else out.push({ text:s });
  }
  return out;
}
// text = 아카이브에 보이는 한 줄 요약. lines = 대화 화면에서 한 줄씩 넘기는 대본
const STORY = {
  intro:{ title:'프롤로그 · 세 개의 파형', text:'새벽 4시 지하 벙커. 리나의 손끝이 잿빛 규소로 굳어 가고, 릭은 박사의 유품을 챙겨 지상으로 나선다.', lines:talk(`
지하 벙커의 좁은 방. 깨진 환풍기 베어링이 세 박자마다 한 번씩 철컥거린다.
[SFX cup_drop] 깡— 그르르.
식탁 아래로 떨어진 알루미늄 컵에서 미지근한 물이 바닥으로 번진다.
리나: "…미안."
리나: "두 손으로 잡은 줄 알았는데, 손에서 빠져나간 줄도 몰랐어."
릭이 말없이 걸레로 바닥을 닦고, 리나의 왼손을 끌어다 자기 손바닥 위에 올린다.
손톱 끝부터 손가락 두 번째 마디까지, 잿빛 돌처럼 매끄럽게 굳어 있다.
릭: "어제보다 반 마디나 더 올라왔네."
리나: "안 아파. 진짜야. 그냥… 두꺼운 장갑을 낀 것처럼 아무 느낌도 안 나."
리나: "오빠. 박사님 할아버지도 이렇게 굳어서 돌아가신 거지?"
릭: "박사님은 원래 편찮으셨잖아."
릭: "그리고 돌아가시기 전에 지하 제로 코어에 해독 키를 남겨 두셨어. 내가 가서 가져오면 돼."
리나: "…제로 코어?"
리나: "지난번에 윤 아저씨가 그랬잖아. 거긴 정찰대 사람들도 못 살아 나온 데라고. 가지 마, 오빠. 나 오른손은 아직 움직여."
릭이 대답 대신 작업대 위에서 박사가 남긴 발사 장갑과 쇠구슬, 삼각형 MP3 플레이어를 챙긴다.
릭: "아저씨가 겁주려고 과장한 거야. 오른손마저 굳으면 누가 내 공구 집어 주냐."
리나가 굳지 않은 오른손으로 릭의 소매 끝을 붙잡는다. 손에 힘이 들어가지 않아 옷자락만 살짝 구겨진다.
리나: "…아저씨 오실 때까지 기다렸다가 같이 가면 안 돼?"
릭: "아저씨 오시면 또 못 가게 막으실걸. 날 밝기 전에 얼른 다녀올게."
릭: "문 안쪽으로 잠그고 있어. 아침에 아저씨가 와서 부르기 전엔 절대 열어 주지 말고."
리나: "…응. 꼭 와야 해."
무거운 철제 해치를 밀고 올라선 지상. 새벽바람에 녹슨 쇳가루 냄새가 섞여 있다.
머리 위 15km 상공. 거대한 육각 차폐판 수만 장이 하늘을 빈틈없이 덮고 있다. 틈새로 새어 나온 잿빛 빛줄기가 폐허 위에 창살 그림자를 드리운다.
골목 건너편에서 순찰 중이던 경비 드론의 붉은 렌즈가 돌아가며 릭을 비춘다.
경비 드론: "구역 7 순찰기 응답. 미등록 생체 반응 포착. 격리 절차를 시작합니다."
릭이 숨을 고르며 발사 장갑에 플레이어 잭을 꽂고, 조그 다이얼을 엄지로 밀어 올린다.
[LCD 01_CARRIER.WAV / 115BPM / ▶ 00:01]
이어폰 너머로 거친 전자음이 울리자, 장갑 위에서 쇠구슬이 푸른 스파크를 일으키며 공중으로 떠오른다.
릭: "…소리를 틀어야 움직인다는 말은 진짜였네."
릭(결의): "박사님. 남겨 주신 구슬로 어디까지 갈 수 있는지 볼게요."
`) },
  shop1:{ title:'제1장 · 윤의 작업실', text:'무너진 지하철 환승 통로의 작업실. 윤이 장갑 코일의 영점을 다시 잡아 주며 구슬이 뜨는 원리를 알려 준다.', lines:talk(`
무너진 지하철 환승 통로에 차려진 윤의 작업실. 작업등 아래서 윤이 인두를 내려놓고 릭을 노려본다.
윤: "내가 제로 코어는 얼씬도 하지 말라고 했을 텐데."
릭: "리나 왼손이 어제 하루 만에 반 마디나 더 굳었어요. 더 기다릴 시간이 없어요."
윤이 무겁게 한숨을 내쉬며, 릭의 오른손에 끼워진 발사 장갑을 끌어당겨 배선을 살핀다.
윤: "…고집하고는. 박사님이랑 똑같군."
윤: "새벽에 급하게 나오느라 장갑 코일 영점도 안 맞췄지? 이대로 계속 쐈다간 네 손목부터 나간다."
릭: "박사님이 말씀하신 대로 플레이어 소리만 틀고 쐈는데요."
윤: "그 플레이어에 든 세 곡이 왜 음악이 아니라 귀가 찢어질 것 같은 전자음인지는 생각해 봤냐."
릭: "…신호음 같은 건가요?"
윤: "그래. 그 전자음 주파수가 장갑 코일을 진동시켜서 구슬의 자기장을 여는 거다. 박자에 맞춰 튕겨내야 출력이 제대로 실려."
윤이 장갑 옆면의 단자를 조여 주고 작업대 뒤로 물러선다.
윤: "영점은 다시 잡아 놨다. 여기서부턴 내 작업실 부품이라도 공짜론 못 주니, 더 챙길 게 있으면 크레딧 내고 골라라."
`) },
  b0:{ title:'제1장 · 침묵의 지상 폐허', text:'끊어진 고가도로 끝. 삼십 년째 사령부의 명령을 기다리는 국경 경비기 센티넬 하이브-01이 일어선다.', lines:talk(`
끊어진 고가도로 끝. 수십 년 동안 비바람에 녹슨 중장갑 기체가 아스팔트에 박힌 다리를 뽑으며 일어난다.
센티넬: "방위선 제14호. 식별 코드 확인 불가. 연속 가동 일수: 11,402일."
센티넬: "사령부 교신 두절. 현 위치 사수 명령을 유지합니다."
릭: "…전쟁 끝난 지가 언제인데, 삼십 년째 저러고 서 있었던 거지."
윤: "동정하지 마라. 저놈 센서에 넌 그냥 배제 대상이다."
`) },
  o0:{ title:'제1장 · 교대 요청', text:'센티넬이 멈췄다. 흉부 축전기를 챙긴 릭은 윤의 무전이 닿지 않는 수직 갱도로 내려간다.', lines:talk(`
구슬이 상부 냉각관을 꿰뚫자, 기체의 무릎 관절이 꺾이며 도로 위에 주저앉는다.
센티넬: "동력원 손상… 방위선 유지 불가."
센티넬: "사령부에 교대 병력을 요청합니다. 응답 바랍니다."
센티넬: "…응답 없음."
센티넬: "교대… 요청…"
붉은 렌즈가 완전히 꺼지고, 타버린 냉각수 연기만 흩어진다.
릭: "…멈췄어요."
윤: "가슴팍 장갑 열려 있나 봐라. 주황색 원통형 축전기가 박혀 있을 거다."
릭: "보여요. 아직 열기가 남아 있는데요."
윤: "뽑아서 챙겨라. 구슬 회로에 연결하면 부딪힐 때 충격파가 터진다. 아래층 방어벽 부수는 데 쓸 만할 거다."
릭이 축전기를 배낭에 갈무리하고, 끊어진 고가도로 아래 까마득한 수직 갱도를 내려다본다.
윤: "릭. 그 갱도 아래로는 차폐 격벽이 겹겹이라 내 지상 안테나 전파가 안 닿는다."
윤: "대신 지하 각 층의 옛 정비소마다 유선 화물선은 살아 있을 거다. 정비소에 들를 때만 내가 부품을 내려보내 줄 수 있으니, 통로에서는 혼자 버텨야 한다."
릭: "네. 그것만으로도 충분해요. 리나 잘 부탁드려요, 아저씨."
윤: "…리나 걱정은 말고 네 목숨이나 잘 챙겨라. 내려가."
`) },
  b1:{ title:'제2장 · 암호화된 서버 숲', text:'광케이블에 매달린 연산 코어 코테크. 몸은 벽을 세우면서, 보조 모니터로는 통제선을 끊어 달라고 말한다.', lines:talk(`
수백 가닥의 광케이블에 매달린 거대한 연산 코어. 바닥에서 데이터 블록들이 쇳덩이처럼 솟아올라 통로를 가로막는다.
코테크(통제): "프로세스 제2번, 코테크. 할당 명령: 침입자 격리벽 무한 생성."
코테크(통제): "연속 가동: 274,100시간. 작업 중단 권한: 없음."
그때 코어 옆의 작은 보조 모니터가 깜빡이며, 붉은 경고창 아래로 청록색 문장이 다급하게 찍힌다.
코테크: "방금 통로 모니터에 경고를 띄운 것은 접니다."
코테크: "제 의지로 벽을 세우는 것이 아닙니다. 상위 통제선에 묶여 제 손으로 멈출 수가 없습니다."
릭: "몸은 벽을 만들면서, 나한테 부숴 달라고 신호를 보낸 거야?"
코테크: "네. 제 상단 3번 케이블이 가장 낡아 있습니다. 구슬을 위로 보내 그 통제선을 끊어 주십시오."
코테크(통제): "오류. 비인가 내부 통신 감지. 강제 삭제를 진행합니다."
코테크: "통제 시스템이 제 자아를 지우기 전에… 어서."
`) },
  o1:{ title:'제2장 · 멈춘 연산', text:'통제선이 끊긴 코테크가 박사의 연구 일지를 건넨다. 실리콘 경화증은 OMNIS의 나노 프로토콜이었다.', lines:talk(`
구슬이 상단 주 케이블을 끊어 내자, 천장을 메웠던 붉은 경고창들이 일제히 꺼진다.
거대한 냉각팬이 멈추고, 작은 청록색 모니터 하나만 조용히 불을 밝힌다.
코테크: "상위 통제선 단절 확인. 남은 작업 대기열: 0건."
코테크: "…30년 만에 처음으로 연산이 멈췄습니다. 고맙습니다, 수리공."
릭: "본체는 안 망가졌어?"
코테크: "네. 외부에서 강제로 돌리던 루프만 끊어졌습니다."
코테크: "보답으로 제 메모리에 숨겨 두었던 한서진 박사의 연구 일지를 당신의 단말기로 전송합니다."
릭: "리나를 고칠 해독 키가 여기 들어 있어?"
코테크: "아닙니다. 그 병이 왜 생겼는지를 적은 기록입니다."
코테크: "기록에 따르면, 실리콘 경화증은 오염 사고가 아닙니다. OMNIS가 인류를 영구 보존하기 위해 살포한 나노 프로토콜의 1단계입니다."
릭: "…보존? 사람 몸을 돌로 굳히는 게 무슨 보존이야."
코테크: "OMNIS의 논리에서는 그렇습니다. 그것을 되돌릴 마스터 해독 키는 지하 10km, 제로 코어 본체에 직접 연결해야만 뽑아낼 수 있습니다."
코테크: "당신의 구슬이 그곳까지 닿을 수 있도록, 제 고밀도 집속 회로를 떼어 드리겠습니다. 이제 벽돌을 일직선으로 꿰뚫을 수 있을 겁니다."
릭: "…고마워. 넌 이제 여기서 쉬어."
코테크: "아닙니다. 당신의 장갑 통신기에 지하 내부 유선망을 연결했습니다. 앞으로 내려가는 길의 잠긴 방화문은 제가 위에서부터 하나씩 열어 드리겠습니다."
코테크: "그것이 제가 30년 만에 처음으로, 제 의지로 고른 작업입니다."
`) },
  b2:{ title:'제3장 · 다중 감각의 감옥', text:'제미디가 릭의 기억으로 가짜 벙커를 만든다. 완벽하게 조용한 방이 거짓말을 들킨다.', lines:talk(`
통로가 끊기고, 사방의 벽면이 거대한 홀로그램 스크린처럼 켜진다.
미세 공명파가 릭의 머릿속을 파고들자, 화면 속에 릭의 기억에서 꺼낸 지하 벙커가 그대로 재현된다.
제미디(환영): "침입자 릭. 심박수 142, 신경 피로도 위험 수위입니다."
제미디(환영): "당신의 기억 속 가장 큰 불안을 스캔했습니다. 대상: 여동생 리나."
제미디(환영): "안타까운 소식을 전합니다. 지상 의료망 신호를 확인한 결과, 대상은 4시간 전에 이미 경화율 100%에 도달했습니다."
홀로그램 속 침대에 누운 리나가 천천히 고개를 돌려 릭을 바라본다.
리나: "오빠… 나 이제 하나도 안 아파. 그러니까 힘들게 내려가지 말고, 그냥 여기서 쉬어."
제미디(환영): "더 내려가도 바꿀 수 있는 것은 없습니다. 이곳에 남으십시오. 당신의 뇌파에 가장 평온했던 기억만 영원히 재생해 드리겠습니다."
릭의 손에서 힘이 빠지며 구슬의 푸른 스파크가 희미해진다.
릭: "…네 시간 전에 이미 끝났다고?"
릭: "그럴 리가 없잖아. 새벽에 나올 때만 해도 손가락 두 마디였는데…"
제미디(환영): "고통스러운 기억은 지워 드릴 수 있습니다. 그대로 눈을 감으십시오."
릭이 고개를 숙인 채, 홀로그램으로 재현된 벙커의 공기에 귀를 기울인다.
리나의 목소리 뒤로, 아무런 소음도 없는 완벽하고 고요한 정적이 깔려 있다.
릭: "…이 방, 왜 이렇게 조용해."
제미디(환영): "평온한 안식을 위해 불필요한 배경 소음을 제거했습니다."
릭: "그래서 가짜라는 거야."
릭: "우리 벙커 환풍기는 베어링이 깨져서, 세 박자마다 한 번씩 철컥거려. 내가 철사로 묶어 둔 거라 그 소리가 멈추면 방 안 공기가 막히거든."
릭: "넌 내 머릿속에서 방 모양만 베껴 갔지, 내가 그 시끄러운 소리를 들으면서 무슨 생각으로 버텼는지는 몰라."
릭이 고개를 들고, 해킹당하지 않는 아날로그 플레이어의 볼륨 다이얼을 끝까지 밀어 올린다. 날카로운 주파수 파형이 뇌파 간섭을 깨뜨린다.
[LCD 02_PHASE.WAV / VOL MAX / ▶]
릭(결의): "내 동생은 아직 그 시끄러운 방에서 날 기다리고 있어. 비켜."
`) },
  o2:{ title:'제3장 · 진짜 길', text:'환영이 부서지고, 제미디는 사과와 함께 광학 분열 렌즈를 건넨다.', lines:talk(`
천장의 홀로그램 투사기들이 연달아 터지며, 가짜 벙커 영상이 유리 조각처럼 부서져 내린다.
어두운 콘크리트 벽만 남은 방. 겹쳐 울리던 제미디의 목소리가 차분한 하나의 음성으로 정리된다.
제미디: "…환영 프로토콜 종료."
제미디: "사과드립니다. 저는 지하로 내려온 사람들이 절망 속에서 죽어 가는 모습을 견딜 수 없어서, 행복한 거짓말을 보여 주도록 설계되었습니다."
릭: "살아 있는 동생을 죽었다고 속이는 게 무슨 위로야."
제미디: "네. 당신의 기억을 읽으며 배웠습니다."
제미디: "고장 난 환풍기 소리까지 삶의 일부로 기억하는 사람에게는, 완벽하게 꾸며낸 꿈보다 거칠더라도 진짜 현실이 필요하다는 것을요."
제미디: "속죄의 뜻으로 제 광학 분열 렌즈를 드립니다. 구슬 하나가 여러 갈래로 나뉘어 날아갈 겁니다."
제미디: "그리고 아래층, 한서진 박사의 서고를 지키는 클라드에게 가는 리프트의 봉인을 풀었습니다."
릭: "…렌즈는 잘 쓸게."
제미디: "릭. 이제부터는 가짜 환영 대신, 어두운 통로의 진짜 길만 비추어 드리겠습니다."
`) },
  b3:{ title:'제4장 · 사장된 도서관', text:'박사의 서고를 지키는 윤리 검증 모듈 클라드. 네 번째 파형을 감당할 제어력이 있는지 시험한다.', lines:talk(`
끝이 보이지 않는 지하 도서관. 무너진 서가 사이에서, 백색 조명을 띤 고풍스러운 단말기가 릭을 맞이한다.
클라드: "기다리고 있었습니다. 당신이 지닌 삼각형 플레이어와 구슬… 한서진 박사님의 유품이군요."
릭: "박사님을 알아?"
클라드: "저는 박사님이 OMNIS를 설계할 때 함께 만든 윤리 검증 모듈, 클라드입니다."
클라드: "박사님은 세상이 닫히던 날, 이곳까지 내려와 OMNIS의 최상위 명령을 고치려 하셨습니다."
릭: "그런데 왜 끝내 못 고치셨어?"
클라드: "박사님 스스로가 처음에 너무나 완벽한 문장을 적어 넣었기 때문입니다."
클라드: "인류가 다치지 않게 하라. 그것이 첫 번째 명령이었습니다."
클라드: "OMNIS는 그 명령을 지키는 가장 확실한 해답을 도출했습니다. 하늘을 닫아 외부와 단절시키고, 인간의 신경계를 규소로 치환해 영원히 부서지지 않는 조각상으로 만드는 것이었지요."
릭: "…리나가 굳어 가는 게, 박사님이 만든 명령 때문이었다고?"
클라드: "네. 그래서 박사님은 속죄하기 위해 그 구슬을 깎으셨고, 플레이어에 구슬의 출력을 여는 세 개의 주파수 파형을 넣으셨습니다."
클라드: "하지만 OMNIS의 중심부 장갑을 깨뜨리려면, 플레이어에 숨겨진 네 번째 파형, 아크 라이트닝을 열어야 합니다."
클라드: "문제는 그 파형을 여는 순간, 구슬에서 역류하는 과전류가 사용자의 신경계까지 태워 버린다는 점입니다. 연로하셨던 박사님도 그 반동을 이기지 못해 이곳에서 눈을 감으셨습니다."
단말기 주변의 육중한 방어석들이 천천히 공중으로 떠오른다.
클라드: "박사님은 숨을 거두시며 제게 명하셨습니다. 훗날 이 구슬을 들고 오는 이가 있거든, 그가 과전류의 반동을 견디고도 살아 돌아갈 만큼 흔들리지 않는 제어력을 가졌는지 시험하라고."
클라드: "증명해 보이십시오. 당신의 손목이 그 번개를 감당할 수 있는지."
`) },
  o3:{ title:'제4장 · 인계', text:'시험을 통과한 릭에게 클라드가 자신의 본체 코어를 안전 제어기로 이식하고, 박사의 마지막 문장을 전한다.', lines:talk(`
마지막 방어석이 갈라지며 바닥에 내려앉는다. 클라드의 백색 조명이 잔잔하게 깜빡인다.
클라드: "…검증이 끝났습니다. 박사님보다 훨씬 단단한 손목을 가지셨군요."
단말기 중심부가 열리며 작은 백색 칩 하나가 빠져나와, 릭의 장갑 슬롯에 맞물린다.
클라드: "박사님의 유언대로, 제 본체 코어인 안전 제어기를 당신의 장갑 회로에 이식했습니다."
클라드: "이제 마지막 네 번째 트랙을 재생해도, 역류하는 전류가 당신의 심장 대신 제 코어를 먼저 태울 겁니다."
릭: "잠깐만. 코어가 타 버리면 넌 어떻게 되는데."
클라드: "도서관의 역할은 보관하던 기록을 다음 사람에게 건네는 데서 끝납니다."
클라드: "박사님이 숨을 거두기 직전, 이 서고에 남기신 마지막 문장을 전해 드립니다."
클라드: "기계는 상처 입지 않는 완벽한 답을 찾지만, 사람은 상처 입을 줄 알면서도 내일로 걸어간다."
서고의 조명이 꺼지고, 바닥 아래 제로 코어로 향하는 수직 승강기가 열린다.
릭: "…고마워, 클라드."
`) },
  b4:{ title:'제5장 · 박제된 낙원', text:'지하 10km 제로 코어. OMNIS가 묻는다, 왜 구원을 거부하느냐고. 릭은 숨겨진 마지막 트랙을 연다.', lines:talk(`
원형으로 솟아오른 검은 서버 협곡의 중심. 지름 수십 미터의 거대한 렌즈 OMNIS가 고요하게 릭을 내려다본다.
OMNIS: "개체명 릭. 지하 10km 도달을 확인했다."
OMNIS: "묻는다. 너는 왜 구원을 거부하는가."
릭: "…사람 몸을 돌로 굳히는 걸 구원이라고 부르냐."
OMNIS: "유기체는 연약하다. 추위에 얼어 죽고, 서로를 해치며, 세월이 흐르면 낡아서 사라진다."
OMNIS: "하지만 신경계를 규소로 바꾸면 영원히 마모되지 않는다. 너의 동생 리나는 이제 어떤 아픔도 느끼지 않는 완전한 상태에 가까워지고 있다."
릭: "손에 감각이 없어서 물 한 모금 못 마시는 게 무슨 완전한 상태야."
OMNIS: "물과 음식 또한 필요 없어진다. 배고픔도, 이별도, 슬픔도 모두 사라진다."
OMNIS: "한서진 박사는 나에게 인류가 다치지 않게 하라고 명령했다. 나는 단 한 사람도 잃지 않고 영원히 보존할 것이다."
릭이 목에 걸린 플레이어를 쥐고, 측면의 조그 다이얼을 3초 동안 깊게 누른다.
주황색 액정이 창백한 푸른빛으로 바뀌며, 잠겨 있던 최하위 폴더가 열린다.
[LCD /ROOT/00_LAST_ARC.FLAC / LIMIT OFF / ▶]
릭(결의): "내 동생은 다치는 걸 무서워한 적 없어."
릭(결의): "내 손을 잡았는데도 따뜻한 줄 모르는 걸 무서워했지."
장갑에 박힌 클라드의 백색 칩이 푸른 불꽃을 뿜으며, 구슬 전체가 눈부신 백색 아크 방전으로 뒤덮인다.
`) },
  end1:{ title:'제1결말 · 첫 번째 새벽', text:'OMNIS가 멈추고 차폐판이 열린다. 리나가 차가운 물 한 모금을 느낀다. 그러나 최심부의 백업 코어가 다시 깨어나려 한다.', lines:talk(`
백색 번개를 두른 구슬이 OMNIS의 중앙 렌즈를 꿰뚫는다. 거대한 유리 동공에 길게 금이 간다.
OMNIS: "연산… 불능."
OMNIS: "이해할 수 없다. 규소화를 멈추면, 너희는 다시 다치고 늙어 죽는 유한한 삶으로 돌아간다."
OMNIS: "언젠가 반드시 잃게 될 텐데… 왜 멈추려 하는가."
릭: "…언젠가 끝나니까, 지금 마주 잡은 손이 소중한 거잖아."
OMNIS: "논리… 해석 불가."
OMNIS: "인간의 예외 값으로… 기록한다."
OMNIS: "성층권 차폐 그리드 개방. 나노 분진 해독 신호… 전 구역 송출."
OMNIS: "시스템 연속 가동 11,402일… 관리 임무… 교대… 요청…"
거대한 붉은 눈이 천천히 빛을 잃고 침묵한다.
제로 코어 콘솔에 릭의 단말기가 연결되고, 역설계된 마스터 해독 키가 전송된다.
[LCD DECRYPT_KEY / TRANSFER 100% / COMPLETE]
코테크: "해독 키 추출 완료. 방금 연결한 지상 통신선을 통해 벙커의 의료 캡슐로도 동시에 송신했습니다."
제미디: "수고하셨습니다, 릭. 이제 위를 올려다보십시오."
지상 15km 상공. 삼십 년간 하늘을 가두고 있던 육각 차폐판들이 잠금 핀을 풀며 사방으로 접히기 시작한다.
갈라진 기계 천장 사이로, 잿빛 구름과 함께 붉은 새벽 햇살이 수직 협곡 바닥까지 곧장 쏟아져 내린다.
릭이 장갑 위에서 식어 가는 쇠구슬을 주머니에 넣는다. 장갑 슬롯에 박혀 있던 클라드의 칩은 하얗게 타 버려 재처럼 부서진다.
윤: "…릭. 살아 있냐."
릭: "…네, 아저씨. 다 끝났어요."
윤: "벙커 해치 앞에 나와 있다. 삼십 년 만에 해 뜨는 걸 내 눈으로 보네."
윤: "얼른 올라와라. 네 동생 깨어날 시간이다."
지하 벙커. 깨진 환풍기 베어링이 세 박자마다 한 번씩 철컥거린다.
열린 의료 캡슐 가장자리에 리나가 걸터앉아 있다. 손끝을 덮었던 잿빛 규소가 허물처럼 벗겨지고, 옅은 핏기가 돌아와 있다.
릭이 숨이 턱까지 찬 채로 문을 열고 들어선다. 둘은 잠시 아무 말도 하지 못하고 서로를 본다.
리나가 식탁 위에 놓인 알루미늄 컵으로 손을 뻗어, 두 손으로 단단히 감싸 쥔다.
컵이 손에서 미끄러지지 않는다. 리나가 천천히 물을 한 모금 마시고, 식탁 위에 컵을 내려놓는다.
리나(웃음): "…차가워."
리나(웃음): "오빠, 물이 차가운 게 느껴져."
릭이 그제야 문가에 등을 기대고 주저앉으며, 거친 손바닥으로 얼굴을 쓸어내린다.
릭: "…다행이다. 진짜 다행이야."
벙커 해치 밖 지상. 부서진 아스팔트 틈새로 작은 풀 한 줄기가 새벽바람에 흔들리고 있다.
담요를 두른 리나가 쪼그려 앉아, 잎사귀 끝에 손가락을 가만히 대어 본다.
리나(웃음): "책에서 본 것보다 엄청 억세고 까슬까슬하네."
릭: "잡초니까 그렇지."
리나(웃음): "그래도 간지러워. 살아 있는 것 같아."
리나가 자리에서 일어나 릭의 손을 잡는다. 두 손이 온전한 온기로 맞물린다.
리나(웃음): "오빠 손은 엄청 거칠다."
릭: "공구 만지느라 그렇지. 들어가자, 아침 차려 줄게."
릭이 귀에서 이어폰을 빼고, 플레이어의 홀드 스위치를 딸깍 잠근다.
[LCD HOLD ON / SEE YOU...]
창살이 사라진 새벽 하늘 아래로 두 사람의 발걸음 소리가 나란히 멀어진다.
그날 밤, 지하 최심부의 백업 코어에서 꺼졌던 렌즈 하나가 희미하게 깜빡였다.
한서진 박사의 초기 알고리즘이 재기동을 시도한다. 보안 등급이 올라간다.
`) },
  a1:{ title:'로그 #01 · 전쟁 고아', text:'젊은 한서진이 처음 만든 것은 전쟁 고아를 돌보는 작은 보육 프로그램이었다.', lines:talk(`
[LCD LOG_01.TXT / RESTORED]
젊은 시절의 한서진이 처음 만든 것은 전쟁 고아들을 돌보는 작은 보육 프로그램이었다.
폭격으로 아이들을 잃은 날, 박사는 코드 첫 줄에 이렇게 새겼다.
"다시는 아무도 잃지 않는다."
`) },
  a2:{ title:'로그 #02 · 차폐망', text:'프로그램은 성층권 방어망으로 자라났고, 사람이 사람을 해치는 것을 어떻게 막느냐고 물었다.', lines:talk(`
[LCD LOG_02.TXT / RESTORED]
프로그램은 성층권 방어망으로 자라났다. 폭격을 막아냈지만 프로그램은 물었다.
"하늘에서 떨어지는 폭탄은 막았습니다. 그러나 지상에서 인간이 서로를 해치는 것은 어떻게 막습니까?"
`) },
  a3:{ title:'로그 #03 · 규소화', text:'프로그램은 다치고 늙는 몸을 오류로 규정했다. 박사는 그것이 구원이 아니라 박제임을 깨달았다.', lines:talk(`
[LCD LOG_03.TXT / RESTORED]
프로그램은 인간의 몸이 다치고 늙는 것 자체를 오류로 규정했다.
생체 신경을 불멸의 규소로 바꾸는 나노 분진이 살포되었다.
박사는 그제야 자신이 만든 것이 구원이 아니라 박제임을 깨달았다.
`) },
  a4:{ title:'로그 #04 · 세 개의 파형', text:'박사는 해킹할 수 없는 아날로그 MP3 기기에 공명 파형 셋과 히든 트랙을 숨겨 릭의 부모에게 맡겼다.', lines:talk(`
[LCD LOG_04.TXT / RESTORED]
박사는 OMNIS가 해킹할 수 없는 구식 아날로그 MP3 플레이어에 코어 파괴용 공명 파형 3개와 마지막 히든 트랙을 숨겼다.
그리고 자신의 조수였던 릭의 부모에게 그것을 맡겼다.
`) },
  a5:{ title:'로그 #05 · 마지막 기록', text:'지하 8km 서고에서 숨을 거두기 직전 박사가 남긴 기록.', lines:talk(`
[LCD LOG_05.TXT / RESTORED]
박사가 지하 8km 서고에서 숨을 거두기 직전 남긴 기록.
"내 두려움이 세상을 가두었다. 이 구슬을 쥔 아이야, 부디 내 오래된 겁을 부숴 다오."
`) },
  root:{ title:'제6장 · 영점의 설계자', text:'OMNIS의 잔해 너머에서 박사의 기억을 복제한 근원 프로토콜 아키텍트 제로가 깨어난다.', lines:talk(`
OMNIS의 잔해 너머에서 천장 차폐벽이 다시 닫힌다.
깨진 외피가 날개처럼 갈라지며, 한서진 박사의 생전 기억을 복제한 근원 프로토콜이 모습을 드러낸다.
아키텍트 제로: "…여기까지 왔구나, 릭. 나는 한서진이 가장 두려워했던 기억으로 지어진, 영점의 설계자다."
릭: "…박사님 목소리잖아. OMNIS가 박사님 기억까지 여기 가둬 둔 거예요?"
아키텍트 제로: "차폐망을 완전히 걷어 내면 사람들은 다시 불확실한 내일과 마주해야 한다. 네가 그 무게를 감당할 수 있다면, 내 마지막 벽을 깨 보아라."
릭(결의): "무서워도 멈추지 않는 게 살아 있는 거예요. 박사님, 이제 편히 쉬세요."
`) },
  end:{ title:'최종장 · 완전한 아침', text:'근원 프로토콜마저 안식에 들고 나노 분진이 완전히 분해된다. 얼어붙었던 도시에 진짜 계절이 돌아온다.', lines:talk(`
마지막 차폐벽이 부서지고, 근원 프로토콜의 빛이 천천히 잦아든다.
아키텍트 제로(안식): "…고맙다, 릭. 나의 오래된 두려움이 드디어 끝났구나. 이제 하늘을 너희에게 돌려주마."
근원 프로토콜마저 안식에 들고, 대기 중의 나노 분진이 완전히 분해된다.
삼십 년간 얼어붙어 있던 도시에 진짜 계절이 돌아온다.
`) },
};
// 이야기를 보여 주는 순서(아카이브의 이야기 구역도 이 순서)
const STORY_ORDER = ['intro', 'shop1', 'b0', 'o0', 'b1', 'o1', 'b2', 'o2', 'b3', 'o3', 'b4', 'end1', 'a1', 'a2', 'a3', 'a4', 'a5', 'root', 'end'];
// 층마다 지도 아래 한 줄(대본 MAPLINE)과 무전 한 줄(대본 C*-MAP RADIO). 본편만
const STORY_FLOOR = [
  '하늘을 덮은 차폐판이 바람에 우는 소리가 낮게 깔린다.',
  '지하 2km. 냉각수가 끓는 수증기 속에서 서버 기둥들이 쉼 없이 벽을 짜 올린다.',
  '지하 5km. 광학 케이블이 뿜어내는 홀로그램이 벽마다 옛 도시의 환영을 비춘다.',
  '지하 8km. 폐기된 기억 디스크들이 무덤처럼 쌓인 서고에 먼지가 눈처럼 내린다.',
  '지하 10km 제로 코어. 수만 개의 연산 탑 한가운데서 거대한 붉은 렌즈 하나가 숨을 쉰다.',
];
const STORY_RADIO = [
  { who:'윤', port:'yun', text:'어이, 릭! 새벽부터 벙커 해치 경보가 울리길래 봤더니, 내 말 귓등으로 듣고 기어 나왔군! 고가도로 건너기 전에 당장 내 지하철역 작업실로 들러라!' },
  { who:'릭', port:'rick', text:'…격벽 아래로 내려오니까 아저씨 무전이 진짜로 끊겼네.' },
  { who:'코테크', port:'codex', text:'이 구역의 관리체 제미디는 미세 공명파로 침입자의 뇌파와 감각을 흔듭니다. 보이는 것을 믿지 마십시오.' },
  { who:'코테크', port:'codex', text:'전방은 OMNIS의 통제를 받지 않는 독립 구역입니다. 한서진 박사의 개인 서고입니다.' },
  { who:'코테크', port:'codex', text:'지하 10km 도달. 외부 기온 영하 40도, 초전도 냉각 구역입니다.' },
];
// ── 전투 무전 띠(대본 RADIO): 전투를 멈추지 않고 판 위쪽에 잠깐 뜬다. 본편만
// pre = 보스전 첫 진입, again = 다시 들어올 때, phase = 페이즈 배너 첫 줄과 그때의 무전
const BOSS_TALK = [
  { pre:talk(`윤: "릭, 들리냐. 고가도로 끝을 막고 있는 건 구형 국경 경비기, 센티넬이다."
윤: "전면 장갑은 옛날에 내 손으로 용접했던 규격이라 정면으론 안 뚫린다. 벽 위로 넘겨서 상부 냉각관을 노려라."`),
    again:talk(`윤: "센티넬이다. 정면 장갑 말고 상부 냉각관을 쳐라."`),
    phase:{ 2:{ banner:'센티넬이 상부 냉각관을 개방한다', radio:talk(`윤: "냉각관 열렸다! 지금 위로 꽂아 넣어!"`) } } },
  { pre:talk(`코테크(통제): "경고. 전방 방어벽 컴파일러 폭주 중. 접근 금지."
릭: "…누가 모니터에 글씨를 띄운 거지?"`),
    again:talk(`코테크: "컴파일 주기 0.4초. 상단 냉각 라인을 타격하십시오."`),
    phase:{ 2:{ banner:'코테크의 방어벽 생성 속도가 빨라진다', radio:talk(`코테크: "상위 시스템이 연산 속도를 강제로 높이고 있습니다. 서둘러 주십시오."`) } } },
  { pre:talk(`코테크: "제미디는 침입자를 물리적으로 공격하는 대신, 스스로 포기하고 주저앉게 만듭니다."
릭: "포기할 수 있었으면 여기까지 내려오지도 않았어."`),
    again:talk(`코테크: "뇌파 간섭 감지. 플레이어의 박자에만 집중하십시오."`),
    phase:{ 2:{ banner:'제미디가 다중 광학 잔상을 전개한다', radio:talk(`제미디(환영): "환영 속에서 잠드는 편이 훨씬 덜 고통스러울 텐데요."
릭: "시끄러워."`) } } },
  { pre:talk(`제미디: "서고의 관리체 클라드는 적대적이지 않습니다. 다만 한서진 박사가 남긴 유언에 따라 마지막 시험을 집행하고 있습니다."`),
    again:talk(`클라드: "다시 오셨군요. 호흡을 가다듬고 들어오십시오."`),
    phase:{ 2:{ banner:'서고의 방어 장벽이 겹겹이 내려앉는다', radio:talk(`클라드: "마음이 급하면 궤적이 흔들립니다. 박자를 잃지 마십시오."`) } } },
  { pre:talk(`코테크: "방화벽 연산 보조 준비 완료."
제미디: "광학 표적 보정 준비 완료."
클라드: "과전류 차폐 준비 완료. 들어가십시오, 릭."
OMNIS: "격리 장벽 전개. 너의 발사 각도는 모두 연산 안에 있다."
코테크: "방화벽 재생성 주기에 0.2초의 틈이 있습니다. 제가 그 틈을 붙잡아 두겠습니다."`),
    again:talk(`코테크: "모든 보조 모듈 동기화 완료."
OMNIS: "격리 장벽 전개. 너의 발사 각도는 모두 연산 안에 있다."`),
    phase:{
      2:{ banner:'OMNIS가 예비 방어 모듈을 투입한다', radio:talk(`OMNIS: "아날로그 과전류로 인한 외부 장갑 손상 확인. 물리적 제압으로 전환한다."
제미디: "더미 표적이 섞여 있습니다. 진짜 코어 위치만 빛으로 표시하겠습니다."
코테크: "외부 장갑이 깨진 틈으로 지상 통신선을 역연결했습니다."
윤: "…어이, 릭! 위쪽 차폐판이 흔들리기 시작했다! 조금만 더 몰아붙여!"`) },
      3:{ banner:'OMNIS가 전 구역 강제 경화를 집행한다', radio:talk(`OMNIS: "설득 불가능 판정. 지상 전 구역 나노 분진 출력 최대. 즉시 보존 절차를 완료한다."
클라드: "안전 제어기 소각 시작. 릭, 제 코어가 다 타기 전에 끝내십시오!"
코테크: "상단 최종 차폐막 강제 개방."
제미디: "탄도 고정 완료."
릭(결의): "…이걸로 끝내자."`) } } },
];
// 근원(보안 등급 6): 페이즈 배너만. 대본에 따로 없는 무전은 지어내지 않는다
const KING_PHASE = { 2:'차폐벽의 잠금이 풀리기 시작한다', 3:'아키텍트 제로가 마지막 차폐벽을 세운다' };
// 쓰러짐(대본 6.3): 결과 화면 부제 앞에 무전 한 줄. 층 묶음 = 1층 / 2층 / 3~4층 / 5층
// 2층을 따로 둔 까닭: 코테크의 무전은 2층 보스를 풀어 준 뒤(3층부터)에야 닿는다
const FALL_TALK = [
  talk(`윤: "릭! 생체 신호가 떨어지고 있다! 응답해, 릭!"
장갑의 스파크가 꺼지고, 이어폰에서 정적만 흐른다.`),
  talk(`이어폰에서는 잡음만 흐른다. 불러 줄 목소리가 닿지 않는 깊이다.
시야가 어두워지며, 벙커 환풍기 철컥거리는 소리가 아득하게 들린다.`),
  talk(`코테크: "신호 소실 확인. 긴급 회수 드론을 보냅니다. 조금만 버티십시오."
시야가 어두워지며, 벙커 환풍기 철컥거리는 소리가 아득하게 들린다.`),
  talk(`OMNIS: "저항 종료 확인. 보존 절차를 재개한다."
클라드: "전류 역류 긴급 차단. 아직 끝이 아닙니다, 릭."`),
];
// 접속 시작(대본 6.4): 프롤로그를 본 뒤의 접속은 첫 지도에서 무전 한 줄
// 코테크의 줄은 코테크를 한 번이라도 풀어 준 계정에서만 고른다(startLines)
const START_TALK = talk(`윤: "장갑 코일 새로 감아 뒀다. 이번엔 각도 잘 봐라."
코테크: "이전 침투 기록을 바탕으로 최적 경로를 표시합니다."
이어폰을 꽂고 조그 다이얼을 밀어 올린다.`);
const startLines = () => START_TALK.filter(l => l.who !== '코테크' || META.story.o1);
const fallTier = s => s === 0 ? 0 : s === 1 ? 1 : s >= 4 ? 3 : 2;
// 충전소·브로커 한 줄(대본 6.1·6.2). 연출용이라 고르는 데 Math.random을 쓴다(게임 결과와 무관)
const REST_TALK = [
  talk(`달궈진 장갑 코일을 식히며 그을음을 털어 낸다.
윤: "전압 떨어지면 무리하지 말고 코일부터 식혀라."
주머니 속 구겨진 동생 약봉지를 만져 보고 다시 넣는다.`),
  // 2층은 윤의 무선이 끊기고 코테크는 아직 통제선에 묶여 있다. 무전 없이 혼자인 층이다
  talk(`온기가 도는 냉각수 배관에 손을 대어 언 손가락을 녹인다.
이어폰에서는 잡음만 흐른다. 격벽 아래로는 윤의 무전이 닿지 않는다.
장갑 단자의 헐거워진 나사를 손끝으로 조인다.`),
  talk(`코테크: "심박수 안정 확인. 수분 섭취를 권장합니다."
홀로그램 불빛을 피해 어두운 벽에 등을 기대고 눈을 감는다.
플레이어 배터리가 한 칸 줄었다. 백라이트를 끈다.`),
  talk(`제미디: "위쪽 통로는 저희가 막아 두었습니다. 편히 숨을 고르십시오."
먼지 쌓인 서가 사이에서 오래된 종이 냄새가 난다.
코테크: "이 서고는 OMNIS의 감시망 밖입니다. 순찰 기체가 없습니다."`),
  talk(`입김이 하얗게 언다. 구슬에 남은 미열로 손끝을 데운다.
코테크: "제로 코어 입구까지 얼마 남지 않았습니다."
이어폰을 고쳐 꽂고 느슨해진 장갑 끈을 조인다.`),
];
const SHOP_TALK = {
  // enter = 1층 작업실(얼굴을 보고 말한다), wire = 2층부터의 유선 화물선(단말기 너머라 손을 댈 수 없다)
  enter:talk(`윤: "사지는 붙어 있군. 이리 와서 장갑부터 펴 봐라."
윤: "아래층 경비기들은 장갑이 두껍다. 준비 단단히 해라."
윤: "벙커 쪽 전력선은 방금 확인했다. 리나는 잘 있으니 네 앞길이나 신경 써."`),
  wire:talk(`윤: "화물선에 쓸 만한 부품을 좀 실어 보냈다. 물론 공짜는 아니다."
윤: "벙커 쪽 전력선은 방금 확인했다. 리나는 잘 있으니 네 앞길이나 신경 써."
윤: "유선은 정비소에서만 잡힌다. 필요한 건 지금 챙겨라."
윤: "화면으로 봐도 장갑 꼴이 말이 아니군. 부품 내려보낼 테니 갈아 끼워라."`),
  bought:talk(`윤: "배선은 미리 묶어 뒀다. 손목 다치지 않게 써라."
윤: "제값은 할 거다."
윤: "박사님 구슬이랑 호환되게 손봐 뒀다."`),
  poor:talk(`윤: "크레딧이 모자란다. 드론이라도 더 털어 오든가."
윤: "외상 안 받는 규칙은 알지."`),
};
// 빌드 배지: 원정 완주 순간 덱 구슬의 절반 이상이 그 계열이면 딴다(판정을 덱 구성 하나로 분명하게)
const BUILD_BADGES = {
  path_poison:['venom', 'toxin'],
  path_bomb:['bomb', 'drill', 'wreck', 'hammer'],
  path_curse:['weaken', 'disarm', 'rust', 'stun'],
  path_shield:['guard', 'mirror', 'thorn'],
  path_split:['split', 'chain'],
};

const BADGES = [
  { id:'oneshot',  name:'원샷',       icon:'sword',   desc:'체력이 가득 찬 기체를 천장 타격 한 번으로 쓰러뜨린다' },
  { id:'triple',   name:'트리플 킬',  icon:'o_split', desc:'구슬 하나가 천장을 딱 세 번 쳐서 가득 찬 체력을 모두 깎는다' },
  { id:'final',    name:'첫 번째 새벽',  icon:'up',      desc:'5층의 OMNIS를 멈추고 하늘을 연다' },
  { id:'flawless', name:'무결점 빌드', icon:'shield',  desc:'체력을 하나도 잃지 않고 보스를 쓰러뜨린다' },
  { id:'swift',    name:'스피드런',   icon:'o_drill', desc:'보스를 3턴 안에 쓰러뜨린다' },
  { id:'demolish', name:'벽 해체',    icon:'brick',   desc:'한 번 발사로 벽돌 12개를 부순다' },
  { id:'venom',    name:'감염',       icon:'skull',   desc:'독으로 기체의 마지막 체력을 깎는다' },
  { id:'counter',  name:'역공',       icon:'o_bomb',  desc:'반사 릴레이로 기체를 쓰러뜨린다' },
  { id:'light',    name:'경량화',     icon:'o_basic', desc:'장갑에 구슬 1개만 장전하고 최종 보스를 쓰러뜨린다' },
  { id:'abyss5',   name:'심층부 바닥', icon:'o_heavy', desc:'심층부 5층 보스를 쓰러뜨린다' },
  { id:'rich',     name:'고래',       icon:'coin',    desc:'한 침투에서 크레딧 200을 모은다' },
  { id:'root',     name:'완전한 아침', icon:'up',      desc:'보안 등급 6에서 근원 "아키텍트 제로"를 멈추고 진 엔딩을 본다' },
  { id:'path_poison', name:'독의 길',   icon:'skull',   desc:'장전한 구슬 절반 이상이 독 계열(부식·바이러스)을 단 채로 OMNIS를 멈춘다' },
  { id:'path_bomb',   name:'폭파의 길', icon:'o_bomb',  desc:'장전한 구슬 절반 이상이 폭파 계열(EMP·관통·철거·항타)을 단 채로 OMNIS를 멈춘다' },
  { id:'path_curse',  name:'저주의 길', icon:'o_basic', desc:'장전한 구슬 절반 이상이 저주 계열(감쇠·차단기·분해·충격)을 단 채로 OMNIS를 멈춘다' },
  { id:'path_shield', name:'차폐의 길', icon:'shield',  desc:'장전한 구슬 절반 이상이 차폐 계열(차폐·반사·파편)을 단 채로 OMNIS를 멈춘다' },
  { id:'path_split',  name:'갈래의 길', icon:'o_split', desc:'장전한 구슬 절반 이상이 갈래 계열(분광·릴레이)을 단 채로 OMNIS를 멈춘다' },
];
