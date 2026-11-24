// 读取环境变量（Supabase Edge Function / 本地 Deno 测试）
export const env = (key: string): string | undefined => Deno.env.get(key) || undefined;

// 后端（这个函数）的公开网址，例如 https://xxxx.supabase.co/functions/v1 —— /api/... 都在它下面
export const apiBase = () =>
  (env("API_BASE") || (env("SUPABASE_URL") ? `${env("SUPABASE_URL")}/functions/v1` : "")).replace(/\/$/, "");
// 前端（GitHub Pages）的网址，例如 https://tris35.github.io/Shared-calendar
export const appUrl = () => (env("APP_URL") || "").replace(/\/$/, "");

// 背景工作：回应后继续执行（Supabase 用 EdgeRuntime.waitUntil）
export function later(p: Promise<unknown>) {
  const guarded = p.catch((e) => console.error(e));
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(guarded);
  else ((globalThis as any).__pending ??= []).push(guarded); // 本地测试
}
