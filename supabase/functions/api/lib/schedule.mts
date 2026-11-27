// Schedule Mode：用行程标题里的 booking number，从 Google 通讯录找客户电话，自动排好 WhatsApp 提醒
//
// 流程（每 15 分钟由排程执行一次）：
//   1. 读取已连接 Google 的帐号的通讯录（只读），找出名字里有 booking number 的联络人
//      例：「6961」「6961 Ivy」「WM 1902」「Sam (WM0260)」
//   2. 未来几天的行程，标题开头是 booking number（例：「6961 选礼服 …」「WM0186 取AD」）
//      → 自动填上客户电话、名字、默认中文提醒
//   3. 到了发送时间（前一天下午 2 点，可在设定改），由 whatsapp.mts 发出
//      预览模式开着的时候只显示「将会发送」，不会真的发
import * as db from "./db.mts";
import { getSettings, saveSettings } from "./settings.mts";
import { fetchContacts } from "./gcal.mts";
import { normPhone, templateForTitle } from "./whatsapp.mts";
import { env } from "./env.mts";

export const DEFAULT_TEXT =
  "您好{name}，提醒您明天 {date} {time} 的预约（编号 {booking}）。\n如需更改时间，请联络我们。谢谢！";

const CONTACTS_TTL_MS = 30 * 60_000; // 通讯录最多 30 分钟读一次
const LOOKAHEAD_DAYS = 3;            // 每 15 分钟：未来 3 天的行程（快要发送的）
export const WEEKLY_DAYS = 31;       // 每 3 天：未来一个月的行程
const SCAN_EVERY_DAYS = 3;           // 每 3 天检查一次
const WEEKLY_HOUR = 8;               // 那天早上 8 点后执行

// ---------- booking number ----------
const BOOKING_AT_START = /^\s*(WM\s*\d+|\d{3,6})(?!\d)/i;
const BOOKING_IN_NAME = /(?<![A-Za-z0-9])(WM\s*\d+|\d{3,6})(?!\d)/gi;

export const normBooking = (raw: string) => String(raw || "").replace(/\s+/g, "").toUpperCase();

/** 行程标题开头的 booking number；没有（例如「Meera off day」）→ null */
export function bookingFromTitle(title: string): string | null {
  const m = BOOKING_AT_START.exec(String(title || ""));
  return m ? normBooking(m[1]) : null;
}
/** 联络人名字里的所有 booking number */
export function bookingsInName(name: string): string[] {
  const out: string[] = [];
  for (const m of String(name || "").matchAll(BOOKING_IN_NAME)) {
    const b = normBooking(m[1]);
    if (!out.includes(b)) out.push(b);
  }
  return out;
}
/** 联络人名字去掉 booking number 后剩下的（只有号码 → 空字串） */
export function nameWithoutBooking(name: string) {
  return String(name || "").replace(BOOKING_IN_NAME, " ").replace(/[()[\]（）]/g, " ")
    .replace(/\s+/g, " ").trim().replace(/^[-_|/,.:\s]+|[-_|/,.:\s]+$/g, "");
}

// ---------- 通讯录 ----------
export type ContactRow = { booking: string; name: string; phone: string; contact: string };

/** 读取所有已连接帐号的通讯录，存进 contact_bookings 表。force = 不管多久前读过都重读 */
export async function refreshContacts(force = false) {
  const s = await getSettings();
  const last = s.schedule?.contactsAt ? new Date(s.schedule.contactsAt).getTime() : 0;
  if (!force && Date.now() - last < CONTACTS_TTL_MS) return { skipped: true };
  const errors: string[] = [];
  let total = 0;
  const countryCode = (env("WHATSAPP_COUNTRY_CODE") || "60").replace(/\D/g, "");
  for (const l of await db.listGoogleLinks()) {
    try {
      const people = await fetchContacts(l as any);
      const rows: ContactRow[] = [];
      for (const p of people) {
        const phone = normPhone(p.phone, countryCode);
        if (!phone) continue;
        for (const b of bookingsInName(p.name)) rows.push({ booking: b, name: nameWithoutBooking(p.name), phone, contact: p.name });
      }
      await db.replaceContactBookings((l as any).user_id, rows);
      total += rows.length;
    } catch (err: any) {
      errors.push(`${(l as any).gmail}: ${err?.message || err}`);
    }
  }
  await saveSettings({ schedule: { ...(s.schedule || {}), contactsAt: new Date().toISOString(), contactsCount: total, contactsError: errors.join(" ; ") || null } });
  return { total, errors };
}
/** 用 booking number 找联络人（同一个电话只算一次） */
export async function findCustomer(booking: string) {
  const rows: any[] = await db.findContactBookings(booking);
  const byPhone = new Map<string, any>();
  for (const r of rows) if (!byPhone.has(r.phone)) byPhone.set(r.phone, r);
  return [...byPhone.values()];
}

// ---------- 自动填上客户资料 ----------
/**
 * 未来几天、标题有 booking number 的行程：
 * - 没有填客户电话（或之前是自动填的）→ 从通讯录找，找到就填上
 * - 员工自己填过电话的行程不会被改
 */
export async function autoFillUpcoming(opts: { forceContacts?: boolean; days?: number } = {}) {
  const s = await getSettings();
  if (s.schedule?.enabled === false) return { skipped: true };
  await refreshContacts(!!opts.forceContacts).catch((e) => console.error("[Schedule] 读取通讯录失败：", e));
  const text = s.schedule?.text || DEFAULT_TEXT;
  const result = { filled: 0, notFound: 0, multiple: 0 };
  for (const e of await db.upcomingForSchedule(opts.days ?? LOOKAHEAD_DAYS)) {
    if (e.customer_source !== "auto" && e.customer_phone) continue; // 员工自己填的，不动
    const booking = bookingFromTitle(e.title);
    if (!booking) continue;
    const found = await findCustomer(booking);
    if (found.length === 1) {
      const c = found[0];
      await db.setAutoCustomer(e.id, { phone: c.phone, name: c.name || null, note: e.customer_note || text });
      result.filled++;
    } else {
      const status = found.length ? "multiple" : "notfound";
      await db.setCustomerLookup(e.id, status, found.map((c: any) => c.contact).join("、") || null);
      if (found.length) result.multiple++; else result.notFound++;
    }
  }
  return result;
}

/**
 * 每 3 天一次（App 时区，早上 8 点后）：重读通讯录，检查未来一个月的行程。
 * 找不到电话的会出现在「WhatsApp 提醒 → 找不到电话」。第一次部署后还没检查过 → 马上检查一次。
 */
export async function weeklyScanIfDue(now = new Date()) {
  const s = await getSettings();
  if (s.schedule?.enabled === false) return { skipped: true };
  const tz = s.timezone;
  const today = now.toLocaleDateString("en-CA", { timeZone: tz });
  const hour = Number(now.toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }));
  const last = s.schedule?.weeklyDate;
  const daysSince = last ? Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(last + "T00:00:00Z")) / 86400_000) : Infinity;
  if (last && (daysSince < SCAN_EVERY_DAYS || hour < WEEKLY_HOUR)) return { skipped: true };
  await saveSettings({ schedule: { ...(s.schedule || {}), weeklyDate: today } }); // 先记下，避免同时跑两次
  const r = await autoFillUpcoming({ forceContacts: true, days: WEEKLY_DAYS });
  const s2 = await getSettings();
  await saveSettings({ schedule: { ...(s2.schedule || {}), weeklyAt: new Date().toISOString() } });
  return { weekly: true, ...r };
}

/** 给管理员看的清单：未来几天有 booking number 的行程、找到的电话、会不会发 */
export async function scheduleOverview(sendTimeFor: (e: any, tz: string) => Date) {
  const s = await getSettings();
  const out: any[] = [];
  for (const e of await db.upcomingForSchedule(WEEKLY_DAYS, true)) {
    const booking = bookingFromTitle(e.title);
    if (!booking) continue;
    let status: string;
    const template = templateForTitle(e.title); // 这个预约类型用哪个 Meta 模板（null = 不需要提醒）
    if (e.customer_sent_at) status = "sent";
    else if (!template) status = "notype";
    else if (e.customer_error) status = "failed";
    else if (e.customer_lookup === "multiple") status = "multiple";
    else if (!e.customer_phone) status = e.customer_lookup === "notfound" ? "notfound" : "pending"; // pending = 还没检查过
    else if (!e.customer_auto) status = "off";
    else status = s.schedule?.preview !== false ? "preview" : "scheduled";
    out.push({
      id: e.id, calendar_id: e.calendar_id, booking, template, title: e.title, start: e.start, all_day: !!e.all_day,
      phone: e.customer_phone || null, name: e.customer_name || null, source: e.customer_source || null,
      contacts: e.customer_lookup_detail || null, status, error: e.customer_error || null,
      sent_at: e.customer_sent_at, send_at: sendTimeFor(e, s.timezone).toISOString(),
    });
  }
  return out;
}
