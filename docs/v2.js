// The Legend Wedding + WM：第 2 版网站（B2 设计）
// 页面：Calendar、Photo Selection、Sales Analysis、Rates、Label & People、最新动态；左下角 ⚙️ 设置

// ---------------- 小工具 ----------------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
const API_BASE = String(window.APP_CONFIG?.apiBase || "").replace(/\/$/, "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordOk = (pw) => pw.length >= 6 && /[^\p{L}\p{N}\s]/u.test(pw);
const DASH_START = "2026-12-01"; // 10、11 月是固定数据，从 12 月开始才算行程

// ---------------- 语言 ----------------
const LANGS = { zh: "中文", en: "English" };
const T = {
  login: ["登录", "Log in"], signup: ["注册", "Sign up"], email: ["Gmail", "Gmail"], password: ["密码", "Password"],
  forgot: ["忘记密码？", "Forgot password?"], have_acct: ["已有帐号？登录", "Have an account? Log in"], no_acct: ["还没有帐号？注册", "No account? Sign up"],
  pw_rule: ["密码至少 6 个字，并包含 1 个特殊符号", "At least 6 characters with 1 symbol"], bad_email: ["请输入正确的 Gmail 地址", "Enter a valid Gmail address"],
  send_code: ["寄验证码", "Send code"], code: ["验证码", "Code"], new_pw: ["新密码", "New password"], reset: ["重设密码", "Reset password"], back: ["返回", "Back"],
  code_sent: ["验证码已寄出", "Code sent"],
  ob_look: ["选择你的头像", "Choose your avatar"], ob_look_t: ["上传一张照片，或选 Emoji 和颜色", "Upload a photo, or pick an emoji and colour"],
  upload_photo: ["上传照片", "Upload Photo"], change_photo: ["换照片", "Change Photo"], remove_photo: ["移除照片", "Remove Photo"],
  photo_bad: ["这张照片打不开，请换一张", "This photo can't be opened. Please try another."], cf_rm_photo: ["移除头像照片？", "Remove your avatar photo?"], cf_rm_photo_t: ["会改回用你的 Emoji。", "Your emoji will be shown instead."], ob_name: ["你的名字", "Your name"], ob_bd: ["你的生日", "Your birthday"],
  ob_bd_note: ["填写后，每年你的生日会自动加入日历，并同步到 Google 日历，日历里的人都看得到。可以不填。", "If you fill this in, your birthday is added to the calendar every year and synced to Google Calendar, where everyone in the calendar can see it. Optional."],
  ob_cal: ["建立或加入日历", "Create or join a calendar"], create: ["建立", "Create"], join: ["加入", "Join"], cal_name: ["日历名称", "Calendar name"],
  invite_link: ["邀请连结", "Invite link"], next: ["下一步", "Next"], skip: ["跳过", "Skip"], done: ["完成", "Done"], welcome: ["欢迎，{name}", "Welcome, {name}"],
  month: ["月", "Month"], day: ["日", "Day"],
  short_calendar: ["日历", "Calendar"], short_photo: ["选片", "Photo"], short_sales: ["销售", "Sales"], short_rates: ["Rates", "Rates"], short_people: ["人员", "People"], short_activity: ["动态", "Activity"],
  person_ic: ["负责人", "Person In Charge"], need_person: ["请选择负责人", "Please Choose The Person In Charge"], choose_person: ["选择负责人", "Choose Person"],
  loading: ["读取中…", "Loading…"],
  tick_type: ["类型", "Type"], need_ticks: ["请填好红色 * 的栏位", "Please fill in the fields marked *"],
  time: ["时间", "Time"], appearance: ["外观", "Appearance"], theme_dark: ["深色", "Dark"], theme_light: ["浅色", "Light"], theme_auto: ["自动", "Auto"],
  offline_title: ["现在离线中", "You're offline"], got_it: ["知道了", "Got it"],
  offline_text: ["你的修改（包括照片和留言）会先存在这台装置，连接网络后自动同步。如果别人同时修改同一个活动，可能会冲突。画面上的资料是 {time} 保存的。", "Your changes (including photos and comments) are saved on this device and sync automatically when you're back online. If someone else changes the same event at the same time, there may be a conflict. Data shown was saved at {time}."],
  offline_pill: ["离线中", "Offline"], offline_pending: ["{n} 笔修改等待同步", "{n} changes waiting to sync"], back_online: ["已重新连线，资料已更新", "Back online, data updated"],
  offline_noedit: ["这个操作需要网络，请连接网络后再试", "This needs an internet connection. Please try again when you're online."],
  synced_n: ["已同步 {n} 笔离线修改", "Synced {n} offline changes"], sync_issues: ["请检查这些活动", "Please check these events"],
  sync_changed: ["「{n}」在你离线时也被别人修改过，现在用的是你的版本。", "\"{n}\" was also changed by someone else while you were offline; your version was kept."],
  sync_gone: ["「{n}」在你离线时已经被删除，你的修改没有上传。", "\"{n}\" was deleted while you were offline, so your change was not uploaded."],
  sync_failed: ["「{n}」无法同步：{e}", "\"{n}\" could not sync: {e}"],
  cf_logout_pending: ["还有 {n} 笔离线修改没有同步，登出后会不见。确定要登出吗？", "{n} offline changes have not synced yet and will be lost if you log out."], offline_nodata: ["离线中，这一页还没有保存的资料", "You're offline and this page hasn't been saved on this device yet."],
  cf_event: ["确定要删除这个活动吗？", "Delete this event?"], cf_event_t: ["「{n}」会放进回收站，5 天内可以复原；Google 日历里的这一笔也会删除。", "\"{n}\" goes to the Recycle Bin (restorable for 5 days) and is also deleted from Google Calendar."],
  cf_comment: ["确定要删除这则留言吗？", "Delete this comment?"], cf_photo: ["确定要删除这张照片吗？", "Delete this photo?"], cf_cant_undo: ["删除后不能复原。", "This can't be undone."],
  cf_person: ["确定要把 {n} 移出日历吗？", "Remove {n} from the calendar?"], cf_person_t: ["他就不能再看或编辑这个日历。", "They will no longer see or edit this calendar."],
  cf_label: ["确定要删除标签「{n}」吗？", "Delete the label \"{n}\"?"], cf_label_t: ["用这个标签的活动会变成没有标签（活动不会被删除）。", "Events with this label lose the label (the events are not deleted)."],
  cf_logout: ["确定要登出吗？", "Log out?"], cf_logout_t: ["下次要再输入 Gmail 和密码登录。", "You will need your Gmail and password to log in again."],
  cf_invite: ["确定要停用邀请连结吗？", "Turn off the invite links?"], cf_invite_t: ["已经发出去的连结就不能再用来加入。", "Links already shared can no longer be used to join."], cf_invite_ok: ["停用", "Turn off"],
  cf_admin: ["确定要移除 {n} 的管理员权限吗？", "Remove {n} as admin?"], cf_admin_t: ["他会变成一般成员。", "They become a normal member."],
  cf_google: ["确定要中断 Google 日历连接吗？", "Disconnect Google Calendar?"], cf_google_t: ["App 和 Google 日历不会再同步（Google 上的活动不会被删除）。", "The app and Google Calendar stop syncing (nothing in Google is deleted)."], cf_google_ok: ["中断", "Disconnect"],
  cf_reject: ["确定要拒绝这个申请吗？", "Reject this request?"], cf_reject_t: ["对方不会成为管理员。", "They will not become an admin."], photos_comments: ["照片和留言", "Photos & Comments"], add_post: ["加入", "Add"], add_title: ["加标题", "Add Title"], pick_tpl_first: ["先在上面选模板（选片 / 了解 / 普通）", "Choose a template above first"],
  search: ["搜索", "Search"], search_ph: ["搜索活动标题或备注…", "Search Event Title Or Notes…"], no_results: ["没有找到活动", "No Events Found"],
  nav_calendar: ["Calendar", "Calendar"], nav_photo: ["Photo Selection", "Photo Selection"], nav_sales: ["Sales Analysis", "Sales Analysis"],
  nav_rates: ["Rates 设置", "Rates"], nav_people: ["Label & People", "Label & People"], nav_activity: ["最新动态", "Activity"], analysis: ["Analysis", "Analysis"],
  settings: ["设置", "Settings"], today: ["今天", "Today"], new_event: ["新增活动", "New event"], edit_event: ["编辑活动", "Edit event"],
  untagged: ["{n} 个活动未选模板", "{n} events without a template"], untagged_title: ["未选模板", "No template"],
  title: ["标题", "Title"], all_day: ["All Day", "All Day"], date: ["日期", "Date"], start: ["开始", "Start"], end: ["结束", "End"],
  template: ["模板", "Template"], label: ["标签", "Label"], notes: ["备注", "Notes"], save: ["保存", "Save"], cancel: ["取消", "Cancel"],
  delete: ["删除", "Delete"], confirm_delete: ["再按一次删除", "Tap again to delete"], edit: ["编辑", "Edit"], close: ["关闭", "Close"],
  brand: ["品牌", "Brand"], visit: ["上门了解", "Visit"], vc: ["VC了解", "VC"], saved: ["已保存", "Saved"], deleted: ["已删除", "Deleted"],
  no_events: ["没有活动", "No events"], owner: ["负责人", "Owner"], post_ph: ["写留言…", "Write a comment…"], post: ["发送", "Post"], photos: ["照片", "Photos"],
  new_label: ["新增标签", "New label"], label_name: ["标签名称", "Label name"], colour: ["颜色", "Colour"], no_tpl: ["不用模板", "No template"],
  people: ["People", "People"], labels: ["Labels", "Labels"], remove: ["移除", "Remove"], confirm_remove: ["再按一次移除", "Tap again to remove"],
  admin: ["管理员", "Admin"], viewer: ["只能查看", "View only"], editor: ["可以编辑", "Can edit"], no_activity: ["还没有动态", "No activity yet"], more: ["更多", "More"],
  profile: ["个人资料", "Profile"], name: ["名字", "Name"], birthday: ["生日", "Birthday"], none: ["不填", "None"], language: ["语言", "Language"], timezone: ["时区", "Time zone"],
  logout: ["登出", "Log out"], apply_admin: ["申请成为管理员", "Apply to be admin"], applied: ["已申请，等待管理员批准", "Applied, waiting for approval"],
  requests: ["管理员申请", "Admin requests"], approve: ["批准", "Approve"], reject: ["拒绝", "Reject"], no_requests: ["没有申请", "No requests"], admins: ["管理员名单", "Admins"],
  google: ["Google 同步", "Google sync"], connect: ["连接 Google", "Connect Google"], disconnect: ["取消连接", "Disconnect"], sync_now: ["立即同步", "Sync now"],
  synced: ["已同步", "Synced"], syncing: ["同步中…", "Syncing…"], templates: ["模板", "Templates"], invites: ["邀请连结", "Invite links"],
  make_edit_link: ["产生「可以编辑」连结", "Create edit link"], make_view_link: ["产生「只能查看」连结", "Create view-only link"], copy: ["复制", "Copy"], copied: ["已复制", "Copied"],
  valid_until: ["有效到 {d}", "Valid until {d}"], revoke_all: ["让所有连结失效", "Revoke all links"], calendar: ["日历", "Calendar"],
  notifications: ["通知", "Notifications"], no_notes: ["没有通知", "No notifications"], view: ["查看", "View"], join_cal_q: ["加入「{name}」？", "Join “{name}”?"],
  a_event_created: ["{who} 建立了「{t}」", "{who} created “{t}”"], a_event_deleted: ["{who} 删除了「{t}」", "{who} deleted “{t}”"],
  a_event_template: ["{who} 选了模板：{t}", "{who} set a template: {t}"], a_label_added: ["{who} 新增了标签「{t}」", "{who} added label “{t}”"],
  a_template_renamed: ["{who} 改了模板名称：{t}", "{who} renamed a template: {t}"], a_person_removed: ["{who} 移除了 {t}", "{who} removed {t}"],
  a_admin_added: ["{who} 批准 {t} 成为管理员", "{who} made {t} an admin"], a_joined: ["{who} 加入了日历", "{who} joined the calendar"],
  a_calendar_created: ["{who} 建立了日历", "{who} created the calendar"],
  just_now: ["刚刚", "just now"], min_ago: ["{n} 分钟前", "{n} min ago"], hr_ago: ["{n} 小时前", "{n} h ago"],
  need_tpl: ["请选择模板", "Choose a template"], need_title: ["请填写标题", "Enter a title"], gmail_for_sync: ["要同步的 Gmail", "Gmail to sync"],
  birthday_evt: ["生日", "Birthday"], top_admin: ["Top Admin", "Top Admin"], make_top: ["设为 Top Admin", "Make Top Admin"], unmake_top: ["取消 Top Admin", "Remove Top Admin"],
  a_top_added: ["{who} 把 {t} 设为 Top Admin", "{who} made {t} a Top Admin"], a_top_removed: ["{who} 取消了 {t} 的 Top Admin", "{who} removed {t} as Top Admin"],
  approved: ["已批准", "Approved"], rejected: ["已拒绝", "Rejected"],
  show_pw: ["显示密码", "Show password"], hide_pw: ["隐藏密码", "Hide password"], all_day_short: ["全天", "All day"],
  backup: ["备份", "Backup"], dl_csv: ["下载活动清单（Excel）", "Download events (Excel)"], dl_json: ["下载完整备份", "Download full backup"],
  last_backup: ["上次自动备份：{d}", "Last automatic backup: {d}"], no_backup: ["每个星期一早上 3 点自动备份，存在网站里（保留 8 个星期）", "Saved automatically every Monday at 3 AM, kept for 8 weeks"], saved_backups: ["自动备份", "Automatic backups"], now_data: ["现在的资料", "Current data"],
  trash: ["回收站", "Recycle bin"], restore: ["复原", "Restore"], restored: ["已复原", "Restored"], trash_empty: ["回收站是空的", "The recycle bin is empty"],
  days_left: ["{n} 天后永久删除", "Deleted for good in {n} days"], hours_left: ["{n} 小时后永久删除", "Deleted for good in {n} h"], deleted_by: ["{who} 删除", "Deleted by {who}"],
  a_event_restored: ["{who} 复原了「{t}」", "{who} restored “{t}”"], storage: ["照片空间", "Photo space"], photos_n: ["{n} 张照片", "{n} photos"], fixed: ["固定", "Fixed"], connected_as: ["已连接：{g}", "Connected: {g}"],
};
let lang = LANGS[store.get("lang")] ? store.get("lang") : (navigator.language || "").startsWith("zh") ? "zh" : "en";
const t = (k, v = {}) => String((T[k] || [k, k])[lang === "zh" ? 0 : 1]).replace(/\{(\w+)\}/g, (_, x) => esc(v[x] ?? ""));
const loc = () => (lang === "zh" ? "zh-CN" : "en-GB");

// ---------------- 时间（用自己的时区） ----------------
const tz = () => state.me?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kuala_Lumpur";
const ymdIn = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: tz() });
const hmIn = (d) => new Date(d).toLocaleTimeString("en-GB", { timeZone: tz(), hour: "2-digit", minute: "2-digit", hour12: false });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US", { timeZone: tz(), hour: "numeric", minute: "2-digit", hour12: true });
const fmtDay = (ymd, opts = { month: "short", day: "numeric", weekday: "short" }) => new Date(ymd + "T12:00:00Z").toLocaleDateString(loc(), { ...opts, timeZone: "UTC" });
function tzOffset(ms) { // 这个时区比 UTC 快几毫秒
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz(), hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
}
function wallToIso(ymd, hm = "00:00") {
  const [y, m, d] = ymd.split("-").map(Number), [h, mi] = hm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let ms = guess - tzOffset(guess);
  ms = guess - tzOffset(ms);
  return new Date(ms).toISOString();
}
const addDays = (ymd, n) => { const d = new Date(ymd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function ago(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return t("just_now");
  if (s < 3600) return t("min_ago", { n: Math.floor(s / 60) });
  if (s < 86400) return t("hr_ago", { n: Math.floor(s / 3600) });
  return fmtDay(ymdIn(iso), { month: "short", day: "numeric" }) + " " + fmtTime(iso);
}

// ---------------- 后台 ----------------
const token = () => store.get("token") || "";
// ---------------- 读取中提示：顶部小胶囊 + 三颗弹跳的小球（咚咚咚） ----------------
const busy = { n: 0, sync: 0, timer: null, el: null };
function busyDraw() {
  if (!busy.el) {
    busy.el = document.createElement("div");
    busy.el.className = "busy-pill"; busy.el.setAttribute("role", "status"); busy.el.setAttribute("aria-live", "polite");
    busy.el.innerHTML = '<span class="dong" aria-hidden="true"><i></i><i></i><i></i></span><b></b>';
    document.body.append(busy.el);
  }
  busy.el.querySelector("b").textContent = busy.sync ? t("syncing") : t("loading");
  busy.el.classList.add("on");
}
function busyStart(sync) {
  busy.n++; if (sync) busy.sync++;
  if (busy.el?.classList.contains("on")) return busyDraw();
  clearTimeout(busy.timer); busy.timer = setTimeout(() => { if (busy.n) busyDraw(); }, 300); // 很快的就不显示
}
function busyEnd(sync) {
  busy.n = Math.max(0, busy.n - 1); if (sync) busy.sync = Math.max(0, busy.sync - 1);
  if (busy.n) { if (busy.el?.classList.contains("on")) busyDraw(); return; }
  clearTimeout(busy.timer); busy.el?.classList.remove("on");
}
async function api(path, opts = {}) {
  const isSync = /^\/api\/google\/(pull|push|sync)/.test(path), quiet = /^\/api\/(activity\/unread|notifications)/.test(path);
  if (!quiet) busyStart(isSync);
  try { return await apiRaw(path, opts); } finally { if (!quiet) busyEnd(isSync); }
}
// ---------------- 离线查看：在线时把读到的资料存一份在这台装置；离线时拿出来看（不能修改） ----------------
const DATA_CACHE = "tlw-data-v1";
const cacheKey = (path) => `${location.origin}/__data/${/^\/api\/(auth\/me|calendars)$/.test(path) ? "all" : store.get("cal") || "-"}${path}`; // 帐号资料、日历清单不分日历
async function cachePut(path, data) { try { const c = await caches.open(DATA_CACHE); await c.put(cacheKey(path), new Response(JSON.stringify({ at: Date.now(), data }), { headers: { "Content-Type": "application/json" } })); } catch {} }
async function cacheGet(path) { try { const r = await (await caches.open(DATA_CACHE)).match(cacheKey(path)); return r ? await r.json() : null; } catch { return null; } }
async function clearDataCache() { try { await caches.delete(DATA_CACHE); } catch {} }
const offline = { on: false, at: 0, el: null, small: false };
function offlineOn(at) {
  offline.at = Math.min(offline.at || at, at); const was = offline.on; offline.on = true;
  if (!offline.el) { offline.el = document.createElement("div"); offline.el.className = "off-card"; offline.el.setAttribute("role", "alert"); document.body.append(offline.el); }
  const time = new Date(offline.at).toLocaleString(loc(), { timeZone: tz(), dateStyle: "medium", timeStyle: "short" });
  offline.el.classList.toggle("small", offline.small);
  offline.el.innerHTML = offline.small
    ? `<span class="off-dot"></span>${t("offline_pill")}${oqCount ? ` · ${t("offline_pending", { n: oqCount })}` : ""}`
    : `<div class="off-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M2 8.8a15 15 0 0 1 4.2-2.6M9.8 5.2A15 15 0 0 1 22 8.8M5 12.6a10 10 0 0 1 3.9-2.2M15.5 10.4A10 10 0 0 1 19 12.6M8.5 16.1a5 5 0 0 1 7 0M12 20h.01M3 3l18 18"/></svg></div><b>${t("offline_title")}</b><p>${t("offline_text", { time })}</p><button type="button" class="btn sm" id="off-ok">${t("got_it")}</button>`;
  offline.el.querySelector("#off-ok")?.addEventListener("click", () => { offline.small = true; offlineOn(offline.at); });
  offline.el.onclick = (e) => { if (offline.small && e.isTrusted) { offline.small = false; offlineOn(offline.at); } };
  if (!was) chime("bad");
}
function offlineOff() {
  if (!offline.on) return;
  offline.on = false; offline.at = 0; offline.small = false; offline.el?.remove(); offline.el = null;
  toast(t("back_online")); chime("ok");
  if (state.me) renderPage();
}
window.addEventListener("online", () => { if (offline.on) api("/api/auth/me").then(() => offlineOff()).catch(() => {}); });
window.addEventListener("message", (e) => { if (e.origin === location.origin && e.data?.type === "offline") offlineOn(e.data.at || Date.now()); });
const NO_CACHE = /^\/api\/(auth\/(login|signup|forgot|reset)|photos\/|admin\/backup)/;
// ---------------- 离线修改：先排队存在这台装置（IndexedDB，照片也可以），有网络后按顺序自动上传 ----------------
const OQ_OK = /^\/api\/(events(\/-?\d+(\/posts)?)?|comments\/\d+|photos\/\d+)$/; // 离线可以做的：活动新增 / 修改 / 删除、留言、照片
function oqDb() {
  return new Promise((res, rej) => { const r = indexedDB.open("tlw-offline", 1); r.onupgradeneeded = () => r.result.createObjectStore("q", { keyPath: "id", autoIncrement: true }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function oqTx(mode, fn) { const db = await oqDb(); return new Promise((res, rej) => { const tx = db.transaction("q", mode); const st = tx.objectStore("q"); const out = fn(st); tx.oncomplete = () => res(out?.result ?? out); tx.onerror = () => rej(tx.error); }); }
const oqAll = async () => { try { return (await oqTx("readonly", (s) => s.getAll())) || []; } catch { return []; } };
const oqAdd = (op) => oqTx("readwrite", (s) => s.add(op));
const oqDel = (id) => oqTx("readwrite", (s) => s.delete(id));
let oqCount = 0;
oqAll().then((l) => { oqCount = l.length; if (oqCount && navigator.onLine) setTimeout(flushQueue, 3000); });
const tmpMap = () => { try { return JSON.parse(store.get("tlw-tmpmap") || "{}"); } catch { return {}; } };
const fixPath = (p, m) => p.replace(/\/api\/events\/(-\d+)/, (x, id) => (m[id] ? `/api/events/${m[id]}` : x));
// 离线时：把排队中的修改套在资料上，画面马上看得到
async function overlay(path, data) {
  if (!oqCount) return data;
  const ops = await oqAll(); if (!ops.length) return data;
  const labOf = (id) => (state.config?.labelList || []).find((l) => l.id === id);
  const apply = (ev, b) => { Object.assign(ev, b); if ("label_id" in b) { const l = labOf(b.label_id); ev.label = l ? l.color : null; } ev._pending = true; return ev; };
  const created = (op) => apply({ id: op.tmp, title: "", start: op.body.start, end: null, all_day: 0, notes: "", calendar_id: Number(store.get("cal")) || null, feed: [] }, { ...op.body, all_day: op.body.all_day ? 1 : 0 });
  const list = /^\/api\/events(\?|$)/.test(path), one = /^\/api\/events\/(-?\d+)$/.exec(path);
  if (list && Array.isArray(data)) {
    let out = data.slice();
    const u = new URL(path, location.origin), from = u.searchParams.get("from"), to = u.searchParams.get("to");
    for (const op of ops) {
      const m = /^\/api\/events(?:\/(-?\d+))?$/.exec(op.path); if (!m) continue;
      if (op.method === "POST" && !m[1]) { const ev = created(op); if ((!from || ev.start >= from) && (!to || ev.start < to)) out.push(ev); }
      else if (op.method === "PATCH") { const ev = out.find((x) => String(x.id) === m[1]); if (ev) apply(ev, op.body); }
      else if (op.method === "DELETE") out = out.filter((x) => String(x.id) !== m[1]);
    }
    return out.sort((a, b) => String(a.start).localeCompare(String(b.start)));
  }
  if (one) {
    let ev = data ? { ...data, feed: [...(data.feed || [])] } : null;
    for (const op of ops) {
      if (op.method === "POST" && op.path === "/api/events" && String(op.tmp) === one[1]) ev = created(op);
      if (!ev || op.path.replace(/\/posts$/, "") !== `/api/events/${one[1]}`) continue;
      if (op.method === "PATCH") apply(ev, op.body);
      if (op.method === "POST" && op.path.endsWith("/posts")) {
        const text = (op.form || []).find((x) => x.k === "text")?.v || "", pics = (op.form || []).filter((x) => x.k === "photos");
        if (text) ev.feed.push({ type: "comment", id: `local-${op.id}`, body: text, author: state.me?.name, created_at: new Date(op.at).toISOString(), _pending: true });
        pics.forEach((p, i) => ev.feed.push({ type: "photo", id: URL.createObjectURL(p.v), caption: "", author: state.me?.name, created_at: new Date(op.at).toISOString(), _pending: true }));
      }
    }
    return ev;
  }
  return data;
}
async function apiRaw(path, opts = {}) {
  const method = opts.method || "GET";
  try {
    const data = await apiNet(path, opts);
    if (method === "GET" && !NO_CACHE.test(path)) cachePut(path, data);
    if (offline.on) offlineOff();
    if (oqCount) setTimeout(flushQueue, 50); // 有网络了 → 把排队的修改送出去
    return method === "GET" ? overlay(path, data) : data;
  } catch (e) {
    if (!(e instanceof TypeError)) throw e; // 不是网络问题（例如密码错）→ 照常显示
    if (method !== "GET") {
      offlineOn(Date.now());
      if (!OQ_OK.test(path)) throw new Error(t("offline_noedit"));
      return queueWrite(path, opts);
    }
    const c = await cacheGet(path);
    const tmp = /^\/api\/events\/-\d+$/.test(path); // 离线新增的活动（还没有真正的编号）
    if (!c && !tmp) { offlineOn(Date.now()); throw new Error(t("offline_nodata")); }
    offlineOn(c?.at || Date.now());
    return overlay(path, c?.data ?? null);
  }
}
// 离线时的修改 → 排队；回传画面要的资料
async function queueWrite(path, opts) {
  const op = { path, method: opts.method, at: Date.now() };
  if (opts.body instanceof FormData) op.form = [...opts.body.entries()].map(([k, v]) => ({ k, v }));
  else if (opts.body) op.body = opts.body;
  if (op.method === "POST" && path === "/api/events") op.tmp = -Date.now();
  const one = /^\/api\/events\/(\d+)$/.exec(path);
  if (one && op.method === "PATCH") { const c = await cacheGet(path); op.base = c?.data || null; } // 记下离线前的样子，之后用来检查别人有没有同时改
  if (one) { const c = await cacheGet(path); op.title = c?.data?.title || ""; }
  await oqAdd(op); oqCount++;
  offlineOn(offline.at || Date.now());
  if (op.tmp) return overlay(`/api/events/${op.tmp}`, null);
  if (/\/posts$/.test(path)) return overlay(path.replace(/\/posts$/, ""), (await cacheGet(path.replace(/\/posts$/, "")))?.data ?? null);
  if (one && op.method === "PATCH") return overlay(path, (await cacheGet(path))?.data ?? null);
  return { ok: true, queued: true };
}
// 有网络后：按顺序送出；别人同时改过的、已经被删掉的 → 最后列出来给你看
let flushing = false;
async function flushQueue() {
  if (flushing || !token()) return; flushing = true;
  const ops = await oqAll(), map = tmpMap(), issues = [];
  let done = 0;
  try {
    for (const op of ops) {
      const path = fixPath(op.path, map);
      if (/\/api\/events\/-\d+/.test(path)) { await oqDel(op.id); continue; } // 离线新增后没有成功建立 → 跳过
      try {
        if (op.method === "PATCH" && op.base) {
          const cur = await apiNet(path).catch((e) => { if (e instanceof TypeError) throw e; return null; });
          const keys = ["title", "start", "end", "notes", "label", "template_id", "brand", "person_id"];
          if (cur && keys.some((k) => String(cur[k] ?? "") !== String(op.base[k] ?? ""))) issues.push(t("sync_changed", { n: op.title || cur.title }));
        }
        let body = op.body;
        if (op.form) { body = new FormData(); op.form.forEach(({ k, v }) => (v instanceof Blob ? body.append(k, v, "photo.jpg") : body.append(k, v))); }
        const res = await apiNet(path, { method: op.method, body });
        if (op.tmp && res?.id) { map[op.tmp] = res.id; store.set("tlw-tmpmap", JSON.stringify(map)); }
      } catch (e) {
        if (e instanceof TypeError) break; // 又没网络了 → 下次再送
        issues.push(e.status === 404 ? t("sync_gone", { n: op.title || "—" }) : t("sync_failed", { n: op.title || op.body?.title || "—", e: e.message }));
      }
      await oqDel(op.id); oqCount = Math.max(0, oqCount - 1); done++;
    }
  } finally { flushing = false; }
  if (!done) return;
  toast(t("synced_n", { n: done })); chime("ok");
  if (offline.on && !oqCount) offlineOff(); else if (state.me) renderPage();
  if (issues.length) confirmBox({ title: t("sync_issues"), text: issues.join("\n"), ok: t("got_it"), danger: false });
}
async function apiNet(path, opts = {}) {
  const headers = { "x-lang": lang, ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...(store.get("cal") ? { "x-cal": store.get("cal") } : {}) };
  let body = opts.body;
  if (body && !(body instanceof FormData)) { headers["Content-Type"] = "application/json"; body = JSON.stringify(body); }
  const res = await fetch(API_BASE + path, { method: opts.method || "GET", headers, body });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !/^\/api\/auth\/(login|signup|reset|forgot)/.test(path)) { store.set("token", null); clearDataCache(); boot(); throw new Error(data.error || "401"); }
  if (!res.ok) { const e = new Error(data.error || `Error ${res.status}`); e.status = res.status; throw e; }
  return data;
}
const photoUrl = (id) => (String(id).startsWith("blob:") ? id : ""); // 照片网址由服务器给（f.url，不含登录钥匙）；离线新增的照片用这台装置上的档案

// ---------------- 声音、提示 ----------------
// 每个声音：[频率, 开始(秒), 长度(秒), 波形, 音量]；noise = 快门一样的沙沙声
const SOUNDS = {
  note: [[880, 0, .3, "sine"], [1320, .11, .3, "sine"], [1760, .22, .35, "sine"]],
  ok: [[660, 0, .25, "sine"], [990, .1, .3, "sine"]],
  bad: [[440, 0, .25, "sine"], [330, .12, .3, "sine"]],
  // 每个页面不同的声音
  calendar: [[523, 0, .14, "sine", .2], [784, .07, .22, "sine", .18]],                       // 轻轻的「啵」
  photo: [["noise", 0, .05, "", .22], ["noise", .09, .07, "", .16], [1800, 0, .03, "square", .05]], // 相机快门
  sales: [[1319, 0, .08, "square", .07], [1976, .08, .45, "square", .07], [2637, .08, .4, "sine", .08]], // Ka-ching
  rates: [[659, 0, .1, "triangle", .2], [880, .08, .1, "triangle", .2], [659, .16, .18, "triangle", .16]],
  people: [[440, 0, .3, "sine", .14], [554, .06, .3, "sine", .14], [659, .12, .35, "sine", .14]],  // 和弦
  activity: [[988, 0, .08, "sine", .16], [740, .08, .16, "sine", .14]],                        // 「滴」
  gear: [[392, 0, .12, "triangle", .18], [523, .09, .2, "triangle", .16]],
  // 新增活动成功：小号角
  saved: [[523, 0, .12, "triangle", .18], [659, .1, .12, "triangle", .18], [784, .2, .12, "triangle", .18], [1047, .3, .45, "triangle", .2], [2093, .32, .5, "sine", .06], [1568, .44, .5, "sine", .06]],
};
let actx;
function chime(kind = "note") {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    for (const [f, start, len, type, vol = .18] of SOUNDS[kind] || SOUNDS.note) {
      const at = actx.currentTime + start, g = actx.createGain();
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      g.connect(actx.destination);
      if (f === "noise") {
        const buf = actx.createBuffer(1, Math.ceil(actx.sampleRate * len), actx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = actx.createBufferSource(), hp = actx.createBiquadFilter();
        hp.type = "highpass"; hp.frequency.value = 2500; src.buffer = buf;
        src.connect(hp).connect(g); src.start(at);
      } else {
        const o = actx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(g); o.start(at); o.stop(at + len + .05);
      }
    }
  } catch {}
}
// 新增活动后：大大的「EVENT SAVED」+ 自己的 emoji + 星星
function celebrate() {
  chime("saved");
  const w = document.createElement("div");
  w.className = "saved-burst";
  const bits = ["✨", "🎉", "💖", "⭐", "🎊", "✨", "💍", "🌸"];
  w.innerHTML = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2, r = 110 + Math.random() * 90;
    return `<i style="--x:${Math.cos(a) * r}px;--y:${Math.sin(a) * r}px;animation-delay:${0.08 + Math.random() * 0.15}s">${bits[i % bits.length]}</i>`;
  }).join("") + `<div class="sb-card">${avatar(state.me?.emoji, state.me?.color, "lg", state.me?.avatar)}<b>EVENT SAVED</b><span>🎉</span></div>`;
  document.body.append(w);
  setTimeout(() => w.remove(), 1700);
}
function toast(msg, bad = false) {
  const el = document.createElement("div");
  el.className = "toast" + (bad ? " bad" : ""); el.textContent = msg;
  $("#toasts").append(el); setTimeout(() => el.remove(), bad ? 4200 : 2200);
}
const fail = (e) => { toast(e.message || String(e), true); chime("bad"); };

// ---------------- 点击波纹 ----------------
const RIPPLE = "button,.btn,.nav-btn,.icon-btn,.lab,.tpl-btn,.cal-cell,.ev-row,.sw,.emo,.gear,.warn-bar,.linkish,.check";
document.addEventListener("pointerdown", (e) => {
  const el = e.target.closest?.(RIPPLE);
  if (!el || el.disabled || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = el.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2.2;
  if (getComputedStyle(el).position === "static") el.style.position = "relative";
  const wrap = document.createElement("span"), dot = document.createElement("span");
  wrap.className = "rip-wrap"; dot.className = "ripple";
  Object.assign(dot.style, { width: size + "px", height: size + "px", left: e.clientX - r.left - size / 2 + "px", top: e.clientY - r.top - size / 2 + "px" });
  wrap.append(dot); el.append(wrap);
  setTimeout(() => wrap.remove(), 800);
}, { passive: true });

// ---------------- 骨架屏（等待中：高光闪过） ----------------
const sk = (cls = "", style = "") => `<span class="sk ${cls}" style="${style}"></span>`;
const skRows = (n, h = 56) => Array.from({ length: n }, (_, i) => sk("sk-row", `height:${h}px;animation-delay:${i * 0.08}s`)).join("");

// ---------------- 图示 ----------------
// 侧栏的 logo：两个相扣的细圈（蓝 + 金），轻、简单
const LOGO_RINGS = `<svg class="logo-rings" viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><defs><linearGradient id="lr-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#2563eb"/></linearGradient><linearGradient id="lr-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f5c451"/></linearGradient></defs><circle cx="19" cy="25" r="10.5" fill="none" stroke="url(#lr-a)" stroke-width="3"/><circle cx="29" cy="25" r="10.5" fill="none" stroke="url(#lr-b)" stroke-width="3"/><circle cx="29" cy="14.6" r="2" fill="#fde68a"/></svg>`;
const ICON = {
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  photo: '<svg viewBox="0 0 24 24"><path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  sales: '<svg viewBox="0 0 24 24"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
  rates: '<svg viewBox="0 0 24 24"><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14a6 6 0 0 1 3.5 6"/></svg>',
  activity: '<svg viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  img: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
};
const EMOJIS = ["🐱", "🐶", "🐼", "🐨", "🐰", "🦊", "🐻", "🐷", "🐸", "🐵", "🐥", "🐧", "🦄", "🦖", "🐙", "🐳", "🦋", "🐝", "🌸", "🌈", "⭐", "🍓", "🍑", "🍩", "🧁", "🎀", "🎈", "👻", "😎", "🥳", "🤠", "🤓", "🤖", "👑", "💖", "💍", "👰", "🤵", "📸", "🎬"];
const PROFILE_COLORS = ["#2563eb", "#0ea5e9", "#14b8a6", "#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#6366f1", "#64748b"];

// ---------------- 状态 ----------------
const state = {
  me: null, config: null, cals: [], page: "calendar", cursor: null, sel: null, events: [], untagged: [],
  notes: { items: [], unread: 0, seen: Number(store.get("notes-seen") || 0) }, actUnread: 0, loadingMonth: false,
};
const isAdmin = () => !!state.me?.admin;
const isTop = () => !!state.me?.top;
const reqIdOf = (n) => (n.kind === "admin_request" && /^admin_request:(\d+)$/.test(n.ref || "") ? Number(n.ref.split(":")[1]) : null);
// 「确定要…吗？」弹窗：删除、移除、登出、拒绝等动作之前都会先问
function confirmBox({ title, text = "", ok, danger = true }) {
  return new Promise((resolve) => {
    let d = document.getElementById("confirm-dlg");
    if (!d) { d = document.createElement("dialog"); d.id = "confirm-dlg"; d.className = "confirm-dlg"; document.body.append(d); }
    d.innerHTML = `<form method="dialog" class="dlg cf"><div class="cf-ico${danger ? " bad" : ""}" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 6.5v7.5"/><circle cx="12" cy="18" r="1.4" fill="#fff" stroke="none"/></svg></div>
      <h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ""}
      <div class="cf-btns"><button class="btn ghost" value="no">${t("cancel")}</button><button class="btn${danger ? " danger-solid" : ""}" value="yes">${esc(ok)}</button></div></form>`;
    d.onclose = () => resolve(d.returnValue === "yes");
    d.onclick = (e) => { if (e.target === d) d.close("no"); };
    d.returnValue = ""; d.showModal(); chime("bad");
    d.querySelector('[value="no"]').focus();
  });
}
window.confirmBox = confirmBox; // Dashboard（iframe）也用同一个
async function decide(id, approve) {
  if (!approve && !(await confirmBox({ title: t("cf_reject"), text: t("cf_reject_t"), ok: t("reject") }))) return false;
  try { await api(`/api/admin/requests/${id}`, { method: "POST", body: { approve } }); toast(t(approve ? "approved" : "rejected")); chime("ok"); pollNotes(); return true; }
  catch (e) { fail(e); return false; }
}
const clearPops = () => $$(".pop").forEach((x) => x.remove());
const canEdit = () => state.config?.calendarRole !== "viewer";
const labelHex = (color) => state.config?.labels?.[color]?.hex || "#3b82f6";
// 实心颜色上的字：浅色（例如 Banana）用深色字，深色（例如 Grape）用白字
const inkOf = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "")); if (!m) return "#fff"; const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#10131f" : "#fff"; };
const labelOf = (e) => (state.config?.labelList || []).find((l) => l.id === e.label_id);
const evColor = (e) => (e.label && state.config?.labels?.[e.label] ? labelHex(e.label) : e.color || "#3b82f6");
const tplOf = (id) => (state.config?.templates || []).find((x) => x.id === id);
// 头像：有上传照片就用照片，不然用 emoji + 颜色
const avatar = (emoji, color, cls = "", img = "") => img
  ? `<span class="avatar pic ${cls}" style="--c:${esc(color || "#2563eb")}"><img src="${esc(img)}" alt="" decoding="async"></span>`
  : `<span class="avatar ${cls}" style="--c:${esc(color || "#2563eb")}">${esc(emoji || "🙂")}</span>`;
// 选一张头像照片：裁成正方形（直的照片偏上面，比较不会切到头），缩到 256×256（大约 10–40 KB）
function pickAvatarPhoto() {
  return new Promise((resolve) => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => {
      const f = inp.files?.[0]; if (!f) return resolve(null);
      const url = URL.createObjectURL(f), im = new Image();
      im.onload = () => {
        const w = im.naturalWidth, h = im.naturalHeight, m = Math.min(w, h), c = document.createElement("canvas");
        c.width = c.height = 256;
        c.getContext("2d").drawImage(im, (w - m) / 2, h > w ? (h - m) * 0.2 : (h - m) / 2, m, m, 0, 0, 256, 256);
        let d = c.toDataURL("image/webp", 0.85); if (!d.startsWith("data:image/webp")) d = c.toDataURL("image/jpeg", 0.85);
        URL.revokeObjectURL(url); resolve(d);
      };
      im.onerror = () => { URL.revokeObjectURL(url); toast(t("photo_bad"), true); resolve(null); };
      im.src = url;
    };
    inp.click();
  });
}
const untaggedEv = (e) => !e.template_id && !e.birthday_user_id && ymdIn(e.start) >= DASH_START;

// ---------------- 启动 ----------------
async function boot() {
  const qs = new URLSearchParams(location.search);
  if (qs.get("join")) store.set("join", qs.get("join"));
  if (qs.get("google_error")) setTimeout(() => toast(qs.get("google_error"), true), 600);
  const googleOk = qs.get("google") === "ok";
  if ([...qs.keys()].length) history.replaceState(null, "", location.pathname + location.hash);
  if (!token()) return renderAuth("login");
  try { state.me = await api("/api/auth/me"); } catch { return; }
  if (state.me.lang && LANGS[state.me.lang] && state.me.lang !== lang) { lang = state.me.lang; store.set("lang", lang); }
  const cals = await api("/api/calendars").catch(() => ({ calendars: [] }));
  state.cals = cals.calendars || [];
  if (!state.me.onboarded || !state.cals.length) return renderOnboarding();
  if (!state.cals.some((c) => String(c.id) === store.get("cal"))) store.set("cal", String(cals.current || state.cals[0].id));
  // 已登录的人打开邀请连结 → 问要不要加入
  const pendingJoin = store.get("join");
  if (pendingJoin) { store.set("join", null); await askJoin(pendingJoin); }
  await loadConfig();
  renderApp();
  if (googleOk || location.hash === "#settings") openSettings();
  startLoops();
}
async function loadConfig() { state.config = await api("/api/config"); }
async function askJoin(tok) {
  try {
    const inv = await api(`/api/join/${encodeURIComponent(tok)}`);
    if (confirm(t("join_cal_q", { name: inv.calendar }).replace(/&[a-z#0-9]+;/g, (m) => ({ "&quot;": '"', "&#39;": "'", "&amp;": "&", "&lt;": "<", "&gt;": ">" }[m] || m)))) {
      const r = await api("/api/join", { method: "POST", body: { token: tok } });
      store.set("cal", String(r.id)); chime("ok");
    }
  } catch (e) { fail(e); }
}

// ================= 登录 / 注册 / 忘记密码 =================
// 密码栏：右边有眼睛，可以显示 / 隐藏
const pwBox = (ac, ph = "") => `<div class="pw-wrap"><input class="input" id="a-pw" type="password" autocomplete="${ac}" placeholder="${ph}">
  <button type="button" class="eye" data-eye aria-label="${t("show_pw")}" title="${t("show_pw")}" aria-pressed="false">${ICON.eye}</button></div>`;
function renderAuth(mode, msg = "") {
  stopLoops();
  const email = store.get("last-email") || "";
  const card = {
    login: `<div class="field"><label for="a-email">${t("email")}</label><input class="input" id="a-email" type="email" autocomplete="email" value="${esc(email)}"></div>
      <div class="field"><label for="a-pw">${t("password")}</label>${pwBox("current-password")}</div>
      <p class="err" id="a-err">${esc(msg)}</p>
      <button class="btn" data-a="login">${t("login")}</button>
      <button class="linkish" data-mode="forgot">${t("forgot")}</button>
      <button class="linkish" data-mode="signup">${t("no_acct")}</button>`,
    signup: `<div class="field"><label for="a-email">${t("email")}</label><input class="input" id="a-email" type="email" autocomplete="email" value="${esc(email)}"></div>
      <div class="field"><label for="a-pw">${t("password")}</label>${pwBox("new-password", t("pw_rule"))}</div>
      <p class="err" id="a-err">${esc(msg)}</p>
      <button class="btn" data-a="signup">${t("signup")}</button>
      <button class="linkish" data-mode="login">${t("have_acct")}</button>`,
    forgot: `<div class="field"><label for="a-email">${t("email")}</label><input class="input" id="a-email" type="email" autocomplete="email" value="${esc(email)}"></div>
      <p class="err" id="a-err">${esc(msg)}</p>
      <button class="btn" data-a="forgot">${t("send_code")}</button>
      <button class="linkish" data-mode="login">${t("back")}</button>`,
    reset: `<div class="field"><label for="a-code">${t("code")}</label><input class="input" id="a-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
      <div class="field"><label for="a-pw">${t("new_pw")}</label>${pwBox("new-password", t("pw_rule"))}</div>
      <p class="err" id="a-err">${esc(msg)}</p>
      <button class="btn" data-a="reset">${t("reset")}</button>
      <button class="linkish" data-mode="login">${t("back")}</button>`,
  }[mode];
  $("#root").innerHTML = `<div class="gate"><form class="gate-card" id="auth" novalidate>
    <div class="gate-logo">${LOGO_RINGS.replace('class="logo-rings"', 'class="logo-rings gate-rings"')}<div class="gate-name">THE LEGEND<br>WEDDING</div></div>
    <div class="seg" role="group" style="align-self:center">${Object.entries(LANGS).map(([k, v]) => `<button type="button" data-lang="${k}" aria-pressed="${k === lang}">${v}</button>`).join("")}</div>
    ${card}</form></div>`;
  const f = $("#auth");
  f.addEventListener("click", (e) => {
    const eye = e.target.closest("[data-eye]");
    if (eye) {
      e.preventDefault();
      const inp = $("#a-pw"), show = inp.type === "password";
      inp.type = show ? "text" : "password";
      eye.innerHTML = show ? ICON.eyeOff : ICON.eye; eye.setAttribute("aria-pressed", String(show));
      eye.setAttribute("aria-label", t(show ? "hide_pw" : "show_pw")); eye.title = t(show ? "hide_pw" : "show_pw");
      inp.focus(); return;
    }
    const m = e.target.closest("[data-mode]"); if (m) { e.preventDefault(); keepEmail(); renderAuth(m.dataset.mode); return; }
    const l = e.target.closest("[data-lang]"); if (l) { e.preventDefault(); lang = l.dataset.lang; store.set("lang", lang); keepEmail(); renderAuth(mode); }
  });
  f.addEventListener("submit", (e) => { e.preventDefault(); authSubmit(mode); });
  f.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); authSubmit(mode); } });
  $("button[data-a]", f).addEventListener("click", (e) => { e.preventDefault(); authSubmit(mode); });
  setTimeout(() => ($("#a-email", f)?.value ? $("#a-pw, #a-code", f) : $("#a-email", f))?.focus(), 50);
}
const keepEmail = () => { const v = $("#a-email")?.value; if (v != null) store.set("last-email", v.trim()); };
async function authSubmit(mode) {
  const err = (m) => { $("#a-err").textContent = m; chime("bad"); };
  const email = ($("#a-email")?.value ?? store.get("last-email") ?? "").trim().toLowerCase();
  const pw = $("#a-pw")?.value || "";
  if (mode !== "reset" && !EMAIL_RE.test(email)) return err(t("bad_email"));
  if ((mode === "signup" || mode === "reset") && !passwordOk(pw)) return err(t("pw_rule"));
  const btn = $("button[data-a]"); btn.disabled = true;
  try {
    store.set("last-email", email);
    if (mode === "forgot") { await api("/api/auth/forgot", { method: "POST", body: { email } }); toast(t("code_sent")); return renderAuth("reset"); }
    const body = mode === "reset" ? { email, code: $("#a-code").value.trim(), password: pw } : { email, password: pw, name: email.split("@")[0], lang };
    const r = await api(`/api/auth/${mode}`, { method: "POST", body });
    store.set("token", r.token);
    helloNext = mode === "login";
    boot();
  } catch (e) { err(e.message); } finally { btn.disabled = false; }
}

// ================= 第一次登录的步骤 =================
const ob = { step: 0, emoji: null, color: null, photo: null, name: "", bm: "", bd: "", calMode: "create", calName: "", link: "" };
function renderOnboarding() {
  stopLoops(); helloNext = false;
  if (ob.step === 0 && !ob.emoji) {
    Object.assign(ob, { emoji: state.me.emoji || EMOJIS[Math.floor(Math.random() * 20)], color: state.me.color || PROFILE_COLORS[0], name: state.me.name || "", photo: state.me.avatar || null });
    const j = store.get("join"); if (j) { ob.calMode = "join"; ob.link = j; }
    if (state.cals.length) ob.calMode = "have";
  }
  const steps = [0, 1, 2, 3].map((i) => `<i class="${i <= ob.step ? "on" : ""}"></i>`).join("");
  const body = [
    () => `<h2 style="margin:0;text-align:center">${t("ob_look")}</h2><p class="notice" style="text-align:center;margin:0">${t("ob_look_t")}</p>
      <div class="preview">${avatar(ob.emoji, ob.color, "lg", ob.photo)}</div>
      <div class="row" style="justify-content:center"><button type="button" class="btn sm" data-obphoto="up">${ob.photo ? t("change_photo") : t("upload_photo")}</button>${ob.photo ? `<button type="button" class="btn ghost sm" data-obphoto="rm">${t("remove_photo")}</button>` : ""}</div>
      <div class="emojis">${EMOJIS.map((e) => `<button type="button" class="emo" data-emo="${e}" aria-pressed="${e === ob.emoji}">${e}</button>`).join("")}</div>
      <div class="swatches" style="grid-template-columns:repeat(6,1fr)">${PROFILE_COLORS.map((c) => `<button type="button" class="sw" style="--c:${c}" data-col="${c}" aria-pressed="${c === ob.color}" aria-label="${c}"></button>`).join("")}</div>`,
    () => `<h2 style="margin:0;text-align:center">${t("ob_name")}</h2><div class="preview">${avatar(ob.emoji, ob.color, "lg", ob.photo)}</div>
      <input class="input" id="ob-name" maxlength="40" value="${esc(ob.name)}" autocomplete="name">`,
    () => `<h2 style="margin:0;text-align:center">${t("ob_bd")}</h2>
      <div class="bd-row">${bdSelects(ob.bm, ob.bd)}</div>
      <p class="notice">${t("ob_bd_note")}</p>`,
    () => `<h2 style="margin:0;text-align:center">${t("ob_cal")}</h2>
      ${ob.calMode === "have" ? "" : `<div class="choice"><button type="button" class="tpl-btn" data-cm="create" aria-pressed="${ob.calMode === "create"}">${t("create")}</button><button type="button" class="tpl-btn" data-cm="join" aria-pressed="${ob.calMode === "join"}">${t("join")}</button></div>
      ${ob.calMode === "create" ? `<div class="field"><label for="ob-cal">${t("cal_name")}</label><input class="input" id="ob-cal" maxlength="60" value="${esc(ob.calName || "The Legend Wedding")}"></div>`
        : `<div class="field"><label for="ob-link">${t("invite_link")}</label><input class="input" id="ob-link" value="${esc(ob.link)}"></div>`}`}`,
  ][ob.step]();
  $("#root").innerHTML = `<div class="gate"><div class="gate-card wide" id="ob">
    <div class="steps">${steps}</div>${body}<p class="err" id="ob-err"></p>
    <div class="row" style="justify-content:space-between">
      ${ob.step ? `<button type="button" class="btn ghost" data-ob="back">${t("back")}</button>` : "<span></span>"}
      <div class="row">${ob.step === 2 ? `<button type="button" class="btn ghost" data-ob="skip">${t("skip")}</button>` : ""}
      <button type="button" class="btn" data-ob="next">${ob.step === 3 ? t("done") : t("next")}</button></div>
    </div></div></div>`;
  const root = $("#ob");
  root.addEventListener("click", (e) => {
    const x = e.target.closest("[data-emo],[data-col],[data-cm],[data-ob],[data-obphoto]"); if (!x) return;
    readOb();
    if (x.dataset.obphoto === "up") return void pickAvatarPhoto().then((d) => { if (d) { ob.photo = d; chime("ok"); renderOnboarding(); } });
    if (x.dataset.obphoto === "rm") ob.photo = null;
    if (x.dataset.emo) { ob.emoji = x.dataset.emo; chime("ok"); }
    if (x.dataset.col) ob.color = x.dataset.col;
    if (x.dataset.cm) ob.calMode = x.dataset.cm;
    if (x.dataset.ob === "back") ob.step--;
    if (x.dataset.ob === "skip") { ob.bm = ob.bd = ""; ob.step++; }
    if (x.dataset.ob === "next") return obNext();
    renderOnboarding();
  });
  root.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); readOb(); obNext(); } });
  setTimeout(() => $("#ob input")?.focus(), 50);
}
const photoBtns = (has) => `<button type="button" class="btn sm" data-sphoto="up">${has ? t("change_photo") : t("upload_photo")}</button>${has ? `<button type="button" class="btn ghost sm" data-sphoto="rm">${t("remove_photo")}</button>` : ""}`;
function bdSelects(m, d, id = "ob") {
  const days = m ? new Date(Date.UTC(2024, Number(m), 0)).getUTCDate() : 31;
  return `<select class="input" id="${id}-bm" aria-label="${t("month")}"><option value="">${t("month")}</option>${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${String(i + 1) === String(m) ? "selected" : ""}>${new Date(Date.UTC(2024, i, 1)).toLocaleDateString(loc(), { month: "long", timeZone: "UTC" })}</option>`).join("")}</select>
    <select class="input" id="${id}-bd" aria-label="${t("day")}"><option value="">${t("day")}</option>${Array.from({ length: days }, (_, i) => `<option value="${i + 1}" ${String(i + 1) === String(d) ? "selected" : ""}>${i + 1}</option>`).join("")}</select>`;
}
function readOb() {
  if ($("#ob-name")) ob.name = $("#ob-name").value.trim();
  if ($("#ob-bm")) { ob.bm = $("#ob-bm").value; ob.bd = $("#ob-bd").value; }
  if ($("#ob-cal")) ob.calName = $("#ob-cal").value.trim();
  if ($("#ob-link")) ob.link = $("#ob-link").value.trim();
}
async function obNext() {
  const err = (m) => { $("#ob-err").textContent = m; chime("bad"); };
  if (ob.step === 1 && !ob.name) return err(t("ob_name"));
  if (ob.step === 2 && !!ob.bm !== !!ob.bd) return err(t("ob_bd"));
  if (ob.step < 3) { ob.step++; return renderOnboarding(); }
  const btn = $('[data-ob="next"]'); btn.disabled = true;
  try {
    if (ob.calMode === "create") {
      const r = await api("/api/calendars", { method: "POST", body: { name: ob.calName || "The Legend Wedding" } });
      store.set("cal", String(r.id));
    } else if (ob.calMode === "join") {
      const tok = (ob.link.match(/join=([\w-]+)/) || [])[1] || ob.link;
      const r = await api("/api/join", { method: "POST", body: { token: tok } });
      store.set("cal", String(r.id)); store.set("join", null);
    }
    state.me = { ...state.me, ...(await api("/api/auth/me", { method: "PATCH", body: {
      emoji: ob.emoji, color: ob.color, name: ob.name, birth_month: ob.bm ? Number(ob.bm) : null, birth_day: ob.bd ? Number(ob.bd) : null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, lang, onboarded: true } })) };
    if (ob.photo?.startsWith("data:")) state.me = { ...state.me, ...(await api("/api/auth/me/avatar", { method: "PUT", body: { data: ob.photo } })) };
    else if (!ob.photo && state.me.avatar) state.me = { ...state.me, ...(await api("/api/auth/me/avatar", { method: "DELETE" })) };
    welcome();
  } catch (e) { err(e.message); btn.disabled = false; }
}
let helloNext = false; // 刚登录 → 进入 App 后显示欢迎（头像弹出来 + 彩色光点）
function welcome(p = ob, reboot = true) {
  const w = document.createElement("div");
  w.className = "welcome";
  const sparks = Array.from({ length: 26 }, (_, i) => {
    const a = (i / 26) * Math.PI * 2, r = 140 + Math.random() * 160;
    return `<i class="spark" style="--x:${Math.cos(a) * r}px;--y:${Math.sin(a) * r}px;background:${PROFILE_COLORS[i % PROFILE_COLORS.length]};animation-delay:${0.15 + Math.random() * 0.25}s"></i>`;
  }).join("");
  w.innerHTML = `${sparks}<div class="big">${avatar(p.emoji, p.color, "", p.photo)}<h2>${t("welcome", { name: p.name })}</h2></div>`;
  document.body.append(w);
  chime("note");
  if (reboot) setTimeout(() => boot(), 900);
  setTimeout(() => w.remove(), 2700);
}

// ================= 网站主体 =================
function navItems() {
  const items = [{ id: "calendar", icon: "calendar", group: "analysis" }];
  if (isAdmin()) items.push({ id: "photo", icon: "photo", group: "analysis" }, { id: "sales", icon: "sales", group: "analysis" }, { id: "rates", icon: "rates", group: "settings" });
  items.push({ id: "people", icon: "people", group: "settings" }, { id: "activity", icon: "activity", group: "settings" });
  return items;
}
function renderApp() {
  const items = navItems();
  if (!items.some((x) => x.id === state.page)) state.page = "calendar";
  const want = location.hash.slice(1);
  if (items.some((x) => x.id === want)) state.page = want;
  const cal = state.cals.find((c) => String(c.id) === store.get("cal"));
  const btn = (x) => `<button class="nav-btn" data-nav="${x.id}" ${x.id === state.page ? 'aria-current="page"' : ""}>${ICON[x.icon]}<span class="t">${t("nav_" + x.id)}</span><span class="s">${t("short_" + x.id)}</span>${x.id === "calendar" ? '<span class="count" id="untag-count" hidden></span>' : ""}${x.id === "activity" ? `<span class="count" id="act-count" ${state.actUnread ? "" : "hidden"}>${state.actUnread > 99 ? "99+" : state.actUnread}</span>` : ""}</button>`;
  $("#root").innerHTML = `<div class="app">
    <aside class="side">
      <div class="logo">${LOGO_RINGS}<div><div class="logo-name">THE LEGEND WEDDING</div>${cal?.name && cal.name.trim().toLowerCase() !== "the legend wedding" ? `<div class="logo-cal">${esc(cal.name)}</div>` : ""}</div></div>
      <nav class="nav-group" aria-label="${t("analysis")}"><div class="nav-label">${t("analysis")}</div>${items.filter((x) => x.group === "analysis").map(btn).join("")}</nav>
      <nav class="nav-group" aria-label="${t("settings")}"><div class="nav-label">${t("settings")}</div>${items.filter((x) => x.group === "settings").map(btn).join("")}</nav>
      <div class="side-foot"><button class="gear" id="gear" aria-label="${t("settings")}" title="${t("settings")}">${ICON.gear}<span class="s">${t("settings")}</span></button>
        <div class="me-chip">${avatar(state.me.emoji, state.me.color, "sm", state.me.avatar)}<span>${esc(state.me.name)}</span></div></div>
    </aside>
    <div class="main" id="main"></div></div>`;
  $(".side").addEventListener("click", (e) => {
    const side = $(".side");
    // 触控屏的电脑版（例如手机开「桌面版网站」）：点 logo 打开 / 收起侧栏
    if (e.target.closest(".logo")) { side.classList.toggle("open"); return; }
    const b = e.target.closest("[data-nav]"); if (b) { b.blur(); side.classList.remove("open"); go(b.dataset.nav); }
  });
  document.addEventListener("click", (e) => { const side = $(".side"); if (side?.classList.contains("open") && !e.target.closest(".side")) side.classList.remove("open"); });
  $("#gear").addEventListener("click", () => { chime("gear"); openSettings(); });
  renderPage();
  if (helloNext) { helloNext = false; welcome({ ...state.me, photo: state.me.avatar }, false); }
}
function go(page) {
  chime(page);
  state.page = page;
  try { history.replaceState(null, "", "#" + page); } catch {}
  $$(".nav-btn").forEach((b) => (b.dataset.nav === page ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
  renderPage();
  window.scrollTo({ top: 0 });
}
function topBar(title, controls = "") {
  return `<header class="top"><h1>${esc(title)}</h1><div class="controls">${controls}
    <button class="icon-btn" id="bell" aria-label="${t("notifications")}" title="${t("notifications")}">${ICON.bell}<span class="dot" id="bell-dot" ${state.notes.unread ? "" : "hidden"}>${state.notes.unread}</span></button></div></header>`;
}
function renderPage() {
  const main = $("#main");
  const p = state.page;
  if (["photo", "sales", "rates"].includes(p)) {
    main.innerHTML = `<section class="frame-page"><div class="frame-sk" id="frame-sk">
        <div class="row" style="justify-content:space-between">${sk("", "width:220px;height:34px")}${sk("", "width:300px;height:40px")}</div>
        ${sk("", "width:min(520px,80%);height:46px")}
        <div class="sk-grid3">${sk("sk-card")}${sk("sk-card", "animation-delay:.1s")}${sk("sk-card", "animation-delay:.2s")}</div>
        <div class="sk-grid2">${sk("sk-card tall", "animation-delay:.15s")}${sk("sk-card tall", "animation-delay:.25s")}</div>
      </div><iframe title="${t("nav_" + p)}" src="dashboard.html?embed=1&page=${p}&lang=${lang}&v=241"></iframe></section>`;
    const hide = () => { const s = $("#frame-sk"); if (s) { s.classList.add("gone"); setTimeout(() => s.remove(), 400); } };
    const onMsg = (e) => { if (e.data === "dash-ready") { hide(); window.removeEventListener("message", onMsg); } };
    window.addEventListener("message", onMsg);
    setTimeout(hide, 10000);
    return;
  }
  if (p === "calendar") return renderCalendar();
  if (p === "people") return renderPeople();
  if (p === "activity") return renderActivity();
}
document.addEventListener("click", (e) => { if (e.target.closest("#bell")) openBell(); });
window.addEventListener("message", async (e) => {
  if (e.origin !== location.origin || e.data?.type !== "open-event") return;
  await openDetail(Number(e.data.id));
  $("#dlg").addEventListener("close", () => { try { document.querySelector(".frame-page iframe")?.contentWindow?.TheLegendDashboard?.reload?.(); } catch {} }, { once: true });
});

// ================= Calendar =================
async function renderCalendar() {
  state.cursor ||= ymdIn(Date.now()).slice(0, 7);
  state.sel ||= ymdIn(Date.now());
  const [y, m] = state.cursor.split("-").map(Number);
  const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(loc(), { year: "numeric", month: PHONE() ? "short" : "long", timeZone: "UTC" }); // 手机：Nov 2026
  $("#main").innerHTML = topBar(t("nav_calendar"), `<button class="btn ghost search-btn" id="search-btn" aria-label="${t("search")}">${ICON.search}<span class="t">${t("search")}</span></button>` + (canEdit() ? `<button class="icon-btn" id="trash-btn" aria-label="${t("trash")}" title="${t("trash")}">${ICON.trash}</button><button class="btn" id="new-ev" aria-label="${t("new_event")}">${ICON.plus}<span class="t">${t("new_event")}</span></button>` : "")) + `
    <section class="page wide">
      <button class="warn-bar" id="untag-bar" hidden></button>
      <div class="cal-head">
        <button class="icon-btn" id="prev" aria-label="‹">${ICON.left}</button>
        <div class="cal-month" id="cal-month" title="${t("today")}">${esc(monthName)}</div>
        <button class="icon-btn" id="next" aria-label="›">${ICON.right}</button>
        <button class="btn ghost sm" id="today">${t("today")}</button>
      </div>
      <div class="cal-grid" id="grid"></div>
      <div class="card"><div class="card-head"><h2 id="day-title"></h2></div><div class="day-list" id="day-list"></div></div>
    </section>`;
  $("#prev").onclick = () => moveMonth(-1);
  $("#next").onclick = () => moveMonth(1);
  $("#today").onclick = () => { state.cursor = ymdIn(Date.now()).slice(0, 7); state.sel = ymdIn(Date.now()); renderCalendar(); };
  $("#new-ev")?.addEventListener("click", () => openForm(null, state.sel));
  $("#trash-btn")?.addEventListener("click", openTrash);
  $("#search-btn").addEventListener("click", openSearch);
  $("#untag-bar").onclick = openUntagged;
  // 手机：上面那排图示（搜索、回收站、新增、通知）搬进月份那一排，少一排；点月份 = 回到今天
  if (PHONE()) {
    const head = $(".cal-head"), ctr = $(".top .controls");
    if (head && ctr) { ctr.classList.add("cal-tools"); head.append(ctr); $(".top")?.remove(); }
    $("#cal-month").onclick = () => $("#today").click();
  }
  drawGrid();
  await loadMonth();
  loadUntagged();
}
function moveMonth(n) {
  const [y, m] = state.cursor.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  state.cursor = d.toISOString().slice(0, 7);
  state.sel = state.cursor + "-01";
  renderCalendar();
}
function gridDays() {
  const first = state.cursor + "-01";
  const dow = (new Date(first + "T00:00:00Z").getUTCDay() + 6) % 7; // 星期一开始
  const start = addDays(first, -dow);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
async function loadMonth() {
  const days = gridDays();
  state.loadingMonth = true; drawGrid();
  try {
    state.events = await api(`/api/events?from=${encodeURIComponent(wallToIso(days[0]))}&to=${encodeURIComponent(wallToIso(addDays(days[41], 1)))}`);
  } catch (e) { state.loadingMonth = false; drawGrid(); if (e.status === 409) return boot(); return fail(e); }
  state.loadingMonth = false;
  drawGrid();
  refreshDay();
}
function eventDays(e) {
  const s = ymdIn(e.start);
  let last = s;
  if (e.end) { const endMs = Date.parse(e.end) - (e.all_day ? 1 : 0); if (endMs > Date.parse(e.start)) last = ymdIn(endMs); }
  const out = [];
  for (let d = s; d <= last && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}
function byDay() {
  const map = new Map();
  for (const e of state.events) for (const d of eventDays(e)) { if (!map.has(d)) map.set(d, []); map.get(d).push(e); }
  for (const list of map.values()) list.sort((a, b) => b.all_day - a.all_day || a.start.localeCompare(b.start));
  return map;
}
function drawGrid() {
  const grid = $("#grid"); if (!grid) return;
  const map = byDay(), today = ymdIn(Date.now()), days = gridDays();
  const dows = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(loc(), { weekday: "short", timeZone: "UTC" }));
  grid.innerHTML = dows.map((d) => `<div class="cal-dow">${esc(d)}</div>`).join("") + days.map((d) => {
    const list = state.loadingMonth ? [] : map.get(d) || [];
    const fake = state.loadingMonth ? Array.from({ length: (d.charCodeAt(9) + d.charCodeAt(8)) % 3 }, (_, k) => sk("sk-chip", `animation-delay:${(k * 0.1 + (Number(d.slice(8)) % 7) * 0.05).toFixed(2)}s`)).join("") : "";
    const max = PHONE() ? 2 : 4; // 手机：每格只放 2 个小字
    const chips = fake + list.slice(0, max).map((e) => `<span class="chip ${untaggedEv(e) ? "untag" : ""}" style="--c:${esc(evColor(e))};--ink:${inkOf(evColor(e))}"><b class="raw">${esc(e.title)}</b></span>`).join("");
    return `<button class="cal-cell ${d.slice(0, 7) !== state.cursor ? "out" : ""} ${d === today ? "today" : ""} ${d === state.sel ? "sel" : ""}" data-day="${d}" aria-label="${esc(fmtDay(d))}">
      <span class="cal-num">${Number(d.slice(8))}</span>${chips}${list.length > max ? `<span class="chip-more">+${list.length - max}</span>` : ""}</button>`;
  }).join("");
  grid.onclick = (e) => {
    const c = e.target.closest("[data-day]"); if (!c) return;
    state.sel = c.dataset.day; drawGrid();
    openDay(state.sel);
  };
  drawDay(map);
}
// ---------------- 一天的时间轴（按日期打开） ----------------
const PHONE = () => window.matchMedia("(max-width:860px)").matches;
let HOUR_PX = 56; // 手机：每小时高一点，字比较放得下
function dayParts(e, ymd) {
  const s = Date.parse(e.start), end = e.end ? Date.parse(e.end) : s + 3600000;
  const s0 = Date.parse(wallToIso(ymd)), e0 = Date.parse(wallToIso(addDays(ymd, 1)));
  const a = Math.max(s, s0), b = Math.min(Math.max(end, s + 30 * 60000), e0);
  return { top: ((a - s0) / 60000) * (HOUR_PX / 60), h: Math.max(26, ((b - a) / 60000) * (HOUR_PX / 60)), a, b };
}
function layoutDay(list, ymd) {
  const items = list.map((e) => ({ e, ...dayParts(e, ymd) })).sort((x, y) => x.a - y.a || y.b - x.b);
  let group = [], groupEnd = -1;
  const flush = () => { const n = Math.max(...group.map((g) => g.lane)) + 1; group.forEach((g) => (g.cols = n)); group = []; };
  for (const it of items) {
    if (group.length && it.a >= groupEnd) flush();
    const used = new Set(group.filter((g) => g.b > it.a).map((g) => g.lane));
    let lane = 0; while (used.has(lane)) lane++;
    it.lane = lane; group.push(it); groupEnd = Math.max(groupEnd, it.b);
  }
  if (group.length) flush();
  return items;
}
// 一天的时间表：换到前一天 / 下一天（换月份时先读那个月的活动）
async function stepDay(ymd, n) {
  const nd = addDays(ymd, n);
  state.sel = nd;
  if (nd.slice(0, 7) !== state.cursor) { state.cursor = nd.slice(0, 7); await renderCalendar(); } else drawGrid();
  openDay(nd, n);
}
function openDay(ymd, dir = 0) {
  HOUR_PX = PHONE() ? 64 : 56;
  const list = (byDay().get(ymd) || []);
  const allDay = list.filter((e) => e.all_day), timed = list.filter((e) => !e.all_day);
  const d0 = new Date(ymd + "T12:00:00Z");
  const wk = d0.toLocaleDateString(loc(), { weekday: "short", timeZone: "UTC" }).toUpperCase();
  const my = d0.toLocaleDateString(loc(), { month: "long", year: "numeric", timeZone: "UTC" });
  const hourLbl = (h) => new Date(Date.UTC(2024, 0, 1, h)).toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US", { hour: "numeric", hour12: true, timeZone: "UTC" });
  const blocks = layoutDay(timed, ymd).map((it, i) => `<button class="tl-ev rise" data-ev="${it.e.id}" style="--i:${i};--c:${esc(evColor(it.e))};--ink:${inkOf(evColor(it.e))};top:${it.top}px;height:${it.h}px;left:calc(var(--gut) + (100% - var(--gut) - 8px) * ${it.lane} / ${it.cols});width:calc((100% - var(--gut) - 8px) / ${it.cols} - 3px)">
      <b>${esc(it.e.title)}</b><span>${esc(fmtTime(it.e.start))}${it.e.end ? " – " + esc(fmtTime(it.e.end)) : ""}</span></button>`).join("");
  const isToday = ymd === ymdIn(Date.now());
  const nowTop = isToday ? ((Date.now() - Date.parse(wallToIso(ymd))) / 60000) * (HOUR_PX / 60) : -1;
  const d = showDlg("#dlg-day", `<div class="dlg day-dlg">
    <div class="day-head"><div class="day-date"><span>${esc(wk)}</span><b class="${isToday ? "today" : ""}">${Number(ymd.slice(8))}</b></div><div class="day-month">${esc(my)}</div>
      <button class="icon-btn day-nav" data-step="-1" aria-label="‹">${ICON.left}</button><button class="icon-btn day-nav" data-step="1" aria-label="›">${ICON.right}</button>
      <button class="icon-btn" data-close aria-label="${t("close")}">${ICON.x}</button></div>
    ${canEdit() ? `<button class="day-new" id="day-new" aria-label="${t("new_event")}">${ICON.plus}<span class="t">${t("new_event")}</span></button>` : ""}
    ${allDay.length ? `<div class="day-allday"><span class="lbl">${t("all_day_short")}</span>${allDay.map((e) => `<button class="chip" data-ev="${e.id}" style="--c:${esc(evColor(e))};--ink:${inkOf(evColor(e))}"><b class="raw">${esc(e.title)}</b></button>`).join("")}</div>` : ""}
    <div class="day-scroll" id="day-scroll"><div class="tl" style="height:${24 * HOUR_PX}px">
      ${Array.from({ length: 24 }, (_, h) => `<div class="tl-hour" data-hour="${h}" style="top:${h * HOUR_PX}px;height:${HOUR_PX}px"><span>${h ? esc(hourLbl(h)) : ""}</span></div>`).join("")}
      ${nowTop >= 0 ? `<div class="tl-now" style="top:${nowTop}px"></div>` : ""}
      ${blocks}
    </div></div></div>`, (dd) => {
      const box = dd.querySelector(".day-dlg");
      if (dir) box.classList.add(dir > 0 ? "slide-next" : "slide-prev");
      // 左右滑动 → 下一天 / 前一天
      let sx = 0, sy = 0;
      box.addEventListener("touchstart", (e) => { const p = e.touches[0]; sx = p.clientX; sy = p.clientY; }, { passive: true });
      box.addEventListener("touchend", (e) => {
        const p = e.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) stepDay(ymd, dx < 0 ? 1 : -1);
      }, { passive: true });
      box.onclick = (e) => {
        const st = e.target.closest("[data-step]"); if (st) return stepDay(ymd, Number(st.dataset.step));
        const ev = e.target.closest("[data-ev]"); if (ev) return openDetail(Number(ev.dataset.ev));
        if (e.target.closest("#day-new")) return openForm(null, ymd);
        const hr = e.target.closest("[data-hour]"); if (hr && canEdit()) openForm(null, ymd, Number(hr.dataset.hour));
      };
    });
  // 卷到第一个活动（或早上 8 点）
  const first = timed.length ? Math.min(...timed.map((e) => dayParts(e, ymd).top)) : 8 * HOUR_PX;
  const sc = $("#day-scroll", d); sc.scrollTop = Math.max(0, Math.min(first, isToday ? nowTop : first) - HOUR_PX * 0.6);
}
function refreshDay() { const d = $("#dlg-day"); if (d?.open && state.sel) openDay(state.sel); }

function evRow(e, withDate = false) {
  const tpl = tplOf(e.template_id), lab = labelOf(e);
  const when = e.all_day ? t("all_day") : fmtTime(e.start);
  const who = e.person_name ? `${e.person_emoji || ""} ${e.person_name}` : e.creator_name ? `${e.creator_emoji || ""} ${e.creator_name}` : "";
  return `<button class="ev-row" data-ev="${e.id}" style="--c:${esc(evColor(e))};--ink:${inkOf(evColor(e))}">
    <span class="ev-time">${withDate ? esc(fmtDay(ymdIn(e.start))) + "<br>" : ""}${esc(when)}</span>
    <span style="min-width:0"><div class="ev-title">${esc(e.title)}</div><div class="ev-sub">${esc([lab?.name, who].filter(Boolean).join(" · "))}</div></span>
    ${untaggedEv(e) ? `<span class="tag bad">${t("untagged_title")}</span>` : tpl ? `<span class="tag">${esc(tpl.name)}</span>` : ""}</button>`;
}
function drawDay(map) {
  const list = (map || byDay()).get(state.sel) || [];
  if (state.loadingMonth) { $("#day-title").textContent = fmtDay(state.sel, { year: "numeric", month: "long", day: "numeric", weekday: "long" }); $("#day-list").innerHTML = skRows(2, 62); return; }
  $("#day-title").textContent = fmtDay(state.sel, { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  $("#day-list").innerHTML = list.length ? list.map((e) => evRow(e)).join("") : `<p class="empty">${t("no_events")}</p>`;
  $("#day-list").onclick = (e) => { const r = e.target.closest("[data-ev]"); if (r) openDetail(Number(r.dataset.ev)); };
}
async function loadUntagged() {
  try {
    const to = new Date(Date.now() + 365 * 86400000).toISOString();
    const list = await api(`/api/events?from=${encodeURIComponent(wallToIso(DASH_START))}&to=${encodeURIComponent(to)}`);
    state.untagged = list.filter(untaggedEv);
  } catch { state.untagged = []; }
  const n = state.untagged.length;
  const bar = $("#untag-bar");
  if (bar) { bar.hidden = !n; bar.innerHTML = `<span>⚠ ${t("untagged", { n })}</span><span>${t("view")} ›</span>`; }
  const c = $("#untag-count"); if (c) { c.hidden = !n; c.textContent = n; }
}
// ---------------- 回收站（5 天内可以复原） ----------------
async function openTrash() {
  chime("gear");
  const draw = (r) => {
    const left = (iso) => { const ms = Date.parse(iso) + r.days * 86400000 - Date.now(), h = Math.max(1, Math.ceil(ms / 3600000)); return h >= 48 ? t("days_left", { n: Math.ceil(h / 24) }) : t("hours_left", { n: h }); };
    return r.items.length ? r.items.map((e, i) => `<div class="item rise" style="--i:${i};border-left:4px solid ${esc(labelHex(e.label))}">
      <div class="grow"><b class="raw">${esc(e.title)}</b><div class="sub">${esc(fmtDay(ymdIn(e.start), { year: "numeric", month: "short", day: "numeric", weekday: "short" }))}${e.all_day ? "" : " · " + esc(fmtTime(e.start))}</div>
      <div class="sub">${t("deleted_by", { who: (e.deleted_by_emoji || "") + " " + e.deleted_by_name })} · ${esc(ago(e.deleted_at))} · ${left(e.deleted_at)}</div></div>
      <button class="btn sm" data-restore="${e.id}">${t("restore")}</button></div>`).join("") : `<p class="empty">${t("trash_empty")}</p>`;
  };
  const d = showDlg("#dlg", `<div class="dlg"><div class="dlg-head"><h2>${t("trash")}</h2><button class="icon-btn" data-close aria-label="${t("close")}">${ICON.x}</button></div>
    <div class="dlg-body"><div class="list" id="trash-list">${skRows(3, 70)}</div></div></div>`);
  try { $("#trash-list", d).innerHTML = draw(await api("/api/trash")); } catch (e) { return fail(e); }
  $("#trash-list", d).onclick = async (e) => {
    const b = e.target.closest("[data-restore]"); if (!b) return;
    b.disabled = true;
    try { const r = await api(`/api/trash/${b.dataset.restore}/restore`, { method: "POST" }); $("#trash-list", d).innerHTML = draw(r); toast(t("restored")); chime("ok"); refreshCalendar(); }
    catch (er) { fail(er); b.disabled = false; }
  };
}

function openUntagged() {
  showDlg("#dlg", `<div class="dlg"><div class="dlg-head"><h2>${t("untagged", { n: state.untagged.length })}</h2><button class="icon-btn" data-close aria-label="${t("close")}">${ICON.x}</button></div>
    <div class="dlg-body"><div class="day-list">${state.untagged.map((e) => evRow(e, true)).join("") || `<p class="empty">${t("no_events")}</p>`}</div></div></div>`,
  (d) => { d.querySelector(".day-list").onclick = (e) => { const r = e.target.closest("[data-ev]"); if (r) openDetail(Number(r.dataset.ev)); }; });
}

// ---------------- 搜索活动（标题或备注） ----------------
function openSearch() {
  showDlg("#dlg", `<div class="dlg"><div class="dlg-head"><h2>${t("search")}</h2><button class="icon-btn" data-close aria-label="${t("close")}">${ICON.x}</button></div>
    <div class="dlg-body"><input class="input" id="s-q" type="search" placeholder="${t("search_ph")}" autocomplete="off"><div class="day-list" id="s-list"></div></div></div>`,
  (d) => {
    let timer = null, seq = 0;
    const run = async () => {
      const q = $("#s-q", d).value.trim(), my = ++seq, box = $("#s-list", d);
      if (!q) { box.innerHTML = ""; return; }
      try {
        const list = await api(`/api/events?q=${encodeURIComponent(q)}`);
        if (my !== seq) return;
        const shown = list.filter((e) => !e.birthday_user_id).reverse().slice(0, 100);
        box.innerHTML = shown.length ? shown.map((e) => evRow(e, true)).join("") : `<p class="empty">${t("no_results")}</p>`;
      } catch (er) { fail(er); }
    };
    $("#s-q", d).addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 300); });
    $("#s-list", d).onclick = (ev) => { const r = ev.target.closest("[data-ev]"); if (r) openDetail(Number(r.dataset.ev)); };
    setTimeout(() => $("#s-q", d).focus(), 30);
  });
}

// ---------------- 对话框 ----------------
function showDlg(sel, html, wire) {
  const d = $(sel);
  d.innerHTML = html;
  d.onclick = (e) => { if (e.target === d || e.target.closest("[data-close]")) d.close(); };
  wire?.(d);
  // 只有第一次打开时有动画（之后重画内容不会闪）
  if (!d.open) { d.firstElementChild?.classList.add("anim"); d.showModal(); }
  return d;
}

// ---------------- 活动：表单 ----------------
let form = null;
// 负责人的选项：这个日历里的所有人（包括管理员）
let calPeople = null;
async function ensurePeople(force = false) {
  if (calPeople && !force) return calPeople;
  try { calPeople = await api("/api/people"); } catch { calPeople = calPeople || []; }
  return calPeople;
}
document.addEventListener("change", (e) => { if (e.target.matches?.("[data-person]") && form) { form.person_id = e.target.value; form.miss?.delete("person_id"); e.target.closest(".tick-f")?.classList.remove("miss"); } });
async function openForm(ev, day, hour = null) {
  await ensurePeople();
  form = ev ? {
    id: ev.id, title: ev.title, all_day: !!ev.all_day, date: ymdIn(ev.start), st: ev.all_day ? "10:00" : hmIn(ev.start), et: ev.end && !ev.all_day ? hmIn(ev.end) : "",
    template_id: ev.template_id || "", brand: ev.brand || "", soft: ev.soft || "", sales_type: ev.sales_type || "", label_id: ev.label_id || "", notes: ev.notes || "",
    person_id: ev.person_id ? String(ev.person_id) : "",
  } : { id: null, title: "", all_day: hour == null, date: day || ymdIn(Date.now()), st: hour == null ? "10:00" : `${pad(hour)}:00`, et: hour == null ? "11:00" : `${pad(Math.min(23, hour + 1))}:${hour >= 23 ? "59" : "00"}`,
      template_id: "", brand: "", soft: "", sales_type: "", label_id: "", notes: "", person_id: "" };
  drawForm();
}
function tickHtml(f) {
  const tpl = tplOf(f.template_id);
  if (!tpl || tpl.kind === "normal") return "";
  const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-tick="${key}" data-v="${v}" aria-pressed="${f[key] === v}">${esc(l)}</button>`).join("")}</div>`;
  const ppl = calPeople || [];
  const req = (k, label, inner) => `<div class="tick-f${f.miss?.has(k) ? " miss" : ""}" data-req="${k}"><span class="tick-l">${label} <i>*</i></span>${inner}</div>`;
  const personSel = `<select class="input" id="f-person" data-person aria-label="${t("person_ic")}">
    <option value="">${t("choose_person")}</option>${ppl.map((u) => `<option value="${u.id}"${String(f.person_id || "") === String(u.id) ? " selected" : ""}>${esc((u.emoji ? u.emoji + " " : "") + u.name)}</option>`).join("")}</select>`;
  return `<div class="ticks">${req("brand", t("brand"), seg("brand", [["Legends", "Legends"], ["WM", "WM"]]))}
    ${tpl.kind === "photo" ? req("soft", t("tick_type"), seg("soft", [["non_all_soft", "Non-All Soft"], ["all_soft", "All Soft"]])) : req("sales_type", t("tick_type"), seg("sales_type", [["visit", t("visit")], ["vc", t("vc")]]))}
    ${req("person_id", t("person_ic"), personSel)}</div>`;
}
// 模板写清楚是做什么的：选片 (Photo Selection)、了解 (Sales)、普通（下面列出它的标签）
const tplName = (x) => `${x.name}${x.kind === "photo" || x.kind === "sales" ? " (Sales)" : ""}`; // 选片 (Sales)、了解 (Sales)
const labelsOfTpl = (x) => (state.config.labelList || []).filter((l) => (tplOf(l.template_id)?.kind || "normal") === x.kind);
function tplPicker(f, withAdd = false) {
  return `<div class="tpl-cards">${(state.config.templates || []).map((x) => {
    const labs = labelsOfTpl(x);
    return `<div class="tpl-card" data-on="${f.template_id === x.id}">
      <button type="button" class="tpl-btn" data-tpl="${x.id}" aria-pressed="${f.template_id === x.id}">${esc(tplName(x))}</button>
      <div class="labels">${labs.map((l) => `<button type="button" class="lab" data-lab="${esc(l.id)}" data-lab-tpl="${x.id}" style="--c:${esc(labelHex(l.color))};--ink:${inkOf(labelHex(l.color))}" aria-pressed="${f.label_id === l.id}"><i></i>${esc(l.name)}</button>`).join("")}
        ${withAdd && x.kind === "normal" ? `<button type="button" class="lab add" id="add-lab" aria-label="${t("new_label")}" title="${t("new_label")}">+</button>` : ""}</div>
      ${f.template_id === x.id ? tickHtml(f) : ""}
    </div>`;
  }).join("")}</div>`;
}
// 按标签 = 同时选好那个模板；再按一次只取消标签
function pickLabel(f, el) {
  f.label_id = f.label_id === el.dataset.lab ? "" : el.dataset.lab;
  if (f.label_id) f.template_id = el.dataset.labTpl;
}
// 活动表单：分成几段（标题 + 模板 / 时间 / 标签和必填 / 备注），每段左边有小图示；手机上保存按钮在右上角
function efLabels(f, withAdd) {
  const tpl = tplOf(f.template_id);
  if (!tpl) return `<p class="ef-hint">${t("pick_tpl_first")}</p>`;
  const labs = labelsOfTpl(tpl);
  return `<div class="labels">${labs.map((l) => `<button type="button" class="lab" data-lab="${esc(l.id)}" data-lab-tpl="${tpl.id}" style="--c:${esc(labelHex(l.color))};--ink:${inkOf(labelHex(l.color))}" aria-pressed="${f.label_id === l.id}"><i></i>${esc(l.name)}</button>`).join("")}
    ${withAdd && tpl.kind === "normal" ? `<button type="button" class="lab add" id="add-lab" aria-label="${t("new_label")}" title="${t("new_label")}">+</button>` : ""}</div>${tickHtml(f)}`;
}
function drawForm() {
  const f = form;
  showDlg("#dlg", `<form class="dlg ef" id="ev-form" novalidate>
    <div class="dlg-head"><button type="button" class="icon-btn" data-close aria-label="${t("close")}">${ICON.x}</button><h2>${f.id ? t("edit_event") : t("new_event")}</h2><button type="submit" class="btn ef-save-top">${t("save")}</button></div>
    <div class="dlg-body">
      <section class="ef-sec ef-top">
        <input class="ef-title" id="f-title" maxlength="300" value="${esc(f.title)}" placeholder="${t("add_title")}" aria-label="${t("title")}">
        <div class="ef-tpls" role="group" aria-label="${t("template")}">${(state.config.templates || []).map((x) => `<button type="button" class="ef-tpl" data-tpl="${x.id}" aria-pressed="${f.template_id === x.id}">${esc(tplName(x))}</button>`).join("")}</div>
      </section>
      <section class="ef-sec ef-time"><span class="ef-ico" aria-hidden="true">${ICON.clock}</span><div class="ef-main">
        <span class="ef-cap">${t("time")}</span>
        <label class="ef-switch"><span>${t("all_day")}</span><input type="checkbox" id="f-allday" ${f.all_day ? "checked" : ""}><i aria-hidden="true"></i></label>
        <div class="ef-row"><label for="f-date">${t("date")}</label><input class="input" type="date" id="f-date" value="${f.date}"></div>
        ${f.all_day ? "" : `<div class="ef-row"><label for="f-st">${t("start")}</label><input class="input" type="time" id="f-st" value="${f.st}"></div>
        <div class="ef-row"><label for="f-et">${t("end")}</label><input class="input" type="time" id="f-et" value="${f.et}"></div>`}
      </div></section>
      <section class="ef-sec ef-label"><span class="ef-ico" aria-hidden="true">${ICON.rates}</span><div class="ef-main" id="tpl-box">
        <span class="ef-cap">${t("label")}</span>${efLabels(f, true)}
      </div></section>
      <section class="ef-sec ef-note"><span class="ef-ico" aria-hidden="true">${ICON.note}</span><div class="ef-main">
        <span class="ef-cap">${t("notes")}</span>
        <textarea class="input ef-notes" id="f-notes" maxlength="5000" placeholder="${t("notes")}" aria-label="${t("notes")}">${esc(f.notes)}</textarea>
      </div></section>
      ${canEdit() ? `<section class="ef-sec ef-posts"><span class="ef-ico" aria-hidden="true">${ICON.img}</span><div class="ef-main">
        <span class="ef-cap">${t("photos_comments")}</span>
        ${(f.posts || []).map((p, i) => `<div class="ef-q"><div class="ef-q-body">${p.text ? `<p class="raw">${esc(p.text)}</p>` : ""}${p.files.length ? `<div class="thumbs">${p.files.map((x) => `<img src="${x.url}" alt="">`).join("")}</div>` : ""}</div><button type="button" class="ef-q-x" data-rmpost="${i}" aria-label="${t("delete")}">✕</button></div>`).join("")}
        <textarea class="input" id="f-ptext" maxlength="2000" placeholder="${t("post_ph")}" style="min-height:58px">${esc(f.ptext || "")}</textarea>
        <div class="thumbs" id="f-pthumbs">${(f.pfiles || []).map((x) => `<img src="${x.url}" alt="">`).join("")}</div>
        <div class="row" style="justify-content:space-between"><label class="btn ghost sm" style="cursor:pointer">${ICON.img}${t("photos")}<input type="file" id="f-pfiles" accept="image/*" multiple hidden></label><button type="button" class="btn sm" id="f-padd">${ICON.plus}${t("add_post")}</button></div>
      </div></section>` : ""}
      <p class="err" id="f-err"></p>
    </div>
    <div class="dlg-foot"><button type="button" class="btn ghost" data-close>${t("cancel")}</button><button type="submit" class="btn">${t("save")}</button></div></form>`,
  (d) => {
    const fm = $("#ev-form", d);
    fm.addEventListener("click", (e) => {
      if (e.target.closest("#f-padd")) { readForm(); queuePost(f); return drawForm(); }
      const rm = e.target.closest("[data-rmpost]"); if (rm) { readForm(); f.posts.splice(Number(rm.dataset.rmpost), 1); return drawForm(); }
      const x = e.target.closest("[data-tpl],[data-tick],[data-lab],#add-lab"); if (!x) return;
      readForm();
      if (x.id === "add-lab") return openLabelDlg((l) => { if (l) { form.label_id = l.id; form.template_id = l.template_id || (state.config.templates || []).find((x) => x.kind === "normal")?.id || form.template_id; } drawForm(); });
      if (x.dataset.tpl) { if (f.template_id !== x.dataset.tpl) { f.template_id = x.dataset.tpl; const l = (state.config.labelList || []).find((y) => y.id === f.label_id); if (l && (tplOf(l.template_id)?.kind || "normal") !== tplOf(f.template_id)?.kind) f.label_id = ""; } }
      if (x.dataset.tick) { f[x.dataset.tick] = x.dataset.v; f.miss?.delete(x.dataset.tick); }
      if (x.dataset.lab) pickLabel(f, x);
      drawForm();
    });
    $("#f-allday", d).onchange = () => { readForm(); drawForm(); };
    $("#f-pfiles", d)?.addEventListener("change", (ev) => {
      f.pfiles = [...(f.pfiles || []), ...[...ev.target.files].map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 10);
      $("#f-pthumbs", d).innerHTML = f.pfiles.map((x) => `<img src="${x.url}" alt="">`).join("");
    });
    fm.addEventListener("submit", (e) => { e.preventDefault(); saveForm(); });
  });
  if (!f.title) setTimeout(() => $("#f-title")?.focus(), 30);
}
// 表单里的「照片和留言」：先放在清单里，按保存后才一笔一笔发到活动
function queuePost(f) {
  const text = (f.ptext || "").trim(), files = f.pfiles || [];
  if (!text && !files.length) return false;
  (f.posts ||= []).push({ text, files }); f.ptext = ""; f.pfiles = [];
  return true;
}
function readForm() {
  const f = form;
  f.title = $("#f-title").value; f.all_day = $("#f-allday").checked; f.date = $("#f-date").value || f.date;
  if ($("#f-st")) { f.st = $("#f-st").value || f.st; f.et = $("#f-et").value; }
  f.notes = $("#f-notes").value;
  if ($("#f-ptext")) f.ptext = $("#f-ptext").value;
  if ($("#f-person")) f.person_id = $("#f-person").value;
}
async function saveForm() {
  readForm();
  const f = form, err = (m) => { $("#f-err").textContent = m; chime("bad"); };
  if (!f.title.trim()) return err(t("need_title"));
  if (!f.template_id) return err(t("need_tpl"));
  const kind = tplOf(f.template_id)?.kind;
  if (kind === "photo" || kind === "sales") {
    const need = ["brand", kind === "photo" ? "soft" : "sales_type", "person_id"].filter((k) => !f[k]);
    if (need.length) {
      f.miss = new Set(need); drawForm();
      $("#ev-form .tick-f.miss")?.scrollIntoView({ behavior: "smooth", block: "center" });
      $("#f-err").textContent = t("need_ticks"); chime("bad"); return;
    }
  }
  const body = {
    title: f.title.trim(), all_day: f.all_day, notes: f.notes,
    start: wallToIso(f.date, f.all_day ? "00:00" : f.st),
    end: f.all_day ? null : f.et ? wallToIso(f.date, f.et) : null,
    template_id: f.template_id, brand: f.brand || null, soft: f.soft || null, sales_type: f.sales_type || null, label_id: f.label_id || null,
    person_id: f.person_id ? Number(f.person_id) : null,
  };
  try {
    const saved = await api(f.id ? `/api/events/${f.id}` : "/api/events", { method: f.id ? "PATCH" : "POST", body });
    queuePost(f); // 打了字 / 选了照片但没按「加入」的，也一起发
    for (const p of f.posts || []) {
      try {
        const fd = new FormData(); fd.append("text", p.text);
        for (const x of p.files) fd.append("photos", await shrink(x.file), "photo.jpg");
        await api(`/api/events/${saved.id}/posts`, { method: "POST", body: fd });
      } catch (er) { fail(er); }
    }
    f.posts = [];
    $("#dlg").close();
    if (f.id) { toast(t("saved")); chime("ok"); } else celebrate();
    state.sel = f.date; state.cursor = f.date.slice(0, 7);
    if (state.page === "calendar") renderCalendar();
    if (f.id) openDetail(saved.id);
  } catch (e) { err(e.message); }
}

// ---------------- 新增标签（「+」） ----------------
function openLabelDlg(done, edit = null) {
  const l = { name: edit?.name || "", color: edit?.color || "5", template_id: edit?.template_id || "" };
  const draw = () => showDlg("#dlg2", `<form class="dlg" id="lab-form" novalidate>
    <div class="dlg-head"><h2>${edit ? t("edit") : t("new_label")}</h2><button type="button" class="icon-btn" data-close aria-label="${t("close")}">${ICON.x}</button></div>
    <div class="dlg-body">
      <div class="field"><label for="l-name">${t("label_name")}</label><input class="input" id="l-name" maxlength="30" value="${esc(l.name)}"></div>
      <div class="field"><span class="lbl">${t("colour")}</span><div class="swatches">${Object.keys(state.config.labels).sort((a, b) => (state.config.labels[a].order || 99) - (state.config.labels[b].order || 99)).map((c) => `<button type="button" class="sw" style="--c:${esc(labelHex(c))}" data-c="${c}" aria-pressed="${c === l.color}" aria-label="${esc(state.config.labels[c].name)}" title="${esc(state.config.labels[c].name)}"></button>`).join("")}</div></div>
      <div class="field"><span class="lbl">${t("template")}</span><div class="seg" role="group"><button type="button" data-t="" aria-pressed="${!l.template_id}">${t("no_tpl")}</button>${(state.config.templates || []).map((x) => `<button type="button" data-t="${x.id}" aria-pressed="${l.template_id === x.id}">${esc(x.name)}</button>`).join("")}</div></div>
      <p class="err" id="l-err"></p>
    </div>
    <div class="dlg-foot">${edit ? `<button type="button" class="btn danger" id="l-del">${t("delete")}</button><span class="spacer"></span>` : ""}<button type="button" class="btn ghost" data-close>${t("cancel")}</button><button type="submit" class="btn">${t("save")}</button></div></form>`,
  (d) => {
    const fm = $("#lab-form", d);
    fm.addEventListener("click", (e) => {
      const x = e.target.closest("[data-c],[data-t]"); if (!x) return;
      l.name = $("#l-name").value;
      if (x.dataset.c) l.color = x.dataset.c; else l.template_id = x.dataset.t;
      draw();
    });
    $("#l-del", d)?.addEventListener("click", async () => {
      if (!(await confirmBox({ title: t("cf_label", { n: edit.name }), text: t("cf_label_t"), ok: t("delete") }))) return;
      try { const r = await api("/api/label-list", { method: "PUT", body: { labels: state.config.labelList.filter((x) => x.id !== edit.id) } }); state.config.labelList = r.labelList; d.close(); done?.(null); }
      catch (er) { fail(er); }
    });
    fm.addEventListener("submit", async (e) => {
      e.preventDefault();
      l.name = $("#l-name").value.trim();
      if (!l.name) { $("#l-err").textContent = t("label_name"); return; }
      try {
        let r;
        if (edit) r = await api("/api/label-list", { method: "PUT", body: { labels: state.config.labelList.map((x) => (x.id === edit.id ? { ...x, ...l, template_id: l.template_id || null } : x)) } });
        else r = await api("/api/label-list", { method: "POST", body: { ...l, template_id: l.template_id || null } });
        state.config.labelList = r.labelList;
        d.close(); chime("ok");
        done?.(r.label || r.labelList.find((x) => x.id === edit?.id));
      } catch (er) { $("#l-err").textContent = er.message; }
    });
  });
  draw();
  setTimeout(() => $("#l-name")?.focus(), 30);
}

// ---------------- 活动：详细 ----------------
let detail = null, pending = [];
async function openDetail(id) {
  try { [detail] = await Promise.all([api(`/api/events/${id}`), ensurePeople()]); } catch (e) { return fail(e); }
  pending = [];
  drawDetail();
}
function drawDetail() {
  const e = detail, tpl = tplOf(e.template_id), lab = labelOf(e);
  const when = e.all_day ? `${fmtDay(ymdIn(e.start), { year: "numeric", month: "long", day: "numeric", weekday: "short" })} · ${t("all_day")}`
    : `${fmtDay(ymdIn(e.start), { year: "numeric", month: "long", day: "numeric", weekday: "short" })} · ${fmtTime(e.start)}${e.end ? " – " + fmtTime(e.end) : ""}`;
  const tickTxt = tpl && tpl.kind !== "normal" ? [e.brand, tpl.kind === "photo" ? { non_all_soft: "Non-All Soft", all_soft: "All Soft" }[e.soft] : { visit: t("visit"), vc: t("vc") }[e.sales_type]].filter(Boolean).join(" · ") : "";
  const needTpl = untaggedEv(e) && canEdit();
  if (needTpl) form = { template_id: "", brand: "", soft: "", sales_type: "", label_id: e.label_id || "", person_id: e.person_id ? String(e.person_id) : "" };
  const posts = (e.feed || []).map((f) => {
    if (f.type === "log") return "";
    const head = `<div class="post-who"><b>${esc(f.author || "—")}</b> · ${esc(ago(f.created_at))}</div>`;
    const del = canEdit() ? `<button class="x" data-del-${f.type}="${f.id}" aria-label="${t("delete")}">✕</button>` : "<span></span>";
    if (f.type === "comment") return `<div class="post"><span></span><div>${head}<div class="post-body">${esc(f.body)}</div></div>${del}</div>`;
    return `<div class="post"><span></span><div>${head}${f.caption ? `<div class="post-body">${esc(f.caption)}</div>` : ""}<a href="${f.url || photoUrl(f.id)}" target="_blank" rel="noopener"><img src="${f.url || photoUrl(f.id)}" alt="" loading="lazy"></a></div>${del}</div>`;
  }).join("");
  showDlg("#dlg", `<div class="dlg">
    <div class="dlg-head"><h2 class="raw">${esc(e.title)}</h2><button class="icon-btn" data-close aria-label="${t("close")}">${ICON.x}</button></div>
    <div class="dlg-body">
      <div class="meta">
        <span class="tag">${esc(when)}</span>
        ${lab ? `<span class="tag" style="--c:${esc(labelHex(lab.color))}"><i></i>${esc(lab.name)}</span>` : ""}
        ${tpl ? `<span class="tag ok">${esc(tplName(tpl))}${tickTxt ? " · " + esc(tickTxt) : ""}</span>` : e.birthday_user_id ? "" : `<span class="tag bad">${t("untagged_title")}</span>`}
        ${e.person_name ? `<span class="tag ok">${t("person_ic")}: ${esc(e.person_emoji || "")} ${esc(e.person_name)}</span>` : tpl && tpl.kind !== "normal" ? `<span class="tag bad">${t("need_person")}</span>` : ""}
        ${e.creator_name ? `<span class="tag">${esc(e.creator_emoji || "")} ${esc(e.creator_name)}</span>` : ""}
      </div>
      ${needTpl ? `<div class="sec" id="fix-tpl"><h3>${t("template")}</h3><div id="tpl-box">${tplPicker(form)}</div><div class="row"><button class="btn sm" id="tpl-save">${t("save")}</button><p class="err" id="tpl-err"></p></div></div>` : ""}
      ${e.notes ? `<p class="notes">${esc(e.notes)}</p>` : ""}
      <div class="feed">${posts}</div>
      ${canEdit() ? `<div class="composer"><textarea class="input" id="p-text" placeholder="${t("post_ph")}" style="min-height:64px"></textarea>
        <div class="thumbs" id="p-thumbs"></div>
        <div class="row" style="justify-content:space-between"><label class="btn ghost sm" style="cursor:pointer">${ICON.img}${t("photos")}<input type="file" id="p-files" accept="image/*" multiple hidden></label><button class="btn sm" id="p-send">${t("post")}</button></div></div>` : ""}
    </div>
    ${canEdit() ? `<div class="dlg-foot"><button class="btn danger" id="d-del">${t("delete")}</button><span class="spacer"></span><button class="btn ghost" id="d-edit">${t("edit")}</button></div>` : ""}
  </div>`, (d) => {
    $("#d-edit", d)?.addEventListener("click", () => openForm(detail));
    $("#d-del", d)?.addEventListener("click", async () => {
      if (!(await confirmBox({ title: t("cf_event"), text: t("cf_event_t", { n: e.title }), ok: t("delete") }))) return;
      try { await api(`/api/events/${e.id}`, { method: "DELETE" }); d.close(); toast(t("deleted")); refreshCalendar(); } catch (er) { fail(er); }
    });
    $("#fix-tpl", d)?.addEventListener("click", (ev) => {
      const x = ev.target.closest("[data-tpl],[data-tick],[data-lab]"); if (!x) return;
      if (x.dataset.lab) pickLabel(form, x); else if (x.dataset.tpl) form.template_id = x.dataset.tpl; else form[x.dataset.tick] = x.dataset.v;
      $("#tpl-box", d).innerHTML = tplPicker(form);
    });
    $("#tpl-save", d)?.addEventListener("click", async () => {
      if (!form.template_id) { $("#tpl-err").textContent = t("need_tpl"); return; }
      const k = tplOf(form.template_id)?.kind;
      if ((k === "photo" || k === "sales") && !form.person_id) { $("#tpl-err").textContent = t("need_person"); return; }
      try {
        await api(`/api/events/${e.id}`, { method: "PATCH", body: { template_id: form.template_id, brand: form.brand || null, soft: form.soft || null, sales_type: form.sales_type || null, person_id: form.person_id ? Number(form.person_id) : null, ...(form.label_id ? { label_id: form.label_id } : {}) } });
        chime("ok"); toast(t("saved"));
        refreshCalendar();
        // 还有其他未选模板的活动 → 回到清单，继续下一个
        await loadUntagged();
        if (state.untagged.length) openUntagged(); else openDetail(e.id);
      } catch (er) { $("#tpl-err").textContent = er.message; chime("bad"); }
    });
    d.querySelector(".feed").onclick = async (ev) => {
      const c = ev.target.closest("[data-del-comment]"), p = ev.target.closest("[data-del-photo]");
      if (!c && !p) return;
      if (!(await confirmBox({ title: t(c ? "cf_comment" : "cf_photo"), text: t("cf_cant_undo"), ok: t("delete") }))) return;
      try {
        if (c) await api(`/api/comments/${c.dataset.delComment}`, { method: "DELETE" });
        else if (p) await api(`/api/photos/${p.dataset.delPhoto}`, { method: "DELETE" });
        else return;
        openDetail(e.id);
      } catch (er) { fail(er); }
    };
    $("#p-files", d)?.addEventListener("change", (ev) => {
      pending = [...pending, ...ev.target.files].slice(0, 10);
      $("#p-thumbs", d).innerHTML = pending.map((f) => `<img src="${URL.createObjectURL(f)}" alt="">`).join("");
    });
    $("#p-send", d)?.addEventListener("click", async (ev) => {
      const text = $("#p-text", d).value.trim();
      if (!text && !pending.length) return;
      ev.target.disabled = true;
      try {
        const fd = new FormData(); fd.append("text", text);
        for (const f of pending) fd.append("photos", await shrink(f), "photo.jpg");
        detail = await api(`/api/events/${e.id}/posts`, { method: "POST", body: fd });
        pending = []; drawDetail(); chime("ok");
      } catch (er) { fail(er); ev.target.disabled = false; }
    });
  });
}
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, 1280 / Math.max(bmp.width, bmp.height)); // 照片缩小，省照片空间
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b || file), "image/jpeg", 0.8));
  } catch { return file; }
}
function refreshCalendar() { if (state.page === "calendar") { loadMonth(); loadUntagged(); } }

// ================= Label & People =================
async function renderPeople() {
  $("#main").innerHTML = topBar(t("nav_people")) + `<section class="page">
    <div class="card"><div class="card-head"><h2>${t("people")}</h2></div><div class="people" id="people"></div></div>
    <div class="card"><div class="card-head"><h2>${t("labels")}</h2>${canEdit() ? `<button class="btn sm" id="lab-add">${ICON.plus}${t("new_label")}</button>` : ""}</div><div class="labels" id="lab-list"></div></div>
  </section>`;
  $("#lab-add")?.addEventListener("click", () => openLabelDlg(() => drawLabels()));
  drawLabels();
  $("#people").innerHTML = Array.from({ length: 4 }, (_, i) => sk("sk-person", `animation-delay:${i * 0.08}s`)).join("");
  let people = [];
  try { people = await api("/api/people"); } catch (e) { return fail(e); }
  const bd = (p) => (p.birth_month ? new Date(Date.UTC(2024, p.birth_month - 1, p.birth_day)).toLocaleDateString(loc(), { month: "long", day: "numeric", timeZone: "UTC" }) : "");
  $("#people").innerHTML = people.map((p, i) => `<div class="person rise" style="--i:${i}">${avatar(p.emoji, p.color, "", p.avatar)}
    <div class="grow"><div class="person-name">${esc(p.name)}</div><div class="person-sub">${[p.admin ? t("admin") : "", p.role === "viewer" ? t("viewer") : "", bd(p) ? "🎂 " + esc(bd(p)) : ""].filter(Boolean).join(" · ")}</div></div>
    ${isAdmin() && p.id !== state.me.id ? `<button class="btn danger sm" data-rm="${p.id}">${t("remove")}</button>` : ""}</div>`).join("");
  $("#people").onclick = async (e) => {
    const b = e.target.closest("[data-rm]"); if (!b) return;
    const who = b.closest(".person")?.querySelector("b")?.textContent || "";
    if (!(await confirmBox({ title: t("cf_person", { n: who }), text: t("cf_person_t"), ok: t("remove") }))) return;
    try { await api(`/api/people/${b.dataset.rm}`, { method: "DELETE" }); toast(t("deleted")); renderPeople(); } catch (er) { fail(er); }
  };
}
function drawLabels() {
  const box = $("#lab-list"); if (!box) return;
  box.innerHTML = (state.config.labelList || []).map((l) => `<button class="lab" data-l="${esc(l.id)}" style="--c:${esc(labelHex(l.color))};--ink:${inkOf(labelHex(l.color))}" ${isAdmin() ? "" : "disabled"}><i></i>${esc(l.name)}${l.template_id ? ` <span class="tag" style="padding:1px 7px">${esc(tplOf(l.template_id)?.name || "")}</span>` : ""}</button>`).join("");
  box.onclick = (e) => {
    const b = e.target.closest("[data-l]"); if (!b || !isAdmin()) return;
    openLabelDlg(() => drawLabels(), state.config.labelList.find((x) => x.id === b.dataset.l));
  };
}

// ================= 最新动态 =================
async function renderActivity() {
  $("#main").innerHTML = topBar(t("nav_activity")) + `<section class="page"><div class="card"><div class="list" id="acts">${skRows(6, 58)}</div><button class="btn ghost" id="act-more" hidden>${t("more")}</button></div></section>`;
  let items = [];
  const row = (a, i) => `<div class="item rise" style="--i:${i}">${avatar(a.emoji, a.color, "sm")}
        <div class="grow act-text">${t("a_" + a.action, { who: a.name, t: a.title || "" })}</div><span class="act-when">${esc(ago(a.created_at))}</span></div>`;
  const load = async (before) => {
    try {
      const more = await api(`/api/activity${before ? `?before=${before}` : ""}`);
      // 第一次：整个清单错峰进来；按「更多」：只有新的那几笔错峰进来
      if (!before) $("#acts").innerHTML = more.length ? more.map(row).join("") : `<p class="empty">${t("no_activity")}</p>`;
      else $("#acts").insertAdjacentHTML("beforeend", more.map(row).join(""));
      items = [...items, ...more];
      $("#act-more").hidden = more.length < 50;
      if (!before && more[0]) { api("/api/activity/seen", { method: "POST", body: { upTo: more[0].id } }).catch(() => {}); setActUnread(0); }
    } catch (e) { fail(e); }
  };
  $("#act-more").onclick = () => load(items[items.length - 1]?.id);
  load();
}

// ================= ⚙️ 设置 =================
async function openSettings() {
  try { history.replaceState(null, "", "#" + state.page); } catch {}
  const me = state.me;
  const tzs = [...new Set([me.timezone || tz(), "Asia/Kuala_Lumpur", "Asia/Singapore", "Asia/Hong_Kong", "Asia/Taipei", "Asia/Shanghai", "Asia/Jakarta", "Asia/Bangkok", "Asia/Tokyo", "Australia/Sydney", "Europe/London", "America/Los_Angeles", "America/New_York"])];
  const p = { emoji: me.emoji, color: me.color };
  const cal = state.cals.find((c) => String(c.id) === store.get("cal"));
  const html = `<div class="dlg">
    <div class="dlg-head"><h2>${t("settings")}</h2><button class="icon-btn" data-close aria-label="${t("close")}">${ICON.x}</button></div>
    <div class="dlg-body">
      <div class="sec" id="s-prof"><h3>${t("profile")}</h3>
        <div class="row" style="align-items:center"><span id="s-av">${avatar(p.emoji, p.color, "lg", me.avatar)}</span>
          <div class="field" style="flex:1"><label for="s-name">${t("name")}</label><input class="input" id="s-name" maxlength="40" value="${esc(me.name)}"></div></div>
        <div class="row" id="s-photo">${photoBtns(me.avatar)}</div>
        <div class="field"><span class="lbl">Emoji</span><div class="emojis">${EMOJIS.map((e) => `<button type="button" class="emo" data-emo="${e}" aria-pressed="${e === p.emoji}">${e}</button>`).join("")}</div></div>
        <span class="lbl" style="font-size:13px;font-weight:600;color:var(--muted)">${t("colour")}</span>
        <div class="swatches" style="grid-template-columns:repeat(12,minmax(0,1fr))">${PROFILE_COLORS.map((c) => `<button type="button" class="sw" style="--c:${c}" data-col="${c}" aria-pressed="${c === p.color}" aria-label="${c}"></button>`).join("")}</div>
        <div class="field"><span class="lbl">${t("birthday")}</span><div class="bd-row">${bdSelects(me.birth_month || "", me.birth_day || "", "s")}</div></div>
        <p class="notice">${t("ob_bd_note")}</p>
        <div class="row"><button class="btn" id="s-save">${t("save")}</button></div>
      </div>
      <div class="sec"><div class="row">
        <div class="field"><label for="s-lang">${t("language")}</label><select class="input" id="s-lang">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === lang ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <div class="field"><span class="lbl">${t("appearance")}</span><div class="seg" role="group" id="s-theme">${["dark", "light", "auto"].map((k) => `<button type="button" data-theme-pick="${k}" aria-pressed="${(store.get("theme") || "dark") === k}">${t("theme_" + k)}</button>`).join("")}</div></div>
        <div class="field"><label for="s-tz">${t("timezone")}</label><select class="input" id="s-tz">${tzs.map((z) => `<option ${z === (me.timezone || tz()) ? "selected" : ""}>${esc(z)}</option>`).join("")}</select></div></div>
        ${state.cals.length > 1 ? `<div class="field"><label for="s-cal">${t("calendar")}</label><select class="input" id="s-cal">${state.cals.map((c) => `<option value="${c.id}" ${c.id === cal?.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>` : ""}
      </div>
      ${isAdmin() ? `
      <div class="sec" id="s-req"><h3>${t("requests")}</h3><div class="list" id="req-list"></div></div>
      <div class="sec"><h3>${t("admins")}</h3><div class="list" id="adm-list"></div></div>
      <div class="sec" id="s-google"><h3>${t("google")}</h3><div id="g-box"></div></div>
      <div class="sec"><h3>${t("storage")}</h3><div id="st-box">${sk("", "height:46px")}</div></div>
      <div class="sec"><h3>${t("backup")}</h3><div class="sub" id="bk-info">${t("no_backup")}</div>
        <div class="lbl" style="margin-top:6px">${t("now_data")}</div>
        <div class="row"><button class="btn sm" data-dl="csv">${t("dl_csv")}</button><button class="btn ghost sm" data-dl="json">${t("dl_json")}</button></div>
        <div id="bk-saved"></div></div>
      <div class="sec"><h3>${t("templates")}</h3>
        <div class="tpl-row">${(state.config.templates || []).map((x) => `<input class="input" data-tn="${x.id}" maxlength="20" value="${esc(x.name)}" aria-label="${esc(x.name)}">`).join("")}</div>
        <div class="row"><button class="btn sm" id="tpl-rename">${t("save")}</button></div></div>
      <div class="sec"><h3>${t("invites")}</h3>
        <div class="row"><button class="btn sm" data-inv="editor">${t("make_edit_link")}</button><button class="btn ghost sm" data-inv="viewer">${t("make_view_link")}</button></div>
        <div id="inv-out" class="list"></div>
        <div class="row"><button class="btn danger sm" id="inv-revoke">${t("revoke_all")}</button></div></div>`
      : `<div class="sec"><div id="apply-box"></div></div>`}
      <div class="sec"><div class="row"><button class="btn ghost" id="s-logout">${t("logout")}</button></div></div>
    </div></div>`;
  showDlg("#sheet", html, (d) => {
    d.addEventListener("click", (e) => {
      const x = e.target.closest("[data-emo],[data-col]"); if (!x || !d.querySelector("#s-prof").contains(x)) return;
      if (x.dataset.emo) p.emoji = x.dataset.emo; else p.color = x.dataset.col;
      $$("[data-emo]", d).forEach((b) => b.setAttribute("aria-pressed", b.dataset.emo === p.emoji));
      $$("[data-col]", d).forEach((b) => b.setAttribute("aria-pressed", b.dataset.col === p.color));
      $("#s-av", d).innerHTML = avatar(p.emoji, p.color, "lg", state.me.avatar);
      // emoji 和颜色：一按就保存
      api("/api/auth/me", { method: "PATCH", body: { emoji: p.emoji, color: p.color } }).then((u) => {
        state.me = { ...state.me, ...u }; chime("ok"); toast(t("saved"));
        $(".me-chip").innerHTML = `${avatar(state.me.emoji, state.me.color, "sm", state.me.avatar)}<span>${esc(state.me.name)}</span>`;
        if (state.page === "people" || state.page === "activity") renderPage();
      }).catch(fail);
    });
    // 头像照片：上传 / 换 / 移除（马上保存）
    $("#s-photo", d).addEventListener("click", async (e) => {
      const b = e.target.closest("[data-sphoto]"); if (!b) return;
      try {
        if (b.dataset.sphoto === "up") {
          const data = await pickAvatarPhoto(); if (!data) return;
          state.me = { ...state.me, ...(await api("/api/auth/me/avatar", { method: "PUT", body: { data } })) };
        } else {
          if (!(await confirmBox({ title: t("cf_rm_photo"), text: t("cf_rm_photo_t"), ok: t("remove_photo") }))) return;
          state.me = { ...state.me, ...(await api("/api/auth/me/avatar", { method: "DELETE" })) };
        }
        chime("ok"); toast(t("saved"));
        $("#s-av", d).innerHTML = avatar(p.emoji, p.color, "lg", state.me.avatar);
        $("#s-photo", d).innerHTML = photoBtns(state.me.avatar);
        $(".me-chip").innerHTML = `${avatar(state.me.emoji, state.me.color, "sm", state.me.avatar)}<span>${esc(state.me.name)}</span>`;
        if (state.page === "people") renderPage();
      } catch (er) { fail(er); }
    });
    $("#s-bm", d).onchange = () => { const v = $("#s-bd", d).value; $("#s-bm", d).parentElement.innerHTML = bdSelects($("#s-bm", d).value, v, "s"); rewireBd(d); };
    const rewireBd = (dd) => { $("#s-bm", dd).onchange = () => { const v = $("#s-bd", dd).value; $("#s-bm", dd).parentElement.innerHTML = bdSelects($("#s-bm", dd).value, v, "s"); rewireBd(dd); }; };
    $("#s-save", d).onclick = async () => {
      const bm = $("#s-bm", d).value, bd = $("#s-bd", d).value;
      if (!!bm !== !!bd) return toast(t("ob_bd"), true);
      try {
        state.me = { ...state.me, ...(await api("/api/auth/me", { method: "PATCH", body: { name: $("#s-name", d).value, emoji: p.emoji, color: p.color, birth_month: bm ? Number(bm) : null, birth_day: bd ? Number(bd) : null } })) };
        toast(t("saved")); chime("ok"); $(".me-chip").innerHTML = `${avatar(state.me.emoji, state.me.color, "sm", state.me.avatar)}<span>${esc(state.me.name)}</span>`;
        refreshCalendar();
      } catch (e) { fail(e); }
    };
    $("#s-theme", d)?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-theme-pick]"); if (!b) return;
      store.set("theme", b.dataset.themePick); window.applyTheme?.();
      d.querySelectorAll("[data-theme-pick]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      // 已经打开的 Dashboard 也跟着换
      document.querySelectorAll("iframe").forEach((f) => { try { f.contentWindow.applyTheme?.(); } catch {} });
      chime("ok");
    });
    $("#s-lang", d).onchange = async (e) => {
      lang = e.target.value; store.set("lang", lang);
      try { await api("/api/auth/me", { method: "PATCH", body: { lang } }); } catch {}
      d.close(); renderApp(); openSettings();
    };
    $("#s-tz", d).onchange = async (e) => {
      try { state.me = { ...state.me, ...(await api("/api/auth/me", { method: "PATCH", body: { timezone: e.target.value } })) }; toast(t("saved")); refreshCalendar(); } catch (er) { fail(er); }
    };
    $("#s-cal", d)?.addEventListener("change", async (e) => { store.set("cal", e.target.value); d.close(); await loadConfig(); state.cursor = null; renderApp(); });
    $("#s-logout", d).onclick = async () => { if (!(await confirmBox({ title: t("cf_logout"), text: oqCount ? t("cf_logout_pending", { n: oqCount }) : t("cf_logout_t"), ok: t("logout"), danger: !!oqCount }))) return; await clearDataCache(); store.set("token", null); store.set("cal", null); d.close(); Object.assign(ob, { step: 0, emoji: null }); boot(); };
    if (isAdmin()) wireAdmin(d); else drawApply(d);
  });
}
async function drawApply(d) {
  const box = $("#apply-box", d);
  if (!box.children.length) box.innerHTML = sk("", "width:180px;height:42px");
  try {
    const r = await api("/api/admin-request");
    const pendingReq = r.request?.status === "pending";
    box.innerHTML = pendingReq ? `<span class="tag">${t("applied")}</span>` : `<button class="btn ghost" id="apply">${t("apply_admin")}</button>`;
    $("#apply", box)?.addEventListener("click", async () => {
      try { await api("/api/admin-request", { method: "POST" }); chime("ok"); drawApply(d); } catch (e) { fail(e); }
    });
  } catch (e) { box.textContent = e.message; }
}
function wireAdmin(d) {
  drawRequests(d); drawAdmins(d); drawGoogle(d); drawStorage(d);
  api("/api/admin/backup/info").then((r) => {
    // 每周存下来的备份：每一份都可以下载（Excel / 完整）
    const box = $("#bk-saved", d);
    if (box && r.saved?.length) box.innerHTML = `<div class="lbl" style="margin-top:12px">${t("saved_backups")}</div><div class="list">${r.saved.map((x) => `<div class="row" style="justify-content:space-between;gap:8px"><span>${esc(x.stamp)}${x.events != null ? ` · ${x.events}` : ""}</span><span class="row" style="gap:6px"><button class="btn sm" data-dl="csv" data-bk="${x.id}">Excel</button><button class="btn ghost sm" data-dl="json" data-bk="${x.id}">JSON</button></span></div>`).join("")}</div>`;
    box?.querySelectorAll("[data-dl]").forEach(wireDl);
    if (r.lastBackup) $("#bk-info", d).textContent = t("last_backup", { d: new Date(r.lastBackup).toLocaleString(loc(), { timeZone: tz(), dateStyle: "medium", timeStyle: "short" }) }); }).catch(() => {});
  const wireDl = (b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/api/admin/backup${b.dataset.bk ? `/saved/${b.dataset.bk}` : ""}${b.dataset.dl === "csv" ? "?format=csv" : ""}`, { headers: { Authorization: `Bearer ${token()}`, "x-cal": store.get("cal") || "", "x-lang": lang } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      const name = (res.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || `the-legend-backup.${b.dataset.dl}`;
      const a = document.createElement("a"); a.href = URL.createObjectURL(await res.blob()); a.download = name; document.body.append(a); a.click(); a.remove();
      chime("ok");
    } catch (e) { fail(e); }
    b.disabled = false;
  });
  d.querySelectorAll("[data-dl]").forEach(wireDl);
  $("#tpl-rename", d).onclick = async () => {
    try {
      const r = await api("/api/event-templates", { method: "PUT", body: { templates: $$("[data-tn]", d).map((i) => ({ id: i.dataset.tn, name: i.value })) } });
      state.config.templates = r.templates; toast(t("saved")); chime("ok");
    } catch (e) { fail(e); }
  };
  d.querySelectorAll("[data-inv]").forEach((b) => b.addEventListener("click", async () => {
    try {
      const r = await api(`/api/calendars/${store.get("cal")}/invite`, { method: "POST", body: { role: b.dataset.inv } });
      const until = new Date(r.expires_at).toLocaleString(loc(), { timeZone: tz(), month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      const url = new URL(r.url, location.href).href;
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `<div class="grow"><b>${r.role === "viewer" ? t("viewer") : t("editor")}</b><div class="sub">${t("valid_until", { d: until })}</div>
        <div class="link-box" style="margin-top:8px"><input class="input" readonly value="${esc(url)}"><button class="btn sm" data-copy>${t("copy")}</button></div></div>`;
      $("#inv-out", d).prepend(row);
      $("[data-copy]", row).onclick = async () => { try { await navigator.clipboard.writeText(url); toast(t("copied")); } catch { $("input", row).select(); } };
    } catch (e) { fail(e); }
  }));
  $("#inv-revoke", d).onclick = async (e) => {
    if (!(await confirmBox({ title: t("cf_invite"), text: t("cf_invite_t"), ok: t("cf_invite_ok") }))) return;
    try { await api(`/api/calendars/${store.get("cal")}/invite`, { method: "DELETE" }); $("#inv-out", d).innerHTML = ""; toast(t("saved")); } catch (er) { fail(er); }
  };
}
async function drawStorage(d) {
  const box = $("#st-box", d);
  try {
    const s = await api("/api/admin/storage"), pct = Math.min(100, Math.round((s.bytes / s.limit) * 100));
    const fmt = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(2) + " GB" : Math.round(b / 1048576) + " MB");
    box.innerHTML = `<div class="meter ${pct >= 95 ? "bad" : pct >= 80 ? "warn" : ""}"><i style="width:${pct}%"></i></div>
      <div class="row" style="justify-content:space-between"><span class="sub"><b>${pct}%</b> · ${fmt(s.bytes)} / ${fmt(s.limit)}</span><span class="sub">${t("photos_n", { n: s.count })}</span></div>`;
  } catch (e) { box.textContent = e.message; }
}
async function drawRequests(d) {
  const box = $("#req-list", d);
  if (!box.children.length) box.innerHTML = skRows(1, 58);
  try {
    const list = await api("/api/admin/requests");
    box.innerHTML = list.length ? list.map((r) => `<div class="item">${avatar(r.emoji, r.color, "sm", r.avatar)}<div class="grow"><b>${esc(r.name)}</b><div class="sub raw">${esc(r.email)}</div></div>
      ${isTop() ? `<button class="btn sm" data-ok="${r.id}">${t("approve")}</button><button class="btn danger sm" data-no="${r.id}">${t("reject")}</button>` : ""}</div>`).join("") : `<p class="empty">${t("no_requests")}</p>`;
    box.onclick = async (e) => {
      const b = e.target.closest("[data-ok],[data-no]"); if (!b) return;
      if (await decide(Number(b.dataset.ok || b.dataset.no), !!b.dataset.ok)) { clearPops(); drawRequests(d); drawAdmins(d); }
    };
  } catch (e) { box.textContent = e.message; }
}
async function drawAdmins(d) {
  const box = $("#adm-list", d);
  if (!box.children.length) box.innerHTML = skRows(2, 58);
  try {
    const list = await api("/api/admin/list");
    box.innerHTML = list.map((a) => `<div class="item">${avatar(a.emoji, a.color, "sm", a.avatar)}<div class="grow"><b>${esc(a.name)}</b> ${a.top ? `<span class="tag ok">${t("top_admin")}</span>` : ""}<div class="sub raw">${esc(a.email)}</div></div>
      <button class="btn ghost sm" data-top="${a.id}" data-v="${a.top ? "" : "1"}">${a.top ? t("unmake_top") : t("make_top")}</button>
      ${a.fixed ? `<span class="tag">${t("fixed")}</span>` : `<button class="btn danger sm" data-unadmin="${a.id}">${t("remove")}</button>`}</div>`).join("");
    box.onclick = async (e) => {
      const tb = e.target.closest("[data-top]");
      if (tb) {
        try {
          await api(`/api/admin/list/${tb.dataset.top}/top`, { method: "PUT", body: { top: !!tb.dataset.v } });
          state.me = { ...state.me, ...(await api("/api/auth/me")) }; chime("ok"); drawAdmins(d); drawRequests(d);
        } catch (er) { fail(er); }
        return;
      }
      const b = e.target.closest("[data-unadmin]"); if (!b) return;
      const who = b.closest(".row,div")?.querySelector("b")?.textContent || "";
      if (!(await confirmBox({ title: t("cf_admin", { n: who }), text: t("cf_admin_t"), ok: t("remove") }))) return;
      try { await api(`/api/admin/list/${b.dataset.unadmin}`, { method: "DELETE" }); drawAdmins(d); } catch (er) { fail(er); }
    };
  } catch (e) { box.textContent = e.message; }
}
async function drawGoogle(d) {
  const box = $("#g-box", d);
  if (!box.children.length) box.innerHTML = skRows(3, 50);
  const me = await api("/api/auth/me").catch(() => state.me);
  if (!me.google) {
    box.innerHTML = `<div class="row"><div class="field"><label for="g-mail">${t("gmail_for_sync")}</label><input class="input" id="g-mail" type="email" value="${esc(me.email)}"></div>
      <button class="btn" id="g-connect">${t("connect")}</button></div>`;
    $("#g-connect", box).onclick = async () => {
      try { const r = await api("/api/google/connect", { method: "POST", body: { gmail: $("#g-mail", box).value.trim() } }); location.href = r.url; } catch (e) { fail(e); }
    };
    return;
  }
  box.innerHTML = `<div class="sub">${t("connected_as", { g: me.google.gmail })}</div><div class="list" id="g-cals"></div>
    <div class="row"><button class="btn sm" id="g-sync">${t("sync_now")}</button><button class="btn danger sm" id="g-off">${t("disconnect")}</button></div>`;
  try {
    const cals = await api("/api/google/calendars");
    $("#g-cals", box).innerHTML = cals.map((c) => `<label class="item check"><input type="checkbox" data-gcal="${esc(c.id)}" ${c.enabled ? "checked" : ""} ${c.primary ? "disabled" : ""}><span class="grow">${esc(c.name)}</span></label>`).join("");
    $("#g-cals", box).onchange = async (e) => {
      const x = e.target.closest("[data-gcal]"); if (!x) return;
      try { await api(`/api/google/calendars/${encodeURIComponent(x.dataset.gcal)}`, { method: "PUT", body: { enabled: x.checked } }); toast(t("saved")); if (x.checked) syncNow(box); } catch (er) { fail(er); x.checked = !x.checked; }
    };
  } catch (e) { $("#g-cals", box).textContent = e.message; }
  $("#g-sync", box).onclick = () => syncNow(box);
  $("#g-off", box).onclick = async () => {
    if (!(await confirmBox({ title: t("cf_google"), text: t("cf_google_t"), ok: t("cf_google_ok") }))) return;
    try { await api("/api/google/disconnect", { method: "POST", body: {} }); drawGoogle(d); } catch (er) { fail(er); }
  };
}
async function syncNow(box) {
  const b = $("#g-sync", box); if (b) { b.disabled = true; b.textContent = t("syncing"); }
  try {
    for (let i = 0; i < 20; i++) { const r = await api("/api/google/pull", { method: "POST", body: { force: true } }); if (r.done !== false) break; }
    toast(t("synced")); chime("ok"); refreshCalendar();
  } catch (e) { fail(e); }
  if (b) { b.disabled = false; b.textContent = t("sync_now"); }
}

// ================= 通知（弹出 + 声音） =================
function setActUnread(n) {
  state.actUnread = n;
  const c = $("#act-count"); if (c) { c.hidden = !n; c.textContent = n > 99 ? "99+" : n; }
}
async function pollNotes() {
  api("/api/activity/unread").then((r) => setActUnread(state.page === "activity" ? 0 : r.unread)).catch(() => {});
  try {
    const r = await api("/api/notifications");
    state.notes.items = r.items; state.notes.unread = r.unread;
    const dot = $("#bell-dot"); if (dot) { dot.hidden = !r.unread; dot.textContent = r.unread; }
    const fresh = r.items.filter((n) => !n.read_at && n.id > state.notes.seen);
    if (fresh.length) {
      state.notes.seen = Math.max(...fresh.map((n) => n.id)); store.set("notes-seen", String(state.notes.seen));
      fresh.slice(0, 3).reverse().forEach(popNote);
      chime(fresh.some((n) => n.kind === "sync_error" || n.kind === "storage") ? "bad" : "note");
    }
  } catch {}
}
const NOTE_ICON = { sync_error: "⚠️", admin_request: "🙋", storage: "📦", backup: "💾" };
function popNote(n) {
  const el = document.createElement("div");
  const rid = reqIdOf(n);
  el.className = "pop" + (n.kind === "sync_error" || n.kind === "storage" ? " bad" : "");
  // 管理员申请：只有「批准」和「拒绝」，按了才会消失
  const acts = rid ? `<button class="btn sm" data-ok>${t("approve")}</button><button class="btn danger sm" data-no>${t("reject")}</button>`
    : `<button class="btn sm" data-open>${t("view")}</button><button class="btn ghost sm" data-x>${t("close")}</button>`;
  el.innerHTML = `<span style="font-size:22px">${NOTE_ICON[n.kind] || "🔔"}</span><div class="grow"><b>${n.kind === "sync_error" ? t("google") : n.kind === "storage" ? t("storage") : n.kind === "backup" ? t("backup") : t("requests")}</b>${esc(n.body)}
    <div class="pop-acts">${acts}</div></div>`;
  el.onclick = async (e) => {
    const ok = e.target.closest("[data-ok]"), no = e.target.closest("[data-no]");
    if ((ok || no) && (await decide(rid, !!ok))) el.remove();
    if (e.target.closest("[data-open]")) { el.remove(); openSettings(); }
    if (e.target.closest("[data-x]")) el.remove();
  };
  $("#pops").append(el);
  if (!rid) setTimeout(() => el.remove(), 15000);
}
function openBell() {
  const items = state.notes.items;
  showDlg("#dlg", `<div class="dlg"><div class="dlg-head"><h2>${t("notifications")}</h2><button class="icon-btn" data-close aria-label="${t("close")}">${ICON.x}</button></div>
    <div class="dlg-body"><div class="bell-list">${items.length ? items.map((n) => `<div class="bell-item ${n.read_at ? "" : "unread"}">${NOTE_ICON[n.kind] || "🔔"} ${esc(n.body)}<span class="act-when">${esc(ago(n.created_at))}</span>
      ${!n.read_at && reqIdOf(n) && isTop() ? `<div class="pop-acts"><button class="btn sm" data-ok="${reqIdOf(n)}">${t("approve")}</button><button class="btn danger sm" data-no="${reqIdOf(n)}">${t("reject")}</button></div>` : ""}</div>`).join("") : `<p class="empty">${t("no_notes")}</p>`}</div></div></div>`,
  (d) => { d.querySelector(".bell-list").onclick = async (e) => {
    const b = e.target.closest("[data-ok],[data-no]"); if (!b) return;
    if (await decide(Number(b.dataset.ok || b.dataset.no), !!b.dataset.ok)) { clearPops(); d.close(); }
  }; });
  // 管理员申请要按「批准 / 拒绝」才算处理；其他通知打开就算已读
  if (items[0] && state.notes.unread && !items.some((n) => !n.read_at && reqIdOf(n))) api("/api/notifications/read", { method: "POST", body: { upTo: items[0].id } }).then(pollNotes).catch(() => {});
}

// ================= 背景工作：Google 读回、通知 =================
let loops = [];
function startLoops() {
  stopLoops();
  const pull = async () => {
    if (!state.me?.google) return;
    try { const r = await api("/api/google/pull", { method: "POST", body: {} }); if (r.created || r.updated || r.deleted) refreshCalendar(); } catch {}
  };
  pollNotes(); pull();
  loops.push(setInterval(pollNotes, 30000), setInterval(pull, 60000));
}
function stopLoops() { loops.forEach(clearInterval); loops = []; }
document.addEventListener("visibilitychange", () => { if (!document.hidden && state.me && loops.length) pollNotes(); });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
boot();
