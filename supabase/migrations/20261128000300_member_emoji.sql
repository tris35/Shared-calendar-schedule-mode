-- 成员可以选一个可爱 / 搞笑的 emoji 当头像
ALTER TABLE members ADD COLUMN IF NOT EXISTS emoji TEXT;
