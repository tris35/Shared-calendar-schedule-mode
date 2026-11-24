-- 给客户的讯息：客户名字（讯息里的 {user} / {name}）
ALTER TABLE events ADD COLUMN IF NOT EXISTS customer_name TEXT;
