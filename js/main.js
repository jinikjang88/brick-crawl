// 메뉴·입력·메인 루프 (마지막에 로드)
'use strict';

// ── 메뉴(일시정지)
// 메뉴가 없는 화면. 도감(badge)에서 Esc로 메뉴가 열리면 "원정 포기"가 메인 배경용 가짜 원정을 기록으로 올렸다
const NO_MENU = ['main', 'pause', 'result', 'tree', 'badge', 'garage'];
function openMenu(){
  if (NO_MENU.includes(mode)) return;
  // 승패가 정해진 뒤의 연출 중에는 열지 않는다(곧 결과·보상 화면으로 넘어간다)
  if (mode === 'play' && G && (G.phase === 'win' || G.phase === 'lose')) return;
  prevMode = mode; mode = 'pause';
  $('pMainSub').textContent = prevMode === 'play' ? '침투는 저장된다 · 이번 전투는 처음부터' : '진행은 저장되어 있다';
  $('pGiveup').textContent = '침투 포기'; $('pGiveup').dataset.arm = '';
  $('ovPause').classList.add('on'); $('pResume').focus();
  syncNav();
}
function closeMenu(){
  if (mode !== 'pause') return;
  $('ovPause').classList.remove('on'); mode = prevMode;
  syncNav();
}
$('btnMenu').onclick = () => mode === 'pause' ? closeMenu() : openMenu();
$('pResume').onclick = closeMenu;
$('pMain').onclick = () => { $('ovPause').classList.remove('on'); showMain(); };
$('pGiveup').onclick = e => {
  const b = e.currentTarget;
  if (!b.dataset.arm){ b.dataset.arm = '1'; b.textContent = '한 번 더 누르면 침투가 끝난다'; return; }
  $('ovPause').classList.remove('on'); clearRun(); endRun(RUN); showMain();
};
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') openMenu(); });
// 폰을 가로로 눕히면 세로 안내가 게임을 가린다(조건은 css "세로 고정"의 @media와 같게). 전투 중이면 그 사이 몬스터가 움직이지 않게 멈춘다
let PORTRAIT_LOCK = null;
try {
  PORTRAIT_LOCK = matchMedia('(orientation: landscape) and (max-height: 520px) and (pointer: coarse) and (min-aspect-ratio: 4/3)');
  PORTRAIT_LOCK.addEventListener('change', e => { if (e.matches && mode === 'play') openMenu(); });
} catch(e){}
// 첫 화면의 자동 초점은 사용자가 한 번이라도 입력한 뒤에만 준다: 앱을 열자마자 시작 버튼에 키보드 초점 테가 그려졌다
let INPUT_SEEN = false;
document.addEventListener('pointerdown', () => { INPUT_SEEN = true; }, true);
document.addEventListener('keydown', () => { INPUT_SEEN = true; }, true);

// ── 소리 켬/끔(메인·메뉴 두 곳에 같은 버튼). 브라우저는 첫 입력 전에 소리를 막으므로 첫 탭·키에서 연다
const SND_BTNS = [['mBgm','bgm'], ['mSfx','sfx'], ['pBgm','bgm'], ['pSfx','sfx']];
function renderSound(){
  SND_BTNS.forEach(([id, k]) => {
    const b = $(id), on = AUDIO[k];
    b.textContent = `${k === 'bgm' ? '음악' : '효과음'} ${on ? '켬' : '끔'}`;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.classList.toggle('off', !on);
  });
}
SND_BTNS.forEach(([id, k]) => $(id).onclick = () => { unlockAudio(); setAudio(k, !AUDIO[k]); renderSound(); });
// 글자 크기: 보통 → 크게 → 아주 크게(설정·적용은 js/config.js)
function renderFz(){ const name = FZ_STEPS.find(f => f[0] === UI.fz)[1]; ['mText', 'pText'].forEach(id => { $(id).textContent = name; $(id).setAttribute('aria-label', `${name}. 눌러서 바꾸기`); }); }
['mText', 'pText'].forEach(id => $(id).onclick = () => {
  const i = FZ_STEPS.findIndex(f => f[0] === UI.fz); UI.fz = FZ_STEPS[(i + 1) % FZ_STEPS.length][0];
  try { localStorage.setItem(UI_KEY, JSON.stringify(UI)); } catch(e){}
  applyFz(); renderFz(); sfx('pick');
});
renderFz();
document.addEventListener('pointerdown', unlockAudio, true);
document.addEventListener('keydown', unlockAudio, true);
// 일부 모바일 브라우저는 터치의 사용자 활성화를 pointerdown이 아니라 pointerup·click에서 준다.
// 그때 다시 resume해야 첫 탭에서 만든 컨텍스트가 suspended로 남지 않는다
document.addEventListener('pointerup', unlockAudio, true);
document.addEventListener('click', unlockAudio, true);

$('hpSkip').onclick = heatSkip;
$('hpForce').onclick = heatForce;
// ── 입력: 조준선은 스스로 움직이고, 플레이어는 타이밍에 맞춰 누르기만 한다
cv.addEventListener('pointerdown', e => { if (mode === 'play'){ e.preventDefault(); fire(); } });
addEventListener('keydown', e => {
  if (PORTRAIT_LOCK && PORTRAIT_LOCK.matches) return;   // 세로 안내가 가린 동안 Esc로 전투가 다시 돌거나 Space로 쏘지 않게
  // Esc = 돌아가기(위쪽 "‹ 터미널" 버튼과 같다. 침투 화면에서는 일시정지). P는 예전처럼 일시정지만. 이름 입력 중의 p는 글자다
  if (e.key === 'Escape' && DEV && $('devPanel') && !$('devPanel').hidden){ devClose(); return; }
  if (e.key === 'Escape'){ e.preventDefault(); goBack(); return; }
  if ((e.key === 'p' || e.key === 'P') && !(e.target && e.target.tagName === 'INPUT')){ mode === 'pause' ? closeMenu() : openMenu(); return; }
  // 장갑 슬롯 고르기: 숫자 1~5(작업 08)
  if (mode === 'play' && /^[1-5]$/.test(e.key)){ pickSlot(+e.key - 1); return; }
  // 과열 선택 창이 떠 있으면 Space·Enter는 초점이 있는 창 버튼이 받는다(전투 발사로 가로채지 않게)
  if (mode === 'play' && G && G.allHot && G.phase === 'aim') return;
  if (mode === 'play' && (e.key === ' ' || e.key === 'Enter')){ if (!e.repeat) fire(); e.preventDefault(); }
  // 대화창: 초점이 버튼 밖(상자를 눌러 넘긴 뒤)이어도 Space·Enter로 넘긴다. 버튼 위면 버튼이 알아서 눌린다
  if (mode === 'story' && (e.key === ' ' || e.key === 'Enter') && !(e.target && e.target.tagName === 'BUTTON')){ if (!e.repeat) talkStep(); e.preventDefault(); }
});

// ── 박자 연출(2026-11-29): 화면 뒤 이퀄라이저·HUD 꺾쇠·박자 램프·시작 버튼·지도 칸이 BGM 박에 맞춰 쿵(1·3박) 짝(2·4박) 뛴다.
// 박이 바뀔 때만 .app[data-beat](0~3)를 바꾸고 움직임은 CSS가 맡는다(매 프레임 스타일을 건드리지 않게). 이웃한 박은 값이 늘 달라 애니메이션이 다시 걸린다.
// 음악이 꺼졌거나 소리가 아직 열리지 않았거나 동작 줄이기면 data-beat를 떼어 멈춘다(소리 없이 박만 뛰면 어색하다). 게임 결과와는 무관하다
const CALM_MQ = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)'); } catch(e){ return null; } })();
// 이퀄라이저 막대: 왼쪽이 저음. 쿵(킥)에는 왼쪽이, 짝(스네어)에는 가운데~오른쪽이 솟는다. 높이는 고정 무늬(연출이라 Math.random도 되지만 매번 같은 모양이 낫다)
(function buildEq(){
  const eq = $('eq'), N = 28;
  for (let i = 0; i < N; i++){
    const x = i / (N - 1), w = ((i * 37) % 11) / 11 * .18, b = document.createElement('i');
    b.style.setProperty('--b', (.05 + .07 * Math.exp(-x * 2) + w * .2).toFixed(3));
    b.style.setProperty('--k', Math.min(1, .2 + .8 * Math.exp(-x * 3.2) + w).toFixed(3));
    b.style.setProperty('--s', Math.min(1, .15 + .6 * Math.exp(-(((x - .62) / .24) ** 2)) + w).toFixed(3));
    eq.append(b);
  }
})();
let beatLast = -1;
function beatTick(){
  // DEV_BEAT: 개발 도구에서 음악 없이 박자 연출만 본다
  const p = DEV_BEAT ? performance.now() / 1000 * TRACK_BEAT.bpm / 60 : CALM_MQ && CALM_MQ.matches ? null : beatPos();
  const b = p === null || p < 0 ? -1 : Math.floor(p) % 4;
  if (b === beatLast) return;
  beatLast = b;
  const app = $('app');
  if (b < 0) delete app.dataset.beat; else app.dataset.beat = b;
}

// ── 메인 루프
// 전투는 고정 시간 간격(STEP)으로만 나아간다. 화면 주사율(60·90·120Hz)이나 프레임 끊김에 따라 구슬이 나뉘어 움직이는
// 횟수가 달라지면 같은 조준이 기기마다 다른 벽돌에 맞는다. 남은 시간은 모아 두었다가 다음 프레임에 쓴다
const STEP = 1 / 120, STEP_MAX = 6;
let last = performance.now(), stepAcc = 0;
function frame(now){
  requestAnimationFrame(frame);   // 먼저 예약: 아래에서 예외가 나도 다음 프레임은 돈다(한 번의 오류로 화면이 영구 정지하지 않게)
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G && mode === 'play'){
    // 타격 정지(hit stop): 맞는 순간 아주 잠깐 멈춰 무게를 준다. 멈춘 동안은 시간을 모으지 않는다(뒤에 몰아서 흐르지 않게)
    if (G.stop > 0) G.stop -= dt;
    else {
      // DEV_SPEED: 개발 도구 배속. 같은 STEP을 더 많이 돌릴 뿐이라 결과는 같다
      stepAcc = Math.min(stepAcc + dt * DEV_SPEED, STEP * STEP_MAX * DEV_SPEED);
      while (stepAcc >= STEP && G && mode === 'play' && !(G.stop > 0)){ update(STEP); stepAcc -= STEP; }
    }
  } else stepAcc = 0;
  // 가려진 전투판과 장면은 다시 보일 때 그린다. 일시정지 중에는 두 캔버스가 모두 메뉴 뒤에 있다.
  if (mode === 'play') draw();
  else if (mode !== 'pause') drawScene(dt);
  beatTick();
  // 전투 중에는 코인 그림(::before)이 "코인"을 대신해 글자를 줄인다(한 줄 헤더에서 몬스터 이름 자리를 지키려고). 읽기 프로그램용 이름은 따로 단다
  if (G && mode === 'play'){ const h = $('hCoin'), t = `${RUN.coins} · ${G.turn}턴`;
    if (h.textContent !== t){ h.textContent = t; h.setAttribute('aria-label', `크레딧 ${RUN.coins}, ${G.turn}턴`); } }
}
showMain();
requestAnimationFrame(frame);
