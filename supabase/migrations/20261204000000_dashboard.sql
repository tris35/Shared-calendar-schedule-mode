-- Dashboard（The Legend Wedding + WM）：模板、品牌和勾选、可以增加的标签、Rate、10 月的手动数据

-- 行程：用哪个模板，以及模板要求的勾选
ALTER TABLE events ADD COLUMN IF NOT EXISTS template_id TEXT;   -- calendars.event_templates 里的 id；NULL = 未选模板（例如从 Google 同步进来的）
ALTER TABLE events ADD COLUMN IF NOT EXISTS brand TEXT;         -- 'Legends' / 'WM'（选片、了解模板必填）
ALTER TABLE events ADD COLUMN IF NOT EXISTS soft TEXT;          -- 'non_all_soft' / 'all_soft'（选片模板必填）
ALTER TABLE events ADD COLUMN IF NOT EXISTS sales_type TEXT;    -- 'visit'（上门了解）/ 'vc'（VC了解）（了解模板必填）
ALTER TABLE events ADD COLUMN IF NOT EXISTS label_id TEXT;      -- calendars.labels 里的 id（自订标签；颜色可以重复）
-- 负责人：用哪个帐号建立的（从 Google 同步进来的没有，第一个在网站里选模板的人就是负责人）
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE events ADD CONSTRAINT events_brand_chk CHECK (brand IS NULL OR brand IN ('Legends', 'WM'));
  ALTER TABLE events ADD CONSTRAINT events_soft_chk CHECK (soft IS NULL OR soft IN ('non_all_soft', 'all_soft'));
  ALTER TABLE events ADD CONSTRAINT events_sales_type_chk CHECK (sales_type IS NULL OR sales_type IN ('visit', 'vc'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS events_cal_start_idx ON events (calendar_id, start);

-- 每个日历自己的模板和标签（NULL = 用默认的；管理员可以新增）
--   event_templates: [{ "id": "photo", "name": "选片", "kind": "photo" }, ...]   kind = photo / sales / normal
--   labels:          [{ "id": "l5", "name": "选片", "color": "5" }, ...]          color = Google 日历颜色 1–11
ALTER TABLE calendars ADD COLUMN IF NOT EXISTS event_templates JSONB;
ALTER TABLE calendars ADD COLUMN IF NOT EXISTS labels JSONB;

-- Rate：从某一天开始生效（那天之前的活动用旧的 Rate）
CREATE TABLE IF NOT EXISTS dash_rates (
  calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  brand TEXT NOT NULL CHECK (brand IN ('Legends', 'WM')),
  cat TEXT NOT NULL CHECK (cat IN ('photo', 'sales')),
  from_date DATE NOT NULL,
  list NUMERIC(12,2),      -- 从列表选的
  custom NUMERIC(12,2),    -- 自己输入的（优先）
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (calendar_id, brand, cat, from_date)
);

-- 手动数据（例如 2026 年 10 月只有总数）：有手动数据的月份，Dashboard 只算这里的，不算那个月的行程
CREATE TABLE IF NOT EXISTS dash_manual (
  id SERIAL PRIMARY KEY,
  calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  month TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  person TEXT NOT NULL,
  email TEXT,
  brand TEXT NOT NULL CHECK (brand IN ('Legends', 'WM')),
  non_all_soft INTEGER NOT NULL DEFAULT 0 CHECK (non_all_soft >= 0),
  all_soft INTEGER NOT NULL DEFAULT 0 CHECK (all_soft >= 0),
  visit INTEGER NOT NULL DEFAULT 0 CHECK (visit >= 0),
  vc INTEGER NOT NULL DEFAULT 0 CHECK (vc >= 0)
);
CREATE INDEX IF NOT EXISTS dash_manual_cal_idx ON dash_manual (calendar_id, month);

ALTER TABLE public.dash_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dash_manual ENABLE ROW LEVEL SECURITY;
