-- 브릭 크롤 기록 DB (Cloudflare D1)
-- 적용: Cloudflare 대시보드 D1 콘솔, 또는 npx wrangler d1 execute <DB 이름> --remote --file db/schema.sql

-- 플레이어: id는 클라이언트가 만든 비공개 UUID(기록을 올릴 때 쓰는 열쇠), name은 공개되는 임의 닉네임
CREATE TABLE IF NOT EXISTS players (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  best       INTEGER NOT NULL DEFAULT 0,   -- 최고 도달 칸 수(1세션 보스까지 = 5)
  best_at    INTEGER,                      -- 최고 기록을 세운 시각(ms). 같은 기록이면 먼저 세운 쪽이 위
  runs       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS players_rank ON players (best DESC, best_at ASC);

-- 원정 하나당 한 줄. rid(원정 UUID)로 같은 원정을 두 번 올려도 한 번만 센다
CREATE TABLE IF NOT EXISTS runs (
  rid        TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL REFERENCES players(id),
  progress   INTEGER NOT NULL,
  ended_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_player ON runs (player_id);
