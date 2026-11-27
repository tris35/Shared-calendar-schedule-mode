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
const DASH_START = "2026-10-01";

// ---------------- 语言 ----------------
const LANGS = { zh: "中文", en: "English" };
const T = {
  login: ["登录", "Log in"], signup: ["注册", "Sign up"], email: ["Gmail", "Gmail"], password: ["密码", "Password"],
  forgot: ["忘记密码？", "Forgot password?"], have_acct: ["已有帐号？登录", "Have an account? Log in"], no_acct: ["还没有帐号？注册", "No account? Sign up"],
  pw_rule: ["密码至少 6 个字，并包含 1 个特殊符号", "At least 6 characters with 1 symbol"], bad_email: ["请输入正确的 Gmail 地址", "Enter a valid Gmail address"],
  send_code: ["寄验证码", "Send code"], code: ["验证码", "Code"], new_pw: ["新密码", "New password"], reset: ["重设密码", "Reset password"], back: ["返回", "Back"],
  code_sent: ["验证码已寄出", "Code sent"],
  ob_look: ["选择你的 Emoji 和颜色", "Pick your emoji and colour"], ob_name: ["你的名字", "Your name"], ob_bd: ["你的生日", "Your birthday"],
  ob_bd_note: ["填写后，每年你的生日会自动加入日历，并同步到 Google 日历，日历里的人都看得到。可以不填。", "If you fill this in, your birthday is added to the calendar every year and synced to Google Calendar, where everyone in the calendar can see it. Optional."],
  ob_cal: ["建立或加入日历", "Create or join a calendar"], create: ["建立", "Create"], join: ["加入", "Join"], cal_name: ["日历名称", "Calendar name"],
  invite_link: ["邀请连结", "Invite link"], next: ["下一步", "Next"], skip: ["跳过", "Skip"], done: ["完成", "Done"], welcome: ["欢迎，{name}", "Welcome, {name}"],
  month: ["月", "Month"], day: ["日", "Day"],
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
  approved: ["已批准", "Approved"], rejected: ["已拒绝", "Rejected"], fixed: ["固定", "Fixed"], connected_as: ["已连接：{g}", "Connected: {g}"],
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
async function api(path, opts = {}) {
  const headers = { "x-lang": lang, ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...(store.get("cal") ? { "x-cal": store.get("cal") } : {}) };
  let body = opts.body;
  if (body && !(body instanceof FormData)) { headers["Content-Type"] = "application/json"; body = JSON.stringify(body); }
  const res = await fetch(API_BASE + path, { method: opts.method || "GET", headers, body });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !/^\/api\/auth\/(login|signup|reset|forgot)/.test(path)) { store.set("token", null); boot(); throw new Error(data.error || "401"); }
  if (!res.ok) { const e = new Error(data.error || `Error ${res.status}`); e.status = res.status; throw e; }
  return data;
}
const photoUrl = (id) => `${API_BASE}/api/photos/${id}/file?t=${encodeURIComponent(token())}`;

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
  }).join("") + `<div class="sb-card">${avatar(state.me?.emoji, state.me?.color, "lg")}<b>EVENT SAVED</b><span>🎉</span></div>`;
  document.body.append(w);
  setTimeout(() => w.remove(), 1700);
}
function toast(msg, bad = false) {
  const el = document.createElement("div");
  el.className = "toast" + (bad ? " bad" : ""); el.textContent = msg;
  $("#toasts").append(el); setTimeout(() => el.remove(), bad ? 4200 : 2200);
}
const fail = (e) => { toast(e.message || String(e), true); chime("bad"); };

// ---------------- 图示 ----------------
const ICON = {
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
};
const EMOJIS = ["🐱", "🐶", "🐼", "🐨", "🐰", "🦊", "🐻", "🐷", "🐸", "🐵", "🐥", "🐧", "🦄", "🦖", "🐙", "🐳", "🦋", "🐝", "🌸", "🌈", "⭐", "🍓", "🍑", "🍩", "🧁", "🎀", "🎈", "👻", "😎", "🥳", "🤠", "🤓", "🤖", "👑", "💖", "💍", "👰", "🤵", "📸", "🎬"];
const PROFILE_COLORS = ["#2563eb", "#0ea5e9", "#14b8a6", "#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#6366f1", "#64748b"];

// ---------------- 状态 ----------------
const state = {
  me: null, config: null, cals: [], page: "calendar", cursor: null, sel: null, events: [], untagged: [],
  notes: { items: [], unread: 0, seen: Number(store.get("notes-seen") || 0) },
};
const isAdmin = () => !!state.me?.admin;
const isTop = () => !!state.me?.top;
const reqIdOf = (n) => (n.kind === "admin_request" && /^admin_request:(\d+)$/.test(n.ref || "") ? Number(n.ref.split(":")[1]) : null);
async function decide(id, approve) {
  try { await api(`/api/admin/requests/${id}`, { method: "POST", body: { approve } }); toast(t(approve ? "approved" : "rejected")); chime("ok"); pollNotes(); return true; }
  catch (e) { fail(e); return false; }
}
const clearPops = () => $$(".pop").forEach((x) => x.remove());
const canEdit = () => state.config?.calendarRole !== "viewer";
const labelHex = (color) => state.config?.labels?.[color]?.hex || "#3b82f6";
const labelOf = (e) => (state.config?.labelList || []).find((l) => l.id === e.label_id);
const evColor = (e) => (e.label && state.config?.labels?.[e.label] ? labelHex(e.label) : e.color || "#3b82f6");
const tplOf = (id) => (state.config?.templates || []).find((x) => x.id === id);
const avatar = (emoji, color, cls = "") => `<span class="avatar ${cls}" style="--c:${esc(color || "#2563eb")}">${esc(emoji || "🙂")}</span>`;
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
function renderAuth(mode, msg = "") {
  stopLoops();
  const email = store.get("last-email") || "";
  const card = {
    login: `<div class="field"><label for="a-email">${t("email")}</label><input class="input" id="a-email" type="email" autocomplete="email" value="${esc(email)}"></div>
      <div class="field"><label for="a-pw">${t("password")}</label><input class="input" id="a-pw" type="password" autocomplete="current-password"></div>
      <p class="err" id="a-err">${esc(msg)}</p>
      <button class="btn" data-a="login">${t("login")}</button>
      <button class="linkish" data-mode="forgot">${t("forgot")}</button>
      <button class="linkish" data-mode="signup">${t("no_acct")}</button>`,
    signup: `<div class="field"><label for="a-email">${t("email")}</label><input class="input" id="a-email" type="email" autocomplete="email" value="${esc(email)}"></div>
      <div class="field"><label for="a-pw">${t("password")}</label><input class="input" id="a-pw" type="password" autocomplete="new-password" placeholder="${t("pw_rule")}"></div>
      <p class="err" id="a-err">${esc(msg)}</p>
      <button class="btn" data-a="signup">${t("signup")}</button>
      <button class="linkish" data-mode="login">${t("have_acct")}</button>`,
    forgot: `<div class="field"><label for="a-email">${t("email")}</label><input class="input" id="a-email" type="email" autocomplete="email" value="${esc(email)}"></div>
      <p class="err" id="a-err">${esc(msg)}</p>
      <button class="btn" data-a="forgot">${t("send_code")}</button>
      <button class="linkish" data-mode="login">${t("back")}</button>`,
    reset: `<div class="field"><label for="a-code">${t("code")}</label><input class="input" id="a-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
      <div class="field"><label for="a-pw">${t("new_pw")}</label><input class="input" id="a-pw" type="password" autocomplete="new-password" placeholder="${t("pw_rule")}"></div>
      <p class="err" id="a-err">${esc(msg)}</p>
      <button class="btn" data-a="reset">${t("reset")}</button>
      <button class="linkish" data-mode="login">${t("back")}</button>`,
  }[mode];
  $("#root").innerHTML = `<div class="gate"><form class="gate-card" id="auth" novalidate>
    <div class="gate-logo"><div class="logo-mark">L</div><h1>THE LEGEND</h1></div>
    <div class="seg" role="group" style="align-self:center">${Object.entries(LANGS).map(([k, v]) => `<button type="button" data-lang="${k}" aria-pressed="${k === lang}">${v}</button>`).join("")}</div>
    ${card}</form></div>`;
  const f = $("#auth");
  f.addEventListener("click", (e) => {
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
    boot();
  } catch (e) { err(e.message); } finally { btn.disabled = false; }
}

// ================= 第一次登录的步骤 =================
const ob = { step: 0, emoji: null, color: null, name: "", bm: "", bd: "", calMode: "create", calName: "", link: "" };
function renderOnboarding() {
  stopLoops();
  if (ob.step === 0 && !ob.emoji) {
    Object.assign(ob, { emoji: state.me.emoji || EMOJIS[Math.floor(Math.random() * 20)], color: state.me.color || PROFILE_COLORS[0], name: state.me.name || "" });
    const j = store.get("join"); if (j) { ob.calMode = "join"; ob.link = j; }
    if (state.cals.length) ob.calMode = "have";
  }
  const steps = [0, 1, 2, 3].map((i) => `<i class="${i <= ob.step ? "on" : ""}"></i>`).join("");
  const body = [
    () => `<h2 style="margin:0;text-align:center">${t("ob_look")}</h2>
      <div class="preview">${avatar(ob.emoji, ob.color, "lg")}</div>
      <div class="emojis">${EMOJIS.map((e) => `<button type="button" class="emo" data-emo="${e}" aria-pressed="${e === ob.emoji}">${e}</button>`).join("")}</div>
      <div class="swatches" style="grid-template-columns:repeat(6,1fr)">${PROFILE_COLORS.map((c) => `<button type="button" class="sw" style="--c:${c}" data-col="${c}" aria-pressed="${c === ob.color}" aria-label="${c}"></button>`).join("")}</div>`,
    () => `<h2 style="margin:0;text-align:center">${t("ob_name")}</h2><div class="preview">${avatar(ob.emoji, ob.color, "lg")}</div>
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
    const x = e.target.closest("[data-emo],[data-col],[data-cm],[data-ob]"); if (!x) return;
    readOb();
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
    welcome();
  } catch (e) { err(e.message); btn.disabled = false; }
}
function welcome() {
  const w = document.createElement("div");
  w.className = "welcome";
  const sparks = Array.from({ length: 26 }, (_, i) => {
    const a = (i / 26) * Math.PI * 2, r = 140 + Math.random() * 160;
    return `<i class="spark" style="--x:${Math.cos(a) * r}px;--y:${Math.sin(a) * r}px;background:${PROFILE_COLORS[i % PROFILE_COLORS.length]};animation-delay:${0.15 + Math.random() * 0.25}s"></i>`;
  }).join("");
  w.innerHTML = `${sparks}<div class="big">${avatar(ob.emoji, ob.color)}<h2>${t("welcome", { name: ob.name })}</h2></div>`;
  document.body.append(w);
  chime("note");
  setTimeout(() => boot(), 900);
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
  const btn = (x) => `<button class="nav-btn" data-nav="${x.id}" ${x.id === state.page ? 'aria-current="page"' : ""}>${ICON[x.icon]}<span class="t">${t("nav_" + x.id)}</span>${x.id === "calendar" ? '<span class="count" id="untag-count" hidden></span>' : ""}</button>`;
  $("#root").innerHTML = `<div class="app">
    <aside class="side">
      <div class="logo"><div class="logo-mark">L</div><div><div class="logo-name">THE LEGEND</div><div class="logo-cal">${esc(cal?.name || "")}</div></div></div>
      <nav class="nav-group" aria-label="${t("analysis")}"><div class="nav-label">${t("analysis")}</div>${items.filter((x) => x.group === "analysis").map(btn).join("")}</nav>
      <nav class="nav-group" aria-label="${t("settings")}"><div class="nav-label">${t("settings")}</div>${items.filter((x) => x.group === "settings").map(btn).join("")}</nav>
      <div class="side-foot"><button class="gear" id="gear" aria-label="${t("settings")}" title="${t("settings")}">${ICON.gear}</button>
        <div class="me-chip">${avatar(state.me.emoji, state.me.color, "sm")}<span>${esc(state.me.name)}</span></div></div>
    </aside>
    <div class="main" id="main"></div></div>`;
  $(".side").addEventListener("click", (e) => { const b = e.target.closest("[data-nav]"); if (b) go(b.dataset.nav); });
  $("#gear").addEventListener("click", () => { chime("gear"); openSettings(); });
  renderPage();
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
    main.innerHTML = `<section class="frame-page"><iframe title="${t("nav_" + p)}" src="dashboard.html?embed=1&page=${p}"></iframe></section>`;
    return;
  }
  if (p === "calendar") return renderCalendar();
  if (p === "people") return renderPeople();
  if (p === "activity") return renderActivity();
}
document.addEventListener("click", (e) => { if (e.target.closest("#bell")) openBell(); });

// ================= Calendar =================
async function renderCalendar() {
  state.cursor ||= ymdIn(Date.now()).slice(0, 7);
  state.sel ||= ymdIn(Date.now());
  const [y, m] = state.cursor.split("-").map(Number);
  const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(loc(), { year: "numeric", month: "long", timeZone: "UTC" });
  $("#main").innerHTML = topBar(t("nav_calendar"), canEdit() ? `<button class="btn" id="new-ev">${ICON.plus}${t("new_event")}</button>` : "") + `
    <section class="page wide">
      <button class="warn-bar" id="untag-bar" hidden></button>
      <div class="cal-head">
        <button class="icon-btn" id="prev" aria-label="‹">${ICON.left}</button>
        <div class="cal-month">${esc(monthName)}</div>
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
  $("#untag-bar").onclick = openUntagged;
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
  try {
    state.events = await api(`/api/events?from=${encodeURIComponent(wallToIso(days[0]))}&to=${encodeURIComponent(wallToIso(addDays(days[41], 1)))}`);
  } catch (e) { if (e.status === 409) return boot(); return fail(e); }
  drawGrid();
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
    const list = map.get(d) || [];
    const chips = list.slice(0, 4).map((e) => `<span class="chip ${untaggedEv(e) ? "untag" : ""}" style="--c:${esc(evColor(e))}"><b>${esc(e.title)}</b></span>`).join("");
    return `<button class="cal-cell ${d.slice(0, 7) !== state.cursor ? "out" : ""} ${d === today ? "today" : ""} ${d === state.sel ? "sel" : ""}" data-day="${d}" aria-label="${esc(fmtDay(d))}">
      <span class="cal-num">${Number(d.slice(8))}</span>${chips}${list.length > 4 ? `<span class="chip-more">+${list.length - 4}</span>` : ""}</button>`;
  }).join("");
  grid.onclick = (e) => {
    const c = e.target.closest("[data-day]"); if (!c) return;
    if (state.sel === c.dataset.day && canEdit() && e.detail === 2) return openForm(null, state.sel);
    state.sel = c.dataset.day; drawGrid();
  };
  grid.ondblclick = (e) => { const c = e.target.closest("[data-day]"); if (c && canEdit()) openForm(null, c.dataset.day); };
  drawDay(map);
}
function evRow(e, withDate = false) {
  const tpl = tplOf(e.template_id), lab = labelOf(e);
  const when = e.all_day ? t("all_day") : fmtTime(e.start);
  const who = e.creator_name ? `${e.creator_emoji || ""} ${e.creator_name}` : "";
  return `<button class="ev-row" data-ev="${e.id}" style="--c:${esc(evColor(e))}">
    <span class="ev-time">${withDate ? esc(fmtDay(ymdIn(e.start))) + "<br>" : ""}${esc(when)}</span>
    <span style="min-width:0"><div class="ev-title">${esc(e.title)}</div><div class="ev-sub">${esc([lab?.name, who].filter(Boolean).join(" · "))}</div></span>
    ${untaggedEv(e) ? `<span class="tag bad">${t("untagged_title")}</span>` : tpl ? `<span class="tag">${esc(tpl.name)}</span>` : ""}</button>`;
}
function drawDay(map) {
  const list = (map || byDay()).get(state.sel) || [];
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
function openUntagged() {
  showDlg("#dlg", `<div class="dlg"><div class="dlg-head"><h2>${t("untagged", { n: state.untagged.length })}</h2><button class="icon-btn" data-close aria-label="${t("close")}">${ICON.x}</button></div>
    <div class="dlg-body"><div class="day-list">${state.untagged.map((e) => evRow(e, true)).join("") || `<p class="empty">${t("no_events")}</p>`}</div></div></div>`,
  (d) => { d.querySelector(".day-list").onclick = (e) => { const r = e.target.closest("[data-ev]"); if (r) openDetail(Number(r.dataset.ev)); }; });
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
function openForm(ev, day) {
  form = ev ? {
    id: ev.id, title: ev.title, all_day: !!ev.all_day, date: ymdIn(ev.start), st: ev.all_day ? "10:00" : hmIn(ev.start), et: ev.end && !ev.all_day ? hmIn(ev.end) : "",
    template_id: ev.template_id || "", brand: ev.brand || "", soft: ev.soft || "", sales_type: ev.sales_type || "", label_id: ev.label_id || "", notes: ev.notes || "",
  } : { id: null, title: "", all_day: true, date: day || ymdIn(Date.now()), st: "10:00", et: "11:00", template_id: "", brand: "", soft: "", sales_type: "", label_id: "", notes: "" };
  drawForm();
}
function tickHtml(f) {
  const tpl = tplOf(f.template_id);
  if (!tpl || tpl.kind === "normal") return "";
  const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-tick="${key}" data-v="${v}" aria-pressed="${f[key] === v}">${esc(l)}</button>`).join("")}</div>`;
  return `<div class="ticks">${seg("brand", [["Legends", "Legends"], ["WM", "WM"]])}
    ${tpl.kind === "photo" ? seg("soft", [["non_all_soft", "Non-All Soft"], ["all_soft", "All Soft"]]) : seg("sales_type", [["visit", t("visit")], ["vc", t("vc")]])}</div>`;
}
function tplPicker(f) {
  return `<div class="tpl-row">${(state.config.templates || []).map((x) => `<button type="button" class="tpl-btn" data-tpl="${x.id}" aria-pressed="${f.template_id === x.id}">${esc(x.name)}</button>`).join("")}</div>${tickHtml(f)}`;
}
function drawForm() {
  const f = form;
  const labels = (state.config.labelList || []).map((l) => `<button type="button" class="lab" data-lab="${esc(l.id)}" style="--c:${esc(labelHex(l.color))}" aria-pressed="${f.label_id === l.id}"><i></i>${esc(l.name)}</button>`).join("");
  showDlg("#dlg", `<form class="dlg" id="ev-form" novalidate>
    <div class="dlg-head"><h2>${f.id ? t("edit_event") : t("new_event")}</h2><button type="button" class="icon-btn" data-close aria-label="${t("close")}">${ICON.x}</button></div>
    <div class="dlg-body">
      <div class="field"><label for="f-title">${t("title")}</label><input class="input" id="f-title" maxlength="300" value="${esc(f.title)}"></div>
      <label class="check"><input type="checkbox" id="f-allday" ${f.all_day ? "checked" : ""}>${t("all_day")}</label>
      <div class="row"><div class="field"><label for="f-date">${t("date")}</label><input class="input" type="date" id="f-date" value="${f.date}"></div>
        ${f.all_day ? "" : `<div class="field"><label for="f-st">${t("start")}</label><input class="input" type="time" id="f-st" value="${f.st}"></div>
        <div class="field"><label for="f-et">${t("end")}</label><input class="input" type="time" id="f-et" value="${f.et}"></div>`}</div>
      <div class="field"><span class="lbl">${t("template")}</span><div id="tpl-box">${tplPicker(f)}</div></div>
      <div class="field"><span class="lbl">${t("label")}</span><div class="labels">${labels}<button type="button" class="lab add" id="add-lab" aria-label="${t("new_label")}" title="${t("new_label")}">+</button></div></div>
      <div class="field"><label for="f-notes">${t("notes")}</label><textarea class="input" id="f-notes" maxlength="5000">${esc(f.notes)}</textarea></div>
      <p class="err" id="f-err"></p>
    </div>
    <div class="dlg-foot"><button type="button" class="btn ghost" data-close>${t("cancel")}</button><button type="submit" class="btn">${t("save")}</button></div></form>`,
  (d) => {
    const fm = $("#ev-form", d);
    fm.addEventListener("click", (e) => {
      const x = e.target.closest("[data-tpl],[data-tick],[data-lab],#add-lab"); if (!x) return;
      readForm();
      if (x.id === "add-lab") return openLabelDlg((l) => { form.label_id = l.id; if (l.template_id) form.template_id = l.template_id; drawForm(); });
      if (x.dataset.tpl) f.template_id = x.dataset.tpl;
      if (x.dataset.tick) f[x.dataset.tick] = x.dataset.v;
      if (x.dataset.lab) {
        f.label_id = f.label_id === x.dataset.lab ? "" : x.dataset.lab;
        const l = (state.config.labelList || []).find((z) => z.id === f.label_id);
        if (l?.template_id) f.template_id = l.template_id;
      }
      drawForm();
    });
    $("#f-allday", d).onchange = () => { readForm(); drawForm(); };
    fm.addEventListener("submit", (e) => { e.preventDefault(); saveForm(); });
  });
  if (!f.title) setTimeout(() => $("#f-title")?.focus(), 30);
}
function readForm() {
  const f = form;
  f.title = $("#f-title").value; f.all_day = $("#f-allday").checked; f.date = $("#f-date").value || f.date;
  if ($("#f-st")) { f.st = $("#f-st").value || f.st; f.et = $("#f-et").value; }
  f.notes = $("#f-notes").value;
}
async function saveForm() {
  readForm();
  const f = form, err = (m) => { $("#f-err").textContent = m; chime("bad"); };
  if (!f.title.trim()) return err(t("need_title"));
  if (!f.template_id) return err(t("need_tpl"));
  const body = {
    title: f.title.trim(), all_day: f.all_day, notes: f.notes,
    start: wallToIso(f.date, f.all_day ? "00:00" : f.st),
    end: f.all_day ? null : f.et ? wallToIso(f.date, f.et) : null,
    template_id: f.template_id, brand: f.brand || null, soft: f.soft || null, sales_type: f.sales_type || null, label_id: f.label_id || null,
  };
  try {
    const saved = await api(f.id ? `/api/events/${f.id}` : "/api/events", { method: f.id ? "PATCH" : "POST", body });
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
      <div class="field"><span class="lbl">${t("colour")}</span><div class="swatches">${Object.keys(state.config.labels).map((c) => `<button type="button" class="sw" style="--c:${esc(labelHex(c))}" data-c="${c}" aria-pressed="${c === l.color}" aria-label="${esc(state.config.labels[c].name)}"></button>`).join("")}</div></div>
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
    let armed = false;
    $("#l-del", d)?.addEventListener("click", async (e) => {
      if (!armed) { armed = true; e.target.classList.add("armed"); e.target.textContent = t("confirm_delete"); return; }
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
  try { detail = await api(`/api/events/${id}`); } catch (e) { return fail(e); }
  pending = [];
  drawDetail();
}
function drawDetail() {
  const e = detail, tpl = tplOf(e.template_id), lab = labelOf(e);
  const when = e.all_day ? `${fmtDay(ymdIn(e.start), { year: "numeric", month: "long", day: "numeric", weekday: "short" })} · ${t("all_day")}`
    : `${fmtDay(ymdIn(e.start), { year: "numeric", month: "long", day: "numeric", weekday: "short" })} · ${fmtTime(e.start)}${e.end ? " – " + fmtTime(e.end) : ""}`;
  const tickTxt = tpl && tpl.kind !== "normal" ? [e.brand, tpl.kind === "photo" ? { non_all_soft: "Non-All Soft", all_soft: "All Soft" }[e.soft] : { visit: t("visit"), vc: t("vc") }[e.sales_type]].filter(Boolean).join(" · ") : "";
  const needTpl = untaggedEv(e) && canEdit();
  if (needTpl) form = { template_id: "", brand: "", soft: "", sales_type: "" };
  const posts = (e.feed || []).map((f) => {
    if (f.type === "log") return "";
    const head = `<div class="post-who"><b>${esc(f.author || "—")}</b> · ${esc(ago(f.created_at))}</div>`;
    const del = canEdit() ? `<button class="x" data-del-${f.type}="${f.id}" aria-label="${t("delete")}">✕</button>` : "<span></span>";
    if (f.type === "comment") return `<div class="post"><span></span><div>${head}<div class="post-body">${esc(f.body)}</div></div>${del}</div>`;
    return `<div class="post"><span></span><div>${head}${f.caption ? `<div class="post-body">${esc(f.caption)}</div>` : ""}<a href="${photoUrl(f.id)}" target="_blank" rel="noopener"><img src="${photoUrl(f.id)}" alt="" loading="lazy"></a></div>${del}</div>`;
  }).join("");
  showDlg("#dlg", `<div class="dlg">
    <div class="dlg-head"><h2>${esc(e.title)}</h2><button class="icon-btn" data-close aria-label="${t("close")}">${ICON.x}</button></div>
    <div class="dlg-body">
      <div class="meta">
        <span class="tag">${esc(when)}</span>
        ${lab ? `<span class="tag" style="--c:${esc(labelHex(lab.color))}"><i></i>${esc(lab.name)}</span>` : ""}
        ${tpl ? `<span class="tag ok">${esc(tpl.name)}${tickTxt ? " · " + esc(tickTxt) : ""}</span>` : e.birthday_user_id ? "" : `<span class="tag bad">${t("untagged_title")}</span>`}
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
    let armed = false;
    $("#d-del", d)?.addEventListener("click", async (ev) => {
      if (!armed) { armed = true; ev.target.classList.add("armed"); ev.target.textContent = t("confirm_delete"); chime("bad"); return; }
      try { await api(`/api/events/${e.id}`, { method: "DELETE" }); d.close(); toast(t("deleted")); refreshCalendar(); } catch (er) { fail(er); }
    });
    $("#fix-tpl", d)?.addEventListener("click", (ev) => {
      const x = ev.target.closest("[data-tpl],[data-tick]"); if (!x) return;
      if (x.dataset.tpl) form.template_id = x.dataset.tpl; else form[x.dataset.tick] = x.dataset.v;
      $("#tpl-box", d).innerHTML = tplPicker(form);
    });
    $("#tpl-save", d)?.addEventListener("click", async () => {
      if (!form.template_id) { $("#tpl-err").textContent = t("need_tpl"); return; }
      try {
        await api(`/api/events/${e.id}`, { method: "PATCH", body: { template_id: form.template_id, brand: form.brand || null, soft: form.soft || null, sales_type: form.sales_type || null } });
        chime("ok"); toast(t("saved"));
        refreshCalendar();
        // 还有其他未选模板的活动 → 回到清单，继续下一个
        await loadUntagged();
        if (state.untagged.length) openUntagged(); else openDetail(e.id);
      } catch (er) { $("#tpl-err").textContent = er.message; chime("bad"); }
    });
    d.querySelector(".feed").onclick = async (ev) => {
      const c = ev.target.closest("[data-del-comment]"), p = ev.target.closest("[data-del-photo]");
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
    const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b || file), "image/jpeg", 0.85));
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
  let people = [];
  try { people = await api("/api/people"); } catch (e) { return fail(e); }
  const bd = (p) => (p.birth_month ? new Date(Date.UTC(2024, p.birth_month - 1, p.birth_day)).toLocaleDateString(loc(), { month: "long", day: "numeric", timeZone: "UTC" }) : "");
  $("#people").innerHTML = people.map((p) => `<div class="person">${avatar(p.emoji, p.color)}
    <div class="grow"><div class="person-name">${esc(p.name)}</div><div class="person-sub">${[p.admin ? t("admin") : "", p.role === "viewer" ? t("viewer") : "", bd(p) ? "🎂 " + esc(bd(p)) : ""].filter(Boolean).join(" · ")}</div></div>
    ${isAdmin() && p.id !== state.me.id ? `<button class="btn danger sm" data-rm="${p.id}">${t("remove")}</button>` : ""}</div>`).join("");
  $("#people").onclick = async (e) => {
    const b = e.target.closest("[data-rm]"); if (!b) return;
    if (!b.classList.contains("armed")) { b.classList.add("armed"); b.textContent = t("confirm_remove"); chime("bad"); return; }
    try { await api(`/api/people/${b.dataset.rm}`, { method: "DELETE" }); toast(t("deleted")); renderPeople(); } catch (er) { fail(er); }
  };
}
function drawLabels() {
  const box = $("#lab-list"); if (!box) return;
  box.innerHTML = (state.config.labelList || []).map((l) => `<button class="lab" data-l="${esc(l.id)}" style="--c:${esc(labelHex(l.color))}" ${isAdmin() ? "" : "disabled"}><i></i>${esc(l.name)}${l.template_id ? ` <span class="tag" style="padding:1px 7px">${esc(tplOf(l.template_id)?.name || "")}</span>` : ""}</button>`).join("");
  box.onclick = (e) => {
    const b = e.target.closest("[data-l]"); if (!b || !isAdmin()) return;
    openLabelDlg(() => drawLabels(), state.config.labelList.find((x) => x.id === b.dataset.l));
  };
}

// ================= 最新动态 =================
async function renderActivity() {
  $("#main").innerHTML = topBar(t("nav_activity")) + `<section class="page"><div class="card"><div class="list" id="acts"></div><button class="btn ghost" id="act-more" hidden>${t("more")}</button></div></section>`;
  let items = [];
  const load = async (before) => {
    try {
      const more = await api(`/api/activity${before ? `?before=${before}` : ""}`);
      items = [...items, ...more];
      $("#acts").innerHTML = items.length ? items.map((a) => `<div class="item">${avatar(a.emoji, a.color, "sm")}
        <div class="grow act-text">${t("a_" + a.action, { who: a.name, t: a.title || "" })}</div><span class="act-when">${esc(ago(a.created_at))}</span></div>`).join("") : `<p class="empty">${t("no_activity")}</p>`;
      $("#act-more").hidden = more.length < 50;
      $("#acts").onclick = (e) => {};
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
        <div class="row" style="align-items:center"><span id="s-av">${avatar(p.emoji, p.color, "lg")}</span>
          <div class="field" style="flex:1"><label for="s-name">${t("name")}</label><input class="input" id="s-name" maxlength="40" value="${esc(me.name)}"></div></div>
        <details><summary class="linkish" style="display:inline">Emoji</summary><div class="emojis" style="margin-top:10px">${EMOJIS.map((e) => `<button type="button" class="emo" data-emo="${e}" aria-pressed="${e === p.emoji}">${e}</button>`).join("")}</div></details>
        <div class="swatches" style="grid-template-columns:repeat(12,minmax(0,1fr))">${PROFILE_COLORS.map((c) => `<button type="button" class="sw" style="--c:${c}" data-col="${c}" aria-pressed="${c === p.color}" aria-label="${c}"></button>`).join("")}</div>
        <div class="field"><span class="lbl">${t("birthday")}</span><div class="bd-row">${bdSelects(me.birth_month || "", me.birth_day || "", "s")}</div></div>
        <p class="notice">${t("ob_bd_note")}</p>
        <div class="row"><button class="btn" id="s-save">${t("save")}</button></div>
      </div>
      <div class="sec"><div class="row">
        <div class="field"><label for="s-lang">${t("language")}</label><select class="input" id="s-lang">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === lang ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <div class="field"><label for="s-tz">${t("timezone")}</label><select class="input" id="s-tz">${tzs.map((z) => `<option ${z === (me.timezone || tz()) ? "selected" : ""}>${esc(z)}</option>`).join("")}</select></div></div>
        ${state.cals.length > 1 ? `<div class="field"><label for="s-cal">${t("calendar")}</label><select class="input" id="s-cal">${state.cals.map((c) => `<option value="${c.id}" ${c.id === cal?.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>` : ""}
      </div>
      ${isAdmin() ? `
      <div class="sec" id="s-req"><h3>${t("requests")}</h3><div class="list" id="req-list"></div></div>
      <div class="sec"><h3>${t("admins")}</h3><div class="list" id="adm-list"></div></div>
      <div class="sec" id="s-google"><h3>${t("google")}</h3><div id="g-box"></div></div>
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
      $("#s-av", d).innerHTML = avatar(p.emoji, p.color, "lg");
    });
    $("#s-bm", d).onchange = () => { const v = $("#s-bd", d).value; $("#s-bm", d).parentElement.innerHTML = bdSelects($("#s-bm", d).value, v, "s"); rewireBd(d); };
    const rewireBd = (dd) => { $("#s-bm", dd).onchange = () => { const v = $("#s-bd", dd).value; $("#s-bm", dd).parentElement.innerHTML = bdSelects($("#s-bm", dd).value, v, "s"); rewireBd(dd); }; };
    $("#s-save", d).onclick = async () => {
      const bm = $("#s-bm", d).value, bd = $("#s-bd", d).value;
      if (!!bm !== !!bd) return toast(t("ob_bd"), true);
      try {
        state.me = { ...state.me, ...(await api("/api/auth/me", { method: "PATCH", body: { name: $("#s-name", d).value, emoji: p.emoji, color: p.color, birth_month: bm ? Number(bm) : null, birth_day: bd ? Number(bd) : null } })) };
        toast(t("saved")); chime("ok"); $(".me-chip").innerHTML = `${avatar(state.me.emoji, state.me.color, "sm")}<span>${esc(state.me.name)}</span>`;
        refreshCalendar();
      } catch (e) { fail(e); }
    };
    $("#s-lang", d).onchange = async (e) => {
      lang = e.target.value; store.set("lang", lang);
      try { await api("/api/auth/me", { method: "PATCH", body: { lang } }); } catch {}
      d.close(); renderApp(); openSettings();
    };
    $("#s-tz", d).onchange = async (e) => {
      try { state.me = { ...state.me, ...(await api("/api/auth/me", { method: "PATCH", body: { timezone: e.target.value } })) }; toast(t("saved")); refreshCalendar(); } catch (er) { fail(er); }
    };
    $("#s-cal", d)?.addEventListener("change", async (e) => { store.set("cal", e.target.value); d.close(); await loadConfig(); state.cursor = null; renderApp(); });
    $("#s-logout", d).onclick = () => { store.set("token", null); store.set("cal", null); d.close(); Object.assign(ob, { step: 0, emoji: null }); boot(); };
    if (isAdmin()) wireAdmin(d); else drawApply(d);
  });
}
async function drawApply(d) {
  const box = $("#apply-box", d);
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
  drawRequests(d); drawAdmins(d); drawGoogle(d);
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
  let armed = false;
  $("#inv-revoke", d).onclick = async (e) => {
    if (!armed) { armed = true; e.target.classList.add("armed"); chime("bad"); return; }
    try { await api(`/api/calendars/${store.get("cal")}/invite`, { method: "DELETE" }); $("#inv-out", d).innerHTML = ""; toast(t("saved")); e.target.classList.remove("armed"); armed = false; } catch (er) { fail(er); }
  };
}
async function drawRequests(d) {
  const box = $("#req-list", d);
  try {
    const list = await api("/api/admin/requests");
    box.innerHTML = list.length ? list.map((r) => `<div class="item">${avatar(r.emoji, r.color, "sm")}<div class="grow"><b>${esc(r.name)}</b><div class="sub">${esc(r.email)}</div></div>
      ${isTop() ? `<button class="btn sm" data-ok="${r.id}">${t("approve")}</button><button class="btn danger sm" data-no="${r.id}">${t("reject")}</button>` : ""}</div>`).join("") : `<p class="empty">${t("no_requests")}</p>`;
    box.onclick = async (e) => {
      const b = e.target.closest("[data-ok],[data-no]"); if (!b) return;
      if (await decide(Number(b.dataset.ok || b.dataset.no), !!b.dataset.ok)) { clearPops(); drawRequests(d); drawAdmins(d); }
    };
  } catch (e) { box.textContent = e.message; }
}
async function drawAdmins(d) {
  const box = $("#adm-list", d);
  try {
    const list = await api("/api/admin/list");
    box.innerHTML = list.map((a) => `<div class="item">${avatar(a.emoji, a.color, "sm")}<div class="grow"><b>${esc(a.name)}</b> ${a.top ? `<span class="tag ok">${t("top_admin")}</span>` : ""}<div class="sub">${esc(a.email)}</div></div>
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
      if (!b.classList.contains("armed")) { b.classList.add("armed"); b.textContent = t("confirm_remove"); return; }
      try { await api(`/api/admin/list/${b.dataset.unadmin}`, { method: "DELETE" }); drawAdmins(d); } catch (er) { fail(er); }
    };
  } catch (e) { box.textContent = e.message; }
}
async function drawGoogle(d) {
  const box = $("#g-box", d);
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
  let armed = false;
  $("#g-off", box).onclick = async (e) => {
    if (!armed) { armed = true; e.target.classList.add("armed"); chime("bad"); return; }
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
async function pollNotes() {
  try {
    const r = await api("/api/notifications");
    state.notes.items = r.items; state.notes.unread = r.unread;
    const dot = $("#bell-dot"); if (dot) { dot.hidden = !r.unread; dot.textContent = r.unread; }
    const fresh = r.items.filter((n) => !n.read_at && n.id > state.notes.seen);
    if (fresh.length) {
      state.notes.seen = Math.max(...fresh.map((n) => n.id)); store.set("notes-seen", String(state.notes.seen));
      fresh.slice(0, 3).reverse().forEach(popNote);
      chime(fresh.some((n) => n.kind === "sync_error") ? "bad" : "note");
    }
  } catch {}
}
function popNote(n) {
  const el = document.createElement("div");
  const rid = reqIdOf(n);
  el.className = "pop" + (n.kind === "sync_error" ? " bad" : "");
  // 管理员申请：只有「批准」和「拒绝」，按了才会消失
  const acts = rid ? `<button class="btn sm" data-ok>${t("approve")}</button><button class="btn danger sm" data-no>${t("reject")}</button>`
    : `<button class="btn sm" data-open>${t("view")}</button><button class="btn ghost sm" data-x>${t("close")}</button>`;
  el.innerHTML = `<span style="font-size:22px">${n.kind === "sync_error" ? "⚠️" : "🙋"}</span><div class="grow"><b>${n.kind === "sync_error" ? t("google") : t("requests")}</b>${esc(n.body)}
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
    <div class="dlg-body"><div class="bell-list">${items.length ? items.map((n) => `<div class="bell-item ${n.read_at ? "" : "unread"}">${n.kind === "sync_error" ? "⚠️" : "🙋"} ${esc(n.body)}<span class="act-when">${esc(ago(n.created_at))}</span>
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
