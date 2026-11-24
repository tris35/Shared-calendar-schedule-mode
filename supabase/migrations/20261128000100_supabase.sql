-- Supabase 专用设定（本地测试不执行）

-- 1) 安全：资料只能经过后端函数存取。
--    Supabase 会把 public 里的表开放给网页的 REST API，所以全部开启 RLS 且不给任何规则 = 外面完全读不到。
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['members','events','photos','comments','event_log','users','google_links','event_google','wa_sent','kv'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- 2) 照片：私人 bucket（只有后端能读写）
INSERT INTO storage.buckets (id, name, public) VALUES ('photos', 'photos', false) ON CONFLICT (id) DO NOTHING;

-- 3) 排程：每 30 分钟从 Google 读回变更；每 15 分钟检查要不要发 WhatsApp（下午 4:00–4:15 之间发出）
--    网址和密钥由后端第一次执行时存进 kv 表，所以这里不用写死。
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.call_cron(job TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE s JSONB;
BEGIN
  SELECT value INTO s FROM public.kv WHERE key = 'app';
  IF s IS NULL OR s->>'cronUrl' IS NULL THEN RETURN; END IF; -- 后端还没执行过
  PERFORM net.http_post(
    url := (s->>'cronUrl') || '/api/cron/' || job,
    headers := jsonb_build_object('x-cron-key', s->>'cronKey', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END $$;
REVOKE ALL ON FUNCTION public.call_cron(TEXT) FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('google-pull', 'customer-messages');
SELECT cron.schedule('google-pull', '*/30 * * * *', $$SELECT public.call_cron('google-pull')$$);
SELECT cron.schedule('customer-messages', '*/15 * * * *', $$SELECT public.call_cron('customer-messages')$$);
