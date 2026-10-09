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
run("ART.img.knight = {complete:true,naturalWidth:200,naturalHeight:256}; ART.img.knight_actions = {complete:true,naturalWidth:1920,naturalHeight:960}; globalThis.actor = {};");
for (const action of ['attack','hit','death']){
  run(`actor.artAction=null; artPose(actor,'${action}')`);
  const times = run(`ART_ACTIONS.${action}.times`);
  let elapsed = 0;
  for(let col=0;col<6;col++){
    assert.equal(run(`artFrame('${action}',${elapsed+.00001}).col`), col);
    elapsed += times[col];
  }
  run(`artAdvance(actor,${elapsed+.1})`);
  assert.equal(run('actor.artAction'), action==='death' ? 'death' : null);
}
run("artPose(actor,'hit')");assert.equal(run('actor.artAction'),'death');
run("drawCharArt('knight',45,0,{actor})");assert.equal(calls.at(-1)[1],1600);
assert.equal(calls.at(-1)[2],640);
// 대기 포즈 기준 배율: 발밑 기준점이 ART_FOOT, 가로 기준점이 cx에 놓여야 한다
{ const [, , , , , dx, dy, dw] = calls.at(-1), k = dw / 320;
  assert.ok(Math.abs(dx + 160 * k - 45) < 1e-9); assert.ok(Math.abs(dy + 314 * k - 90) < 1e-9);
  const m = run('ART_SHEET.knight'), b = run('ART_BOX.knight');
  assert.ok(m.iw * k <= b.w + 1e-9 && m.ih * k <= b.h + 1e-9); }
run("delete ART.img.knight_actions; drawCharArt('knight',45,0,{actor})");assert.equal(calls.at(-1).length,5);
run('delete ART.img.knight');assert.equal(run("drawCharArt('knight',45,0,{actor})"),false);
media.matches=true;assert.equal(run("artFrame('death',0).col"),5);
assert.equal(run("artFrame('attack',0).col"),3);
console.log('PASS: 18개 프레임 경계, 동작 종료, 사망 우선, 소스 좌표·발밑 기준점, 폴백, 동작 줄이기');
