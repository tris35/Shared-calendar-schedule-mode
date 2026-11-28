// 共享日历后端（Supabase Edge Function「api」）
// 网址：https://<项目>.supabase.co/functions/v1/api/...
//   /api/*                    App 的 API（网页呼叫）
//   /api/p/:id?s=签名          照片公开链接（Google 日历活动说明里用）
//   /api/av/:id?v=&s=签名      头像照片
//   /api/cal/<签名>.ics        订阅链接
//   /api/cron/google-pull     资料库排程：从 Google 日历读回变更
//   /api/cron/customer-messages  资料库排程：用 booking number 从通讯录找电话，前一天下午 2 点发 WhatsApp
import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { handleApi } from "./api.mts";
import { handleFeed } from "./calendar-feed.mts";
import { handlePhotoLink } from "./photo-link.mts";
import { handleAvatarLink } from "./avatar-link.mts";
import { getSettings } from "./lib/settings.mts";
import { pullAll, mainUrl, syncEvent, deletePhotoData } from "./lib/gcal.mts";
import * as db from "./lib/db.mts";
import { calLabels } from "./lib/dashboard.mts";
import { saveBackup } from "./lib/backup.mts";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // 登录用 Authorization 标头（不用 cookie），所以可以开放
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-lang, x-cal, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

/** 每个人的生日：补上今年和明年的生日行程，并同步到 Google */
async function birthdays() {
  try {
    const tz = (await getSettings()).timezone || "Asia/Kuala_Lumpur";
    const cals = await db.listAllCalendars();
    const label = (cid: number) => {
      const l = calLabels(cals.find((c: any) => c.id === cid)).find((x: any) => /生日|birthday/i.test(x.name));
      return l ? { id: l.id, color: l.color } : null;
    };
    for (const id of await db.ensureBirthdays(tz, label)) await syncEvent(id, mainUrl(""));
  } catch (e) { console.error("[生日]", e); }
}

/** 回收站超过 5 天的活动：真的删掉（连照片档案） */
async function purgeTrash() {
  try { for (const k of await db.purgeTrash()) await deletePhotoData(k); } catch (e) { console.error("[回收站]", e); }
}

async function cronAllowed(req: Request) {
  const got = req.headers.get("x-cron-key") || "";
  const { cronKey } = await getSettings();
  return got.length === cronKey.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(cronKey));
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  // 只看 /api 之后的路径（不论前面有没有 /functions/v1）
  const i = url.pathname.indexOf("/api");
  const path = i >= 0 ? url.pathname.slice(i) : url.pathname;
  if (path !== url.pathname) { url.pathname = path; req = new Request(url, req); }

  let res: Response;
  try {
    const seg = path.split("/").filter(Boolean); // ["api", ...]
    if (seg[1] === "p" && seg[2]) res = await handlePhotoLink(req, seg[2]);
    else if (seg[1] === "av" && seg[2]) res = await handleAvatarLink(req, seg[2]);
    else if (seg[1] === "cal" && seg[2]) res = await handleFeed(req, seg[2]);
    else if (seg[1] === "cron" && req.method === "POST") {
      if (!(await cronAllowed(req))) res = new Response("forbidden", { status: 403 });
      else if (seg[2] === "google-pull") { await pullAll(mainUrl("")); await birthdays(); await purgeTrash(); res = Response.json({ ok: true }); }
      else if (seg[2] === "customer-messages") res = Response.json({ ok: true, off: "WhatsApp 提醒已停用" }); // 不再读通讯录、不发 WhatsApp
      else if (seg[2] === "backup") res = Response.json(await saveBackup()); // 每个星期一早上 3 点（马来西亚时间）
      else if (seg[2] === "warm") res = Response.json({ ok: true }); // 每分钟叫醒一次，保存时不用等伺服器启动
      else res = new Response("not found", { status: 404 });
    } else if (seg[0] === "api") res = await handleApi(req);
    else res = Response.json({ ok: true, app: "shared-calendar" }); // 健康检查
  } catch (err) {
    console.error(err);
    res = Response.json({ error: String((err as any)?.message || err) }, { status: 500 });
  }
  const out = new Response(res.body, res); // 复制一份，标头才能修改
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}

if (import.meta.main) Deno.serve(handle);
