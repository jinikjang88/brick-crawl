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
    const r = await api('record', { id:p.id, rid:q.rid, progress:q.progress });
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
