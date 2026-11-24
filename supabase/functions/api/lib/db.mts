// 资料层：Supabase Postgres（Edge Function 会自动提供 SUPABASE_DB_URL）
import pg from "pg";
import { env } from "./env.mts";

let _pool: pg.Pool | null = null;
function pool() {
  if (!_pool) {
    const cs = env("TEST_DB_URL") || env("SUPABASE_DB_URL");
    if (!cs) throw new Error("没有设定资料库（SUPABASE_DB_URL）");
    _pool = new pg.Pool({ connectionString: cs, max: 3, idleTimeoutMillis: 10_000 });
    _pool.on("error", (e: Error) => console.error("[db]", e));
  }
  return _pool;
}
// 统一用连接池执行参数化查询（$1, $2 …）
async function q(text: string, params: any[] = []): Promise<any[]> {
  const r: any = await pool().query(text, params);
  return r.rows;
}
// sql`... ${value} ...` 自动变成参数化查询，防止 SQL 注入
const sql = (strings: TemplateStringsArray, ...values: any[]) =>
  q(strings.reduce((acc, s, i) => acc + s + (i < values.length ? "$" + (i + 1) : ""), ""), values);

const iso = (v: any) => (v == null || v === "" ? null : new Date(v).toISOString());
function toIso(v: any) {
  if (v == null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`无效时间: ${v}`);
  return d.toISOString();
}
const clean = (s: any, max = 2000) => (s == null ? null : String(s).trim().slice(0, max) || null);

// Google 日历的 11 种活动颜色（label 存 Google 的 colorId）
// App 里显示的是柔和的粉彩色（由浅到深）；Google 日历上仍是 Google 自己的 11 种颜色
export const LABELS: Record<string, { name: string; hex: string }> = {
  // 每个颜色只有一个（黄、橘、粉、绿、天蓝、薰衣草、青、蓝、红、紫、灰）
  "5": { name: "香蕉黄", hex: "#ffe8a3" }, "6": { name: "橘子", hex: "#ffcfb5" }, "4": { name: "火鹤粉", hex: "#f6c9e3" },
  "2": { name: "鼠尾草", hex: "#bfe9cf" }, "7": { name: "孔雀蓝", hex: "#bfe6fb" }, "1": { name: "薰衣草", hex: "#ddd3ff" },
  "10": { name: "罗勒绿", hex: "#97d9d1" }, "9": { name: "蓝莓", hex: "#a3bfff" }, "11": { name: "番茄红", hex: "#f39a9a" },
  "3": { name: "葡萄紫", hex: "#c7a3ee" }, "8": { name: "石墨灰", hex: "#b9c1d1" },
};

function outEvent(e: any) {
  if (!e) return e;
  return {
    ...e, start: iso(e.start), end: iso(e.end), created_at: iso(e.created_at),
    all_day: e.all_day ? 1 : 0, remind: e.remind ? 1 : 0,
    customer_auto: e.customer_auto === false ? 0 : 1, customer_sent_at: iso(e.customer_sent_at), done_at: iso(e.done_at),
    color: e.label && LABELS[e.label] ? LABELS[e.label].hex : e.source_color || null, // 自己的颜色，或 Google 日历的颜色
    photo_count: Number(e.photo_count ?? 0), memo_count: Number(e.memo_count ?? 0),
    amount_total: e.amount_total == null ? null : Number(e.amount_total), amount_paid: e.amount_paid == null ? null : Number(e.amount_paid),
    check_total: Number(e.check_total ?? 0), check_done: Number(e.check_done ?? 0),
  };
}
const outRow = (r: any) => (r ? { ...r, created_at: iso(r.created_at) } : r);

// ---------- 行程 ----------
const EVENT_COLS = `e.*, m.name AS member_name, m.color AS member_color, m.emoji AS member_emoji,
  (SELECT COUNT(*) FROM event_checklist c WHERE c.event_id = e.id)::int AS check_total,
  (SELECT COUNT(*) FROM event_checklist c WHERE c.event_id = e.id AND c.done)::int AS check_done,
  (SELECT COUNT(*) FROM photos p WHERE p.event_id = e.id)::int AS photo_count,
  (SELECT COUNT(*) FROM comments cm WHERE cm.event_id = e.id AND cm.photo_id IS NULL)::int AS memo_count`;

export async function listEvents({ from, to, q: keyword, calendarId }: { from?: string; to?: string; q?: string; calendarId?: number | null } = {}) {
  const rows = await q(
    `SELECT ${EVENT_COLS} FROM events e LEFT JOIN members m ON m.id = e.member_id
     WHERE ($1::timestamptz IS NULL OR COALESCE(e."end", e.start) >= $1) AND ($2::timestamptz IS NULL OR e.start < $2)
       AND ($3::text IS NULL OR e.title ILIKE '%' || $3 || '%' OR e.notes ILIKE '%' || $3 || '%')
       AND ($4::int IS NULL OR e.calendar_id = $4)
     ORDER BY e.start`,
    [from ? toIso(from) : null, to ? toIso(to) : null, keyword || null, calendarId ?? null],
  );
  return rows.map(outEvent);
}

export async function getEvent(id: number) {
  const rows = await q(`SELECT ${EVENT_COLS} FROM events e LEFT JOIN members m ON m.id = e.member_id WHERE e.id = $1`, [id]);
  return outEvent(rows[0]) ?? null;
}

function checkLabel(label: any) {
  if (label == null || label === "") return null;
  if (!LABELS[String(label)]) throw new Error("无效的颜色标签");
  return String(label);
}

export async function createEvent(e: any, author?: string | null) {
  const title = clean(e.title, 300);
  if (!title) throw new Error("请填写标题");
  const start = toIso(e.start), end = toIso(e.end);
  if (!start) throw new Error("请填写开始时间");
  if (end && end < start) throw new Error("结束时间不能早于开始时间");
  const [r] = await sql`INSERT INTO events (title, start, "end", all_day, notes, label, member_id, remind, created_by, customer_phone, customer_note, customer_auto, customer_name, customer_send_at, stage, amount_total, amount_paid, calendar_id)
    VALUES (${title}, ${start}, ${end}, ${!!e.all_day}, ${clean(e.notes, 5000)}, ${checkLabel(e.label)},
            ${e.member_id ?? null}, ${e.remind === undefined ? true : !!e.remind}, ${clean(author, 60)},
            ${clean(e.customer_phone, 40)}, ${clean(e.customer_note, 2000)}, ${e.customer_auto === undefined ? true : !!e.customer_auto}, ${clean(e.customer_name, 80)}, ${e.customer_send_at ? toIso(e.customer_send_at) : null},
            ${cleanStage(e.stage)}, ${money(e.amount_total)}, ${money(e.amount_paid)}, ${e.calendar_id ?? null})
    RETURNING id`;
  await logEvent(r.id, author, "created");
  return getEvent(r.id);
}

// 变更纪录存代码（"updated:title,time"），显示时依各人的语言翻译
const FIELD_CODES: Record<string, string> = { title: "title", start: "time", end: "time", all_day: "time", notes: "notes", label: "label", member_id: "member", remind: "remind",
  customer_phone: "customer", customer_note: "customer", customer_auto: "customer_auto",
  stage: "stage", amount_total: "payment", amount_paid: "payment", customer_name: "customer", customer_send_at: "customer" };
export const STAGES = ["enquiry", "booked", "shoot", "editing", "delivered"];
const cleanStage = (v: any) => (STAGES.includes(String(v)) ? String(v) : "booked");
const money = (v: any) => (v == null || v === "" || isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100);

/** WhatsApp Schedule：把已发送的讯息从清单拿掉 */
export async function hideCustomerMessage(id: number) {
  return (await sql`UPDATE events SET customer_hidden = TRUE WHERE id = ${id} AND customer_sent_at IS NOT NULL RETURNING id`).length > 0;
}
/** 任务清单：打勾 / 取消打勾（只在 App 里） */
export async function setEventDone(id: number, done: boolean, who: string | null) {
  const r = await sql`UPDATE events SET done_at = ${done ? new Date().toISOString() : null}, done_by = ${done ? who : null} WHERE id = ${id} RETURNING id`;
  if (r.length) await logEvent(id, who, done ? "done" : "undone");
  return r.length > 0;
}
/** WhatsApp 摘要也算进每个月的用量（event_id 为空） */
export async function logWaDigest() {
  await sql`INSERT INTO wa_sent (event_id) VALUES (NULL)`;
}
export async function updateEvent(id: number, e: any, author?: string | null) {
  const old = await getEvent(id);
  if (!old) return null;
  const next: any = {
    title: e.title !== undefined ? clean(e.title, 300) : old.title,
    start: e.start !== undefined ? toIso(e.start) : old.start,
    end: e.end !== undefined ? toIso(e.end) : old.end,
    all_day: e.all_day !== undefined ? !!e.all_day : !!old.all_day,
    notes: e.notes !== undefined ? clean(e.notes, 5000) : old.notes,
    label: e.label !== undefined ? checkLabel(e.label) : old.label,
    member_id: e.member_id !== undefined ? e.member_id : old.member_id,
    remind: e.remind !== undefined ? !!e.remind : !!old.remind,
    customer_phone: e.customer_phone !== undefined ? clean(e.customer_phone, 40) : old.customer_phone,
    // 员工自己改了电话 → 以后不再自动从通讯录覆盖
    customer_source: e.customer_phone !== undefined && clean(e.customer_phone, 40) !== old.customer_phone ? "manual" : old.customer_source ?? null,
    customer_name: e.customer_name !== undefined ? clean(e.customer_name, 80) : old.customer_name,
    customer_send_at: e.customer_send_at !== undefined ? (e.customer_send_at ? toIso(e.customer_send_at) : null) : iso(old.customer_send_at),
    stage: e.stage !== undefined ? cleanStage(e.stage) : old.stage,
    amount_total: e.amount_total !== undefined ? money(e.amount_total) : money(old.amount_total),
    amount_paid: e.amount_paid !== undefined ? money(e.amount_paid) : money(old.amount_paid),
    customer_note: e.customer_note !== undefined ? clean(e.customer_note, 2000) : old.customer_note,
    customer_auto: e.customer_auto !== undefined ? !!e.customer_auto : old.customer_auto !== 0,
  };
  if (!next.title) throw new Error("请填写标题");
  if (!next.start) throw new Error("请填写开始时间");
  if (next.end && next.end < next.start) throw new Error("结束时间不能早于开始时间");
  await sql`UPDATE events SET title = ${next.title}, start = ${next.start}, "end" = ${next.end}, all_day = ${next.all_day},
    notes = ${next.notes}, label = ${next.label}, member_id = ${next.member_id}, remind = ${next.remind},
    customer_phone = ${next.customer_phone}, customer_note = ${next.customer_note}, customer_auto = ${next.customer_auto}, customer_name = ${next.customer_name}, customer_send_at = ${next.customer_send_at},
    customer_source = ${next.customer_source},
    stage = ${next.stage}, amount_total = ${next.amount_total}, amount_paid = ${next.amount_paid} WHERE id = ${id}`;
  // 变更纪录：「修改了标题、时间」
  const prev: any = { ...old, all_day: !!old.all_day, remind: !!old.remind, customer_auto: old.customer_auto !== 0 };
  // 电话、讯息或日期改了 → 之后会再发一次新的
  if (next.customer_phone !== old.customer_phone || next.customer_note !== old.customer_note || next.start !== old.start || next.customer_send_at !== iso(old.customer_send_at) || (next.customer_auto && !prev.customer_auto))
    await sql`UPDATE events SET customer_sent_at = NULL, customer_error = NULL WHERE id = ${id}`;
  // 用一样的格式比较（日期、金额），只记录看得懂的栏位；没变就不记录
  const norm = (k: string, v: any) => (v == null || v === "" ? null : k === "customer_send_at" ? iso(v) : k === "amount_total" || k === "amount_paid" ? money(v) : v);
  const changed = [...new Set(Object.keys(next).filter((k) => norm(k, next[k]) !== norm(k, prev[k])).map((k) => FIELD_CODES[k]).filter(Boolean))];
  if (changed.length) await logEvent(id, author, `updated:${changed.join(",")}`);
  return getEvent(id);
}

export async function deleteEvent(id: number) {
  return (await sql`DELETE FROM events WHERE id = ${id} RETURNING id`).length > 0;
}

// ---------- 给客户的 WhatsApp ----------
/** 还没发、开着自动发送、未来 3 天内开始的行程 */
export async function pendingCustomerMessages() {
  // 自己选的发送时间：到了（而且不超过 1 天前）就发；没选：行程在 3 天内（前一天下午 4 点发）
  return sql`SELECT id, start, customer_phone, customer_note, customer_send_at FROM events
    WHERE customer_auto AND customer_sent_at IS NULL AND customer_error IS NULL
      AND COALESCE(customer_phone, '') <> '' AND COALESCE(customer_note, '') <> ''
      AND ((customer_send_at IS NOT NULL AND customer_send_at <= NOW() AND customer_send_at > NOW() - INTERVAL '1 day')
        OR (customer_send_at IS NULL AND start > NOW() AND start < NOW() + INTERVAL '3 days'))`;
}
// ---------- Schedule Mode：通讯录里的 booking number ----------
/** 这个帐号的通讯录对照表整个换成新的 */
export async function replaceContactBookings(userId: number, rows: { booking: string; name: string; phone: string; contact: string }[]) {
  await sql`DELETE FROM contact_bookings WHERE user_id = ${userId}`;
  for (const r of rows)
    await sql`INSERT INTO contact_bookings (user_id, booking, phone, name, contact) VALUES (${userId}, ${r.booking}, ${r.phone}, ${clean(r.name, 80)}, ${clean(r.contact, 200)})
      ON CONFLICT (user_id, booking, phone) DO UPDATE SET name = EXCLUDED.name, contact = EXCLUDED.contact`;
}
export async function findContactBookings(booking: string) {
  return sql`SELECT booking, phone, name, contact FROM contact_bookings WHERE booking = ${booking} ORDER BY phone`;
}
/** 未来几天开始的行程（withPast = 也包括今天已经开始的，给清单显示） */
export async function upcomingForSchedule(days: number, withPast = false) {
  const from = withPast ? new Date(Date.now() - 86400_000) : new Date();
  const to = new Date(Date.now() + days * 86400_000);
  const rows = await sql`SELECT id, calendar_id, title, start, all_day, customer_phone, customer_name, customer_note, customer_auto, customer_sent_at,
      customer_error, customer_send_at, customer_source, customer_lookup, customer_lookup_detail
    FROM events WHERE start >= ${from.toISOString()} AND start < ${to.toISOString()} ORDER BY start`;
  return rows.map((e: any) => ({ ...e, start: iso(e.start), customer_sent_at: iso(e.customer_sent_at), customer_send_at: iso(e.customer_send_at) }));
}
/** 从通讯录找到客户 → 填上电话、名字、提醒内容（电话换了 → 之后会重新发） */
export async function setAutoCustomer(id: number, c: { phone: string; name: string | null; note: string }) {
  await sql`UPDATE events SET
      customer_sent_at = CASE WHEN customer_phone IS DISTINCT FROM ${c.phone} THEN NULL ELSE customer_sent_at END,
      customer_error = CASE WHEN customer_phone IS DISTINCT FROM ${c.phone} THEN NULL ELSE customer_error END,
      customer_phone = ${c.phone}, customer_name = ${clean(c.name, 80)}, customer_note = ${clean(c.note, 2000)},
      customer_source = 'auto', customer_lookup = NULL, customer_lookup_detail = NULL
    WHERE id = ${id}`;
}
/** 「WhatsApp 提醒」页签：通讯录找不到电话 → 员工自己输入（之后通讯录不会覆盖） */
export async function setTypedPhone(id: number, phone: string | null, note: string) {
  await sql`UPDATE events SET customer_phone = ${clean(phone, 40)}, customer_note = ${clean(note, 2000)}, customer_auto = TRUE,
      customer_source = ${phone ? "typed" : null}, customer_lookup = NULL, customer_lookup_detail = NULL,
      customer_sent_at = NULL, customer_error = NULL
    WHERE id = ${id}`;
}
/** 改了提醒内容 → 还没发出的自动提醒也一起换 */
export async function updateAutoNotes(text: string) {
  await sql`UPDATE events SET customer_note = ${clean(text, 2000)} WHERE customer_source IN ('auto', 'typed') AND customer_sent_at IS NULL AND start > NOW()`;
}
/** 找不到 / 找到多个联络人：清掉之前自动填的电话，记下原因 */
export async function setCustomerLookup(id: number, status: string, detail: string | null) {
  await sql`UPDATE events SET customer_lookup = ${status}, customer_lookup_detail = ${clean(detail, 500)},
      customer_phone = CASE WHEN customer_source = 'auto' AND customer_sent_at IS NULL THEN NULL ELSE customer_phone END
    WHERE id = ${id}`;
}

/** 抢占发送（避免重复发）；force = 手动「立即发送」 */
export async function claimCustomerSend(id: number, force = false) {
  const r = force
    ? await sql`UPDATE events SET customer_sent_at = NOW(), customer_error = NULL WHERE id = ${id} RETURNING id`
    : await sql`UPDATE events SET customer_sent_at = NOW(), customer_error = NULL WHERE id = ${id} AND customer_sent_at IS NULL AND customer_error IS NULL RETURNING id`;
  return r.length > 0;
}
export async function recordWaSent(eventId: number) {
  await sql`INSERT INTO wa_sent (event_id) VALUES (${eventId})`;
}
export async function countWaSentSince(since: Date) {
  return Number((await sql`SELECT COUNT(*)::int AS n FROM wa_sent WHERE sent_at >= ${since.toISOString()}`)[0]?.n ?? 0);
}
export async function setCustomerError(id: number, error: string) {
  await sql`UPDATE events SET customer_sent_at = NULL, customer_error = ${error} WHERE id = ${id}`;
}

// ---------- 帐号 ----------
export async function listUsers() {
  return sql`SELECT id, email, name, wa_allowed, created_at FROM users ORDER BY created_at`;
}
export async function setUserWhatsApp(id: number, allowed: boolean) {
  return (await sql`UPDATE users SET wa_allowed = ${allowed} WHERE id = ${id} RETURNING id`).length > 0;
}
export async function getUser(id: number) {
  return (await sql`SELECT * FROM users WHERE id = ${id}`)[0] ?? null;
}
export async function getUserByEmail(email: string) {
  return (await sql`SELECT * FROM users WHERE email = ${email}`)[0] ?? null;
}
export async function createUser(u: { email: string; name: string; password_hash: string; lang: string }) {
  return (await sql`INSERT INTO users (email, name, password_hash, lang) VALUES (${u.email}, ${u.name}, ${u.password_hash}, ${u.lang}) RETURNING *`)[0];
}
export async function setUserLang(id: number, lang: string) {
  await sql`UPDATE users SET lang = ${lang} WHERE id = ${id}`;
}
export async function setUserName(id: number, name: string) {
  await sql`UPDATE users SET name = ${name} WHERE id = ${id}`;
}
export async function setUserPassword(id: number, hash: string) {
  await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${id}`;
}
/** 注册时把名字加进「成员」（已有同名就不加） */
export async function ensureMember(name: string, calendarId: number) {
  const found = await sql`SELECT id FROM members WHERE LOWER(name) = LOWER(${name}) AND calendar_id = ${calendarId}`;
  if (!found.length) await createMember({ name }, calendarId);
}

// ---------- 每个人的 Google 日历连接 ----------
export async function getGoogleLink(userId: number) {
  return (await sql`SELECT * FROM google_links WHERE user_id = ${userId}`)[0] ?? null;
}
export async function listGoogleLinks() {
  return sql`SELECT * FROM google_links ORDER BY user_id`;
}
export async function saveGoogleLink(l: { user_id: number; gmail: string; refresh_token: string; calendar_id: string }) {
  await sql`INSERT INTO google_links (user_id, gmail, refresh_token, calendar_id) VALUES (${l.user_id}, ${l.gmail}, ${l.refresh_token}, ${l.calendar_id})
    ON CONFLICT (user_id) DO UPDATE SET gmail = EXCLUDED.gmail, refresh_token = EXCLUDED.refresh_token, calendar_id = EXCLUDED.calendar_id`;
}
export async function deleteGoogleLink(userId: number) {
  await sql`DELETE FROM event_google WHERE user_id = ${userId}`;
  await sql`DELETE FROM google_calendars WHERE user_id = ${userId}`;
  await sql`DELETE FROM google_links WHERE user_id = ${userId}`;
}
/** 改成同步另一个 Google 日历：换日历、清掉旧的对应和同步位置 */
export async function switchGoogleCalendar(userId: number, calendarId: string, name: string | null) {
  await sql`DELETE FROM event_google WHERE user_id = ${userId}`;
  await sql`DELETE FROM google_calendars WHERE user_id = ${userId}`;
  await sql`UPDATE google_links SET calendar_id = ${calendarId}, calendar_name = ${name}, sync_token = NULL, last_pull_at = NULL, watch_id = NULL, watch_resource = NULL, watch_expires = NULL WHERE user_id = ${userId}`;
}
export async function clearEventGoogle(userId: number) {
  await sql`DELETE FROM event_google WHERE user_id = ${userId}`;
}
export async function getEventGoogle(eventId: number, userId: number) {
  return (await sql`SELECT * FROM event_google WHERE event_id = ${eventId} AND user_id = ${userId}`)[0] ?? null;
}
export async function listEventGoogle(eventId: number) {
  return sql`SELECT * FROM event_google WHERE event_id = ${eventId}`;
}
export async function setEventGoogle(eventId: number, userId: number, f: { google_event_id: string; calendar_id?: string | null; error?: string | null; etag?: string | null }) {
  await sql`INSERT INTO event_google (event_id, user_id, google_event_id, calendar_id, synced_at, error, etag, seen_at)
    VALUES (${eventId}, ${userId}, ${f.google_event_id}, ${f.calendar_id ?? null}, ${f.error ? null : new Date().toISOString()}, ${f.error ?? null}, ${f.etag ?? null}, NOW())
    ON CONFLICT (event_id, user_id) DO UPDATE SET google_event_id = EXCLUDED.google_event_id, seen_at = NOW(),
      calendar_id = COALESCE(EXCLUDED.calendar_id, event_google.calendar_id),
      synced_at = COALESCE(EXCLUDED.synced_at, event_google.synced_at), error = EXCLUDED.error,
      etag = COALESCE(EXCLUDED.etag, event_google.etag)`;
}
/** 同步到 Google 失败的行程（自动重试用） */
export async function listFailedSyncs(userId: number | null, limit = 10) {
  return userId == null
    ? sql`SELECT event_id, user_id FROM event_google WHERE error IS NOT NULL ORDER BY event_id LIMIT ${limit}`
    : sql`SELECT event_id, user_id FROM event_google WHERE error IS NOT NULL AND user_id = ${userId} ORDER BY event_id LIMIT ${limit}`;
}
export async function findEventGoogle(userId: number, googleEventId: string, calendarId: string) {
  return (await sql`SELECT * FROM event_google WHERE user_id = ${userId} AND google_event_id = ${googleEventId}
    AND COALESCE(calendar_id, (SELECT calendar_id FROM google_links WHERE user_id = ${userId})) = ${calendarId}`)[0] ?? null;
}

/** 这本 Google 日历读进来的所有行程（google 活动 ID → App 行程） */
export async function listCalMappings(userId: number, calendarId: string) {
  return sql`SELECT event_id, google_event_id, etag FROM event_google WHERE user_id = ${userId} AND calendar_id = ${calendarId}`;
}
/** 这一轮在 Google 上还看得到的活动 */
export async function markGoogleSeen(userId: number, calendarId: string, ids: string[]) {
  if (!ids.length) return;
  await sql`UPDATE event_google SET seen_at = NOW() WHERE user_id = ${userId} AND calendar_id = ${calendarId} AND google_event_id = ANY(${ids})`;
}
/** 这一轮读完，这段时间里没再看到的（Google 已经没有了） */
export async function unseenGoogleEvents(userId: number, calendarId: string, passStart: Date, from: string, to: string) {
  return sql`SELECT eg.event_id FROM event_google eg JOIN events e ON e.id = eg.event_id
    WHERE eg.user_id = ${userId} AND eg.calendar_id = ${calendarId}
      AND COALESCE(eg.seen_at, 'epoch') < ${passStart.toISOString()}
      AND e.start >= ${from} AND e.start < ${to}`;
}

// ---------- 每个人同步的所有 Google 日历（「我的日历」） ----------
export async function listGoogleCals(userId: number) {
  return sql`SELECT * FROM google_calendars WHERE user_id = ${userId} ORDER BY calendar_id`;
}
export async function upsertGoogleCal(userId: number, calendarId: string, name: string | null, color: string | null = null) {
  await sql`INSERT INTO google_calendars (user_id, calendar_id, name, color) VALUES (${userId}, ${calendarId}, ${name}, ${color})
    ON CONFLICT (user_id, calendar_id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color`;
}
/** 行程来自哪个 Google 日历 → 记下那个日历的颜色 */
export async function applyCalendarColors(userId: number) {
  await sql`UPDATE events e SET source_color = gc.color
    FROM event_google eg JOIN google_calendars gc ON gc.user_id = eg.user_id AND gc.calendar_id = eg.calendar_id
    WHERE eg.event_id = e.id AND eg.user_id = ${userId} AND e.source_color IS DISTINCT FROM gc.color`;
}
/** 日历在 Google 被删除了：只拿掉对应（App 里的行程保留） */
export async function removeGoogleCal(userId: number, calendarId: string) {
  await sql`DELETE FROM event_google WHERE user_id = ${userId} AND calendar_id = ${calendarId}`;
  await sql`DELETE FROM google_calendars WHERE user_id = ${userId} AND calendar_id = ${calendarId}`;
}
export async function setCalSync(userId: number, calendarId: string, syncToken: string | null) {
  await sql`UPDATE google_calendars SET sync_token = ${syncToken} WHERE user_id = ${userId} AND calendar_id = ${calendarId}`;
}
export async function setCalWatch(userId: number, calendarId: string, w: { id: string | null; resource: string | null; expires: Date | null }) {
  await sql`UPDATE google_calendars SET watch_id = ${w.id}, watch_resource = ${w.resource}, watch_expires = ${w.expires}
    WHERE user_id = ${userId} AND calendar_id = ${calendarId}`;
}
export async function setCalEnabled(userId: number, calendarId: string, enabled: boolean) {
  return (await sql`UPDATE google_calendars SET enabled = ${enabled}, sync_token = NULL
    WHERE user_id = ${userId} AND calendar_id = ${calendarId} RETURNING *`)[0] ?? null;
}
/** 取消勾选某个日历：App 里来自那个日历的行程（只删 App，不动 Google） */
export async function eventsFromCalendar(userId: number, calendarId: string) {
  return sql`SELECT event_id FROM event_google WHERE user_id = ${userId} AND calendar_id = ${calendarId}`;
}
export async function hasCalWatch(userId: number, channel: string) {
  return (await sql`SELECT 1 FROM google_calendars WHERE user_id = ${userId} AND watch_id = ${channel}`).length > 0;
}
export async function deleteEventGoogle(eventId: number, userId: number) {
  await sql`DELETE FROM event_google WHERE event_id = ${eventId} AND user_id = ${userId}`;
}
export async function setLinkSync(userId: number, f: { sync_token?: string | null; pulled?: boolean }) {
  if (f.sync_token !== undefined) await sql`UPDATE google_links SET sync_token = ${f.sync_token} WHERE user_id = ${userId}`;
  if (f.pulled) await sql`UPDATE google_links SET last_pull_at = NOW() WHERE user_id = ${userId}`;
}
/** 抢占「从 Google 读取」：距离上次超过 minSeconds 秒才执行（避免同时重复读取） */
export async function claimPull(userId: number, minSeconds: number) {
  const r = await sql`UPDATE google_links SET last_pull_at = NOW()
    WHERE user_id = ${userId} AND (last_pull_at IS NULL OR last_pull_at < NOW() - (${minSeconds} || ' seconds')::interval) RETURNING user_id`;
  return r.length > 0;
}


// Google 推送通知
export async function setWatch(userId: number, w: { id: string | null; resource: string | null; expires: Date | null }) {
  await sql`UPDATE google_links SET watch_id = ${w.id}, watch_resource = ${w.resource}, watch_expires = ${w.expires} WHERE user_id = ${userId}`;
}
// 读取锁：同一个人同一时间只有一个读取在跑；其他通知只标记「要再读一次」
export async function requestPull(userId: number) {
  await sql`UPDATE google_links SET pull_again = TRUE WHERE user_id = ${userId}`;
}
export async function takePullLease(userId: number) {
  const r = await sql`UPDATE google_links SET pull_lease = NOW() + INTERVAL '60 seconds'
    WHERE user_id = ${userId} AND (pull_lease IS NULL OR pull_lease < NOW()) RETURNING user_id`;
  return r.length > 0;
}
export async function clearPullAgain(userId: number) {
  await sql`UPDATE google_links SET pull_again = FALSE WHERE user_id = ${userId}`;
}
/** 没有新通知才放开锁；有新通知回传 false（要再读一次） */
export async function releasePullLease(userId: number, force = false) {
  const r = force
    ? await sql`UPDATE google_links SET pull_lease = NULL WHERE user_id = ${userId} RETURNING user_id`
    : await sql`UPDATE google_links SET pull_lease = NULL WHERE user_id = ${userId} AND pull_again = FALSE RETURNING user_id`;
  return r.length > 0;
}

// ---------- 变更纪录 ----------
export async function logEvent(eventId: number, author: string | null | undefined, action: string) {
  await sql`INSERT INTO event_log (event_id, author, action) VALUES (${eventId}, ${clean(author, 60)}, ${action})`;
}

/** 行程的时间线：留言、照片、变更纪录，按时间排序 */
export async function eventFeed(eventId: number) {
  const [comments, photos, logs] = await Promise.all([
    sql`SELECT id, author, body, created_at FROM comments WHERE event_id = ${eventId} AND photo_id IS NULL`,
    sql`SELECT p.id, p.author, p.caption, p.created_at,
          (SELECT COUNT(*) FROM comments c WHERE c.photo_id = p.id)::int AS comment_count
        FROM photos p WHERE p.event_id = ${eventId}`,
    sql`SELECT id, author, action, created_at FROM event_log WHERE event_id = ${eventId}`,
  ]);
  const items = [
    ...comments.map((c: any) => ({ type: "comment", id: c.id, author: c.author, body: c.body, created_at: iso(c.created_at) })),
    ...photos.map((p: any) => ({ type: "photo", id: p.id, author: p.author, caption: p.caption, comment_count: p.comment_count, created_at: iso(p.created_at) })),
    ...logs.map((l: any) => ({ type: "log", id: l.id, author: l.author, body: l.action, created_at: iso(l.created_at) })),
  ];
  const order: Record<string, number> = { log: 0, comment: 1, photo: 2 };
  return items.sort((a: any, b: any) => a.created_at.localeCompare(b.created_at) || order[a.type] - order[b.type] || a.id - b.id);
}

// ---------- 成员 ----------
const MEMBER_COLORS = ["#e8a33d", "#e07a5f", "#3d85c6", "#b565a7", "#e0a100", "#2a9d8f", "#d1495b", "#6c757d"];
export async function listMembers(calendarId?: number) {
  if (calendarId) {
    for (const r of await sql`SELECT id FROM members WHERE calendar_id = ${calendarId} AND (emoji IS NULL OR emoji = '') ORDER BY id`)
      await sql`UPDATE members SET emoji = ${await pickEmoji()} WHERE id = ${r.id}`;
    return (await sql`SELECT * FROM members WHERE calendar_id = ${calendarId} ORDER BY id`).map(outRow);
  }
  // 以前建立、还没有 emoji 的人 → 补一个
  for (const r of await sql`SELECT id FROM members WHERE emoji IS NULL OR emoji = '' ORDER BY id`)
    await sql`UPDATE members SET emoji = ${await pickEmoji()} WHERE id = ${r.id}`;
  return (await sql`SELECT * FROM members ORDER BY id`).map(outRow);
}
export async function getMember(id: number) {
  return outRow((await sql`SELECT * FROM members WHERE id = ${id}`)[0]) ?? null;
}
// 每个人默认一个可爱 / 搞笑的 emoji（和网页上的选单一样），先用还没人用的
export const MEMBER_EMOJIS = ["🐱", "🐶", "🐼", "🐨", "🐰", "🦊", "🐻", "🐷", "🐸", "🐵", "🙈", "🐥", "🐧", "🦄", "🦖", "🐙", "🐳", "🦋", "🐝", "🐞",
  "🌸", "🌈", "⭐", "🍓", "🍑", "🍩", "🧁", "🍦", "🎀", "🎈", "👻", "🤡", "💩", "🤪", "😜", "😎", "🥳", "🤠", "🤓", "😴", "🤖", "👽", "👑", "💖"];
async function pickEmoji() {
  const used = new Set((await sql`SELECT emoji FROM members WHERE emoji IS NOT NULL`).map((r: any) => r.emoji));
  const free = MEMBER_EMOJIS.filter((e) => !used.has(e));
  const pool = free.length ? free : MEMBER_EMOJIS;
  return pool[Math.floor(Math.random() * pool.length)];
}
export async function createMember(m: any, calendarId?: number | null) {
  const name = clean(m.name, 40);
  if (!name) throw new Error("请填写名字");
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM members`;
  const [r] = await sql`INSERT INTO members (name, color, emoji, calendar_id) VALUES (${name}, ${m.color || MEMBER_COLORS[n % MEMBER_COLORS.length]}, ${clean(m.emoji, 16) || (await pickEmoji())}, ${calendarId ?? null}) RETURNING id`;
  return getMember(r.id);
}
export async function updateMember(id: number, m: any) {
  const old = await getMember(id);
  if (!old) return null;
  const name = m.name !== undefined ? clean(m.name, 40) : old.name;
  if (!name) throw new Error("请填写名字");
  const emoji = (m.emoji !== undefined ? clean(m.emoji, 16) : old.emoji) || old.emoji || (await pickEmoji());
  await sql`UPDATE members SET name = ${name}, color = ${m.color || old.color}, emoji = ${emoji} WHERE id = ${id}`;
  return getMember(id);
}
export async function deleteMember(id: number) {
  return (await sql`DELETE FROM members WHERE id = ${id} RETURNING id`).length > 0;
}

// ---------- 照片 ----------
export async function addPhoto(p: { event_id?: number | null; blob_key: string; mime: string; caption?: string | null; author?: string | null }) {
  const [r] = await sql`INSERT INTO photos (event_id, blob_key, mime, caption, author)
    VALUES (${p.event_id ?? null}, ${p.blob_key}, ${p.mime}, ${clean(p.caption, 500)}, ${clean(p.author, 60)}) RETURNING *`;
  return outRow(r);
}
export async function listPhotos(eventId: number) {
  return (await sql`SELECT p.*, (SELECT COUNT(*) FROM comments c WHERE c.photo_id = p.id)::int AS comment_count
    FROM photos p WHERE p.event_id = ${eventId} ORDER BY p.id`).map(outRow);
}
export async function getPhoto(id: number) {
  return outRow((await sql`SELECT * FROM photos WHERE id = ${id}`)[0]) ?? null;
}
export async function attachPhoto(id: number, eventId: number, caption?: string | null) {
  await sql`UPDATE photos SET event_id = ${eventId}, caption = COALESCE(${clean(caption, 500)}, caption) WHERE id = ${id}`;
}
export async function deletePhoto(id: number) {
  return (await sql`DELETE FROM photos WHERE id = ${id} RETURNING id`).length > 0;
}

// ---------- 留言 / 评论 ----------
export async function listComments({ event_id, photo_id }: { event_id?: number; photo_id?: number }) {
  const rows = photo_id
    ? await sql`SELECT * FROM comments WHERE photo_id = ${photo_id} ORDER BY id`
    : await sql`SELECT * FROM comments WHERE event_id = ${event_id} AND photo_id IS NULL ORDER BY id`;
  return rows.map(outRow);
}
export async function addComment({ event_id, photo_id, author, body }: any) {
  const text = clean(body, 5000);
  if (!text) throw new Error("内容不能为空");
  if (photo_id) {
    const p = await getPhoto(photo_id);
    if (!p) throw new Error("找不到照片");
    event_id = p.event_id;
  }
  const [r] = await sql`INSERT INTO comments (event_id, photo_id, author, body)
    VALUES (${event_id ?? null}, ${photo_id ?? null}, ${clean(author, 60)}, ${text}) RETURNING *`;
  return outRow(r);
}
export async function getComment(id: number) {
  return outRow((await sql`SELECT * FROM comments WHERE id = ${id}`)[0]) ?? null;
}
export async function deleteComment(id: number) {
  return (await sql`DELETE FROM comments WHERE id = ${id} RETURNING id`).length > 0;
}

// ---------- 设置（key-value，只有服务器端读得到） ----------
export async function getKv(key: string) {
  return (await q(`SELECT value FROM kv WHERE key = $1`, [key]))[0]?.value ?? null;
}
export async function setKv(key: string, value: any) {
  await q(`INSERT INTO kv (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, JSON.stringify(value)]);
}


// ---------- 每个行程的清单 ----------
export async function listChecklist(eventId: number) {
  return sql`SELECT id, text, done, done_by FROM event_checklist WHERE event_id = ${eventId} ORDER BY position, id`;
}
export async function addChecklistItems(eventId: number, texts: string[]) {
  const [{ n }] = await sql`SELECT COALESCE(MAX(position), 0)::int AS n FROM event_checklist WHERE event_id = ${eventId}`;
  let pos = n;
  for (const t of texts.map((x) => clean(x, 200)).filter(Boolean)) {
    pos++;
    await sql`INSERT INTO event_checklist (event_id, text, position) VALUES (${eventId}, ${t}, ${pos})`;
  }
}
export async function setChecklistDone(itemId: number, done: boolean, who: string | null) {
  return (await sql`UPDATE event_checklist SET done = ${done}, done_by = ${done ? who : null} WHERE id = ${itemId} RETURNING event_id`)[0] ?? null;
}
export async function deleteChecklistItem(itemId: number) {
  return (await sql`DELETE FROM event_checklist WHERE id = ${itemId} RETURNING event_id`)[0] ?? null;
}
// 清单范本
export async function listTemplates() {
  return sql`SELECT id, name, items FROM checklist_templates ORDER BY name`;
}
export async function saveTemplate(t: { id?: number; name: string; items: string[] }) {
  const name = clean(t.name, 60);
  if (!name) throw new Error("请填写范本名称");
  const items = (t.items || []).map((x) => clean(x, 200)).filter(Boolean).slice(0, 40) as string[];
  if (t.id) return (await sql`UPDATE checklist_templates SET name = ${name}, items = ${items} WHERE id = ${t.id} RETURNING id, name, items`)[0] ?? null;
  return (await sql`INSERT INTO checklist_templates (name, items) VALUES (${name}, ${items}) RETURNING id, name, items`)[0];
}
export async function deleteTemplate(id: number) {
  return (await sql`DELETE FROM checklist_templates WHERE id = ${id} RETURNING id`).length > 0;
}
export async function getTemplate(id: number) {
  return (await sql`SELECT id, name, items FROM checklist_templates WHERE id = ${id}`)[0] ?? null;
}


// ---------- 日历（每个帐号自己的 + 一起编辑的） ----------
export async function listMyCalendars(userId: number) {
  return sql`SELECT c.id, c.name, c.owner_id, c.label_names, cm.role,
      (SELECT COUNT(*) FROM calendar_members x WHERE x.calendar_id = c.id)::int AS member_count
    FROM calendar_members cm JOIN calendars c ON c.id = cm.calendar_id
    WHERE cm.user_id = ${userId} ORDER BY (cm.role = 'owner') DESC, c.id`;
}
export async function createCalendar(name: string, ownerId: number) {
  const [c] = await sql`INSERT INTO calendars (name, owner_id) VALUES (${clean(name, 60) || "My calendar"}, ${ownerId}) RETURNING id`;
  await sql`INSERT INTO calendar_members (calendar_id, user_id, role) VALUES (${c.id}, ${ownerId}, 'owner') ON CONFLICT DO NOTHING`;
  return c.id as number;
}
export async function renameCalendar(id: number, name: string) {
  const n = clean(name, 60);
  if (!n) throw new Error("请填写日历名称");
  await sql`UPDATE calendars SET name = ${n} WHERE id = ${id}`;
}
export async function setCalendarLabelNames(id: number, names: Record<string, string>) {
  await sql`UPDATE calendars SET label_names = ${JSON.stringify(names)}::jsonb WHERE id = ${id}`;
}
export async function listCalendarPeople(id: number) {
  return sql`SELECT u.id, u.name, u.email, cm.role FROM calendar_members cm JOIN users u ON u.id = cm.user_id
    WHERE cm.calendar_id = ${id} ORDER BY (cm.role = 'owner') DESC, u.name`;
}
export async function setCalendarRole(id: number, userId: number, role: string) {
  return (await sql`UPDATE calendar_members SET role = ${role} WHERE calendar_id = ${id} AND user_id = ${userId} AND role <> 'owner' RETURNING user_id`).length > 0;
}
export async function removeCalendarMember(id: number, userId: number) {
  return (await sql`DELETE FROM calendar_members WHERE calendar_id = ${id} AND user_id = ${userId} AND role <> 'owner' RETURNING user_id`).length > 0;
}
export async function createInvite(calendarId: number, role: string, by: number, token: string) {
  await sql`INSERT INTO calendar_invites (token, calendar_id, role, created_by) VALUES (${token}, ${calendarId}, ${role}, ${by})`;
}
export async function getInvite(token: string) {
  return (await sql`SELECT i.*, c.name AS calendar_name FROM calendar_invites i JOIN calendars c ON c.id = i.calendar_id
    WHERE i.token = ${token} AND NOT i.revoked`)[0] ?? null;
}
export async function revokeInvites(calendarId: number) {
  await sql`UPDATE calendar_invites SET revoked = TRUE WHERE calendar_id = ${calendarId}`;
}
export async function joinCalendar(calendarId: number, userId: number, role: string) {
  // 已经是成员：保留比较高的权限
  await sql`INSERT INTO calendar_members (calendar_id, user_id, role) VALUES (${calendarId}, ${userId}, ${role})
    ON CONFLICT (calendar_id, user_id) DO UPDATE SET role = CASE WHEN calendar_members.role IN ('owner','editor') THEN calendar_members.role ELSE EXCLUDED.role END`;
}
export async function getChecklistItem(itemId: number) {
  return (await sql`SELECT * FROM event_checklist WHERE id = ${itemId}`)[0] ?? null;
}
export async function setGoogleAppCalendar(userId: number, calendarId: number) {
  await sql`UPDATE google_links SET app_calendar_id = ${calendarId} WHERE user_id = ${userId}`;
}

// ---------- 忘记密码验证码 ----------
export async function getReset(email: string) {
  return (await sql`SELECT *, extract(epoch FROM now() - sent_at) AS age FROM password_resets WHERE email = ${email}`)[0];
}
export async function saveReset(email: string, codeHash: string) {
  await sql`INSERT INTO password_resets (email, code_hash, expires_at, attempts, sent_at) VALUES (${email}, ${codeHash}, now() + interval '5 minutes', 0, now())
    ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0, sent_at = now()`;
}
export async function bumpResetAttempts(email: string) {
  await sql`UPDATE password_resets SET attempts = attempts + 1 WHERE email = ${email}`;
}
export async function deleteReset(email: string) {
  await sql`DELETE FROM password_resets WHERE email = ${email}`;
}
