// 화면 캡처·넘침 검사: 실제 브라우저(file://)로 주요 화면을 9개 화면비 × 다크·라이트에서 열어
// (1) 콘솔 예외, (2) 가로 스크롤, (3) 화면 밖으로 밀린 버튼을 찾고, 눈으로 볼 캡처를 남긴다.
// 실행: node tools/shots.cjs [저장 폴더] [--all]   (기본은 390×844만 캡처, --all이면 9개 화면비 전부 캡처)
// 연출 무작위가 캡처마다 달라지지 않게 동작 줄이기로 띄운다.
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('SKIP: playwright 없음'); process.exit(0); }

const VIEWS = [[360, 640], [360, 800], [390, 844], [430, 932], [768, 1024], [1024, 1366], [844, 390], [1024, 768], [1440, 900]];
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const ALL = process.argv.includes('--all');
// 화면 이름 → 그 화면을 띄우는 코드(브라우저 안에서 실행). 저장 없는 새 계정에서 시작한다
const SCREENS = {
  main: () => {},
  talk: () => { showTalk({ title:STORY.b4.title, lines:STORY.b4.lines.slice(1, 3), onDone(){} }); talkStep(); },
  map: () => { startNewRun(false); if (mode === 'story') talkDone(); },
  battle: () => { enterNode(reachable().find(n => n.t === 'battle') || reachable()[0]); },
  boss: () => { RUN.s = 4; RUN.map = genMap(4, false); startBattle(RUN.map.flat().find(n => n.t === 'boss')); },
  reward: () => { RUN.pendingReward = 'elite'; RUN.reward = { kind:'elite', stock:['whetstone', 'ring', 'pact'], reroll:0 }; showReward('elite'); },
  shop: () => { showShop(); },
  rest: () => { showRest(); },
  garage: () => { showGarage(() => showMap(), false); },
  archive: () => { for (const k of Object.keys(ORBS)) META.seen.orb[k] = true; for (const k of Object.keys(RELICS)) META.seen.relic[k] = true; showBadges(); },
  menu: () => { openMenu(); },
};

(async () => {
  const browser = await chromium.launch();
  const bad = [];
  if (out) fs.mkdirSync(out, { recursive:true });
  for (const theme of ['dark', 'light']) for (const [w, h] of VIEWS){
    const shoot = out && (ALL || (w === 390 && h === 844));
    const page = await browser.newPage({ viewport:{ width:w, height:h }, deviceScaleFactor:shoot ? 2 : 1, reducedMotion:'reduce', hasTouch:w < 900 });
    page.on('pageerror', e => bad.push(`${theme} ${w}x${h}: 예외 ${e.message}`));
    await page.addInitScript(t => { try { localStorage.setItem('brickquest:theme:v1', t); } catch (e){} }, theme);
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction(() => typeof artImg === 'function' && artImg('rick') && artImg('orb_basic'));
    for (const [name, fn] of Object.entries(SCREENS)){
      try { await page.evaluate(fn); } catch (e){ bad.push(`${theme} ${w}x${h} ${name}: ${e.message.split('\n')[0]}`); continue; }
      await page.waitForTimeout(260);
      const r = await page.evaluate(() => {
        const se = document.scrollingElement, vw = innerWidth, vh = innerHeight, off = [];
        // 가로로 눕힌 폰은 회전 안내가 덮으므로 버튼 위치를 따지지 않는다
        const hint = document.querySelector('.rotateHint'), hidden = hint && getComputedStyle(hint).display !== 'none';
        if (!hidden) for (const b of document.querySelectorAll('.ov.on button, .ov.on [role=button]')){
          const q = b.getBoundingClientRect(); if (!q.width || getComputedStyle(b).visibility === 'hidden') continue;
          // 세로로 스크롤되는 목록 안의 버튼은 밀려도 된다. 가로로 잘리거나 44px보다 작은 것만 본다
          if (q.left < -1 || q.right > vw + 1) off.push('가로 잘림 ' + (b.textContent || b.id).trim().slice(0, 12));
          else if (q.height < 43.5 || q.width < 43.5) off.push(`작은 버튼 ${Math.round(q.width)}x${Math.round(q.height)} ` + (b.textContent || b.id || b.className).trim().slice(0, 12));
        }
        // 동작 줄이기로 띄웠으므로 돌고 있는 CSS 애니메이션이 있으면 reduced-motion 누락이다
        const anim = [...new Set(document.getAnimations().filter(x => x.playState === 'running' && x.animationName).map(x => x.animationName))];
        if (anim.length) off.push('동작 줄이기에서 도는 애니메이션 ' + anim.join(','));
        return { sx:se.scrollWidth > vw + 1, off:[...new Set(off)].slice(0, 4) };
      });
      if (r.sx) bad.push(`${theme} ${w}x${h} ${name}: 가로 스크롤`);
      for (const o of r.off) bad.push(`${theme} ${w}x${h} ${name}: ${o}`);
      if (shoot) await page.screenshot({ path:path.join(out, `${name}-${theme}-${w}x${h}.png`) });
    }
    await page.close();
  }
  await browser.close();
  console.log(bad.length ? '문제 ' + bad.length + '건\n' + bad.join('\n') : `PASS: ${Object.keys(SCREENS).length}개 화면 × ${VIEWS.length}개 화면비 × 2개 테마, 예외·가로 스크롤·잘린 버튼·작은 버튼·동작 줄이기 누락 0건`);
  process.exitCode = bad.length ? 1 : 0;
})();
