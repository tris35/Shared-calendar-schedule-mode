-- 同一个活动同时在两个 Google 日历（例如 tlwcalender + tlwsalesmsg）：App 只显示一笔
-- 另一个日历的那一笔记在这里（"双胞胎"），同步时略过；Google 日历完全不动
CREATE TABLE IF NOT EXISTS google_twins (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL,
  google_event_id TEXT NOT NULL,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, -- App 里显示的那一笔（另一个日历的）
  etag TEXT,
  PRIMARY KEY (user_id, calendar_id, google_event_id)
);
ALTER TABLE public.google_twins ENABLE ROW LEVEL SECURITY;
