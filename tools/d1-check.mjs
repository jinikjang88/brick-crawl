// 기록 서버 통합 검사(R03): 로컬 Functions + D1에 실제로 요청을 보내 원자성·멱등성·집계 복구를 본다
// 실제 서버·사용자 기록은 건드리지 않는다. 준비(AGENTS.md 검증 4와 같다. wrangler.toml은 커밋하지 않는다):
//   임시 폴더에 functions/·db/를 복사하고 wrangler.toml(pages_build_output_dir, [[d1_databases]] binding = "DB")을 둔 뒤
//   npx wrangler d1 execute DB --local --file db/schema.sql → npx wrangler pages dev --port 8788
//   그 임시 폴더에서: node <저장소>/tools/d1-check.mjs   (실패 주입용 트리거를 로컬 DB에 잠깐 만들었다 지운다)
import { execSync } from 'child_process';
const B = 'http://127.0.0.1:8788/api/';
// 바깥에서 스키마를 바꾸면(트리거) 로컬 서버가 연결을 한 번 끊는다: 연결 오류만 잠깐 뒤 다시
const post = async (p, b) => { for (let i = 0; ; i++){ try { const r = await fetch(B + p, { method:'POST', body:JSON.stringify(b) }); return { status:r.status, data:await r.json().catch(() => null) }; } catch(e){ if (i > 5) throw e; await new Promise(f => setTimeout(f, 1000)); } } };
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
sql(`INSERT INTO runs (rid, player_id, progress, ended_at) VALUES ('${u(5)}', '${P}', 12, 1)`);
const r5 = await post('record', { id:P, rid:u(5), progress:12 });
ok('어긋난 집계 복구: dup 응답이지만 runs 5, best 12', r5.data.dup === true && me().runs === 5 && me().best === 12 && me().best_at === 1);
// 5) 없는 플레이어는 404 player
ok('없는 플레이어 404', (await post('record', { id:u(999999), rid:u(6), progress:1 })).data.error === 'player');
const b = await post('board', { id:P });
ok('랭킹: 내 기록 9→12, 원정 5', b.data.me.best === 12 && b.data.me.runs === 5);
process.exit(fail ? 1 : 0);
