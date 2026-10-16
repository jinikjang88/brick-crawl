-- 2026-10-16: 닉네임 변경(7일에 한 번)을 위해 마지막 변경 시각 칸을 더한다. 이미 있는 DB에 한 번만 실행한다
-- 적용: npx wrangler d1 execute <DB 이름> --remote --file db/migrations/0002_name_at.sql (또는 대시보드 D1 콘솔)
ALTER TABLE players ADD COLUMN name_at INTEGER;
