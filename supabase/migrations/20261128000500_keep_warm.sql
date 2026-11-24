-- 每分钟叫醒一次后端函数，按「保存」时不用等它启动（冷启动 1–3 秒）
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'keep-warm';
SELECT cron.schedule('keep-warm', '* * * * *', $$SELECT public.call_cron('warm')$$);
