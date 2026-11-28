// 备份：每个星期一早上自动寄给 Top Admin（Gmail 附件），管理员也可以在「设置」随时下载
//   events.csv   每个活动一行（用 Excel 打开）
//   backup.json  网站全部资料（可以用来复原）；不含密码、Google 授权、签名密钥；照片档案留在 Supabase，这里只有照片的资料
import { env } from "./env.mts";
import * as db from "./db.mts";
import { getSettings, saveSettings } from "./settings.mts";
import { isTopAdmin } from "./auth.mts";
import { calTemplates, calLabels } from "./dashboard.mts";

const TABLES: [string, string][] = [
  ["calendars", "SELECT id, name, owner_id, label_names, event_templates, labels, created_at FROM calendars ORDER BY id"],
  ["users", "SELECT id, email, name, emoji, color, birth_month, birth_day, lang, timezone, onboarded, removed_at, created_at FROM users ORDER BY id"],
  ["calendar_members", "SELECT * FROM calendar_members ORDER BY calendar_id, user_id"],
  ["members", "SELECT * FROM members ORDER BY id"],
  ["events", "SELECT * FROM events ORDER BY id"],
  ["comments", "SELECT * FROM comments ORDER BY id"],
  ["photos", "SELECT id, event_id, blob_key, mime, caption, author, size, created_at FROM photos ORDER BY id"],
  ["event_log", "SELECT * FROM event_log ORDER BY id"],
  ["activity", "SELECT * FROM activity ORDER BY id"],
  ["dash_rates", "SELECT * FROM dash_rates ORDER BY calendar_id, brand, cat, from_date"],
  ["dash_manual", "SELECT * FROM dash_manual ORDER BY id"],
  ["admin_requests", "SELECT * FROM admin_requests ORDER BY id"],
];

const csvCell = (v: any) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function buildBackup() {
  const s = await getSettings();
  const tz = s.timezone || "Asia/Kuala_Lumpur";
  const data: Record<string, any[]> = {};
  for (const [name, query] of TABLES) data[name] = await db.rawQuery(query);
  const settings = { timezone: s.timezone, adminEmails: s.adminEmails || [], topAdmins: s.topAdmins || null };
  const now = new Date();
  const json = JSON.stringify({ app: "the-legend-calendar", version: 2, exported_at: now.toISOString(), timezone: tz, settings, tables: data }, null, 1);

  // Excel 用的活动清单
  const cals = new Map(data.calendars.map((c: any) => [c.id, c]));
  const users = new Map(data.users.map((u: any) => [u.id, u]));
  const d = (iso: any) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });
  const tm = (iso: any) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const TICK: Record<string, string> = { non_all_soft: "Non-All Soft", all_soft: "All Soft", visit: "上门了解", vc: "VC了解" };
  const rows = [["日期 Date", "开始 Start", "结束 End", "全天 All day", "标题 Title", "模板 Template", "品牌 Brand", "勾选 Tick", "标签 Label", "负责人 Owner", "日历 Calendar", "备注 Notes", "在回收站 In bin"]];
  for (const e of data.events) {
    const cal: any = cals.get(e.calendar_id);
    const tpl = calTemplates(cal).find((t: any) => t.id === e.template_id);
    const lab = calLabels(cal).find((l: any) => l.id === e.label_id);
    rows.push([d(e.start), e.all_day ? "" : tm(e.start), e.end && !e.all_day ? tm(e.end) : "", e.all_day ? "Y" : "", e.title, tpl?.name || "",
      e.brand || "", TICK[e.soft || e.sales_type] || "", lab?.name || "", (users.get(e.created_by_id) as any)?.name || e.created_by || "", cal?.name || "", e.notes || "", e.deleted_at ? "Y" : ""]);
  }
  rows.sort((a, b) => (a === rows[0] ? -1 : b === rows[0] ? 1 : (a[0] + a[1]).localeCompare(b[0] + b[1])));
  const csv = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"); // ﻿：Excel 才会正确显示中文
  const stamp = now.toLocaleDateString("en-CA", { timeZone: tz });
  return { json, csv, stamp, counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])) };
}

const KEEP = 8; // 保留最近 8 个星期
/** 每周备份：存在网站里（不寄信），只保留最近 8 份 */
export async function saveBackup() {
  const b = await buildBackup();
  await db.saveBackupRow(b.stamp, b.csv, b.json, b.counts);
  await db.trimBackups(KEEP);
  await saveSettings({ lastBackup: new Date().toISOString() } as any);
  return { ok: true, stamp: b.stamp, counts: b.counts };
}
/** （不再使用）寄备份给 Top Admin；没有设定 Gmail 就在网站里通知 */
export async function sendBackup() {
  const tops = (await db.activeUsers()).filter((u: any) => isTopAdmin(u));
  if (!tops.length) return { ok: false, error: "没有 Top Admin" };
  const b = await buildBackup();
  const gUser = (env("GMAIL_USER") || "").trim(), gPass = (env("GMAIL_APP_PASSWORD") || "").replace(/\s+/g, "");
  const ids = tops.map((u: any) => u.id);
  if (!gUser || !gPass) {
    await db.notify(ids, "backup", "每周备份没有寄出：还没设定寄信用的 Gmail（GMAIL_USER、GMAIL_APP_PASSWORD）。可以先在「设置」下载备份。", "backup:nomail", 24 * 6);
    return { ok: false, error: "no gmail" };
  }
  const nodemailer = (await import("nodemailer")).default;
  const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: gUser, pass: gPass } });
  const n = b.counts.events, text = `The Legend Wedding 网站每周备份（${b.stamp}）\n\n活动 ${n} 个、照片资料 ${b.counts.photos} 笔、成员 ${b.counts.users} 位。\n\n` +
    `events.csv：每个活动一行，可以用 Excel 打开。\nbackup.json：网站全部资料，需要复原时交给负责维护的人。\n照片档案本身留在 Supabase，没有放进这封信。\n\n请把这封信保存好（例如放进公司的 Google Drive）。`;
  try {
    await t.sendMail({
      from: `"The Legend Calendar" <${gUser}>`, to: tops.map((u: any) => u.email).join(", "),
      subject: `The Legend 网站备份 ${b.stamp}`, text,
      attachments: [{ filename: `the-legend-events-${b.stamp}.csv`, content: b.csv }, { filename: `the-legend-backup-${b.stamp}.json`, content: b.json }],
    });
  } catch (e: any) {
    console.error("[备份]", e?.message || e);
    await db.notify(ids, "backup", `每周备份寄信失败：${String(e?.message || e).slice(0, 200)}`, "backup:fail", 24 * 6);
    return { ok: false, error: String(e?.message || e) };
  }
  await saveSettings({ lastBackup: new Date().toISOString() } as any);
  return { ok: true, to: tops.length, counts: b.counts };
}
