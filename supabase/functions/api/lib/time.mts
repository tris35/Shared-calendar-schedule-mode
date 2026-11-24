// 时区工具：提醒时间 = 行程「前一天 12:00」（以 APP_TIMEZONE 为准）
import { env } from "./env.mts";
export const DEFAULT_TZ = env("APP_TIMEZONE") || "Asia/Kuala_Lumpur";
export const REMIND_HOUR = 12;

function tzOffsetMs(date: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** 行程开始时间 → 提醒时间（前一天 12:00，当地时间） */
export function reminderAt(startIso: string | Date, tz: string) {
  const start = new Date(startIso);
  const local = new Date(start.getTime() + tzOffsetMs(start, tz)); // 当地时间（以 UTC 字段表示）
  const wall = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - 1, REMIND_HOUR, 0, 0);
  const guess = new Date(wall - tzOffsetMs(start, tz));
  return new Date(wall - tzOffsetMs(guess, tz));
}

/** 当地时间（某时区的 年-月-日 时:分）→ UTC 时间 */
export function wallToUtc(ymd: string, hour: number, minute: number, tz: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, hour, minute, 0);
  const guess = new Date(wall - tzOffsetMs(new Date(wall), tz));
  return new Date(wall - tzOffsetMs(guess, tz));
}
