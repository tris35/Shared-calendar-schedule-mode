// 给客户的 WhatsApp 讯息（WhatsApp Business Cloud API）
// 行程前一天下午 2 点（App 时区，可在 Schedule Mode 设定改）自动发送；也可以在行程页按「立即发送」。
// WhatsApp 规定：主动发给客户的讯息必须用 Meta 审核过的「讯息模板」，模板里的 {{1}} 换成你写的讯息。
import * as db from "./db.mts";
import { env } from "./env.mts";
import { wallToUtc } from "./time.mts";
import { getSettings } from "./settings.mts";

export const DEFAULT_SEND_HOUR = 14; // 下午 2 点
/** 前一天几点发（Schedule Mode 设定） */
export const sendHourOf = (s: any) => {
  const h = Number(s?.schedule?.sendHour);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : DEFAULT_SEND_HOUR;
};
/** 预览模式：只显示会发给谁，不真的发（默认关：WhatsApp 设定好就会发） */
export const isPreview = (s: any) => s?.schedule?.preview === true;

// 两种接法：Kapso（KAPSO_API_KEY，推荐）或直接用 Meta（WHATSAPP_TOKEN）
export function waConfig() {
  const kapso = env("KAPSO_API_KEY"), token = env("WHATSAPP_TOKEN"), phoneId = env("WHATSAPP_PHONE_NUMBER_ID");
  if (!(kapso || token) || !phoneId) return null;
  return {
    phoneId,
    headers: kapso ? { "X-API-Key": kapso } : { Authorization: `Bearer ${token}` },
    template: env("WHATSAPP_TEMPLATE") || "customer_note",
    lang: env("WHATSAPP_TEMPLATE_LANG") || "zh_CN",
    version: env("WHATSAPP_API_VERSION") || (kapso ? "v24.0" : "v23.0"),
    base: env("WHATSAPP_API_BASE") || (kapso ? "https://api.kapso.ai/meta/whatsapp" : "https://graph.facebook.com"),
    cc: (env("WHATSAPP_COUNTRY_CODE") || "60").replace(/\D/g, ""),
  };
}

/**
 * 任何国家的电话 → WhatsApp 格式（国码 + 号码，只有数字）
 *   +65 9123 4567 / 0065 9123 4567 / 6591234567 → 6591234567（有国码：原样）
 *   012-345 6789 → 60123456789（0 开头 = 本地号码，加上默认国码 cc，马来西亚 60）
 *   11-5660 4342 → 601156604342（马来西亚手机少了前面的 0）
 */
export function normPhone(raw: string, cc = "60") {
  const s = String(raw || "").trim();
  let d = s.replace(/\D/g, "");
  if (!d) return "";
  if (s.startsWith("+")) { /* 已有国码 */ }
  else if (d.startsWith("00")) d = d.slice(2);                          // 00 + 国码
  else if (d.startsWith("0")) d = cc + d.slice(1);                      // 本地号码
  else if (cc === "60" && /^1\d{8,9}$/.test(d)) d = cc + d;             // 马来西亚手机少了 0
  else if (d.length <= 8) d = cc + d;                                   // 太短：当成本地号码
  // 其他（10 位以上、不是 0 开头）：当成已经有国码，例如 6591234567、447911123456、8613800138000
  return d.length >= 8 && d.length <= 15 ? d : "";
}

/** WhatsApp 模板的参数不能有换行 → 换行变成「 | 」 */
/** 给客户的讯息 = 自己写的开头 + 这个行程的讯息 + 自己写的结尾（{title} {date} {time} 会换成行程资料） */
export async function customerText(e: any, settings?: any) {
  const s = settings || (await getSettings());
  const tz = s.timezone;
  const title = showTitle(e) && e.title ? `*${String(e.title).trim().replace(/\*/g, "")}*` : ""; // 标题粗体
  return flattenNote([title, fillText(e.customer_note || "", e, tz)].filter((x) => x.trim()).join("\n")); // 发出去的 = 行程标题 + 行程里写的讯息
}
/** 自动从通讯录填的提醒不加行程标题（标题里有员工名字等内部资料） */
const showTitle = (e: any) => e.customer_source !== "auto" && e.customer_source !== "typed";
/** {name} {date} {time} {booking} {title} → 这个行程的资料（中文格式：11月25日 周二、下午3:30） */
export function fillText(text: string, e: any, tz: string) {
  const d = new Date(e.start);
  const name = String(e.customer_name || "").trim();
  const booking = (String(e.title || "").match(/^\s*(WM\s*\d+|\d{3,6})(?!\d)/i)?.[1] || "").replace(/\s+/g, "").toUpperCase();
  const date = d.toLocaleDateString("zh-CN", { timeZone: tz, month: "long", day: "numeric", weekday: "short" });
  const time = e.all_day ? "" : d.toLocaleTimeString("zh-CN", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true });
  return String(text || "")
    .replaceAll("{user}", name).replaceAll("{name}", name ? ` ${name}` : "")
    .replaceAll("{title}", e.title || "").replaceAll("{booking}", booking)
    .replaceAll("{date}", date).replaceAll("{time}", time)
    .replace(/[ \t]{2,}/g, " ");
}
export function flattenNote(note: string) {
  return String(note || "").replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean).join(" | ")
    .replace(/\t/g, " ").replace(/ {4,}/g, "   ").slice(0, 1000);
}

/** 这个行程的发送时间：自己选的，或前一天下午 2 点（hour = 设定的时间） */
export function sendTimeFor(e: any, tz: string, hour = DEFAULT_SEND_HOUR) {
  return e.customer_send_at ? new Date(e.customer_send_at) : customerSendAt(new Date(e.start).toISOString(), tz, hour);
}
export function customerSendAt(startIso: string, tz: string, hour = DEFAULT_SEND_HOUR) {
  const ymd = new Date(startIso).toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  const [y, m, d] = ymd.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d) - 86400_000).toISOString().slice(0, 10);
  return wallToUtc(prev, hour, 0, tz);
}

/** 这个月（App 时区）用了几则、上限几则 */
export async function waUsage() {
  const { timezone, waLimit } = await getSettings();
  const ym = new Date().toLocaleDateString("en-CA", { timeZone: timezone }).slice(0, 7); // YYYY-MM
  const sent = await db.countWaSentSince(wallToUtc(`${ym}-01`, 0, 0, timezone));
  const limit = waLimit && waLimit > 0 ? waLimit : null;
  return { sent, limit, full: limit != null && sent >= limit };
}

/** 普通文字讯息（保留换行、空行）：只有客户 24 小时内传过讯息给你时 WhatsApp 才允许 */
async function sendPlainText(to: string, text: string) {
  const c = waConfig();
  if (!c) throw new Error("WhatsApp 还没设定");
  const res = await fetch(`${c.base}/${c.version}/${c.phoneId}/messages`, {
    method: "POST",
    headers: { ...c.headers, "Content-Type": "application/json" } as unknown as Record<string, string>,
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 4000), preview_url: false } }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || String(res.status));
  return data?.messages?.[0]?.id as string | undefined;
}
/** 给客户：先试普通文字（有空行），不行（超过 24 小时）就用核准的模板（一行，用 | 分开） */
async function sendCustomerText(to: string, e: any) {
  const bold = (x: string) => (x.trim() ? `*${x.trim().replace(/\*/g, "")}*` : ""); // WhatsApp：*文字* = 粗体
  const { timezone } = await getSettings();
  const body = fillText(String(e.customer_note || "").replace(/\r/g, ""), e, timezone);
  const full = [showTitle(e) ? bold(e.title || "") : "", body].filter((x) => x.trim()).join("\n\n");
  try { return await sendPlainText(to, full); }
  catch { return await sendTemplate(to, await customerText(e)); }
}
async function sendTemplate(to: string, text: string) {
  const c = waConfig();
  if (!c) throw new Error("WhatsApp 还没设定");
  const res = await fetch(`${c.base}/${c.version}/${c.phoneId}/messages`, {
    method: "POST",
    headers: { ...c.headers, "Content-Type": "application/json" } as unknown as Record<string, string>,
    body: JSON.stringify({
      messaging_product: "whatsapp", to, type: "template",
      template: { name: c.template, language: { code: c.lang },
        ...(c.template === "hello_world" ? {} : { components: [{ type: "body", parameters: [{ type: "text", text }] }] }) }, // Meta 测试模板 hello_world 没有变量
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data?.error || {};
    throw new Error(`WhatsApp 错误：${[e.message, e.error_data?.details].filter(Boolean).join(" – ") || res.status}`);
  }
  return data?.messages?.[0]?.id as string | undefined;
}

/** 测试：把现在的讯息（用范例资料）发到这个电话 */
export async function sendTest(phone: string, text: string) {
  const c = waConfig();
  if (!c) throw new Error("WhatsApp 还没设定");
  const to = normPhone(phone, c.cc);
  if (!to) throw new Error("电话号码不正确");
  const { timezone } = await getSettings();
  const start = new Date(Date.now() + 86400_000);
  const body = fillText(text, { title: "6961 测试", start: start.toISOString(), customer_name: "", all_day: false }, timezone);
  try { await sendPlainText(to, body); return { ok: true, to, mode: "text" }; }
  catch { await sendTemplate(to, flattenNote(body)); return { ok: true, to, mode: "template" }; }
}

/** 发送某个行程给客户的讯息；force = 手动立即发送（就算已经发过） */
export async function sendCustomerMessage(eventId: number, opts: { force?: boolean; author?: string | null } = {}) {
  const c = waConfig();
  if (!c) throw new Error("WhatsApp 还没设定");
  const e: any = await db.getEvent(eventId);
  if (!e) throw new Error("找不到");
  if (e.customer_source === "auto" || e.customer_source === "typed") { // 所有自动提醒都用「WhatsApp 提醒」页签现在的讯息
    const s = await getSettings();
    e.customer_note = s.schedule?.text || e.customer_note;
  }
  if (!e.customer_phone) throw new Error("请填写客户电话");
  if (!e.customer_note) throw new Error("请填写给客户的讯息");
  const to = normPhone(e.customer_phone, c.cc);
  if (!to) { await db.setCustomerError(eventId, "电话号码不正确"); throw new Error("电话号码不正确"); }
  const usage = await waUsage();
  if (usage.full) {
    const msg = `本月 WhatsApp 讯息已用完（${usage.limit} 则）`;
    await db.setCustomerError(eventId, msg);
    throw new Error(msg);
  }
  if (!(await db.claimCustomerSend(eventId, !!opts.force))) return { skipped: true };
  try {
    await sendCustomerText(to, e);
    await db.recordWaSent(eventId);
    await db.logEvent(eventId, opts.author ?? null, "customer_sent");
    return { ok: true };
  } catch (err: any) {
    const msg = String(err?.message || err);
    await db.setCustomerError(eventId, msg);
    await db.logEvent(eventId, opts.author ?? null, "customer_failed");
    throw err;
  }
}

/** 排程：发送到时间的讯息（前一天下午 4 点之后、行程开始之前） */
export async function sendDueCustomerMessages() {
  const s = await getSettings();
  const { timezone } = s;
  const hour = sendHourOf(s);
  const due = (await db.pendingCustomerMessages()).filter((e: any) => sendTimeFor(e, timezone, hour).getTime() <= Date.now());
  if (isPreview(s)) return { preview: true, due: due.length }; // 预览模式：不发
  if (!waConfig()) return { skipped: true };
  let sent = 0, failed = 0;
  for (const e of due) {
    try { const r: any = await sendCustomerMessage(e.id); if (r.ok) sent++; }
    catch (err: any) { failed++; console.error(`[WhatsApp] 行程 ${e.id} 发送失败：`, err?.message || err); }
  }
  return { sent, failed };
}

// ---------- WhatsApp 行程摘要（每天早上 / 每周一早上） ----------
const ymdIn = (d: Date, tz: string) => d.toLocaleDateString("en-CA", { timeZone: tz });
const plusDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};

/** 摘要文字：日期、时间、谁、标签名称，已完成的打 ✓。WhatsApp 模板参数不能换行，所以用 | 分隔 */
export async function buildDigest(mode: "daily" | "weekly", now = new Date(), forDate?: string) {
  const { timezone, labelNames = {} } = await getSettings();
  const today = forDate || ymdIn(now, timezone);
  let from = today, days = 1;
  if (mode === "weekly") { // 从这个星期一开始的 7 天
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = 星期日
    from = plusDays(today, -((dow + 6) % 7)); days = 7;
  }
  const to = plusDays(from, days);
  const events = await db.listEvents({ from: wallToUtc(from, 0, 0, timezone).toISOString(), to: wallToUtc(to, 0, 0, timezone).toISOString() });
  const label = (id: string | null) => (id ? labelNames[id] || db.LABELS[id]?.name : null);
  const fmtT = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true });
  const fmtD = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const line = (e: any) => [e.done_at ? "✓" : "•", e.all_day ? "" : fmtT(e.start), e.title,
    e.member_name ? `(${[e.member_emoji, e.member_name].filter(Boolean).join(" ")})` : "", label(e.label) ? `[${label(e.label)}]` : ""]
    .filter(Boolean).join(" ");
  const parts: string[] = [];
  if (mode === "daily") {
    parts.push(`📅 ${forDate ? "" : "Today "}${fmtD(today)}: ${events.length} event${events.length === 1 ? "" : "s"}`);
    parts.push(...events.map(line));
  } else {
    parts.push(`📋 This week ${fmtD(from)} – ${fmtD(plusDays(from, 6))}: ${events.length} event${events.length === 1 ? "" : "s"}`);
    for (let i = 0; i < 7; i++) {
      const d = plusDays(from, i);
      const evs = events.filter((e: any) => ymdIn(new Date(e.start), timezone) === d);
      if (evs.length) parts.push(`${fmtD(d)}: ${evs.map(line).join(" ; ")}`);
    }
  }
  if (!events.length) parts.push("Nothing scheduled 🎉");
  const text = parts.join(" | ");
  return text.length > 1000 ? text.slice(0, 990) + " …" : text; // WhatsApp 模板参数上限
}

/** 排程（每 15 分钟）：到了设定的时间就发摘要给设定的电话，每天最多一次 */
export async function sendDigestIfDue(now = new Date()) {
  const s = await getSettings();
  const d = s.digest;
  if (!d || d.mode === "off" || !d.phones?.length || !waConfig()) return { skipped: true };
  const today = ymdIn(now, s.timezone);
  if (d.lastSent === today) return { skipped: true };
  const hour = Number(now.toLocaleString("en-GB", { timeZone: s.timezone, hour: "2-digit", hourCycle: "h23" }));
  if (hour < d.hour) return { skipped: true };
  if (d.mode === "weekly" && new Date(`${today}T12:00:00Z`).getUTCDay() !== 1) return { skipped: true }; // 只在星期一
  if (d.mode === "date" && d.date !== today) return { skipped: true }; // 只在指定的那天
  const { saveSettings } = await import("./settings.mts");
  await saveSettings({ digest: { ...d, lastSent: today } }); // 先记下，避免同时发两次
  const text = await buildDigest(d.mode === "weekly" ? "weekly" : "daily");
  const c = waConfig()!;
  let sent = 0, failed = 0;
  for (const raw of d.phones) {
    if ((await waUsage()).full) break; // 本月上限到了
    try { await sendTemplate(normPhone(raw, c.cc), text); await db.logWaDigest(); sent++; }
    catch (err: any) { failed++; console.error("[WhatsApp 摘要] 发送失败：", err?.message || err); }
  }
  return { sent, failed };
}
