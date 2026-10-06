// 메뉴·입력·메인 루프 (마지막에 로드)
'use strict';

// ── 메뉴(일시정지)
function openMenu(){
  if (mode === 'main' || mode === 'pause' || mode === 'result' || mode === 'tree') return;
  prevMode = mode; mode = 'pause';
  $('pMainSub').textContent = prevMode === 'play' ? '이번 전투는 처음부터 다시 시작된다' : '진행은 저장되어 있다';
  $('pGiveup').textContent = '원정 포기'; $('pGiveup').dataset.arm = '';
  $('ovPause').classList.add('on'); $('pResume').focus();
}
function closeMenu(){ if (mode !== 'pause') return; $('ovPause').classList.remove('on'); mode = prevMode; }
$('btnMenu').onclick = () => mode === 'pause' ? closeMenu() : openMenu();
$('pResume').onclick = closeMenu;
$('pMain').onclick = () => { $('ovPause').classList.remove('on'); showMain(); };
$('pGiveup').onclick = e => {
  const b = e.currentTarget;
  if (!b.dataset.arm){ b.dataset.arm = '1'; b.textContent = '한 번 더 누르면 원정이 끝난다'; return; }
  $('ovPause').classList.remove('on'); clearRun(); endRun(RUN); showMain();
};
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') openMenu(); });

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
document.addEventListener('pointerdown', unlockAudio, true);
document.addEventListener('keydown', unlockAudio, true);
// 일부 모바일 브라우저는 터치의 사용자 활성화를 pointerdown이 아니라 pointerup·click에서 준다.
// 그때 다시 resume해야 첫 탭에서 만든 컨텍스트가 suspended로 남지 않는다
document.addEventListener('pointerup', unlockAudio, true);
document.addEventListener('click', unlockAudio, true);

// ── 입력: 조준선은 스스로 움직이고, 플레이어는 타이밍에 맞춰 누르기만 한다
cv.addEventListener('pointerdown', e => { if (mode === 'play'){ e.preventDefault(); fire(); } });
addEventListener('keydown', e => {
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape'){ mode === 'pause' ? closeMenu() : openMenu(); return; }
  if (mode === 'play' && (e.key === ' ' || e.key === 'Enter')){ if (!e.repeat) fire(); e.preventDefault(); }
});

// ── 메인 루프
let last = performance.now();
function frame(now){
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G && mode === 'play') update(dt);
  draw(); drawScene(dt);
  if (G && mode === 'play') $('hCoin').textContent = `코인 ${RUN.coins}  ${G.turn}턴`;
  requestAnimationFrame(frame);
}
showMain();
requestAnimationFrame(frame);
