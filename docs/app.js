// ===================== Shared Calendar / 共享日历 =====================
import { LANGS, t, setLang, getLang, locale, applyI18n } from "./i18n.js?v=113";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toLocalInput = (iso) => { if (!iso) return ""; const d = new Date(iso); return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const timeLocale = () => (locale().startsWith("en") ? "en-US" : locale()); // 英文用「9:30 AM」（大写 AM/PM）
const fmtTime = (iso) => new Date(iso).toLocaleTimeString(timeLocale(), { hour: "numeric", minute: "2-digit", hour12: true }); // 12 小时制
const fmtDateTime = (iso) => new Date(iso).toLocaleString(locale(), { month: "short", day: "numeric", weekday: "short" }) + " " + fmtTime(iso);
const fmtLongDate = (d) => d.toLocaleDateString(locale(), { year: "numeric", month: "long", day: "numeric", weekday: "short" });
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
const DEFAULT_COLOR = "#2d5fa8";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 密码：至少 6 个字，且至少 1 个特殊符号（不是字母、数字、空白）
const passwordOk = (pw) => pw.length >= 6 && /[^\p{L}\p{N}\s]/u.test(pw);

// ---------- API ----------
// 后端（Supabase 函数）的网址在 config.js 设定；空白 = 同一个网站
const API_BASE = String(window.APP_CONFIG?.apiBase || "").replace(/\/$/, "");
const token = () => store.get("token") || "";
const myName = () => state.me?.name || "";
// 进度视窗：送资料到服务器时（登录、保存、删除、上传…）中间跳出「处理中…」，完成后显示「✓ 已保存」
const SILENT = [/^\/api\/google\/pull/, /\/done$/, /^\/api\/google\/sync-all/, /^\/api\/chat/];
function progressText(path, method, body) {
  if (path.startsWith("/api/auth/login")) return ["pg_login", "pg_login_ok"];
  if (path.startsWith("/api/auth/signup")) return ["pg_signup", "pg_signup_ok"];
  if (path.startsWith("/api/auth/logout")) return null;
  if (path.startsWith("/api/auth/forgot")) return ["pg_code", "pg_code_ok"];   // 寄验证码
  if (path.startsWith("/api/auth/reset")) return ["pg_reset", "pg_reset_ok"]; // 重设密码
  if (method === "DELETE") return ["pg_delete", "pg_delete_ok"];
  if (body instanceof FormData) return ["pg_upload", "pg_upload_ok"];
  if (path === "/api/events" && method === "POST") return ["pg_save", "pg_event_ok"];
  return ["pg_save", "pg_save_ok"];
}
let pgCount = 0, pgTimer = null, pgDoneTimer = null;
function progressStart(key) {
  pgCount++;
  clearTimeout(pgDoneTimer);
  clearTimeout(pgTimer);
  pgTimer = setTimeout(() => { // 很快完成的就不闪一下
    $("#progressText").textContent = t(key);
    popTop();
    $("#progressPop").className = "progress-pop show";
  }, 250);
}
function progressEnd(okKey) {
  pgCount = Math.max(0, pgCount - 1);
  if (pgCount) return;
  clearTimeout(pgTimer);
  if (okKey) {
    $("#progressText").textContent = t(okKey);
    popTop();
    $("#progressPop").className = "progress-pop show done";
    pgDoneTimer = setTimeout(popHide, 550);
  } else popHide();
}
// 放到最上层（盖过正在打开的视窗，例如编辑行程）
function popTop() { const el = $("#progressPop"); try { if (el.matches(":popover-open")) el.hidePopover(); el.showPopover(); } catch {} }
function popHide() {
  const el = $("#progressPop"); el.className = "progress-pop";
  setTimeout(() => { if (!el.classList.contains("show")) try { el.hidePopover(); } catch {} }, 150);
}

async function api(path, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();
  const pg = method !== "GET" && !opts.silent && !SILENT.some((r) => r.test(path)) ? progressText(path, method, opts.body) : null;
  if (pg) progressStart(pg[0]);
  try {
    const data = await apiRaw(path, opts);
    if (pg) progressEnd(pg[1]);
    return data;
  } catch (e) { if (pg) progressEnd(null); throw e; }
}
async function apiRaw(path, opts = {}) {
  const headers = { "x-lang": getLang(), ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...(store.get("cal") ? { "x-cal": store.get("cal") } : {}), ...(opts.headers || {}) };
  let body = opts.body;
  if (body && !(body instanceof FormData)) { headers["Content-Type"] = "application/json"; body = JSON.stringify(body); }
  const res = await fetch(API_BASE + path, { ...opts, body, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("/api/auth/login") && !path.startsWith("/api/auth/signup") && !path.startsWith("/api/auth/password")) {
    showAuth(data.error);
    throw new Error(data.error || "401");
  }
  if (!res.ok) throw new Error(data.error || res.statusText || `Server error ${res.status}`);
  return data;
}
const photoUrl = (id) => `${API_BASE}/api/photos/${id}/file?t=${encodeURIComponent(token())}`;

// 上传前在手机上缩小照片（最长边 1600px，JPEG），上传更快、也不会超过服务器上限
async function shrinkForUpload(file) {
  if (!/^image\//i.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    if (s === 1 && file.size < 1.5 * 1024 * 1024 && file.type === "image/jpeg") return file;
    const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
    cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], (file.name || "photo").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2800);
}
function askConfirm(message, okText) {
  return new Promise((resolve) => {
    const d = $("#confirmDialog");
    $("#confirmText").textContent = message;
    $("#confirmOk").textContent = okText || t("ok");
    const done = (v) => { d.close(); resolve(v); };
    $("#confirmOk").onclick = () => done(true);
    $("#confirmCancel").onclick = () => done(false);
    d.oncancel = (ev) => { ev.preventDefault(); }; // 按 Esc 不会关掉：一定要按按钮
    d.showModal();
  });
}
// Enter 送出（Shift+Enter 换行）
function enterToSend(input, send) {
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); send(); }
  });
}
function avatar(name) {
  const n = name || "?";
  const m = state.members.find((x) => x.name === n);
  if (m?.emoji) return `<span class="avatar emoji" style="--ring:${esc(m.color || "#4a7be0")}">${esc(m.emoji)}</span>`;
  let color = m?.color;
  if (!color) { let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360; color = n === "Claude" ? "#c47a3d" : `hsl(${h} 45% 48%)`; }
  return `<span class="avatar" style="background:${esc(color)}">${esc(n.slice(0, 1))}</span>`;
}
// 颜色标签的显示顺序：由浅到深，每个颜色只有一个
const LABEL_ORDER = ["5", "6", "4", "2", "7", "1", "10", "9", "11", "3", "8"];
const orderedLabels = () => LABEL_ORDER.filter((id) => state.labels[id]).map((id) => [id, state.labels[id]]);
const labelName = (id) => state.labelNames?.[id] || t(`label_${id}`);
const author = (n) => n || t("anonymous");

// ---------- 状态 ----------
const state = {
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selected: new Date(),
  events: [], members: [], labels: {}, config: {}, chatHistory: [], me: null, view: "calendar",
};

// ---------- 语言 ----------
function fillLangSelects() {
  for (const sel of [$("#authLang"), $("#langSelect")]) {
    sel.innerHTML = LANGS.map((l) => `<option value="${l.code}" ${l.code === getLang() ? "selected" : ""}>${esc(l.name)}</option>`).join("");
  }
}
function renderWeekdays() {
  const base = new Date(2023, 0, 1); // 星期日
  $("#weekdays").innerHTML = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base); d.setDate(1 + i);
    return `<span>${esc(d.toLocaleDateString(locale(), { weekday: "short" }))}</span>`;
  }).join("");
}
/** 换语言后，重画所有动态内容 */
function rerenderAll() {
  applyI18n(document);
  fillLangSelects();
  renderWeekdays();
  setAuthMode(authMode);
  if (!document.body.classList.contains("locked")) {
    showView(state.view);
    if (state.gridStart) renderMonth();
    $("#postAs").textContent = t("posting_as", { name: myName() });
    if (current && $("#detailDialog").open) renderDetail();
    if ($("#eventDialog").open) { renderFormFeed(); fillMemberSelect(); renderLabelPicker(selectedLabel()); $("#eventDialogTitle").textContent = editing ? t("edit_event") : t("new_event"); }
  }
}
async function changeLang(code, saveToAccount) {
  setLang(code);
  rerenderAll();
  if (saveToAccount && token()) {
    try { state.me = { ...state.me, ...(await api("/api/auth/me", { method: "PATCH", body: { lang: code } })) }; } catch {}
  }
}
$("#authLang").addEventListener("change", (ev) => changeLang(ev.target.value, false));
$("#langSelect").addEventListener("change", (ev) => changeLang(ev.target.value, true));

// ---------- 页签 ----------
document.querySelectorAll(".tabbar button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
function showView(v) {
  if (v === "home") v = "calendar"; // 「今天」页签已拿掉
  state.view = v;
  document.querySelectorAll(".view").forEach((s) => s.classList.toggle("active", s.id === `view-${v}`));
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  const cal = v === "calendar";
  ["#prevMonth", "#nextMonth", "#todayBtn"].forEach((s) => ($(s).style.visibility = cal ? "visible" : "hidden"));
  $("#title").textContent = cal ? monthTitle() : { home: t("tab_home"), board: t("tab_board"), members: t("tab_members"), week: t("tab_week"), claude: t("tab_claude"), settings: t("tab_settings") }[v];
  if (v === "home") renderHome();
  if (v === "board") renderBoard();
  if (v === "members") renderMembers();
  if (v === "week") renderWeek();
  if (v === "settings") renderSettings();
}

// ---------- 月历 ----------
const monthTitle = () => state.month.toLocaleDateString(locale(), { year: "numeric", month: "long" });
const eventColor = (e) => e.color || e.member_color || DEFAULT_COLOR;

async function loadMonth() {
  const gridStart = new Date(state.month); gridStart.setDate(1 - state.month.getDay());
  const gridEnd = new Date(gridStart); gridEnd.setDate(gridStart.getDate() + 42);
  state.gridStart = gridStart;
  state.events = await api(`/api/events?from=${gridStart.toISOString()}&to=${gridEnd.toISOString()}`);
  renderMonth();
}
// 一个行程涵盖的每一天（跨天行程每天都显示）
function eventDays(e) {
  const s = new Date(e.start); s.setHours(0, 0, 0, 0);
  const end = new Date(e.end || e.start);
  const days = [];
  for (let d = new Date(s); d <= end && days.length < 62; d.setDate(d.getDate() + 1)) days.push(dayKey(d));
  return days.length ? days : [dayKey(s)];
}
function eventsByDay() {
  const map = {};
  for (const e of state.events) for (const k of eventDays(e)) (map[k] ||= []).push(e);
  return map;
}
// 月历：每星期一行；跨好几天的行程画成一条横跨的长条（和 Google 日历一样），每天最多 2 条，其他的显示「还有 N 个」
const MONTH_LANES = 2;
function renderMonth() {
  if (state.view === "calendar") $("#title").textContent = monthTitle();
  const todayK = dayKey(new Date()), selK = dayKey(state.selected);
  const spans = state.events.map((e) => ({ e, days: eventDays(e) }));
  let html = "";
  // 只画这个月需要的星期：画到有 30 / 31 号的那一周就停
  const lastDay = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 0);
  const weeks = Math.ceil((Math.round((lastDay - state.gridStart) / 86400000) + 1) / 7);
  for (let w = 0; w < weeks; w++) {
    const dates = Array.from({ length: 7 }, (_, i) => { const d = new Date(state.gridStart); d.setDate(d.getDate() + w * 7 + i); return d; });
    const keys = dates.map(dayKey), col = new Map(keys.map((k, i) => [k, i]));
    // 这星期里每个行程占哪几天
    const segs = [];
    for (const { e, days } of spans) {
      const cols = days.map((k) => col.get(k)).filter((c) => c !== undefined);
      if (!cols.length) continue;
      const s = Math.min(...cols), t = Math.max(...cols);
      segs.push({ e, s, t, total: days.length, contL: days[0] !== keys[s], contR: days[days.length - 1] !== keys[t] });
    }
    // 先摆早开始的；同一天开始的，长的先摆（和 Google 一样）
    segs.sort((a, b) => a.s - b.s || b.t - b.s - (a.t - a.s) || b.total - a.total || new Date(a.e.start) - new Date(b.e.start));
    const lanes = Array.from({ length: MONTH_LANES }, () => new Array(7).fill(false));
    const more = new Array(7).fill(0);
    let bars = "";
    for (const g of segs) {
      const lane = lanes.findIndex((row) => row.slice(g.s, g.t + 1).every((x) => !x));
      if (lane < 0) { for (let c = g.s; c <= g.t; c++) more[c]++; continue; }
      for (let c = g.s; c <= g.t; c++) lanes[lane][c] = true;
      const other = dates.slice(g.s, g.t + 1).every((d) => d.getMonth() !== state.month.getMonth());
      bars += `<div class="chip bar${g.contL ? " cl" : ""}${g.contR ? " cr" : ""}${other ? " other" : ""}" style="--c:${esc(eventColor(g.e))};grid-column:${g.s + 1} / ${g.t + 2};grid-row:${lane + 2}">${esc(g.e.title)}</div>`;
    }
    const cells = dates.map((d, i) => {
      const k = keys[i];
      const cls = ["day", d.getMonth() !== state.month.getMonth() && "other", k === todayK && "today",
        k === selK && "selected", d.getDay() === 0 && "sun", d.getDay() === 6 && "sat"].filter(Boolean).join(" ");
      return `<div class="${cls}" data-day="${k}" style="grid-column:${i + 1}"><span class="num">${d.getDate()}</span></div>`;
    }).join("");
    const moreHtml = more.map((n, i) => (n ? `<div class="more" style="grid-column:${i + 1};grid-row:${MONTH_LANES + 2}">${esc(t("month_more", { n }))}</div>` : "")).join("");
    html += `<div class="week-row">${cells}${bars}${moreHtml}</div>`;
  }
  $("#monthGrid").innerHTML = html;
  renderDay();
}
// 点日期跳出的视窗：那天的行程清单
const HOUR_PX = 52; // 时间轴：每小时的高度
function openDayDialog() {
  const k = dayKey(state.selected), sel = state.selected;
  const evs = eventsByDay()[k] || [];
  const isToday = k === dayKey(new Date());
  $("#ddDow").textContent = sel.toLocaleDateString(locale(), { weekday: "short" });
  $("#ddNum").textContent = sel.getDate();
  $("#ddNum").classList.toggle("today", isToday);
  $("#ddTitle").textContent = sel.toLocaleDateString(locale(), { month: "long", year: "numeric" });
  const who = (e) => (e.member_name ? " · " + esc((e.member_emoji ? e.member_emoji + " " : "") + e.member_name) : "");
  // 上面一条：全天行程，和「整天都在进行中」的跨日行程（例如 19 日开始、21 日结束 → 20 日）
  const startsToday = (e) => dayKey(new Date(e.start)) === k;
  const endsToday = (e) => e.end && dayKey(new Date(e.end)) === k;
  const allDay = evs.filter((e) => e.all_day || (!startsToday(e) && !endsToday(e)));
  const timed = evs.filter((e) => !allDay.includes(e)).sort((x, y) => new Date(x.start) - new Date(y.start));
  const range = (e) => `${fmtDateTime(e.start)} → ${e.end ? fmtDateTime(e.end) : ""}`;
  $("#ddAllDay").innerHTML = allDay.map((e) => `<button type="button" class="dd-ev${e.color ? " lbl" : ""}" data-id="${e.id}" style="--c:${esc(eventColor(e))}">
      <b>${esc(e.title)}</b><span>${esc(e.all_day ? t("all_day") : range(e))}${who(e)}</span></button>`).join("");
  // 时间轴：小时线 + 依时间摆放的行程（重叠的并排）
  const mins = (d) => d.getHours() * 60 + d.getMinutes();
  const items = timed.map((e) => {
    const s0 = startsToday(e) ? mins(new Date(e.start)) : 0; // 前几天开始的 → 从 12 AM 开始画
    const endD = e.end ? new Date(e.end) : null;
    const e0 = endD && dayKey(endD) === k ? Math.max(mins(endD), s0 + 20) : endD ? 24 * 60 : s0 + 60;
    return { e, s0, e0, col: 0, cols: 1 };
  });
  let group = [], groupEnd = -1; // 互相重叠的一组 → 分栏
  const flush = () => { const n = Math.max(1, ...group.map((g) => g.col + 1)); group.forEach((g) => (g.cols = n)); group = []; };
  for (const it of items) {
    if (it.s0 >= groupEnd) { flush(); groupEnd = -1; }
    const used = new Set(group.filter((g) => g.e0 > it.s0).map((g) => g.col));
    let c = 0; while (used.has(c)) c++;
    it.col = c; group.push(it); groupEnd = Math.max(groupEnd, it.e0);
  }
  flush();
  let html = "";
  for (let h = 0; h < 24; h++) {
    const label = h === 0 ? "" : new Date(2000, 0, 1, h).toLocaleTimeString(timeLocale(), { hour: "numeric", hour12: true });
    html += `<div class="dd-line" style="top:${h * HOUR_PX}px"><span>${esc(label)}</span></div>`;
  }
  html += items.map(({ e, s0, e0, col, cols }) => `<button type="button" class="dd-ev dd-block${e.color ? " lbl" : ""}" data-id="${e.id}"
      style="--c:${esc(eventColor(e))};top:${(s0 / 60) * HOUR_PX}px;height:${Math.max(22, ((e0 - s0) / 60) * HOUR_PX - 2)}px;left:calc(${(col / cols) * 100}% + 2px);width:calc(${100 / cols}% - 4px)">
      <b>${esc(e.title)}</b><span>${startsToday(e) && (!e.end || endsToday(e)) ? fmtTime(e.start) + (e.end ? " – " + fmtTime(e.end) : "") : esc(range(e))}${who(e)}</span></button>`).join("");
  if (isToday) html += `<div class="dd-now" style="top:${(mins(new Date()) / 60) * HOUR_PX}px"></div>`;
  $("#ddHours").innerHTML = `<div class="dd-grid" style="height:${24 * HOUR_PX}px"><div class="dd-events">${html}</div></div>`;
  if (!$("#dayDialog").open) $("#dayDialog").showModal();
  // 卷到「现在」或第一个行程（没有就早上 8 点）
  const focus = isToday ? mins(new Date()) / 60 - 1 : items.length ? items[0].s0 / 60 - 0.5 : 8;
  // 全天行程和时间轴在同一个滑动区：全天行程很多 → 从最上面开始；不多 → 卷到「现在」或第一个行程
  const sc = $("#ddScroll"), allDayH = $("#ddAllDay").offsetHeight;
  sc.scrollTop = allDayH > sc.clientHeight / 3 ? 0 : allDayH + Math.max(0, focus) * HOUR_PX;
}
function ddClick(ev) {
  const evBtn = ev.target.closest(".dd-ev");
  if (evBtn) { $("#dayDialog").close(); openDetail(Number(evBtn.dataset.id)); return; }
  const grid = ev.target.closest(".dd-grid");
  if (grid) { // 点空白：在那个小时新增
    const y = ev.clientY - grid.getBoundingClientRect().top;
    const hour = Math.min(23, Math.max(0, Math.floor(y / HOUR_PX)));
    $("#dayDialog").close(); openEditor(null, state.selected, hour);
  }
}
$("#ddHours").addEventListener("click", ddClick);
$("#ddAllDay").addEventListener("click", ddClick);
$("#ddClose").onclick = () => $("#dayDialog").close();
$("#dayDialog").addEventListener("click", (ev) => { if (ev.target === $("#dayDialog")) $("#dayDialog").close(); }); // 点外面关闭
$("#ddNew").onclick = () => { $("#dayDialog").close(); openEditor(null, state.selected); };

// 选中那天上面的按钮：新增这天的行程
$("#dayNewBtn").onclick = () => openEditor(null, state.selected);

$("#monthGrid").addEventListener("click", (ev) => {
  const cell = ev.target.closest(".day");
  if (!cell) return;
  const [y, m, d] = cell.dataset.day.split("-").map(Number);
  const picked = new Date(y, m - 1, d);
  const same = dayKey(picked) === dayKey(state.selected);
  state.selected = picked;
  // 点日期：跳出那天的行程（上面有「新增行程」按钮）
  openDayDialog();
  if (same) return;
  if (picked.getMonth() !== state.month.getMonth()) { state.month = new Date(y, m - 1, 1); loadMonth().then(openDayDialog); } else renderMonth();
});
function renderDay() {
  const k = dayKey(state.selected);
  $("#dayTitle").textContent = state.selected.toLocaleDateString(locale(), { month: "long", day: "numeric", weekday: "long" });
  $("#dayNewText").textContent = t("day_new", { date: state.selected.toLocaleDateString(locale(), { day: "numeric", month: "short" }) });
  const evs = eventsByDay()[k] || [];
  $("#dayList").innerHTML = evs.length ? evs.map((e) => `
    <li class="item tinted${e.color ? " lbl" : ""}" data-id="${e.id}" style="--c:${esc(eventColor(e))}">
      <span class="bar" style="background:${esc(eventColor(e))}"></span>
      <div class="main">
        <div class="t">${esc(e.title)}</div>
        <div class="s">${e.all_day ? esc(t("all_day")) : fmtTime(e.start) + (e.end ? " – " + fmtTime(e.end) : "")}${e.member_name ? " · " + esc((e.member_emoji ? e.member_emoji + " " : "") + e.member_name) : ""}${e.photo_count ? " · 📷" + e.photo_count : ""}${e.memo_count ? " · 💬" + e.memo_count : ""}</div>
      </div>
    </li>`).join("") : `<li class="empty">${esc(t("day_empty"))}</li>`;
}
$("#dayList").addEventListener("click", (ev) => {
  const del = ev.target.closest("[data-del]");
  if (del) { ev.stopPropagation(); const e = state.events.find((x) => x.id === Number(del.dataset.del)); if (e) deleteEventAsk(e); return; }
  const li = ev.target.closest(".item"); if (li) openDetail(Number(li.dataset.id));
});
// 删除行程：App 和 Google 日历都会删除
async function deleteEventAsk(e, after) {
  const msg = t("delete_event_confirm", { title: e.title }) + (state.me?.google ? t("delete_event_confirm_g") : "");
  if (!(await askConfirm(msg, t("delete")))) return false;
  try {
    await api(`/api/events/${e.id}`, { method: "DELETE" });
    toast(t("deleted"));
    after?.();
    await loadMonth();
    if (state.view === "week") renderWeek();
    return true;
  } catch (err) { toast(err.message); return false; }
}
$("#prevMonth").onclick = () => { state.month.setMonth(state.month.getMonth() - 1); loadMonth(); };
$("#nextMonth").onclick = () => { state.month.setMonth(state.month.getMonth() + 1); loadMonth(); };
$("#todayBtn").onclick = () => { const d = new Date(); state.selected = d; state.month = new Date(d.getFullYear(), d.getMonth(), 1); loadMonth(); };
$("#addEventBtn").onclick = () => openEditor(null, state.selected);

// ---------- 行程详情 + 时间线 ----------
let current = null; // 正在看的行程（含 feed）
async function openDetail(id) {
  // 先用已经载入的资料马上打开（不用等网络），再在背景补上留言、照片等完整资料
  const cached = (state.events || []).find((x) => x.id === id) || (state.weekEvents || []).find((x) => x.id === id) || (state.homeEvents || []).find((x) => x.id === id);
  if (cached) {
    current = { ...cached, feed: [], google: null };
    showDetailNow(id);
    api(`/api/events/${id}`).then((full) => { if (current?.id === id) { current = full; renderDetail(); } }).catch(() => {});
    return;
  }
  try { current = await api(`/api/events/${id}`); } catch (e) { toast(e.message); return; }
  showDetailNow(id);
}
function showDetailNow(id) {
  renderDetail();
  loadChecklist(id);
  $("#detailMenu").hidden = true;
  $("#postAs").textContent = t("posting_as", { name: myName() });
  if (!$("#detailDialog").open) $("#detailDialog").showModal();
  history.replaceState(null, "", `#event-${id}`);
  const body = $("#detailBody");
  requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
}
const closeDetail = () => $("#detailDialog").close();
$("#detailDialog").addEventListener("close", () => { current = null; if (location.hash.startsWith("#event-")) history.replaceState(null, "", location.pathname); });
$("#detailClose").onclick = closeDetail;

function renderDetail() {
  const e = current;
  renderStudioDetail();
  const color = eventColor(e);
  $("#dTitle").textContent = e.title;
  $("#dTitle").style.color = `color-mix(in srgb, ${color} 45%, #1d2740)`; // 粉彩色太浅，标题用深一点
  const s = new Date(e.start), end = e.end ? new Date(e.end) : null;
  const sameDay = !end || dayKey(s) === dayKey(end);
  const setDate = (pre, d) => {
    $(`#${pre}Year`).textContent = d.getFullYear();
    $(`#${pre}Day`).textContent = d.toLocaleDateString(locale(), { month: "short", day: "numeric", weekday: "short" });
    $(`#${pre}Time`).textContent = e.all_day ? "" : fmtTime(d.toISOString());
  };
  setDate("dStart", s);
  if (end && !(e.all_day && sameDay)) { setDate("dEnd", end); $("#dEndBox").hidden = false; $("#dArrow").hidden = false; }
  else { $("#dEndBox").hidden = true; $("#dArrow").hidden = true; if (e.all_day) $("#dStartTime").textContent = t("all_day"); }
  $("#dArrow").style.color = color;
  $("#dMemberRow").hidden = !e.member_name;
  $("#dMember").textContent = e.member_name ? (e.member_emoji ? e.member_emoji + " " : "") + e.member_name : "";
  $("#dRemind").textContent = e.remind ? t("remind_on") : t("remind_off");
  const label = e.label && state.labels[e.label];
  $("#dLabelRow").hidden = !label;
  if (label) $("#dLabel").innerHTML = `<span class="dot" style="background:${esc(label.hex)}"></span>${esc(labelName(e.label))}`;
  $("#dNotesRow").hidden = !e.notes;
  $("#dNotes").textContent = e.notes || "";
  renderCustomer(e);
  // 我自己的 Google 日历同步状态
  const g = $("#dGoogle");
  $("#dGoogleRow").hidden = !state.me?.google;
  g.className = "";
  if (e.google?.error) { g.textContent = t("g_row_error", { error: e.google.error }); g.className = "warn"; }
  else if (e.google?.synced_at) g.textContent = t("g_row_synced", { time: fmtDateTime(e.google.synced_at) });
  else g.textContent = t("g_row_pending");
  renderFeed();
}

// 给客户的 WhatsApp：电话、讯息、发送状态、立即发送 / 取消自动发送
function renderCustomer(e) {
  const has = !!(e.customer_phone || e.customer_note);
  $("#dCustomerRow").hidden = !has;
  if (!has) return;
  $("#dCustomerPhone").textContent = [e.customer_name ? `👤 ${e.customer_name}` : "", e.customer_phone ? `📞 ${e.customer_phone}` : ""].filter(Boolean).join("   ");
  $("#dCustomerNote").textContent = e.customer_note || "";
  const st = $("#dCustomerStatus"), phone = e.customer_phone || "";
  const ready = !!state.config?.whatsapp, auto = e.customer_auto !== 0;
  st.className = "hint";
  if (!ready) { st.textContent = t("c_not_ready"); st.classList.add("warn"); }
  else if (e.customer_error) { st.textContent = t("c_failed", { error: e.customer_error }); st.classList.add("warn"); }
  else if (e.customer_sent_at) st.textContent = t("c_sent", { phone, time: fmtDateTime(e.customer_sent_at) });
  else if (!auto) st.textContent = t("c_off");
  else if (e.customer_send_at && new Date(e.start) > new Date()) st.textContent = t("c_will_send", { phone, time: fmtDateTime(e.customer_send_at) });
  else st.textContent = t("c_past");
  const allowed = !!state.me?.can_whatsapp;
  const canSend = allowed && ready && !!e.customer_phone && !!e.customer_note;
  $("#dCustSend").hidden = !canSend;
  $("#dCustToggle").hidden = !allowed || !ready || !!e.customer_sent_at;
  $("#dCustToggle").textContent = auto ? t("c_cancel") : t("c_resume");
}
$("#dCustSend").onclick = async () => {
  if (!current) return;
  if (!(await askConfirm(t("c_confirm_send", { phone: current.customer_phone }), t("c_send_now")))) return;
  const btn = $("#dCustSend"); btn.disabled = true;
  try { current = await api(`/api/events/${current.id}/customer-send`, { method: "POST", body: {} }); renderDetail(); toast(t("c_sent_toast")); }
  catch (err) { toast(err.message); try { current = await api(`/api/events/${current.id}`); renderDetail(); } catch {} }
  btn.disabled = false;
};
$("#dCustToggle").onclick = async () => {
  if (!current) return;
  const btn = $("#dCustToggle"); btn.disabled = true;
  try { await api(`/api/events/${current.id}`, { method: "PATCH", body: { customer_auto: current.customer_auto === 0 } }); current = await api(`/api/events/${current.id}`); renderDetail(); }
  catch (err) { toast(err.message); }
  btn.disabled = false;
};

function logText(f) {
  if (f.body === "created") return t("log_created");
  if (f.body === "customer_sent") return t("log_customer_sent");
  if (f.body === "customer_failed") return t("log_customer_failed");
  if (f.body === "done") return t("log_done");
  if (f.body === "undone") return t("log_undone");
  if (f.body.startsWith("updated:")) {
    const fields = f.body.slice(8).split(",").filter(Boolean).map((k) => t(`field_${k}`));
    if (!fields.length) return t("log_updated_generic"); // 旧的空白纪录
    return t("log_updated", { fields: fields.join(t("list_sep")) });
  }
  return f.body; // 旧资料
}
function renderFeed() { renderFeedInto($("#feed"), current.feed || []); }
function renderFeedInto(container, feed) {
  const me = myName();
  let html = "", lastDay = "", lastAuthor = null, lastTime = 0;
  for (const f of feed) {
    const tm = new Date(f.created_at);
    const dk = dayKey(tm);
    if (dk !== lastDay) { html += `<div class="sep"><span>${esc(fmtLongDate(tm))}</span></div>`; lastDay = dk; lastAuthor = null; }
    if (f.type === "log") {
      html += `<div class="sys"><span>${f.author ? `<b>${esc(f.author)}</b> ` : ""}${esc(logText(f))} · ${fmtTime(f.created_at)}</span></div>`;
      lastAuthor = null;
      continue;
    }
    // 同一个人、5 分钟内连续发的内容合在一起（只显示一次头像和名字）
    const grouped = f.author === lastAuthor && tm - lastTime < 5 * 60_000;
    const mine = !!me && f.author === me;
    const inner = f.type === "comment"
      ? `<div class="bubble">${esc(f.body)}</div>`
      : `<button type="button" class="photo-post" data-photo="${f.id}"><img src="${photoUrl(f.id)}" alt="${esc(t("photo_of", { name: author(f.author) }))}" loading="lazy" />${f.comment_count ? `<span class="cc">💬 ${f.comment_count}</span>` : ""}</button>${f.caption ? `<div class="bubble">${esc(f.caption)}</div>` : ""}`;
    html += `<div class="post ${mine ? "mine" : ""} ${grouped ? "grouped" : ""}">
      ${grouped ? `<span class="avatar ghost"></span>` : avatar(f.author)}
      <div class="post-main">
        ${grouped ? "" : `<div class="post-who"><b>${esc(author(f.author))}</b></div>`}
        <div class="post-content">${inner}
          <span class="post-time">${fmtTime(f.created_at)}${f.type === "comment" ? ` <button type="button" class="del" data-comment-del="${f.id}">${esc(t("delete"))}</button>` : ""}</span>
        </div>
      </div>
    </div>`;
    lastAuthor = f.author; lastTime = +tm;
  }
  if (!feed.some((f) => f.type !== "log")) html += `<p class="feed-empty">${esc(t("feed_empty"))}</p>`;
  container.innerHTML = html;
}
async function onFeedClick(ev) {
  const ph = ev.target.closest("[data-photo]");
  if (ph) return openPhoto(Number(ph.dataset.photo));
  const del = ev.target.dataset.commentDel;
  if (del && (await askConfirm(t("delete_comment_confirm"), t("delete")))) {
    await api(`/api/comments/${del}`, { method: "DELETE" });
    current = await api(`/api/events/${current.id}`);
    if ($("#detailDialog").open) renderDetail();
    if ($("#eventDialog").open) renderFormFeed();
    loadMonth();
  }
}
$("#feed").addEventListener("click", onFeedClick);
$("#formFeed").addEventListener("click", onFeedClick);

// 菜单
$("#detailMenuBtn").onclick = (ev) => { ev.stopPropagation(); $("#detailMenu").hidden = !$("#detailMenu").hidden; };
$("#detailDialog").addEventListener("click", (ev) => { if (!ev.target.closest(".menu-wrap")) $("#detailMenu").hidden = true; });
$("#detailEditBtn").onclick = () => { $("#detailMenu").hidden = true; openEditor(current); };
$("#detailEditTop").onclick = () => openEditor(current);
// 点标题、日期或资料列 → 编辑
$("#detailBody").addEventListener("click", (ev) => {
  if (ev.target.closest("[data-edit]") && !ev.target.closest("a, button") && current) openEditor(current);
});
$("#detailSyncBtn").onclick = async () => {
  $("#detailMenu").hidden = true;
  if (!state.me?.google) { toast(t("sync_need_connect")); return; }
  try {
    const r = await api(`/api/events/${current.id}/sync`, { method: "POST", body: {} });
    toast(r.ok ? t("sync_ok") : t("sync_fail", { error: r.error || "" }));
  } catch (e) { toast(t("sync_fail", { error: e.message })); }
  openDetail(current.id);
};
$("#detailDeleteBtn").onclick = () => { $("#detailMenu").hidden = true; deleteEventAsk(current, closeDetail); };
$("#detailTrashBtn").onclick = () => deleteEventAsk(current, closeDetail);

// 发留言 / 照片
let postFiles = [];
const thumbs = (files) => files.map((f, i) => `<span class="pv-thumb"><img src="${URL.createObjectURL(f)}" alt="" /><button type="button" data-rm="${i}" aria-label="${esc(t("remove"))}">×</button></span>`).join("");
$("#postPhotos").addEventListener("change", (ev) => {
  postFiles = [...postFiles, ...ev.target.files].slice(0, 10);
  ev.target.value = "";
  $("#postPreview").innerHTML = thumbs(postFiles);
});
$("#postPreview").addEventListener("click", (ev) => {
  const i = ev.target.dataset.rm;
  if (i !== undefined) { postFiles.splice(Number(i), 1); $("#postPreview").innerHTML = thumbs(postFiles); }
});
async function postToEvent(eventId, text, files) {
  const fd = new FormData();
  fd.append("text", text);
  for (const f of files) fd.append("photos", await shrinkForUpload(f));
  return api(`/api/events/${eventId}/posts`, { method: "POST", body: fd });
}
$("#postForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const text = $("#postInput").value.trim();
  if (!text && !postFiles.length) return;
  const btn = $("#postSend");
  btn.disabled = true; btn.textContent = postFiles.length ? t("uploading") : t("sending");
  try {
    current = await postToEvent(current.id, text, postFiles);
    $("#postInput").value = ""; postFiles = []; $("#postPreview").innerHTML = "";
    renderDetail();
    $("#detailBody").scrollTop = $("#detailBody").scrollHeight;
    loadMonth();
  } catch (e) { toast(t("send_failed", { error: e.message })); }
  btn.disabled = false; btn.textContent = t("send");
});
enterToSend($("#postInput"), () => $("#postForm").requestSubmit());

// ---------- 照片查看 + 评论 ----------
let viewerIndex = 0;
const feedPhotos = () => (current?.feed || []).filter((f) => f.type === "photo");
async function openPhoto(photoId) {
  const photos = feedPhotos();
  viewerIndex = Math.max(0, photos.findIndex((p) => p.id === photoId));
  await showPhoto();
  if (!$("#photoViewer").open) $("#photoViewer").showModal();
}
async function showPhoto() {
  const photos = feedPhotos(), p = photos[viewerIndex];
  if (!p) return;
  $("#photoViewerImg").src = photoUrl(p.id);
  $("#photoViewerImg").alt = t("photo_of", { name: author(p.author) });
  $("#pvCounter").textContent = `${viewerIndex + 1} / ${photos.length}`;
  $("#pvBy").innerHTML = `${avatar(p.author)} <b>${esc(author(p.author))}</b> · ${esc(fmtDateTime(p.created_at))}`;
  $("#pvCaption").textContent = p.caption || "";
  $("#pvPrev").hidden = viewerIndex === 0;
  $("#pvNext").hidden = viewerIndex === photos.length - 1;
  $("#pvInput").value = "";
  renderPhotoComments(await api(`/api/photos/${p.id}/comments`));
}
function renderPhotoComments(list) {
  $("#pvComments").innerHTML = list.length ? list.map((c) => `
    <li class="comment">${avatar(c.author)}
      <div class="cbubble"><div class="meta"><b>${esc(author(c.author))}</b><span>${fmtDateTime(c.created_at)}</span>
        <button type="button" class="del" data-comment-del="${c.id}">${esc(t("delete"))}</button></div>
        <div class="text">${esc(c.body)}</div></div>
    </li>`).join("") : `<li class="none">${esc(t("no_comments"))}</li>`;
}
$("#pvPrev").onclick = () => { viewerIndex--; showPhoto(); };
$("#pvNext").onclick = () => { viewerIndex++; showPhoto(); };
$("#pvClose").onclick = () => $("#photoViewer").close();
$("#photoViewer").addEventListener("click", (ev) => { if (ev.target === $("#photoViewer")) $("#photoViewer").close(); });
$("#photoViewer").addEventListener("close", async () => {
  if (!current) return;
  current = await api(`/api/events/${current.id}`);
  if ($("#detailDialog").open) renderDetail();
  if ($("#eventDialog").open) renderFormFeed();
});
async function sendPhotoComment() {
  const body = $("#pvInput").value.trim();
  if (!body) return;
  const p = feedPhotos()[viewerIndex];
  try {
    await api(`/api/photos/${p.id}/comments`, { method: "POST", body: { body } });
    $("#pvInput").value = "";
    renderPhotoComments(await api(`/api/photos/${p.id}/comments`));
  } catch (e) { toast(t("send_failed", { error: e.message })); }
}
$("#pvSendBtn").onclick = sendPhotoComment;
enterToSend($("#pvInput"), sendPhotoComment);
$("#pvComments").addEventListener("click", async (ev) => {
  const id = ev.target.dataset.commentDel;
  if (!id || !(await askConfirm(t("delete_comment_confirm"), t("delete")))) return;
  await api(`/api/comments/${id}`, { method: "DELETE" });
  showPhoto();
});
$("#pvDelete").onclick = async () => {
  const p = feedPhotos()[viewerIndex];
  if (!(await askConfirm(t("delete_photo_confirm"), t("delete")))) return;
  await api(`/api/photos/${p.id}`, { method: "DELETE" });
  $("#photoViewer").close();
  loadMonth();
};

// ---------- 新增 / 编辑行程 ----------
let editing = null;
const eventForm = $("#eventForm");
const NEW_MEMBER = "__new";
function fillMemberSelect() {
  const keep = eventForm.member_id.value;
  eventForm.member_id.innerHTML = `<option value="">${esc(t("member_none"))}</option>`
    + state.members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("")
    + `<option value="${NEW_MEMBER}">${esc(t("member_new_opt"))}</option>`;
  if (keep) eventForm.member_id.value = keep;
}
function renderLabelPicker(selected) {
  // 和「标签」页一样的顺序；有取名字的显示名字，没有就空白
  const opts = [["", t("label_none"), "transparent", true], ...orderedLabels().map(([id, l]) => [id, state.labelNames?.[id] || "", l.hex, false])];
  $("#labelPicker").setAttribute("aria-label", t("f_label"));
  $("#labelPicker").innerHTML = opts.map(([id, name, hex, isNone]) => `
    <button type="button" role="radio" aria-checked="${String(id) === String(selected ?? "")}" data-label="${id}" title="${esc(name || labelName(id) || "")}" aria-label="${esc(name || labelName(id) || "")}" class="lp-item">
      <span class="swatch ${isNone ? "none" : ""}" style="--c:${hex}">${isNone ? "∅" : ""}</span>
      <span class="lp-name">${esc(isNone ? name : name)}</span></button>`).join("");
}
$("#labelPicker").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-label]");
  if (b) $("#labelPicker").querySelectorAll("[data-label]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
});
const selectedLabel = () => $("#labelPicker [aria-checked=true]")?.dataset.label || null;

function setAllDay(on) {
  for (const name of ["start", "end"]) {
    const input = eventForm[name], v = input.value;
    if (v) input.value = on ? v.slice(0, 10) : (v.length === 10 ? `${v}T${name === "start" ? "10:00" : "11:00"}` : v);
  }
  fillDateTime();
}

// 日期 + 时间：点一下就选好（日期框 + 12 小时制时间选单，每 15 分钟）
const TIME_OPTS = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);
const timeLabel = (hm) => { const [h, m] = hm.split(":").map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString(timeLocale(), { hour: "numeric", minute: "2-digit", hour12: true }); };
function fillTimeSelect(sel, value) {
  const opts = value && !TIME_OPTS.includes(value) ? [...TIME_OPTS, value].sort() : TIME_OPTS; // 例如 4:43 PM 也保留
  sel.innerHTML = opts.map((v) => `<option value="${v}">${esc(timeLabel(v))}</option>`).join("");
  if (value) sel.value = value;
}
function fillDateTime() { // 隐藏栏位（start / end）→ 看得到的日期、时间
  const allDay = eventForm.all_day.checked;
  for (const [name, d, tm] of [["start", "#startDate", "#startTime"], ["end", "#endDate", "#endTime"]]) {
    const v = eventForm[name].value;
    $(d).value = v ? v.slice(0, 10) : "";
    fillTimeSelect($(tm), v && v.length > 10 ? v.slice(11, 16) : name === "start" ? "10:00" : "11:00");
    $(tm).hidden = allDay;
  }
}
function readDateTime(changed) { // 看得到的日期、时间 → 隐藏栏位
  const allDay = eventForm.all_day.checked;
  const val = (d, tm) => ($(d).value ? (allDay ? $(d).value : `${$(d).value}T${$(tm).value}`) : "");
  eventForm.start.value = val("#startDate", "#startTime");
  eventForm.end.value = val("#endDate", "#endTime");
  // 改了开始、结束却比开始早 → 结束自动改成开始后 1 小时（全天：同一天）
  if (changed === "start" && eventForm.end.value && eventForm.end.value < eventForm.start.value) {
    if (allDay) eventForm.end.value = eventForm.start.value;
    else { const d = new Date(eventForm.start.value); d.setHours(d.getHours() + 1); eventForm.end.value = toLocalInput(d.toISOString()); }
    fillDateTime();
  }
}
["#startDate", "#startTime"].forEach((s) => $(s).addEventListener("change", () => readDateTime("start")));
["#endDate", "#endTime"].forEach((s) => $(s).addEventListener("change", () => readDateTime("end")));
$("#allDayCheck").addEventListener("change", (ev) => setAllDay(ev.target.checked));

// 编辑表单里的「留言 / 照片」：已有行程 → 马上发出；新行程 → 按「保存」时一起发出
let formFiles = [];
function renderFormFeed() {
  const feed = editing && current && current.id === editing.id ? current.feed || [] : [];
  $("#formFeed").hidden = !editing;
  if (editing) renderFeedInto($("#formFeed"), feed);
  $("#formChatSend").hidden = !editing;
  $("#formChatHint").textContent = editing ? t("posting_as", { name: myName() }) : t("f_chat_hint_new");
}
$("#formPhotos").addEventListener("change", (ev) => { formFiles = [...formFiles, ...ev.target.files].slice(0, 10); ev.target.value = ""; $("#formPreview").innerHTML = thumbs(formFiles); });
$("#formPreview").addEventListener("click", (ev) => { const i = ev.target.dataset.rm; if (i !== undefined) { formFiles.splice(Number(i), 1); $("#formPreview").innerHTML = thumbs(formFiles); } });
async function sendFormChat() {
  if (!editing) return;
  const text = $("#formChatInput").value.trim();
  if (!text && !formFiles.length) return;
  const btn = $("#formChatSend");
  btn.disabled = true; btn.textContent = formFiles.length ? t("uploading") : t("sending");
  try {
    current = await postToEvent(editing.id, text, formFiles);
    $("#formChatInput").value = ""; formFiles = []; $("#formPreview").innerHTML = "";
    renderFormFeed();
    $("#formFeed").lastElementChild?.scrollIntoView({ block: "nearest" });
    loadMonth();
  } catch (e) { toast(t("send_failed", { error: e.message })); }
  btn.disabled = false; btn.textContent = t("send");
}
$("#formChatSend").onclick = sendFormChat;
$("#formChatInput").addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); if (editing) sendFormChat(); }
});

function openEditor(e, day, hour) {
  editing = e || null;
  formFiles = []; $("#formPreview").innerHTML = "";
  eventForm.reset();
  fillMemberSelect();
  $("#newMemberRow").hidden = true;
  $("#fCustomerNotReady").hidden = !!state.config?.whatsapp;
  $(".customer-box").hidden = !state.me?.can_whatsapp; // 只有管理员允许的帐号可以设定
  if (state.me?.can_whatsapp) loadWaUsage();
  $("#eventDialogTitle").textContent = e ? t("edit_event") : t("new_event");
  eventForm.all_day.checked = !!e?.all_day;
  if (e) {
    eventForm.title.value = e.title;
    eventForm.start.value = e.all_day ? toLocalInput(e.start).slice(0, 10) : toLocalInput(e.start);
    eventForm.end.value = e.end ? (e.all_day ? toLocalInput(e.end).slice(0, 10) : toLocalInput(e.end)) : "";
    eventForm.member_id.value = e.member_id ?? "";
    eventForm.remind.checked = !!e.remind;
    eventForm.notes.value = e.notes ?? "";
    eventForm.customer_phone.value = e.customer_phone ?? "";
    eventForm.customer_name.value = e.customer_name ?? "";
    eventForm.amount_total.value = e.amount_total ?? "";
    eventForm.amount_paid.value = e.amount_paid ?? "";
    eventForm.customer_note.value = e.customer_note ?? "";
    eventForm.customer_auto.checked = e.customer_auto !== 0;
  } else {
    const d = new Date(day || new Date()); d.setHours(hour ?? 10, 0, 0, 0);
    eventForm.start.value = toLocalInput(d.toISOString());
    eventForm.remind.checked = true;
    eventForm.customer_auto.checked = true;
    eventForm.customer_note.value = state.config?.waDefault || ""; // 新行程：先放默认讯息（可以改）
  }
  fillDateTime();
  $("#titleEmojis").hidden = true;
  fillStageSelect(eventForm.stage, e?.stage || "booked");
  if (!e) { eventForm.amount_total.value = ""; eventForm.amount_paid.value = ""; }
  renderLabelPicker(e?.label);
  $("#formChatInput").value = "";
  renderFormFeed();
  $("#eventDialog").showModal();
  // 每次打开都从最上面（标题）开始，不停在上次卷到的位置
  const top = () => { $("#eventDialog").scrollTop = 0; eventForm.scrollTop = 0; };
  top(); requestAnimationFrame(top); setTimeout(top, 80);
  eventForm.title.focus({ preventScroll: true });
}
eventForm.member_id.addEventListener("change", () => {
  const isNew = eventForm.member_id.value === NEW_MEMBER;
  $("#newMemberRow").hidden = !isNew;
  if (isNew) { $("#newMemberName").value = ""; $("#newMemberName").focus(); }
});
$("#newMemberCancel").onclick = () => { $("#newMemberRow").hidden = true; eventForm.member_id.value = ""; };
$("#newMemberAdd").onclick = async () => {
  const name = $("#newMemberName").value.trim();
  if (!name) { toast(t("enter_name")); return; }
  try {
    const m = await api("/api/members", { method: "POST", body: { name } });
    state.members = await api("/api/members");
    eventForm.member_id.value = "";
    fillMemberSelect();
    eventForm.member_id.value = String(m.id);
    $("#newMemberRow").hidden = true;
    toast(t("member_added", { name: m.name }));
  } catch (e) { toast(t("add_failed", { error: e.message })); }
};
$("#newMemberName").addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); $("#newMemberAdd").click(); } });

// 标题加 emoji：点 😀 打开选单，点一个就插进游标位置
const TITLE_EMOJIS = ["‼️", "❗", "❓", "💲", "💵", "💸", "📸", "🎥", "👰", "🤵", "💍", "👗", "💄", "💐", "🎂", "🎉", "🎁", "❤️", "🍽️", "☕", "🍱", "🛍️", "✈️", "🚗", "🏖️", "🏠",
  "💼", "📞", "💻", "📝", "📅", "⏰", "✅", "⚠️", "⭐", "🔥", "💰", "🏥", "💊", "🏃", "⚽", "🎵", "📚", "🐶", "🐱", "😊"];
$("#titleEmojis").innerHTML = TITLE_EMOJIS.map((e) => `<button type="button" data-emo="${e}">${e}</button>`).join("");
$("#titleEmojiBtn").onclick = () => { $("#titleEmojis").hidden = !$("#titleEmojis").hidden; };
$("#titleEmojis").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-emo]");
  if (!b) return;
  const inp = $("#titleInput"), e = b.dataset.emo;
  const s = inp.selectionStart ?? inp.value.length, en = inp.selectionEnd ?? s;
  inp.value = inp.value.slice(0, s) + e + inp.value.slice(en);
  inp.focus({ preventScroll: true });
  inp.setSelectionRange(s + e.length, s + e.length);
});
let savingEvent = false;
eventForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (savingEvent) return; // 已经在保存 → 不要再建立一次（避免重复）
  const f = eventForm;
  if (f.member_id.value === NEW_MEMBER) { toast(t("pick_member_first")); return; }
  readDateTime();
  if (!f.start.value) { toast(t("save_failed", { error: t("f_start") })); $("#startDate").focus(); return; }
  const allDay = f.all_day.checked;
  const toIso = (v, endOfDay) => (!v ? null : allDay ? new Date(`${v}T${endOfDay ? "23:59" : "00:00"}`).toISOString() : fromLocalInput(v));
  const body = {
    title: f.title.value.trim(), all_day: allDay,
    start: toIso(f.start.value, false), end: toIso(f.end.value, true),
    member_id: f.member_id.value ? Number(f.member_id.value) : null,
    label: selectedLabel(), remind: f.remind.checked, notes: f.notes.value.trim() || null,
    customer_phone: f.customer_phone.value.trim() || null, customer_note: f.customer_note.value.trim() || null,
    customer_name: f.customer_name.value.trim() || null,
    stage: f.stage.value || "booked",
    amount_total: f.amount_total.value === "" ? null : Number(f.amount_total.value),
    amount_paid: f.amount_paid.value === "" ? null : Number(f.amount_paid.value),
    customer_auto: f.customer_auto.checked,
  };
  const saveBtn = eventForm.querySelector('button[type="submit"]');
  const saveText = saveBtn.textContent;
  savingEvent = true; saveBtn.disabled = true; saveBtn.textContent = t("saving"); saveBtn.classList.add("busy");
  try {
    const saved = editing
      ? await api(`/api/events/${editing.id}`, { method: "PATCH", body })
      : await api("/api/events", { method: "POST", body });
    // 表单里写好、还没发出的留言和照片，一起发出
    const pendingText = $("#formChatInput").value.trim();
    if (pendingText || formFiles.length) {
      await postToEvent(saved.id, pendingText, formFiles);
      $("#formChatInput").value = ""; formFiles = []; $("#formPreview").innerHTML = "";
    }
    $("#eventDialog").close();
    state.selected = new Date(body.start);
    state.month = new Date(state.selected.getFullYear(), state.selected.getMonth(), 1);
    await loadMonth();
    toast(t("saved"));
    openDetail(saved.id);
  } catch (e) { toast(t("save_failed", { error: e.message })); }
  finally { savingEvent = false; saveBtn.disabled = false; saveBtn.textContent = saveText; saveBtn.classList.remove("busy"); }
});
$("#cancelEventBtn").onclick = () => $("#eventDialog").close();

// ---------- 成员 ----------
let editingMember = null;
const memberForm = $("#memberForm");
// 颜色标签：每个颜色可以取名字（所有人共用）
function renderLabels() {
  $("#labelList").innerHTML = orderedLabels().map(([id, l]) => `
    <li><span class="label-swatch" style="background:${esc(l.hex)}"></span>
      <span class="label-base">${esc(t(`label_${id}`))}</span>
      <input data-label-id="${id}" class="${state.labelNames[id] ? "named" : ""}" style="--c:${esc(l.hex)}" value="${esc(state.labelNames[id] || "")}" placeholder="${esc(t(`label_ex_${id}`))}" maxlength="30" /></li>`).join("");
}
// 打字时马上变色：有名字 → 填上标签颜色、粗体
$("#labelList").addEventListener("input", (ev) => {
  const inp = ev.target.closest("[data-label-id]");
  if (inp) inp.classList.toggle("named", !!inp.value.trim());
});
$("#labelList").addEventListener("change", async (ev) => {
  const inp = ev.target.closest("[data-label-id]");
  if (!inp) return;
  try {
    const r = await api(`/api/labels/${inp.dataset.labelId}`, { method: "PUT", body: { name: inp.value } });
    state.labelNames = r.labelNames || {};
    toast(t("label_saved"));
    renderMonth();
  } catch (e) { toast(t("save_failed", { error: e.message })); }
});

// 可爱 / 搞笑的头像
const EMOJIS = ["🐱", "🐶", "🐼", "🐨", "🐰", "🦊", "🐻", "🐷", "🐸", "🐵", "🙈", "🐥", "🐧", "🦄", "🦖", "🐙", "🐳", "🦋", "🐝", "🐞",
  "🌸", "🌈", "⭐", "🍓", "🍑", "🍩", "🧁", "🍦", "🎀", "🎈", "👻", "🤡", "💩", "🤪", "😜", "😎", "🥳", "🤠", "🤓", "😴", "🤖", "👽", "👑", "💖"];
function renderEmojiPicker(selected) {
  memberForm.emoji.value = selected || "";
  $("#emojiCustom").value = selected && !EMOJIS.includes(selected) ? selected : "";
  $("#emojiPicker").innerHTML = EMOJIS.map((e) => [e, e]).map(([v, txt]) =>
    `<button type="button" role="radio" data-emoji="${esc(v)}" aria-checked="${String((selected || "") === v)}" class="${v ? "" : "none"}">${esc(txt)}</button>`).join("");
}
$("#emojiPicker").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-emoji]");
  if (!b) return;
  memberForm.emoji.value = b.dataset.emoji;
  $("#emojiCustom").value = "";
  $("#emojiPicker").querySelectorAll("[data-emoji]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
});
$("#emojiCustom").addEventListener("input", () => {
  const v = $("#emojiCustom").value.trim();
  memberForm.emoji.value = v;
  $("#emojiPicker").querySelectorAll("[data-emoji]").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.emoji === v)));
});

async function renderMembers() {
  renderLabels();
  state.members = await api("/api/members");
  $("#memberList").innerHTML = state.members.length ? state.members.map((m) => `
    <li class="item" data-id="${m.id}">${avatar(m.name)}<div class="main"><div class="t">${esc(m.name)}</div></div></li>`).join("")
    : `<li class="empty">${esc(t("members_empty"))}</li>`;
}
$("#memberList").addEventListener("click", (ev) => {
  const li = ev.target.closest(".item");
  if (li) openMember(state.members.find((m) => m.id === Number(li.dataset.id)));
});
$("#addMemberBtn").onclick = () => openMember(null);
function openMember(m) {
  editingMember = m;
  memberForm.reset();
  $("#memberDialogTitle").textContent = m ? t("edit_member") : t("new_member");
  memberForm.name.value = m?.name ?? "";
  memberForm.color.value = m?.color || ["#e8a33d", "#e07a5f", "#3d85c6", "#b565a7", "#e0a100", "#2a9d8f", "#d1495b", "#6c757d"][state.members.length % 8];
  // 新的人：先帮他选一个还没人用的 emoji（可以改）
  const used = new Set(state.members.map((x) => x.emoji));
  const free = EMOJIS.filter((e) => !used.has(e));
  renderEmojiPicker(m?.emoji || (free.length ? free : EMOJIS)[Math.floor(Math.random() * (free.length || EMOJIS.length))]);
  $("#deleteMemberBtn").hidden = !m;
  $("#memberDialog").showModal();
}
memberForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const body = { name: memberForm.name.value.trim(), color: memberForm.color.value, emoji: memberForm.emoji.value || null };
  try {
    if (editingMember) await api(`/api/members/${editingMember.id}`, { method: "PATCH", body });
    else await api("/api/members", { method: "POST", body });
    $("#memberDialog").close();
    await renderMembers();
    loadMonth();
  } catch (e) { toast(t("save_failed", { error: e.message })); }
});
$("#cancelMemberBtn").onclick = () => $("#memberDialog").close();
$("#deleteMemberBtn").onclick = async () => {
  if (!(await askConfirm(t("delete_member_confirm", { name: editingMember.name }), t("delete")))) return;
  await api(`/api/members/${editingMember.id}`, { method: "DELETE" });
  $("#memberDialog").close();
  await renderMembers();
  loadMonth();
};

// ---------- 设置 ----------
async function renderSettings() {
  try {
    const [me, set] = await Promise.all([api("/api/auth/me"), api("/api/settings")]);
    state.me = me;
    $("#acctEmail").textContent = me.email;
    if (document.activeElement !== $("#acctName")) $("#acctName").value = me.name;
    if (document.activeElement !== $("#tzInput")) $("#tzInput").value = set.timezone;
    $("#icsUrl").value = set.icsUrl;
    $("#gRedirectUri").textContent = state.config.googleRedirectUri || `${location.origin}/api/google/callback`;
    const ready = !!state.config.googleLoginReady;
    renderCalCard();
    $("#gConnected").hidden = !me.google;
    $("#calList").hidden = !me.google;
    if (me.google) loadCalList();
    $("#gConnectForm").hidden = !!me.google;          // 没连接时一定显示：填 Gmail → 连接
    $("#gSetup").hidden = !!me.google || ready;
    $("#gExplain").hidden = !!me.google;               // 已连接就不显示长说明        // 管理员还没设定时，下面显示设定步骤
    if (!$("#gGmail").value) $("#gGmail").value = me.email;
    const st = $("#gStatus");
    st.classList.remove("ok", "warn");
    if (me.google) { st.textContent = t("g_status_connected", { gmail: me.google.gmail, cal: me.google.calendarName || "Google" }); st.classList.add("ok"); }
    else st.textContent = ready ? t("g_status_ready") : t("g_status_notready");
  } catch (e) { if (token()) toast(t("load_failed", { error: e.message })); }
}
$("#gConnectForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const gmail = $("#gGmail").value.trim();
  if (!EMAIL_RE.test(gmail)) { toast(t("err_email")); return; }
  if (!state.config.googleLoginReady) { toast(t("g_not_ready_click")); $("#gSetup").open = true; $("#gSetup").scrollIntoView({ block: "center" }); return; }
  try { const r = await api("/api/google/connect", { method: "POST", body: { gmail } }); location.href = r.url; }
  catch (e) { toast(e.message); }
});
// ---------- 选择要双向同步的 Google 日历 ----------
// WhatsApp 这个月用了几则（让大家知道免费方案还剩多少）
// WhatsApp 卡片（在 WhatsApp Schedule 页签）：状态、用量、管理员设定
function renderWaCard() {
  const me = state.me || {};
  $("#waStatus").textContent = state.config?.whatsapp ? t("wa_ready") : "";
  $("#waStatus").hidden = !state.config?.whatsapp; // 还没设定时不显示说明
  $("#waNoAccess").hidden = !!me.can_whatsapp;
  $("#waAdmin").hidden = !me.admin;
  if (me.admin) { loadWaUsers(); loadAdmins(); }
  loadWaUsage();
}
async function loadWaUsage() {
  if (!state.config?.whatsapp) { $("#waUsage").textContent = ""; $("#fWaUsage").textContent = ""; return; }
  try {
    const u = await api("/api/whatsapp/usage");
    const text = u.full ? t("wa_usage_full", { limit: u.limit })
      : u.limit ? t("wa_usage", { sent: u.sent, limit: u.limit, left: u.limit - u.sent })
      : t("wa_usage_nolimit", { sent: u.sent });
    for (const el of [$("#waUsage"), $("#fWaUsage")]) { el.textContent = text; el.classList.toggle("warn", !!u.full); }
    if (document.activeElement !== $("#waLimit")) $("#waLimit").value = u.limit ?? "";
  } catch {}
}
$("#waLimitSave").onclick = async () => {
  const btn = $("#waLimitSave"); btn.disabled = true;
  try { await api("/api/admin/wa-limit", { method: "PUT", body: { limit: Number($("#waLimit").value) || 0 } }); toast(t("saved")); await loadWaUsage(); }
  catch (e) { toast(e.message); }
  btn.disabled = false;
};

// 管理员：勾选哪些帐号可以发 WhatsApp 给客户
async function loadWaUsers() {
  const ul = $("#waUsers");
  try {
    const users = await api("/api/admin/users");
    ul.innerHTML = users.map((u) => `<li><label class="check"><input type="checkbox" data-wa-user="${u.id}" ${u.can_whatsapp ? "checked" : ""} ${u.admin ? "disabled" : ""} />
      <span><b>${esc(u.name)}</b> <span class="muted">${esc(u.email)}${u.admin ? " · " + esc(t("wa_admin_label")) : ""}</span></span></label></li>`).join("");
  } catch (e) { ul.innerHTML = `<li class="warn">${esc(e.message)}</li>`; }
}
$("#waUsers").addEventListener("change", async (ev) => {
  const box = ev.target.closest("[data-wa-user]");
  if (!box) return;
  box.disabled = true;
  try { await api(`/api/admin/users/${box.dataset.waUser}`, { method: "PATCH", body: { can_whatsapp: box.checked } }); toast(t("saved")); }
  catch (e) { box.checked = !box.checked; toast(e.message); }
  box.disabled = false;
});

// 外观：浅色 / 深色 / 跟随手机（只存在这台装置）
(() => {
  const sel = $("#themeSelect");
  let cur = "light";
  try { cur = localStorage.getItem("theme") || "light"; } catch {}
  sel.value = cur;
  sel.addEventListener("change", () => {
    try { localStorage.setItem("theme", sel.value); } catch {}
    if (sel.value === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", sel.value);
  });
})();

// ---------- 这星期：摘要 + 任务清单 ----------
state.weekOffset = 0;      // 0 = 这星期，1 = 下星期，-1 = 上星期
state.weekFilter = null;   // { kind: "member" | "label", id }
function weekStart(offset) { // 星期一开始
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return d;
}
async function renderWeek() { loadSchedule(); }
async function renderWeekOld() {
  const start = weekStart(state.weekOffset), end = new Date(start); end.setDate(end.getDate() + 7);
  const fmt = (d) => d.toLocaleDateString(locale(), { day: "numeric", month: "short" });
  const last = new Date(end); last.setDate(last.getDate() - 1);
  const name = state.weekOffset === 0 ? t("wk_this") : state.weekOffset === 1 ? t("wk_next") : state.weekOffset === -1 ? t("wk_last") : "";
  $("#weekRange").innerHTML = `${name ? `<b>${esc(name)}</b>` : ""}<span>${esc(fmt(start))} – ${esc(fmt(last))}</span>`;
  let evs = [];
  try { evs = await api(`/api/events?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`); }
  catch (e) { $("#weekDays").innerHTML = `<p class="hint warn">${esc(e.message)}</p>`; return; }
  state.weekEvents = evs;
  // 摘要：总数、完成几个、每个标签几个
  const done = evs.filter((e) => e.done_at).length;
  const byLabel = {};
  for (const e of evs) if (e.label) byLabel[e.label] = (byLabel[e.label] || 0) + 1;
  const pct = evs.length ? Math.round((done / evs.length) * 100) : 0;
  $("#weekSummary").innerHTML = evs.length ? `
    <div class="wk-stats"><b>${esc(t("wk_events", { n: evs.length }))}</b><span>${esc(t("wk_done", { done, n: evs.length }))}</span></div>
    <div class="wk-progress"><span style="width:${pct}%"></span></div>
    <div class="wk-labels">${orderedLabels().filter(([id]) => byLabel[id]).map(([id, l]) =>
      `<span class="chip" style="--c:${esc(l.hex)}">${esc(labelName(id))} · ${byLabel[id]}</span>`).join("")}</div>`
    : `<p class="hint">${esc(t("wk_nothing"))}</p>`;
  // 筛选：全部 / 某个人 / 某个标签
  const people = [...new Map(evs.filter((e) => e.member_id).map((e) => [e.member_id, e])).values()];
  const f = state.weekFilter;
  const chip = (kind, id, html) => `<button type="button" class="wk-filter" data-kind="${kind}" data-id="${esc(id)}" aria-pressed="${String(kind === "all" ? !f : f?.kind === kind && String(f.id) === String(id))}">${html}</button>`;
  $("#weekFilters").innerHTML = evs.length ? chip("all", "", esc(t("wk_all")))
    + people.map((e) => chip("member", e.member_id, esc(`${e.member_emoji || ""} ${e.member_name}`.trim()))).join("")
    + orderedLabels().filter(([id]) => byLabel[id]).map(([id, l]) => chip("label", id, `<span class="dot" style="background:${esc(l.hex)}"></span>${esc(labelName(id))}`)).join("") : "";
  const shown = evs.filter((e) => !f || (f.kind === "member" ? String(e.member_id) === String(f.id) : String(e.label) === String(f.id)));
  // 每一天
  const todayK = dayKey(new Date());
  let html = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const k = dayKey(d), list = shown.filter((e) => dayKey(new Date(e.start)) === k);
    html += `<section class="wk-day${k === todayK ? " today" : ""}${d.getDay() === 0 ? " sun" : d.getDay() === 6 ? " sat" : ""}">
      <h4>${esc(d.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "short" }))}</h4>
      ${list.length ? `<ul>${list.map((e) => `
        <li class="wk-item tinted${e.color ? " lbl" : ""}${e.done_at ? " done" : ""}" data-id="${e.id}" style="--c:${esc(eventColor(e))}">
          <label class="wk-check"><input type="checkbox" data-done="${e.id}" ${e.done_at ? "checked" : ""} /><span></span></label>
          <span class="bar" style="background:${esc(eventColor(e))}"></span>
          <div class="wk-main"><div class="t">${esc(e.title)}</div>
            <div class="s">${e.all_day ? esc(t("all_day")) : fmtTime(e.start) + (e.end ? " – " + fmtTime(e.end) : "")}${e.member_name ? " · " + esc((e.member_emoji ? e.member_emoji + " " : "") + e.member_name) : ""}${e.label ? " · " + esc(labelName(e.label)) : ""}</div></div>
        </li>`).join("")}</ul>` : `<p class="wk-empty">${esc(t("wk_empty_day"))}</p>`}
    </section>`;
  }
  $("#weekDays").innerHTML = html;
  renderWeekWa(evs);
  $("#waAuto").hidden = !state.me?.admin;
  if (state.me?.admin && !waAutoLoaded) loadWaAuto();
  renderWaCard();
}

// ---------- WhatsApp 提醒：前一天几点发 + 讯息（所有行程一样） ----------
$("#scHour").innerHTML = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${esc(timeLabel(`${pad(h)}:00`))}</option>`).join("");
async function loadSchedule() {
  try {
    const d = await api("/api/schedule");
    $("#scHour").value = String(d.sendHour);
    if (document.activeElement !== $("#scText")) $("#scText").value = d.text || "";
    $("#scWeekly").textContent = d.weeklyAt ? t("sc_weekly", { time: fmtDateTime(d.weeklyAt) }) : "";
  } catch (e) { toast(e.message); }
  loadMissing();
}
// 明天要提醒的客户：按 WhatsApp → 打开 WhatsApp，电话和讯息都填好了，按「发送」就好（不用 Meta 注册）
const waSentKey = (id) => `waSent:${id}:${dayKey(new Date())}`;
function renderSendList(all) {
  const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
  const items = all.filter((x) => x.phone && dayKey(new Date(x.start)) === dayKey(tmr));
  $("#scSendBox").hidden = !items.length;
  $("#scSend").innerHTML = items.map((x) => {
    const when = x.all_day ? t("all_day") : fmtTime(x.start);
    const done = store.get(waSentKey(x.id)) === "1";
    const href = `https://wa.me/${encodeURIComponent(x.phone)}?text=${encodeURIComponent(x.message || "")}`;
    return `<li data-id="${x.id}"><div class="sc-ev"><b>${esc(x.booking)}</b> <span class="muted">${esc(when)}</span>${x.name ? ` · ${esc(x.name)}` : ""}
        <div class="s">📞 ${esc(x.phone)}</div></div>
      <div class="sc-row"><a class="btn ${done ? "" : "primary "}small sc-wa" href="${esc(href)}" target="_blank" rel="noopener" data-wa-id="${x.id}">${esc(done ? t("sc_wa_again") : t("sc_wa_send"))}</a>${done ? `<span class="muted">✅ ${esc(t("sc_wa_done"))}</span>` : ""}</div></li>`;
  }).join("");
}
$("#scSend").addEventListener("click", (ev) => {
  const a = ev.target.closest("[data-wa-id]");
  if (!a) return;
  store.set(waSentKey(a.dataset.waId), "1"); // 记住按过了（只在这台机器）
  setTimeout(loadMissing, 500);
});
// 通讯录找不到电话（或有多个联络人、发送失败）的行程：在这里直接输入电话
async function loadMissing() {
  let all = [];
  try { all = await api("/api/schedule/list"); } catch {}
  renderSendList(all);
  const items = all.filter((x) => ["notfound", "multiple", "failed"].includes(x.status));
  $("#scMissingBox").hidden = !items.length;
  $("#scMissing").innerHTML = items.map((x) => {
    const when = x.all_day ? new Date(x.start).toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" }) : fmtDateTime(x.start);
    const why = x.status === "multiple" ? t("sc_why_multiple", { names: x.contacts || "" }) : x.status === "failed" ? t("sc_why_failed", { error: x.error || "" }) : "";
    return `<li data-id="${x.id}">
      <div class="sc-ev"><b>${esc(x.booking)}</b> <span class="muted">${esc(when)}</span><div class="s">${esc(x.title)}</div>${why ? `<div class="s warn">${esc(why)}</div>` : ""}</div>
      <div class="sc-row"><input type="tel" inputmode="tel" autocomplete="off" placeholder="+65 9123 4567 / 012-345 6789" value="${esc(x.phone || "")}" />
        <button type="button" class="btn primary small" data-sc-phone="${x.id}">${esc(t("save"))}</button></div></li>`;
  }).join("");
}
$("#scMissing").addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-sc-phone]");
  if (!btn) return;
  const phone = btn.closest("li").querySelector("input").value.trim();
  if (!phone) return;
  btn.disabled = true;
  try { await api("/api/schedule/phone", { method: "POST", body: { id: Number(btn.dataset.scPhone), phone } }); toast(t("saved")); await loadMissing(); }
  catch (e) { toast(e.message); btn.disabled = false; }
});
async function saveSchedule(body, btn) {
  btn.disabled = true;
  try {
    await api("/api/schedule", { method: "PUT", body });
    if (body.sendHour !== undefined && state.config) state.config.waSendHour = body.sendHour;
    toast(t("saved"));
  } catch (e) { toast(t("save_failed", { error: e.message })); }
  btn.disabled = false;
}
$("#scHourSave").onclick = () => saveSchedule({ sendHour: Number($("#scHour").value) }, $("#scHourSave"));
$("#scTextSave").onclick = () => saveSchedule({ text: $("#scText").value }, $("#scTextSave"));
// 测试：把（已保存的）讯息发到这个电话
$("#scTestSend").onclick = async () => {
  const btn = $("#scTestSend"), phone = $("#scTestPhone").value.trim();
  if (!phone) { $("#scTestPhone").focus(); return; }
  btn.disabled = true;
  try { const r = await api("/api/schedule/test", { method: "POST", body: { phone } }); toast(t("sc_test_ok", { to: r.to })); }
  catch (e) { toast(e.message); }
  btn.disabled = false;
};
// 这星期的 WhatsApp 客户讯息：谁、什么时候发、发了没有
function renderWeekWa(evs) {
  const box = $("#weekWa");
  const list = evs.filter((e) => e.customer_phone && e.customer_note && !e.customer_hidden);
  box.hidden = !state.me?.can_whatsapp;
  if (box.hidden) return;
  const sendAt = (e) => { if (e.customer_send_at) return new Date(e.customer_send_at); const d = new Date(e.start); d.setDate(d.getDate() - 1); d.setHours(sendHour(), 0, 0, 0); return d; }; // 自己选的，或前一天下午 2 点（设定）
  const status = (e) => {
    if (e.customer_sent_at) return ["sent", t("ww_sent", { time: fmtDateTime(e.customer_sent_at) })];
    if (e.customer_error) return ["fail", t("ww_failed")];
    if (e.customer_auto === 0) return ["off", t("ww_off")];
    if (sendAt(e) < new Date()) return ["off", t("ww_missed")];
    return ["wait", t("ww_will", { time: fmtDateTime(sendAt(e).toISOString()) })];
  };
  box.innerHTML = `<h3>${esc(t("ww_title"))}</h3>` + (list.length ? `<ul>${list.map((e) => {
    const [cls, txt] = status(e);
    return `<li class="ww-item" data-id="${e.id}">
      <div class="ww-main"><b>${esc(e.customer_name || e.customer_phone)}</b>${e.customer_name ? ` <span class="muted">${esc(e.customer_phone)}</span>` : ""}
        <div class="s">${esc(e.title)} · ${esc(new Date(e.start).toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" }))}</div>
        <div class="ww-note">${esc(e.customer_note)}</div></div>
      <div class="ww-side"><span class="ww-status ${cls}">${esc(txt)}</span>
        ${e.customer_sent_at ? `<button type="button" class="del-btn ww-del" data-wa-hide="${e.id}">${esc(t("delete"))}</button>` : ""}</div></li>`;
  }).join("")}</ul>` : `<p class="hint">${esc(t("ww_none"))}</p>`);
}
$("#weekWa").addEventListener("click", async (ev) => {
  const del = ev.target.closest("[data-wa-hide]");
  if (del) { // 已发送 → 从清单删掉（行程保留）
    ev.stopPropagation();
    if (!(await askConfirm(t("ww_del_confirm"), t("delete")))) return;
    try { await api(`/api/events/${del.dataset.waHide}/wa-hide`, { method: "POST", body: {} }); renderWeek(); } catch (e) { toast(e.message); }
    return;
  }
  const li = ev.target.closest(".ww-item"); if (li) openDetail(Number(li.dataset.id));
});
$("#weekPrev").onclick = () => { state.weekOffset--; renderWeek(); };
$("#weekNext").onclick = () => { state.weekOffset++; renderWeek(); };
$("#weekFilters").addEventListener("click", (ev) => {
  const b = ev.target.closest(".wk-filter");
  if (!b) return;
  state.weekFilter = b.dataset.kind === "all" ? null : { kind: b.dataset.kind, id: b.dataset.id };
  renderWeek();
});
$("#weekDays").addEventListener("click", async (ev) => {
  const box = ev.target.closest("[data-done]");
  if (box) {
    ev.stopPropagation();
    const li = box.closest(".wk-item"), done = box.checked;
    li.classList.toggle("done", done); // 马上显示，背景再存
    try {
      await api(`/api/events/${box.dataset.done}/done`, { method: "POST", body: { done } });
      toast(t(done ? "wk_done_toast" : "wk_undone_toast"));
      renderWeek();
    } catch (e) { box.checked = !done; li.classList.toggle("done", !done); toast(e.message); }
    return;
  }
  if (ev.target.closest(".wk-check")) return;
  const li = ev.target.closest(".wk-item");
  if (li) openDetail(Number(li.dataset.id));
});

// ---------- 管理员名单（管理员可以加别的 Gmail 当管理员） ----------
async function loadAdmins() {
  try {
    const a = await api("/api/admin/admins");
    $("#admEmails").value = (a.extra || []).join(", ");
  } catch {}
}
$("#admSave").onclick = async () => {
  try {
    const a = await api("/api/admin/admins", { method: "PUT", body: { emails: $("#admEmails").value } });
    $("#admEmails").value = (a.extra || []).join(", ");
    loadWaUsers();
  } catch (e) { toast(t("save_failed", { error: e.message })); }
};

// ---------- WhatsApp 自动化设定（这星期页签，管理员）：填好 → 预览 → 一个「保存」 ----------
let waAutoLoaded = false;
$("#dgHour").innerHTML = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${esc(timeLabel(`${pad(h)}:00`))}</option>`).join("");
async function loadWaAuto() {
  waAutoLoaded = true;
  try {
    const [d, w] = await Promise.all([api("/api/digest"), api("/api/admin/wa-text")]);
    $("#dgDate").value = d.mode === "date" ? d.date || "" : "";
    $("#dgHour").value = String(d.hour ?? 8);
    $("#dgPhones").value = (d.phones || []).join(", ");
    $("#wtText").value = w.text || "";
    if (!$("#wpDate").value) $("#wpDate").value = dayKey(new Date());
    loadPickEvents();
  } catch (e) { waAutoLoaded = false; $("#dgPreview").textContent = e.message; }
}
const waFlatten = (txt) => String(txt || "").replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean).join(" | ");
// 预览：选日期 → 列出那天的行程
let waPickEvents = [];
async function loadPickEvents() {
  const v = $("#wpDate").value, sel = $("#wpEvent");
  waPickEvents = [];
  if (!v) { sel.innerHTML = `<option value="">${esc(t("wp_pick_date_first"))}</option>`; updateWaPreview(); return; }
  const from = new Date(`${v}T00:00`), to = new Date(from); to.setDate(to.getDate() + 1);
  // 那天有在进行的行程都列出来（包括前几天开始、跨到这天的）
  try { waPickEvents = await api(`/api/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`); } catch {}
  sel.innerHTML = waPickEvents.length
    ? waPickEvents.map((e) => `<option value="${e.id}">${esc((e.all_day ? t("all_day") : dayKey(new Date(e.start)) === v ? fmtTime(e.start) : fmtDateTime(e.start) + " →") + " · " + e.title)}</option>`).join("")
    : `<option value="">${esc(t("wp_none"))}</option>`;
  fillPickCustomer();
  updateWaPreview();
  checkWaRequired(false);
}
$("#wpDate").addEventListener("change", loadPickEvents);
const sendHour = () => state.config?.waSendHour ?? 14; // Schedule Mode：前一天几点发
fillTimeSelect($("#wpSendTime"), `${pad(sendHour())}:00`);
function fillPickCustomer() { // 选了行程：带入它已有的客户名字、电话、发送时间（默认：前一天下午 4 点）
  const ev = waPickEvents.find((x) => String(x.id) === $("#wpEvent").value);
  $("#wpName").value = ev?.customer_name || "";
  $("#wpPhone").value = ev?.customer_phone || "";
  let when = ev?.customer_send_at ? new Date(ev.customer_send_at) : null;
  if (!when && ev) { when = new Date(ev.start); when.setDate(when.getDate() - 1); when.setHours(sendHour(), 0, 0, 0); }
  $("#wpSendDate").value = when ? dayKey(when) : "";
  fillTimeSelect($("#wpSendTime"), when ? `${pad(when.getHours())}:${pad(when.getMinutes())}` : `${pad(sendHour())}:00`);
  updateWhenLabel();
}
function updateWhenLabel() {
  const d = $("#wpSendDate").value, tm = $("#wpSendTime").value;
  $("#wpWhenLabel").textContent = d && tm ? t("wp_when_label", { time: fmtDateTime(new Date(`${d}T${tm}`).toISOString()) }) : t("dg_prev_customer");
}
["#wpSendDate", "#wpSendTime"].forEach((sel) => $(sel).addEventListener("change", () => { updateWhenLabel(); checkWaRequired(true); }));
$("#wpEvent").addEventListener("change", () => { fillPickCustomer(); updateWaPreview(); });
let waPrevTimer = null;
function updateWaPreview() {
  // 给客户：就是这段文字（WhatsApp 会把换行变成「 | 」）
  // WhatsApp 商业讯息不能换行：空行拿掉，每一行用「 | 」接起来（和真正发出去的一样）
  // 预览：保留空行（客户 24 小时内传过讯息时就会这样收到）；下面再显示其他情况的样子
  // 选了日期 + 行程 → 用那个行程的标题（和它自己的客户讯息，没有就用上面写的）
  const ev = (waPickEvents || []).find((x) => String(x.id) === $("#wpEvent").value);
  const title = ev ? ev.title : t("wt_sample_title");
  const msg = $("#wtText").value.replace(/\r/g, "").trim();
  $("#wtPreview").innerHTML = `<b>${esc(title)}</b>` + (msg ? `\n\n${esc(msg)}` : ""); // 标题粗体（和 WhatsApp 一样）
  $("#wtPreview2").textContent = waFlatten(title + "\n" + msg) || "—";
  // 给自己 / 员工的行程摘要：用目前选的「每天 / 每星期一」从伺服器算出来（还没保存）
  clearTimeout(waPrevTimer);
  waPrevTimer = setTimeout(async () => {
    const date = $("#dgDate").value;
    if (!date) { $("#dgPreview").textContent = t("dg_prev_off"); return; }
    try { const d = await api(`/api/digest?preview=${date}`); $("#dgPreview").textContent = d.preview || ""; }
    catch (e) { $("#dgPreview").textContent = e.message; }
  }, 300);
}
["#wtText", "#dgDate", "#dgHour", "#dgPhones"].forEach((sel) => $(sel).addEventListener("input", updateWaPreview));
$("#dgDate").addEventListener("change", updateWaPreview);
// 必填：讯息、行程、电话都有了才可以按「保存」
const validPhone = (p) => p.replace(/\D/g, "").length >= 8;
function checkWaRequired(show) {
  const okMsg = !!$("#wtText").value.trim(), okEv = !!$("#wpEvent").value, okPh = validPhone($("#wpPhone").value);
  const okWhen = !!$("#wpSendDate").value && !!$("#wpSendTime").value;
  $("#waAutoSave").disabled = !(okMsg && okEv && okPh && okWhen);
  if (show) { $("#errMsg").hidden = okMsg; $("#errEvent").hidden = okEv; $("#errPhone").hidden = okPh; $("#errWhen").hidden = okWhen; }
  $("#wtText").classList.toggle("invalid", show && !okMsg);
  $("#wpPhone").classList.toggle("invalid", show && !okPh);
  return okMsg && okEv && okPh && okWhen;
}
["#wtText", "#wpPhone", "#wpName"].forEach((sel) => $(sel).addEventListener("input", () => checkWaRequired(false)));
["#wtText", "#wpPhone"].forEach((sel) => $(sel).addEventListener("blur", () => checkWaRequired(true)));
$("#wpEvent").addEventListener("change", () => checkWaRequired(false));
$("#waAutoSave").onclick = async () => {
  if (!checkWaRequired(true)) return; // 没填完不能保存
  const evId = $("#wpEvent").value, phone = $("#wpPhone").value.trim();
  // 这个行程已经有给客户的讯息 → 提醒（视窗一直开着，直到按 OK 或取消）
  const ev = waPickEvents.find((x) => String(x.id) === evId);
  if (ev?.customer_phone && ev?.customer_note) {
    const msg = t(ev.customer_sent_at ? "wp_dup_sent" : "wp_dup", { title: ev.title, phone: ev.customer_phone });
    if (!(await askConfirm(msg, t("ok")))) return;
  }
  const sendAt = new Date(`${$("#wpSendDate").value}T${$("#wpSendTime").value}`).toISOString();
  try {
    await api("/api/admin/wa-text", { method: "PUT", body: { text: $("#wtText").value } });
    if (state.config) state.config.waDefault = $("#wtText").value;
    if (evId) {
      // 把讯息排进这个行程：前一天下午 4 点自动发给客户
      const saved = await api(`/api/events/${evId}`, { method: "PATCH", body: {
        customer_phone: phone, customer_name: $("#wpName").value.trim() || null,
        customer_note: $("#wtText").value.trim(), customer_auto: true, customer_send_at: sendAt } });
      // 跳到那个行程所在的星期，马上在 WhatsApp Schedule 看到
      const target = new Date(saved.start || `${$("#wpDate").value}T12:00`);
      state.weekOffset = Math.round((startOfWeek(target) - weekStart(0)) / (7 * 86400000));
      await renderWeek();
      $("#weekWa").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (e) { toast(t("save_failed", { error: e.message })); }
};
function startOfWeek(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }

// 「我的日历」清单：勾选要同步哪些日历（主日历一定同步）
async function loadCalList() {
  const ul = $("#syncCals");
  try {
    const cals = await api("/api/google/calendars");
    ul.innerHTML = cals.length ? cals.map((c) => `<li><label class="check"><input type="checkbox" data-cal="${esc(c.id)}" data-name="${esc(c.name)}" ${c.enabled ? "checked" : ""} ${c.primary ? "disabled" : ""} />
      <span><b>${esc(c.name)}</b>${c.primary ? ` <span class="muted">${esc(t("cals_main"))}</span>` : ""}</span></label></li>`).join("")
      : `<li class="muted">${esc(t("cals_none"))}</li>`;
  } catch (e) { ul.innerHTML = `<li class="warn">${esc(e.message)}</li>`; }
}
$("#syncCals").addEventListener("change", async (ev) => {
  const box = ev.target.closest("[data-cal]");
  if (!box) return;
  const name = box.dataset.name, enabled = box.checked;
  if (!enabled && !(await askConfirm(t("cals_off_confirm", { name }), t("ok")))) { box.checked = true; return; }
  box.disabled = true;
  try {
    await api(`/api/google/calendars/${encodeURIComponent(box.dataset.cal)}`, { method: "PUT", body: { enabled } });
    toast(t(enabled ? "cals_on_done" : "cals_off_done", { name }));
    if (enabled) pullGoogle(); else loadMonth();
  } catch (e) { box.checked = !enabled; toast(e.message); }
  box.disabled = false;
});

async function loadSyncCalendars() {
  const sel = $("#syncCalendar");
  sel.innerHTML = `<option value="">${esc(t("cal_loading"))}</option>`;
  try {
    const cals = await api("/api/google/calendars");
    sel.innerHTML = cals.map((c) => `<option value="${esc(c.id)}" ${c.current ? "selected" : ""}>${esc(c.name)}${c.current ? esc(t("cal_current")) : ""}</option>`).join("");
  } catch (e) { sel.innerHTML = `<option value="">${esc(e.message)}</option>`; }
}
async function syncAllLoop() {
  for (let i = 0; i < 30; i++) {
    const r = await api("/api/google/sync-all", { method: "POST", body: {} });
    if (r.done) return r;
  }
}
$("#syncCalBtn").onclick = async () => {
  const sel = $("#syncCalendar"), calendarId = sel.value, out = $("#syncCalResult"), btn = $("#syncCalBtn");
  if (!calendarId) return;
  const name = sel.options[sel.selectedIndex].textContent.replace(t("cal_current"), "");
  if (!(await askConfirm(t("cal_confirm", { name }), t("cal_btn")))) return;
  btn.disabled = true; out.classList.remove("warn");
  try {
    await api("/api/google/sync-calendar", { method: "POST", body: { calendarId } });
    // 1) 把那个日历的行程读进 App（大日历会分好几次）
    let created = 0;
    for (let i = 0; i < 200; i++) {
      out.textContent = t("cal_pulling", { name, created });
      const r = await api("/api/google/pull", { method: "POST", body: { force: true } });
      if (r.error) throw new Error(r.error);
      if (r.skipped) { await new Promise((ok) => setTimeout(ok, 1500)); continue; } // 另一个读取正在跑，等一下
      created += r.created || 0;
      if (r.done) break;
    }
    await loadMonth();
    // 2) 把 App 原有的行程写进那个日历
    out.textContent = t("cal_pushing", { name });
    await syncAllLoop();
    out.textContent = t("cal_done", { name, created });
    renderSettings();
  } catch (e) { out.textContent = t("cal_fail", { error: e.message }); out.classList.add("warn"); }
  btn.disabled = false;
};

// 「立即同步全部行程」：双向 —— 1) 从 Google 读进来（大日历会分好几次，一直读到完）
// 2) 把 App 里还没在 Google 的行程（例如连接 Google 之前建的）写进 Google
$("#gSyncAllBtn").onclick = async () => {
  const btn = $("#gSyncAllBtn"), out = $("#gSyncResult");
  btn.disabled = true; out.classList.remove("warn");
  let created = 0, updated = 0;
  try {
    for (let i = 0; i < 200; i++) {
      out.textContent = t("g_pull_progress", { n: created + updated });
      const r = await api("/api/google/pull", { method: "POST", body: { force: true } });
      if (r.error) throw new Error(r.error);
      if (r.skipped) { await new Promise((ok) => setTimeout(ok, 1500)); continue; } // 另一个读取正在跑，等一下
      created += r.created || 0; updated += r.updated || 0;
      if (r.done) break;
    }
    out.textContent = t("g_syncing");
    let r = { ok: 0, total: 0, failed: 0, lastError: "", done: true };
    for (let i = 0; i < 30; i++) { r = await api("/api/google/sync-all", { method: "POST", body: {} }); if (r.done) break; }
    out.textContent = t("g_sync_result", { ok: r.ok, total: r.total }) + (r.failed ? t("g_sync_failed_part", { failed: r.failed, error: r.lastError }) : "") + (r.done ? "" : t("g_sync_more"));
    if (r.failed) out.classList.add("warn");
    await loadMonth();
  } catch (e) { out.textContent = t("g_sync_fail", { error: e.message }); out.classList.add("warn"); }
  btn.disabled = false;
};
$("#gDisconnectBtn").onclick = async () => {
  if (!(await askConfirm(t("g_disconnect_confirm"), t("g_disconnect")))) return;
  await api("/api/google/disconnect", { method: "POST", body: {} });
  toast(t("g_disconnected"));
  renderSettings();
};
$("#acctNameSave").onclick = async () => {
  try {
    const me = await api("/api/auth/me", { method: "PATCH", body: { name: $("#acctName").value } });
    state.me = { ...state.me, name: me.name };
    state.members = await api("/api/members");
    $("#postAs").textContent = t("posting_as", { name: me.name });
    toast(t("renamed", { name: me.name }));
  } catch (e) { toast(e.message); }
};
$("#pwForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!passwordOk($("#pwNew").value)) { toast(t("err_pw_rule")); return; }
  try {
    const r = await api("/api/auth/password", { method: "POST", body: { oldPassword: $("#pwOld").value, newPassword: $("#pwNew").value } });
    store.set("token", r.token);
    $("#pwOld").value = ""; $("#pwNew").value = "";
    toast(t("pw_changed"));
  } catch (e) { toast(e.message); }
});
$("#logoutBtn").onclick = async () => {
  if (!(await askConfirm(t("logout_confirm"), t("logout")))) return;
  store.set("token", "");
  location.reload();
};
$("#icsCopyBtn").onclick = async () => {
  const input = $("#icsUrl");
  try { await navigator.clipboard.writeText(input.value); toast(t("copied")); }
  catch { input.select(); toast(t("copy_manual")); }
};
$("#tzDeviceBtn").onclick = () => { $("#tzInput").value = Intl.DateTimeFormat().resolvedOptions().timeZone; };
$("#tzSaveBtn").onclick = async () => {
  try { const r = await api("/api/settings/timezone", { method: "PUT", body: { timezone: $("#tzInput").value.trim() } }); toast(t("tz_saved", { tz: r.timezone })); }
  catch (e) { toast(t("save_failed", { error: e.message })); }
};

// ---------- Claude 对话 ----------
const chatLog = $("#chatLog");
let pendingPhotos = [];
function addMsg(role, text, images = []) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  images.forEach((src) => { const img = document.createElement("img"); img.src = src; img.alt = ""; div.appendChild(img); });
  div.appendChild(document.createTextNode(text));
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return div;
}
$("#chatPhotos").addEventListener("change", (ev) => {
  pendingPhotos = [...ev.target.files].slice(0, 5);
  $("#chatPreview").innerHTML = "";
  pendingPhotos.forEach((f) => { const img = document.createElement("img"); img.src = URL.createObjectURL(f); img.alt = ""; $("#chatPreview").appendChild(img); });
});
const chatInput = $("#chatInput");
enterToSend(chatInput, () => $("#chatForm").requestSubmit());
$("#chatForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const text = chatInput.value.trim();
  if (!text && !pendingPhotos.length) return;
  addMsg("user", text, pendingPhotos.map((f) => URL.createObjectURL(f)));
  const fd = new FormData();
  fd.append("message", text);
  fd.append("history", JSON.stringify(state.chatHistory));
  for (const f of pendingPhotos) fd.append("photos", await shrinkForUpload(f));
  chatInput.value = ""; pendingPhotos = []; $("#chatPreview").innerHTML = ""; $("#chatPhotos").value = "";
  const thinking = addMsg("assistant thinking", t("claude_thinking"));
  const submit = ev.target.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    const r = await api("/api/chat", { method: "POST", body: fd });
    thinking.remove();
    addMsg("assistant", r.reply);
    state.chatHistory.push({ role: "user", content: text || t("chat_photo_only") }, { role: "assistant", content: r.reply });
    loadMonth();
  } catch (e) { thinking.remove(); addMsg("assistant", t("claude_error", { error: e.message })); }
  submit.disabled = false;
});

// ---------- 登录 / 注册 ----------
let authMode = "login";
function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  $("#tabLogin").setAttribute("aria-selected", String(!signup));
  $("#tabSignup").setAttribute("aria-selected", String(signup));
  $("#authNameRow").hidden = !signup;
  $("#pwRule").hidden = !signup;
  $("#authSubmit").textContent = signup ? t("signup_btn") : t("login_btn");
  $("#authPassword").autocomplete = signup ? "new-password" : "current-password";
  $("#authFootText").textContent = signup ? t("have_acct") : t("no_acct");
  $("#authSwitch").textContent = signup ? t("tab_login") : t("tab_signup");
  $("#forgotLink").hidden = signup;
}
$("#tabLogin").onclick = () => { setAuthMode("login"); $("#authError").textContent = ""; };
$("#tabSignup").onclick = () => { setAuthMode("signup"); $("#authError").textContent = ""; };
$("#authSwitch").onclick = () => { setAuthMode(authMode === "signup" ? "login" : "signup"); $("#authError").textContent = ""; };
$("#pwToggle").onclick = () => { const i = $("#authPassword"); i.type = i.type === "password" ? "text" : "password"; };
function showAuth(message) {
  store.set("token", "");
  document.body.classList.add("locked");
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  $("#authError").textContent = message && !/^401$/.test(message) ? message : "";
  setTimeout(() => $(authMode === "signup" ? "#authName" : "#authEmail").focus(), 50);
}
$("#authForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const err = $("#authError");
  const email = $("#authEmail").value.trim(), password = $("#authPassword").value, name = $("#authName").value.trim();
  err.textContent = "";
  if (authMode === "signup" && !name) { err.textContent = t("err_name"); return; }
  if (!EMAIL_RE.test(email)) { err.textContent = t("err_email"); return; }
  if (authMode === "signup" ? !passwordOk(password) : !password) { err.textContent = t("err_pw_rule"); return; }
  const btn = $("#authSubmit"); btn.disabled = true;
  try {
    const r = await api(`/api/auth/${authMode}`, { method: "POST", body: { email, password, name, lang: getLang() } });
    store.set("token", r.token);
    $("#authPassword").value = "";
    await startApp();
  } catch (e) { err.textContent = e.message; }
  btn.disabled = false;
});

// ---------- 忘记密码 ----------
let fpTick = null, fpUntil = 0;
function fpCountdown() { // 验证码 5 分钟倒数；过期就不能按「重设」
  clearInterval(fpTick);
  const draw = () => {
    const left = Math.max(0, Math.round((fpUntil - Date.now()) / 1000));
    const el = $("#fpTimer");
    if (left > 0) { el.textContent = t("fp_timer", { t: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` }); el.className = "fp-timer"; $("#fpReset").disabled = false; }
    else { el.textContent = t("fp_expired"); el.className = "fp-timer expired"; $("#fpReset").disabled = true; clearInterval(fpTick); }
  };
  draw(); fpTick = setInterval(draw, 1000);
}
function showForgot(on) {
  if (!on) { clearInterval(fpTick); clearInterval(fpWaitTick); $("#fpWait").textContent = ""; $("#fpSend").disabled = false; $("#fpSend").textContent = t("fp_send"); }
  $("#authForm").hidden = on; $("#forgotForm").hidden = !on;
  document.querySelector(".auth-tabs").hidden = on; document.querySelector(".auth-foot").hidden = on;
  $("#fpError").textContent = "";
  if (on) { $("#fpEmail").value = $("#authEmail").value.trim(); $("#fpStep2").hidden = true; $("#fpHint").textContent = t("fp_hint"); setTimeout(() => $("#fpEmail").focus(), 50); }
}
$("#forgotLink").onclick = () => showForgot(true);
$("#fpBack").onclick = () => showForgot(false);
$("#fpSend").onclick = async () => {
  const email = $("#fpEmail").value.trim(), err = $("#fpError");
  err.textContent = "";
  if (!EMAIL_RE.test(email)) { err.textContent = t("err_email"); return; }
  const b = $("#fpSend"); b.disabled = true;
  try {
    await api("/api/auth/forgot", { method: "POST", body: { email } });
    $("#fpHint").textContent = t("fp_sent", { email });
    $("#fpStep2").hidden = false; $("#fpSend").textContent = t("fp_resend");
    $("#fpCode").value = ""; fpUntil = Date.now() + 5 * 60 * 1000; fpCountdown();
    fpResendWait();
    setTimeout(() => $("#fpCode").focus(), 50);
    return;
  } catch (e) { err.textContent = e.message; }
  b.disabled = false;
};
// 「再寄一次」要等 20 秒才可以按
let fpWaitTick = null;
function fpResendWait() {
  clearInterval(fpWaitTick);
  const b = $("#fpSend"), until = Date.now() + 20000;
  const draw = () => {
    const left = Math.ceil((until - Date.now()) / 1000);
    b.textContent = t("fp_resend");
    if (left > 0) { b.disabled = true; $("#fpWait").textContent = `⏳ ${left}s`; }
    else { clearInterval(fpWaitTick); b.disabled = false; $("#fpWait").textContent = ""; }
  };
  draw(); fpWaitTick = setInterval(draw, 250);
}
$("#forgotForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const email = $("#fpEmail").value.trim(), code = $("#fpCode").value.replace(/\D/g, ""), password = $("#fpPassword").value, err = $("#fpError");
  err.textContent = "";
  if (Date.now() > fpUntil) { err.textContent = t("fp_expired"); return; }
  if (code.length !== 6) { err.textContent = t("fp_code_err"); $("#fpCode").focus(); return; }
  if (!password) { err.textContent = t("fp_pw_req"); $("#fpPassword").focus(); return; }
  if (!passwordOk(password)) { err.textContent = t("err_pw_rule"); $("#fpPassword").focus(); return; }
  const b = $("#fpReset"); b.disabled = true;
  try {
    const r = await api("/api/auth/reset", { method: "POST", body: { email, code, password } });
    store.set("token", r.token);
    $("#fpPassword").value = ""; $("#fpCode").value = "";
    showForgot(false);
    await startApp();
    toast(t("fp_done"));
  } catch (e) { err.textContent = e.message; }
  b.disabled = false;
});

// ---------- 启动 ----------
async function openFromHash() {
  const m = location.hash.match(/^#event-(\d+)$/);
  if (m) await openDetail(Number(m[1]));
}
window.addEventListener("hashchange", openFromHash);
// 双向同步：从我的 Google「共享日历」读回变更，有变更就重画日历
async function pullGoogle() {
  if (!state.me?.google || document.body.classList.contains("locked")) return;
  try {
    const r = await api("/api/google/pull", { method: "POST", body: {} });
    if (r.created || r.updated || r.deleted) {
      await loadMonth();
      if (current) { try { current = await api(`/api/events/${current.id}`); renderDetail(); } catch { closeDetail(); } }
    }
  } catch {}
}

// =====================================================================
// 工作室功能：今天首页、看板（流程 / 付款 / 工作量）、付款、清单
// =====================================================================
const STAGES = ["enquiry", "booked", "shoot", "editing", "delivered"];
const RM = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const balanceOf = (e) => (e.amount_total ? Math.max(0, Number(e.amount_total) - Number(e.amount_paid || 0)) : 0);
const fetchRange = (from, to) => api(`/api/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
function fillStageSelect(sel, value) {
  sel.innerHTML = STAGES.map((s) => `<option value="${s}">${esc(t("st_" + s))}</option>`).join("");
  sel.value = value || "booked";
}
// 小标签：清单进度、还欠多少
function badges(e) {
  const out = [];
  if (e.check_total) out.push(`✅ ${e.check_done}/${e.check_total}`);
  const bal = 0; // 不用付款功能了
  if (bal > 0) out.push(`💰 ${esc(t("p_due", { n: Number(bal).toLocaleString("en-MY") }))}`);
  return out.join(" · ");
}
// WhatsApp 连结：0 开头的马来西亚号码 → 60
function waLink(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "60" + d.slice(1);
  return d ? `https://wa.me/${d}` : "";
}

// ---------- 🏠 今天 ----------
let homeTimer = null;
async function renderHome() {
  const now = new Date(), today = startOfDay(now);
  const h = now.getHours();
  const name = state.me?.name || "";
  $("#homeHello").textContent = t(h < 12 ? "h_morning" : h < 18 ? "h_afternoon" : "h_evening", { name });
  $("#homeDate").textContent = now.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });
  let evs = [];
  try { evs = state.homeEvents = await fetchRange(addDays(today, -120), addDays(today, 180)); } catch (e) { $("#homeList").innerHTML = `<p class="hint warn">${esc(e.message)}</p>`; return; }
  const todayK = dayKey(today);
  const todays = evs.filter((e) => eventDays(e).includes(todayK)).sort((a, b) => (b.all_day - a.all_day) || new Date(a.start) - new Date(b.start));
  const wk0 = weekStart(0), wk1 = addDays(wk0, 7);
  const weekCount = evs.filter((e) => new Date(e.start) < wk1 && new Date(e.end || e.start) >= wk0).length;
  const due = evs.reduce((s, e) => s + balanceOf(e), 0);
  $("#homeToday").textContent = todays.length;
  $("#homeWeek").textContent = weekCount;
  $("#homeDue").textContent = RM(due);
  // 下一个行程 + 倒数
  const next = evs.filter((e) => !e.all_day && new Date(e.end || e.start) > now).sort((a, b) => new Date(a.start) - new Date(b.start))[0];
  const nx = $("#homeNext");
  nx.hidden = !next;
  const tick = () => {
    if (!next) return;
    const ms = new Date(next.start) - new Date();
    let txt = t("h_now");
    if (ms > 0) {
      const m = Math.round(ms / 60000), d = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
      txt = t("h_in", { t: (d ? `${d}d ` : "") + (d || hh ? `${hh}h ` : "") + `${mm}m` });
    }
    nx.innerHTML = `<span>${esc(t("h_next"))} <b>${esc(next.title)}</b></span><b class="cd">${esc(txt)}</b>`;
    nx.dataset.id = next.id;
  };
  tick(); clearInterval(homeTimer); homeTimer = setInterval(() => { if (state.view === "home") tick(); }, 30_000);
  $("#homeList").innerHTML = todays.length ? todays.map((e) => {
    const b = badges(e), wa = e.customer_phone ? waLink(e.customer_phone) : "";
    return `<div class="hcard${e.color ? " lbl" : ""}" data-id="${e.id}" style="--c:${esc(eventColor(e))}">
      <div class="t">${esc(e.title)}</div>
      <div class="s">${e.all_day ? esc(t("all_day")) : fmtTime(e.start) + (e.end ? " – " + fmtTime(e.end) : "")}${e.member_name ? " · " + esc((e.member_emoji ? e.member_emoji + " " : "") + e.member_name) : ""}${e.label ? " · " + esc(labelName(e.label)) : ""}</div>
      ${b || wa ? `<div class="row">${b ? `<span class="pill">${b}</span>` : "<span></span>"}${wa ? `<a class="wa-btn" href="${wa}" target="_blank" rel="noopener">${esc(t("h_wa"))}</a>` : ""}</div>` : ""}
    </div>`;
  }).join("") : `<p class="hint home-none">${esc(t("h_none"))}</p>`;
}
$("#homeList").addEventListener("click", (ev) => { if (ev.target.closest("a")) return; const c = ev.target.closest(".hcard"); if (c) openDetail(Number(c.dataset.id)); });
$("#homeNext").addEventListener("click", () => { const id = Number($("#homeNext").dataset.id); if (id) openDetail(id); });

// ---------- 📋 看板 ----------
state.boardSeg = "pipeline"; state.payMonth = 0; state.wlWeek = 0;
$("#boardSeg").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-seg]"); if (!b) return;
  state.boardSeg = b.dataset.seg; renderBoard();
});
function renderBoard() {
  $("#boardSeg").querySelectorAll("[data-seg]").forEach((b) => b.classList.toggle("on", b.dataset.seg === state.boardSeg));
  $("#boardPipeline").hidden = state.boardSeg !== "pipeline";
  $("#boardPayments").hidden = state.boardSeg !== "payments";
  $("#boardWorkload").hidden = state.boardSeg !== "workload";
  if (state.boardSeg === "pipeline") renderPipeline();
  if (state.boardSeg === "payments") renderPayments();
  if (state.boardSeg === "workload") renderWorkload();
}
async function renderPipeline() {
  const today = startOfDay(new Date());
  let evs = [];
  try { evs = await fetchRange(addDays(today, -90), addDays(today, 365)); } catch (e) { $("#boardPipeline").innerHTML = `<p class="hint warn">${esc(e.message)}</p>`; return; }
  const fmtD = (iso) => new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short" });
  $("#boardPipeline").innerHTML = STAGES.map((st, i) => {
    const list = evs.filter((e) => (e.stage || "booked") === st).sort((a, b) => new Date(a.start) - new Date(b.start));
    return `<div class="pcol" data-stage="${st}"><h5><span>${esc(t("st_" + st))}</span><span class="n">${list.length}</span></h5>
      ${list.map((e) => { const b = badges(e); return `<div class="pcard${e.color ? " lbl" : ""}" data-id="${e.id}" style="--c:${esc(eventColor(e))}">
        <div class="t">${esc(e.title)}</div><div class="s">${esc(fmtD(e.start))}${b ? " · " + b : ""}</div>
</div>`; }).join("")}
    </div>`;
  }).join("");
}
// 拖拉卡片换阶段：电脑直接拖；手机按住一下再拖（直接滑动 = 左右卷动）
let pDrag = null, pJustDragged = false;
function pStart(card, x, y, touch) {
  const r = card.getBoundingClientRect();
  pDrag = { card, id: Number(card.dataset.id), from: card.closest(".pcol").dataset.stage, x0: x, y0: y, dx: x - r.left, dy: y - r.top,
    w: r.width, active: false, touch, timer: null, ghost: null, over: null };
  if (touch) pDrag.timer = setTimeout(() => pActivate(x, y), 280); // 按住 0.28 秒才开始拖
}
function pActivate(x, y) {
  if (!pDrag || pDrag.active) return;
  pDrag.active = true;
  const g = pDrag.card.cloneNode(true);
  g.classList.add("pghost"); g.style.width = pDrag.w + "px";
  document.body.appendChild(g); pDrag.ghost = g;
  pDrag.card.classList.add("pdragging");
  if (navigator.vibrate) navigator.vibrate(15);
  pMove(x, y);
}
function pMove(x, y) {
  if (!pDrag) return;
  if (!pDrag.active) {
    const moved = Math.hypot(x - pDrag.x0, y - pDrag.y0);
    if (pDrag.touch) { if (moved > 10) { clearTimeout(pDrag.timer); pDrag = null; } return; } // 手机：还没按住就移动 = 卷动
    if (moved > 6) pActivate(x, y); else return;
  }
  pDrag.ghost.style.transform = `translate(${x - pDrag.dx}px, ${y - pDrag.dy}px) rotate(2deg)`;
  pDrag.ghost.style.visibility = "hidden";
  const col = document.elementFromPoint(x, y)?.closest(".pcol");
  pDrag.ghost.style.visibility = "";
  document.querySelectorAll(".pcol.pover").forEach((c) => c !== col && c.classList.remove("pover"));
  if (col) col.classList.add("pover");
  pDrag.over = col?.dataset.stage || null;
  // 靠近左右边缘 → 自动卷动看板
  const box = $("#boardPipeline"), br = box.getBoundingClientRect();
  if (x > br.right - 40) box.scrollLeft += 14; else if (x < br.left + 40) box.scrollLeft -= 14;
}
async function pEnd() {
  if (!pDrag) return;
  clearTimeout(pDrag.timer);
  const d = pDrag; pDrag = null;
  if (!d.active) return;
  pJustDragged = true; setTimeout(() => (pJustDragged = false), 50);
  d.ghost?.remove(); d.card.classList.remove("pdragging");
  document.querySelectorAll(".pcol.pover").forEach((c) => c.classList.remove("pover"));
  if (d.over && d.over !== d.from) {
    // 先在画面上搬过去，再存
    const col = document.querySelector(`.pcol[data-stage="${d.over}"]`);
    col?.appendChild(d.card);
    try { await api(`/api/events/${d.id}`, { method: "PATCH", body: { stage: d.over } }); } catch (e) { toast(e.message); }
    renderPipeline();
  }
}
$("#boardPipeline").addEventListener("mousedown", (ev) => { const c = ev.target.closest(".pcard"); if (c && ev.button === 0) { ev.preventDefault(); pStart(c, ev.clientX, ev.clientY, false); } });
window.addEventListener("mousemove", (ev) => pDrag && !pDrag.touch && pMove(ev.clientX, ev.clientY));
window.addEventListener("mouseup", () => pDrag && !pDrag.touch && pEnd());
$("#boardPipeline").addEventListener("touchstart", (ev) => { const c = ev.target.closest(".pcard"); if (c) { const t0 = ev.touches[0]; pStart(c, t0.clientX, t0.clientY, true); } }, { passive: true });
window.addEventListener("touchmove", (ev) => {
  if (!pDrag) return;
  const t0 = ev.touches[0];
  if (pDrag.active) ev.preventDefault(); // 拖拉中不要卷动画面
  pMove(t0.clientX, t0.clientY);
}, { passive: false });
window.addEventListener("touchend", () => pDrag && pEnd());
window.addEventListener("touchcancel", () => pDrag && pEnd());
$("#boardPipeline").addEventListener("contextmenu", (ev) => { if (ev.target.closest(".pcard")) ev.preventDefault(); }); // 按住不要跳出选单
$("#boardPipeline").addEventListener("click", (ev) => {
  if (pJustDragged) return;
  const c = ev.target.closest(".pcard"); if (c) openDetail(Number(c.dataset.id));
});
async function renderPayments() {
  const base = new Date(); base.setDate(1); base.setHours(0, 0, 0, 0); base.setMonth(base.getMonth() + state.payMonth);
  const end = new Date(base); end.setMonth(end.getMonth() + 1);
  $("#payMonth").textContent = base.toLocaleDateString(locale(), { month: "long", year: "numeric" });
  let evs = [];
  try { evs = (await fetchRange(base, end)).filter((e) => e.amount_total && new Date(e.start) >= base); } catch (e) { $("#payBox").innerHTML = `<p class="hint warn">${esc(e.message)}</p>`; return; }
  const total = evs.reduce((s, e) => s + Number(e.amount_total || 0), 0);
  const paid = evs.reduce((s, e) => s + Math.min(Number(e.amount_paid || 0), Number(e.amount_total || 0)), 0);
  const due = evs.filter((e) => balanceOf(e) > 0).sort((a, b) => new Date(a.start) - new Date(b.start));
  $("#payBox").innerHTML = `<div class="money"><div class="big">
      <div><b>${RM(total)}</b><span>${esc(t("pay_total"))}</span></div>
      <div><b class="ok">${RM(paid)}</b><span>${esc(t("pay_received"))}</span></div>
      <div><b class="bad">${RM(total - paid)}</b><span>${esc(t("pay_balance"))}</span></div></div></div>
    <div class="money"><div class="mh">${esc(t("pay_collect"))}</div>
      ${due.length ? due.map((e) => `<div class="due-row" data-id="${e.id}"><span>${esc(e.title)} · ${esc(new Date(e.start).toLocaleDateString(locale(), { day: "numeric", month: "short" }))}</span><b>${RM(balanceOf(e))}</b></div>`).join("")
        : `<p class="hint">${esc(t("pay_none"))}</p>`}</div>`;
}
$("#payPrev").onclick = () => { state.payMonth--; renderPayments(); };
$("#payNext").onclick = () => { state.payMonth++; renderPayments(); };
$("#payBox").addEventListener("click", (ev) => { const r = ev.target.closest(".due-row"); if (r) openDetail(Number(r.dataset.id)); });
async function renderWorkload() {
  const start = weekStart(state.wlWeek), end = addDays(start, 7);
  $("#wlRange").textContent = `${start.toLocaleDateString(locale(), { day: "numeric", month: "short" })} – ${addDays(start, 6).toLocaleDateString(locale(), { day: "numeric", month: "short" })}`;
  let evs = [];
  try { evs = await fetchRange(start, end); } catch (e) { $("#wlBox").innerHTML = `<p class="hint warn">${esc(e.message)}</p>`; return; }
  if (!state.members.length) { $("#wlBox").innerHTML = `<p class="hint">${esc(t("wl_nobody"))}</p>`; return; }
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const shade = (n) => (n === 0 ? "background:#eef2f8;color:#a9b3c4" : `background:color-mix(in srgb, #e7766a ${Math.min(100, 25 + n * 22)}%, #fff);${n >= 3 ? "color:#fff" : ""}`);
  $("#wlBox").innerHTML = `<div class="mh">${esc(t("wl_title"))}</div><div class="wl-scroll"><table><tr><th></th>${days.map((d) => `<th>${esc(d.toLocaleDateString(locale(), { weekday: "short" }))}<br><small>${d.getDate()}</small></th>`).join("")}</tr>
    ${state.members.map((m) => `<tr><th class="who">${esc((m.emoji ? m.emoji + " " : "") + m.name)}</th>${days.map((d) => {
      const n = evs.filter((e) => e.member_id === m.id && eventDays(e).includes(dayKey(d))).length;
      return `<td style="${shade(n)}">${n}</td>`; }).join("")}</tr>`).join("")}</table></div>
    <p class="hint" style="margin:6px 2px 0">${esc(t("wl_hint"))}</p>`;
}
$("#wlPrev").onclick = () => { state.wlWeek--; renderWorkload(); };
$("#wlNext").onclick = () => { state.wlWeek++; renderWorkload(); };

// ---------- 行程详情：阶段、付款、清单 ----------
function renderStudioDetail() {
  const e = current; if (!e) return;
  fillStageSelect($("#dStage"), e.stage || "booked");
  $("#dPayTotal").value = e.amount_total ?? "";
  $("#dPayPaid").value = e.amount_paid ?? "";
  const bal = balanceOf(e);
  $("#dPayBal").textContent = e.amount_total ? RM(bal) : "—";
  $("#dPayBal").className = bal > 0 ? "bad" : "ok";
  $("#dPayDue").textContent = e.amount_total ? (bal > 0 ? t("p_due", { n: Number(bal).toLocaleString("en-MY") }) : t("p_full")) : "";
  $("#dPayDue").className = bal > 0 ? "bad" : "ok";
}
$("#dStage").addEventListener("change", async () => {
  if (!current) return;
  try { current = { ...current, ...(await api(`/api/events/${current.id}`, { method: "PATCH", body: { stage: $("#dStage").value } })) }; renderStudioDetail(); } catch (e) { toast(e.message); }
});
const savePay = async () => {
  if (!current) return;
  const body = { amount_total: $("#dPayTotal").value === "" ? null : Number($("#dPayTotal").value), amount_paid: $("#dPayPaid").value === "" ? null : Number($("#dPayPaid").value) };
  try { current = { ...current, ...(await api(`/api/events/${current.id}`, { method: "PATCH", body })) }; renderStudioDetail(); } catch (e) { toast(e.message); }
};
$("#dPayTotal").addEventListener("change", savePay);
$("#dPayPaid").addEventListener("change", savePay);
function renderChecklist(items) {
  const done = items.filter((x) => x.done).length;
  $("#dCheckCount").textContent = items.length ? `${done} / ${items.length}` : "";
  $("#dCheckBar").style.width = items.length ? `${Math.round((done / items.length) * 100)}%` : "0%";
  $("#dCheckList").innerHTML = items.length ? items.map((x) => `<li class="${x.done ? "done" : ""}">
      <label class="wk-check"><input type="checkbox" data-ck="${x.id}" ${x.done ? "checked" : ""} /><span></span></label>
      <span class="txt">${esc(x.text)}</span><button type="button" class="ck-del" data-ckdel="${x.id}" aria-label="${esc(t("delete"))}">✕</button></li>`).join("")
    : `<li class="empty">${esc(t("c_empty"))}</li>`;
}
async function loadChecklist(id) {
  $("#dCheckList").innerHTML = ""; $("#dCheckCount").textContent = ""; $("#dCheckBar").style.width = "0%";
  fillTplSelect();
  try { const items = await api(`/api/events/${id}/checklist`); if (current?.id === id) renderChecklist(items); } catch {}
}
function fillTplSelect() {
  $("#dCheckTpl").innerHTML = `<option value="">${esc(t("c_tpl"))}</option>` + (state.templates || []).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("");
}
async function addCheck(body) {
  if (!current) return;
  try { renderChecklist(await api(`/api/events/${current.id}/checklist`, { method: "POST", body, silent: true })); } catch (e) { toast(e.message); }
}
$("#dCheckAddBtn").onclick = () => { const v = $("#dCheckInput").value.trim(); if (!v) return; $("#dCheckInput").value = ""; addCheck({ text: v }); };
$("#dCheckInput").addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); $("#dCheckAddBtn").click(); } });
$("#dCheckTpl").addEventListener("change", () => { const id = $("#dCheckTpl").value; $("#dCheckTpl").value = ""; if (id) addCheck({ templateId: Number(id) }); });
$("#dCheckList").addEventListener("click", async (ev) => {
  const box = ev.target.closest("[data-ck]"), del = ev.target.closest("[data-ckdel]");
  if (box) {
    ev.stopPropagation(); box.closest("li").classList.toggle("done", box.checked);
    try { renderChecklist(await api(`/api/checklist/${box.dataset.ck}`, { method: "PATCH", body: { done: box.checked }, silent: true })); } catch (e) { toast(e.message); }
  }
  if (del) { try { renderChecklist(await api(`/api/checklist/${del.dataset.ckdel}`, { method: "DELETE", silent: true })); } catch (e) { toast(e.message); } }
});

// ---------- ✅ 清单范本（「标签」页） ----------
async function renderTemplates() {
  try { state.templates = await api("/api/templates"); } catch {}
  fillTplSelect();
  $("#tplList").innerHTML = (state.templates || []).map((x) => `<div class="tpl" data-tpl="${x.id}">
      <input class="tpl-name" value="${esc(x.name)}" placeholder="${esc(t("tp_name_ph"))}" maxlength="60" />
      <textarea class="tpl-items" rows="4" placeholder="${esc(t("tp_items_ph"))}">${esc((x.items || []).join("\n"))}</textarea>
      <div class="actions"><button type="button" class="btn danger small" data-tpldel="${x.id}">${esc(t("delete"))}</button><span class="spacer"></span>
        <button type="button" class="btn primary small" data-tplsave="${x.id}">${esc(t("save"))}</button></div></div>`).join("");
}
$("#tplAdd").onclick = async () => {
  try { await api("/api/templates", { method: "POST", body: { name: "New template", items: [] } }); await renderTemplates(); } catch (e) { toast(e.message); }
};
$("#tplList").addEventListener("click", async (ev) => {
  const sv = ev.target.closest("[data-tplsave]"), dl = ev.target.closest("[data-tpldel]");
  if (sv) {
    const box = sv.closest(".tpl");
    try { await api(`/api/templates/${sv.dataset.tplsave}`, { method: "PUT", body: { name: box.querySelector(".tpl-name").value, items: box.querySelector(".tpl-items").value.split("\n") } }); await renderTemplates(); } catch (e) { toast(e.message); }
  }
  if (dl) {
    const name = dl.closest(".tpl").querySelector(".tpl-name").value;
    if (!(await askConfirm(t("tp_delete_confirm", { name }), t("delete")))) return;
    try { await api(`/api/templates/${dl.dataset.tpldel}`, { method: "DELETE" }); await renderTemplates(); } catch (e) { toast(e.message); }
  }
});


// =====================================================================
// 📚 日历：每个帐号自己的日历 + 邀请连结一起编辑
// =====================================================================
const curCalId = () => Number(store.get("cal") || 0) || null;
// 打开邀请连结（?join=…）：先记下来，登录后再加入
(() => {
  const qs = new URLSearchParams(location.search);
  const j = qs.get("join");
  if (j) { store.set("pendingJoin", j); qs.delete("join"); history.replaceState(null, "", location.pathname + (qs.toString() ? "?" + qs : "") + location.hash); }
})();
async function loadCalendars(ownFirst = false) {
  const r = await api("/api/calendars");
  state.calendars = (r.calendars || []).sort((a, b) => (b.role === "owner") - (a.role === "owner")); // 自己的日历排第一
  const own = state.calendars.find((c) => c.role === "owner");
  if (ownFirst && own) store.set("cal", String(own.id));
  if (!state.calendars.some((c) => c.id === curCalId())) store.set("cal", String(r.current));
  state.cal = state.calendars.find((c) => c.id === curCalId()) || state.calendars[0];
  document.body.classList.toggle("viewer", state.cal?.role === "viewer"); // 只能查看：隐藏新增 / 编辑 / 删除
  renderCalSelects();
}
function renderCalSelects() {
  const opts = (state.calendars || []).map((c) => `<option value="${c.id}">${esc(c.name)}${c.role !== "owner" ? " · " + esc(t("r_" + c.role)) : ""}</option>`).join("");
  for (const sel of [$("#calSelect"), $("#homeCalSel")]) { sel.innerHTML = opts; sel.value = String(state.cal?.id || ""); }
  $("#homeCalSel").closest(".home-cal").hidden = (state.calendars || []).length < 2; // 只有一个日历就不显示
}
async function switchCalendar(id) {
  if (!id || id === state.cal?.id) return;
  store.set("cal", String(id));
  await loadCalendars();
  [state.config, state.members] = await Promise.all([api("/api/config"), api("/api/members")]);
  state.labelNames = state.config.labelNames || {};
  await loadMonth();
  showView(state.view);
}
$("#calSelect").addEventListener("change", (ev) => switchCalendar(Number(ev.target.value)));
$("#homeCalSel").addEventListener("change", (ev) => switchCalendar(Number(ev.target.value)));
// 用邀请连结加入
async function joinPending() {
  const tk = store.get("pendingJoin");
  if (!tk) return false;
  store.set("pendingJoin", "");
  try {
    const r = await api("/api/join", { method: "POST", body: { token: tk }, silent: true });
    store.set("cal", String(r.id));
    setTimeout(() => toast(t("cl_joined", { name: r.name })), 400);
    return true;
  } catch (e) { setTimeout(() => toast(t("cl_join_fail", { error: e.message })), 400); return false; }
}
// 设置页：日历卡片
async function renderCalCard() {
  const c = state.cal; if (!c) return;
  const owner = c.role === "owner";
  $("#calName").value = c.name;
  $("#calRenameRow").hidden = !owner;
  $("#calRoleNote").textContent = t("cl_role_" + c.role);
  $("#calInviteBtns").hidden = c.role === "viewer";
  $("#calLinkBox").hidden = true;
  $("#calLeaveBtn").hidden = owner;
  try {
    const people = await api(`/api/calendars/${c.id}/people`);
    $("#calPeople").innerHTML = people.map((p) => `<li data-uid="${p.id}"><span class="who"><b>${esc(p.name)}</b> ${p.id === state.me?.id ? `<span class="muted">${esc(t("cl_you"))}</span>` : ""}<br><span class="muted">${esc(p.email)}</span></span>
      ${owner && p.role !== "owner" ? `<select data-role="${p.id}"><option value="editor">${esc(t("r_editor"))}</option><option value="viewer">${esc(t("r_viewer"))}</option></select>
        <button type="button" class="ck-del" data-kick="${p.id}" data-name="${esc(p.name)}" aria-label="${esc(t("remove"))}">✕</button>`
        : `<span class="role-chip">${esc(t("r_" + p.role))}</span>`}</li>`).join("");
    people.forEach((p) => { const s = $(`#calPeople [data-role="${p.id}"]`); if (s) s.value = p.role; });
  } catch (e) { $("#calPeople").innerHTML = `<li class="warn">${esc(e.message)}</li>`; }
}
$("#calRenameBtn").onclick = async () => {
  try { await api(`/api/calendars/${state.cal.id}`, { method: "PATCH", body: { name: $("#calName").value } }); await loadCalendars(); renderCalCard(); }
  catch (e) { toast(e.message); }
};
$("#calInviteBtns").addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-invite]"); if (!b) return;
  try {
    const r = await api(`/api/calendars/${state.cal.id}/invite`, { method: "POST", body: { role: b.dataset.invite } });
    const url = `${location.origin}${location.pathname}?join=${r.token}`;
    $("#calLink").value = url;
    $("#calWaShare").href = `https://wa.me/?text=${encodeURIComponent(t("cl_invite_msg", { name: state.cal.name, url }))}`;
    $("#calLinkBox").hidden = false;
    toast(t("cl_link_ready"));
  } catch (e) { toast(e.message); }
});
$("#calCopy").onclick = async () => {
  try { await navigator.clipboard.writeText($("#calLink").value); toast("✓ " + t("copy")); }
  catch { $("#calLink").select(); document.execCommand("copy"); }
};
$("#calPeople").addEventListener("change", async (ev) => {
  const s = ev.target.closest("[data-role]"); if (!s) return;
  try { await api(`/api/calendars/${state.cal.id}/people/${s.dataset.role}`, { method: "PATCH", body: { role: s.value } }); } catch (e) { toast(e.message); }
});
$("#calPeople").addEventListener("click", async (ev) => {
  const k = ev.target.closest("[data-kick]"); if (!k) return;
  if (!(await askConfirm(t("cl_remove_confirm", { name: k.dataset.name }), t("remove")))) return;
  try { await api(`/api/calendars/${state.cal.id}/people/${k.dataset.kick}`, { method: "DELETE" }); renderCalCard(); } catch (e) { toast(e.message); }
});
$("#calLeaveBtn").onclick = async () => {
  if (!(await askConfirm(t("cl_leave_confirm", { name: state.cal.name }), t("cl_leave")))) return;
  try {
    await api(`/api/calendars/${state.cal.id}/people/${state.me.id}`, { method: "DELETE" });
    store.set("cal", ""); location.reload();
  } catch (e) { toast(e.message); }
};

let started = false;
async function startApp() {
  state.me = await api("/api/auth/me");
  const joined = await joinPending();   // 用邀请连结打开的 → 先加入那个日历
  await loadCalendars(!joined); // 我的日历清单；打开 App 时默认用自己的日历
  if (state.me.lang && state.me.lang !== getLang()) setLang(state.me.lang); // 帐号里存的语言，所有设备一致
  document.body.classList.remove("locked");
  [state.config, state.members] = await Promise.all([api("/api/config"), api("/api/members")]);
  state.labels = state.config.labels || {};
  state.labelNames = state.config.labelNames || {};
  $("#claudeTab").hidden = !state.config.claude; // 没有 API key 就不显示 Claude 页签
  state.view = "calendar"; // 登录后先看到日历
  api("/api/templates").then((x) => { state.templates = x; fillTplSelect(); }).catch(() => {});
  rerenderAll();
  if (!started) {
    started = true;
    if (!state.config.claude) addMsg("assistant", t("claude_disabled"));
    setInterval(() => {
      if (document.body.classList.contains("locked") || document.hidden) return;
      loadMonth().then(() => { // 打开着的日期视窗、这星期也一起更新
        if ($("#dayDialog").open) openDayDialog();
        if (state.view === "week") renderWeek();
      }).catch(() => {});
      if (current && !$("#photoViewer").open && !$("#postInput").value) api(`/api/events/${current.id}`).then((e) => { current = e; renderDetail(); }).catch(() => {});
    }, 10_000); // 每 10 秒刷新画面（别人改的、Google 改的很快就看到）
    setInterval(() => { if (!document.hidden) pullGoogle(); }, 20_000); // 备用：Google 推送通知之外，每 20 秒检查一次
    document.addEventListener("visibilitychange", () => { if (!document.hidden) pullGoogle(); });
  }
  await loadMonth();
  pullGoogle();
  const qs = new URLSearchParams(location.search);
  if (qs.has("google") || qs.has("google_error")) {
    history.replaceState(null, "", location.pathname);
    showView("settings");
    setTimeout(() => toast(qs.get("google_error") ? t("g_connect_fail", { error: qs.get("google_error") }) : t("g_connected_toast", { gmail: qs.get("email") || "Google" })), 300);
  } else if (location.hash === "#settings") { history.replaceState(null, "", location.pathname); showView("settings"); }
  else await openFromHash();
}
(function init() {
  applyI18n(document);
  fillLangSelects();
  renderWeekdays();
  setAuthMode("login");
  if (!token()) { showAuth(); return; }
  startApp().catch((e) => { if (!document.body.classList.contains("locked")) toast(t("load_failed", { error: e.message })); });
})();
