// 프레임 경계·우선순위·에셋 실패가 전투 렌더를 깨뜨리지 않는지 검증한다.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const calls = [], media = { matches:false };
const context = vm.createContext({ ORBS:{}, RELICS:{}, matchMedia:()=>media,
  ctx:{globalAlpha:1,drawImage:(...args)=>calls.push(args)},
});
vm.runInContext(fs.readFileSync(new URL('../js/art.js', import.meta.url),'utf8'), context);
const run = code => vm.runInContext(code, context);
run("ART.img.rick = {complete:true,naturalWidth:200,naturalHeight:256}; ART.img.rick_actions = {complete:true,naturalWidth:3200,naturalHeight:1600}; globalThis.actor = {};");
for (const action of ['attack','skill','hit','death']){
  run(`actor.artAction=null; artPose(actor,'${action}')`);
  const times = run(`ART_ACTIONS.${action}.times`);
  let elapsed = 0;
  for(let col=0;col<times.length;col++){
    assert.equal(run(`artFrame('${action}',${elapsed+.00001}).col`), col);
    elapsed += times[col];
  }
  run(`artAdvance(actor,${elapsed+.1})`);
  assert.equal(run('actor.artAction'), action==='death' ? 'death' : null);
}
// 대기(idle) 10프레임 루프 경계 검증
{
  const idleTimes = run('ART_ACTIONS.idle.times');
  const dur = idleTimes.reduce((a, b) => a + b, 0);
  assert.equal(run('artFrame("idle", 0.001).row'), 4);
  assert.equal(run('artFrame("idle", 0.001).col'), 0);
  assert.equal(run(`artFrame("idle", ${dur + 0.001}).col`), 0);
  run('globalThis.idleActor = {}; drawCharArt("rick", 45, 0, {actor:idleActor, idleT:0.30})');
  assert.equal(calls.at(-1)[1], 2240);
  assert.equal(calls.at(-1)[2], 1280);
}
run("artPose(actor,'hit')");assert.equal(run('actor.artAction'),'death');
run("drawCharArt('rick',45,0,{actor})");assert.equal(calls.at(-1)[1],2880);
assert.equal(calls.at(-1)[2],640);
// 대기 포즈 기준 배율: 발밑 기준점이 ART_FOOT, 가로 기준점이 cx에 놓여야 한다
{ const [, , , , , dx, dy, dw] = calls.at(-1), k = dw / 320;
  assert.ok(Math.abs(dx + 160 * k - 45) < 1e-9); assert.ok(Math.abs(dy + 314 * k - 90) < 1e-9);
  const m = run('ART_SHEET.rick'), b = run('ART_BOX.rick');
  assert.ok(m.iw * k <= b.w + 1e-9 && m.ih * k <= b.h + 1e-9); }
run("delete ART.img.rick_actions; drawCharArt('rick',45,0,{actor})");assert.equal(calls.at(-1).length,5);
run('delete ART.img.rick');assert.equal(run("drawCharArt('rick',45,0,{actor})"),false);
media.matches=true;assert.equal(run("artFrame('death',0).col"),9);
assert.equal(run("artFrame('attack',0).col"),4);
assert.equal(run("artFrame('idle',0.5).col"),0);
console.log('PASS: 50개 프레임 경계(대기 루프 포함), 동작 종료, 사망 우선, 소스 좌표·발밑 기준점, 폴백, 동작 줄이기');
