// 同步到 Google 日历（单向：本 App → Google 日历）。不使用 Google Drive。
// 每个人用自己的帐号连接「自己填的 Gmail」：App 在那个 Gmail 的 Google 日历里建立「共享日历」，之后自动更新。
// 每个行程：标题、时间、颜色、成员、备注、所有留言（谁、什么时候），照片以「看照片」链接列出
// （Google 日历不能直接显示图片），前一天 12:00 由 Google 日历通知。
import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import * as db from "./db.mts";
import { env, apiBase, appUrl } from "./env.mts";
import { deletePhotoData } from "./photos.mts";
import { getSettings, sign, verify, photoSignature, type Settings } from "./settings.mts";
import { reminderAt, wallToUtc } from "./time.mts";
import { desc, normLang, LOCALES, type Lang } from "./i18n.mts";

const API = env("GOOGLE_API_BASE") || "https://www.googleapis.com";        // 本地测试可改
const TOKEN_URL = env("GOOGLE_TOKEN_URL") || "https://oauth2.googleapis.com/token";
const AUTH_URL = env("GOOGLE_AUTH_URL") || "https://accounts.google.com/o/oauth2/v2/auth";
// Schedule Mode：多要「只读通讯录」，用 booking number 找客户电话
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/contacts.readonly"];
const PEOPLE_API = env("GOOGLE_PEOPLE_API_BASE") || "https://people.googleapis.com";
type Link = { user_id: number; gmail: string; refresh_token: string; calendar_id: string };

export function clientCredentials() {
  const id = env("GOOGLE_CLIENT_ID"), secret = env("GOOGLE_CLIENT_SECRET");
  return id && secret ? { id, secret } : null;
}
// 网页（App）网址：APP_URL（GitHub Pages）；后端网址：apiBase()（Supabase 函数，/api/... 都在它下面）
export const mainUrl = (siteUrl: string) => (appUrl() || siteUrl).replace(/\/$/, "");
export const redirectUri = (_siteUrl?: string) => `${apiBase()}/api/google/callback`;
const b64 = (s: string) => Buffer.from(s).toString("base64url");

// ---------- 连接自己的 Gmail ----------
export async function authUrl(siteUrl: string, userId: number, gmail: string) {
  const c = clientCredentials();
  if (!c) throw new Error("App 还没设定 Google 登录（Supabase 函数密钥 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）");
  const g = gmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g)) throw new Error("请输入正确的 Gmail 地址");
  const ts = String(Date.now());
  const state = `${ts}.${userId}.${b64(g)}.${await sign(`oauth:${ts}:${userId}:${g}`)}`;
  const u = new URL(AUTH_URL);
  u.search = new URLSearchParams({
    client_id: c.id, redirect_uri: redirectUri(siteUrl), response_type: "code", scope: SCOPES.join(" "),
    access_type: "offline", prompt: "consent", login_hint: g, state,
  }).toString();
  return u.toString();
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.error === "invalid_grant") throw new Error("Google 授权已失效，请到「设置」重新连接 Google 日历");
    throw new Error(`Google 登录失败：${data.error_description || data.error || res.status}`);
  }
  return data;
}

/** Google 授权完成后回到这里。只接受用户填的那个 Gmail。 */
export async function handleCallback(url: URL) {
  const err = url.searchParams.get("error");
  if (err) throw new Error(err === "access_denied" ? "你取消了 Google 授权" : `Google 授权失败：${err}`);
  const [ts, uid, g64, sig] = (url.searchParams.get("state") || "").split(".");
  const userId = Number(uid);
  const gmail = g64 ? Buffer.from(g64, "base64url").toString() : "";
  if (!ts || !userId || !(await verify(`oauth:${ts}:${userId}:${gmail}`, sig || "")) || Date.now() - Number(ts) > 15 * 60_000)
    throw new Error("连接已过期，请重新按「连接 Google 日历」");
  const c = clientCredentials();
  if (!c) throw new Error("App 还没设定 Google 登录");
  const tok = await tokenRequest({
    code: url.searchParams.get("code") || "", client_id: c.id, client_secret: c.secret,
    redirect_uri: redirectUri(), grant_type: "authorization_code",
  });
  let chosen = "";
  try { chosen = String(JSON.parse(Buffer.from(String(tok.id_token).split(".")[1], "base64url").toString()).email || "").toLowerCase(); } catch {}
  if (chosen !== gmail) {
    if (tok.access_token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tok.access_token)}`, { method: "POST" }).catch(() => {});
    throw new Error(`你选了 ${chosen || "另一个帐号"}，但你填的是 ${gmail}。请重新连接，并在 Google 画面选择 ${gmail}`);
  }
  if (!tok.refresh_token) throw new Error("Google 没有给长期授权，请到 myaccount.google.com/permissions 移除本 App 后再连接一次");
  if (!String(tok.scope || "").includes("auth/calendar")) throw new Error("请在 Google 授权画面勾选「日历」权限");

  const { timezone } = await getSettings();
  const old = await db.getGoogleLink(userId);
  const link: Link = { user_id: userId, gmail, refresh_token: tok.refresh_token, calendar_id: old?.gmail === gmail ? old.calendar_id : "" };
  tokenCache.set(link.refresh_token, { token: tok.access_token, exp: Date.now() + (tok.expires_in ?? 3600) * 1000 });
  const lang = normLang((await db.getUser(userId))?.lang);
  // 直接同步这个 Gmail 的主日历（日历 ID = Gmail），不另外建立新日历
  if (!link.calendar_id || !(await calendarExists(link))) link.calendar_id = gmail;
  if (old?.gmail !== gmail || old?.calendar_id !== link.calendar_id) await db.clearEventGoogle(userId); // 新日历 → 全部重新同步
  await db.saveGoogleLink(link);
  // 新连接：默认和自己的 App 日历同步
  const saved: any = await db.getGoogleLink(userId);
  if (saved && saved.app_calendar_id == null) {
    const mine: any[] = await db.listMyCalendars(userId);
    const own = mine.find((c) => c.role === "owner") || mine[0];
    if (own) await db.setGoogleAppCalendar(userId, own.id);
  }
  if (!old || old.calendar_id !== link.calendar_id) await db.switchGoogleCalendar(userId, link.calendar_id, link.calendar_id === gmail ? gmail : desc(lang, "calendar"));
  return link;
}

const tokenCache = new Map<string, { token: string; exp: number }>();
async function accessToken(l: Link) {
  const hit = tokenCache.get(l.refresh_token);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const c = clientCredentials();
  if (!c) throw new Error("App 还没设定 Google 登录");
  const tok = await tokenRequest({ refresh_token: l.refresh_token, client_id: c.id, client_secret: c.secret, grant_type: "refresh_token" });
  tokenCache.set(l.refresh_token, { token: tok.access_token, exp: Date.now() + (tok.expires_in ?? 3600) * 1000 });
  return tok.access_token as string;
}
async function gfetch(l: Link, path: string, init: RequestInit = {}) {
  const token = await accessToken(l);
  return fetch(`${API}/calendar/v3${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}
async function gerror(res: Response) {
  const data: any = await res.json().catch(() => ({}));
  const msg = data?.error?.message || res.statusText;
  if (res.status === 401) return "Google 授权已失效，请到「设置」重新连接 Google 日历";
  if (res.status === 404) return `Google 日历上找不到（${msg}）`;
  return `Google 日历错误 ${res.status}：${msg}`;
}
async function calendarExists(l: Link) {
  return (await gfetch(l, `/calendars/${encodeURIComponent(l.calendar_id)}`)).ok;
}
async function createCalendar(l: Link, tz: string, lang: Lang) {
  const res = await gfetch(l, "/calendars", { method: "POST", body: JSON.stringify({ summary: desc(lang, "calendar"), timeZone: tz, description: desc(lang, "calDesc") }) });
  if (!res.ok) throw new Error(await gerror(res));
  return ((await res.json()) as any).id as string;
}

/** 读取这个 Gmail 的通讯录（只读）：每个联络人的名字和第一个电话 */
export async function fetchContacts(l: Link) {
  const token = await accessToken(l);
  const out: { name: string; phone: string }[] = [];
  let pageToken = "";
  do {
    const q = new URLSearchParams({ personFields: "names,phoneNumbers", pageSize: "1000", sortOrder: "LAST_MODIFIED_DESCENDING" });
    if (pageToken) q.set("pageToken", pageToken);
    const res = await fetch(`${PEOPLE_API}/v1/people/me/connections?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 403 || res.status === 401) throw new Error("没有读取通讯录的权限，请到「设置」重新连接 Google，并允许「查看联络人」");
    if (!res.ok) throw new Error(`Google 通讯录错误 ${res.status}`);
    const data: any = await res.json();
    for (const p of data.connections || []) {
      const name = p.names?.[0]?.displayName || "";
      const phone = p.phoneNumbers?.[0]?.value || "";
      if (name && phone) out.push({ name, phone });
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return out;
}

/** 取消连接：撤销授权（Google 日历上已同步的内容会保留） */
export async function disconnect(userId: number) {
  const l = await db.getGoogleLink(userId);
  if (l) {
    await stopWatch(l as any);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(l.refresh_token)}`, { method: "POST" }).catch(() => {});
    tokenCache.delete(l.refresh_token);
  }
  await db.deleteGoogleLink(userId);
}

// ---------- 活动内容（Google 同步和订阅链接共用） ----------
export const fmtShort = (iso: string, tz: string, lang: Lang = "en") =>
  new Date(iso).toLocaleString(LOCALES[lang], { timeZone: tz, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
export const dateOnly = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
export function addDays(ymd: string, n: number) {
  const d = new Date(ymd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

/** 活动说明：成员、备注、每则留言（谁、什么时候）、照片链接。html=false 时输出纯文字（订阅链接用） */
export async function eventDescription(e: any, siteUrl: string, tz: string, html = true, lang: Lang = "en") {
  const link = (url: string, text: string) => (html ? `<a href="${url}">${text}</a>` : `${text}: ${url}`);
  const L = (k: string) => desc(lang, k);
  const feed = await db.eventFeed(e.id);
  const lines: string[] = [];
  if (e.member_name) lines.push(`👤 ${e.member_name}`);
  if (e.notes) lines.push(e.notes);
  const posts = feed.filter((f: any) => f.type !== "log");
  if (posts.length) {
    lines.push("", L("posts"));
    for (const f of posts as any[]) {
      const who = `${f.author || L("anon")} (${fmtShort(f.created_at, tz, lang)})`;
      if (f.type === "comment") lines.push(`• ${who}: ${f.body}`);
      else {
        const url = `${apiBase()}/api/p/${f.id}?s=${await photoSignature(f.id)}`;
        lines.push(`• ${who} ${L("uploaded")}${f.caption ? ": " + f.caption : ""} → ${link(url, L("view"))}`);
        if (f.comment_count) for (const c of await db.listComments({ photo_id: f.id })) lines.push(`    ↳ ${c.author || L("anon")} (${fmtShort(c.created_at, tz, lang)}): ${c.body}`);
      }
    }
  }
  lines.push("", link(`${siteUrl}/#event-${e.id}`, L("open")));
  return lines.join("\n");
}

async function buildGoogleEvent(e: any, siteUrl: string, s: Settings, lang: Lang) {
  const tz = s.timezone;
  const timing = e.all_day
    ? (() => {
        const sd = dateOnly(e.start, tz), ed = e.end ? dateOnly(e.end, tz) : sd;
        // 更新（PATCH）时要清掉另一种格式，否则「全天 ↔ 有时间」切换会同时有 date 和 dateTime → Google 400
        return { start: { date: sd, dateTime: null, timeZone: null }, end: { date: addDays(ed, 1), dateTime: null, timeZone: null } }; // Google 全天活动的结束日不含当天
      })()
    : { start: { dateTime: e.start, timeZone: tz, date: null }, end: { dateTime: e.end || new Date(new Date(e.start).getTime() + 3600_000).toISOString(), timeZone: tz, date: null } };
  const reminders: any = { useDefault: false, overrides: [] };
  if (e.remind) { // 前一天 12:00
    const minutes = e.all_day ? 12 * 60 : Math.round((new Date(e.start).getTime() - reminderAt(e.start, tz).getTime()) / 60000);
    if (minutes > 0 && minutes <= 40320) reminders.overrides.push({ method: "popup", minutes });
  }
  return {
    summary: e.title,
    description: await eventDescription(e, siteUrl, tz, true, lang),
    ...timing,
    ...(e.label ? { colorId: e.label } : {}),
    reminders,
    extendedProperties: { private: { familyCalendarId: String(e.id) } },
    source: { title: desc(lang, "calendar"), url: `${siteUrl}/#event-${e.id}` },
    status: "confirmed",
  };
}

/** 每个人、每个行程用固定的活动 ID（只用 0-9 a-v），同时多次同步也不会重复建立 */
function googleIdFor(eventId: number, userId: number, secret: string) {
  return `fc${crypto.createHash("sha256").update(`${secret}:${userId}`).digest("hex").slice(0, 10)}e${eventId}`;
}

async function syncOne(l: Link, e: any, body: any, s: Settings) {
  const prev = await db.getEventGoogle(e.id, l.user_id);
  const gid = prev?.google_event_id || googleIdFor(e.id, l.user_id, s.secret);
  try {
    const json = JSON.stringify({ ...body, id: gid });
    // 更新时不送 status：送 "confirmed" 会把在 Google 上删掉的活动又救回来
    const { status: _status, ...patchBody } = body;
    const patchJson = JSON.stringify(patchBody);
    const calId = prev?.calendar_id || l.calendar_id; // 已有的 → 在它原本的日历更新；新的 → 主日历
    const cal = encodeURIComponent(calId);
    // PATCH：只改 App 管的栏位，保留 Google 上其他资料（邀请的人、视讯会议、附件…）
    const put = () => gfetch(l, `/calendars/${cal}/events/${encodeURIComponent(gid)}`, { method: "PATCH", body: patchJson });
    let res = await put();                                   // 已存在 → 更新
    if (res.status === 404 || res.status === 410) {
      res = await gfetch(l, `/calendars/${cal}/events`, { method: "POST", body: json }); // 不存在 → 建立
      if (res.status === 409) res = await put();             // 别的同步刚建立了 → 改成更新
    }
    if (!res.ok) throw new Error(await gerror(res));
    const saved: any = await res.json().catch(() => ({}));
    if (saved.status === "cancelled") {
      // 这个人已经在 Google 删掉了 → App 也删掉（和其他人 Google 里的副本）
      const others = (await db.listEventGoogle(e.id)).filter((m: any) => m.user_id !== l.user_id);
      const photos = await db.listPhotos(e.id);
      if (await db.deleteEvent(e.id)) {
        for (const p of photos) await deletePhotoData(p.blob_key);
        await deleteGoogleEvents(others as any);
      }
      return { ok: true, deleted: true };
    }
    // 记住我们写入的版本：之后从 Google 读回时，看到同一个版本就知道是自己写的，不会当成别人修改
    await db.setEventGoogle(e.id, l.user_id, { google_event_id: gid, calendar_id: calId, etag: saved.etag ?? null });
    return { ok: true };
  } catch (err: any) {
    const error = String(err?.message || err);
    await db.setEventGoogle(e.id, l.user_id, { google_event_id: gid, error }).catch(() => {});
    console.error(`[Google 日历] 行程 #${e.id} → ${l.gmail} 同步失败：${error}`);
    return { ok: false, error };
  }
}

// Schedule Mode：只从 Google 日历读进来，绝不写回 Google（新增、修改、删除都不会改到 Google 日历）
export const WRITE_TO_GOOGLE = false;

/** 把一个行程写入/更新到每个已连接的人的 Google 日历（onlyUserId：只同步某个人） */
export async function syncEvent(eventId: number, siteUrl: string, onlyUserId?: number, exceptUserId?: number) {
  if (!WRITE_TO_GOOGLE) return { skipped: true };
  const e = await db.getEvent(eventId);
  if (!e) return { skipped: true };
  // 只同步到「选了这个 App 日历」的人的 Google 日历
  const links = (await db.listGoogleLinks()).filter((l: any) => (!onlyUserId || l.user_id === onlyUserId) && l.user_id !== exceptUserId
    && l.app_calendar_id != null && l.app_calendar_id === e.calendar_id);
  if (!links.length) return { skipped: true };
  const s = await getSettings();
  // 每个人的 Google 日历用他自己的语言写说明
  const bodies = new Map<Lang, any>();
  const results = await Promise.all(links.map(async (l: any) => {
    const lang = normLang((await db.getUser(l.user_id))?.lang);
    if (!bodies.has(lang)) bodies.set(lang, await buildGoogleEvent(e, siteUrl, s, lang));
    return syncOne(l, e, bodies.get(lang), s);
  }));
  const failed = results.filter((r) => !r.ok) as any[];
  return failed.length ? { ok: false, error: failed[0].error } : { ok: true };
}

/** 行程被删除前先取对应，删除后再删掉每个人 Google 日历上的那一笔 */
export async function deleteGoogleEvents(mappings: { user_id: number; google_event_id: string; calendar_id?: string | null }[]) {
  if (!WRITE_TO_GOOGLE || !mappings.length) return;
  const links = new Map((await db.listGoogleLinks()).map((l: any) => [l.user_id, l]));
  for (const m of mappings) {
    const l: any = links.get(m.user_id);
    if (!l) continue;
    try {
      const res = await gfetch(l, `/calendars/${encodeURIComponent(m.calendar_id || l.calendar_id)}/events/${encodeURIComponent(m.google_event_id)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404 && res.status !== 410) console.error("[Google 日历] 删除失败：", await gerror(res));
    } catch (err) { console.error("[Google 日历] 删除失败：", err); }
  }
}

// ======================= 从 Google 日历读回来 =======================

const LABEL_IDS = new Set(Object.keys(db.LABELS));
/** Google 活动的说明可能是 HTML，转成纯文字 */
function plainText(html: string | undefined) {
  if (!html) return null;
  const t = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (_, href, text) => (text && text !== href ? `${text} ${href}` : href))
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return t.replace(/\n{3,}/g, "\n\n").trim() || null;
}
/** Google 活动 → App 行程的栏位 */
function fromGoogle(ev: any, tz: string, withNotes: boolean) {
  const allDay = !!ev.start?.date;
  let start: string, end: string | null;
  if (allDay) {
    start = wallToUtc(ev.start.date, 0, 0, tz).toISOString();
    const lastDay = addDays(ev.end?.date || ev.start.date, -1); // Google 全天活动的结束日不含当天
    end = lastDay > ev.start.date ? wallToUtc(lastDay, 23, 59, tz).toISOString() : null;
  } else {
    start = new Date(ev.start.dateTime).toISOString();
    end = ev.end?.dateTime ? new Date(ev.end.dateTime).toISOString() : null;
  }
  const out: any = { title: (ev.summary || "(无标题)").slice(0, 300), start, end, all_day: allDay, label: LABEL_IDS.has(String(ev.colorId)) ? String(ev.colorId) : null };
  if (withNotes) {
    const extra = (ev.attachments || []).map((a: any) => `📎 ${a.title || "附件"}: ${a.fileUrl}`);
    const loc = ev.location ? [`📍 ${ev.location}`] : [];
    const notes = [plainText(ev.description), ...loc, ...extra].filter(Boolean).join("\n");
    out.notes = notes ? notes.slice(0, 5000) : null;
  }
  return out;
}

/** 列出这个人 Google 帐号里的日历（让他选要导入哪一个） */
export async function listGoogleCalendars(userId: number) {
  const l = await db.getGoogleLink(userId);
  if (!l) throw new Error("你还没连接 Google 日历");
  const res = await gfetch(l, "/users/me/calendarList?minAccessRole=reader&maxResults=250");
  if (!res.ok) throw new Error(await gerror(res));
  const data: any = await res.json();
  return (data.items || [])
    .filter((c: any) => !String(c.id).includes("#holiday@") && ["owner", "writer"].includes(c.accessRole))
    .map((c: any) => ({ id: c.id, name: c.summaryOverride || c.summary, primary: !!c.primary, current: c.id === l.calendar_id }));
}

/** 改成和另一个 Google 日历双向同步（例如「拍摄」）。之后由 pull 读入它的活动，由 sync-all 写入 App 的活动 */
export async function switchSyncCalendar(userId: number, calendarId: string) {
  const l = await db.getGoogleLink(userId);
  if (!l) throw new Error("你还没连接 Google 日历");
  if (calendarId === l.calendar_id) return { id: calendarId, name: (l as any).calendar_name || calendarId, unchanged: true }; // 已经在同步这个日历
  const res = await gfetch(l, `/users/me/calendarList/${encodeURIComponent(calendarId)}`);
  if (!res.ok) throw new Error(await gerror(res));
  const c: any = await res.json();
  if (!["owner", "writer"].includes(c.accessRole)) throw new Error("这个日历没有修改权限，不能双向同步");
  const name = c.summaryOverride || c.summary || calendarId;
  await stopWatch(l as any);
  await db.switchGoogleCalendar(userId, calendarId, name);
  return { id: calendarId, name };
}


/**
 * 双向同步：读取某人 Google「共享日历」里的变更，写回 App
 * - 在 Google 新增的活动 → 新增到 App
 * - 在 Google 改了标题 / 时间 / 颜色 → 更新 App（备注、留言、照片仍在 App 里改）
 * - 在 Google 删除 → App 里也删除（连同留言、照片），其他人的 Google 日历也会删除
 */
export async function pullFromGoogle(userId: number, siteUrl: string, opts: { minSeconds?: number; deadline?: number } = {}) {
  const minSeconds = opts.minSeconds ?? 60;
  if (minSeconds > 0 && !(await db.claimPull(userId, minSeconds))) return { skipped: true };
  // 同一时间只读一次；正在读的时候收到新通知 → 读完再读一遍
  await db.requestPull(userId);
  if (!(await db.takePullLease(userId))) return { skipped: true, busy: true };
  const deadline = opts.deadline ?? Date.now() + 20_000;
  const total: any = { ok: true, created: 0, updated: 0, deleted: 0, done: false };
  let released = false;
  try {
    for (;;) {
      await db.clearPullAgain(userId);
      const r: any = await pullOnce(userId, siteUrl, deadline);
      if (!r.ok) return r;
      total.created += r.created; total.updated += r.updated; total.deleted += r.deleted; total.done = r.done;
      if (!r.done || Date.now() > deadline) return total; // 还没读完 → 下次继续
      if (await db.releasePullLease(userId)) { released = true; return total; }
    }
  } finally {
    if (!released) await db.releasePullLease(userId, true);
  }
}

// 这个 Gmail「我的日历」里的日历（自己是拥有者；不包括节日、生日、联系人这类特殊日历）
async function ownedCalendars(l: Link) {
  const out: { id: string; name: string; primary: boolean; color?: string | null }[] = [];
  let pageToken = "";
  do {
    const q = new URLSearchParams({ minAccessRole: "owner", maxResults: "250" });
    if (pageToken) q.set("pageToken", pageToken);
    const res = await gfetch(l, `/users/me/calendarList?${q}`);
    if (!res.ok) throw new Error(await gerror(res));
    const data: any = await res.json();
    for (const c of data.items || []) {
      if (c.deleted || String(c.id).includes("#")) continue; // 节日 / 生日 / 联系人 / 周数
      out.push({ id: c.id, name: c.summaryOverride || c.summary || c.id, primary: !!c.primary || c.id === l.calendar_id, color: c.backgroundColor || null });
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  if (!out.some((c) => c.id === l.calendar_id)) out.unshift({ id: l.calendar_id, name: l.gmail, primary: true });
  return out;
}

/** 「设置」里的日历清单（勾选要同步哪些） */
export async function listSyncCalendars(userId: number) {
  const l: any = await db.getGoogleLink(userId);
  if (!l) return [];
  await refreshCalendars(l).catch((e) => console.error(e));
  return (await db.listGoogleCals(userId)).map((c: any) => ({
    id: c.calendar_id, name: c.name || c.calendar_id, enabled: !!c.enabled, primary: c.calendar_id === l.calendar_id,
  })).sort((a: any, b: any) => Number(b.primary) - Number(a.primary) || String(a.name).localeCompare(String(b.name)));
}
// 把 Google 上的日历清单记下来：新日历 → 默认勾选；在 Google 删掉的日历 → 拿掉
async function refreshCalendars(l: any) {
  const cals = await ownedCalendars(l);
  const known = new Map((await db.listGoogleCals(l.user_id)).map((c: any) => [c.calendar_id, c]));
  for (const c of cals) if (!known.has(c.id) || (known.get(c.id) as any).name !== c.name || (known.get(c.id) as any).color !== (c.color ?? null)) await db.upsertGoogleCal(l.user_id, c.id, c.name, c.color ?? null);
  for (const id of known.keys()) if (!cals.some((c) => c.id === id) && id !== l.calendar_id) {
    // 这个日历在 Google 被删掉了 → 从它来的行程也从 App 删掉（以及其他人 Google 里的副本）
    await stopCalWatch(l, known.get(id));
    for (const { event_id } of await db.eventsFromCalendar(l.user_id, id)) {
      const others = (await db.listEventGoogle(event_id)).filter((m: any) => m.user_id !== l.user_id);
      const photos = await db.listPhotos(event_id);
      if (await db.deleteEvent(event_id)) {
        for (const p of photos) await deletePhotoData(p.blob_key);
        await deleteGoogleEvents(others as any);
      }
    }
    await db.removeGoogleCal(l.user_id, id);
  }
  await db.applyCalendarColors(l.user_id); // 没有自己颜色的行程 → 用 Google 日历本身的颜色（和 Google 上看到的一样）
  return db.listGoogleCals(l.user_id);
}

/** 勾选 / 取消勾选某个日历。取消：App 里来自那个日历的行程会从 App 拿掉（Google 上不动） */
export async function setCalendarEnabled(userId: number, calendarId: string, enabled: boolean) {
  const l: any = await db.getGoogleLink(userId);
  if (!l) throw new Error("你还没连接 Google 日历");
  if (calendarId === l.calendar_id && !enabled) throw new Error("主日历一定要同步（App 新增的行程会写进这里）");
  const cal = (await db.listGoogleCals(userId)).find((c: any) => c.calendar_id === calendarId);
  if (!cal) throw new Error("找不到这个日历");
  if (!enabled) {
    await stopCalWatch(l, cal);
    for (const { event_id } of await db.eventsFromCalendar(userId, calendarId)) {
      // 只删 App 里的（和其他人 Google 里的副本）；这个人自己的 Google 日历不动
      const others = (await db.listEventGoogle(event_id)).filter((m: any) => m.user_id !== userId);
      const photos = await db.listPhotos(event_id);
      if (await db.deleteEvent(event_id)) {
        for (const p of photos) await deletePhotoData(p.blob_key);
        await deleteGoogleEvents(others as any);
      }
    }
  }
  await db.setCalEnabled(userId, calendarId, enabled); // 重新勾选 → 下次读取会全部重新读入
  return { ok: true };
}

async function pullOnce(userId: number, siteUrl: string, deadline: number) {
  const l: any = await db.getGoogleLink(userId);
  if (!l?.calendar_id || !l.app_calendar_id) return { ok: false, skipped: true }; // 还没选 App 日历：不读入
  const user = await db.getUser(userId);
  const ctx = {
    l, userId, siteUrl, deadline,
    who: `${user?.name || l.gmail} · Google`,
    settings: await getSettings(),
    created: 0, updated: 0, deleted: 0,
    touched: new Set<number>(),    // 在 Google 修改的 → 推给其他人
    createdIds: new Set<number>(), // 在 Google 新增的 → 推给其他人
  };
  let done = true;
  try {
    const cals = (await refreshCalendars(l)).filter((c: any) => c.enabled);
    for (const cal of cals) {
      if (Date.now() > deadline) { done = false; break; }
      if (!(await pullCalendar(ctx, cal))) { done = false; break; } // 还没读完 → 下次继续
    }
    if (done) await db.setLinkSync(userId, { sync_token: "multi" }); // 旧栏位：标记已读过
    await db.applyCalendarColors(userId); // 刚读进来的行程也用日历颜色
    // 推给其他人的 Google 日历（这个人的 Google 本来就有这一笔，不用再写，否则会重复）
    for (const id of ctx.createdIds) { if (Date.now() > deadline + 8_000) break; await syncEvent(id, siteUrl, undefined, userId); }
    for (const id of ctx.touched) { if (Date.now() > deadline + 8_000) break; await syncEvent(id, siteUrl, undefined, userId); }
    return { ok: true, created: ctx.created, updated: ctx.updated, deleted: ctx.deleted, done };
  } catch (err: any) {
    console.error(`[Google 日历] 从 ${l.gmail} 读取失败：`, err?.message || err);
    return { ok: false, error: String(err?.message || err) };
  }
}

/** 读取一个 Google 日历的变更；读完回传 true（sync_token 以 "p:" 开头 = 第一次完整读取还没读完，记着读到哪一页） */
async function pullCalendar(ctx: any, cal: any) {
  const { l, userId, deadline, who } = ctx;
  const calId: string = cal.calendar_id;
  const tz = ctx.settings.timezone;
  const ownPrefix = googleIdFor(0, userId, ctx.settings.secret).slice(0, -1); // App 写进 Google 的活动 ID 开头
  let pageToken: string | null = cal.sync_token?.startsWith("p:") ? cal.sync_token.slice(2) : null;
  let syncToken: string | null = cal.sync_token?.startsWith("p:") ? null : cal.sync_token;
  for (;;) {
    const q = new URLSearchParams({ maxResults: "250", showDeleted: "true" });
    if (pageToken) q.set("pageToken", pageToken);
    else if (syncToken) q.set("syncToken", syncToken);
    const res = await gfetch(l, `/calendars/${encodeURIComponent(calId)}/events?${q}`);
    if (res.status === 410) { syncToken = null; pageToken = null; await db.setCalSync(userId, calId, null); continue; } // 位置过期 → 全部重读
    if (res.status === 404) return true; // 日历刚被删掉，下次清单会拿掉
    if (!res.ok) throw new Error(await gerror(res));
    const data: any = await res.json();
    for (const ev of data.items || []) {
      const map = await db.findEventGoogle(userId, ev.id, calId);
      if (ev.status === "cancelled") {
        if (map) {
          // 在 Google 删除了 → App 也删除，并删掉其他人 Google 日历里的那一笔
          const others = (await db.listEventGoogle(map.event_id)).filter((m: any) => m.user_id !== userId);
          const photos = await db.listPhotos(map.event_id);
          if (await db.deleteEvent(map.event_id)) {
            for (const p of photos) await deletePhotoData(p.blob_key);
            await deleteGoogleEvents(others as any);
            ctx.touched.delete(map.event_id);
            ctx.createdIds.delete(map.event_id);
            ctx.deleted++;
          }
        }
        continue;
      }
      if (map) {
        if (map.etag && map.etag === ev.etag) continue; // 是我们自己写的版本
        const cur = await db.getEvent(map.event_id);
        if (!cur) continue;
        const g = fromGoogle(ev, tz, false);
        const diff: any = {};
        for (const k of ["title", "start", "end", "label"]) if ((g as any)[k] !== (cur as any)[k] && !(g[k] == null && cur[k] == null)) diff[k] = (g as any)[k];
        if (g.all_day !== !!cur.all_day) diff.all_day = g.all_day;
        await db.setEventGoogle(map.event_id, userId, { google_event_id: ev.id, calendar_id: calId, etag: ev.etag });
        if (Object.keys(diff).length) { await db.updateEvent(map.event_id, diff, who); ctx.touched.add(map.event_id); ctx.updated++; }
        continue;
      }
      // 没有对应：是在 Google 新增的
      const own = ev.extendedProperties?.private?.familyCalendarId;
      if (own && String(ev.id).startsWith(ownPrefix) && (await db.getEvent(Number(own)))) { // 本来就是 App 的行程，只是对应不见了 → 接回去
        await db.setEventGoogle(Number(own), userId, { google_event_id: ev.id, calendar_id: calId, etag: ev.etag });
        continue;
      }
      const e = await db.createEvent({ ...fromGoogle(ev, tz, true), remind: true, calendar_id: l.app_calendar_id }, who); // 放进他选的 App 日历
      await db.setEventGoogle(e.id, userId, { google_event_id: ev.id, calendar_id: calId, etag: ev.etag });
      ctx.createdIds.add(e.id);
      ctx.created++;
    }
    if (data.nextPageToken) {
      pageToken = data.nextPageToken;
      if (Date.now() > deadline) { await db.setCalSync(userId, calId, "p:" + pageToken); return false; } // 下次从这一页继续
      continue;
    }
    if (data.nextSyncToken) await db.setCalSync(userId, calId, data.nextSyncToken);
    return true;
  }
}

/** 自动重试：之前同步到 Google 失败的行程再试一次 */
export async function retryFailedSyncs(siteUrl: string, userId: number | null = null, deadline = Date.now() + 10_000) {
  let fixed = 0;
  for (const m of await db.listFailedSyncs(userId)) {
    if (Date.now() > deadline) break;
    const r: any = await syncEvent(m.event_id, siteUrl, m.user_id).catch(() => null);
    if (r?.ok) fixed++;
  }
  return fixed;
}

/** 排程用：读取所有人的 Google 变更，并重试失败的同步 */
export async function pullAll(siteUrl: string) {
  const deadline = Date.now() + 22_000;
  for (const l of await db.listGoogleLinks()) {
    if (Date.now() > deadline) break;
    await ensureWatch(l.user_id, siteUrl).catch((e) => console.error(e));
    await pullFromGoogle(l.user_id, siteUrl, { minSeconds: 120, deadline });
  }
  await retryFailedSyncs(siteUrl, null, deadline + 5_000).catch((e) => console.error(e));
}

// ---------- 快速同步：Google 推送通知 ----------
// Google 日历有变更时，Google 会马上通知 /api/google/push，App 再去读变更（几秒内同步）。
// 通知频道最长约 30 天，排程会在到期前自动续约。
const WATCH_TTL = 30 * 86400; // 秒
export async function ensureWatch(userId: number, siteUrl: string) {
  const l: any = await db.getGoogleLink(userId);
  if (!l?.calendar_id) return;
  const address = `${apiBase()}/api/google/push`;
  if (!address.startsWith("https://") && !env("GOOGLE_API_BASE")) return; // Google 只通知 https 网址
  if (l.watch_id) await stopWatch({ ...l, onlyLegacy: true }); // 旧版：整个连接只有一个通知
  for (const c of await db.listGoogleCals(userId)) {
    if (!c.enabled) continue;
    if (c.watch_id && c.watch_expires && new Date(c.watch_expires).getTime() > Date.now() + 2 * 86400_000) continue; // 还有效
    await stopCalWatch(l, c);
    const id = crypto.randomUUID();
    const token = `${userId}.${await sign(`watch:${userId}:${id}`)}`;
    const res = await gfetch(l, `/calendars/${encodeURIComponent(c.calendar_id)}/events/watch`, {
      method: "POST", body: JSON.stringify({ id, type: "web_hook", address, token, params: { ttl: String(WATCH_TTL) } }),
    });
    if (!res.ok) { console.error(`[Google 日历] 无法开启推送通知（${c.name}）：`, await gerror(res)); continue; }
    const d: any = await res.json();
    await db.setCalWatch(userId, c.calendar_id, { id, resource: d.resourceId || null, expires: new Date(Number(d.expiration) || Date.now() + WATCH_TTL * 1000) });
  }
}
async function stopCalWatch(l: any, c: any) {
  if (!c?.watch_id || !c?.watch_resource) return;
  await gfetch(l, "/channels/stop", { method: "POST", body: JSON.stringify({ id: c.watch_id, resourceId: c.watch_resource }) }).catch(() => {});
  await db.setCalWatch(l.user_id, c.calendar_id, { id: null, resource: null, expires: null });
}
async function stopWatch(l: any) {
  if (l?.watch_id && l?.watch_resource) {
    await gfetch(l, "/channels/stop", { method: "POST", body: JSON.stringify({ id: l.watch_id, resourceId: l.watch_resource }) }).catch(() => {});
    await db.setWatch(l.user_id, { id: null, resource: null, expires: null });
  }
  if (l?.onlyLegacy) return;
  for (const c of await db.listGoogleCals(l.user_id)) await stopCalWatch(l, c);
}
export async function pushTarget(req: Request) {
  const channel = req.headers.get("x-goog-channel-id") || "";
  const [uid, sig] = (req.headers.get("x-goog-channel-token") || "").split(".");
  const userId = Number(uid);
  if (!userId || !channel || !(await verify(`watch:${userId}:${channel}`, sig || ""))) return null;
  const l: any = await db.getGoogleLink(userId);
  if (!l || (l.watch_id !== channel && !(await db.hasCalWatch(userId, channel)))) return null; // 旧频道
  if (req.headers.get("x-goog-resource-state") === "sync") return null; // 开通时的测试通知
  return userId;
}
