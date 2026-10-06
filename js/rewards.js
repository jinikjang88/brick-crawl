// 보상·휴식·상점 화면
'use strict';

// ── 보상
function rollOrbs(){
  const pool = Object.keys(ORBS).filter(k => ORBS[k].rar > 0), out = [];
  while (out.length < 3 && pool.length){
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
function showReward(kind){
  rerollLeft = 1;
  rewardStock = kind === 'orb' ? rollOrbs() : rollRelics(3);
  renderReward(kind);
}
function renderReward(kind){
  const isOrb = kind === 'orb';
  const head = kind === 'boss' ? `세션 ${RUN.s + 1} 돌파! 최대 체력 +4, 체력 절반 회복, 코인 +${RUN.lastGain || 0}.` : `승리! 코인 +${RUN.lastGain || 0}.`;
  const cards = rewardStock.map(id => isOrb
    ? { name:ORBS[id].name, desc:orbDesc(id), rare:ORBS[id].rar === 2, onPick:() => takeReward(() => RUN.deck.push(id), kind) }
    : { name:RELICS[id].name + (rel(id) ? ` ${rel(id) + 1}단계` : ''), desc:RELICS[id].desc, onPick:() => takeReward(() => RUN.relics[id] = rel(id) + 1, kind) });
  // 구슬 보상은 "덱을 늘릴지, 가진 구슬을 키울지"를 고르게 한다. 덱이 얇을수록 좋은 구슬이 자주 나오므로 둘 다 의미가 있다
  if (isOrb && RUN.deck.some(o => !orbUp(o)))
    cards.push({ name:'구슬 강화', tag:'덱 그대로', desc:'가진 구슬 하나를 강화한다(+)',
      onPick:() => showUpgrade(() => takeReward(() => {}, kind), () => renderReward(kind)) });
  const buttons = [{ label:rerollLeft ? '다시 뽑기 (1회)' : '다시 뽑기 (사용함)', disabled:!rerollLeft || !cards.length,
                     onClick:() => { rerollLeft--; rewardStock = isOrb ? rollOrbs() : rollRelics(3); renderReward(kind); } }];
  // 구슬은 안 받는 것도 전략이다: 덱이 얇을수록 좋은 구슬이 자주 나온다
  if (isOrb || !cards.length) buttons.push({ label:'건너뛰기', onClick:() => takeReward(() => {}, kind) });
  showChoice({ mode:'reward', title:isOrb ? '구슬 보상' : '유물 하나를 고른다',
               sub:head + (isOrb ? ` 구슬을 덱에 넣거나 가진 구슬을 강화한다. 지금 덱: ${deckSummary()}` : ''), cards, buttons });
}
function takeReward(apply, kind){
  apply(); RUN.pendingReward = null;
  if (kind === 'boss'){ RUN.s++; RUN.map = genMap(); RUN.pos = null; RUN.path = []; }
  saveRun(); showMap();
}

// ── 휴식
function showRest(){
  const amt = Math.ceil(RUN.maxHp * 0.4);
  setHeader(`세션 ${RUN.s + 1}`, '휴식');
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

// ── 출발 선물: 새 원정 첫 화면. 해금된 것 중 최대 3개를 보여 준다
function showGift(){
  const xp = META.xp || 0, open = GIFTS.filter(g => xp >= g.need);
  const next = GIFTS.find(g => xp < g.need);
  if (!RUN.giftStock){ RUN.giftStock = shuffle(open).slice(0, 3).map(g => g.id); saveRun(); }
  const done = () => { RUN.gift = false; RUN.giftStock = null; saveRun(); showMap(); };
  const apply = {
    coins:() => { RUN.coins += 30; done(); },
    vital:() => { RUN.maxHp += 4; RUN.hp += 4; done(); },
    temper:() => { const i = RUN.deck.indexOf('bomb'); if (i >= 0) RUN.deck[i] = 'bomb+'; done(); },
    relic:() => { const id = rollRelics(1)[0]; if (id) RUN.relics[id] = 1; done(); },
    pick:() => {
      const rare = Object.keys(ORBS).filter(k => ORBS[k].rar === 2);
      showChoice({ mode:'gift', title:'희귀 구슬 하나를 고른다', sub:'덱에 넣고 떠난다', buttons:[{ label:'취소', onClick:showGift }],
        cards:rare.map(k => ({ name:ORBS[k].name, orb:k, desc:orbDesc(k), rare:true, onPick:() => { RUN.deck.push(k); done(); } })) });
    },
  };
  setHeader('출발', '출발 선물');
  showChoice({ mode:'gift', title:'출발 선물',
    sub:next ? `원정에서 칸을 더 돌파하면 새 선물이 열린다 (${xp}/${next.need})` : '모든 선물이 열렸다',
    cards:RUN.giftStock.map(id => { const g = GIFTS.find(x => x.id === id); return { name:g.name, desc:g.desc, onPick:apply[id] }; }),
    buttons:[{ label:'선물 없이 떠난다', onClick:done }] });
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
    saveRun();
  }
  setHeader(`세션 ${RUN.s + 1}`, '상점');
  const cards = RUN.shop.map((it, i) => {
    const poor = RUN.coins < it.price, tag = it.sold ? '판매됨' : `${it.price}코인`;
    const buy = after => { RUN.coins -= it.price; it.sold = true; sfx('coin'); after(); saveRun(); showShop(); };
    if (it.k === 'orb') return { name:ORBS[it.id].name, tag, desc:orbDesc(it.id), rare:ORBS[it.id].rar === 2,
      disabled:it.sold || poor, onPick:() => buy(() => RUN.deck.push(it.id)) };
    if (it.k === 'relic') return { name:RELICS[it.id].name, tag, desc:RELICS[it.id].desc,
      disabled:it.sold || poor, onPick:() => buy(() => RUN.relics[it.id] = rel(it.id) + 1) };
    if (it.k === 'heal') return { name:'약초', tag, desc:`체력 8 회복 (지금 ${RUN.hp}/${RUN.maxHp})`,
      disabled:it.sold || poor || RUN.hp >= RUN.maxHp, onPick:() => buy(() => RUN.hp = Math.min(RUN.maxHp, RUN.hp + 8)) };
    if (it.k === 'upgrade') return { name:'구슬 강화', tag, desc:'구슬 1개를 강화한다(+)',
      disabled:it.sold || poor || !RUN.deck.some(o => !orbUp(o)),
      onPick:() => showUpgrade(() => { RUN.coins -= it.price; it.sold = true; sfx('coin'); saveRun(); showShop(); }, showShop) };
    return { name:'구슬 덜어내기', tag, desc:'구슬 1개를 덱에서 뺀다',
      disabled:it.sold || poor || RUN.deck.length <= 2,
      onPick:() => showRemove(() => { RUN.coins -= it.price; it.sold = true; sfx('coin'); saveRun(); showShop(); }, showShop) };
  });
  showChoice({ mode:'shop', scene:'shop', title:'상점', sub:`코인 ${RUN.coins}`, cards, buttons:[{ label:'나가기', primary:true, onClick:finishNonBattle }] });
}
