-- 每周备份存在网站里（不寄信）：最多保留 8 份，管理员在「设置」下载
CREATE TABLE IF NOT EXISTS saved_backups (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stamp TEXT NOT NULL,
  csv TEXT NOT NULL,
  json TEXT NOT NULL,
  counts JSONB
);
ALTER TABLE public.saved_backups ENABLE ROW LEVEL SECURITY;
-- 每个星期一早上 3 点（马来西亚时间 = 星期日 19:00 UTC）
SELECT cron.schedule('weekly-backup', '0 19 * * 0', $$SELECT public.call_cron('backup')$$);
