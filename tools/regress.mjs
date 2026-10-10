// 회귀 검사: 검토 문서(docs/tasks/04-project-review.md)에서 재현한 버그가 다시 생기지 않는지 본다
// 실행: node tools/regress.mjs (실패가 있으면 종료 코드 1)
// 시뮬레이터와 같은 방식(index.html의 script 순서대로 이어 붙여 가짜 DOM에서 eval)으로 실제 게임 코드를 돌린다
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const srcs=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(x=>x[1]);
let code=srcs.map(f=>fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n');
code='(() => {'+code+'\nglobalThis.__t={get G(){return G},get RUN(){return RUN},META:()=>META,hurtPlayer,enemyUpdate,battleEnd,WALL,reachable,enterNode};})();';
function mk(){return{children:[],classList:{add(){},remove(){},toggle(){}},style:{setProperty(){}},dataset:{},setAttribute(){},focus(){},addEventListener(){},append(){},querySelector(){return null},getContext(){return new Proxy({},{get:()=>()=>{},set:()=>true})},getBoundingClientRect(){return{left:0,top:0,width:180,height:340}}};}
const els={},store={};
globalThis.document={getElementById:id=>els[id]||(els[id]=mk()),documentElement:{},createElement:mk,createElementNS:mk,addEventListener(){},hidden:false};
globalThis.getComputedStyle=()=>({getPropertyValue:()=>'#000'});globalThis.matchMedia=()=>({addEventListener(){}});
globalThis.localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v,removeItem(){}};
globalThis.addEventListener=()=>{};globalThis.requestAnimationFrame=()=>{};globalThis.performance={now:()=>0};globalThis.setTimeout=()=>0;
(0,eval)(code);
document.getElementById('mNew').onclick({currentTarget:document.getElementById('mNew')});
const T=__t, M=T.META(); let fail=0; T.enterNode(T.reachable()[0]); if(!T.G) throw new Error('전투 시작 실패');
const ok=(name,c)=>{console.log((c?'통과':'실패')+' '+name); if(!c) fail++;};
// R01: 방어도 0, 체력 24, 피해 8
function hit(tr,v=8){M.tree=Object.fromEntries(tr.map(k=>[k,1])); T.G.p.def=0; T.G.p.hp=24; T.hurtPlayer(v); return 24-T.G.p.hp;}
ok('R01 트리 없음 피해 8', hit([])===8);
ok('R01 재생(d3)만 피해 8', hit(['d1','d2','d3'])===8);
ok('R01 불굴(d4) 피해 8→6', hit(['d1','d2','d3','d4'])===6);
ok('R01 불굴 올림: 피해 3→3', hit(['d1','d2','d3','d4'],3)===3);
M.tree={d1:1,d2:1,d3:1,d4:1}; T.G.p.def=2; T.G.p.hp=24; T.hurtPlayer(8); ok('R01 불굴 감소 후 방어도 흡수(8→6, 방어 2 → 체력 -4)', 24-T.G.p.hp===4);
// 재생(d3)의 승리 회복 +2는 그대로
M.tree={d1:1,d2:1,d3:1}; T.RUN.maxHp=40; T.RUN.relics.medkit=0; T.G.p.hp=20; T.battleEnd(true); ok('R01 재생: 승리 회복 +2', T.RUN.hp===22);
M.tree={}; T.enterNode(T.reachable()[0]);
// R04: 다음 하강으로 붕괴선을 넘는 벽돌 배치 후 몬스터 턴의 하강 단계만 실행
function descend(rows, crusher, o={}){
  const G=T.G; T.RUN.relics.crusher=crusher?1:0; T.RUN.relics.callus=o.callus?1:0; T.RUN.relics.brace=o.brace?1:0; G.callus=false;
  M.tree=o.d4?{d1:1,d2:1,d3:1,d4:1}:{};
  G.p.hp=24; G.p.def=0; G.m.dead=false; G.m.boss=false;
  G.bricks=rows.map(([r,c])=>({r,c,y:0,hp:1,type:'n',dead:false}));
  G.turn=T.WALL.every; G.cur={t:'wait'}; G.eStep=2; G.timer=1;
  T.enemyUpdate(0); return 24-G.p.hp;
}
ok('R04 파쇄기 없음: 벽돌 1개 붕괴 피해 2', descend([[10,3]],false)===2);
ok('R04 파쇄기: 파쇄한 벽돌은 붕괴 피해 없음', descend([[10,3]],true)===0);
ok('R04 파쇄기: 2개 중 1개만 제외 → 피해 2', descend([[10,3],[10,4]],true)===2);
ok('R04+불굴: 붕괴 2개(피해 4) → 3', descend([[10,3],[10,4]],false,{d4:1})===3);
ok('R04+불굴: 파쇄 후 남은 1개(피해 2) → 2', descend([[10,3],[10,4]],true,{d4:1})===2);
ok('R04+지지대+불굴: 파쇄 후 남은 2개(피해 2) → 2', descend([[10,3],[10,4],[10,5]],true,{brace:1,d4:1})===2);
ok('R04+굳은살: 파쇄로 붕괴가 없으면 굳은살을 아낀다', descend([[10,3]],true,{callus:1})===0 && T.G.callus===false);
ok('R04+굳은살: 남은 벽돌 붕괴는 굳은살이 막는다', descend([[10,3],[10,4]],true,{callus:1})===0 && T.G.callus===true);
M.tree={};
process.exit(fail?1:0);
