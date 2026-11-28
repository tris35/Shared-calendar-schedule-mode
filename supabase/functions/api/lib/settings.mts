// 设置：存在资料库的 kv 表（只有服务器端读得到，不会出现在网页里）
import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { DEFAULT_TZ } from "./time.mts";
import { getKv, setKv } from "./db.mts";
import { apiBase } from "./env.mts";

export type Settings = {
  timezone: string;
  secret: string;              // 用来签名（照片链接、订阅链接、Google 登录）
  waLimit?: number | null;     // 每个月最多发几则 WhatsApp（例如 Kapso 免费方案的上限）；空 = 不限
  cronKey: string;             // 资料库排程（pg_cron）呼叫 /api/cron/* 时用的密钥
  cronUrl?: string;            // 排程要呼叫的网址（这个函数自己的网址，自动记下）
  labelNames?: Record<string, string>; // 颜色标签的自订名称（例如 番茄红 = 拍摄），所有人共用
  digest?: Digest;             // WhatsApp 行程摘要（每天 / 每周）
  waIntro?: string;            // 给客户的讯息：自己写的开头（可用 {title} {date} {time}）
  waOutro?: string;            // 给客户的讯息：自己写的结尾
  waDefault?: string;          // 新行程「给客户的讯息」默认内容
  adminEmails?: string[];      // 在 App「设置」加的管理员（另外还有 Supabase 密钥 ADMIN_EMAILS）
  topAdmins?: string[];
  lastBackup?: string;         // 上次寄出每周备份的时间        // Top Admin（可以批准管理员申请、收到弹出通知）；没设定 = 第一批管理员
  schedule?: Schedule;         // Schedule Mode：用 booking number 从通讯录找电话，自动提醒
};

export type Schedule = {
  enabled?: boolean;           // 自动从通讯录填客户电话（默认开）
  preview?: boolean;           // 预览模式：只显示会发给谁，不真的发（默认开，Meta 验证通过后再关）
  sendHour?: number;           // 前一天几点发（App 时区），默认 14 = 下午 2 点
  text?: string;               // 提醒内容（可用 {name} {date} {time} {booking} {title}）
  contactsAt?: string | null;  // 最后一次读通讯录的时间
  contactsCount?: number;      // 找到几个有 booking number 的联络人
  contactsError?: string | null;
  weeklyDate?: string;         // 每 3 天检查：最后一次是哪天（YYYY-MM-DD）
  weeklyAt?: string;           // 每 3 天检查：完成时间
};

export type Digest = {
  mode: "off" | "daily" | "weekly" | "date"; // date = 只在指定的那天发一次（那天的行程）
  date?: string;                    // mode = "date" 时：要发的日期（YYYY-MM-DD）
  hour: number;                     // 几点发（App 时区）
  phones: string[];                 // 收件人电话
  lastSent?: string;                // 最后一次发送的日期（YYYY-MM-DD），避免重复
};

/** 在 App 里加的管理员（小写），getSettings / saveSettings 时更新 */
export let extraAdmins: string[] = [];
/** Top Admin 的 Gmail（小写）；null = 还没设定过（用第一批管理员） */
export let topAdmins: string[] | null = null;

let cache: { at: number; value: Settings } | null = null;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < 5000) return cache.value;
  const s = ((await getKv("app")) as Partial<Settings> | null) ?? {};
  let changed = false;
  if (!s.secret) { s.secret = crypto.randomBytes(32).toString("hex"); changed = true; }
  if (!s.cronKey) { s.cronKey = crypto.randomBytes(24).toString("hex"); changed = true; }
  if (!s.timezone) { s.timezone = DEFAULT_TZ; changed = true; }
  const base = apiBase();
  if (base && s.cronUrl !== base) { s.cronUrl = base; changed = true; }
  if (changed) await setKv("app", s);
  cache = { at: Date.now(), value: s as Settings };
  extraAdmins = (s.adminEmails || []).map((x) => x.toLowerCase());
  topAdmins = s.topAdmins ? s.topAdmins.map((x) => x.toLowerCase()) : null;
  return s as Settings;
}

export async function saveSettings(patch: Partial<Settings>) {
  const s = { ...(await getSettings()), ...patch };
  await setKv("app", s);
  cache = { at: Date.now(), value: s };
  extraAdmins = (s.adminEmails || []).map((x) => x.toLowerCase());
  topAdmins = s.topAdmins ? s.topAdmins.map((x) => x.toLowerCase()) : null;
  return s;
}

export async function sign(text: string) {
  const { secret } = await getSettings();
  return crypto.createHmac("sha256", secret).update(text).digest("hex").slice(0, 32);
}
export async function verify(text: string, sig: string) {
  const good = await sign(text);
  return typeof sig === "string" && sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
export const photoSignature = (photoId: number) => sign(`photo:${photoId}`);
export const verifyPhotoSignature = (photoId: number, sig: string) => verify(`photo:${photoId}`, sig);
