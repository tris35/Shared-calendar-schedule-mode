-- 同步「我的日历」里的所有日历：每个人可以有好几个 Google 日历一起双向同步
CREATE TABLE IF NOT EXISTS google_calendars (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL,
  name TEXT,
  sync_token TEXT,                  -- 这个日历的增量同步位置（"p:" 开头 = 第一次读取还没读完）
  watch_id TEXT,                    -- 这个日历的 Google 推送通知
  watch_resource TEXT,
  watch_expires TIMESTAMPTZ,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,  -- 用户可以在「设置」取消勾选某个日历
  PRIMARY KEY (user_id, calendar_id)
);
-- 每一笔对应记着它在哪一个 Google 日历（NULL = 这个人的主日历）
ALTER TABLE event_google ADD COLUMN IF NOT EXISTS calendar_id TEXT;
UPDATE event_google g SET calendar_id = l.calendar_id FROM google_links l WHERE g.user_id = l.user_id AND g.calendar_id IS NULL;

-- 安全：和其他表一样，只有后端读得到
ALTER TABLE public.google_calendars ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.google_calendars FROM anon, authenticated;
  END IF;
END $$;
