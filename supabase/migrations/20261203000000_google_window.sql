-- 从 Google 读：每一轮读「过去 2 个月 ～ 未来 1 年」，记下每个活动最后一次在 Google 看到的时间
-- （这一轮读完还没看到的 = Google 已经删掉 → 从 App 拿掉）
ALTER TABLE event_google ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS event_google_cal_idx ON event_google (user_id, calendar_id, google_event_id);
