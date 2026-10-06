// 화면 전환: 메인·지도·전투 시작/종료
'use strict';

// ── 화면 전환 공통
const OVERLAYS = ['ovMain','ovRank','ovMap','ovChoose','ovPause'];
function show(id){ OVERLAYS.forEach(o => $(o).classList.toggle('on', o === id)); }
function setMode(m, overlay){
  mode = m; $('app').dataset.mode = m; show(overlay); refreshHud();
  if (overlay !== 'ovChoose') setScene(null);
  // 메인·결과 화면에서는 메뉴가 열리지 않으니 버튼도 감춘다(자리는 남겨 헤더가 흔들리지 않게)
  $('btnMenu').style.visibility = m === 'main' || m === 'result' ? 'hidden' : '';
}

// 선택 화면(보상·휴식·상점·덜어내기)을 하나의 틀로 그린다
function showChoice(o){
  // 덜어내기·강화는 상점·휴식 안에서 이어지는 화면이라 장면을 그대로 둔다
  setScene(o.scene !== undefined ? o.scene : ['remove', 'upgrade'].includes(o.mode) ? SCENE : null);
  $('cTitle').textContent = o.title; $('cTitle').className = 'big';
  $('cSub').textContent = o.sub || '';
  const box = $('cCards'); box.textContent = '';
  for (const c of o.cards){
    const b = document.createElement('button');
    b.className = 'rCard' + (c.rare ? ' rare' : ''); b.disabled = !!c.disabled;
    const t = document.createElement('b'); t.append(c.name);
    if (c.tag){ const em = document.createElement('em'); em.textContent = c.tag; t.append(em); }
    const d = document.createElement('span'); d.textContent = c.desc;
    const kind = c.orb ? orbKind(c.orb) : Object.keys(ORBS).find(k => ORBS[k].name === c.name);
    if (kind){ b.classList.add('orbCard'); b.append(orbPortrait(kind)); }
    const body = document.createElement('div'); body.className = 'cardBody'; body.append(t, d);
    b.append(body);
    b.onclick = () => { if (mode !== o.mode) return; sfx('pick'); c.onPick(); };
    box.append(b);
  }
  const row = $('cBtns'); row.textContent = '';
  for (const bt of (o.buttons || [])){
    const b = document.createElement('button');
    b.className = 'btn' + (bt.primary ? ' primary' : ''); b.textContent = bt.label; b.disabled = !!bt.disabled;
    b.onclick = () => { if (mode !== o.mode) return; bt.onClick(); };
    row.append(b);
  }
  setMode(o.mode, 'ovChoose');
  const first = box.querySelector('button:not(:disabled)') || row.querySelector('button'); if (first) first.focus();
}

// ── 메인 화면
function showMain(){
  G = null;
  const saved = loadRun();
  RUN = saved || freshRun();           // 배경 장면용. 저장은 하지 않는다
  newBattle({ r:0, l:0, t:'battle', mon:'slime' });
  const c = $('mContinue');
  c.hidden = !saved;
  if (saved){
    const where = saved.pending ? saved.pending : saved.pos;
    const step = where ? `${saved.s + 1}-${where.r + 1}` : `${saved.s + 1}-출발`;
    c.textContent = '이어하기';
    const sm = document.createElement('small'); sm.textContent = `${step}, 체력 ${saved.hp}/${saved.maxHp}, 구슬 ${saved.deck.length}개`;
    c.append(sm);
  }
  $('mNew').textContent = '새 원정'; $('mNew').dataset.arm = '';
  $('mRecord').textContent = META.best > 0 ? `최고 ${progLabel(META.best)} 돌파 · 원정 ${META.runs}회`
    : META.runs ? `원정 ${META.runs}회 · 아직 돌파한 칸이 없다` : '첫 원정을 떠나 보자';
  const open = GIFTS.filter(g => (META.xp || 0) >= g.need).length;
  if (META.runs) $('mRecord').textContent += ` · 출발 선물 ${open}/${GIFTS.length}`;
  ensureProfile(); $('mName').textContent = PROFILE.name;
  drawLogo($('logoCv'));
  const display = $('orbShowcase'); display.textContent = '';
  ['drill','guard','basic','bomb','heavy'].forEach(k => display.append(orbPortrait(k)));
  setHeader('', '');
  setMode('main', 'ovMain');
  bgm('calm'); renderSound();
  (saved ? c : $('mNew')).focus();
  refreshBoard();
}
$('mContinue').onclick = () => { const r = loadRun(); if (!r) return showMain(); RUN = r; resumeRun(); };
// 저장된 원정이 있으면 두 번 눌러야 덮어쓴다. 덮어쓴 원정도 끝난 원정으로 기록한다
$('mNew').onclick = e => {
  const b = e.currentTarget, saved = loadRun();
  if (saved && !b.dataset.arm){ b.dataset.arm = '1'; b.textContent = '한 번 더 누르면 저장된 원정이 사라진다'; return; }
  if (saved) endRun(saved);
  startNewRun();
};
// 로고는 DOM 캔버스라 색 토큰이 바뀌면(다크 모드 전환) 다시 그려야 한다
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (mode === 'main') drawLogo($('logoCv')); }); } catch(e){}
function startNewRun(){ RUN = freshRun(); META.runs++; saveMeta(); saveRun(); showGift(); }
// 끝난 원정의 도달 칸 수를 쌓는다(출발 선물 해금 기준). 랭킹 기록과 같은 시점에 부른다
function endRun(r){ recordRun(r); META.xp = (META.xp || 0) + runProgress(r); saveMeta(); }

// ── 랭킹: 밀린 기록을 먼저 올리고 받아 온다. 서버가 없거나 실패하면 조용히 비워 둔다(게임은 오프라인으로도 돈다)
let BOARD = null;
async function refreshBoard(){
  await flushRecords();
  BOARD = await loadBoard() || BOARD;
  if (PROFILE) $('mName').textContent = PROFILE.name;   // 등록 중 이름이 겹쳐 다시 뽑혔을 수 있다
  renderBoard();
}
function boardRow(rank, name, best, me){
  const li = document.createElement('li');
  if (me) li.className = 'me';
  const r = document.createElement('span'); r.className = 'rk'; r.textContent = rank;
  const n = document.createElement('span'); n.className = 'nm'; n.textContent = name;
  const b = document.createElement('span'); b.className = 'bs'; b.textContent = progLabel(best);
  li.append(r, n, b);
  return li;
}
function renderBoard(){
  const mini = $('mBoard'), list = $('rankList');
  mini.textContent = ''; list.textContent = '';
  $('mRank').hidden = !BOARD;
  if (!BOARD){ $('rankSub').textContent = '기록 서버에 연결하지 못했다'; return; }
  const me = BOARD.me, top = BOARD.top || [];
  const isMe = t => me && t.name === me.name;
  top.slice(0, 3).forEach((t, i) => mini.append(boardRow(i + 1, t.name, t.best, isMe(t))));
  // 내가 3위 밖이면 맨 아래에 내 줄을 붙인다
  if (me && me.rank > 3) mini.append(boardRow(me.rank, me.name, me.best, true));
  top.forEach((t, i) => list.append(boardRow(i + 1, t.name, t.best, isMe(t))));
  if (me && me.rank > top.length) list.append(boardRow(me.rank, me.name, me.best, true));
  $('rankSub').textContent = !top.length ? '아직 기록이 없다. 첫 번째가 되어 보자'
    : me && me.rank ? `${BOARD.total}명 중 ${me.rank}위` : `기록 ${BOARD.total}명 · 원정을 끝내면 이름이 오른다`;
}
$('mRank').onclick = () => { show('ovRank'); $('rankBack').focus(); refreshBoard(); };
$('rankBack').onclick = () => { show('ovMain'); $('mRank').focus(); };
function resumeRun(){
  if (RUN.gift) return showGift();
  if (RUN.pendingReward) return showReward(RUN.pendingReward);
  if (RUN.pending) return enterNode(nodeAt(RUN.pending.r, RUN.pending.l));
  showMap();
}

// ── 지도
// 갈래 수는 지도마다 읽는다: 3갈래로 만든 이전 저장 지도도 그대로 그려지게
const ROW_Y = [88, 68, 48, 28, 8];
const nodeX = n => n.t === 'boss' ? 50 : (n.l + .5) / RUN.map[0].length * 100;
// 칸 메달 그림: 전투·정예는 그 칸의 몬스터, 휴식은 모닥불, 상점은 상인, 보스는 탑의 주인
function nodeIcon(n){
  const src = n.t === 'rest' ? null : n.t === 'shop' ? 'merchant' : n.mon;
  const ic = document.createElement(src ? 'img' : 'span');
  ic.className = 'nIc' + (n.t === 'rest' ? ' fire' : '');
  ic.setAttribute('aria-hidden', 'true');
  if (src){ ic.alt = ''; ic.src = 'assets/game/' + src + '.png'; ic.onerror = () => ic.remove(); }
  return ic;
}
function showMap(){
  G = null;
  $('mapTitle').textContent = `세션 ${RUN.s + 1}`;
  $('mapSub').textContent = `체력 ${RUN.hp}/${RUN.maxHp}  코인 ${RUN.coins}`;
  const box = $('mapBox'); box.textContent = '';
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
  const onPath = (a, b) => RUN.path.some((p, i) => i > 0 && RUN.path[i - 1][0] === a.r && RUN.path[i - 1][1] === a.l && p[0] === b.r && p[1] === b.l);
  for (let r = 0; r < 4; r++) for (const n of RUN.map[r]) for (const l of n.to){
    const m = r === 3 ? RUN.map[4][0] : nodeAt(r + 1, l);
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('x1', nodeX(n)); ln.setAttribute('y1', ROW_Y[r]); ln.setAttribute('x2', nodeX(m)); ln.setAttribute('y2', ROW_Y[r + 1]);
    const walked = onPath(n, m);
    ln.setAttribute('stroke', walked ? C.ink : C.ink3);
    ln.setAttribute('stroke-width', walked ? 3 : 1.5);
    if (!walked) ln.setAttribute('stroke-dasharray', '3 3');
    ln.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(ln);
  }
  box.append(svg);
  const reach = reachable();
  const visited = (r, l) => RUN.path.some(p => p[0] === r && p[1] === l);
  for (const row of RUN.map) for (const n of row){
    const b = document.createElement('button');
    const canGo = reach.includes(n);
    b.className = 'node t-' + n.t + (canGo ? ' reach' : '') + (visited(n.r, n.l) ? ' done' : '');
    b.style.left = nodeX(n) + '%'; b.style.top = ROW_Y[n.r] + '%';
    // 아래 칸부터 차례로 떠오르게: 탑을 올려다보는 느낌
    b.style.setProperty('--d', (n.r * 70 + n.l * 18) + 'ms');
    const cap = document.createElement('small'); cap.textContent = NODE_NAME[n.t];
    b.append(nodeIcon(n), cap);
    b.setAttribute('aria-label', `${n.r + 1}번째 칸 ${NODE_NAME[n.t]}${canGo ? ', 갈 수 있음' : ''}`);
    b.disabled = !canGo;
    b.onclick = () => { if (mode === 'map' && canGo) enterNode(n); };
    box.append(b);
  }
  // 기사 말: 지금 서 있는 칸(출발 전이면 지도 아래 가운데)
  const tok = document.createElement('img');
  tok.className = 'knightTok'; tok.alt = ''; tok.setAttribute('aria-hidden', 'true'); tok.src = 'assets/game/knight.png';
  tok.onerror = () => tok.remove();
  const at = RUN.pos ? nodeAt(RUN.pos.r, RUN.pos.l) : null;
  tok.style.left = (at ? nodeX(at) : 50) + '%'; tok.style.top = (at ? ROW_Y[at.r] : 100) + '%';
  box.append(tok);
  setHeader(`세션 ${RUN.s + 1}`, '갈림길');
  setMode('map', 'ovMap');
  bgm('calm');
  const first = box.querySelector('.node.reach'); if (first) first.focus();
}

function enterNode(n){
  RUN.pending = { r:n.r, l:n.l }; saveRun();
  // 들어서는 순간 한 번만 울린다(덜어내기 취소 등으로 화면을 다시 그릴 때는 울리지 않게 여기서)
  if (n.t === 'rest'){ sfx('rest'); return showRest(); }
  if (n.t === 'shop'){ sfx('shop'); return showShop(); }
  startBattle(n);
}
function completeNode(){
  const n = RUN.pending; if (!n) return;
  RUN.pos = { r:n.r, l:n.l }; RUN.path.push([n.r, n.l]); RUN.pending = null;
  META.best = Math.max(META.best, RUN.s * 5 + n.r + 1); saveMeta();
}
function finishNonBattle(){ completeNode(); RUN.shop = null; saveRun(); showMap(); }

// ── 전투 시작·종료
function startBattle(n){
  newBattle(n);
  const label = `${RUN.s + 1}-${n.r + 1}`;
  setHeader(`세션 ${RUN.s + 1}  ${label} ${NODE_NAME[n.t]}`, G.cfg.name);
  setMode('play', null);
  banner(n.t === 'boss' ? `세션 ${RUN.s + 1} 보스` : label, G.cfg.name, n.t !== 'battle');
  bgm(n.t === 'boss' ? 'boss' : 'battle');
  if (n.t === 'boss') sfx('boss');
}
function battleEnd(win){
  const n = G.node;
  if (!win) return runOver();
  RUN.hp = Math.min(RUN.maxHp, G.p.hp + 2 * rel('medkit'));
  const gain = n.t === 'boss' ? 40 : n.t === 'elite' ? 22 + rnd(7) : 10 + rnd(5);
  RUN.coins += gain; RUN.lastGain = gain;
  // 세션 돌파: 최대 체력 +4 후 절반 회복. 몬스터는 세션마다 공·방이 오르는데 기사 체력만 고정이면 후반이 벽이 된다
  if (n.t === 'boss'){ RUN.maxHp += 4; RUN.hp = Math.min(RUN.maxHp, RUN.hp + 4 + Math.ceil(RUN.maxHp / 2)); }
  completeNode();
  RUN.pendingReward = n.t === 'battle' ? 'orb' : n.t;
  saveRun();
  sfx('win'); bgm('calm');
  showReward(RUN.pendingReward);
}
function runOver(){
  const n = G.node; clearRun(); endRun(RUN);
  bgm(null); sfx('lose');
  showChoice({
    mode:'result', title:'원정 실패',
    sub:`${RUN.s + 1}-${n.r + 1}, ${G.cfg.name}에게 쓰러졌다. 구슬 ${RUN.deck.length}개, 유물 ${Object.keys(RUN.relics).length}개를 모았다.`,
    cards:[], buttons:[
      { label:'새 원정', primary:true, onClick:startNewRun },
      { label:'메인 화면', onClick:showMain },
    ],
  });
  $('cTitle').className = 'big lose';
}
