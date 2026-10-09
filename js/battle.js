// 전투: 상태·벽돌·구슬 물리·턴 진행·몬스터 행동
'use strict';

// ── 전투 상태
function newBattle(node){
  const cfg = monCfg(node.mon, RUN.s, node.t === 'elite', RUN.abyss);
  G = {
    node, cfg, time:0, turn:1, phase:'aim', timer:0, eStep:0, cur:null, shown:false,
    // 공격·방어는 전투마다 초기화. 기본 공격력 1(+날 세우기), 시작 방어도는 갑옷·방패술만
    p:{ hp:RUN.hp, max:RUN.maxHp, atk:1 + (tree('a1') ? 1 : 0) + rel('whetstone') + (rel('collector') ? Math.floor(seenCount('orb') / 5) : 0), def:defGain(3 * rel('armor') + (tree('d2') ? 2 : 0)), poison:0, flash:0 },
    m:{ hp:cfg.hp, max:cfg.hp, atk:cfg.atk, def:cfg.def, poison:0, pi:0, ai:0, phase:1, rage:false, flash:0, lunge:0, dead:false, deadT:0 },
    // 배지 판정용: lost = 이번 전투에서 체력을 잃었는지, shot = 이번 발사의 기록(시작 때 몬스터 체력이 가득했는지·천장 타격 수·부순 벽돌)
    lost:false, shot:null,
    // 전투마다 횟수가 정해진 효과들: 두 번째 심장·굳은살·무장해제·기절·시간 구슬. mirror = 이번 턴 되돌릴 비율(거울 구슬), toxic = 몬스터 독이 줄지 않음(맹독)
    heart:false, callus:false, disarm:0, stunUsed:false, timeUsed:0, mirror:0, toxic:false,
    bricks:[], balls:[], projs:[], pops:[], parts:[], cf:[], queue:[],
    lx:W / 2, nextLx:null, aim:-Math.PI / 2, aimDir:1, aimT:0, fireT:0, fireEl:0, shake:0,
    draw:shuffle(RUN.deck), disc:[], orb:'basic',
  };
  for (let r = WALL.init - 1; r >= 0; r--) spawnRow(r, true);
  drawOrb(); resetAim();
}

function spawnRow(r, instant){
  const rc = G.cfg.row, cells = [];
  for (let c = 0; c < COLS; c++) if (Math.random() < rc.d * WALL.dens) cells.push(c);
  if (!cells.length) cells.push(rnd(COLS));
  // 특수 벽돌은 한 줄에 최대 1개(독은 별도 1개): 드물어야 노려서 맞힐 가치가 생긴다
  const order = shuffle(cells);
  const statCell = Math.random() < rc.stat + (rel('mason') ? .1 : 0) ? order[0] : -1;
  const poisonCell = rc.poison && order.length > 1 && Math.random() < rc.poison ? order[1] : -1;
  for (const c of cells){
    const type = c === statCell ? pickW(rc.w) : c === poisonCell ? 'poison' : 'n';
    const hp = type === 'n' && Math.random() < rc.hard ? 2 : 1;
    G.bricks.push({ r, c, y: instant ? rowY(r) : rowY(r) - ROWH, hp, type, flash:0, dead:false });
  }
}
function replaceInRow0(n, make){
  const cols = shuffle([...Array(COLS).keys()]).slice(0, n);
  G.bricks = G.bricks.filter(b => !(b.r === 0 && cols.includes(b.c)));
  for (const c of cols) G.bricks.push(Object.assign({ r:0, c, y:rowY(0) - ROWH, flash:0, dead:false }, make()));
}

// 구슬 뽑기: 뽑을 더미가 비면 버린 더미를 섞어 채운다. 다음 구슬을 미리 보여주려고 바로 채워 둔다
function drawOrb(){
  if (!G.draw.length){ G.draw = shuffle(G.disc); G.disc = []; }
  G.orb = G.draw.pop() || 'basic';
  if (!G.draw.length && G.disc.length){ G.draw = shuffle(G.disc); G.disc = []; }
  renderOrbBar();
}
const nextOrb = () => G.draw.length ? G.draw[G.draw.length - 1] : G.orb;

function resetAim(){
  // 매 턴 시작 위치·방향을 무작위로: 같은 타이밍을 외워서 누르는 걸 막는다
  G.aim = AIM_MIN + Math.random() * (AIM_MAX - AIM_MIN);
  G.aimDir = Math.random() < 0.5 ? -1 : 1;
  G.aimT = 0;
}

const intent = () => { const pat = (G.m.phase >= 3 && G.cfg.pattern3) || (G.m.phase >= 2 && G.cfg.pattern2) || G.cfg.pattern; return pat[G.m.pi % pat.length]; };
// 조준선 속도: 몬스터 기본 속도 × 가속(정예 분노·보스 페이즈) × 감속(집중 유물·정조준 노드)
const aimRage = () => G.cfg.boss ? 1 + ENRAGE.phase * (G.m.phase - 1) : G.m.rage ? ENRAGE.elite : 1;
const aimSpeed = () => G.cfg.sweep * aimRage() * Math.pow(0.85, rel('focus') + (tree('o5') ? 1 : 0));
// 철벽(핵심 노드): 전투 중 얻는 방어도 ×1.5(올림)
const defGain = v => tree('d6') ? Math.ceil(v * 1.5) : v;
// 연속 공격에서 남은 공격 턴 수(이번 턴 포함). 머리 위 붉은 숫자가 3 → 2 → 1로 줄어든다
// 모래시계: 연속 공격 턴 수 -1(최소 1). 예고 숫자와 실제 진행이 같은 함수를 쓴다
const atkN = it => rel('hourglass') ? Math.max(1, it.n - 1) : it.n;
const atkLeft = it => atkN(it) - G.m.ai;
// 독 행동의 독 양: v가 없으면 몬스터 ⚔ 공격력(화면 숫자와 실제 독이 같다)
const poisonAmt = it => it.v !== undefined ? it.v : G.m.atk;
// 보스 벽돌 낙하: 패턴과 별개로 짝수 턴마다(분노 페이즈부터는 매 턴) 아무 칸에나 벽돌을 떨어뜨린다.
// 깊을수록 많이 떨어진다(본편 1·1·2·2·3개, 심연 1층 2개부터). 이미 벽돌이 있는 칸이면 그 벽돌 체력 +1
const bossDropN = () => 1 + Math.floor((RUN.abyss ? RUN.s + ABYSS.base + 1 : RUN.s) / 2);
const bossDropsNow = () => !!G.cfg.boss && !G.m.dead && G.turn % (G.m.phase >= 2 ? 2 : 3) === 0;
function bossDrop(){
  for (let k = 0; k < bossDropN(); k++){
    // 붕괴선 바로 위 두 줄은 비운다: 떨어지자마자 무너져 피할 수 없는 피해가 되지 않게
    const r = rnd(MAXROW - 2), c = rnd(COLS);
    const b = G.bricks.find(o => !o.dead && o.r === r && o.c === c);
    if (b){ b.hp++; b.flash = 0.15; pop(OX + c * CW + CW / 2, rowY(r) - 2, '+1', C.accent); }
    else G.bricks.push({ r, c, y:BT, hp:1, type:'n', flash:0.15, dead:false });
  }
  G.shake = Math.max(G.shake, 3); sfx('stone');
}
// 천장 타격 한 번의 피해 = 기사 공격력(⚔) + 구슬 보정 (+ 연쇄) → 핵심 노드 배율.
// HUD도 같은 함수를 써서 화면 숫자와 실제 피해가 어긋나지 않게 한다. n = 이 구슬의 몇 번째 타격인지(HUD는 생략 = 첫 타)
// 덧셈 뒤에 곱셈: 핵심 노드는 쌓은 덧셈을 키우는 배율이다
// 덧셈 부분(base)과 곱셈 배율(k)을 나눠 돌려준다. HUD가 같은 분해를 그대로 보여 줘야
// "⚔2 + 3 = 8"처럼 배율이 빠진 식이 나오지 않는다
// ball: 구슬마다 쌓이는 보정(사슬 = 몇 번째 타격인지, 철거 = 이 구슬이 부순 벽돌 수). HUD는 첫 타 기준으로 생략한다
function hitParts(o, n = 1, ball){
  const k0 = orbKind(o), up = orbUp(o);
  const base = G.p.atk + orbBonus(o) + (n >= 3 && tree('a5') ? 1 : 0) + rel('pact')
    + (rel('wrath') && G.p.hp <= G.p.max * .3 ? 2 : 0)
    + (k0 === 'chain' ? (n - 1) * (up ? 2 : 1) : 0)
    + (k0 === 'wreck' && ball ? Math.floor((ball.broke || 0) / (up ? 2 : 3)) : 0);
  let k = 1;
  if (orbUp(o) && tree('o4')) k *= 2;
  if (['heavy', 'bomb'].includes(orbKind(o)) && tree('o6')) k *= 2;
  if (tree('a6')) k *= 1.5;
  if (tree('a4') && G.m.hp <= G.m.max / 2) k *= 1.5;
  // 분열은 배율까지 곱한 피해를 갈래 수로 나눈다(올림, 최소 1)
  const div = splitWays(o);
  return { base, k, div, v:Math.max(1, Math.ceil(Math.round(base * k) / div)) };
}
const hitDmg = (o, n = 1, ball) => hitParts(o, n, ball).v;
// 몬스터에게 바로 날아가는 피해(반격·가시·거울). counter = 반격 계열로 쓰러뜨렸는지(배지)
const strike = (x, y, v) => G.projs.push({ x0:x, y0:y, x1:MX, y1:62, t:0, dur:0.3, kind:'dmg', v, counter:true });
// 배지: 처음 따면 알림을 띄우고, 다시 따면 횟수만 센다
function earnBadge(id){
  const b = BADGES.find(x => x.id === id); if (!b) return;
  const first = !META.badges[id];
  META.badges[id] = (META.badges[id] || 0) + 1; saveMeta();
  if (RUN) (RUN.badges = RUN.badges || []).includes(id) || RUN.badges.push(id);
  if (first){ toast(`배지 획득 · ${b.name}`); sfx('badge'); }
}
function toast(msg){
  const t = $('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2200);
}
// 방어도는 체력 앞에 붙은 보호막: 피해를 먼저 흡수하고 흡수한 만큼 깎인다
function hurt(t, v){ const ab = Math.min(t.def, v); t.def -= ab; t.hp = Math.max(0, t.hp - (v - ab)); return [ab, v - ab]; }
function hurtPlayer(v, icon, fromMonster){
  if (tree('d3')) v = Math.ceil(v * .75);   // 불굴: 곱연산 감쇠라 심연의 큰 피해일수록 덜어 주는 양이 크다
  const p = G.p, [ab, hit] = hurt(p, v);
  if (ab) pop(PX, 42, '-' + ab, C.ink2, 'shield');
  if (ab && fromMonster && rel('counter') && !G.m.dead) strike(PX + 10, 66, Math.ceil(ab / 2));
  if (fromMonster && !G.m.dead){
    if (rel('thorns')) strike(PX + 6, 60, 1);
    if (G.mirror) strike(PX + 14, 70, Math.ceil(v * G.mirror));
  }
  if (hit){ G.lost = true; artPose(p, 'hit'); p.flash = 0.18; G.shake = Math.max(G.shake, 5); burst(PX, 66, C.accent, 10); pop(PX, ab ? 28 : 30, '-' + hit, C.accent, icon); sfx('hurt'); }
  else { burst(PX, 66, C.ink3, 6); sfx('block'); }
}

function pop(x, y, txt, col, icon){ G.pops.push({ x, y, txt, col, icon, t:0.9 }); }
function burst(x, y, col, n){
  for (let k = 0; k < n; k++){
    const a = Math.random() * Math.PI * 2, s = 25 + Math.random() * 55;
    G.parts.push({ x, y, vx:Math.cos(a) * s, vy:Math.sin(a) * s - 20, t:0.35 + Math.random() * 0.3, col });
  }
}
function banner(l1, l2, hot){
  const b = $('banner'); $('bn1').textContent = l1; $('bn2').textContent = l2;
  b.classList.toggle('hot', !!hot); b.classList.add('on');
  clearTimeout(banner.h); banner.h = setTimeout(() => b.classList.remove('on'), 1300);
}

// ── 벽돌 파괴: 성벽은 길만 막고, 강화·독 벽돌은 기사에게 날아간다
function onBreak(b){
  const bx = OX + b.c * CW + CW / 2, by = b.y + BRH / 2;
  if (b.type === 'n' || b.type === 'stone'){
    burst(bx, by, C.ink3, 4);
    G.parts.push({ x:bx, y:by, vx:(Math.random() - .5) * 40, vy:-35, t:.5, col:C.ink3, img:'rubble', size:b.type === 'stone' ? 11 : 9, rot:0, vr:(Math.random() - .5) * 8 });
  }
  else if (b.type === 'poison'){
    G.projs.push({ x0:bx, y0:by, x1:PX, y1:66, t:0, dur:0.36, kind:'poison', v:1 });
    burst(bx, by, C.accent, 7);
  } else {
    G.projs.push({ x0:bx, y0:by, x1:PX, y1:66, t:0, dur:0.36, kind:b.type, v:1 });
    burst(bx, by, C.ink, 5);
  }
}
// 구슬 종류별 파괴 효과
function ballBreak(b, br){
  if (b.kind === 'guard'){ const v = defGain(b.up ? 2 : 1); G.p.def += v; pop(PX + 12, 88, '+' + v, C.ink2, 'shield'); }
  if (b.kind === 'bomb' && !b.bombed){
    b.bombed = true; G.shake = Math.max(G.shake, 3); sfx('boom');
    burst(OX + br.c * CW + CW / 2, br.y + BRH / 2, C.ink, 16);
    for (const o of G.bricks){
      if (o.dead || o === br || Math.abs(o.r - br.r) > 1 || Math.abs(o.c - br.c) > 1) continue;
      o.hp -= b.up ? 2 : 1; o.flash = 0.1;
      if (o.hp <= 0){ o.dead = true; onBreak(o); if (G.shot && ++G.shot.broke === 12) earnBadge('demolish'); }
    }
  }
}
function arrive(pr){
  const g = G;
  if (pr.kind === 'dmg'){
    if (g.m.dead) return;
    const [ab, hit] = hurt(g.m, pr.v); g.m.flash = 0.1; artPose(g.m, 'hit');
    if (tree('a4')) renderOrbBar();   // 처형 배율은 몬스터 체력 절반에서 켜지므로 HUD 식도 그때 바꾼다
    const jx = MX + (Math.random() * 16 - 8);
    if (ab) pop(jx, 44, '-' + ab, C.ink2, 'shield');
    if (hit) pop(jx, ab ? 32 : 44, '-' + hit, C.ink);
    sfx(hit ? 'mhit' : 'block', { big:hit >= 3 });
    if (pr.venom){ pr.venom += rel('sting'); g.m.poison += pr.venom; pop(MX + 20, 30, '+' + pr.venom, C.accent, 'skull'); }
    if (pr.shot) pr.shot.landed++;
    if (g.m.hp === 0) killMonster(pr.counter ? 'counter' : pr.shot);
    else checkRage();
    return;
  }
  sfx('pickup', { kind:pr.kind });
  if (pr.kind === 'atk'){ const v = 1 + rel('harvest') + (tree('a3') ? 1 : 0) + (rel('kingsword') ? 2 : 0); g.p.atk += v; pop(PX - 26, 88, '+' + v, C.ink, 'sword'); renderOrbBar(); }
  else if (pr.kind === 'def'){ const v = defGain(2 + rel('harvest') + (tree('d5') ? 1 : 0)); g.p.def += v; pop(PX + 12, 88, '+' + v, C.ink, 'shield'); }
  else if (pr.kind === 'heal'){
    const before = g.p.hp; g.p.hp = Math.min(g.p.max, g.p.hp + 4);
    pop(PX, 30, '+' + (g.p.hp - before), C.ink, 'heart');
  } else if (pr.kind === 'poison'){ g.p.poison += pr.v; pop(PX, 30, '+' + pr.v, C.accent, 'skull'); }
}
// how: 쓰러뜨린 수단. 천장 타격이면 그 발사 기록(shot), 아니면 'poison'·'counter'
function killMonster(how){
  // 결정타가 들어가면 남은 구슬을 즉시 치워 여운을 몬스터 쓰러짐에 집중시킨다
  G.m.dead = true; G.balls = []; G.queue = []; G.shake = 6; sfx('kill');
  burst(MX, 62, C.ink, 26);
  if (how === 'poison') earnBadge('venom');
  else if (how === 'counter') earnBadge('counter');
  else if (how && how.full){
    // 가득 찬 체력을 이번 발사 하나로 다 깎았다: 천장 타격 수로 일격·삼연타를 가른다
    if (how.landed === 1) earnBadge('oneshot');
    else if (how.landed === 3) earnBadge('triple');
  }
  if (G.cfg.boss){
    if (!G.lost) earnBadge('flawless');
    if (G.turn <= 3) earnBadge('swift');
  }
}
// 몬스터 분노: 정예는 체력 절반 이하에서 한 번, 보스는 페이즈가 오를 때. 조준선이 빨라지고(aimRage) 공·방이 오른다
function checkRage(){
  const m = G.m, cfg = G.cfg;
  if (m.dead) return;
  if (cfg.boss){
    // 일반 보스는 절반에서 2페이즈, 최종 보스는 2/3·1/3에서 2·3페이즈
    const next = cfg.final ? (m.hp <= m.max / 3 ? 3 : m.hp <= m.max * 2 / 3 ? 2 : 1) : (m.hp <= m.max / 2 ? 2 : 1);
    if (next <= m.phase) return;
    m.phase = next; m.pi = 0; m.ai = 0; m.fresh = G.phase === 'enemy' && G.eStep >= 1; m.atk += 1; m.def += 2; G.shake = 8;
    banner(next === 3 ? '군주가 마지막 힘을 끌어낸다' : '보스가 분노했다', `${next}페이즈`, true); sfx('rage');
  } else if (cfg.elite && !m.rage && m.hp <= m.max / 2){
    m.rage = true; G.shake = 5;
    banner('정예가 날뛴다', '조준 가속', true); sfx('rage');
  }
}

// ── 구슬 물리
function hitBricks(b){
  for (const br of G.bricks){
    if (br.dead) continue;
    const x = OX + br.c * CW + 1;
    const l = x - 1.5, r = x + CW - 2 + 1.5, t = br.y - 1.5, bo = br.y + BRH + 1.5;
    if (b.x < l || b.x > r || b.y < t || b.y > bo) continue;
    // 송곳 구슬만 뚫고 지나간다. 나머지는 부숴도 튕긴다(한 줄씩 깎아 길을 내야 천장에 닿는다)
    const drilled = b.drill > 0;
    if (drilled){ b.drill--; br.hp = 0; } else br.hp -= b.kind === 'hammer' && br.type === 'stone' ? (b.up ? 5 : 3) : 1;
    br.flash = 0.07; b.impact = .12;
    // 같은 구슬이 연달아 맞힐수록 소리가 올라간다(콤보를 귀로 느끼게)
    b.combo = (b.combo || 0) + 1;
    if (br.type === 'stone' && br.hp > 0) sfx('stone');
    else sfx('brick', { orb:b.kind, combo:b.combo - 1, broke:br.hp <= 0 });
    if (br.hp <= 0){ br.dead = true; onBreak(br); ballBreak(b, br); }
    if (br.hp <= 0){
      b.broke++;
      if (b.kind === 'thorn' && b.broke % (b.up ? 2 : 3) === 0 && !G.m.dead) strike(OX + br.c * CW + CW / 2, br.y, 1);
    }
    if (br.dead && G.shot && ++G.shot.broke === 12) earnBadge('demolish');
    if (drilled) return;
    const ox = Math.min(b.x - l, r - b.x), oy = Math.min(b.y - t, bo - b.y);
    if (ox < oy){ if (b.x - l < r - b.x){ b.x = l; b.vx = -Math.abs(b.vx); } else { b.x = r; b.vx = Math.abs(b.vx); } }
    else { if (b.y - t < bo - b.y){ b.y = t; b.vy = -Math.abs(b.vy); } else { b.y = bo; b.vy = Math.abs(b.vy); } }
    return;
  }
}
function moveBall(b, dt){
  // 잔상은 실제 이동 위치만 기록하여 반사 지점에서 벽을 뚫어 보이지 않게 한다.
  b.trail = b.trail || []; b.trail.push({ x:b.x, y:b.y });
  if (b.trail.length > 5) b.trail.shift();
  b.impact = Math.max(0, (b.impact || 0) - dt);
  const n = Math.max(1, Math.ceil(BALL_SPEED * dt / 1.5));
  for (let i = 0; i < n; i++){
    b.x += b.vx * dt / n; b.y += b.vy * dt / n;
    if (b.x < OX + 1.5){ b.x = OX + 1.5; b.vx = Math.abs(b.vx); }
    else if (b.x > RIGHT - 1.5){ b.x = RIGHT - 1.5; b.vx = -Math.abs(b.vx); }
    if (b.y < BT + 1.5){
      b.y = BT + 1.5; b.vy = Math.abs(b.vy);
      // 천장 타격: 성벽을 뚫고 올라온 구슬만 몬스터를 친다
      if (!G.m.dead && b.hits < ballCap(b)){
        b.hits++;
        sfx('ceil', { orb:b.kind, n:b.hits - 1 });
        const v = hitDmg(b.orb, b.hits, b);
        G.projs.push({ x0:b.x, y0:BT, x1:MX, y1:62, t:0, dur:0.28, kind:'dmg', v, venom:['venom', 'toxin'].includes(b.kind) ? (b.up ? 2 : 1) : 0, shot:G.shot });
        if (b.hits === 3 && rel('leech')) heal(1);
        orbCeil(b);
        G.cf.push({ x:b.x, t:0.25 });
        burst(b.x, BT + 1, C.ink, 6);
      }
    }
    if (Math.abs(b.vy) < BALL_SPEED * 0.12) b.vy = (b.vy < 0 ? -1 : 1) * BALL_SPEED * 0.12;
    hitBricks(b);
    if (b.vy > 0 && b.y >= FLOOR - 2){
      // 자석 구슬·반동 유물: 바닥에서 한 번 더 튀어 오른다(천장까지 다시 갈 기회)
      if (b.bounces > 0 || (rel('rebound') && !b.rebounded && Math.random() < .25)){
        if (b.bounces > 0) b.bounces--; else b.rebounded = true;
        b.y = FLOOR - 2; b.vy = -Math.abs(b.vy); burst(b.x, FLOOR - 2, C.ink3, 4); continue;
      }
      b.done = true;
      if (G.nextLx === null) G.nextLx = clamp(b.x, OX + 4, RIGHT - 4);
      return;
    }
  }
  const v = Math.hypot(b.vx, b.vy) || 1; b.vx = b.vx / v * BALL_SPEED; b.vy = b.vy / v * BALL_SPEED;
}

// 구슬마다 천장 타격 상한: 기본 + 기본 구슬 강화 1 + 탄력 구슬. 혜성은 모든 벽돌을 뚫는 대신 한 번만 친다
const ballCap = b => b.kind === 'comet' ? 1 : hitCap() + (b.kind === 'basic' && b.up ? 1 : 0) + (b.kind === 'bounce' ? (b.up ? 2 : 1) : 0);
function heal(v){ const p = G.p, before = p.hp; p.hp = Math.min(p.max, p.hp + v); if (p.hp > before) pop(PX, 30, '+' + (p.hp - before), C.ink, 'heart'); }
// 천장 타격 때 구슬별 효과. 디버프는 맞는 즉시 몬스터 예고(머리 위 숫자)가 바뀌어 효과가 눈으로 보인다
function orbCeil(b){
  const m = G.m, up = b.up, it = intent();
  if (b.kind === 'herb' && b.hits === 1) heal(up ? 2 : 1);
  else if (b.kind === 'vamp' && (up || b.hits % 2 === 0)) heal(1);
  else if (b.kind === 'weaken' && G.shot.weak < (up ? 2 : 1) && it.t === 'atk' && atkLeft(it) > 1){
    G.shot.weak++; m.ai++; pop(MX, 20, '-1', C.ink, 'sword');
  } else if (b.kind === 'disarm' && G.disarm < (up ? 3 : 2) && m.atk > 1){
    G.disarm++; m.atk--; pop(MX + 16, 88, '-1', C.ink, 'sword');
  } else if (b.kind === 'rust'){
    if (m.def) pop(MX + 16, 76, '0', C.ink, 'shield');
    m.def = 0; if (up) m.noGuard = true;
  } else if (b.kind === 'stun' && !G.stunUsed && b.hits === (up ? 2 : 3)){
    G.stunUsed = true; m.stun = true; pop(MX, 20, '', C.ink, 'dots'); sfx('block');
  } else if (b.kind === 'time' && G.timeUsed < (up ? 2 : 1)){
    G.timeUsed++; m.pi = 0; m.ai = 0;
    const first = intent(); if (first.t === 'atk') m.ai = Math.min(atkN(first) - 1, 2);
    pop(MX, 20, '', C.ink, 'up');
  } else if (b.kind === 'toxin') G.toxic = true;
}

function fire(){
  const g = G;
  // 턴 시작 직후 0.2초는 무시: 이전 턴에 연타한 입력이 새 턴을 바로 쏘지 않게
  if (mode !== 'play' || !g || g.phase !== 'aim' || g.aimT < 0.2) return;
  artPose(g.p, 'attack');
  g.phase = 'fire'; g.fireT = 1; g.fireEl = 0; g.nextLx = null;
  g.shot = { full:g.m.hp === g.m.max, landed:0, broke:0 };
  const spread = { 1:[0], 3:[-0.16, 0, 0.16], 5:[-0.32, -0.16, 0, 0.16, 0.32] }[splitN(g.orb)];
  g.queue = spread.map(d => clamp(g.aim + d, AIM_MIN, AIM_MAX));
  // 쌍발: 3턴마다 같은 구슬을 한 번 더(같은 방향)
  if (rel('twin') && g.turn % 3 === 0) g.queue = g.queue.concat(g.queue);
  g.shot.weak = 0;
  g.mirror = orbKind(g.orb) === 'mirror' ? (orbUp(g.orb) ? 1 : .5) : 0;
  renderOrbBar();   // "발사 대기" → "발사!"
  sfx('fire', { orb:orbKind(g.orb) });
}

// ── 턴 진행
function update(dt){
  const g = G;
  g.time += dt;
  artAdvance(g.p, dt); artAdvance(g.m, dt);
  // 불사조(핵심 노드): 원정마다 한 번, 체력 0이 되는 순간 30%로 일어난다. 쓰러짐 판정보다 먼저 본다
  // 두 번째 심장(전투마다) → 불사조(트리) → 불멸의 반지(원정마다) 순서로 쓴다: 싼 것부터 소모되게
  if (g.p.hp <= 0 && rel('heart') && !g.heart){
    g.heart = true; g.p.hp = 1; g.p.poison = 0; pop(PX, 30, '1', C.ink, 'heart'); banner('두 번째 심장', '버텨 낸다'); sfx('heal');
  }
  if (g.p.hp <= 0 && rel('ring') && !RUN.ringUsed && (!tree('e6') || RUN.revived)){
    RUN.ringUsed = true; g.p.hp = Math.ceil(g.p.max * .5); g.p.poison = 0;
    burst(PX, 60, C.ink, 20); pop(PX, 30, '+' + g.p.hp, C.ink, 'heart'); banner('불멸의 반지', '다시 일어선다'); sfx('heal');
  }
  if (g.p.hp <= 0 && tree('e6') && !RUN.revived){
    RUN.revived = true; g.p.hp = Math.ceil(g.p.max * .3); g.p.poison = 0;
    burst(PX, 60, C.ink, 20); pop(PX, 30, '+' + g.p.hp, C.ink, 'heart'); banner('불사조', '다시 일어선다'); sfx('heal');
  }
  if (g.p.hp <= 0 && g.p.artAction !== 'death') artPose(g.p, 'death');
  if (g.m.dead && g.m.artAction !== 'death') artPose(g.m, 'death');
  g.m.flash = Math.max(0, g.m.flash - dt); g.p.flash = Math.max(0, g.p.flash - dt);
  g.shake = Math.max(0, g.shake - dt * 20);
  if (g.m.lunge > 0){ g.m.lunge += dt; if (g.m.lunge > 0.4) g.m.lunge = 0; }
  if (g.m.dead) g.m.deadT += dt;
  for (const b of g.bricks){ b.y += (rowY(b.r) - b.y) * Math.min(1, dt * 12); if (b.flash > 0) b.flash -= dt; }
  g.bricks = g.bricks.filter(b => !b.dead);
  for (const pr of g.projs){ pr.t += dt; if (pr.t >= pr.dur && !pr.hit){ pr.hit = true; arrive(pr); } }
  g.projs = g.projs.filter(p => !p.hit);
  for (const p of g.pops){ p.y -= 14 * dt; p.t -= dt; }
  g.pops = g.pops.filter(p => p.t > 0);
  for (const p of g.parts){ p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 180 * dt; p.t -= dt; if (p.vr) p.rot += p.vr * dt; }
  g.parts = g.parts.filter(p => p.t > 0);
  for (const f of g.cf) f.t -= dt;
  g.cf = g.cf.filter(f => f.t > 0);

  // 몬스터는 구슬 말고도 반격·독 같은 간접 피해로 몬스터 턴 중에 쓰러질 수 있다.
  // 그대로 두면 몬스터 턴이 끝까지 돌고 조준까지 넘어가 구슬을 한 번 더 쏴야 승리가 났다. 어느 경로든 여기서 바로 끝낸다.
  // 같은 공격에 기사도 쓰러졌다면 패배: 체력 0으로 원정을 이어갈 수는 없다
  if (g.m.dead && (g.phase === 'enemy' || g.phase === 'aim')){ g.phase = g.p.hp > 0 ? 'win' : 'lose'; g.timer = 0; }

  if (g.phase === 'aim'){
    // 조준선은 일정 속도로 좌우를 왕복한다(삼각파). 가장자리에서 느려지지 않아야 타이밍이 공정하다
    g.aimT += dt;
    // 시간 왜곡: 턴 처음 0.5초는 조준선이 멈춰 있다(노릴 곳을 먼저 정할 여유)
    if (!(rel('warp') && g.aimT < 0.5)) g.aim += g.aimDir * aimSpeed() * dt;
    if (g.aim > AIM_MAX){ g.aim = 2 * AIM_MAX - g.aim; g.aimDir = -1; }
    if (g.aim < AIM_MIN){ g.aim = 2 * AIM_MIN - g.aim; g.aimDir = 1; }
  } else if (g.phase === 'fire'){
    g.fireT += dt; g.fireEl += dt;
    if (g.queue.length && g.fireT >= 0.07){
      g.fireT = 0;
      const a = g.queue.shift();
      g.balls.push({ x:g.lx, y:FLOOR - 2, vx:Math.cos(a) * BALL_SPEED, vy:Math.sin(a) * BALL_SPEED,
                     hits:0, orb:g.orb, kind:orbKind(g.orb), up:orbUp(g.orb), broke:0, bombed:false,
                     drill:orbKind(g.orb) === 'comet' ? 99 : orbKind(g.orb) === 'drill' ? (orbUp(g.orb) ? 5 : 3) : 0,
                     bounces:orbKind(g.orb) === 'magnet' ? (orbUp(g.orb) ? 2 : 1) : 0 });
    }
    // 오래 도는 구슬은 점점 빨리 감고, 25초가 넘으면 갇힌 것으로 보고 회수한다
    const ts = g.fireEl > 10 ? 3 : g.fireEl > 5 ? 2 : 1;
    if (g.fireEl > 25 && g.balls.length){
      if (g.nextLx === null) g.nextLx = clamp(g.balls[0].x, OX + 4, RIGHT - 4);
      g.balls = [];
    }
    for (const b of g.balls) moveBall(b, dt * ts);
    g.balls = g.balls.filter(b => !b.done);
    if (!g.queue.length && !g.balls.length && !g.projs.length) endPlayerTurn();
  } else if (g.phase === 'enemy'){
    enemyUpdate(dt);
  } else if (g.phase === 'win' || g.phase === 'lose'){
    g.timer += dt;
    if (!g.shown && g.timer > (g.phase === 'win' ? 1.1 : 0.8)){ g.shown = true; battleEnd(g.phase === 'win'); }
  }
}

function endPlayerTurn(){
  const g = G, m = g.m;
  if (g.nextLx !== null) g.lx = g.nextLx;
  g.nextLx = null;
  if (m.dead){ g.phase = 'win'; g.timer = 0; return; }
  if (g.p.hp <= 0){ g.phase = 'lose'; g.timer = 0; return; }
  g.phase = 'enemy'; g.timer = 0; g.eStep = 0;
  if (g.turn === 1 && rel('buckler')){ const v = defGain(3); g.p.def += v; pop(PX + 12, 88, '+' + v, C.ink, 'shield'); }
  // 몬스터 독: 몬스터가 행동하기 직전에 방어도를 무시하고 들어간다
  if (m.poison > 0){
    const d = m.poison;
    m.hp = Math.max(0, m.hp - d); m.flash = 0.15; artPose(m, 'hit');
    // 맹독 구슬·독의 왕관: 독이 줄지 않는다. 독의 왕관은 방어도도 함께 깎는다
    if (!g.toxic && !rel('plague')) m.poison--;
    if (rel('plague')) m.def = Math.max(0, m.def - d);
    burst(MX, 62, C.accent, 8); pop(MX, 30, '-' + d, C.accent, 'skull');
    if (m.hp === 0){ killMonster('poison'); g.phase = 'win'; g.timer = 0; return; }
    checkRage();
    g.timer = -0.4;
  }
}

function enemyUpdate(dt){
  const g = G, m = g.m, p = g.p;
  // 반격으로 적 턴 중에 쓰러졌으면 남은 행동(붕괴·독)을 하지 않는다. 죽은 몬스터에게 지는 일이 없게
  if (m.dead){ g.phase = 'win'; g.timer = 0; return; }
  g.timer += dt;
  if (g.timer < 0) return;
  if (g.eStep === 0){
    g.eStep = 1; g.cur = intent();
    // 기절: 이번 행동을 통째로 건너뛰고 패턴도 넘기지 않는다
    if (m.stun){ m.stun = false; g.cur = { t:'stun' }; }
    // 부식 구슬+: 이번 수비 행동이 헛돈다
    if (g.cur.t === 'guard' && m.noGuard){ m.noGuard = false; g.cur = { t:'stun' }; pop(MX, 30, '0', C.ink3, 'shield'); }
    if (g.cur.t === 'wait' && rel('breath')) heal(2);
    const it = g.cur;
    if (it.t === 'atk' || it.t === 'poison'){ m.lunge = 0.001; artPose(m, 'attack'); }
    else if (it.t === 'guard'){ m.def += it.v; pop(MX, 30, '+' + it.v, C.ink, 'shield'); }
    else if (it.t === 'spore') pop(MX, 30, '', C.accent, 'brick');
    else if (it.t === 'summon') pop(MX, 30, '', C.ink, 'brick');
    else pop(MX, 30, '', C.ink3, 'dots');
  }
  if (g.eStep === 1 && g.timer >= 0.2){
    g.eStep = 2;
    // 인내: 연속 공격 묶음의 첫 타만 막는다. 긴 연속 공격일수록 덜 막히니 후반 보스를 혼자 무력화하지는 못한다
    if (g.cur.t === 'atk' && m.ai === 0 && rel('endure')){ pop(PX, 42, '0', C.ink2, 'shield'); sfx('block'); }
    else if (g.cur.t === 'atk') hurtPlayer(m.atk, undefined, true);
    else if (g.cur.t === 'poison'){ const v = poisonAmt(g.cur); p.poison += v; burst(PX, 66, C.accent, 8); pop(PX, 30, '+' + v, C.accent, 'skull'); sfx('pickup', { kind:'poison' }); }
  }
  if (g.eStep === 2 && g.timer >= 0.6){
    g.eStep = 3;
    // 성벽은 몇 턴마다 한 번 내려온다: 구슬이 튕기는 구조라 매 턴 내려오면 길을 낼 틈이 없다
    if (g.turn % WALL.every === 0 || g.cur.t === 'summon' || g.cur.t === 'spore'){
      for (const b of g.bricks) b.r++;
      spawnRow(0, false); sfx('wall');
    }
    if (g.cur.t === 'summon') replaceInRow0(3, () => ({ type:'stone', hp:3 + Math.min(2, m.phase) }));
    if (g.cur.t === 'spore') replaceInRow0(2, () => ({ type:'poison', hp:1 }));
    if (bossDropsNow()) bossDrop();
    // 성벽 파쇄기: 가장 아래 줄 벽돌 하나를 부숴 붕괴를 늦춘다
    if (rel('crusher')){
      const low = g.bricks.filter(b => !b.dead).sort((a, b) => b.r - a.r)[0];
      if (low){ low.dead = true; onBreak(low); }
    }
    // 붕괴선을 넘은 벽돌은 무너지며 기사를 덮친다
    const hits = g.bricks.filter(b => b.r >= MAXROW);
    if (hits.length){
      for (const b of hits){ b.dead = true; burst(OX + b.c * CW + CW / 2, rowY(b.r) + 6, C.accent, 6); }
      sfx('crumble'); g.shake = 6;
      if (rel('callus') && !g.callus){ g.callus = true; pop(PX, 42, '0', C.ink2, 'shield'); }
      else hurtPlayer(hits.length * (rel('brace') ? 1 : 2), 'brick');
    }
  }
  if (g.eStep === 3 && g.timer >= 0.95){
    g.eStep = 4; g.tickT = 0;
    // 독 틱: 방어도를 무시하고 체력에 바로 들어간 뒤 약해진다
    if (p.poison > 0){
      const d = p.poison;
      p.hp = Math.max(0, p.hp - d); p.poison = Math.max(0, p.poison - (rel('antidote') ? 2 : 1)); p.flash = 0.18; artPose(p, 'hit');
      burst(PX, 66, C.accent, 8); pop(PX, 30, '-' + d, C.accent, 'skull');
      g.tickT = 0.45;
    }
  }
  if (g.eStep === 4 && g.timer >= 0.95 + g.tickT){
    g.eStep = 5;
    // 연속 공격은 n번을 다 때려야 다음 행동으로 넘어간다
    // 이번 턴 도중 페이즈가 바뀌었으면(반격 등) 새 패턴을 처음부터 쓰도록 넘기지 않는다
    if (m.fresh) m.fresh = false;
    else if (g.cur.t === 'stun'){}
    else if (g.cur.t === 'atk' && ++m.ai < atkN(g.cur)){} else { m.ai = 0; m.pi++; }
    g.mirror = 0;
    if (p.hp <= 0){ g.phase = 'lose'; g.timer = 0; return; }
    // phase를 먼저 바꾼다: drawOrb가 구슬 줄을 다시 그릴 때 "발사!"가 "발사 대기"로 돌아오게
    g.phase = 'aim'; g.turn++; g.cur = null;
    g.disc.push(g.orb); drawOrb(); resetAim();
  }
}
