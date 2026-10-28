// 메뉴·입력·메인 루프 (마지막에 로드)
'use strict';

// ── 메뉴(일시정지)
// 메뉴가 없는 화면. 도감(badge)에서 Esc로 메뉴가 열리면 "원정 포기"가 메인 배경용 가짜 원정을 기록으로 올렸다
const NO_MENU = ['main', 'pause', 'result', 'tree', 'badge'];
function openMenu(){
  if (NO_MENU.includes(mode)) return;
  // 승패가 정해진 뒤의 연출 중에는 열지 않는다(곧 결과·보상 화면으로 넘어간다)
  if (mode === 'play' && G && (G.phase === 'win' || G.phase === 'lose')) return;
  prevMode = mode; mode = 'pause';
  $('pMainSub').textContent = prevMode === 'play' ? '접속은 저장된다 · 이번 전투는 처음부터' : '진행은 저장되어 있다';
  $('pGiveup').textContent = '접속 포기'; $('pGiveup').dataset.arm = '';
  $('ovPause').classList.add('on'); $('pResume').focus();
}
// 메뉴에서 테마를 바꿨다면 돌아갈 때 지도를 다시 그린다: 지도 아이콘·길은 그릴 때의 색을 박아 둬 옛 테마 색이 남는다
let themeDirty = false;
function closeMenu(){
  if (mode !== 'pause') return;
  $('ovPause').classList.remove('on'); mode = prevMode;
  if (themeDirty && mode === 'map') showMap();
  themeDirty = false;
}
$('btnMenu').onclick = () => mode === 'pause' ? closeMenu() : openMenu();
$('pResume').onclick = closeMenu;
$('pMain').onclick = () => { $('ovPause').classList.remove('on'); showMain(); };
$('pGiveup').onclick = e => {
  const b = e.currentTarget;
  if (!b.dataset.arm){ b.dataset.arm = '1'; b.textContent = '한 번 더 누르면 접속이 끝난다'; return; }
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
// 테마 전환: 자동 → 밝게 → 어둡게. 캔버스·로고·지도 아이콘은 색 토큰을 읽어 그리므로 바꾼 뒤 다시 읽고 다시 그린다
const THEME_LABEL = { auto:'화면 자동', light:'화면 밝게', dark:'화면 어둡게' };
function renderTheme(){ ['mTheme', 'pTheme'].forEach(id => { $(id).textContent = THEME_LABEL[THEME]; $(id).setAttribute('aria-label', `화면 테마: ${THEME_LABEL[THEME]}. 눌러서 바꾸기`); }); }
['mTheme', 'pTheme'].forEach(id => $(id).onclick = () => {
  THEME = THEMES[(THEMES.indexOf(THEME) + 1) % THEMES.length];
  try { localStorage.setItem(THEME_KEY, THEME); } catch(e){}
  applyTheme(); readColors(); renderTheme();
  if (mode === 'main') drawLogo($('logoCv'));
  if (mode === 'pause') themeDirty = true;
});
renderTheme();
document.addEventListener('pointerdown', unlockAudio, true);
document.addEventListener('keydown', unlockAudio, true);
// 일부 모바일 브라우저는 터치의 사용자 활성화를 pointerdown이 아니라 pointerup·click에서 준다.
// 그때 다시 resume해야 첫 탭에서 만든 컨텍스트가 suspended로 남지 않는다
document.addEventListener('pointerup', unlockAudio, true);
document.addEventListener('click', unlockAudio, true);

// ── 입력: 조준선은 스스로 움직이고, 플레이어는 타이밍에 맞춰 누르기만 한다
cv.addEventListener('pointerdown', e => { if (mode === 'play'){ e.preventDefault(); fire(); } });
addEventListener('keydown', e => {
  if (PORTRAIT_LOCK && PORTRAIT_LOCK.matches) return;   // 세로 안내가 가린 동안 Esc로 전투가 다시 돌거나 Space로 쏘지 않게
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape'){ mode === 'pause' ? closeMenu() : openMenu(); return; }
  if (mode === 'play' && (e.key === ' ' || e.key === 'Enter')){ if (!e.repeat) fire(); e.preventDefault(); }
});

// ── 메인 루프
let last = performance.now();
function frame(now){
  requestAnimationFrame(frame);   // 먼저 예약: 아래에서 예외가 나도 다음 프레임은 돈다(한 번의 오류로 화면이 영구 정지하지 않게)
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G && mode === 'play') update(dt);
  draw(); drawScene(dt);
  // 전투 중에는 코인 그림(::before)이 "코인"을 대신해 글자를 줄인다(한 줄 헤더에서 몬스터 이름 자리를 지키려고). 읽기 프로그램용 이름은 따로 단다
  if (G && mode === 'play'){ const h = $('hCoin'), t = `${RUN.coins} · ${G.turn}턴`;
    if (h.textContent !== t){ h.textContent = t; h.setAttribute('aria-label', `크레딧 ${RUN.coins}, ${G.turn}턴`); } }
}
showMain();
requestAnimationFrame(frame);
