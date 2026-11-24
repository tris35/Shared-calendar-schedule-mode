-- Schedule Mode：用行程标题里的 booking number，从 Google 通讯录找客户电话，自动发 WhatsApp 提醒

-- 通讯录里有 booking number 的联络人（每个连接 Google 的帐号各自一份，排程每 30 分钟更新）
CREATE TABLE IF NOT EXISTS contact_bookings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking TEXT NOT NULL,          -- 例：6961、WM1902（大写、没有空格）
  phone TEXT NOT NULL,            -- 例：601156604342
  name TEXT,                      -- 名字去掉 booking number 后剩下的（可能是空的）
  contact TEXT,                   -- 通讯录里原本的名字
  PRIMARY KEY (user_id, booking, phone)
);
CREATE INDEX IF NOT EXISTS contact_bookings_booking_idx ON contact_bookings (booking);

-- 行程：客户资料从哪里来 + 找不到电话的原因
ALTER TABLE events ADD COLUMN IF NOT EXISTS customer_source TEXT;         -- 'auto' = 从通讯录自动填；'manual' = 员工自己填
ALTER TABLE events ADD COLUMN IF NOT EXISTS customer_lookup TEXT;         -- 'notfound' / 'multiple'
ALTER TABLE events ADD COLUMN IF NOT EXISTS customer_lookup_detail TEXT;  -- 多个联络人时：他们的名字

-- 安全：和其他表一样，只有后端函数读得到（本地测试没有 anon / authenticated 角色就跳过）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'ALTER TABLE public.contact_bookings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON public.contact_bookings FROM anon, authenticated';
  END IF;
END $$;
