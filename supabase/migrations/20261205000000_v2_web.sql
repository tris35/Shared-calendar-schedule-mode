-- 第 2 版网站：个人资料（emoji、颜色、生日）、申请管理员、通知、最新动态、生日行程、邀请连结 3 天有效

-- 个人资料
ALTER TABLE users ADD COLUMN IF NOT EXISTS emoji TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_month SMALLINT CHECK (birth_month IS NULL OR birth_month BETWEEN 1 AND 12);
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_day SMALLINT CHECK (birth_day IS NULL OR birth_day BETWEEN 1 AND 31);
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded BOOLEAN NOT NULL DEFAULT FALSE;  -- 第一次登录的步骤做完了
ALTER TABLE users ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;                     -- 管理员移除（离职）：名字变成「未知用户」，资料保留
ALTER TABLE users ADD COLUMN IF NOT EXISTS activity_seen INTEGER NOT NULL DEFAULT 0;   -- 最新动态：看到第几笔（之后的算未看）

-- 生日行程：每年一笔（这个人的生日）
ALTER TABLE events ADD COLUMN IF NOT EXISTS birthday_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS events_birthday_uq ON events (calendar_id, birthday_user_id, (extract(year FROM start AT TIME ZONE 'UTC'))) WHERE birthday_user_id IS NOT NULL;

-- 回收站：删除的活动留 5 天，可以复原；5 天后才真的删掉（连照片）
ALTER TABLE events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS events_deleted_idx ON events (deleted_at) WHERE deleted_at IS NOT NULL;

-- 照片大小（算照片空间用了多少）
ALTER TABLE photos ADD COLUMN IF NOT EXISTS size INTEGER;

-- 邀请连结：只有管理员可以产生，3 天有效
ALTER TABLE calendar_invites ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 申请成为管理员
CREATE TABLE IF NOT EXISTS admin_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_requests_pending_uq ON admin_requests (user_id) WHERE status = 'pending';

-- 通知（弹出 + 声音）：给管理员（申请管理员、Google 同步出错）
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,              -- admin_request / sync_error
  body TEXT NOT NULL,
  ref TEXT,                        -- 同一件事不重复通知（例如同一个人的同步错误）
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, id DESC);

-- 最新动态（所有人都看得到）：谁建立 / 删除了哪个行程、改了模板、加了标签…
CREATE TABLE IF NOT EXISTS activity (
  id SERIAL PRIMARY KEY,
  calendar_id INTEGER REFERENCES calendars(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,            -- event_created / event_updated / event_deleted / label_added / template_renamed / person_removed / admin_added / joined
  title TEXT,
  event_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS activity_cal_idx ON activity (calendar_id, id DESC);

ALTER TABLE public.admin_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.admin_requests, public.notifications, public.activity FROM anon, authenticated;
  END IF;
END $$;
