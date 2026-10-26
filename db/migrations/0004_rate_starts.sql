-- 2026-10-26: 기록 서버 남용 방지. 속도 제한 표(rate), 원정 시작 표(starts), 랭킹 반영값 칸(runs.score)을 더한다
-- 이미 있는 DB에 한 번만 실행한다(새로 만들면 schema.sql에 다 있다). 코드보다 먼저 적용한다
-- 적용: npx wrangler d1 execute <DB 이름> --remote --file db/migrations/0004_rate_starts.sql (또는 대시보드 D1 콘솔)
CREATE TABLE IF NOT EXISTS rate (k TEXT PRIMARY KEY, win INTEGER NOT NULL, n INTEGER NOT NULL, exp INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS rate_exp ON rate (exp);
CREATE TABLE IF NOT EXISTS starts (rid TEXT PRIMARY KEY, player_id TEXT NOT NULL, started_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS starts_at ON starts (started_at);
ALTER TABLE runs ADD COLUMN score INTEGER;
-- 이전 기록은 검증 수단이 없던 때라 그대로 인정한다(진행도 초기화 뒤 열흘치)
UPDATE runs SET score = progress WHERE score IS NULL;
