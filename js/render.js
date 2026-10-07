// 렌더: 캔버스 그리기와 HUD
'use strict';

// ── 렌더
function statRow(cx, atk, def){
  drawIcon('sword', cx - 36, 94, C.ink); drawText(String(atk), cx - 27, 93, C.ink, 2);
  drawIcon('shield', cx + 2, 94, C.ink); drawText(String(def), cx + 11, 93, C.ink, 2);
}
function hpBlock(cx, hp, max, danger, poison){
  drawIcon('heart', cx - 36, 5, danger ? C.accent : C.ink);
  drawText(String(hp), cx - 27, 4, danger ? C.accent : C.ink, 2);
  ctx.fillStyle = C.line; ctx.fillRect(cx - 36, 17, 72, 4);
  const hw = Math.round(72 * hp / max);
  ctx.fillStyle = danger ? C.accent : C.ink; ctx.fillRect(cx - 36, 17, hw, 4);
  if (poison > 0){
    // 다음 독 틱으로 사라질 체력 구간을 붉게 미리 보여준다
    const pw = Math.round(72 * Math.min(poison, hp) / max);
    ctx.fillStyle = C.accent; ctx.fillRect(cx - 36 + hw - pw, 17, pw, 4);
    drawIcon('skull', cx + 12, 5, C.accent); drawText(String(poison), cx + 21, 4, C.accent, 2);
  }
}
function brickAt(x, y){
  for (const b of G.bricks){
    const bx = OX + b.c * CW + 1;
    if (x >= bx - 1.5 && x <= bx + CW - 2 + 1.5 && y >= b.y - 1.5 && y <= b.y + BRH + 1.5) return true;
  }
  return false;
}
function draw(){
  fitCanvas();
  ctx.setTransform(RES, 0, 0, RES, 0, 0); ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  if (!drawBgArt()){
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, BT);
    ctx.fillStyle = C.field; ctx.fillRect(0, BT, W, H - BT);
  }
  const g = G; if (!g) return;
  if (isAbyss()) drawAbyssFx(g.time);
  const sx = g.shake > 0 ? Math.round((Math.random() - .5) * g.shake) : 0;
  const sy = g.shake > 0 ? Math.round((Math.random() - .5) * g.shake) : 0;
  ctx.setTransform(RES, 0, 0, RES, sx * RES, sy * RES);

  const p = g.p, m = g.m;
  hpBlock(PX, p.hp, p.max, p.hp <= p.max * 0.3, p.poison);
  statRow(PX, p.atk, p.def);
  if (!drawCharArt('knight', PX, p.hp > 0 ? artBob('knight', g.time) : 0, { actor:p, flash:p.flash > 0 ? C.accent : null }))
    drawSprite(SPR.knight, PX - 18, 50, 3, p.flash > 0 ? C.accent : C.ink, C.ink2, C.bg);

  const angry = g.cfg.boss && m.phase === 2;
  if (!m.dead || artImg(g.cfg.spr + '_actions') || Math.floor(m.deadT * 10) % 2 === 0){
    hpBlock(MX, m.hp, m.max, false, m.poison);
    statRow(MX, m.atk, m.def);
    const lunge = m.lunge > 0 ? -Math.sin(Math.PI * m.lunge / 0.4) * 14 : 0;
    const sink = m.dead ? Math.min(20, m.deadT * 30) : 0;
    ctx.globalAlpha = m.dead ? Math.max(0, 1 - Math.max(0, m.deadT - .74) / .36) : 1;
    const art = { actor:m, flash:m.flash > 0 ? '#FFFDF8' : null, outline:(angry || g.cfg.elite) ? C.accent : null };
    if (!drawCharArt(g.cfg.spr, MX + lunge, m.dead ? sink : artBob(g.cfg.spr, g.time), art))
      drawSprite(SPR[g.cfg.spr], MX - 24 + lunge, 38 + sink, 3, m.flash > 0 ? C.ink3 : C.ink, C.ink2, (angry || g.cfg.elite) ? C.accent : C.bg);
    ctx.globalAlpha = 1;
  }
  // 몬스터의 다음 행동 예고: 이것만 보고 이번 턴에 무엇을 노릴지 정한다
  // 공격: 붉은 숫자 = 남은 연속 공격 턴 수. 한 번의 피해는 언제나 아래 ⚔ 숫자다
  if (!m.dead && (g.phase === 'aim' || g.phase === 'fire')){
    const it = intent();
    if (it.t === 'atk'){ drawIcon('sword', MX - 14, 27, C.accent); drawText(String(atkLeft(it)), MX - 4, 25, C.accent, 2); }
    else if (it.t === 'guard'){ drawIcon('shield', MX - 14, 27, C.ink); drawText('+' + it.v, MX - 4, 25, C.ink, 2); }
    else if (it.t === 'spore') drawIcon('brick', MX - 4, 27, C.accent);
    else if (it.t === 'poison'){ drawIcon('skull', MX - 14, 27, C.accent); drawText('+' + it.v, MX - 4, 25, C.accent, 2); }
    else if (it.t === 'summon') drawIcon('brick', MX - 4, 27, C.ink);
    else drawIcon('dots', MX - 4, 27, C.ink3);
  }

  // 천장: 이 선에 닿아야 몬스터를 친다
  ctx.fillStyle = C.ink; ctx.fillRect(0, BT - 2, W, 2);
  for (const f of g.cf){ ctx.globalAlpha = clamp(f.t * 4, 0, 1); ctx.fillRect(Math.round(f.x) - 7, BT - 5, 14, 3); }
  ctx.globalAlpha = 1;

  for (const b of g.bricks){
    const x = OX + b.c * CW + 1, y = Math.round(b.y), w = CW - 2, h = BRH;
    if (drawBrickArt(b, x, y, w, h)) continue;
    if (b.type === 'n' || b.type === 'stone'){
      let fill = b.type === 'stone' ? C.ink : b.hp >= 3 ? C.ink : b.hp === 2 ? C.ink2 : C.ink3;
      if (b.flash > 0) fill = C.line;
      ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
      if (b.type === 'stone'){ ctx.fillStyle = C.field; for (let k = 2; k < w; k += 4) ctx.fillRect(x + k, y + 1, 1, 1); }
      ctx.fillStyle = C.line; ctx.fillRect(x + 1, y + 1, w - 2, 1);
      ctx.fillStyle = C.ink; ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
      if (b.hp > 1) drawText(String(b.hp), x + w / 2, y + 4, C.field, 1, 'center');
    } else {
      const border = b.type === 'poison' ? C.accent : C.ink;
      ctx.fillStyle = b.flash > 0 ? C.line : C.panel; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = border;
      ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
      const ic = b.type === 'atk' ? 'sword' : b.type === 'def' ? 'shield' : b.type === 'heal' ? 'heart' : 'skull';
      drawIcon(ic, x + 7.5, y + 2.5, border);
    }
  }

  // 붕괴선: 이 선을 넘는 벽돌은 무너지며 기사를 덮친다
  const lowR = g.bricks.reduce((a, b) => Math.max(a, b.r), 0);
  ctx.fillStyle = lowR >= MAXROW - 2 && Math.floor(g.time * 5) % 2 === 0 ? C.accent : C.ink3;
  for (let x = OX; x < RIGHT; x += 4) ctx.fillRect(x, CRASH_Y, 2, 1);
  ctx.fillStyle = C.line;
  for (let x = OX; x < RIGHT; x += 4) ctx.fillRect(x, FLOOR, 2, 1);

  if (g.phase === 'aim' && mode === 'play'){
    const dx = Math.cos(g.aim), dy = Math.sin(g.aim);
    let x = g.lx, y = FLOOR - 2, len = 0;
    for (let k = 0; k < 400; k++){
      x += dx * 1.5; y += dy * 1.5; len += 1.5;
      if (x < OX + 1.5 || x > RIGHT - 1.5 || y < BT + 1.5 || brickAt(x, y)) break;
    }
    ctx.fillStyle = C.ink2;
    for (let d = 10; d < len; d += 6) ctx.fillRect(Math.round(g.lx + dx * d), Math.round(FLOOR - 2 + dy * d), 1, 1);
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 1); ctx.fillRect(Math.round(x) - 1, Math.round(y) + 1, 3, 1);
  }

  // 조준선 가속 중(정예 분노·보스 페이즈): 발사대 양옆에 붉은 화살표. 말 대신 "지금 빨라졌다"를 보여 준다
  if (g.phase === 'aim' && aimRage() > 1 && Math.floor(g.time * 4) % 2 === 0){
    drawIcon('up', g.lx - 17, FLOOR - 9, C.accent); drawIcon('up', g.lx + 11, FLOOR - 9, C.accent);
  }
  // 발사대: 이번에 쏠 구슬의 아이콘을 보여준다
  if (g.phase === 'aim' || (g.phase === 'fire' && g.queue.length)){
    ctx.fillStyle = C.ink2; ctx.fillRect(g.lx - 7, FLOOR - 1, 14, 2);
    drawOrbSprite(orbKind(g.orb), g.lx, FLOOR - 7, 9);
    // 강화 구슬은 발사대 옆에 +를 붙여, HUD를 안 봐도 이번 구슬이 센 구슬인 걸 알게 한다
    if (orbUp(g.orb)) drawText('+', g.lx + 6, FLOOR - 14, C.ink);
  }
  if (g.nextLx !== null){ ctx.fillStyle = C.ink2; ctx.fillRect(Math.round(g.nextLx) - 1, FLOOR - 3, 3, 3); }
  for (const b of g.balls){
    const trail = b.trail || [];
    for (let i = 0; i < trail.length; i++){
      ctx.globalAlpha = (i + 1) / trail.length * .3;
      ctx.fillStyle = b.kind === 'venom' ? C.accent : C.ink2;
      ctx.fillRect(Math.round(trail[i].x) - 1, Math.round(trail[i].y) - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
    drawOrbSprite(b.kind, b.x, b.y, b.kind === 'heavy' ? 7 : 5);
    if (b.impact > 0 && !drawSparkArt(b.x, b.y, b.impact / .12)){
      ctx.globalAlpha = b.impact / .12; ctx.fillStyle = C.panel;
      ctx.fillRect(b.x - 6, b.y, 3, 1); ctx.fillRect(b.x + 4, b.y, 3, 1);
      ctx.fillRect(b.x, b.y - 6, 1, 3); ctx.globalAlpha = 1;
    }
  }

  for (const pr of g.projs){
    const k = clamp(pr.t / pr.dur, 0, 1), e = k * k;
    const x = pr.x0 + (pr.x1 - pr.x0) * e, y = pr.y0 + (pr.y1 - pr.y0) * k - Math.sin(Math.PI * k) * 18;
    if (pr.kind === 'dmg'){ ctx.fillStyle = pr.venom ? C.accent : C.ink; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); }
    else if (pr.kind === 'poison') drawIcon('skull', x - 3, y - 3, C.accent);
    else drawIcon(pr.kind === 'atk' ? 'sword' : pr.kind === 'def' ? 'shield' : 'heart', x - 3, y - 3, C.ink);
  }
  for (const q of g.parts){
    ctx.globalAlpha = clamp(q.t * 2.5, 0, 1);
    if (q.img){ drawPartArt(q); continue; }   // 그림이 없으면 파편은 생략: 같은 자리에 도트 파티클이 이미 튄다
    ctx.fillStyle = q.col; ctx.fillRect(Math.round(q.x), Math.round(q.y), 2, 2);
  }
  for (const pp of g.pops){
    ctx.globalAlpha = clamp(pp.t * 1.8, 0, 1);
    const tw = pp.txt ? (pp.txt.length * 4 - 1) * 2 : 0, iw = pp.icon ? 9 : 0, x0 = pp.x - (tw + iw) / 2;
    if (pp.icon) drawIcon(pp.icon, x0, pp.y + 1, pp.col);
    if (pp.txt) drawText(pp.txt, x0 + iw, pp.y, pp.col, 2);
  }
  ctx.globalAlpha = 1;
}

// 심연: 바닥 틈에서 붉은 불씨가 올라오고, 천장 아래로 금이 간다. 위치는 시간으로만 정해 게임 무작위와 섞이지 않는다
function drawAbyssFx(t){
  ctx.fillStyle = '#000'; ctx.globalAlpha = .35; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  ctx.fillStyle = C.accent;
  for (let k = 0; k < 14; k++){
    const sp = 9 + (k * 7) % 11, y = H - ((t * sp + k * 53) % (H + 20)), x = (k * 37 + Math.sin(t * .8 + k) * 6) % W;
    ctx.globalAlpha = .25 + .35 * ((k * 13) % 5) / 5;
    ctx.fillRect(Math.round(x), Math.round(y), k % 3 ? 1 : 2, k % 3 ? 1 : 2);
  }
  // 천장 아래 금: 고정 모양의 지그재그 몇 줄
  ctx.globalAlpha = .55;
  for (const x0 of [22, 71, 128]){
    let x = x0;
    for (let y = BT; y < BT + 18; y += 3){ ctx.fillRect(x, y, 1, 3); x += ((x0 + y) % 3) - 1; }
  }
  ctx.globalAlpha = 1;
}

// ── HUD
function setHeader(stage, name){ $('hStage').textContent = stage; $('hName').textContent = name; }
function renderCoins(){ $('hCoin').textContent = RUN && mode !== 'main' ? `코인 ${RUN.coins}` : ''; }
function deckSummary(){
  const cnt = {}; RUN.deck.forEach(o => cnt[o] = (cnt[o] || 0) + 1);
  return Object.keys(cnt).map(o => `${orbName(o).replace(' 구슬', '')} ${cnt[o]}`).join(', ');
}
function renderOrbBar(){
  const el = $('orbBar'); el.textContent = '';
  if (!RUN || mode === 'main') return;
  if (G && mode === 'play'){
    const current = document.createElement('div'); current.className = 'orbCurrent';
    const label = document.createElement('div');
    // 쏜 순간부터 다음 턴 조준 전까지 "발사!": 누른 입력이 먹혔다는 걸 바로 보여준다
    const fired = G.phase !== 'aim';
    const small = document.createElement('small'); small.textContent = fired ? '발사!' : '발사 대기';
    if (fired) small.className = 'fired';
    const name = document.createElement('b'); name.textContent = orbName(G.orb);
    // 피해 = 기사 ⚔ + 구슬 보정을 식으로 보여 준다. ⚔ 벽돌을 깨면 왼쪽 숫자가, 센 구슬을 쓰면 오른쪽 숫자가 오른다.
    // 핵심 노드 배율이 붙으면 결과만 커진다(식은 덧셈 부분만)
    const bonus = orbBonus(G.orb), dmg = document.createElement('em'); dmg.className = 'dmg';
    const hp = hitParts(G.orb), sum = `⚔${G.p.atk} + ${bonus}`;
    // 스킬 트리 배율이 있으면 괄호로 묶어 곱한다: (⚔2 + 3) ×1.5 = 8
    dmg.textContent = hp.k !== 1 ? `(${sum}) ×${+hp.k.toFixed(2)} = ${hp.v}` : `${sum} = ${hp.v}`;
    dmg.title = '천장 타격 피해 = (기사 공격력 + 구슬 보정) × 스킬 트리 배율';
    name.append(dmg);
    label.append(small, name); current.append(orbPortrait(orbKind(G.orb)), label);
    const next = document.createElement('div'); next.className = 'orbNext';
    const text = document.createElement('span'); text.textContent = '다음';
    next.append(text, orbPortrait(orbKind(nextOrb())), orbName(nextOrb()).replace(' 구슬', ''));
    el.append(current, next); el.title = orbDesc(G.orb);
  } else el.append(`구슬 덱 ${RUN.deck.length}/${DECK_MAX}: ${deckSummary()}`);
}
function renderAbil(){
  const box = $('abil'); box.textContent = '';
  if (!RUN || mode === 'main') return;
  const ids = Object.keys(RUN.relics);
  if (!ids.length){ const n = document.createElement('span'); n.className = 'none'; n.textContent = '유물 없음'; box.append(n); return; }
  for (const id of ids){
    const c = document.createElement('span');
    c.textContent = RELICS[id].name + (RUN.relics[id] > 1 ? ' ' + RUN.relics[id] : '');
    c.title = RELICS[id].desc;
    box.append(c);
  }
}
function refreshHud(){ renderCoins(); renderOrbBar(); renderAbil(); }
