// 개발 도구(index.html?dev)를 실제 브라우저(file://)로 확인한다(2026-11-29).
// 저장이 실제 키와 섞이지 않고, 순위표 통신이 꺼지고, 패널 버튼으로 전투·화면에 바로 가는지 본다. ?dev 없이는 버튼이 없어야 한다.
// 실행: node tools/test-dev-browser.cjs
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('SKIP: playwright 없음'); process.exit(0); }
const URL = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{ width:390, height:844 } }); page.setDefaultTimeout(5000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // 1) 보통 실행: 개발 버튼 없음, 진짜 키에 저장
  await page.goto(URL); await page.waitForFunction(() => typeof showMain === 'function');
  assert.equal(await page.locator('.devBtn').count(), 0);
  const realName = await page.evaluate(() => PROFILE.name);
  // 2) ?dev: 버튼이 생기고, 저장은 brickquest-dev:* 로, 통신은 꺼진다
  await page.goto(URL + '?dev'); await page.waitForFunction(() => typeof showMain === 'function');
  const st = await page.evaluate(() => ({ dev:DEV, api:API_BASE, name:PROFILE.name, keys:Object.keys(localStorage) }));
  assert.equal(st.dev, true); assert.equal(st.api, null);
  assert.ok(st.keys.some(k => k.startsWith('brickquest-dev:')), 'dev keys ' + st.keys);
  assert.notEqual(st.name, undefined);
  // 3) 패널: 기체 골라 전투 → 즉시 승리 → 지도
  await page.click('.devBtn');
  await page.selectOption('#dvMon', 'golem');
  await page.click('text=싸우기');
  await page.waitForFunction(() => mode === 'play' && G && G.node.mon === 'golem');
  await page.click('.devBtn'); await page.click('text=즉시 승리');
  await page.waitForFunction(() => mode === 'map' || mode === 'reward', null, { timeout:8000 });
  // 4) 아카이브 전부 해제가 개발 저장에만 남는다
  await page.click('.devBtn'); await page.click('text=아카이브 전부 해제'); await page.click('.devPanel >> text=닫기');
  await page.goto(URL); await page.waitForFunction(() => typeof showMain === 'function');
  const real = await page.evaluate(() => ({ story:Object.keys(META.story).length, name:PROFILE.name }));
  assert.equal(real.name, realName);
  const realStory = await page.evaluate(() => Object.keys(META.story).length < STORY_ORDER.length);
  assert.ok(realStory, '실제 저장의 이야기가 개발 도구 때문에 열리면 안 된다');
  assert.deepEqual(errors, []);
  console.log('PASS: ?dev 없이 버튼 없음, ?dev 저장 분리·통신 꺼짐, 기체 골라 전투·즉시 승리, 아카이브 해제가 실제 저장에 안 남음, 콘솔 예외 0');
  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
