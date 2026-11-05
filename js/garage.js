// 차고·부품: 구슬 조립(코어 + 회로), 장전, 부품 드롭, 적재함·송신(작업 08 1단계)
'use strict';

// ── 장전: 차고에서 고른 구슬이 침투의 장갑 슬롯이 된다(RUN.deck)
// 장전이 비거나 깨져도 침투는 시작돼야 한다: 그때는 첫 구슬(없으면 번개 구슬)로
function loadedOrbs(){
  const g = META.g, list = g.load.map(i => g.orbs[i]).filter(o => o && orbValid(o));
  return list.length ? list.slice(0, DECK_MAX) : [g.orbs[0] && orbValid(g.orbs[0]) ? g.orbs[0] : 'basic'];
}
// 침투 중(정비소)에 차고를 고치면 지금 장갑에도 바로 반영한다. 회전 탄창 칩으로 늘어난 칸까지 채운다
function syncRunDeck(){
  if (!RUN) return;
  const g = META.g;
  RUN.deck = g.load.map(i => g.orbs[i]).filter(o => o && orbValid(o)).slice(0, deckMax());
  if (!RUN.deck.length) RUN.deck = [g.orbs[0] || 'basic'];
  saveRun();
}
const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; if (o[k] <= 0) delete o[k]; };
const countAll = o => Object.values(o).reduce((a, b) => a + b, 0);

// ── 부품 드롭: 전투 결과(node.t)와 기체(node.mon)로 정한다. rand('reward')만 쓴다(새로고침해도 같은 드롭)
// 회로 드롭률 보너스: 부품 감별 모듈 +5%p, 보안 등급마다 +2%p, 심층부 층마다 +1%p(깊이 갈 이유)
const dropBonus = () => (tree('o2') ? 5 : 0) + (RUN.abyss ? RUN.s + 1 : (RUN.asc || 0) * 2);
function randomCirc(){
  const w = {}; for (const k of CIRCS) w[k] = RARITY[ORBS[k].rar].w;
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
    const own = !RUN.abyss && node.mon === 'boss' ? DROP.bossCore[RUN.s] : null;
    d.cores.push(own || DROP.bossCore[rnd(DROP.bossCore.length, 'reward')]);
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

// ── 차고 화면. inRun = 정비소에서 열었는가(그때만 지금 장갑에 반영한다)
const loadSlots = inRun => inRun ? deckMax() : DECK_MAX;
function showGarage(back, inRun){
  const g = META.g, slots = loadSlots(inRun);
  const cards = g.orbs.map((o, i) => ({
    name:orbName(o), orb:o, tag:g.load.includes(i) ? '장전됨' : '보관', desc:orbDesc(o),
    onPick:() => showOrbEdit(i, back, inRun) }));
  showChoice({ mode:'garage', title:'차고',
    sub:`장전 ${g.load.length}/${slots} · 보관함: 코어 ${countAll(g.cores)} · 회로 ${countAll(g.circs)} · 고철 ${g.scrap}`,
    cards, buttons:[
      { label:'새 구슬 조립', disabled:!countAll(g.cores), onClick:() => showNewOrb(back, inRun) },
      { label:'돌아가기', primary:true, onClick:back }] });
}
// 구슬 하나 고치기: 장전·회로 끼우기/빼기·분해
function showOrbEdit(i, back, inRun){
  const g = META.g, o = g.orbs[i], slots = loadSlots(inRun);
  const done = () => { saveMeta(); if (inRun) syncRunDeck(); showOrbEdit(Math.min(i, g.orbs.length - 1), back, inRun); };
  const core = orbKind(o), circs = orbCircs(o), loaded = g.load.includes(i);
  const cards = [];
  cards.push({ name:loaded ? '장전 풀기' : '장전하기', tag:`장전 ${g.load.length}/${slots}`,
    desc:loaded ? '장갑 슬롯에서 뺀다(차고에는 남는다)' : '장갑 슬롯에 넣어 들고 나간다',
    disabled:loaded ? g.load.length <= 1 : g.load.length >= slots,
    onPick:() => { if (loaded) g.load = g.load.filter(x => x !== i); else g.load.push(i); sfx('pick'); done(); } });
  for (const c of circs) cards.push({ name:`${ORBS[c].name} 빼기`, orb:c, tag:'보관함으로', desc:ORBS[c].desc,
    onPick:() => { g.orbs[i] = orbMake(core, circs.filter(x => x !== c)); bump(g.circs, c); sfx('pick'); done(); } });
  if (circs.length < ORBS[core].slots)
    for (const c of Object.keys(g.circs).filter(c => !circs.includes(c)))
      cards.push({ name:`${ORBS[c].name} 끼우기`, orb:c, tag:`보관 ${g.circs[c]}개 · 과열 +1`, desc:ORBS[c].desc,
        onPick:() => { g.orbs[i] = orbMake(core, circs.concat(c)); bump(g.circs, c, -1); sfx('badge'); done(); } });
  cards.push({ name:'분해하기', tag:'코어·회로를 보관함으로', desc:'구슬을 풀어 부품으로 돌려받는다(잃는 것 없음)',
    disabled:g.orbs.length <= 1,
    onPick:() => {
      bump(g.cores, core); for (const c of circs) bump(g.circs, c);
      g.orbs.splice(i, 1);
      g.load = g.load.filter(x => x !== i).map(x => x > i ? x - 1 : x);
      if (!g.load.length) g.load = [0];
      saveMeta(); if (inRun) syncRunDeck(); sfx('pick'); showGarage(back, inRun);
    } });
  showChoice({ mode:'garage', title:orbName(o), sub:orbDesc(o) + ` · 회로 칸 ${circs.length}/${ORBS[core].slots}`,
    cards, buttons:[{ label:'차고로', primary:true, onClick:() => showGarage(back, inRun) }] });
}
// 새 구슬: 보관함의 코어 하나로 빈 구슬을 만든다. 자리가 있으면 바로 장전
function showNewOrb(back, inRun){
  const g = META.g;
  showChoice({ mode:'garage', title:'코어를 고른다', sub:'코어가 구슬의 움직임을 정한다. 회로는 다음 화면에서 끼운다',
    cards:Object.keys(g.cores).map(k => ({ name:ORBS[k].name, orb:k, tag:`보관 ${g.cores[k]}개 · 회로 칸 ${ORBS[k].slots}`,
      desc:ORBS[k].desc + ` · 과열 ${ORBS[k].heat}`,
      onPick:() => {
        bump(g.cores, k, -1); g.orbs.push(orbMake(k));
        const i = g.orbs.length - 1;
        if (g.load.length < loadSlots(inRun)) g.load.push(i);
        sfx('badge'); saveMeta(); if (inRun) syncRunDeck(); showOrbEdit(i, back, inRun);
      } })),
    buttons:[{ label:'차고로', primary:true, onClick:() => showGarage(back, inRun) }] });
}

// ── 시뮬레이터 봇용 자동 조립: 회로는 빈 칸이 있는 장전 구슬부터, 코어는 새 구슬로 만들어 빈 슬롯에 장전한다.
// 사람이 할 법한 단순한 정리(가장 센 것을 먼저)만 흉내 낸다
function autoGarage(inRun){
  const g = META.g, slots = loadSlots(inRun);
  const coreOrder = ['comet', 'split', 'heavy', 'bomb', 'drill', 'magnet', 'basic'];
  for (const k of coreOrder) while (g.cores[k] > 0){ bump(g.cores, k, -1); g.orbs.push(orbMake(k)); }
  // 센 코어를 먼저 장전한다
  const rank = o => coreOrder.indexOf(orbKind(o));
  g.load = g.orbs.map((o, i) => i).sort((a, b) => rank(g.orbs[a]) - rank(g.orbs[b])).slice(0, slots);
  for (const i of g.load){
    const core = orbKind(g.orbs[i]);
    let cs = orbCircs(g.orbs[i]);
    for (const c of Object.keys(g.circs).sort((a, b) => ORBS[b].rar - ORBS[a].rar)){
      if (cs.length >= ORBS[core].slots) break;
      if (cs.includes(c)) continue;
      cs = cs.concat(c); bump(g.circs, c, -1);
    }
    g.orbs[i] = orbMake(core, cs);
  }
  saveMeta(); if (inRun) syncRunDeck();
}
