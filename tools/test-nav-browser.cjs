// 돌아가기·위치 기억·기기 뒤로 가기·박자 연출을 실제 브라우저(file://)로 확인한다(2026-11-29).
// 실행: node tools/test-nav-browser.cjs

const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('SKIP: playwright 없음'); process.exit(0); }
const ROOT = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ args:['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport:{ width:390, height:700 } }); page.setDefaultTimeout(5000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
  await page.waitForFunction(() => typeof showBadges === 'function');
  const st = () => page.evaluate(() => ({ mode, ov:memAt && memAt.ov, nav:!$('navBack').hidden && $('navTo').textContent,
    act:document.activeElement && (document.activeElement.dataset.k || document.activeElement.id), top:memAt && $(memAt.ov).scrollTop, beat:$('app').dataset.beat }));

  // 1) 아카이브 → 이야기 탭 → 스크롤 → 이야기 보기 → ‹ 아카이브 → 같은 탭·스크롤·줄
  // 잠긴 이야기는 아카이브에 줄이 없으므로 먼저 모두 연다
  await page.evaluate(() => { for (const k of STORY_ORDER) META.story[k] = 1; });
  await page.click('#mBadge');
  let s = await st(); assert.equal(s.mode, 'badge'); assert.equal(s.nav, '터미널');
  await page.click('#arcT-story');
  assert.equal(await page.evaluate(() => arcTab), 'story');
  const target = await page.evaluate(() => { const b = [...document.querySelectorAll('#arcP-story .bStory')][10]; b.scrollIntoView({ block:'center' }); return b.dataset.k; });
  const topBefore = await page.evaluate(() => $('ovBadge').scrollTop);
  assert.ok(topBefore > 100, 'scrolled ' + topBefore);
  await page.click(`[data-k="${target}"]`);
  s = await st(); assert.equal(s.mode, 'story'); assert.equal(s.nav, '아카이브');
  await page.click('#tNext');
  await page.click('#navBack');
  s = await st();
  assert.equal(s.mode, 'badge'); assert.equal(await page.evaluate(() => arcTab), 'story');
  assert.equal(s.act, target, 'focus restored'); assert.ok(Math.abs(s.top - topBefore) < 2, `scroll ${s.top} vs ${topBefore}`);
  console.log('OK 이야기 보고 돌아오면 탭·스크롤·줄 유지', target, s.top);

  // 2) 탭 키보드 →, 탭 사이 스크롤 기억
  await page.focus('#arcT-story'); await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => arcTab), 'core'); assert.equal((await st()).act, 't:core');
  await page.keyboard.press('ArrowLeft');
  s = await st(); assert.equal(await page.evaluate(() => arcTab), 'story'); assert.ok(Math.abs(s.top - topBefore) < 2, 'story tab scroll kept ' + s.top);
  console.log('OK ←/→ 탭 이동, 탭별 스크롤 기억');

  // 3) Esc → 터미널, 아카이브 버튼에 초점. 다시 열면 이야기 탭 그대로
  await page.keyboard.press('Escape');
  s = await st(); assert.equal(s.mode, 'main'); assert.equal(s.act, 'mBadge'); assert.equal(s.nav, false);
  await page.click('#mBadge'); assert.equal(await page.evaluate(() => arcTab), 'story');
  console.log('OK Esc 돌아가기 + 터미널 버튼 초점 + 탭 기억');

  // 4) 기기 뒤로 가기: 아카이브 → 터미널, 터미널에서 깔아 둔 기록은 거둔다
  await page.goBack(); await page.waitForTimeout(150);
  s = await st(); assert.equal(s.mode, 'main'); assert.equal(page.url().startsWith('file:'), true);
  // 지도에서 뒤로 가기 = 일시정지, 한 번 더 = 계속
  await page.evaluate(() => { startNewRun(false); if (mode === 'story') talkDone(); });
  assert.equal((await st()).mode, 'map');
  await page.goBack(); await page.waitForTimeout(150); assert.equal((await st()).mode, 'pause');
  await page.goBack(); await page.waitForTimeout(150); assert.equal((await st()).mode, 'map');
  assert.ok(page.url().startsWith('file:'));
  console.log('OK 뒤로 가기: 아카이브→터미널, 지도→일시정지→지도 (페이지를 떠나지 않음)');

  // 5) 차고: 구슬 → 조립대 → ‹ 차고 → 같은 카드 초점
  await page.evaluate(() => { $('ovPause').classList.remove('on'); showMain(); });
  await page.click('#mGarage'); s = await st(); assert.equal(s.nav, '터미널');
  await page.click('[data-k="c0"]'); s = await st(); assert.equal(s.nav, '차고');
  await page.keyboard.press('Escape'); s = await st(); assert.equal(s.act, 'c0'); assert.equal(s.nav, '터미널');
  console.log('OK 차고: 조립대 → Esc → 같은 구슬 카드');

  // 6) 박자: 음악을 켜면 data-beat가 0→1→2→3으로 돌고, 곡 위치와 맞는다
  await page.evaluate(() => { showMain(); unlockAudio(); bgm(null); bgm('calm'); });
  await page.waitForFunction(() => trackEl && !trackEl.paused && trackEl.currentTime > 1, null, { timeout:15000 });
  const seen = await page.evaluate(() => new Promise(r => { const out = []; const t0 = performance.now();
    (function f(){ const b = $('app').dataset.beat; if (out[out.length - 1] !== b) out.push(b); if (performance.now() - t0 < 2600) requestAnimationFrame(f); else r(out); })(); }));
  console.log('beats', seen.join(' '));
  assert.ok(seen.length >= 5 && seen.every(x => x !== undefined), 'beat cycles');
  const drift = await page.evaluate(() => { const p = beatPos(); return Math.abs(Math.floor(p) % 4 - +$('app').dataset.beat); });
  assert.ok(drift === 0 || drift === 3 || drift === 1);
  // 음악 끄면 멈춘다
  await page.evaluate(() => setAudio('bgm', false)); await page.waitForTimeout(100);
  assert.equal((await st()).beat, undefined);
  console.log('OK 박자 연출: 박마다 바뀌고, 음악을 끄면 멈춤');

  assert.deepEqual(errors, []);
  console.log('PASS');
  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
