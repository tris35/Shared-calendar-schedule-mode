-- 登录错误次数限制：同一个 Gmail 15 分钟内错 10 次、或同一个 IP 错 20 次 → 锁 15 分钟
CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY,
  email TEXT,
  ip TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (email, at);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip, at);
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
-- 重复的索引（跟 events_cal_start_idx 一模一样）
DROP INDEX IF EXISTS events_calendar_idx;
-- 不再用的 WhatsApp 表（都是空的）
DROP TABLE IF EXISTS wa_sent;
DROP TABLE IF EXISTS contact_bookings;
