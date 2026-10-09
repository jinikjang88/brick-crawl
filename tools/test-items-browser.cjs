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
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction(() => Object.keys(ORBS).every(k => artImg('orb_' + k)) && Object.keys(RELICS).every(k => artImg('relic_' + k)));
    assert.equal(await page.locator('#ovMain').evaluate(e => e.classList.contains('on')), true);
    await page.locator('#mNew').click();
    await page.waitForFunction(() => mode === 'map');
    await page.evaluate(() => enterNode(reachable()[0]));
    await page.waitForFunction(() => mode === 'battle');
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
