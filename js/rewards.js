// 보상·휴식·상점 화면
'use strict';

// ── 보상
function rollOrbs(){
  const pool = Object.keys(ORBS).filter(k => ORBS[k].rar > 0), out = [];
  while (out.length < 3 + (tree('o2') ? 1 : 0) && pool.length){
    const w = {}; pool.forEach(k => w[k] = ORBS[k].rar === 1 ? 10 : 5);
    const k = pickW(w); out.push(k); pool.splice(pool.indexOf(k), 1);
  }
  return out;
}
function rollRelics(n){
  const pool = Object.keys(RELICS).filter(k => rel(k) < RELICS[k].max);
  return shuffle(pool).slice(0, n);
}
let rerollLeft = 1, rewardStock = null;
const rerollMax = () => 1 + (tree('o3') ? 1 : 0);
// 구슬 넣기: 덱이 DECK_MAX개면 바꿀 구슬을 고르는 화면으로 넘어간다. 취소하면 back
const deckFull = () => RUN.deck.length >= DECK_MAX;
function addOrb(id, done, back){
  if (!deckFull()){ RUN.deck.push(id); return done(); }
  showSwap(id, done, back);
}
function showSwap(id, done, back){
  const cnt = {}; RUN.deck.forEach(o => cnt[o] = (cnt[o] || 0) + 1);
  showChoice({ mode:'swap', title:'구슬을 바꾼다', sub:`덱이 가득 찼다(${DECK_MAX}개). ${ORBS[id].name}와 바꿀 구슬을 고른다`,
    cards:Object.keys(cnt).map(o => ({ name:orbName(o), orb:o, tag:`${cnt[o]}개 → 1개 뺌`, desc:orbDesc(o),
      onPick:() => { RUN.deck[RUN.deck.indexOf(o)] = id; done(); } })),
    buttons:[{ label:'취소', onClick:back }] });
}
function showReward(kind){
  rerollLeft = rerollMax();
  rewardStock = kind === 'orb' ? rollOrbs() : rollRelics(3);
  renderReward(kind);
}
function renderReward(kind){
  const isOrb = kind === 'orb';
  const pts = RUN.lastPts ? ` 스킬 포인트 +${RUN.lastPts}(첫 돌파).` : '';
  const head = (kind === 'boss' ? `${stageName(RUN.s)} 돌파! 최대 체력 +4, 체력 절반 회복, 코인 +${RUN.lastGain || 0}.`
    : `승리! 코인 +${RUN.lastGain || 0}.`) + pts;
  const cards = rewardStock.map(id => isOrb
    ? { name:ORBS[id].name, tag:deckFull() ? '교체' : '', desc:orbDesc(id), rare:ORBS[id].rar === 2,
        onPick:() => addOrb(id, () => takeReward(() => {}, kind), () => renderReward(kind)) }
    : { name:RELICS[id].name + (rel(id) ? ` ${rel(id) + 1}단계` : ''), desc:RELICS[id].desc, onPick:() => takeReward(() => RUN.relics[id] = rel(id) + 1, kind) });
  // 구슬 보상은 "덱을 늘릴지, 가진 구슬을 키울지"를 고르게 한다. 덱이 얇을수록 좋은 구슬이 자주 나오므로 둘 다 의미가 있다
  if (isOrb && RUN.deck.some(o => !orbUp(o)))
    cards.push({ name:'구슬 강화', tag:'덱 그대로', desc:'가진 구슬 하나를 강화한다(+)',
      onPick:() => showUpgrade(() => takeReward(() => {}, kind), () => renderReward(kind)) });
  const buttons = [{ label:rerollLeft ? `다시 뽑기 (${rerollLeft}회)` : '다시 뽑기 (사용함)', disabled:!rerollLeft || !cards.length,
                     onClick:() => { rerollLeft--; rewardStock = isOrb ? rollOrbs() : rollRelics(3); renderReward(kind); } }];
  // 구슬은 안 받는 것도 전략이다: 덱이 얇을수록 좋은 구슬이 자주 나온다
  if (isOrb || !cards.length) buttons.push({ label:'건너뛰기', onClick:() => takeReward(() => {}, kind) });
  showChoice({ mode:'reward', title:isOrb ? '구슬 보상' : '유물 하나를 고른다',
               sub:head + (isOrb ? ` 구슬을 덱에 넣거나(최대 ${DECK_MAX}개) 가진 구슬을 강화한다. 지금 덱 ${RUN.deck.length}/${DECK_MAX}: ${deckSummary()}` : ''), cards, buttons });
}
function takeReward(apply, kind){
  apply(); RUN.pendingReward = null;
  if (kind === 'boss'){ RUN.s++; RUN.map = genMap(RUN.s, RUN.abyss); RUN.pos = null; RUN.path = []; }
  saveRun(); showMap();
}

// ── 휴식
function showRest(){
  const amt = Math.ceil(RUN.maxHp * 0.4) + (tree('e5') ? 5 : 0);
  setHeader(`${stageName(RUN.s)}`, '휴식');
  showChoice({ mode:'rest', scene:'rest', title:'모닥불', sub:`체력 ${RUN.hp}/${RUN.maxHp}. 하나만 할 수 있다.`, cards:[
    { name:'쉬기', desc:`체력 ${amt} 회복`, disabled:RUN.hp >= RUN.maxHp,
      onPick:() => { RUN.hp = Math.min(RUN.maxHp, RUN.hp + amt); sfx('heal'); finishNonBattle(); } },
    { name:'덜어내기', desc:'구슬 1개를 덱에서 뺀다. 좋은 구슬이 더 자주 나온다', disabled:RUN.deck.length <= 2,
      onPick:() => showRemove(finishNonBattle, () => showRest()) },
    { name:'단련', desc:'구슬 1개를 강화한다(+)', disabled:!RUN.deck.some(o => !orbUp(o)),
      onPick:() => showUpgrade(() => { sfx('heal'); finishNonBattle(); }, () => showRest()) },
  ], buttons:[{ label:'그냥 지나간다', onClick:finishNonBattle }] });
}
function showRemove(done, back){
  const cnt = {}; RUN.deck.forEach(o => cnt[o] = (cnt[o] || 0) + 1);
  showChoice({ mode:'remove', title:'뺄 구슬을 고른다', sub:`지금 덱 ${RUN.deck.length}개`,
    cards:Object.keys(cnt).map(o => ({ name:orbName(o), orb:o, tag:`${cnt[o]}개`, desc:orbDesc(o),
      onPick:() => { RUN.deck.splice(RUN.deck.indexOf(o), 1); done(); } })),
    buttons:[{ label:'취소', onClick:back }] });
}
// 강화: 같은 종류는 한 장만 바꾼다. 카드에는 강화 후 효과를 보여 줘 무엇이 달라지는지 고르기 전에 알게 한다
function showUpgrade(done, back){
  const kinds = [...new Set(RUN.deck.filter(o => !orbUp(o)))];
  showChoice({ mode:'upgrade', title:'강화할 구슬을 고른다', sub:`지금 덱: ${deckSummary()}`,
    cards:kinds.map(o => ({ name:orbName(o) + ' → +', orb:o, desc:orbDesc(o + '+'),
      onPick:() => { RUN.deck[RUN.deck.indexOf(o)] = o + '+'; done(); } })),
    buttons:[{ label:'취소', onClick:back }] });
}

// ── 상점: 들어갈 때 물건을 정해 저장해 둔다(새로고침으로 물건을 바꾸지 못하게)
function showShop(){
  if (!RUN.shop){
    const orbs = rollOrbs().slice(0, 2), relic = rollRelics(1)[0];
    RUN.shop = [
      ...orbs.map(id => ({ k:'orb', id, price:ORBS[id].rar === 1 ? 20 : 32 })),
      ...(relic ? [{ k:'relic', id:relic, price:45 }] : []),
      { k:'heal', price:15 }, { k:'upgrade', price:30 }, { k:'remove', price:25 },
    ];
    // 흥정: 물건을 정할 때 값도 깎아 저장한다(이미 정해진 상점 값은 그대로)
    if (tree('e2')) RUN.shop.forEach(it => it.price = Math.round(it.price * .8));
    saveRun();
  }
  setHeader(`${stageName(RUN.s)}`, '상점');
  const cards = RUN.shop.map((it, i) => {
    const poor = RUN.coins < it.price, tag = it.sold ? '판매됨' : `${it.price}코인`;
    const buy = after => { RUN.coins -= it.price; it.sold = true; sfx('coin'); after(); saveRun(); showShop(); };
    // 덱이 가득 차면 바꿀 구슬을 고른 뒤에야 값을 치른다(취소하면 돈이 그대로)
    if (it.k === 'orb') return { name:ORBS[it.id].name, tag:it.sold || !deckFull() ? tag : tag + ' · 교체', desc:orbDesc(it.id), rare:ORBS[it.id].rar === 2,
      disabled:it.sold || poor, onPick:() => addOrb(it.id, () => buy(() => {}), showShop) };
    if (it.k === 'relic') return { name:RELICS[it.id].name, tag, desc:RELICS[it.id].desc,
      disabled:it.sold || poor, onPick:() => buy(() => RUN.relics[it.id] = rel(it.id) + 1) };
    const herb = 8 + (tree('e5') ? 5 : 0);
    if (it.k === 'heal') return { name:'약초', tag, desc:`체력 ${herb} 회복 (지금 ${RUN.hp}/${RUN.maxHp})`,
      disabled:it.sold || poor || RUN.hp >= RUN.maxHp, onPick:() => buy(() => RUN.hp = Math.min(RUN.maxHp, RUN.hp + herb)) };
    if (it.k === 'upgrade') return { name:'구슬 강화', tag, desc:'구슬 1개를 강화한다(+)',
      disabled:it.sold || poor || !RUN.deck.some(o => !orbUp(o)),
      onPick:() => showUpgrade(() => { RUN.coins -= it.price; it.sold = true; sfx('coin'); saveRun(); showShop(); }, showShop) };
    return { name:'구슬 덜어내기', tag, desc:'구슬 1개를 덱에서 뺀다',
      disabled:it.sold || poor || RUN.deck.length <= 2,
      onPick:() => showRemove(() => { RUN.coins -= it.price; it.sold = true; sfx('coin'); saveRun(); showShop(); }, showShop) };
  });
  showChoice({ mode:'shop', scene:'shop', title:'상점', sub:`코인 ${RUN.coins}`, cards, buttons:[{ label:'나가기', primary:true, onClick:finishNonBattle }] });
}
