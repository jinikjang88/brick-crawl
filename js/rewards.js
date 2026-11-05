// 보상·휴식·상점 화면
'use strict';

// ── 보상
// 등급 가중치(RARITY). 심연은 층마다 희귀·전설 ×1.1: 깊이 내려갈 이유를 준다
// 보스라고 전설을 더 주지 않는다: 희귀 이상 보장 칸과 겹쳐 보스 보상마다 전설이 40% 넘게 나와 귀하지 않았다
function tierW(t){
  return RARITY[t].w * (isAbyss() && t >= 3 ? Math.pow(1.1, RUN.s + 1) : 1);
}
// 가중치 뽑기(중복 없이)
function drawTier(pool, n, tierOf){
  pool = pool.slice(); const out = [];
  while (out.length < n && pool.length){
    const w = {}; pool.forEach(k => w[k] = tierW(tierOf(k)));
    const k = pickW(w, 'reward'); out.push(k); pool.splice(pool.indexOf(k), 1);
  }
  return out;
}
const orbTier = k => ORBS[k].rar, relicTier = k => RELICS[k].t;
function rollRelics(n, boss){
  const pool = Object.keys(RELICS).filter(k => rel(k) < RELICS[k].max);
  // 보스 보상은 희귀를 한 장 보장한다(보스를 넘은 보람). 전설까지 보장 칸에 넣으면 전설이 흔해진다
  const rare = pool.filter(k => relicTier(k) === 3);
  const hi = boss ? drawTier(rare.length ? rare : pool.filter(k => relicTier(k) >= 3), 1, relicTier) : [];
  return shuffle(hi.concat(drawTier(pool.filter(k => !hi.includes(k)), n - hi.length, relicTier)), 'reward');
}
// 유물 얻기는 한곳으로: 도감 기록과 피의 계약(즉시 최대 체력 -8)을 빠뜨리지 않게
function gainRelic(id){
  if (!id) return;
  RUN.relics[id] = rel(id) + 1; markSeen('relic', id);
  if (id === 'pact'){ RUN.maxHp = Math.max(8, RUN.maxHp - 8); RUN.hp = Math.min(RUN.hp, RUN.maxHp); }
}
const tierTag = t => RARITY[t].name;
const rerollMax = () => 1 + (tree('o3') ? 1 : 0);
// 보상: 정예·보스는 칩 3택1(구슬 보상은 부품 드롭으로 바뀌었다, 작업 08). 이번 전투에서 떨어진 부품을 부제에 함께 보여 준다
// 뽑은 보상은 원정에 저장한다: 메인으로 나갔다 이어하면 카드·다시 뽑기가 새로 나오는 걸 막는다(상점과 같은 이유)
const rollReward = kind => rollRelics(3, kind === 'boss');
function showReward(kind){
  if (!RUN.reward || RUN.reward.kind !== kind){ RUN.reward = { kind, stock:rollReward(kind), reroll:rerollMax() }; saveRun(); }
  renderReward(kind);
}
function renderReward(kind){
  const rerollLeft = RUN.reward.reroll, rewardStock = RUN.reward.stock;
  const pts = RUN.lastPts ? ` 설계도 +${RUN.lastPts}(첫 돌파).` : '';
  const head = (kind === 'boss' ? `${stageName(RUN.s)} 돌파! 최대 체력 +4, 체력 절반 회복, 크레딧 +${RUN.lastGain || 0}.`
    : `승리! 크레딧 +${RUN.lastGain || 0}.`) + pts + (RUN.lastDrop ? ` 부품: ${RUN.lastDrop}.` : '') + (RUN.lastSent ? ' ' + RUN.lastSent : '');
  const cards = rewardStock.map(id => ({ relic:id, name:RELICS[id].name + (rel(id) ? ` ${rel(id) + 1}단계` : ''), tag:tierTag(relicTier(id)), desc:RELICS[id].desc, rare:relicTier(id) >= 3,
    onPick:() => takeReward(() => gainRelic(id), kind) }));
  const buttons = [{ label:rerollLeft ? `다시 스캔하기 (${rerollLeft}회)` : '다시 스캔하기 (다 씀)', disabled:!rerollLeft || !cards.length,
                     onClick:() => { RUN.reward.reroll--; RUN.reward.stock = rollReward(kind); saveRun(); renderReward(kind); } }];
  if (!cards.length) buttons.push({ label:'건너뛰기', onClick:() => takeReward(() => {}, kind) });
  setHeader(stageName(RUN.s), '칩 보상');
  showChoice({ mode:'reward', title:'칩 하나를 고른다', sub:head, cards, buttons });
}
function takeReward(apply, kind){
  apply(); RUN.reward = null; RUN.pendingReward = null; RUN.lastDrop = null; RUN.lastSent = null;
  // 보스 보상을 받으면 다음 층으로
  if (kind === 'boss'){ RUN.s++; RUN.map = genMap(RUN.s, RUN.abyss, RUN.seed); RUN.pos = null; RUN.path = []; }
  saveRun(); showMap();
}

// 충전소·브로커의 한 줄(대본 6.1·6.2). 연출이라 Math.random으로 고르고, 같은 방문 안에서는 줄이 바뀌지 않게 기억한다
const pickLine = list => list[Math.floor(Math.random() * list.length)];
let restSay = null, shopSay = null;
// ── 휴식
function showRest(){
  if (!restSay) restSay = pickLine(REST_TALK[Math.min(RUN.s, REST_TALK.length - 1)]);
  const amt = Math.ceil(RUN.maxHp * 0.4) + (tree('e5') ? 5 : 0) + (rel('bandage') ? 3 : 0);
  setHeader(`${stageName(RUN.s)}`, '충전소');
  showChoice({ mode:'rest', scene:'rest', title:'충전소', sub:`체력 ${RUN.hp}/${RUN.maxHp}. 잠시 전원을 꽂고 숨을 돌린다.`, say:[restSay], cards:[
    { name:'충전하기', desc:`체력 ${amt} 회복`, disabled:RUN.hp >= RUN.maxHp,
      onPick:() => { RUN.hp = Math.min(RUN.maxHp, RUN.hp + amt); sfx('heal'); finishNonBattle(); } },
  ], buttons:[{ label:'지나가기', onClick:finishNonBattle }] });
}
// ── 상점(윤의 정비소): 들어갈 때 물건을 정해 저장해 둔다(새로고침으로 물건을 바꾸지 못하게)
// 작업 08: 구슬 대신 회로 2개를 판다(부품 운이 없을 때의 출구). 송신하기(적재함 → 차고)와 차고(조립·장전)는 여기서만 열린다
function showShop(){
  if (!RUN.shop){
    const circs = [], relic = rollRelics(1)[0];
    while (circs.length < 2){ const c = randomCirc(); if (!circs.includes(c)) circs.push(c); }
    // 값은 등급으로 정한다(RARITY): 희귀·전설일수록 비싸다
    RUN.shop = [
      ...circs.map(id => ({ k:'circ', id, price:RARITY[ORBS[id].rar].orb })),
      ...(relic ? [{ k:'relic', id:relic, price:RARITY[relicTier(relic)].relic }] : []),
      { k:'heal', price:15 },
    ];
    // 흥정·행운 동전·탐욕: 물건을 정할 때 값도 바꿔 저장한다(이미 정해진 상점 값은 그대로)
    RUN.shop.forEach(it => it.price = Math.round(it.price * (tree('e2') ? .8 : 1) * (rel('luckycoin') ? .9 : 1)) + (rel('greed') ? 15 : 0));
    saveRun();
  }
  setHeader(`${stageName(RUN.s)}`, '브로커');
  const cards = RUN.shop.map(it => {
    const poor = RUN.coins < it.price, tag = it.sold ? '품절' : `크레딧 ${it.price}`;
    const buy = after => { RUN.coins -= it.price; it.sold = true; sfx('coin'); shopSay = pickLine(SHOP_TALK.bought); after(); saveRun(); showShop(); };
    // 산 회로는 적재함으로 간다(송신해야 차고에서 끼울 수 있다)
    if (it.k === 'circ') return { name:ORBS[it.id].name, orb:it.id, tag:tierTag(ORBS[it.id].rar) + ' · ' + tag, desc:ORBS[it.id].desc, rare:ORBS[it.id].rar >= 3,
      disabled:it.sold || poor, onPick:() => buy(() => addCargo({ scrap:0, cores:[], circs:[it.id] })) };
    if (it.k === 'relic') return { relic:it.id, name:RELICS[it.id].name, tag:tierTag(relicTier(it.id)) + ' · ' + tag, desc:RELICS[it.id].desc, rare:relicTier(it.id) >= 3,
      disabled:it.sold || poor, onPick:() => buy(() => gainRelic(it.id)) };
    const herb = 8 + (tree('e5') ? 5 : 0);
    return { name:'복구 패치', tag, desc:`체력 ${herb} 회복 (지금 ${RUN.hp}/${RUN.maxHp})`,
      disabled:it.sold || poor || RUN.hp >= RUN.maxHp, onPick:() => buy(() => RUN.hp = Math.min(RUN.maxHp, RUN.hp + herb)) };
  });
  // 처음 들어올 때: 살 수 있는 것이 하나도 없으면 "크레딧이 모자란다", 아니면 인사
  if (!shopSay) shopSay = pickLine(cards.every(c => c.disabled) ? SHOP_TALK.poor : SHOP_TALK.enter);
  const n = cargoParts(), sc = RUN.cargo.scrap;
  showChoice({ mode:'shop', scene:'shop', title:'윤의 정비소', sub:`크레딧 ${RUN.coins} · 적재함 ${n}/${cargoMax()}` + (sc ? ` · 고철 ${sc}` : ''), say:[shopSay], cards, buttons:[
    { label:n || sc ? `송신하기 (부품 ${n})` : '송신하기 (빈 적재함)', disabled:!n && !sc,
      onClick:() => { const s = sendCargo(); sfx('coin'); toast(`송신 · 부품 ${s.parts} · 고철 ${s.scrap}`); showShop(); } },
    { label:'차고', onClick:() => showGarage(showShop, true) },
    { label:'떠나기', primary:true, onClick:finishNonBattle }] });
}
