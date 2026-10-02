// 메뉴·입력·메인 루프 (마지막에 로드)
'use strict';

// ── 메뉴(일시정지)
function openMenu(){
  if (mode === 'main' || mode === 'pause' || mode === 'result') return;
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
  $('ovPause').classList.remove('on'); clearRun(); recordRun(RUN); showMain();
};
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') openMenu(); });

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
  draw();
  if (G && mode === 'play') $('hCoin').textContent = `코인 ${RUN.coins}  ${G.turn}턴`;
  requestAnimationFrame(frame);
}
showMain();
requestAnimationFrame(frame);
