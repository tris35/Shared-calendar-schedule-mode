// 共享日历 API（Supabase Edge Function）：/api/*
// 除了注册、登录和 Google 授权回调，其他都要先登录（个人帐号）。
import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { apiBase, later } from "./lib/env.mts";
import { putPhoto, getPhotoData, deletePhotoData } from "./lib/photos.mts";
import * as db from "./lib/db.mts";
import * as dash from "./lib/dashboard.mts";
import { getSettings, saveSettings, sign } from "./lib/settings.mts";
import { buildBackup } from "./lib/backup.mts";
import { chat, claudeEnabled } from "./lib/claude.mts";
import { syncEvent, deleteGoogleEvents, authUrl, handleCallback, disconnect, clientCredentials, redirectUri, mainUrl, listGoogleCalendars, listSyncCalendars, setCalendarEnabled, switchSyncCalendar, retryFailedSyncs, pullFromGoogle, ensureWatch, pushTarget } from "./lib/gcal.mts";
import { AuthError, signup, login, forgotPassword, resetPassword, currentUser, changePassword, publicUser, isAdmin, canWhatsApp, fixedAdmins, isTopAdmin, topAdminEmails } from "./lib/auth.mts";
import { waConfig, sendCustomerMessage, sendTimeFor, waUsage, buildDigest, sendHourOf, isPreview, fillText, DEFAULT_SEND_HOUR, sendTest, normPhone } from "./lib/whatsapp.mts";
import { autoFillUpcoming, scheduleOverview, refreshContacts, DEFAULT_TEXT } from "./lib/schedule.mts";
import { tr, langFrom, normLang, LANG_CODES, desc } from "./lib/i18n.mts";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

class HttpError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}
const notFound = (): never => { throw new HttpError(404, "找不到"); };

// 照片空间上限（Supabase 免费方案 1GB）；用到 80%、95% 通知 Top Admin，满了就不能再上传
const photoLimit = () => (Number(Deno.env.get("PHOTO_LIMIT_MB")) > 0 ? Number(Deno.env.get("PHOTO_LIMIT_MB")) : 1024) * 1024 * 1024;
const mb = (b: number) => Math.round(b / 1048576);
async function checkSpace(adding: number) {
  const { bytes } = await db.photoBytes();
  if (bytes + adding > photoLimit()) throw new Error("照片空间已满，请联络管理员");
}
async function warnSpace() {
  const { bytes } = await db.photoBytes(), pct = bytes / photoLimit();
  if (pct < 0.8) return;
  const level = pct >= 0.95 ? 95 : 80;
  const tops = (await db.activeUsers()).filter((u: any) => isTopAdmin(u)).map((u: any) => u.id);
  await db.notify(tops, "storage", `照片空间已用 ${Math.round(pct * 100)}%（${mb(bytes)} MB / ${mb(photoLimit())} MB）`, `storage:${level}`, level === 95 ? 24 : 24 * 7);
}
async function savePhotos(files: File[], eventId: number | null, author: string | null) {
  const out: any[] = [];
  const good = files.filter((f) => f instanceof File && IMAGE_TYPES.has(f.type));
  if (good.some((f) => f.size > MAX_PHOTO_BYTES)) throw new Error("照片太大（上限 4MB）");
  if (good.length) await checkSpace(good.reduce((n, f) => n + f.size, 0));
  for (const f of good) {
    const key = crypto.randomUUID();
    const buf = await f.arrayBuffer();
    await putPhoto(key, buf, f.type);
    out.push({ ...(await db.addPhoto({ event_id: eventId, blob_key: key, mime: f.type, author, size: buf.byteLength })), _buf: buf });
  }
  if (good.length) later(warnSpace());
  return out;
}
const strip = (rows: any[]) => rows.map(({ _buf, blob_key, ...p }) => p);

export async function handleApi(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // 一律用主网址（照片链接、Google 日历里的链接都不会指向会过期/私人的测试网址）
  const siteUrl = mainUrl(url.origin);
  const method = req.method.toUpperCase();
  const seg = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const id = Number(seg[1]);
  const body = async () => (await req.json().catch(() => ({}))) as any;
  let lang = langFrom(req);
  // 资料改动后，在背景同步每个人的 Google 日历（不拖慢回应）
  const sync = (eventId: number | null | undefined) => { if (eventId) later(syncEvent(eventId, siteUrl)); };

  try {
    // ---------- 不用登录的 ----------
    if (seg[0] === "auth" && method === "POST") {
      if (seg[1] === "signup") return Response.json(await signup(await body()));
      if (seg[1] === "login") {
        const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
        return Response.json(await login(await body(), ip));
      }
      if (seg[1] === "forgot") return Response.json(await forgotPassword(await body(), lang));
      if (seg[1] === "reset") return Response.json(await resetPassword(await body()));
    }
    // Google 推送通知：Google 日历有变更 → 马上读回 App
    if (seg[0] === "google" && seg[1] === "push" && method === "POST") {
      const userId = await pushTarget(req);
      if (userId) later(pullFromGoogle(userId, siteUrl, { minSeconds: 0 }));
      return new Response(null, { status: 204 });
    }
    // Google 授权完成后跳回这里（浏览器直接打开；用签名的 state 验证是谁）
    if (seg[0] === "google" && seg[1] === "callback") {
      try {
        const link = await handleCallback(url);
        later((async () => {
          await ensureWatch(link.user_id, siteUrl).catch((e) => console.error(e));
          const l2: any = await db.getGoogleLink(link.user_id);
          for (const e of await db.listEvents({ from: new Date(Date.now() - 60 * 86400000).toISOString(), calendarId: l2?.app_calendar_id ?? -1 })) await syncEvent(e.id, siteUrl, link.user_id);
        })());
        return Response.redirect(`${mainUrl(siteUrl)}/?google=ok&email=${encodeURIComponent(link.gmail)}#settings`, 302);
      } catch (err: any) {
        // 用连接者自己的语言显示错误
        const uid = Number((url.searchParams.get("state") || "").split(".")[1]);
        const u = uid ? await db.getUser(uid).catch(() => null) : null;
        const msg = tr(String(err?.message || err), normLang(u?.lang));
        return Response.redirect(`${mainUrl(siteUrl)}/?google_error=${encodeURIComponent(msg)}#settings`, 302);
      }
    }

    // ---------- 以下都要登录 ----------
    const me = await currentUser(req, url);
    await getSettings(); // 载入在 App 里加的管理员
    const who = me.name;
    const r = seg[0];
    if (!req.headers.get("x-lang")) lang = normLang(me.lang);
    // ---------- 现在用的日历（每个帐号自己的 + 被邀请的） ----------
    const myCals: any[] = await db.listMyCalendars(me.id);
    const wantCal = Number(req.headers.get("x-cal") || url.searchParams.get("cal") || 0);
    // 还没有日历（第一次登录的步骤还没做完）→ 只能用个人资料、建立 / 加入日历、通知
    if (!myCals.length && !["auth", "calendars", "join", "notifications", "admin-request", "settings"].includes(r)) throw new HttpError(409, "请先建立或加入日历");
    const cur: any = myCals.find((c) => c.id === wantCal) || myCals[0] || { id: 0, role: "viewer" };
    const calId: number = cur.id;
    const templates = dash.calTemplates(cur), labelList = dash.calLabels(cur); // 这个日历的模板和标签
    const mustAdmin = () => { if (!isAdmin(me)) throw new HttpError(403, "只有管理员可以设定"); };
    const topIds = async () => (await db.activeUsers()).filter((u: any) => isTopAdmin(u)).map((u: any) => u.id);
    // 把一些 Gmail 拿掉 Top Admin（取消 / 移除管理员 / 移除员工）：至少要留 1 位还在的 Top Admin
    const dropTop = async (emails: string[]) => {
      const left = topAdminEmails().filter((e) => !emails.includes(e));
      const active = new Set((await db.activeUsers()).filter((u: any) => isAdmin(u)).map((u: any) => String(u.email).toLowerCase()));
      if (!left.some((e) => active.has(e))) throw new Error("至少要有一位 Top Admin");
      if (left.length !== topAdminEmails().length) await saveSettings({ topAdmins: left });
    };
    const act = (action: string, title: string | null = null, eventId: number | null = null, cid: number | null = calId || null) => db.logActivity(cid, me.id, action, title, eventId);
    const tzOf = async () => (await getSettings()).timezone || "Asia/Kuala_Lumpur";
    // 生日：在每个日历用名字是「生日」的标签
    const birthdayLabel = (cals: any[]) => (cid: number) => {
      const c = cals.find((x: any) => x.id === cid);
      const l = dash.calLabels(c).find((x: any) => /生日|birthday/i.test(x.name));
      return l ? { id: l.id, color: l.color } : null;
    };
    const refreshBirthdays = async (userId: number) => {
      later(deleteGoogleEvents((await db.deleteFutureBirthdays(userId)) as any));
      for (const eid of await db.ensureBirthdays(await tzOf(), birthdayLabel(await db.listMyCalendars(userId)), userId)) sync(eid);
    };
    const roleIn = (cid: number | null) => myCals.find((c) => c.id === cid)?.role as string | undefined;
    const mustEdit = () => { if (cur.role === "viewer") throw new HttpError(403, "你只能查看这个日历"); };
    // 行程一定要在我有加入的日历里；要修改的话不能是「只能查看」
    const needEvent = async (eid: number, write: boolean) => {
      const e: any = await db.getEvent(eid);
      if (!e || e.deleted_at || !roleIn(e.calendar_id)) notFound();
      if (write && roleIn(e.calendar_id) === "viewer") throw new HttpError(403, "你只能查看这个日历");
      return e;
    };
    // 没有 WhatsApp 权限 → 忽略客户电话 / 讯息 / 自动发送的修改
    const eventInput = async () => {
      const b = await body();
      if (!canWhatsApp(me)) { delete b.customer_phone; delete b.customer_note; delete b.customer_auto; delete b.customer_name; delete b.customer_send_at; }
      return b;
    };
    // 负责人（Person in charge）：选片 / 了解 一定要选；只能选这个日历里的人（包括管理员）
    const resolvePerson = async (b: any, old: any, ticks: any, creating = false) => {
      const tid = ticks ? ticks.template_id : old?.template_id;
      const kind = templates.find((t: any) => t.id === tid)?.kind;
      const has = "person_id" in b;
      const pid = has ? (b.person_id ? Number(b.person_id) : null) : old?.person_id ?? null;
      if (has && pid != null && !(await db.listCalendarPeople(calId)).some((u: any) => u.id === pid)) throw new Error("无效的负责人");
      if ((kind === "photo" || kind === "sales") && pid == null && (creating || has || ticks)) throw new Error("请选择负责人");
      return has ? { person_id: pid } : {};
    };
    const eventDetail = async (eid: number) => {
      // 同时查（不要一个等一个），打开行程更快
      const [e, g, s, feed] = await Promise.all([db.getEvent(eid), db.getEventGoogle(eid, me.id), getSettings(), db.eventFeed(eid)]);
      if (!e) notFound();
      return { ...e, google: g ? { synced_at: g.synced_at, error: g.error } : null, feed,
        customer_send_at: e.start ? sendTimeFor(e, s.timezone, sendHourOf(s)).toISOString() : null, customer_send_custom: !!e.customer_send_at,
        customer_preview: e.customer_note ? fillText(e.customer_note, e, s.timezone) : null,
        customer_error: e.customer_error ? tr(e.customer_error, lang) : null };
    };

    if (r === "auth") {
      if (seg[1] === "me" && method === "GET") {
        const link = await db.getGoogleLink(me.id);
        return Response.json({ ...publicUser(me), google: link ? { gmail: link.gmail, appCalendarId: link.app_calendar_id ?? null, calendarName: link.calendar_name || desc(normLang(me.lang), "calendar") } : null });
      }
      if (seg[1] === "me" && method === "PATCH") {
        const b = await body();
        const out: any = { ...publicUser(me) };
        // 个人资料：名字、emoji、颜色、生日（只有月和日，可以不填）、时区
        const prof: any = {};
        if (b.name !== undefined) {
          const name = String(b.name || "").trim().slice(0, 40);
          if (!name) throw new Error("请输入名字");
          if (name === db.UNKNOWN_USER) throw new Error("请换一个名字");
          prof.name = name;
        }
        if (b.emoji !== undefined) prof.emoji = String(b.emoji || "").trim().slice(0, 16) || null;
        if (b.color !== undefined) {
          if (b.color && !/^#[0-9a-f]{6}$/i.test(String(b.color))) throw new Error("无效的颜色");
          prof.color = b.color ? String(b.color).toLowerCase() : null;
        }
        if (b.birth_month !== undefined || b.birth_day !== undefined) {
          const m = b.birth_month ? Math.floor(Number(b.birth_month)) : null, d = b.birth_day ? Math.floor(Number(b.birth_day)) : null;
          if ((m == null) !== (d == null)) throw new Error("请选择生日的月和日");
          if (m != null && (!(m >= 1 && m <= 12) || !(d! >= 1 && d! <= new Date(Date.UTC(2024, m, 0)).getUTCDate()))) throw new Error("生日日期不正确");
          prof.birth_month = m; prof.birth_day = d;
        }
        if (b.timezone !== undefined) {
          const tz = String(b.timezone || "");
          if (tz) { try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { throw new Error("无效的时区"); } }
          prof.timezone = tz || null;
        }
        if (b.onboarded !== undefined) prof.onboarded = !!b.onboarded;
        if (Object.keys(prof).length) {
          const u2: any = await db.setProfile(me.id, prof);
          Object.assign(out, publicUser({ ...u2, lang: me.lang }));
          if (prof.name) for (const c of myCals) await db.ensureMember(prof.name, c.id);
          // 名字或生日改了 → 以后的生日行程重建（同步到 Google）
          const bdChanged = "birth_month" in prof && (prof.birth_month !== me.birth_month || prof.birth_day !== me.birth_day);
          if (bdChanged || (prof.name && prof.name !== me.name && me.birth_month)) await refreshBirthdays(me.id);
        }
        if (b.lang !== undefined && LANG_CODES.includes(b.lang)) {
          await db.setUserLang(me.id, b.lang);
          out.lang = b.lang;
          // 换语言 → 我的 Google 日历说明也换语言
          const gl: any = await db.getGoogleLink(me.id);
          if (gl) later((async () => {
            for (const e of await db.listEvents({ from: new Date(Date.now() - 60 * 86400000).toISOString(), calendarId: gl.app_calendar_id ?? -1 })) await syncEvent(e.id, siteUrl, me.id);
          })());
        }
        return Response.json(out);
      }
      if (seg[1] === "password" && method === "POST") return Response.json(await changePassword(me, await body()));
    }

    if (r === "config" && method === "GET") {
      const s = await getSettings();
      return Response.json({ admin: isAdmin(me), calendarName: cur.name || "", claude: claudeEnabled(), timezone: s.timezone, labels: db.LABELS, labelNames: cur.label_names || {}, labelList, templates, calendarId: calId, calendarRole: cur.role, waDefault: s.waDefault || s.schedule?.text || DEFAULT_TEXT, waSendHour: sendHourOf(s), waPreviewMode: isPreview(s), googleLoginReady: !!clientCredentials(), whatsapp: !!waConfig(), siteUrl: mainUrl(siteUrl), googleRedirectUri: redirectUri() });
    }

    // ---------- 行程 ----------
    if (r === "events") {
      if (!seg[1]) {
        if (method === "GET") { const qs: any = Object.fromEntries(url.searchParams); return Response.json(await db.listEvents({ from: qs.from, to: qs.to, q: qs.q, calendarId: calId })); }
        if (method === "POST") {
          mustEdit();
          const b = await eventInput();
          const ticks = dash.resolveTicks(b, null, templates, true); // 一定要选模板；选片 / 了解要勾选
          const person = await resolvePerson(b, null, ticks, true);
          dash.applyLabel(b, labelList);
          const e = await db.createEvent({ ...b, calendar_id: calId }, who);
          await db.setEventExtra(e.id, { ...ticks, ...person, ...("label_id" in b ? { label_id: b.label_id } : {}), created_by_id: me.id });
          await act("event_created", e.title, e.id);
          sync(e.id);
          return Response.json(await db.getEvent(e.id));
        }
      }
      if (seg[1]) await needEvent(id, method !== "GET"); // 只能看 / 改自己日历里的行程
      // 清单：列出 / 新增（文字或范本）
      if (seg[2] === "checklist" && method === "GET") return Response.json(await db.listChecklist(id));
      if (seg[2] === "checklist" && method === "POST") {
        if (!(await db.getEvent(id))) notFound();
        const b = await body();
        const items = b.templateId ? ((await db.getTemplate(Number(b.templateId)))?.items || []) : [String(b.text || "")];
        await db.addChecklistItems(id, items);
        return Response.json(await db.listChecklist(id));
      }
      // WhatsApp Schedule：已发送的讯息从清单删掉
      if (seg[2] === "wa-hide" && method === "POST") {
        if (!canWhatsApp(me)) throw new HttpError(403, "没有权限");
        if (!(await db.hideCustomerMessage(id))) throw new HttpError(400, "还没发送的讯息不能删除");
        return Response.json({ ok: true });
      }
      // 任务清单：打勾完成（只在 App 里）
      if (seg[2] === "done" && method === "POST") {
        if (!(await db.setEventDone(id, !!(await body()).done, who))) notFound();
        return Response.json(await db.getEvent(id));
      }
      // 在时间线发文：文字 + 照片（可只有其中一个）
      if (seg[2] === "posts" && method === "POST") {
        if (!(await db.getEvent(id))) notFound();
        const form = await req.formData();
        const text = String(form.get("text") || "").trim();
        const files = form.getAll("photos") as File[];
        if (!text && !files.length) throw new Error("请输入文字或选择照片");
        if (text) await db.addComment({ event_id: id, author: who, body: text });
        await savePhotos(files, id, who);
        sync(id);
        return Response.json(await eventDetail(id));
      }
      if (seg[2] === "sync" && method === "POST") return Response.json(await syncEvent(id, siteUrl, me.id));
      // 立即用 WhatsApp 发讯息给客户
      if (seg[2] === "customer-send" && method === "POST") {
        if (!canWhatsApp(me)) throw new HttpError(403, "只有管理员允许的帐号可以发送 WhatsApp");
        await sendCustomerMessage(id, { force: true, author: who });
        return Response.json(await eventDetail(id));
      }
      if (!seg[2]) {
        if (method === "GET") return Response.json(await eventDetail(id));
        if (method === "PATCH") {
          const b = await eventInput();
          const old: any = await db.getEvent(id);
          if (!old) notFound();
          const ticks = dash.resolveTicks(b, old, templates); // 只有送了模板 / 勾选才检查
          const person = await resolvePerson(b, old, ticks);
          dash.applyLabel(b, labelList);
          const e = await db.updateEvent(id, b, who);
          if (!e) notFound();
          // 从 Google 同步进来的行程没有负责人：第一个在网站里选模板的人就是负责人
          const owner = !old.created_by_id && ticks?.template_id ? { created_by_id: me.id } : {};
          await db.setEventExtra(id, { ...(ticks || {}), ...person, ...("label_id" in b ? { label_id: b.label_id } : {}), ...owner });
          // 选了 / 换了模板 → 最新动态
          if (ticks?.template_id && ticks.template_id !== old.template_id) await act("event_template", `${e.title} → ${templates.find((t: any) => t.id === ticks.template_id)?.name || ""}`, id);
          sync(id);
          return Response.json(await db.getEvent(id));
        }
        if (method === "DELETE") {
          const mappings = await db.listEventGoogle(id);
          const gone: any = await db.getEvent(id);
          const ok = await db.deleteEvent(id, me.id); // 放进回收站（5 天内可以复原；照片 5 天后才删）
          if (ok) {
            await act("event_deleted", gone?.title || null, id);
            later(deleteGoogleEvents(mappings as any));
          }
          return Response.json({ ok });
        }
      }
    }

    // ---------- 照片 ----------
    if (r === "photos") {
      const p = await db.getPhoto(id);
      if (!p) notFound();
      if (p.event_id) await needEvent(p.event_id, method !== "GET");
      if (seg[2] === "file" && method === "GET") {
        const data = await getPhotoData(p.blob_key);
        if (!data) notFound();
        return new Response(data, { headers: { "Content-Type": p.mime, "Cache-Control": "private, max-age=86400" } });
      }
      if (seg[2] === "comments") {
        if (method === "GET") return Response.json(await db.listComments({ photo_id: id }));
        if (method === "POST") { const c = await db.addComment({ photo_id: id, author: who, body: (await body()).body }); sync(p.event_id); return Response.json(c); }
      }
      if (!seg[2] && method === "DELETE") {
        const ok = await db.deletePhoto(id);
        later(deletePhotoData(p.blob_key));
        sync(p.event_id);
        return Response.json({ ok });
      }
    }

    if (r === "comments" && method === "DELETE") {
      const c = await db.getComment(id);
      if (c?.event_id) await needEvent(c.event_id, true);
      const ok = await db.deleteComment(id);
      if (c) sync(c.event_id);
      return Response.json({ ok });
    }

    // ---------- WhatsApp 行程摘要（管理员设定） ----------
    if (r === "digest") {
      if (!isAdmin(me)) throw new HttpError(403, "只有管理员可以设定");
      const cur = (await getSettings()).digest || { mode: "off", hour: 8, phones: [] };
      if (!seg[1] && method === "GET") {
        const want = url.searchParams.get("preview") || (cur.mode === "date" ? cur.date : cur.mode) || ""; // 预览还没保存的选择
        const isDate = /^\d{4}-\d{2}-\d{2}$/.test(want);
        return Response.json({ ...cur, preview: await buildDigest(want === "weekly" ? "weekly" : "daily", new Date(), isDate ? want : undefined) });
      }
      if (!seg[1] && method === "PUT") {
        const b = await body();
        const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || "")) ? String(b.date) : "";
        const mode = date ? "date" : ["off", "daily", "weekly"].includes(b.mode) ? b.mode : "off";
        const hour = Math.min(23, Math.max(0, Math.floor(Number(b.hour) || 8)));
        const phones = String(b.phones ?? "").split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean).slice(0, 20);
        const digest = { mode, hour, phones, date, lastSent: date !== cur.date ? undefined : cur.lastSent };
        await saveSettings({ digest });
        return Response.json({ ...digest, preview: await buildDigest(mode === "weekly" ? "weekly" : "daily", new Date(), date || undefined) });
      }
    }

    // ---------- 清单项目：打勾 / 删除 ----------
    if (r === "checklist" && seg[1]) {
      const itemId = Number(seg[1]);
      const item: any = await db.getChecklistItem(itemId);
      if (!item) notFound();
      await needEvent(item.event_id, true);
      if (method === "PATCH") { const r2 = await db.setChecklistDone(itemId, !!(await body()).done, who); if (!r2) notFound(); return Response.json(await db.listChecklist(r2.event_id)); }
      if (method === "DELETE") { const r2 = await db.deleteChecklistItem(itemId); if (!r2) notFound(); return Response.json(await db.listChecklist(r2.event_id)); }
    }
    // ---------- 清单范本（所有人共用） ----------
    if (r === "templates") {
      if (!seg[1] && method === "GET") return Response.json(await db.listTemplates());
      if (!seg[1] && method === "POST") return Response.json(await db.saveTemplate(await body()));
      if (seg[1] && method === "PUT") { const t2 = await db.saveTemplate({ ...(await body()), id: Number(seg[1]) }); if (!t2) notFound(); return Response.json(t2); }
      if (seg[1] && method === "DELETE") return Response.json({ ok: await db.deleteTemplate(Number(seg[1])) });
    }

    // ---------- Dashboard：所有登录的人都能看；Rate 只有管理员能改 ----------
    if (r === "dashboard") {
      if (!seg[1] && method === "GET") {
        const tz = (await getSettings()).timezone || "Asia/Kuala_Lumpur";
        const [rows, manual, rates, fixedAll] = await Promise.all([db.dashEvents(calId, dash.DASH_START, tz), db.dashManual(calId), db.dashRates(calId), db.getKv("dash_fixed")]);
        // 固定数据（例如 2026 年 10、11 月）：只能在资料库改，App 里没有人能改；那几个月不算行程
        const fixed = ((fixedAll as any) || {})[String(calId)] || {};
        const live = rows.filter((x: any) => !fixed[String(x.date).slice(0, 7)]);
        return Response.json({ ...dash.buildEvents(live, manual, templates), fixed, rates: dash.rateHistory(rates), admin: isAdmin(me), dataStart: dash.DASH_START });
      }
      // 管理员：把活动排除在分析之外 / 加回来（日历和 Google 日历都不变）
      if (seg[1] === "exclude" && method === "PUT") {
        mustAdmin();
        const b = await body();
        const eid = Number(b.id);
        await needEvent(eid, false);
        await db.setDashExcluded(eid, !!b.excluded);
        return Response.json({ ok: true, id: eid, excluded: !!b.excluded });
      }
      if (seg[1] === "rates" && method === "PUT") {
        mustAdmin();
        await db.saveDashRate(calId, dash.cleanRate(await body()), who);
        return Response.json({ rates: dash.rateHistory(await db.dashRates(calId)) });
      }
      if (seg[1] === "rates" && method === "DELETE") {
        mustAdmin();
        const q = url.searchParams;
        if (!(await db.deleteDashRate(calId, String(q.get("brand")), String(q.get("cat")), String(q.get("from"))))) notFound();
        return Response.json({ rates: dash.rateHistory(await db.dashRates(calId)) });
      }
    }
    // ---------- 模板和标签（管理员在 Settings 新增 / 改名 / 删除） ----------
    // 模板：固定 3 个，管理员只能改名字
    if (r === "event-templates" && method === "PUT") {
      mustAdmin();
      const list = dash.renameTemplates(templates, (await body()).templates);
      await db.setCalendarTemplates(calId, list);
      for (const t of list) { const o = templates.find((x: any) => x.id === t.id); if (o && o.name !== t.name) await act("template_renamed", `${o.name} → ${t.name}`); }
      return Response.json({ templates: list });
    }
    // 标签：管理员可以改 / 删；新增行程时每个人都可以按「+」加一个
    if (r === "label-list" && method === "PUT") {
      mustAdmin();
      const list = dash.cleanLabels((await body()).labels);
      await db.setCalendarLabels(calId, list);
      return Response.json({ labelList: list });
    }
    if (r === "label-list" && method === "POST") {
      mustEdit();
      const b = await body();
      const list = dash.cleanLabels([...labelList, { name: b.name, color: b.color, template_id: b.template_id || null }]);
      if (list.length > 60) throw new Error("标签太多了");
      await db.setCalendarLabels(calId, list);
      await act("label_added", list[list.length - 1].name);
      return Response.json({ labelList: list, label: list[list.length - 1] });
    }

    // ---------- 颜色标签的名称（所有人共用） ----------
    if (r === "labels" && seg[1] && method === "PUT") {
      const id = seg[1];
      if (!db.LABELS[id]) notFound();
      mustEdit();
      const name = String((await body()).name ?? "").trim().slice(0, 30);
      const names = { ...(cur.label_names || {}) }; // 每个日历自己的标签名称
      if (name) names[id] = name; else delete names[id];
      await db.setCalendarLabelNames(calId, names);
      return Response.json({ labelNames: names });
    }

    // ---------- 日历：我的日历清单、改名、成员、邀请连结 ----------
    if (r === "calendars") {
      if (!seg[1] && method === "GET") return Response.json({ current: calId, calendars: myCals.map((c) => ({ id: c.id, name: c.name, role: c.role, members: c.member_count })) });
      if (!seg[1] && method === "POST") { // 另外建立一个新日历
        const nid = await db.createCalendar(String((await body()).name || ""), me.id);
        await db.ensureMember(me.name, nid);
        await db.logActivity(nid, me.id, "calendar_created", null, null);
        for (const eid of await db.ensureBirthdays(await tzOf(), birthdayLabel(await db.listMyCalendars(me.id)), me.id)) sync(eid);
        return Response.json({ id: nid });
      }
      const cid = Number(seg[1]);
      const role = roleIn(cid);
      if (!role) notFound();
      const ownerOnly = () => { if (role !== "owner") throw new HttpError(403, "只有日历拥有者可以这样做"); };
      if (!seg[2] && method === "PATCH") { ownerOnly(); await db.renameCalendar(cid, String((await body()).name || "")); return Response.json({ ok: true }); }
      if (seg[2] === "people" && method === "GET") return Response.json((await db.listCalendarPeople(cid)).map((u: any) => ({ ...u, admin: isAdmin(u) })));
      if (seg[2] === "people" && seg[3] && method === "PATCH") {
        ownerOnly();
        const nr = (await body()).role === "viewer" ? "viewer" : "editor";
        return Response.json({ ok: await db.setCalendarRole(cid, Number(seg[3]), nr) });
      }
      if (seg[2] === "people" && seg[3] && method === "DELETE") {
        const uid = Number(seg[3]);
        if (uid !== me.id) ownerOnly(); // 自己可以离开；踢别人要是拥有者
        return Response.json({ ok: await db.removeCalendarMember(cid, uid) });
      }
      // 邀请连结（可以编辑 / 只能查看）：只有管理员可以产生，3 天有效；管理员可以让旧连结全部失效
      if (seg[2] === "invite" && method === "POST") {
        mustAdmin();
        const ir = (await body()).role === "viewer" ? "viewer" : "editor";
        const token = crypto.randomUUID().replace(/-/g, "");
        await db.createInvite(cid, ir, me.id, token);
        return Response.json({ token, role: ir, url: `${mainUrl(siteUrl)}/?join=${token}`, expires_at: new Date(Date.now() + 3 * 86400_000).toISOString() });
      }
      if (seg[2] === "invite" && method === "DELETE") { mustAdmin(); await db.revokeInvites(cid); return Response.json({ ok: true }); }
    }
    // 用邀请连结加入
    if (r === "join") {
      const token = String(seg[1] || (method === "POST" ? (await body()).token : "") || "");
      const inv: any = token ? await db.getInvite(token) : null;
      if (!inv) throw new HttpError(404, "邀请连结无效或已经失效");
      if (method === "GET") return Response.json({ calendar: inv.calendar_name, role: inv.role });
      if (method === "POST") {
        const already = roleIn(inv.calendar_id);
        await db.joinCalendar(inv.calendar_id, me.id, inv.role);
        await db.ensureMember(me.name, inv.calendar_id);
        if (!already) {
          await db.logActivity(inv.calendar_id, me.id, "joined", null, null);
          for (const eid of await db.ensureBirthdays(await tzOf(), birthdayLabel(await db.listMyCalendars(me.id)), me.id)) sync(eid);
        }
        return Response.json({ id: inv.calendar_id, name: inv.calendar_name, role: inv.role });
      }
    }
    // Google 日历要和哪一个 App 日历同步
    if (r === "google" && seg[1] === "app-calendar" && method === "PUT") {
      const cid = Number((await body()).calendarId);
      if (!roleIn(cid)) notFound();
      await db.setGoogleAppCalendar(me.id, cid);
      return Response.json({ ok: true });
    }

    // ---------- 回收站：删除的活动留 5 天，可以复原 ----------
    if (r === "trash") {
      if (!seg[1] && method === "GET") return Response.json({ days: db.TRASH_DAYS, items: await db.listTrash(calId) });
      if (seg[1] && seg[2] === "restore" && method === "POST") {
        mustEdit();
        const e: any = await db.getEvent(id);
        if (!e || e.calendar_id !== calId || !e.deleted_at) notFound();
        await db.restoreEvent(id);
        await act("event_restored", e.title, id);
        sync(id); // Google 上也救回来
        return Response.json({ ok: true, items: await db.listTrash(calId) });
      }
    }
    // 备份：管理员随时下载（events.csv / backup.json）；Top Admin 可以马上寄一次
    if (r === "admin" && seg[1] === "backup") {
      mustAdmin();
      if (seg[2] === "info" && method === "GET") return Response.json({ lastBackup: (await getSettings()).lastBackup || null, saved: (await db.listBackups()).map((x: any) => ({ id: x.id, stamp: x.stamp, at: x.created_at, events: x.counts?.events ?? null })) });
      // 每周存下来的备份：下载其中一份
      if (seg[2] === "saved" && seg[3] && method === "GET") {
        const b: any = await db.getBackup(Number(seg[3]));
        if (!b) notFound();
        const csv = url.searchParams.get("format") === "csv";
        return new Response(csv ? b.csv : b.json, { headers: {
          "Content-Type": csv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="the-legend-${csv ? "events" : "backup"}-${b.stamp}.${csv ? "csv" : "json"}"` } });
      }
      if (!seg[2] && method === "GET") {
        const b = await buildBackup();
        const csv = url.searchParams.get("format") === "csv";
        return new Response(csv ? b.csv : b.json, { headers: {
          "Content-Type": csv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="the-legend-${csv ? "events" : "backup"}-${b.stamp}.${csv ? "csv" : "json"}"` } });
      }
    }
    // 照片空间（管理员看）
    if (r === "admin" && seg[1] === "storage" && method === "GET") {
      mustAdmin();
      const u = await db.photoBytes();
      return Response.json({ bytes: u.bytes, count: u.count, limit: photoLimit() });
    }

    // ---------- 第 2 版：Label & People、申请管理员、通知、最新动态 ----------
    // People：日历里的人（emoji、颜色、名字、生日）；管理员可以移除（离职 → 名字变成「未知用户」，资料保留）
    if (r === "people") {
      if (!seg[1] && method === "GET") return Response.json((await db.listCalendarPeople(calId)).map((u: any) => ({ ...u, admin: isAdmin(u) })));
      if (seg[1] && method === "DELETE") {
        mustAdmin();
        const uid = Number(seg[1]);
        if (uid === me.id) throw new Error("不能移除自己");
        const u: any = await db.getUser(uid);
        if (!u || !(await db.listCalendarPeople(calId)).some((x: any) => x.id === uid)) notFound();
        if (fixedAdmins().includes(String(u.email).toLowerCase())) throw new Error("不能移除第一批管理员");
        await dropTop([String(u.email).toLowerCase()]);
        // 停止他的 Google 同步（Google 日历上的内容不动）；以后的生日行程删掉
        await disconnect(uid).catch((e) => console.error(e));
        later(deleteGoogleEvents((await db.deleteFutureBirthdays(uid)) as any));
        const extra = ((await getSettings()).adminEmails || []).filter((x) => x !== String(u.email).toLowerCase());
        await saveSettings({ adminEmails: extra });
        await db.removeUser(uid);
        await act("person_removed", u.name);
        return Response.json({ ok: true });
      }
    }
    // 员工申请成为管理员（要先注册、登录）→ 通知所有管理员
    if (r === "admin-request") {
      if (method === "GET") return Response.json({ admin: isAdmin(me), request: await db.myAdminRequest(me.id) });
      if (method === "POST") {
        if (isAdmin(me)) return Response.json({ admin: true });
        const rid = await db.createAdminRequest(me.id);
        if (rid) await db.notify(await topIds(), "admin_request", `${me.name}（${me.email}）申请成为管理员`, `admin_request:${rid}`);
        return Response.json({ admin: false, request: await db.myAdminRequest(me.id) });
      }
    }
    // 通知（弹出 + 声音）
    if (r === "notifications") {
      if (method === "GET") { const items = await db.listNotifications(me.id); return Response.json({ items, unread: items.filter((x: any) => !x.read_at).length }); }
      if (seg[1] === "read" && method === "POST") { await db.readNotifications(me.id, Number((await body()).upTo) || 0); return Response.json({ ok: true }); }
    }
    // 最新动态（所有人）
    if (r === "activity" && seg[1] === "unread" && method === "GET") return Response.json({ unread: await db.activityUnread(me.id, myCals.map((c) => c.id)) });
    if (r === "activity" && seg[1] === "seen" && method === "POST") { await db.setActivitySeen(me.id, Math.floor(Number((await body()).upTo) || 0)); return Response.json({ ok: true }); }
    if (r === "activity" && !seg[1] && method === "GET") {
      const before = Number(url.searchParams.get("before")) || null;
      return Response.json(await db.listActivity(myCals.map((c) => c.id), before));
    }

    // ---------- 成员 ----------
    if (r === "members") {
      if (!seg[1]) {
        if (method === "GET") return Response.json(await db.listMembers(calId));
        if (method === "POST") { mustEdit(); return Response.json(await db.createMember(await body(), calId)); }
      }
      const mem: any = await db.getMember(id);
      if (!mem || mem.calendar_id !== calId) notFound();
      mustEdit();
      if (method === "PATCH") { const m = await db.updateMember(id, await body()); if (!m) notFound(); return Response.json(m); }
      if (method === "DELETE") return Response.json({ ok: await db.deleteMember(id) });
    }

    // ---------- 我的 Google 日历 ----------
    if (r === "google") {
      if (seg[1] === "connect" && method === "POST") return Response.json({ url: await authUrl(siteUrl, me.id, String((await body()).gmail || me.email)) });
      if (seg[1] === "disconnect" && method === "POST") { await disconnect(me.id); return Response.json({ ok: true }); }
      // 我的 Google「我的日历」清单，和每个日历是否同步（勾选）
      if (seg[1] === "calendars" && !seg[2] && method === "GET") return Response.json(await listSyncCalendars(me.id));
      if (seg[1] === "calendars" && seg[2] && method === "PUT") {
        const r = await setCalendarEnabled(me.id, decodeURIComponent(seg[2]), !!(await body()).enabled);
        later(ensureWatch(me.id, siteUrl));
        return Response.json(r);
      }
      // 改成和另一个 Google 日历双向同步（例如「拍摄」）
      if (seg[1] === "sync-calendar" && method === "POST") {
        const r = await switchSyncCalendar(me.id, String((await body()).calendarId || ""));
        later(ensureWatch(me.id, siteUrl));
        return Response.json(r);
      }
      // 从我的 Google「共享日历」读回变更（打开 App 时会呼叫；1 分钟内只读一次）
      if (seg[1] === "pull" && method === "POST") {
        if (!(await db.getGoogleLink(me.id))) return Response.json({ skipped: true });
        const force = !!(await body()).force; // 切换日历后的第一次完整读取：网页会连续呼叫直到 done
        later(ensureWatch(me.id, siteUrl)); // 确保 Google 有变更会马上通知（已开通就不做事）
        later(retryFailedSyncs(siteUrl, me.id)); // 之前同步失败的行程自动再试
        return Response.json(await pullFromGoogle(me.id, siteUrl, { minSeconds: force ? 0 : 15 }));
      }
      if (seg[1] === "sync-all" && method === "POST") {
        if (!(await db.getGoogleLink(me.id))) throw new Error("你还没连接 Google 日历");
        // 同步最近 60 天到未来 1 年的行程（每次最多约 45 秒，没做完可再按一次）
        const from = new Date(Date.now() - 60 * 86400000).toISOString(), to = new Date(Date.now() + 365 * 86400000).toISOString();
        const gl2: any = await db.getGoogleLink(me.id);
        const events = await db.listEvents({ from, to, calendarId: gl2?.app_calendar_id ?? -1 });
        const deadline = Date.now() + 45_000;
        let ok = 0, failed = 0, lastError = "";
        for (const e of events) {
          if (Date.now() > deadline) break;
          // 只补上 Google 还没有的（已经同步好的不重写，避免改掉 Google 上的资料）
          const m: any = await db.getEventGoogle(e.id, me.id);
          if (m && !m.error) { ok++; continue; }
          const res: any = await syncEvent(e.id, siteUrl, me.id);
          if (res.ok) ok++; else if (!res.skipped) { failed++; lastError = res.error; }
        }
        return Response.json({ total: events.length, ok, failed, lastError, done: ok + failed >= events.length });
      }
    }

    // ---------- WhatsApp 提醒（每个人都可以设定）：前一天几点发 + 讯息（所有行程一样） ----------
    if (r === "schedule") {
      const s = await getSettings();
      const sc: any = { ...(s.schedule || {}) };
      if (!seg[1] && method === "GET") return Response.json({ sendHour: sendHourOf(s), text: sc.text || DEFAULT_TEXT, whatsapp: !!waConfig(), weeklyAt: sc.weeklyAt || null });
      if (!seg[1] && method === "PUT") {
        mustEdit();
        const b = await body();
        if (b.sendHour !== undefined) {
          const h = Math.floor(Number(b.sendHour));
          sc.sendHour = h >= 0 && h <= 23 ? h : DEFAULT_SEND_HOUR;
        }
        if (b.text !== undefined) {
          const text = String(b.text || "").trim().slice(0, 1000);
          if (!text) throw new Error("请填写讯息");
          sc.text = text;
          await db.updateAutoNotes(text);
        }
        await saveSettings({ schedule: sc });
        return Response.json({ ok: true });
      }
      // 测试发送：现在的讯息发到这个电话
      if (seg[1] === "test" && method === "POST") {
        mustEdit();
        return Response.json(await sendTest(String((await body()).phone || ""), sc.text || DEFAULT_TEXT));
      }
      // 立即检查通讯录（不用等排程）
      if (seg[1] === "refresh" && method === "POST") { await refreshContacts(true); return Response.json(await autoFillUpcoming()); }
      // 找不到电话的行程（只看我能看到的日历）
      if (seg[1] === "list" && method === "GET") {
        const mine = new Set(myCals.map((c) => c.id));
        const items = await scheduleOverview((e, tz) => sendTimeFor(e, tz, sendHourOf(s)));
        // 每个客户要收到的讯息（已经换好名字、日期、时间、编号）→ 网页用 WhatsApp 按钮直接发
        const text = sc.text || DEFAULT_TEXT;
        return Response.json(items.filter((x: any) => mine.has(x.calendar_id)).map((x: any) => ({
          ...x, message: fillText(text, { title: x.title, start: x.start, all_day: x.all_day, customer_name: x.name }, s.timezone) })));
      }
      // 员工在这里输入电话（任何国家；空 = 清掉）
      if (seg[1] === "phone" && method === "POST") {
        mustEdit();
        const b = await body();
        await needEvent(Number(b.id), true);
        const raw = String(b.phone || "").trim();
        const phone = raw ? normPhone(raw, (Deno.env.get("WHATSAPP_COUNTRY_CODE") || "60").replace(/\D/g, "")) : "";
        if (raw && !phone) throw new Error("电话号码不正确");
        await db.setTypedPhone(Number(b.id), phone || null, sc.text || DEFAULT_TEXT);
        return Response.json({ ok: true, phone });
      }
    }

    // WhatsApp 这个月用了几则（所有人都看得到）
    if (r === "whatsapp" && seg[1] === "usage" && method === "GET") return Response.json(await waUsage());

    // ---------- 管理员：谁可以发 WhatsApp ----------
    if (r === "admin") {
      if (!isAdmin(me)) throw new HttpError(403, "只有管理员可以设定");
      // 给客户的讯息：自己写的开头 / 结尾
      // 新行程「给客户的讯息」的默认内容
      if (seg[1] === "wa-text" && method === "GET") return Response.json({ text: (await getSettings()).waDefault || "" });
      if (seg[1] === "wa-text" && method === "PUT") {
        await saveSettings({ waDefault: String((await body()).text ?? "").slice(0, 2000), waIntro: "", waOutro: "" });
        return Response.json({ ok: true });
      }
      // 申请成为管理员：批准 / 拒绝
      if (seg[1] === "requests" && !seg[2] && method === "GET") return Response.json(await db.listAdminRequests());
      if (seg[1] === "requests" && seg[2] && method === "POST") {
        if (!isTopAdmin(me)) throw new HttpError(403, "只有 Top Admin 可以批准");
        const approve = !!(await body()).approve;
        const d: any = await db.decideAdminRequest(Number(seg[2]), approve, me.id);
        if (!d) notFound();
        if (approve) {
          const u: any = await db.getUser(d.user_id);
          const extra = [...new Set([...((await getSettings()).adminEmails || []), String(u.email).toLowerCase()])];
          await saveSettings({ adminEmails: extra });
          await act("admin_added", u.name, null, null);
        }
        await db.readNotificationsByRef(`admin_request:${seg[2]}`);
        return Response.json({ ok: true, requests: await db.listAdminRequests() });
      }
      // 管理员名单（第一批管理员不能移除）
      if (seg[1] === "list" && method === "GET") {
        return Response.json((await db.activeUsers()).filter((u: any) => isAdmin(u))
          .map((u: any) => ({ id: u.id, name: u.name, email: u.email, emoji: u.emoji, color: u.color, fixed: fixedAdmins().includes(String(u.email).toLowerCase()), top: isTopAdmin(u) })));
      }
      // 设定 / 取消 Top Admin（所有管理员都可以；至少要留 1 位）
      if (seg[1] === "list" && seg[2] && seg[3] === "top" && method === "PUT") {
        const u: any = await db.getUser(Number(seg[2]));
        if (!u || !isAdmin(u)) notFound();
        const email = String(u.email).toLowerCase();
        if ((await body()).top) { if (!topAdminEmails().includes(email)) await saveSettings({ topAdmins: [...topAdminEmails(), email] }); }
        else await dropTop([email]);
        await act(isTopAdmin(u) ? "top_added" : "top_removed", u.name, null, null);
        return Response.json({ ok: true });
      }
      if (seg[1] === "list" && seg[2] && method === "DELETE") {
        const u: any = await db.getUser(Number(seg[2]));
        if (!u) notFound();
        if (fixedAdmins().includes(String(u.email).toLowerCase())) throw new Error("不能移除第一批管理员");
        await dropTop([String(u.email).toLowerCase()]);
        await saveSettings({ adminEmails: ((await getSettings()).adminEmails || []).filter((x) => x !== String(u.email).toLowerCase()) });
        return Response.json({ ok: true });
      }
      // 管理员名单：固定的（Supabase 密钥）＋ App 里加的
      if (seg[1] === "admins" && method === "GET") return Response.json({ fixed: fixedAdmins(), extra: (await getSettings()).adminEmails || [] });
      if (seg[1] === "admins" && method === "PUT") {
        const emails = [...new Set(String((await body()).emails ?? "").toLowerCase().split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))]
          .filter((x) => !fixedAdmins().includes(x)).slice(0, 20);
        await saveSettings({ adminEmails: emails });
        return Response.json({ fixed: fixedAdmins(), extra: emails });
      }
      // 每个月上限（例如 Kapso 免费方案）；0 或空 = 不限
      if (seg[1] === "wa-limit" && method === "PUT") {
        const n = Math.floor(Number((await body()).limit) || 0);
        await saveSettings({ waLimit: n > 0 ? n : null });
        return Response.json(await waUsage());
      }
      if (seg[1] === "users" && !seg[2] && method === "GET")
        return Response.json((await db.listUsers()).map((u: any) => ({ id: u.id, email: u.email, name: u.name, admin: isAdmin(u), can_whatsapp: canWhatsApp(u) })));
      if (seg[1] === "users" && seg[2] && method === "PATCH") {
        if (!(await db.setUserWhatsApp(Number(seg[2]), !!(await body()).can_whatsapp))) notFound();
        return Response.json({ ok: true });
      }
    }

    // ---------- 设置 ----------
    if (r === "settings") {
      if (method === "GET" && !seg[1]) {
        const s = await getSettings();
        return Response.json({ timezone: s.timezone, icsUrl: `${apiBase()}/api/cal/${await sign("ics")}.ics?lang=${encodeURIComponent(normLang(me.lang))}` });
      }
      if (seg[1] === "timezone" && method === "PUT") {
        mustAdmin();
        const tz = String((await body()).timezone || "");
        try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { throw new Error("无效的时区"); }
        await saveSettings({ timezone: tz });
        return Response.json({ ok: true, timezone: tz });
      }
    }

    // ---------- Claude 助手 ----------
    if (r === "chat" && method === "POST") {
      const form = await req.formData();
      const history = JSON.parse(String(form.get("history") || "[]"));
      const saved = await savePhotos(form.getAll("photos") as File[], null, who);
      const { timezone } = await getSettings();
      const reply = await chat(history, String(form.get("message") || ""),
        saved.map((p: any) => ({ id: p.id, mime: p.mime, data: Buffer.from(p._buf).toString("base64") })), timezone, who, lang,
        { changed: (eid) => sync(eid), deleted: (m) => later(deleteGoogleEvents(m)), canWhatsApp: canWhatsApp(me) });
      return Response.json({ reply, photos: strip(saved) });
    }

    return notFound();
  } catch (err: any) {
    const status = err instanceof HttpError || err instanceof AuthError ? err.status : 400;
    if (!(err instanceof HttpError) && !(err instanceof AuthError)) console.error(err);
    return Response.json({ error: tr(String(err?.message || err), lang) }, { status });
  }
}
