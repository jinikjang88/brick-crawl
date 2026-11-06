// 차고·부품: 구슬 조립(코어 + 회로), 장전, 부품 드롭, 적재함·송신(작업 08 1단계),
// 구슬 레벨·회로 합성·공명·릭 레벨(3단계)
'use strict';

// ── 장전: 차고에서 고른 구슬이 침투의 장갑 슬롯이 된다(RUN.deck). RUN.load = 슬롯마다 차고 구슬 번호(구슬 경험치를 돌려줄 곳)
// 장전이 비거나 깨져도 침투는 시작돼야 한다: 그때는 첫 구슬(없으면 번개 구슬)로
function loadout(max){
  const g = META.g, idx = g.load.filter(i => g.orbs[i] && orbValid(g.orbs[i])).slice(0, max);
  if (!idx.length) return { deck:[g.orbs[0] && orbValid(g.orbs[0]) ? g.orbs[0] : 'basic'], load:[0] };
  return { deck:idx.map(i => g.orbs[i]), load:idx };
}
const loadedOrbs = () => loadout(baseSlots()).deck;
// 침투 중(정비소)에 차고를 고치면 지금 장갑에도 바로 반영한다. 회전 탄창 칩으로 늘어난 칸까지 채운다
function syncRunDeck(){
  if (!RUN) return;
  const l = loadout(deckMax()); RUN.deck = l.deck; RUN.load = l.load;
  saveRun();
}
const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; if (o[k] <= 0) delete o[k]; };
const countAll = o => Object.values(o).reduce((a, b) => a + b, 0);
// 회로 보관함 키: 'venom'(Ⅰ) / 'venom+'(Ⅱ)
const circBase = k => k.replace(/\+$/, '');
const circLabel = k => ORBS[circBase(k)].name + (k.endsWith('+') ? 'Ⅱ' : '');
const circText = k => partDesc(circBase(k), k.endsWith('+'));
// 차고 구슬의 레벨(천장 타격 수로)
const garageLv = i => lvFromXp((META.g.oxp && META.g.oxp[i]) || 0);

// ── 부품 드롭: 전투 결과(node.t)와 기체(node.mon)로 정한다. rand('reward')만 쓴다(새로고침해도 같은 드롭)
// 회로 드롭률 보너스: 부품 감별 모듈 +5%p, 보안 등급마다 +2%p, 심층부 층마다 +1%p(깊이 갈 이유)
const dropBonus = () => (tree('o2') ? 5 : 0) + (RUN.abyss ? RUN.s + 1 : (RUN.asc || 0) * 2);
function randomCirc(){
  const w = {}; for (const k of DROP_CIRCS) w[k] = RARITY[ORBS[k].rar].w;
  return pickW(w, 'reward');
}
function rollDrops(node){
  const kind = node.t === 'elite' || node.t === 'boss' ? node.t : 'battle';
  const d = { scrap:0, cores:[], circs:[] };
  const [lo, hi] = DROP.scrap[kind];
  d.scrap = lo + rnd(hi - lo + 1, 'reward');
  const table = DROP_CIRC[node.mon] || [], bonus = dropBonus();
  if (kind === 'battle'){
    // 표에서 한 번 굴린다: 칸마다 확률 + 보너스를 나눠 더하고, 남는 몫은 "회로 없음"
    let x = rand('reward') * 100;
    for (const [k, p] of table){ x -= p + bonus / table.length; if (x < 0){ d.circs.push(k); break; } }
  } else if (kind === 'elite'){
    if (table.length){ const w = {}; for (const [k, p] of table) w[k] = p; d.circs.push(pickW(w, 'reward')); }
    if (rand('reward') * 100 < DROP.eliteBonusCirc + bonus) d.circs.push(randomCirc());
    // 4층부터 텅스텐 코어가 두 배로 잘 나온다(깊은 층의 무게)
    if (rand('reward') * 100 < DROP.eliteCore){
      const w = {}; for (const k of DROP.eliteCores) w[k] = k === 'heavy' && RUN.s >= 3 ? 2 : 1;
      d.cores.push(pickW(w, 'reward'));
    }
  } else {
    d.circs.push(randomCirc(), randomCirc());
    const floorBoss = !RUN.abyss && node.mon === 'boss';
    d.cores.push(floorBoss ? DROP.bossCore[RUN.s] : DROP.bossCore[rnd(DROP.bossCore.length, 'reward')]);
    // 3층 보스(제미디)는 분광 렌즈 회로도 남긴다(공명 "마지막 번개"의 재료)
    if (floorBoss && DROP.bossCirc[RUN.s]) d.circs.push(DROP.bossCirc[RUN.s]);
  }
  return d;
}
// 적재함에 넣는다. 가득 차면 넘친 부품은 버려진다(고철은 칸을 쓰지 않는다). 돌려주는 값: 넣은 것·버린 것
function addCargo(d){
  const c = RUN.cargo, got = [], lost = [];
  c.scrap += d.scrap;
  for (const [list, box] of [[d.cores, c.cores], [d.circs, c.circs]])
    for (const k of list){
      if (countAll(c.cores) + countAll(c.circs) >= cargoMax()){ lost.push(k); continue; }
      bump(box, k); got.push(k); markSeen('orb', k);
    }
  return { got, lost };
}
// 송신: 적재함을 차고 보관함으로. 윤의 정비소·층 보스 처치·서버 장악 때만 열린다(익스트랙션)
function sendCargo(){
  const c = RUN.cargo, g = META.g;
  const n = countAll(c.cores) + countAll(c.circs);
  for (const k in c.cores) bump(g.cores, k, c.cores[k]);
  for (const k in c.circs) bump(g.circs, k, c.circs[k]);
  g.scrap += c.scrap;
  const sent = { parts:n, scrap:c.scrap };
  RUN.cargo = { cores:{}, circs:{}, scrap:0 };
  saveMeta(); saveRun();
  return sent;
}
const cargoParts = () => RUN && RUN.cargo ? countAll(RUN.cargo.cores) + countAll(RUN.cargo.circs) : 0;
// 화면 문구: "고철 +3 · 수리 회로"
const dropText = (d, res) => [d.scrap ? `고철 +${d.scrap}` : '', ...res.got.map(k => ORBS[k].name)].filter(Boolean).join(' · ')
  + (res.lost.length ? ` (적재함이 가득 차 ${res.lost.length}개를 버렸다)` : '');

// ── 성장(작업 08 3단계). 전투가 끝나면(이기든 지든) 구슬마다 천장 타격 수를 그 차고 구슬에 쌓는다.
// 구슬은 영구 장비라 쓰러져도 쌓인 경험치는 남는다(익스트랙션으로 잃는 것은 적재함뿐)
function creditOrbXp(hits){
  const g = META.g;
  if (!RUN || !Array.isArray(RUN.load) || !hits) return;
  hits.forEach((n, slot) => {
    const i = RUN.load[slot];
    if (!n || !(i in g.orbs)) return;
    const before = garageLv(i);
    g.oxp[i] = (g.oxp[i] || 0) + n;
    const after = garageLv(i);
    if (after > before){ toast(`구슬 레벨 업 · ${orbName(withLv(g.orbs[i], after))}`); sfx('badge'); }
  });
  saveMeta();
}
// 릭 경험치: 일반 1·정예 3·보스 8에 층 배수(본편 n층 = n배, 심층부는 5 + 층). 레벨마다 최대 체력 +1·설계도 +1
function gainRickXp(kind){
  if (META.lv >= RICK_LV_MAX) return;
  const mul = RUN.abyss ? 5 + RUN.s + 1 : RUN.s + 1;
  META.xp += (RICK_XP[kind] || 1) * mul;
  while (META.lv < RICK_LV_MAX && META.xp >= rickNeed(META.lv)){
    META.xp -= rickNeed(META.lv); META.lv++; META.pts++;
    // 최대 체력만 올린다(지금 체력은 그대로: 보안 등급 3의 '보스 뒤 회복 없음'을 깨지 않게)
    RUN.maxHp++;
    toast(`릭 레벨 업 · Lv${META.lv} · 설계도 +1`); sfx('badge');
  }
  if (META.lv >= RICK_LV_MAX) META.xp = 0;
  saveMeta();
}
// 공명 발견: 조립한 구슬이 공명 조합이면 아카이브에 영구 기록하고 알린다
function checkResonance(o){
  const r = resOf(o);
  if (!r || META.res[r.id]) return;
  META.res[r.id] = 1; saveMeta();
  toast(`공명 발견 · ${r.name}: ${r.desc}`); sfx('badge');
}

// ── 차고 화면. inRun = 정비소에서 열었는가(그때만 지금 장갑에 반영한다)
const loadSlots = inRun => inRun ? deckMax() : baseSlots();
function showGarage(back, inRun){
  const g = META.g, slots = loadSlots(inRun);
  const cards = g.orbs.map((o, i) => {
    const lv = garageLv(i), next = ORB_XP[lv + 1];
    return { name:orbName(withLv(o, lv)), orb:o, tag:(g.load.includes(i) ? '장전됨' : '보관') + (next ? ` · 경험치 ${g.oxp[i] || 0}/${next}` : ' · 최고 레벨'),
      desc:orbDesc(withLv(o, lv)), onPick:() => showOrbEdit(i, back, inRun) };
  });
  const pairs = Object.keys(g.circs).filter(k => !k.endsWith('+') && g.circs[k] >= 2).length;
  showChoice({ mode:'garage', title:'차고',
    sub:`릭 Lv${META.lv} · 장전 ${g.load.length}/${slots} · 보관함: 코어 ${countAll(g.cores)} · 회로 ${countAll(g.circs)} · 고철 ${g.scrap}`,
    cards, buttons:[
      { label:'새 구슬 조립', disabled:!countAll(g.cores), onClick:() => showNewOrb(back, inRun) },
      { label:'회로 합성', disabled:!pairs, onClick:() => showSynth(back, inRun) },
      { label:'돌아가기', primary:true, onClick:back }] });
}
// 구슬 하나 고치기: 장전·회로 끼우기/빼기·분해. 회로 칸은 구슬 레벨 3에 하나 늘어난다
function showOrbEdit(i, back, inRun){
  const g = META.g, o = g.orbs[i], slots = loadSlots(inRun), lv = garageLv(i);
  const done = () => { checkResonance(g.orbs[i]); saveMeta(); if (inRun) syncRunDeck(); showOrbEdit(Math.min(i, g.orbs.length - 1), back, inRun); };
  const core = orbKind(o), keys = orbSegs(o).slice(1), bases = keys.map(segKind), cap = orbSlots(core, lv), loaded = g.load.includes(i);
  const cards = [];
  cards.push({ name:loaded ? '장전 풀기' : '장전하기', tag:`장전 ${g.load.length}/${slots}`,
    desc:loaded ? '장갑 슬롯에서 뺀다(차고에는 남는다)' : '장갑 슬롯에 넣어 들고 나간다',
    disabled:loaded ? g.load.length <= 1 : g.load.length >= slots,
    onPick:() => { if (loaded) g.load = g.load.filter(x => x !== i); else g.load.push(i); sfx('pick'); done(); } });
  for (const k of keys) cards.push({ name:`${circLabel(k)} 빼기`, orb:circBase(k), tag:'보관함으로', desc:circText(k),
    onPick:() => { g.orbs[i] = orbMake(core, keys.filter(x => x !== k)); bump(g.circs, k); sfx('pick'); done(); } });
  if (keys.length < cap)
    for (const k of Object.keys(g.circs).filter(k => !bases.includes(circBase(k))))
      cards.push({ name:`${circLabel(k)} 끼우기`, orb:circBase(k), tag:`보관 ${g.circs[k]}개 · 과열 +1`, desc:circText(k),
        onPick:() => { g.orbs[i] = orbMake(core, keys.concat(k)); bump(g.circs, k, -1); sfx('badge'); done(); } });
  cards.push({ name:'분해하기', tag:'코어·회로를 보관함으로', desc:'구슬을 풀어 부품으로 돌려받는다(구슬 레벨은 사라진다)',
    disabled:g.orbs.length <= 1,
    onPick:() => {
      bump(g.cores, core); for (const k of keys) bump(g.circs, k);
      g.orbs.splice(i, 1); g.oxp.splice(i, 1);
      g.load = g.load.filter(x => x !== i).map(x => x > i ? x - 1 : x);
      if (!g.load.length) g.load = [0];
      saveMeta(); if (inRun) syncRunDeck(); sfx('pick'); showGarage(back, inRun);
    } });
  showChoice({ mode:'garage', title:orbName(withLv(o, lv)), sub:orbDesc(withLv(o, lv)) + ` · 회로 칸 ${keys.length}/${cap}`,
    cards, buttons:[{ label:'차고로', primary:true, onClick:() => showGarage(back, inRun) }] });
}
// 새 구슬: 보관함의 코어 하나로 빈 구슬을 만든다. 자리가 있으면 바로 장전
function showNewOrb(back, inRun){
  const g = META.g;
  showChoice({ mode:'garage', title:'코어를 고른다', sub:'코어가 구슬의 움직임을 정한다. 회로는 다음 화면에서 끼운다',
    cards:Object.keys(g.cores).map(k => ({ name:ORBS[k].name, orb:k, tag:`보관 ${g.cores[k]}개 · 회로 칸 ${ORBS[k].slots}`,
      desc:ORBS[k].desc + ` · 과열 ${ORBS[k].heat}`,
      onPick:() => {
        bump(g.cores, k, -1); g.orbs.push(orbMake(k)); g.oxp.push(0);
        const i = g.orbs.length - 1;
        if (g.load.length < loadSlots(inRun)) g.load.push(i);
        sfx('badge'); saveMeta(); if (inRun) syncRunDeck(); showOrbEdit(i, back, inRun);
      } })),
    buttons:[{ label:'차고로', primary:true, onClick:() => showGarage(back, inRun) }] });
}
// 회로 합성: 같은 회로 Ⅰ 두 개 + 고철 10 → Ⅱ 하나(효과가 한 단계 오른다)
// 고철 10 → 20: 1·2단계 동안 쌓인 고철로 Ⅱ 회로가 한꺼번에 쏟아지지 않게
const SYNTH_SCRAP = 20;
function synthCirc(k){
  const g = META.g;
  if (k.endsWith('+') || (g.circs[k] || 0) < 2 || g.scrap < SYNTH_SCRAP) return false;
  bump(g.circs, k, -2); bump(g.circs, k + '+'); g.scrap -= SYNTH_SCRAP;
  return true;
}
function showSynth(back, inRun){
  const g = META.g;
  const ks = Object.keys(g.circs).filter(k => !k.endsWith('+') && g.circs[k] >= 2);
  showChoice({ mode:'garage', title:'회로 합성', sub:`같은 회로 2개 + 고철 ${SYNTH_SCRAP} → Ⅱ 회로. 지금 고철 ${g.scrap}`,
    cards:ks.map(k => ({ name:`${ORBS[k].name}Ⅱ 만들기`, orb:k, tag:`${ORBS[k].short} 2개 + 고철 ${SYNTH_SCRAP}`, desc:partDesc(k, true),
      disabled:g.scrap < SYNTH_SCRAP,
      onPick:() => { if (synthCirc(k)){ sfx('badge'); toast(`합성 · ${ORBS[k].name}Ⅱ`); saveMeta(); } showSynth(back, inRun); } })),
    buttons:[{ label:'차고로', primary:true, onClick:() => showGarage(back, inRun) }] });
}

// ── 시뮬레이터 봇용 자동 조립: 합성할 수 있으면 하고, 회로는 빈 칸이 있는 장전 구슬부터(Ⅱ·높은 등급 먼저),
// 코어는 새 구슬로 만들어 빈 슬롯에 장전한다. 사람이 할 법한 단순한 정리(가장 센 것을 먼저)만 흉내 낸다
function autoGarage(inRun){
  const g = META.g, slots = loadSlots(inRun);
  for (const k of Object.keys(g.circs).sort((a, b) => ORBS[circBase(b)].rar - ORBS[circBase(a)].rar)) while (synthCirc(k));
  const coreOrder = ['comet', 'split', 'heavy', 'bomb', 'drill', 'magnet', 'basic'];
  for (const k of coreOrder) while (g.cores[k] > 0){ bump(g.cores, k, -1); g.orbs.push(orbMake(k)); g.oxp.push(0); }
  // 센 코어를 먼저 장전하되, 같은 코어는 하나씩만(기체마다 약점이 달라 여러 갈래를 들고 가는 편이 낫다). 칸이 남으면 겹쳐도 채운다
  const rank = o => coreOrder.indexOf(orbKind(o));
  const order = g.orbs.map((o, i) => i).sort((a, b) => rank(g.orbs[a]) - rank(g.orbs[b]));
  const seen = new Set(), first = [], rest = [];
  for (const i of order){ const k = orbKind(g.orbs[i]); (seen.has(k) ? rest : first).push(i); seen.add(k); }
  g.load = first.concat(rest).slice(0, slots);
  const score = k => ORBS[circBase(k)].rar * 2 + (k.endsWith('+') ? 3 : 0);
  for (const i of g.load){
    const core = orbKind(g.orbs[i]), cap = orbSlots(core, garageLv(i));
    let keys = orbSegs(g.orbs[i]).slice(1);
    for (const k of Object.keys(g.circs).sort((a, b) => score(b) - score(a))){
      if (keys.length >= cap) break;
      if (keys.map(segKind).includes(circBase(k))) continue;
      keys = keys.concat(k); bump(g.circs, k, -1);
    }
    g.orbs[i] = orbMake(core, keys); checkResonance(g.orbs[i]);
  }
  saveMeta(); if (inRun) syncRunDeck();
}
