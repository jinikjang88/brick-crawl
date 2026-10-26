-- 브릭 크롤 기록 DB (Cloudflare D1)
-- 적용: Cloudflare 대시보드 D1 콘솔, 또는 npx wrangler d1 execute <DB 이름> --remote --file db/schema.sql

-- 플레이어: id는 클라이언트가 만든 비공개 UUID(기록을 올릴 때 쓰는 열쇠), name은 공개되는 임의 닉네임
CREATE TABLE IF NOT EXISTS players (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  best       INTEGER NOT NULL DEFAULT 0,   -- 최고 도달 칸 수(1세션 보스까지 = 5)
  best_at    INTEGER,                      -- 최고 기록을 세운 시각(ms). 같은 기록이면 먼저 세운 쪽이 위
  runs       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  name_at    INTEGER                       -- 마지막으로 닉네임을 바꾼 시각(ms). 7일에 한 번만 바꿀 수 있다. 처음 받은 임의 닉네임은 NULL
);
CREATE INDEX IF NOT EXISTS players_rank ON players (best DESC, best_at ASC);

-- 원정 하나당 한 줄. rid(원정 UUID)로 같은 원정을 두 번 올려도 한 번만 센다
CREATE TABLE IF NOT EXISTS runs (
  rid        TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL REFERENCES players(id),
  progress   INTEGER NOT NULL,                -- 클라이언트가 보낸 도달 칸 수(원본)
  score      INTEGER,                         -- 랭킹에 반영한 값. 검증 못 한 기록은 FREE_PROGRESS(5)까지만
  ended_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_player ON runs (player_id);

-- 원정 시작 표: 서버가 원정 시작을 처음 받은 시각. 기록이 이 시각에서 칸당 최소 시간이 지나야 진행도를 그대로 인정한다
CREATE TABLE IF NOT EXISTS starts (
  rid        TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL,
  started_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS starts_at ON starts (started_at);

-- 속도 제한(고정 창). k = "경로:플레이어id" 또는 "ip:IP해시". 원시 IP는 저장하지 않는다. exp가 지난 행은 서버가 가끔 지운다
CREATE TABLE IF NOT EXISTS rate (
  k   TEXT PRIMARY KEY,
  win INTEGER NOT NULL,
  n   INTEGER NOT NULL,
  exp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_exp ON rate (exp);
