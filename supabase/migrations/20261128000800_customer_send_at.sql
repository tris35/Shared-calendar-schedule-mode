-- 给客户的 WhatsApp：可以自己选发送的日期和时间（空 = 行程前一天下午 4 点）
ALTER TABLE events ADD COLUMN IF NOT EXISTS customer_send_at TIMESTAMPTZ;
