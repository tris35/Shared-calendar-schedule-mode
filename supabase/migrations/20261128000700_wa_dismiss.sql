-- WhatsApp Schedule：已发送的讯息可以从清单删掉（行程本身保留）
ALTER TABLE events ADD COLUMN IF NOT EXISTS customer_hidden BOOLEAN NOT NULL DEFAULT FALSE;
