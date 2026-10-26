// 기록 서버(Cloudflare Pages Functions + D1)와의 통신
'use strict';

// ── 서버 주소: 배포 사이트에서는 같은 출처, file://로 연 경우에는 배포 서버로 보낸다.
// location이 없으면(시뮬레이터) 통신을 끈다. 봇의 원정이 실제 랭킹에 섞이면 안 된다
const API_HOME = 'https://brick-crawl.pages.dev';
const API_BASE = (() => {
  try {
    if (typeof fetch !== 'function' || typeof location === 'undefined') return null;
    if (location.protocol === 'http:' || location.protocol === 'https:') return location.origin;
    if (location.protocol === 'file:') return API_HOME;
  } catch(e){}
  return null;
})();

// 실패는 전부 null로 돌려준다. 기록 서버가 죽어도 게임은 그대로 돌아야 한다
// 응답 없는 망(캡티브 포털 등)에서 브라우저 기본 제한(수 분)까지 기다리면 닉네임 변경 버튼과 기록 전송(flushP)이 그동안 멈춘다: 8초에 끊는다
const API_TIMEOUT = 8000;
async function api(path, body){
  if (!API_BASE) return null;
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ac ? setTimeout(() => ac.abort(), API_TIMEOUT) : 0;
  try {
    // text/plain으로 보내 CORS 사전 요청(preflight)을 피한다(file://에서 보낼 때)
    const res = await fetch(API_BASE + '/api/' + path,
      { method:'POST', headers:{ 'Content-Type':'text/plain' }, body:JSON.stringify(body), cache:'no-store', signal:ac ? ac.signal : undefined });
    const data = await res.json().catch(() => null);
    return { ok:res.ok, status:res.status, data };
  } catch(e){ return null; }
  finally { if (timer) clearTimeout(timer); }
}

// ── 닉네임 등록. 드물게 이름이 겹치거나(409) 서버가 이름을 거절하면(400 name·bad: 서버 금지어가 먼저 배포된 옛 자동 닉네임 등)
// 새로 뽑아 다시 시도한다(플레이어가 바꾸는 게 아니라 시스템이 피하는 것). 거절된 이름에 갇히면 랭킹에도 못 오르고 직접 바꿀 수도 없다.
// 기록 전송·시작 표·닉네임 변경이 동시에 불러도 등록 요청은 하나만 나간다(서버 속도 제한: 시간당 5회)
let regP = null;
function registerProfile(){ return regP || (regP = doRegister().finally(() => { regP = null; })); }
async function doRegister(){
  const p = ensureProfile();
  if (p.registered) return true;
  for (let i = 0; i < 5; i++){
    const r = await api('player', { id:p.id, name:p.name });
    if (!r) return false;
    if (r.ok){
      if (r.data && typeof r.data.name === 'string') p.name = r.data.name;
      p.registered = true; saveProfile(); return true;
    }
    const rejected = r.status === 400 && r.data && (r.data.error === 'name' || r.data.error === 'bad');
    if (r.status !== 409 && !rejected) return false;
    p.name = makeNickname(); saveProfile();
  }
  return false;
}

// ── 닉네임 변경: 서버가 형식·중복·7일 제한을 최종 판정한다. 돌려주는 값 = { ok } | { error:'name'|'bad'|'taken'|'wait'|'busy'|'offline', nextAt }
async function renameProfile(name){
  const p = ensureProfile();
  name = String(name || '').trim().replace(/\s+/g, ' ');
  if (!validName(name)) return { error:'name' };
  if (badName(name)) return { error:'bad' };
  if (name === p.name) return { ok:true };
  if (p.nameAt && Date.now() - p.nameAt < RENAME_GAP) return { error:'wait', nextAt:p.nameAt + RENAME_GAP };
  // 아직 서버에 등록 전이면 먼저 등록한다(바꿀 대상이 서버에 있어야 한다)
  if (!(await registerProfile())) return { error:'offline' };
  const r = await api('rename', { id:p.id, name });
  if (!r) return { error:'offline' };
  if (r.ok){ p.name = name; p.nameAt = (r.data && r.data.nameAt) || Date.now(); saveProfile(); return { ok:true }; }
  if (r.status === 409) return { error:'taken' };
  if (r.status === 429 && r.data && r.data.error === 'rate') return { error:'busy' };
  if (r.status === 429){ const nextAt = r.data && r.data.nextAt; if (nextAt){ p.nameAt = nextAt - RENAME_GAP; saveProfile(); } return { error:'wait', nextAt }; }
  if (r.status === 400) return { error:r.data && r.data.error === 'bad' ? 'bad' : 'name' };
  return { error:'offline' };
}

// ── 원정 시작 표: 서버가 원정 시작 시각을 알아야 그 원정의 기록을 랭킹에 그대로 반영한다(서버 MIN_CELL_MS·FREE_PROGRESS).
// 원정 시작과 지도 화면마다 보내고, 받으면 r.tk로 기억해 다시 보내지 않는다(오프라인에서 시작해도 연결되는 대로 받는다).
// 저장은 다음 정상 저장 때 함께 된다: 전투 도중에 saveRun을 부르면 덜 끝난 상태가 저장될 수 있다. 저장 전에 꺼져도 다시 보낼 뿐이다
// 보내는 중인 rid는 다시 보내지 않는다(지도 화면을 빠르게 오가도 요청 하나)
const ticketing = new Set();
async function ticketRun(r){
  if (!API_BASE || !r || r.tk || ticketing.has(r.rid)) return;
  ticketing.add(r.rid);
  try {
    if (!(await registerProfile())) return;
    const res = await api('start', { id:PROFILE.id, rid:r.rid });
    if (res && res.ok) r.tk = true;
  } finally { ticketing.delete(r.rid); }
}

// ── 원정 기록: 먼저 대기열에 넣고 보낸다. 실패하면 남아 있다가 다음 flush에서 다시 간다
function recordRun(r){
  if (!r) return;
  const p = ensureProfile();
  const rid = r.rid || uuid();
  if (p.queue.some(q => q.rid === rid)) return;
  p.queue.push({ rid, progress:runProgress(r), at:Date.now() });
  trimQueue(p.queue);
  saveProfile();
  flushRecords();
}
// 오프라인으로 오래 놀아도 저장이 끝없이 커지지 않게 50개까지만 둔다. 넘치면 오래된 것부터 버리되
// 대기열의 최고 기록은 남긴다: 랭킹에 올라갈 기록을 잃는 것보다 원정 횟수 몇 개를 빠뜨리는 편이 낫다(2026-10 결정)
const QUEUE_MAX = 50;
function trimQueue(q){
  while (q.length > QUEUE_MAX){
    const best = q.reduce((b, x, i) => x.progress > q[b].progress ? i : b, 0);
    q.splice(best === 0 ? 1 : 0, 1);
  }
}
// 이미 올리는 중이면 같은 작업을 기다린다. 원정 직후 메인 화면의 랭킹이 방금 기록을 빠뜨리지 않게
let flushP = null;
function flushRecords(){
  if (!API_BASE) return Promise.resolve();
  return flushP || (flushP = doFlush().finally(() => { flushP = null; }));
}
// 응답 분류: 성공 → 빼기 / 일시 실패(통신·5xx·408·429) → 남겨 두고 다음에 / 서버에 플레이어가 없음(404) → 다시 등록하고 재시도 /
// 그 밖의 4xx는 값 자체가 잘못돼 몇 번 보내도 같으니 빼고 다음 기록으로
const retryLater = r => !r || r.status >= 500 || r.status === 408 || r.status === 429;
async function doFlush(){
  if (!(await registerProfile())) return;
  const p = PROFILE;
  let reReg = false;
  while (p.queue.length){
    const q = p.queue[0];
    const r = await api('record', { id:p.id, rid:q.rid, progress:q.progress, epoch:RESET_EPOCH });
    if (retryLater(r)) return;
    if (r.status === 404 && r.data && r.data.error === 'player'){
      // 등록했다고 기억했는데 서버에 없다(DB 초기화 등). 한 번만 다시 등록해 무한 반복을 막는다
      if (reReg) return;
      reReg = true; p.registered = false; saveProfile();
      if (!(await registerProfile())) return;
      continue;
    }
    p.queue.shift(); saveProfile();
  }
}

// ── 랭킹: 상위 10명 + 내 순위. 실패하면 null
// id는 기록용 비밀 열쇠라 주소(쿼리)에 싣지 않고 POST 본문으로 보낸다. 주소는 로그에 남는다
async function loadBoard(){
  const p = ensureProfile();
  const r = await api('board', { id:p.id });
  return r && r.ok && r.data ? r.data : null;
}
