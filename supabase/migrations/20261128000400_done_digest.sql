-- 任务清单：行程可以打勾「完成」（只在 App 里，不影响 Google 日历）
ALTER TABLE events ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS done_by TEXT;
