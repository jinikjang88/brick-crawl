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
async function api(path, body){
  if (!API_BASE) return null;
  try {
    // text/plain으로 보내 CORS 사전 요청(preflight)을 피한다(file://에서 보낼 때)
    const res = await fetch(API_BASE + '/api/' + path,
      { method:'POST', headers:{ 'Content-Type':'text/plain' }, body:JSON.stringify(body), cache:'no-store' });
    const data = await res.json().catch(() => null);
    return { ok:res.ok, status:res.status, data };
  } catch(e){ return null; }
}

// ── 닉네임 등록. 드물게 이름이 겹치면(409) 새로 뽑아 다시 시도한다(플레이어가 바꾸는 게 아니라 시스템이 피하는 것)
async function registerProfile(){
  const p = ensureProfile();
  if (p.registered) return true;
  for (let i = 0; i < 5; i++){
    const r = await api('player', { id:p.id, name:p.name });
    if (!r) return false;
    if (r.ok){
      if (r.data && typeof r.data.name === 'string') p.name = r.data.name;
      p.registered = true; saveProfile(); return true;
    }
    if (r.status !== 409) return false;
    p.name = makeNickname(); saveProfile();
  }
  return false;
}

// ── 원정 기록: 먼저 대기열에 넣고 보낸다. 실패하면 남아 있다가 다음 flush에서 다시 간다
function recordRun(r){
  if (!r) return;
  const p = ensureProfile();
  const rid = r.rid || uuid();
  if (p.queue.some(q => q.rid === rid)) return;
  p.queue.push({ rid, progress:runProgress(r), at:Date.now() });
  if (p.queue.length > 50) p.queue = p.queue.slice(-50);
  saveProfile();
  flushRecords();
}
// 이미 올리는 중이면 같은 작업을 기다린다. 원정 직후 메인 화면의 랭킹이 방금 기록을 빠뜨리지 않게
let flushP = null;
function flushRecords(){
  if (!API_BASE) return Promise.resolve();
  return flushP || (flushP = doFlush().finally(() => { flushP = null; }));
}
async function doFlush(){
  if (!(await registerProfile())) return;
  const p = PROFILE;
  while (p.queue.length){
    const q = p.queue[0];
    const r = await api('record', { id:p.id, rid:q.rid, progress:q.progress });
    if (!r || r.status >= 500) return;   // 통신·서버 오류: 다음에 다시
    p.queue.shift(); saveProfile();      // 성공 또는 잘못된 값이라 거절(4xx): 다시 보낼 필요 없다
  }
}

// ── 랭킹: 상위 10명 + 내 순위. 실패하면 null
// id는 기록용 비밀 열쇠라 주소(쿼리)에 싣지 않고 POST 본문으로 보낸다. 주소는 로그에 남는다
async function loadBoard(){
  const p = ensureProfile();
  const r = await api('board', { id:p.id });
  return r && r.ok && r.data ? r.data : null;
}
