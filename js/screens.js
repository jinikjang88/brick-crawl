// 화면 전환: 메인·지도·전투 시작/종료
'use strict';

// ── 화면 전환 공통
const OVERLAYS = ['ovMain','ovMap','ovChoose','ovPause'];
function show(id){ OVERLAYS.forEach(o => $(o).classList.toggle('on', o === id)); }
function setMode(m, overlay){ mode = m; show(overlay); refreshHud(); }

// 선택 화면(보상·휴식·상점·덜어내기)을 하나의 틀로 그린다
function showChoice(o){
  $('cTitle').textContent = o.title; $('cTitle').className = 'big';
  $('cSub').textContent = o.sub || '';
  const box = $('cCards'); box.textContent = '';
  for (const c of o.cards){
    const b = document.createElement('button');
    b.className = 'rCard' + (c.rare ? ' rare' : ''); b.disabled = !!c.disabled;
    const t = document.createElement('b'); t.append(c.name);
    if (c.tag){ const em = document.createElement('em'); em.textContent = c.tag; t.append(em); }
    const d = document.createElement('span'); d.textContent = c.desc;
    b.append(t, d);
    b.onclick = () => { if (mode !== o.mode) return; c.onPick(); };
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
  $('mRecord').textContent = META.best > 0 ? `최고 기록 ${progLabel(META.best)} 돌파, 원정 ${META.runs}회` : '';
  setHeader('', '');
  setMode('main', 'ovMain');
  (saved ? c : $('mNew')).focus();
}
$('mContinue').onclick = () => { const r = loadRun(); if (!r) return showMain(); RUN = r; resumeRun(); };
// 저장된 원정이 있으면 두 번 눌러야 덮어쓴다
$('mNew').onclick = e => {
  const b = e.currentTarget;
  if (loadRun() && !b.dataset.arm){ b.dataset.arm = '1'; b.textContent = '한 번 더 누르면 저장된 원정이 사라진다'; return; }
  RUN = freshRun(); META.runs++; saveMeta(); saveRun(); showMap();
};
function resumeRun(){
  if (RUN.pendingReward) return showReward(RUN.pendingReward);
  if (RUN.pending) return enterNode(nodeAt(RUN.pending.r, RUN.pending.l));
  showMap();
}

// ── 지도
const LANE_X = [18, 50, 82], ROW_Y = [88, 69, 50, 31, 11];
const nodeX = n => n.t === 'boss' ? 50 : LANE_X[n.l];
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
    b.className = 'node' + (n.t === 'boss' ? ' boss' : '') + (canGo ? ' reach' : '') + (visited(n.r, n.l) ? ' done' : '');
    b.style.left = nodeX(n) + '%'; b.style.top = ROW_Y[n.r] + '%';
    b.textContent = NODE_NAME[n.t];
    b.setAttribute('aria-label', `${n.r + 1}번째 칸 ${NODE_NAME[n.t]}${canGo ? ', 갈 수 있음' : ''}`);
    b.disabled = !canGo;
    b.onclick = () => { if (mode === 'map' && canGo) enterNode(n); };
    box.append(b);
  }
  setHeader(`세션 ${RUN.s + 1}`, '갈림길');
  setMode('map', 'ovMap');
  const first = box.querySelector('.node.reach'); if (first) first.focus();
}

function enterNode(n){
  RUN.pending = { r:n.r, l:n.l }; saveRun();
  if (n.t === 'rest') return showRest();
  if (n.t === 'shop') return showShop();
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
}
function battleEnd(win){
  const n = G.node;
  if (!win) return runOver();
  RUN.hp = Math.min(RUN.maxHp, G.p.hp + 2 * rel('medkit'));
  const gain = n.t === 'boss' ? 40 : n.t === 'elite' ? 22 + rnd(7) : 10 + rnd(5);
  RUN.coins += gain; RUN.lastGain = gain;
  if (n.t === 'boss') RUN.hp = Math.min(RUN.maxHp, RUN.hp + Math.ceil(RUN.maxHp / 2));   // 세션 돌파: 절반 회복
  completeNode();
  RUN.pendingReward = n.t === 'battle' ? 'orb' : n.t;
  saveRun();
  showReward(RUN.pendingReward);
}
function runOver(){
  const n = G.node; clearRun();
  showChoice({
    mode:'result', title:'원정 실패',
    sub:`${RUN.s + 1}-${n.r + 1}, ${G.cfg.name}에게 쓰러졌다. 구슬 ${RUN.deck.length}개, 유물 ${Object.keys(RUN.relics).length}개를 모았다.`,
    cards:[], buttons:[
      { label:'새 원정', primary:true, onClick:() => { RUN = freshRun(); META.runs++; saveMeta(); saveRun(); showMap(); } },
      { label:'메인 화면', onClick:showMain },
    ],
  });
  $('cTitle').className = 'big lose';
}
