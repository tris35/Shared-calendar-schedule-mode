-- 负责人（Person in charge）：Dashboard 算在这个人身上；可以是日历里任何一个人（包括管理员）。只存在 App，不同步到 Google
ALTER TABLE events ADD COLUMN IF NOT EXISTS person_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
-- 管理员在 Dashboard 把这个活动排除在分析之外（日历、Google 日历都不变）
ALTER TABLE events ADD COLUMN IF NOT EXISTS dash_excluded BOOLEAN NOT NULL DEFAULT FALSE;
