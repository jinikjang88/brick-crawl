// file://에서 전역 로드 순서·수집품 연결·저장 복구를 실제 브라우저로 확인한다.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.log('SKIP: playwright 모듈이 없어 브라우저 검수를 건너뜀');
  process.exit(0);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    // 시작 버튼의 빛 띠 애니메이션이 멈추지 않아 클릭이 "불안정"으로 막힌다: 동작 줄이기로 띄운다
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction(() => Object.keys(ORBS).every(k => artImg('orb_' + k)) && Object.keys(RELICS).every(k => artImg('relic_' + k)));
    assert.equal(await page.locator('#ovMain').evaluate(e => e.classList.contains('on')), true);
    await page.locator('#mNew').click();
    await page.waitForFunction(() => mode === 'map');
    // 첫 줄에 상점·휴식이 섞일 수 있어 전투 칸을 고른다. 전투 중 화면 모드 이름은 'play'다
    await page.evaluate(() => enterNode(reachable().find(n => n.t === 'battle') || reachable()[0]));
    await page.waitForFunction(() => mode === 'play');
    await page.evaluate(() => {
      RUN.pendingReward = 'elite'; RUN.reward = { kind: 'elite', stock: ['whetstone', 'ring', 'collector'], reroll: 0 };
      saveRun(); showReward('elite');
    });
    assert.equal(await page.locator('#cCards img').count(), 3);
    await page.reload();
    await page.locator('#mContinue').click();
    await page.waitForFunction(() => mode === 'reward');
    assert.equal(await page.locator('#cCards img').count(), 3);
    await page.evaluate(() => {
      for (const k of Object.keys(ORBS)) META.seen.orb[k] = true;
      for (const k of Object.keys(RELICS)) META.seen.relic[k] = true;
      showBadges();
    });
    assert.equal(await page.locator('#badgeBox img').count(), 64);
    await page.evaluate(() => {
      const before = document.createElement('div'); document.body.append(before);
      delete ART.img.relic_ring;
      before.append(relicPortrait('ring'));
      if (!before.querySelector('canvas')) throw Error('유물 폴백 누락');
      before.remove();
    });
    assert.deepEqual(errors, []);
    console.log('PASS: file:// 64종 로드, 메인→지도→전투→유물 보상→새로고침 이어하기, 도감 64종, 유물 폴백, 콘솔 예외 0');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
