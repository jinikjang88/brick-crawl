// 보상·휴식·상점 화면
'use strict';

// ── 보상
// 등급 가중치(RARITY). 보스 보상은 전설 ×3, 심연은 층마다 희귀·전설 ×1.1: 깊이 내려갈 이유를 준다
function tierW(t, boss){
  return RARITY[t].w * (boss && t === 4 ? 3 : 1) * (isAbyss() && t >= 3 ? Math.pow(1.1, RUN.s + 1) : 1);
}
// 가중치 뽑기(중복 없이)
function drawTier(pool, n, tierOf, boss){
  pool = pool.slice(); const out = [];
  while (out.length < n && pool.length){
    const w = {}; pool.forEach(k => w[k] = tierW(tierOf(k), boss));
    const k = pickW(w); out.push(k); pool.splice(pool.indexOf(k), 1);
  }
  return out;
}
const orbTier = k => ORBS[k].rar, relicTier = k => RELICS[k].t;
// 해금되지 않은 구슬은 보상·상점에 나오지 않는다
function rollOrbs(boss){
  return drawTier(Object.keys(ORBS).filter(k => ORBS[k].rar > 0 && orbOpen(k)), 3 + (tree('o2') ? 1 : 0), orbTier, boss);
}
function rollRelics(n, boss){
  const pool = Object.keys(RELICS).filter(k => rel(k) < RELICS[k].max);
  // 보스 보상은 희귀 이상을 한 장 보장한다(보스를 넘은 보람)
  const hi = boss ? drawTier(pool.filter(k => relicTier(k) >= 3), 1, relicTier, boss) : [];
  return shuffle(hi.concat(drawTier(pool.filter(k => !hi.includes(k)), n - hi.length, relicTier, boss)));
}
// 유물 얻기는 한곳으로: 도감 기록과 피의 계약(즉시 최대 체력 -8)을 빠뜨리지 않게
function gainRelic(id){
  if (!id) return;
  RUN.relics[id] = rel(id) + 1; markSeen('relic', id);
  if (id === 'pact'){ RUN.maxHp = Math.max(8, RUN.maxHp - 8); RUN.hp = Math.min(RUN.hp, RUN.maxHp); }
}
const tierTag = t => RARITY[t].name;
const rerollMax = () => 1 + (tree('o3') ? 1 : 0);
// 구슬 넣기: 덱이 DECK_MAX개면 바꿀 구슬을 고르는 화면으로 넘어간다. 취소하면 back
const deckFull = () => RUN.deck.length >= deckMax();
function addOrb(id, done, back){
  if (!deckFull()){ RUN.deck.push(id); markSeen('orb', orbKind(id)); return done(); }
  showSwap(id, done, back);
}
function showSwap(id, done, back){
  const cnt = {}; RUN.deck.forEach(o => cnt[o] = (cnt[o] || 0) + 1);
  showChoice({ mode:'swap', title:'구슬을 바꾼다', sub:`덱이 가득 찼다(${deckMax()}개). ${ORBS[id].name}와 바꿀 구슬을 고른다`,
    cards:Object.keys(cnt).map(o => ({ name:orbName(o), orb:o, tag:`${cnt[o]}개 → 1개 뺌`, desc:orbDesc(o),
      onPick:() => { RUN.deck[RUN.deck.indexOf(o)] = id; markSeen('orb', orbKind(id)); done(); } })),
    buttons:[{ label:'취소', onClick:back }] });
}
// 보상 단계: 'elite'·'boss' = 유물 고르기 → 'elite-orb'·'boss-orb' = 구슬 보상. ('orb'는 예전 저장의 일반 전투 보상)
const isOrbReward = k => typeof k === 'string' && (k === 'orb' || k.endsWith('-orb'));
// 뽑은 보상은 원정에 저장한다: 메인으로 나갔다 이어하면 카드·다시 뽑기가 새로 나오는 걸 막는다(상점과 같은 이유)
const rollReward = kind => isOrbReward(kind) ? rollOrbs(kind.startsWith('boss')) : rollRelics(3, kind === 'boss');
function showReward(kind){
  if (!RUN.reward || RUN.reward.kind !== kind){ RUN.reward = { kind, stock:rollReward(kind), reroll:rerollMax() }; saveRun(); }
  renderReward(kind);
}
function renderReward(kind){
  const isOrb = isOrbReward(kind), rerollLeft = RUN.reward.reroll, rewardStock = RUN.reward.stock;
  const pts = RUN.lastPts ? ` 스킬 포인트 +${RUN.lastPts}(첫 돌파).` : '';
  const head = isOrb && kind !== 'orb' ? '유물을 챙겼다.' : (kind === 'boss' ? `${stageName(RUN.s)} 돌파! 최대 체력 +4, 체력 절반 회복, 코인 +${RUN.lastGain || 0}.`
    : `승리! 코인 +${RUN.lastGain || 0}.`) + pts;
  const cards = rewardStock.map(id => isOrb
    ? { name:ORBS[id].name, tag:tierTag(orbTier(id)) + (deckFull() ? ' · 교체' : ''), desc:orbDesc(id), rare:orbTier(id) >= 3,
        onPick:() => addOrb(id, () => takeReward(() => {}, kind), () => renderReward(kind)) }
    : { name:RELICS[id].name + (rel(id) ? ` ${rel(id) + 1}단계` : ''), tag:tierTag(relicTier(id)), desc:RELICS[id].desc, rare:relicTier(id) >= 3,
        onPick:() => takeReward(() => gainRelic(id), kind) });
  // 구슬 보상은 "덱을 늘릴지, 가진 구슬을 키울지"를 고르게 한다. 덱이 얇을수록 좋은 구슬이 자주 나오므로 둘 다 의미가 있다
  if (isOrb && RUN.deck.some(o => orbLv(o) < UP_MAX))
    cards.push({ name:'구슬 강화', tag:'덱 그대로', desc:'가진 구슬 하나를 강화한다(+)',
      onPick:() => showUpgrade(() => takeReward(() => {}, kind), () => renderReward(kind)) });
  const buttons = [{ label:rerollLeft ? `다시 뽑기 (${rerollLeft}회)` : '다시 뽑기 (사용함)', disabled:!rerollLeft || !cards.length,
                     onClick:() => { RUN.reward.reroll--; RUN.reward.stock = rollReward(kind); saveRun(); renderReward(kind); } }];
  // 구슬은 안 받는 것도 전략이다: 덱이 얇을수록 좋은 구슬이 자주 나온다
  if (isOrb || !cards.length) buttons.push({ label:'건너뛰기', onClick:() => takeReward(() => {}, kind) });
  setHeader(stageName(RUN.s), isOrb ? '구슬 보상' : '유물 보상');
  showChoice({ mode:'reward', title:isOrb ? '구슬 보상' : '유물 하나를 고른다',
               sub:head + (isOrb ? ` 구슬을 덱에 넣거나(최대 ${deckMax()}개) 가진 구슬을 강화한다. 지금 덱 ${RUN.deck.length}/${deckMax()}: ${deckSummary()}` : ''), cards, buttons });
}
function takeReward(apply, kind){
  apply(); RUN.reward = null;
  // 정예·보스는 유물 다음에 구슬 보상이 한 번 더 온다. 단계를 저장해 새로고침해도 이어진다
  if (kind === 'elite' || kind === 'boss'){ RUN.pendingReward = kind + '-orb'; saveRun(); return showReward(RUN.pendingReward); }
  RUN.pendingReward = null;
  if (kind === 'boss-orb'){ RUN.s++; RUN.map = genMap(RUN.s, RUN.abyss); RUN.pos = null; RUN.path = []; }
  saveRun(); showMap();
}

// ── 휴식
function showRest(){
  const amt = Math.ceil(RUN.maxHp * 0.4) + (tree('e5') ? 5 : 0) + (rel('bandage') ? 3 : 0);
  setHeader(`${stageName(RUN.s)}`, '휴식');
  showChoice({ mode:'rest', scene:'rest', title:'모닥불', sub:`체력 ${RUN.hp}/${RUN.maxHp}. 불 곁에서 쉬어 간다.`, cards:[
    { name:'쉬기', desc:`체력 ${amt} 회복`, disabled:RUN.hp >= RUN.maxHp,
      onPick:() => { RUN.hp = Math.min(RUN.maxHp, RUN.hp + amt); sfx('heal'); finishNonBattle(); } },
  ], buttons:[{ label:'그냥 지나간다', onClick:finishNonBattle }] });
}
function showRemove(done, back){
  const cnt = {}; RUN.deck.forEach(o => cnt[o] = (cnt[o] || 0) + 1);
  showChoice({ mode:'remove', title:'뺄 구슬을 고른다', sub:`지금 덱 ${RUN.deck.length}개`,
    cards:Object.keys(cnt).map(o => ({ name:orbName(o), orb:o, tag:`${cnt[o]}개`, desc:orbDesc(o),
      onPick:() => { RUN.deck.splice(RUN.deck.indexOf(o), 1); done(); } })),
    buttons:[{ label:'취소', onClick:back }] });
}
// 강화: 같은 구슬은 한 장만 바꾼다. 카드에 성공률과 강화 후 효과를 보여 줘, 고르기 전에 위험과 보상을 안다.
// 확률 강화: 단계가 오를수록 성공률이 떨어지고, +3 이상에서 실패하면 한 단계 내려간다
function showUpgrade(done, back){
  const kinds = [...new Set(RUN.deck.filter(o => orbLv(o) < UP_MAX))];
  showChoice({ mode:'upgrade', title:'강화할 구슬을 고른다', sub:`지금 덱: ${deckSummary()}`,
    cards:kinds.map(o => {
      // 보호 부적이 있으면 실패해도 내려가지 않는다
      const lv = orbLv(o), rate = upRate(lv), risky = lv >= UP_DROP_FROM && !rel('charm');
      return { name:`${orbName(o)} → +${lv + 1}`, orb:o, tag:`성공 ${rate}%` + (risky ? ' · 실패 시 하락' : ''), desc:orbDesc(orbAt(orbKind(o), lv + 1)),
        rare:risky, onPick:() => {
          const ok = Math.random() * 100 < rate, i = RUN.deck.indexOf(o);
          if (ok){ RUN.deck[i] = orbAt(orbKind(o), lv + 1); toast(`강화 성공 · ${orbName(RUN.deck[i])}`); sfx('badge'); }
          else if (risky){ RUN.deck[i] = orbAt(orbKind(o), lv - 1); toast(`강화 실패 · ${orbName(RUN.deck[i])}로 내려갔다`); sfx('hurt'); }
          else { toast('강화 실패 · 그대로'); sfx('block'); }
          done();
        } };
    }),
    buttons:[{ label:'취소', onClick:back }] });
}

// ── 상점: 들어갈 때 물건을 정해 저장해 둔다(새로고침으로 물건을 바꾸지 못하게)
function showShop(){
  if (!RUN.shop){
    const orbs = rollOrbs().slice(0, 2), relic = rollRelics(1)[0];
    // 값은 등급으로 정한다(RARITY): 희귀·전설일수록 비싸다
    RUN.shop = [
      ...orbs.map(id => ({ k:'orb', id, price:RARITY[orbTier(id)].orb })),
      ...(relic ? [{ k:'relic', id:relic, price:RARITY[relicTier(relic)].relic }] : []),
      { k:'heal', price:15 }, { k:'upgrade', price:30 }, { k:'remove', price:25 },
    ];
    // 흥정·행운 동전·탐욕: 물건을 정할 때 값도 바꿔 저장한다(이미 정해진 상점 값은 그대로)
    RUN.shop.forEach(it => it.price = Math.round(it.price * (tree('e2') ? .8 : 1) * (rel('luckycoin') ? .9 : 1)) + (rel('greed') ? 15 : 0));
    saveRun();
  }
  setHeader(`${stageName(RUN.s)}`, '상점');
  const cards = RUN.shop.map((it, i) => {
    const poor = RUN.coins < it.price, tag = it.sold ? '판매됨' : `${it.price}코인`;
    const buy = after => { RUN.coins -= it.price; it.sold = true; sfx('coin'); after(); saveRun(); showShop(); };
    // 덱이 가득 차면 바꿀 구슬을 고른 뒤에야 값을 치른다(취소하면 돈이 그대로)
    if (it.k === 'orb') return { name:ORBS[it.id].name, tag:tierTag(orbTier(it.id)) + ' · ' + (it.sold || !deckFull() ? tag : tag + ' · 교체'), desc:orbDesc(it.id), rare:orbTier(it.id) >= 3,
      disabled:it.sold || poor, onPick:() => addOrb(it.id, () => buy(() => {}), showShop) };
    if (it.k === 'relic') return { name:RELICS[it.id].name, tag:tierTag(relicTier(it.id)) + ' · ' + tag, desc:RELICS[it.id].desc, rare:relicTier(it.id) >= 3,
      disabled:it.sold || poor, onPick:() => buy(() => gainRelic(it.id)) };
    const herb = 8 + (tree('e5') ? 5 : 0);
    if (it.k === 'heal') return { name:'약초', tag, desc:`체력 ${herb} 회복 (지금 ${RUN.hp}/${RUN.maxHp})`,
      disabled:it.sold || poor || RUN.hp >= RUN.maxHp, onPick:() => buy(() => RUN.hp = Math.min(RUN.maxHp, RUN.hp + herb)) };
    if (it.k === 'upgrade') return { name:'구슬 강화', tag, desc:'구슬 1개를 강화한다(+)',
      disabled:it.sold || poor || !RUN.deck.some(o => orbLv(o) < UP_MAX),
      onPick:() => showUpgrade(() => { RUN.coins -= it.price; it.sold = true; sfx('coin'); saveRun(); showShop(); }, showShop) };
    return { name:'구슬 덜어내기', tag, desc:'구슬 1개를 덱에서 뺀다',
      disabled:it.sold || poor || RUN.deck.length <= 2,
      onPick:() => showRemove(() => { RUN.coins -= it.price; it.sold = true; sfx('coin'); saveRun(); showShop(); }, showShop) };
  });
  showChoice({ mode:'shop', scene:'shop', title:'상점', sub:`코인 ${RUN.coins}`, cards, buttons:[{ label:'나가기', primary:true, onClick:finishNonBattle }] });
}
