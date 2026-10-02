// 기록 API (Cloudflare Pages Functions). D1 바인딩 이름: DB
//   POST /api/player  { id, name }           닉네임 등록. 이름이 이미 쓰이면 409
//   POST /api/record  { id, rid, progress }  원정 하나의 최종 도달 칸 수
//   POST /api/board   { id }                 상위 10명 + 내 순위
// 로그인 없는 공개 API라 조작을 완전히 막을 수는 없다. 형식·범위 검사로 명백한 쓰레기만 거른다.
// (제대로 된 방어는 시드 RNG 이후 재현 검증으로 — docs/tasks/01)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NAME = /^[가-힣]{3} [가-힣]{3} [가-힣]{3}$/;
const MAX_PROGRESS = 200;   // 현재 세션이 끝없이 이어지지만, 사람이 실제로 닿기 힘든 값으로 상한을 둔다
const TOP = 10;

// file://로 연 게임(출처 "null")에서도 보낼 수 있게 모든 출처를 허용한다. 쿠키를 쓰지 않으므로 안전하다
const CORS = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Access-Control-Allow-Headers':'Content-Type' };
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers:{ ...CORS, 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' } });

export async function onRequest({ request, env, params }){
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:CORS });
  if (request.method !== 'POST') return json({ error:'method' }, 405);
  if (!env.DB) return json({ error:'db' }, 503);
  let body;
  try { body = JSON.parse(await request.text()); } catch(e){ return json({ error:'json' }, 400); }
  if (!body || typeof body.id !== 'string' || !UUID.test(body.id)) return json({ error:'id' }, 400);
  const route = (params.path || []).join('/');
  try {
    if (route === 'player') return await player(env.DB, body);
    if (route === 'record') return await record(env.DB, body);
    if (route === 'board') return await board(env.DB, body);
  } catch(e){ return json({ error:'server' }, 500); }
  return json({ error:'route' }, 404);
}

async function player(db, { id, name }){
  if (typeof name !== 'string' || !NAME.test(name)) return json({ error:'name' }, 400);
  const cur = await db.prepare('SELECT name FROM players WHERE id = ?').bind(id).first();
  // 이미 등록된 id(응답을 못 받고 다시 보낸 경우 등)면 서버에 있는 이름이 정답이다
  if (cur) return json({ ok:true, name:cur.name });
  const r = await db.prepare('INSERT OR IGNORE INTO players (id, name, created_at) VALUES (?, ?, ?)').bind(id, name, Date.now()).run();
  return r.meta.changes ? json({ ok:true, name }) : json({ error:'name taken' }, 409);
}

async function record(db, { id, rid, progress }){
  if (typeof rid !== 'string' || !UUID.test(rid)) return json({ error:'rid' }, 400);
  if (!Number.isInteger(progress) || progress < 0 || progress > MAX_PROGRESS) return json({ error:'progress' }, 400);
  const p = await db.prepare('SELECT best FROM players WHERE id = ?').bind(id).first();
  if (!p) return json({ error:'player' }, 404);
  const now = Date.now();
  const r = await db.prepare('INSERT OR IGNORE INTO runs (rid, player_id, progress, ended_at) VALUES (?, ?, ?, ?)').bind(rid, id, progress, now).run();
  if (!r.meta.changes) return json({ ok:true, dup:true });
  await db.prepare(`UPDATE players SET runs = runs + 1,
      best_at = CASE WHEN ?1 > best THEN ?2 ELSE best_at END,
      best = MAX(best, ?1) WHERE id = ?3`).bind(progress, now, id).run();
  return json({ ok:true });
}

async function board(db, { id }){
  const top = await db.prepare('SELECT name, best FROM players WHERE best > 0 ORDER BY best DESC, best_at ASC LIMIT ?').bind(TOP).all();
  const me = await db.prepare('SELECT name, best, best_at, runs FROM players WHERE id = ?').bind(id).first();
  let rank = null;
  if (me && me.best > 0){
    const r = await db.prepare('SELECT COUNT(*) AS n FROM players WHERE best > ?1 OR (best = ?1 AND best_at < ?2)').bind(me.best, me.best_at).first();
    rank = r.n + 1;
  }
  const total = await db.prepare('SELECT COUNT(*) AS n FROM players WHERE best > 0').first();
  return json({ top:top.results, total:total.n, me:me ? { name:me.name, best:me.best, runs:me.runs, rank } : null });
}
