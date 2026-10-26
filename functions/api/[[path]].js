// 기록 API (Cloudflare Pages Functions). D1 바인딩 이름: DB
//   POST /api/player  { id, name }           닉네임 등록. 이름이 이미 쓰이면 409
//   POST /api/start   { id, rid }            원정 시작 표. 서버가 받은 시각을 남겨 기록의 최소 소요 시간을 따진다
//   POST /api/record  { id, rid, progress, epoch }  원정 하나의 최종 도달 칸 수(epoch = 진행도 초기화 회차, 다르면 400)
//   POST /api/board   { id }                 상위 10명 + 내 순위
//   POST /api/rename  { id, name }           닉네임 변경. 형식이 틀리면 400(name), 금지어 400(bad), 겹치면 409, 7일이 안 지났으면 429(nextAt)
// 모든 요청은 속도 제한을 거친다(넘으면 429 { error:'rate' }).
// 로그인 없는 공개 API라 조작을 완전히 막을 수는 없고, 구슬 물리가 기기 프레임에 따라 달라 서버가 원정을 재현 검증할 수도 없다.
// 그래서 "싸게 못 하게" 막는다: 속도 제한 + 시작 표 없이·너무 빨리 끝난 기록은 랭킹에 FREE_PROGRESS까지만 반영한다.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// 닉네임: 한글·영문·숫자·공백 2~12자, 앞뒤 공백·연속 공백 없음. 처음 받는 임의 닉네임("바삭한 우울한 냉장고")도 이 규칙에 맞는다
const NAME = /^[가-힣A-Za-z0-9]+( [가-힣A-Za-z0-9]+)*$/;
const validName = s => typeof s === 'string' && NAME.test(s) && [...s].length >= 2 && [...s].length <= 12;
// 닉네임 금지어: 욕설·성적 표현·혐오 표현·운영자 사칭(클라이언트 js/profile.js와 같은 목록). 공개 랭킹에 그대로 보이는 이름이라 서버가 최종 판정한다
const BAD_NAME = ['시발','씨발','씨빨','시빨','씨팔','시팔','씨바','시바','쌍년','쌍놈','썅','개새','새끼','색기','병신','빙신','븅신','병싄',
  '좆','좃','존나','졸라','존내','지랄','염병','엠창','느금','니미','니애미','느그애미','애미','애비','에미','미친놈','미친년','또라이','돌아이',
  '보지','자지','섹스','쎅스','창녀','걸레','후장','딸딸이','야동','자위','강간','성폭','꼴통','닥쳐','등신','호로','쓰레기','개같','개년','개놈',
  '일베','한남충','김치녀','틀딱','급식충','맘충','장애인','짱깨','쪽바리','흑형','깜둥',
  '운영자','관리자','운영진','개발자','브릭크롤',
  'fuck','fuk','shit','bitch','btch','asshole','bastard','dick','cock','pussy','cunt','nigger','nigga','fag','porn','sex','rape','whore','slut',
  'admin','administrator','moderator','official','gm'];
// 공백·숫자를 끼워 넣거나(시1발, 시 발) 대소문자를 바꿔 피하는 것을 막으려고 비교 전에 걸러 낸다
const normName = s => String(s).toLowerCase().replace(/[\s0-9]/g, '');
// 다른 문자 체계를 끼워 넣는 우회(시a발, f한uck)도 막는다: 영문을 뺀 꼴(한글 금지어용)과 한글을 뺀 꼴(영문 금지어용)도 함께 본다
const badName = s => { const n = normName(s), forms = [n, n.replace(/[a-z]/g, ''), n.replace(/[가-힣]/g, '')]; return BAD_NAME.some(w => forms.some(f => f.includes(w))); };
const RENAME_GAP = 7 * 24 * 3600 * 1000;
// 진행도 초기화 회차(클라이언트 RESET_EPOCH와 같게). 2026-10-16 랭킹 초기화 이후에는 이 회차의 기록만 받는다:
// 초기화 전에 열어 둔 탭이나 내려받은 옛 file:// 버전이 보관 중인 기록을 보내 지운 랭킹을 되살리지 않게(400이라 옛 버전도 다시 보내지 않는다)
const EPOCH = 2;   // 닉네임 변경 간격: 랭킹에서 남을 사칭하거나 이름을 자주 바꿔 혼란을 주지 않게
const MAX_PROGRESS = 200;   // 현재 세션이 끝없이 이어지지만, 사람이 실제로 닿기 힘든 값으로 상한을 둔다
const TOP = 10;
// 기록 검증: 서버가 시작 표를 받은 뒤 칸당 MIN_CELL_MS 이상 지나야 그 진행도를 그대로 랭킹에 쓴다.
// 휴식·상점 칸은 몇 초면 끝나지만 한 세션(5칸)에 전투가 3번 이상이라, 세션당 25초는 사람이 넘기 어렵지 않다(보수적으로 잡음)
const MIN_CELL_MS = 5000;
// 검증 못 한 기록(오프라인에서 시작한 원정·옛 버전·너무 빠른 기록)도 1세션 보스(5칸)까지는 랭킹에 반영한다:
// 오프라인 플레이어를 통째로 빼지 않되, 위조로 상위권을 차지하지는 못하게
const FREE_PROGRESS = 5;
// 본편 칸 수(js/save.js MAIN_CELLS = 5세션 × 5칸). 심연 기록은 이 위에 이어 센다(js/profile.js runProgress)
const MAIN_CELLS = 25;
// 속도 제한 [최대 횟수, 창(초)]. 플레이어 id별로 세고 IP별로도 센다.
// 국내 이동통신은 여러 사람이 IP 하나를 나눠 쓰므로(CGNAT) IP 한도는 넉넉하게 두고, 실제 제한은 id 쪽이 한다
const LIMIT = { player:[5, 3600], start:[30, 60], record:[30, 60], board:[30, 60], rename:[10, 3600] };
const LIMIT_IP = [300, 60], LIMIT_IP_NEW = [60, 3600];   // IP당 전체 요청 / IP당 새 플레이어 등록
// 본문 크기 상한: 정상 요청은 200바이트 남짓이다. 큰 본문으로 파싱 비용을 키우는 것을 막는다
const MAX_BODY = 2048;

// file://로 연 게임(출처 "null")에서도 보낼 수 있게 모든 출처를 허용한다. 쿠키를 쓰지 않으므로 안전하다
const CORS = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Access-Control-Allow-Headers':'Content-Type' };
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers:{ ...CORS, 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' } });

export async function onRequest({ request, env, params }){
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:CORS });
  if (request.method !== 'POST') return json({ error:'method' }, 405);
  if (!env.DB) return json({ error:'db' }, 503);
  const route = (params.path || []).join('/');
  const handler = ROUTES[route];
  if (!Object.hasOwn(ROUTES, route)) return json({ error:'route' }, 404);
  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error:'size' }, 413);
    body = JSON.parse(text);
  } catch(e){ return json({ error:'json' }, 400); }
  if (!body || typeof body !== 'object' || typeof body.id !== 'string' || !UUID.test(body.id)) return json({ error:'id' }, 400);
  try {
    const now = Date.now();
    if (!(await allowed(env, request, route, body.id, now))) return json({ error:'rate' }, 429);
    return await handler(env.DB, body, now);
  } catch(e){ return json({ error:'server' }, 500); }
}

// ── 속도 제한: D1 표 rate에 (열쇠, 창 번호, 횟수)를 고정 창으로 센다. 원시 IP는 저장하지 않고 해시 앞부분만 남긴다(개인정보 최소화).
// RATE_SALT(대시보드 환경 변수)가 있으면 해시에 섞어 IP를 역산하기 어렵게 한다.
// 표가 없거나 오류가 나면 막지 않는다: 남용 방지가 고장 나도 정상 기록은 멈추지 않는 편이 낫다
async function allowed(env, request, route, id, now){
  try {
    const db = env.DB, ip = request.headers.get('CF-Connecting-IP') || '';
    const checks = [[`${route}:${id}`, LIMIT[route]]];
    if (ip){
      const h = await sha256((env.RATE_SALT || 'brick-crawl') + '|' + ip);
      checks.push([`ip:${h}`, LIMIT_IP]);
      if (route === 'player') checks.push([`new:${h}`, LIMIT_IP_NEW]);
    }
    const rows = await db.batch(checks.map(([k, [, sec]]) => {
      const win = Math.floor(now / 1000 / sec);
      return db.prepare(`INSERT INTO rate (k, win, n, exp) VALUES (?1, ?2, 1, ?3)
          ON CONFLICT(k) DO UPDATE SET n = CASE WHEN win = ?2 THEN n + 1 ELSE 1 END, win = ?2, exp = ?3 RETURNING n`)
        .bind(k, win, (win + 1) * sec * 1000);
    }));
    // 지난 창의 행은 가끔(요청 50번에 1번꼴) 지워 표가 끝없이 커지지 않게 한다
    if (Math.random() < .02) await db.prepare('DELETE FROM rate WHERE exp < ?').bind(now).run();
    return rows.every((r, i) => r.results[0].n <= checks[i][1][0]);
  } catch(e){ return true; }
}
async function sha256(s){
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].slice(0, 16).map(x => x.toString(16).padStart(2, '0')).join('');
}

async function player(db, { id, name }, now){
  if (!validName(name)) return json({ error:'name' }, 400);
  if (badName(name)) return json({ error:'bad' }, 400);
  const cur = await db.prepare('SELECT name FROM players WHERE id = ?').bind(id).first();
  // 이미 등록된 id(응답을 못 받고 다시 보낸 경우 등)면 서버에 있는 이름이 정답이다
  if (cur) return json({ ok:true, name:cur.name });
  const r = await db.prepare('INSERT OR IGNORE INTO players (id, name, created_at) VALUES (?, ?, ?)').bind(id, name, now).run();
  return r.meta.changes ? json({ ok:true, name }) : json({ error:'name taken' }, 409);
}

// 원정 시작 표: 같은 rid는 처음 받은 시각만 남는다(다시 보내 시각을 바꿀 수 없다). 남의 rid는 가로챌 수 없다(player_id가 다르면 무시)
async function start(db, { id, rid }, now){
  if (typeof rid !== 'string' || !UUID.test(rid)) return json({ error:'rid' }, 400);
  const p = await db.prepare('SELECT 1 AS x FROM players WHERE id = ?').bind(id).first();
  if (!p) return json({ error:'player' }, 404);
  await db.prepare('INSERT OR IGNORE INTO starts (rid, player_id, started_at) VALUES (?, ?, ?)').bind(rid, id, now).run();
  // 오래된 표는 가끔 지운다(원정 저장을 몇 달 묵히면 검증 못 한 기록으로 처리된다)
  if (Math.random() < .02) await db.prepare('DELETE FROM starts WHERE started_at < ?').bind(now - 90 * 864e5).run();
  return json({ ok:true });
}

async function record(db, { id, rid, progress, epoch }, now){
  if (epoch !== EPOCH) return json({ error:'epoch' }, 400);
  if (typeof rid !== 'string' || !UUID.test(rid)) return json({ error:'rid' }, 400);
  if (!Number.isInteger(progress) || progress < 0 || progress > MAX_PROGRESS) return json({ error:'progress' }, 400);
  const p = await db.prepare('SELECT best FROM players WHERE id = ?').bind(id).first();
  if (!p) return json({ error:'player' }, 404);
  // 랭킹에 쓰는 값(score): 이 플레이어가 시작 표를 받았고 칸당 최소 시간이 지났으면 진행도 그대로, 아니면 FREE_PROGRESS까지만.
  // 원래 진행도(progress)도 남겨 나중에 기준을 바꿔도 다시 셀 수 있게 한다
  const t = await db.prepare('SELECT started_at FROM starts WHERE rid = ? AND player_id = ?').bind(rid, id).first();
  // 심연 원정은 본편 25칸을 더해 보내지만 이번 원정에서 실제로 지나간 칸은 그 위뿐이다. 본편 가산을 시간 검증에서 빼 준다.
  // 단 서버가 이미 본편 완주(best ≥ 25)를 인정한 플레이어만: 아니면 "심연 1칸"이라 속여 26칸을 5초에 얻을 수 있다
  const played = progress > MAIN_CELLS && p.best >= MAIN_CELLS ? progress - MAIN_CELLS : progress;
  const verified = !!t && now - t.started_at >= played * MIN_CELL_MS;
  const score = verified ? progress : Math.min(progress, FREE_PROGRESS);
  // 원정 행 삽입과 플레이어 집계를 batch(한 트랜잭션)로 묶는다: 삽입만 되고 집계가 실패하면
  // 재전송이 "중복"으로 끝나 집계가 영영 빠졌다(R03).
  // 집계는 "+1"이 아니라 runs 표에서 다시 센다. 같은 rid를 몇 번 보내도 결과가 같고(멱등),
  // 예전에 어긋난 플레이어도 다음 기록 때 바로잡힌다. MAX로 감싸 runs 표에 없는 옛 기록은 줄이지 않는다
  const [ins] = await db.batch([
    db.prepare('INSERT OR IGNORE INTO runs (rid, player_id, progress, score, ended_at) VALUES (?, ?, ?, ?, ?)').bind(rid, id, progress, score, now),
    db.prepare(`UPDATE players SET
        runs = MAX(runs, (SELECT COUNT(*) FROM runs WHERE player_id = ?1)),
        best_at = CASE WHEN (SELECT MAX(score) FROM runs WHERE player_id = ?1) > best
          THEN (SELECT MIN(ended_at) FROM runs WHERE player_id = ?1 AND score = (SELECT MAX(score) FROM runs WHERE player_id = ?1))
          ELSE best_at END,
        best = MAX(best, COALESCE((SELECT MAX(score) FROM runs WHERE player_id = ?1), 0))
      WHERE id = ?1`).bind(id),
  ]);
  return ins.meta.changes ? json({ ok:true, verified }) : json({ ok:true, dup:true });
}

// 닉네임 변경: 마지막 변경(name_at)에서 7일이 지나야 한다(처음 한 번은 바로). 조건을 UPDATE의 WHERE에 넣어
// 동시에 두 번 보내도 한 번만 바뀐다. 이름이 겹치면 UNIQUE 제약이 막는다
async function rename(db, { id, name }, now){
  if (!validName(name)) return json({ error:'name' }, 400);
  if (badName(name)) return json({ error:'bad' }, 400);
  const p = await db.prepare('SELECT name, name_at FROM players WHERE id = ?').bind(id).first();
  if (!p) return json({ error:'player' }, 404);
  if (p.name === name) return json({ ok:true, name, nameAt:p.name_at || 0 });
  if (p.name_at && now - p.name_at < RENAME_GAP) return json({ error:'wait', nextAt:p.name_at + RENAME_GAP }, 429);
  let r;
  try {
    r = await db.prepare('UPDATE players SET name = ?1, name_at = ?2 WHERE id = ?3 AND (name_at IS NULL OR name_at <= ?4)')
      .bind(name, now, id, now - RENAME_GAP).run();
  } catch(e){
    if (/UNIQUE/i.test(String(e && e.message))) return json({ error:'name taken' }, 409);
    throw e;
  }
  // 동시에 보낸 다른 변경이 먼저 반영됐다: 그 시각 기준으로 다음 가능 시각을 알려 준다
  if (!r.meta.changes){
    const cur = await db.prepare('SELECT name_at FROM players WHERE id = ?').bind(id).first();
    return json({ error:'wait', nextAt:((cur && cur.name_at) || now) + RENAME_GAP }, 429);
  }
  return json({ ok:true, name, nameAt:now });
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

// 라우트 표: 함수 선언 뒤에 두어 이름이 모두 정의된 다음 만든다. 이 표에 없는 경로는 404
const ROUTES = { player, start, record, board, rename };
