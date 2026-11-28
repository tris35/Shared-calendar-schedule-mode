-- 头像照片：每个人可以上传自己的头像（App 先缩到 256×256，大约 10–40 KB）
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_v integer;
CREATE TABLE IF NOT EXISTS user_avatars (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data bytea NOT NULL,
  mime text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_avatars ENABLE ROW LEVEL SECURITY;
