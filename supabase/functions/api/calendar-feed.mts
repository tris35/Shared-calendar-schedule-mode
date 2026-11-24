// 订阅链接（免设定）：/cal/<签名>.ics
// 在 Google 日历「新增日历 → 透过网址」贴上即可。Google 每隔几小时更新一次；不支援颜色和通知。
import { Buffer } from "node:buffer";
import * as db from "./lib/db.mts";
import { getSettings, verify } from "./lib/settings.mts";
import { eventDescription, dateOnly, addDays, mainUrl } from "./lib/gcal.mts";
import { normLang, desc } from "./lib/i18n.mts";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
// 每行最多 75 字节（iCalendar 规定），超过就折行
function fold(line: string) {
  const out: string[] = [];
  let cur = "", bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > 74) { out.push(cur); cur = " "; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n");
}

export async function handleFeed(req: Request, file: string): Promise<Response> {
  // 现在每个帐号有自己的日历：旧的「所有行程」订阅链接会看到别人的日历，所以停用
  void file; void verify;
  return new Response("This subscription link is no longer available. Use Google Calendar sync instead.", { status: 410 });
  const { timezone } = await getSettings();
  const siteUrl = mainUrl(new URL(req.url).origin);
  const lang = normLang(new URL(req.url).searchParams.get("lang"));
  const from = new Date(Date.now() - 180 * 86400000).toISOString(), to = new Date(Date.now() + 2 * 365 * 86400000).toISOString();
  const events = await db.listEvents({ from, to });
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//family-calendar//ZH", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${desc(lang, "calendar")}`, `X-WR-TIMEZONE:${timezone}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:fc-${e.id}@${new URL(siteUrl).host}`, `DTSTAMP:${stamp(e.google_synced_at || e.created_at)}`);
    if (e.all_day) {
      const sd = dateOnly(e.start, timezone), ed = e.end ? dateOnly(e.end, timezone) : sd;
      lines.push(`DTSTART;VALUE=DATE:${sd.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(ed, 1).replace(/-/g, "")}`);
    } else {
      lines.push(`DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end || new Date(new Date(e.start).getTime() + 3600_000).toISOString())}`);
    }
    lines.push(`SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(await eventDescription(e, siteUrl, timezone, false, lang))}`,
      `URL:${siteUrl}/#event-${e.id}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
