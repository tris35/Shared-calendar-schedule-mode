CREATE TABLE members (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#4f9d69',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  start TIMESTAMPTZ NOT NULL,
  "end" TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  label TEXT,                       -- 颜色标签（对应 Google 日历的 11 种颜色）
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  remind BOOLEAN NOT NULL DEFAULT TRUE,  -- 前一天 12:00 Google 日历通知
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX events_start_idx ON events (start);

CREATE TABLE photos (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  blob_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  caption TEXT,
  author TEXT,                      -- 谁上传的
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 留言：photo_id 为 NULL = 行程的留言；有值 = 照片下面的评论
CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  photo_id INTEGER REFERENCES photos(id) ON DELETE CASCADE,
  author TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 行程的变更纪录（「Janny 修改了标题」）
CREATE TABLE event_log (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  author TEXT,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX event_log_event_idx ON event_log (event_id);

-- 个人帐号（用 Gmail 注册）
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,       -- 小写
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 每个人连接自己的 Google 日历
CREATE TABLE google_links (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gmail TEXT NOT NULL,              -- 要同步到的 Gmail（用户自己填的）
  refresh_token TEXT NOT NULL,
  calendar_id TEXT NOT NULL,        -- App 在他的 Google 日历建立的「共享日历」
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 每个行程在每个人 Google 日历里的对应
CREATE TABLE event_google (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  error TEXT,
  PRIMARY KEY (event_id, user_id)
);

-- 每个帐号的介面语言：en / zh / zh-TW / ms
ALTER TABLE users ADD COLUMN IF NOT EXISTS lang TEXT NOT NULL DEFAULT 'en';
-- 双向同步：从 Google 日历读回变更
ALTER TABLE google_links ADD COLUMN IF NOT EXISTS sync_token TEXT;          -- Google 增量同步的位置
ALTER TABLE google_links ADD COLUMN IF NOT EXISTS last_pull_at TIMESTAMPTZ; -- 上次从 Google 读取的时间
ALTER TABLE google_links ADD COLUMN IF NOT EXISTS calendar_name TEXT;       -- 正在同步的 Google 日历名称（例如「拍摄」）
ALTER TABLE event_google ADD COLUMN IF NOT EXISTS etag TEXT;                -- 我们最后一次写入 Google 的版本（用来忽略自己写的变更）
-- 快速双向同步：Google 推送通知（有变更时 Google 会马上通知 App）
ALTER TABLE google_links ADD COLUMN IF NOT EXISTS watch_id TEXT;
ALTER TABLE google_links ADD COLUMN IF NOT EXISTS watch_resource TEXT;
ALTER TABLE google_links ADD COLUMN IF NOT EXISTS watch_expires TIMESTAMPTZ;
-- 同一时间只读一次；读的时候有新通知就再读一遍
ALTER TABLE google_links ADD COLUMN IF NOT EXISTS pull_lease TIMESTAMPTZ;
ALTER TABLE google_links ADD COLUMN IF NOT EXISTS pull_again BOOLEAN NOT NULL DEFAULT FALSE;
-- 给客户的 WhatsApp 讯息：行程前一天下午 4 点自动发送
ALTER TABLE events ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS customer_note TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS customer_auto BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS customer_sent_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS customer_error TEXT;
-- 只有管理员允许的帐号可以设定/发送 WhatsApp 给客户
ALTER TABLE users ADD COLUMN IF NOT EXISTS wa_allowed BOOLEAN NOT NULL DEFAULT FALSE;
-- 每则发出去的 WhatsApp 讯息（用来算每个月用了多少；删除行程也不会少算）
CREATE TABLE IF NOT EXISTS wa_sent (
  id SERIAL PRIMARY KEY,
  event_id INTEGER,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wa_sent_at_idx ON wa_sent (sent_at);

-- 服务器端设置（签名密钥、时区、排程密钥…），只有后端读得到
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
