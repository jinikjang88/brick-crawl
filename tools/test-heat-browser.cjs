// 모든 구슬 과열 선택 창을 실제 브라우저(file://, ?dev)로 확인한다(2026-11-29): 표시·안전한 초점·판 탭 막힘·과열 사격·넘기기
// 실행: node tools/test-heat-browser.cjs
const assert=require('assert');const path=require('path');const {pathToFileURL}=require('url');let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('SKIP: playwright 없음'); process.exit(0); }
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});p.setDefaultTimeout(6000);
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href+'?dev');await p.waitForFunction(()=>typeof showMain==='function'&&artImg('rick'));
await p.mouse.click(5,5);  // INPUT_SEEN
await p.evaluate(()=>{ devRun(0,false); RUN.deck=['bomb/venom','bomb']; const n=RUN.map[0][0]; RUN.pending={r:0,l:0}; saveRun(); startBattle(n); G.heat=[3,2]; G.sel=0; drawOrb(); });
assert.equal(await p.isVisible('#heatPick'), true);

// Space는 발사로 가로채지 않고 초점 버튼(넘기기)이 받는다
assert.equal(await p.evaluate(()=>document.activeElement.id), 'hpSkip');
await p.click('#cv', { position:{ x:60, y:560 } }); assert.equal(await p.evaluate(()=>G.phase), 'aim', '판을 눌러도 쏘지 않는다');
const hp0=await p.evaluate(()=>G.p.hp); await p.click('#hpForce');
const s=await p.evaluate(()=>({hp:G.p.hp, hot:G.allHot, vis:!$('heatPick').hidden, heat:G.heat.join()}));
assert.equal(s.hp, hp0-1); assert.equal(s.hot,false); assert.equal(s.vis,false);
await p.waitForTimeout(300); await p.keyboard.press('Space'); await p.waitForFunction(()=>G.phase!=='aim');
await p.evaluate(()=>{ G.phase='aim'; G.heat=[2,3]; G.sel=0; drawOrb(); }); await p.click('#hpSkip');
assert.equal(await p.evaluate(()=>G.phase), 'enemy');
assert.deepEqual(errs, []); console.log('PASS 과열 창: 표시·초점·판 탭 막힘·과열 사격(체력 -1 후 Space로 발사)·넘기기'); await b.close();})().catch(e=>{console.error(e);process.exitCode=1;});
