-- 등급별 순위표(작업 08 4단계, 2026-11-05): 원정 기록에 보안 등급을 남긴다.
-- 코드 배포 전에 운영 DB에 적용한다. 옛 기록은 NULL로 남아 전체 순위에만 든다
ALTER TABLE runs ADD COLUMN grade INTEGER;
CREATE INDEX IF NOT EXISTS runs_grade ON runs (grade, player_id, score);
