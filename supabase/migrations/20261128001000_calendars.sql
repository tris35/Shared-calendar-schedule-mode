-- 每个帐号自己的日历 + 邀请连结一起编辑
CREATE TABLE IF NOT EXISTS calendars (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  label_names JSONB NOT NULL DEFAULT '{}',   -- 这个日历的颜色标签名称
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS calendar_members (
  calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor',       -- owner 拥有者 / editor 可以编辑 / viewer 只能看
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (calendar_id, user_id)
);
CREATE TABLE IF NOT EXISTS calendar_invites (
  token TEXT PRIMARY KEY,
  calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE events ADD COLUMN IF NOT EXISTS calendar_id INTEGER REFERENCES calendars(id) ON DELETE CASCADE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS calendar_id INTEGER REFERENCES calendars(id) ON DELETE CASCADE;
ALTER TABLE google_links ADD COLUMN IF NOT EXISTS app_calendar_id INTEGER REFERENCES calendars(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS events_calendar_idx ON events (calendar_id, start);
CREATE INDEX IF NOT EXISTS members_calendar_idx ON members (calendar_id);
CREATE INDEX IF NOT EXISTS calendar_members_user_idx ON calendar_members (user_id);

-- 现有资料：每个帐号一个自己的日历；现有的行程、成员放进最早那个帐号的日历
INSERT INTO calendars (name, owner_id)
  SELECT u.name, u.id FROM users u WHERE NOT EXISTS (SELECT 1 FROM calendars c WHERE c.owner_id = u.id) ORDER BY u.id;
INSERT INTO calendar_members (calendar_id, user_id, role)
  SELECT c.id, c.owner_id, 'owner' FROM calendars c WHERE c.owner_id IS NOT NULL ON CONFLICT DO NOTHING;
UPDATE calendars SET label_names = COALESCE((SELECT value->'labelNames' FROM kv WHERE key = 'app'), '{}')
  WHERE id = (SELECT MIN(id) FROM calendars) AND label_names = '{}';
UPDATE events SET calendar_id = (SELECT MIN(id) FROM calendars) WHERE calendar_id IS NULL;
UPDATE members SET calendar_id = (SELECT MIN(id) FROM calendars) WHERE calendar_id IS NULL;
UPDATE google_links g SET app_calendar_id = (SELECT c.id FROM calendars c WHERE c.owner_id = g.user_id ORDER BY c.id LIMIT 1) WHERE app_calendar_id IS NULL;

ALTER TABLE public.calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_invites ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.calendars, public.calendar_members, public.calendar_invites FROM anon, authenticated;
  END IF;
END $$;
