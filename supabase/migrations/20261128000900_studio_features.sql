-- 工作室功能：预约流程、付款、清单
-- 1) 预约流程阶段：enquiry 询问 / booked 已预约 / shoot 拍摄日 / editing 修图 / delivered 已交付
ALTER TABLE events ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'booked';
-- 2) 付款：总额、已付（余额 = 总额 - 已付）
ALTER TABLE events ADD COLUMN IF NOT EXISTS amount_total NUMERIC(12,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2);
-- 3) 每个行程的清单
CREATE TABLE IF NOT EXISTS event_checklist (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  done_by TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS event_checklist_event_idx ON event_checklist (event_id);
-- 清单范本（例如「婚纱拍摄」：礼服、化妆、道具、确认地点）
CREATE TABLE IF NOT EXISTS checklist_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  items TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 安全：和其他表一样，只有后端读得到
ALTER TABLE public.event_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.event_checklist, public.checklist_templates FROM anon, authenticated;
  END IF;
END $$;
-- 一个现成的范本
INSERT INTO checklist_templates (name, items)
SELECT 'Pre-wedding shoot', ARRAY['Gown ready','Makeup artist confirmed','Props packed','Location confirmed','Deposit received']
WHERE NOT EXISTS (SELECT 1 FROM checklist_templates);
