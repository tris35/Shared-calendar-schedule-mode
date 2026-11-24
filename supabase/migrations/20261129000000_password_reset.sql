-- 忘记密码：寄 6 位数验证码到 Gmail（只存 hash，15 分钟有效，最多试 5 次）
CREATE TABLE IF NOT EXISTS password_resets (
  email      text PRIMARY KEY,
  code_hash  text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts   int NOT NULL DEFAULT 0,
  sent_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;
