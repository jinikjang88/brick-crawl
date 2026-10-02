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
  const head = kind === 'boss' ? `세션 ${RUN.s + 1} 돌파! 체력 절반 회복, 코인 +${RUN.lastGain || 0}.` : `승리! 코인 +${RUN.lastGain || 0}.`;
  const cards = rewardStock.map(id => isOrb
    ? { name:ORBS[id].name, desc:ORBS[id].desc, rare:ORBS[id].rar === 2, onPick:() => takeReward(() => RUN.deck.push(id), kind) }
    : { name:RELICS[id].name + (rel(id) ? ` ${rel(id) + 1}단계` : ''), desc:RELICS[id].desc, onPick:() => takeReward(() => RUN.relics[id] = rel(id) + 1, kind) });
  const buttons = [{ label:rerollLeft ? '다시 뽑기 (1회)' : '다시 뽑기 (사용함)', disabled:!rerollLeft || !cards.length,
                     onClick:() => { rerollLeft--; rewardStock = isOrb ? rollOrbs() : rollRelics(3); renderReward(kind); } }];
  // 구슬은 안 받는 것도 전략이다: 덱이 얇을수록 좋은 구슬이 자주 나온다
  if (isOrb || !cards.length) buttons.push({ label:'건너뛰기', onClick:() => takeReward(() => {}, kind) });
  showChoice({ mode:'reward', title:isOrb ? '구슬 하나를 덱에 넣는다' : '유물 하나를 고른다',
               sub:head + (isOrb ? ` 지금 덱: ${deckSummary()}` : ''), cards, buttons });
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
  showChoice({ mode:'rest', title:'모닥불', sub:`체력 ${RUN.hp}/${RUN.maxHp}. 하나만 할 수 있다.`, cards:[
    { name:'쉬기', desc:`체력 ${amt} 회복`, disabled:RUN.hp >= RUN.maxHp,
      onPick:() => { RUN.hp = Math.min(RUN.maxHp, RUN.hp + amt); finishNonBattle(); } },
    { name:'덜어내기', desc:'구슬 1개를 덱에서 뺀다. 좋은 구슬이 더 자주 나온다', disabled:RUN.deck.length <= 2,
      onPick:() => showRemove(finishNonBattle, () => showRest()) },
  ], buttons:[{ label:'그냥 지나간다', onClick:finishNonBattle }] });
}
function showRemove(done, back){
  const cnt = {}; RUN.deck.forEach(o => cnt[o] = (cnt[o] || 0) + 1);
  showChoice({ mode:'remove', title:'뺄 구슬을 고른다', sub:`지금 덱 ${RUN.deck.length}개`,
    cards:Object.keys(cnt).map(o => ({ name:ORBS[o].name, tag:`${cnt[o]}개`, desc:ORBS[o].desc,
      onPick:() => { RUN.deck.splice(RUN.deck.indexOf(o), 1); done(); } })),
    buttons:[{ label:'취소', onClick:back }] });
}

// ── 상점: 들어갈 때 물건을 정해 저장해 둔다(새로고침으로 물건을 바꾸지 못하게)
function showShop(){
  if (!RUN.shop){
    const orbs = rollOrbs().slice(0, 2), relic = rollRelics(1)[0];
    RUN.shop = [
      ...orbs.map(id => ({ k:'orb', id, price:ORBS[id].rar === 1 ? 20 : 32 })),
      ...(relic ? [{ k:'relic', id:relic, price:45 }] : []),
      { k:'heal', price:15 }, { k:'remove', price:25 },
    ];
    saveRun();
  }
  setHeader(`세션 ${RUN.s + 1}`, '상점');
  const cards = RUN.shop.map((it, i) => {
    const poor = RUN.coins < it.price, tag = it.sold ? '판매됨' : `${it.price}코인`;
    const buy = after => { RUN.coins -= it.price; it.sold = true; after(); saveRun(); showShop(); };
    if (it.k === 'orb') return { name:ORBS[it.id].name, tag, desc:ORBS[it.id].desc, rare:ORBS[it.id].rar === 2,
      disabled:it.sold || poor, onPick:() => buy(() => RUN.deck.push(it.id)) };
    if (it.k === 'relic') return { name:RELICS[it.id].name, tag, desc:RELICS[it.id].desc,
      disabled:it.sold || poor, onPick:() => buy(() => RUN.relics[it.id] = rel(it.id) + 1) };
    if (it.k === 'heal') return { name:'약초', tag, desc:`체력 8 회복 (지금 ${RUN.hp}/${RUN.maxHp})`,
      disabled:it.sold || poor || RUN.hp >= RUN.maxHp, onPick:() => buy(() => RUN.hp = Math.min(RUN.maxHp, RUN.hp + 8)) };
    return { name:'구슬 덜어내기', tag, desc:'구슬 1개를 덱에서 뺀다',
      disabled:it.sold || poor || RUN.deck.length <= 2,
      onPick:() => showRemove(() => { RUN.coins -= it.price; it.sold = true; saveRun(); showShop(); }, showShop) };
  });
  showChoice({ mode:'shop', title:'상점', sub:`코인 ${RUN.coins}`, cards, buttons:[{ label:'나가기', primary:true, onClick:finishNonBattle }] });
}
