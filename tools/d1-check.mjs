// 기록 서버 통합 검사(R03·닉네임 변경·랭킹 초기화·남용 방지): 로컬 Functions + D1에 실제로 요청을 보내 원자성·멱등성·집계 복구·이름 변경 제한·초기화 SQL을 본다
// 기존 로컬 DB라면 db/migrations/0002_name_at.sql·0004_rate_starts.sql을 먼저 적용한다(새로 만들면 schema.sql에 칸이 있다). 0003은 이 검사가 직접 실행한다
// 실제 서버·사용자 기록은 건드리지 않는다. 준비(AGENTS.md 검증 4와 같다. wrangler.toml은 커밋하지 않는다):
//   임시 폴더에 functions/·db/를 복사하고 wrangler.toml(pages_build_output_dir, [[d1_databases]] binding = "DB")을 둔 뒤
//   npx wrangler d1 execute DB --local --file db/schema.sql → npx wrangler pages dev --port 8788
//   그 임시 폴더에서: node <저장소>/tools/d1-check.mjs   (실패 주입용 트리거를 로컬 DB에 잠깐 만들었다 지운다)
import { execSync } from 'child_process';
import fs from 'fs';
const B = 'http://127.0.0.1:8788/api/';
// 바깥에서 스키마를 바꾸면(트리거) 로컬 서버가 연결을 한 번 끊는다: 연결 오류만 잠깐 뒤 다시
// 원정 기록은 진행도 초기화 회차를 실어 보낸다(서버가 다른 회차는 400)
// 기존 검사의 기록은 "검증된 원정"으로 보낸다: 시작 표를 충분히 옛 시각(0)으로 미리 넣는다. 검증 자체는 8)에서 따로 본다
const post = async (p, b, raw) => { if (p === 'record' && b && b.epoch === undefined) b = Object.assign({ epoch:2 }, b);
  if (p === 'record' && !raw && b.rid && b.id) sql(`INSERT OR IGNORE INTO starts (rid, player_id, started_at) VALUES ('${b.rid}', '${b.id}', 0)`); for (let i = 0; ; i++){ try { const r = await fetch(B + p, { method:'POST', body:JSON.stringify(b) }); return { status:r.status, data:await r.json().catch(() => null) }; } catch(e){ if (i > 5) throw e; await new Promise(f => setTimeout(f, 1000)); } } };
const sql = q => JSON.parse(execSync(`npx wrangler d1 execute DB --local --json --command "${q}"`, { stdio:['ignore','pipe','ignore'] }).toString())[0].results;
// 실행마다 다른 접두어: runs.rid는 전역 고유라 이전 실행의 rid와 겹치면 안 된다
const RUNID = Math.floor(Math.random() * 1e8).toString(16).padStart(8, '0');
const u = n => `${RUNID}-0000-4000-8000-${String(n).padStart(12, '0')}`;
let fail = 0; const ok = (n, c) => { console.log((c ? '통과 ' : '실패 ') + n); if (!c) fail++; };
const P = u(Date.now() % 1e9), me = () => sql(`SELECT runs, best, best_at FROM players WHERE id='${P}'`)[0];
const nm = ['가나다','라마바','사아자','차카타','파하거','너더러'].sort(() => Math.random() - .5).slice(0, 3).join(' ');
ok('플레이어 등록', (await post('player', { id:P, name:nm })).status === 200);
// 1) 집계 단계 실패 주입: 플레이어 갱신을 막는 트리거 → 삽입도 함께 되돌아가야 한다
sql(`CREATE TRIGGER inj BEFORE UPDATE ON players BEGIN SELECT RAISE(ABORT, 'inj'); END`);
const r1 = await post('record', { id:P, rid:u(1), progress:7 });
ok('실패 주입: 500 응답', r1.status === 500);
ok('실패 주입: 원정 행도 되돌아감(원자성)', sql(`SELECT COUNT(*) AS n FROM runs WHERE player_id='${P}'`)[0].n === 0);
sql(`DROP TRIGGER inj`);
const r2 = await post('record', { id:P, rid:u(1), progress:7 });
ok('재전송: 정상 반영(중복 아님)', r2.status === 200 && !r2.data.dup && me().runs === 1 && me().best === 7);
// 2) 순차·동시 중복 재전송이 원정 횟수를 늘리지 않음
await post('record', { id:P, rid:u(1), progress:7 });
await Promise.all([1,2,3,4,5].map(() => post('record', { id:P, rid:u(2), progress:3 })));
ok('순차·동시 재전송: runs 2, best 7', me().runs === 2 && me().best === 7);
// 3) 최고 기록·동점 시각: 같은 기록은 먼저 세운 시각 유지, 더 높으면 갱신
const t7 = me().best_at;
await post('record', { id:P, rid:u(3), progress:7 });
ok('동점: best_at 유지', me().best_at === t7);
await post('record', { id:P, rid:u(4), progress:9 });
ok('갱신: best 9, best_at 증가', me().best === 9 && me().best_at > t7 && me().runs === 4);
// 4) 예전 버전에서 어긋난 집계(행은 있는데 집계 누락)를 같은 rid 재전송이 바로잡는다
sql(`INSERT INTO runs (rid, player_id, progress, score, ended_at) VALUES ('${u(5)}', '${P}', 12, 12, 1)`);   // 0004 이전 행은 마이그레이션이 score = progress로 채운다
const r5 = await post('record', { id:P, rid:u(5), progress:12 });
ok('어긋난 집계 복구: dup 응답이지만 runs 5, best 12', r5.data.dup === true && me().runs === 5 && me().best === 12 && me().best_at === 1);
// 5) 없는 플레이어는 404 player
ok('없는 플레이어 404', (await post('record', { id:u(999999), rid:u(6), progress:1 })).data.error === 'player');
const b = await post('board', { id:P });
ok('랭킹: 내 기록 9→12, 원정 5', b.data.me.best === 12 && b.data.me.runs === 5);
// 5-1) 옛 버전(회차 없음·다른 회차)의 기록은 받지 않는다
ok('옛 회차 기록 거부(400 epoch)', (await post('record', { id:P, rid:u(70), progress:20, epoch:1 })).data.error === 'epoch' && me().best === 12);
// 6) 닉네임 변경(2026-10-16): 형식 400, 처음 한 번은 바로, 7일 안 재변경 429(nextAt), 중복 409, 동시 요청은 한 번만
const nmA = '기사' + RUNID.slice(0, 4), nmB = '하람' + RUNID.slice(0, 4);
ok('닉네임 변경: 형식이 틀리면 400', (await post('rename', { id:P, name:'<b>' })).status === 400);
ok('닉네임 변경: 금지어(우회 포함) 400 bad', (await post('rename', { id:P, name:'씨 1 발' })).data.error === 'bad' && (await post('rename', { id:P, name:'Admin' })).data.error === 'bad' && (await post('rename', { id:P, name:'시a발' })).data.error === 'bad' && (await post('rename', { id:P, name:'f한uck' })).data.error === 'bad');
ok('등록: 금지어 닉네임은 400 bad', (await post('player', { id:u(Date.now() % 1e9 + 11), name:'병신 ' + RUNID.slice(0, 2) })).data.error === 'bad');
const rn1 = await post('rename', { id:P, name:nmA });
ok('닉네임 변경: 처음 한 번은 바로(200), name_at 기록', rn1.status === 200 && rn1.data.name === nmA && sql(`SELECT name_at FROM players WHERE id='${P}'`)[0].name_at > 0);
const rn2 = await post('rename', { id:P, name:nmB });
ok('닉네임 변경: 7일 안 재변경 429 + 다음 가능 시각', rn2.status === 429 && rn2.data.nextAt - sql(`SELECT name_at FROM players WHERE id='${P}'`)[0].name_at === 7 * 864e5);
sql(`UPDATE players SET name_at = name_at - ${8 * 864e5} WHERE id='${P}'`);   // 8일이 지난 것으로
const Q = u(Date.now() % 1e9 + 7); await post('player', { id:Q, name:nmB });
ok('닉네임 변경: 남이 쓰는 이름은 409', (await post('rename', { id:P, name:nmB })).status === 409);
const both = await Promise.all(['갑' + RUNID.slice(0, 3), '을' + RUNID.slice(0, 3)].map(n => post('rename', { id:P, name:n })));
ok('닉네임 변경: 동시 요청은 한 번만 반영(200 하나, 429 하나 + 다음 가능 시각)', both.filter(r => r.status === 200).length === 1 && both.filter(r => r.status === 429 && r.data.nextAt > Date.now()).length === 1);
ok('닉네임 변경: 직접 입력 형식으로도 등록 가능', (await post('player', { id:u(Date.now() % 1e9 + 9), name:'Knight ' + RUNID.slice(0, 3) })).status === 200);
// 8) 남용 방지(2026-10-26): 시작 표 없이·너무 빨리 끝난 기록은 랭킹에 5칸까지만, 충분히 지나면 그대로
const V = u(Date.now() % 1e9 + 21); await post('player', { id:V, name:'검증' + RUNID.slice(0, 4) });
const best = () => sql(`SELECT best FROM players WHERE id='${V}'`)[0].best;
const n1 = await post('record', { id:V, rid:u(81), progress:40 }, true);
ok('시작 표 없는 기록: 받되(200) 랭킹은 5칸까지', n1.status === 200 && n1.data.verified === false && best() === 5
  && sql(`SELECT progress, score FROM runs WHERE rid='${u(81)}'`)[0].progress === 40);
ok('시작 표: 200', (await post('start', { id:V, rid:u(82) })).status === 200);
const n2 = await post('record', { id:V, rid:u(82), progress:40 }, true);
ok('시작하자마자 40칸 기록: 랭킹 5칸 유지', n2.data.verified === false && best() === 5);
ok('시작 표: 남의 rid로 보내도 시각이 바뀌지 않음', (await post('start', { id:P, rid:u(83) })).status === 200);
sql(`UPDATE starts SET started_at = started_at - ${40 * 5000 + 1000} WHERE rid='${u(83)}'`);
const n3 = await post('record', { id:V, rid:u(83), progress:40 }, true);
ok('다른 플레이어의 시작 표로는 검증되지 않음', n3.data.verified === false && best() === 5);
await post('start', { id:V, rid:u(84) });
sql(`UPDATE starts SET started_at = started_at - ${40 * 5000 + 1000} WHERE rid='${u(84)}'`);
const n4 = await post('record', { id:V, rid:u(84), progress:40 }, true);
ok('칸당 5초 이상 지난 기록: 그대로 반영(40)', n4.data.verified === true && best() === 40);
ok('없는 경로 404', (await post('nope', { id:V })).status === 404);
ok('큰 본문 413', (await post('board', { id:V, pad:'x'.repeat(3000) })).status === 413);
const bursts = []; for (let i = 0; i < 32; i++) bursts.push((await post('board', { id:V })).status);
ok('속도 제한: 같은 id 1분 30회 넘으면 429', bursts.slice(0, 28).every(s => s === 200) && bursts.at(-1) === 429);
ok('속도 제한 표에 원시 IP가 없다', sql(`SELECT COUNT(*) AS n FROM rate WHERE k LIKE '%127.0.0.1%' OR k LIKE '%::1%'`)[0].n === 0);
// 7) 랭킹 초기화 SQL(0003): 플레이어는 남고 기록만 비운다
sql(fs.readFileSync('db/migrations/0003_reset_ranking.sql', 'utf8').split('\n').filter(l => !l.startsWith('--')).join(' ').trim().replace(/"/g, "'"));
const after = sql(`SELECT name, best, best_at, runs FROM players WHERE id='${P}'`)[0];
ok('랭킹 초기화: 플레이어·닉네임 유지, 최고 기록·원정 횟수 0, 원정 기록 0', !!after && after.best === 0 && after.best_at === null && after.runs === 0 && sql('SELECT COUNT(*) AS n FROM runs')[0].n === 0);
process.exit(fail ? 1 : 0);
