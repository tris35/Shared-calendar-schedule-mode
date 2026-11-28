// Dashboard（The Legend Wedding + WM）：模板、标签、勾选的规则，以及给 Dashboard 的资料
import { LABELS } from "./db.mts";

/** Dashboard 从这一天开始算 */
export const DASH_START = "2026-10-01";
export const BRANDS = ["Legends", "WM"];
export const SOFTS = ["non_all_soft", "all_soft"];
export const SALES_TYPES = ["visit", "vc"];
export const KINDS = ["photo", "sales", "normal"]; // 选片 / 了解 / 普通

// ---------- 模板 ----------
export const DEFAULT_TEMPLATES = [
  { id: "photo", name: "选片", kind: "photo" },
  { id: "sales", name: "了解", kind: "sales" },
  { id: "normal", name: "普通", kind: "normal" },
];
export const calTemplates = (cal: any): any[] => (Array.isArray(cal?.event_templates) && cal.event_templates.length ? cal.event_templates : DEFAULT_TEMPLATES);

/** 管理员存模板：名字、种类（photo / sales / normal）；id 不变（行程靠 id 对应） */
export function cleanTemplates(list: any): any[] {
  if (!Array.isArray(list)) throw new Error("模板格式不正确");
  const out: any[] = [], ids = new Set<string>();
  for (const t of list.slice(0, 30)) {
    const name = String(t?.name ?? "").trim().slice(0, 20);
    const kind = String(t?.kind ?? "");
    if (!name) throw new Error("请填写模板名称");
    if (!KINDS.includes(kind)) throw new Error("无效的模板种类");
    let id = String(t?.id ?? "").trim().slice(0, 40) || `t${Date.now().toString(36)}${out.length}`;
    if (!/^[\w-]+$/.test(id) || ids.has(id)) id = `t${Date.now().toString(36)}${out.length}`;
    ids.add(id);
    out.push({ id, name, kind });
  }
  if (!out.length) throw new Error("至少要有一个模板");
  return out;
}

/** 第 2 版：模板固定 3 个（选片 / 了解 / 普通），只能改名字 */
export function renameTemplates(current: any[], input: any): any[] {
  if (!Array.isArray(input)) throw new Error("模板格式不正确");
  const names = new Map(input.map((t: any) => [String(t?.id ?? ""), String(t?.name ?? "").trim().slice(0, 20)]));
  return DEFAULT_TEMPLATES.map((d) => {
    const old = current.find((t) => t.id === d.id) || d;
    const n = names.get(d.id);
    if (n === "") throw new Error("请填写模板名称");
    return { id: d.id, name: n ?? old.name, kind: d.kind };
  });
}

// ---------- 标签（20 种颜色，可以重复；Google 日历只有 11 种颜色，同步时用最接近的） ----------
const DEFAULT_LABEL_NAMES = ["选片", "取礼服", "选礼服/Coat", "选AD礼服", "拍摄", "全体开会", "放假（PH）", "生日", "Offday", "FAIR", "其他"];
export function calLabels(cal: any): any[] {
  if (Array.isArray(cal?.labels) && cal.labels.length) return cal.labels;
  const names = cal?.label_names || {};
  return Object.keys(LABELS).slice(0, 11).map((color, i) => ({ id: `l${color}`, name: names[color] || DEFAULT_LABEL_NAMES[i] || LABELS[color].name, color,
    template_id: DEFAULT_LABEL_NAMES[i] === "选片" ? "photo" : null }));
}
export function cleanLabels(list: any): any[] {
  if (!Array.isArray(list)) throw new Error("标签格式不正确");
  const out: any[] = [], ids = new Set<string>();
  for (const l of list.slice(0, 60)) {
    const name = String(l?.name ?? "").trim().slice(0, 30);
    const color = String(l?.color ?? "");
    if (!name) throw new Error("请填写标签名称");
    if (!LABELS[color]) throw new Error("无效的颜色标签");
    let id = String(l?.id ?? "").trim().slice(0, 40) || `l${Date.now().toString(36)}${out.length}`;
    if (!/^[\w-]+$/.test(id) || ids.has(id)) id = `l${Date.now().toString(36)}${out.length}`;
    ids.add(id);
    // 选这个标签时自动选的模板（可以没有）
    const tid = l?.template_id ? String(l.template_id) : null;
    if (tid && !DEFAULT_TEMPLATES.some((t) => t.id === tid)) throw new Error("无效的模板");
    out.push({ id, name, color, template_id: tid });
  }
  return out;
}

/** Google 的颜色（colorId 1–11）→ 这个日历里对应的标签（同一个颜色的优先，再来是同步时会变成这个颜色的） */
export function labelForGoogleColor(labels: any[], colorId: string | null | undefined) {
  if (!colorId) return null;
  return labels.find((l) => String(l.color) === String(colorId)) || labels.find((l) => (LABELS as any)[l.color]?.google === String(colorId)) || null;
}

/** 行程表单送来的 label_id → 换成 Google 颜色（label）；没送 label_id 就不改 */
export function applyLabel(b: any, labels: any[]) {
  if (!("label_id" in b)) return;
  if (!b.label_id) { b.label = null; b.label_id = null; return; }
  const l = labels.find((x) => x.id === String(b.label_id));
  if (!l) throw new Error("无效的颜色标签");
  b.label = l.color;
  b.label_id = l.id;
}

// ---------- 勾选（依模板必填） ----------
const TICK_KEYS = ["template_id", "brand", "soft", "sales_type"];
/**
 * 算出要存的模板和勾选。
 * required = true（新增行程）：一定要选模板；没送这些栏位又不是新增 → 回传 null（不改）
 */
export function resolveTicks(b: any, old: any, templates: any[], required = false) {
  if (!required && !TICK_KEYS.some((k) => k in b)) return null;
  const pick = (k: string) => (k in b ? b[k] : old?.[k]) ?? null;
  const tid = pick("template_id") ? String(pick("template_id")) : null;
  if (!tid) {
    if (required) throw new Error("请选择模板");
    return { template_id: null, brand: null, soft: null, sales_type: null };
  }
  const t = templates.find((x) => x.id === tid);
  if (!t) throw new Error("无效的模板");
  if (t.kind === "normal") return { template_id: tid, brand: null, soft: null, sales_type: null };
  const brand = pick("brand");
  if (!BRANDS.includes(brand)) throw new Error("请选择 Legends 或 WM");
  if (t.kind === "photo") {
    const soft = pick("soft");
    if (!SOFTS.includes(soft)) throw new Error("请选择 All Soft 或 Non-All Soft");
    return { template_id: tid, brand, soft, sales_type: null };
  }
  const st = pick("sales_type");
  if (!SALES_TYPES.includes(st)) throw new Error("请选择上门了解或 VC了解");
  return { template_id: tid, brand, soft: null, sales_type: st };
}

// ---------- 给 Dashboard 的资料 ----------
const TYPE_OF: Record<string, string> = { non_all_soft: "Non-All Soft", all_soft: "All Soft", visit: "上门了解", vc: "VC了解" };

/**
 * rows：行程（date = 当地日期 YYYY-MM-DD）；manual：手动数据（有手动数据的月份只算手动数据）
 * 回传 Dashboard 要的 events：{ date, brand, person, type, title }
 *   brand 是空的 = 还没选模板或勾选不完整（Dashboard 的红字提醒会列出来）
 */
export function buildEvents(rows: any[], manual: any[], templates: any[]) {
  const manualMonths = new Set(manual.map((m) => m.month));
  const byId = new Map(templates.map((t) => [t.id, t]));
  const out: any[] = [];
  for (const r of rows) {
    const month = String(r.date).slice(0, 7);
    if (manualMonths.has(month)) continue;
    const base = { id: r.id, date: r.date, person: r.person || "", title: r.title || "", excluded: !!r.excluded };
    const t: any = r.template_id ? byId.get(r.template_id) : null;
    if (!t) { out.push({ ...base, brand: "", type: "未选模板" }); continue; }
    if (t.kind === "normal") continue;
    const tick = t.kind === "photo" ? r.soft : r.sales_type;
    if (!BRANDS.includes(r.brand) || !TYPE_OF[tick]) { out.push({ ...base, brand: "", type: "勾选不完整" }); continue; }
    out.push({ ...base, brand: r.brand, type: TYPE_OF[tick] });
  }
  // 手动数据：每一次算一笔（日期用那个月 1 号）
  for (const m of manual) {
    const add = (n: number, type: string) => { for (let i = 0; i < Number(n || 0); i++) out.push({ date: `${m.month}-01`, brand: m.brand, person: m.person, type, title: "手动数据" }); };
    add(m.non_all_soft, "Non-All Soft"); add(m.all_soft, "All Soft"); add(m.visit, "上门了解"); add(m.vc, "VC了解");
  }
  return { events: out, manualMonths: [...manualMonths].sort() };
}

/** dash_rates 的资料 → { "Legends|photo": [{ from, list, custom }] }（按日期排好） */
export function rateHistory(rows: any[]) {
  const out: Record<string, any[]> = {};
  for (const r of rows) {
    (out[`${r.brand}|${r.cat}`] ||= []).push({ from: r.from_date, list: r.list == null ? null : Number(r.list), custom: r.custom == null ? null : Number(r.custom) });
  }
  for (const h of Object.values(out)) h.sort((a, b) => a.from.localeCompare(b.from));
  return out;
}

/** 管理员存一个 Rate：品牌、类别、从哪天开始、列表值或自己输入的值 */
export function cleanRate(b: any) {
  const brand = String(b?.brand ?? ""), cat = String(b?.cat ?? ""), from = String(b?.from ?? "");
  if (!BRANDS.includes(brand)) throw new Error("请选择 Legends 或 WM");
  if (cat !== "photo" && cat !== "sales") throw new Error("无效的类别");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || isNaN(Date.parse(from))) throw new Error("请选择日期");
  if (from < DASH_START) throw new Error("日期不能早于 2026 年 10 月 1 日");
  const num = (v: any) => (v == null || v === "" || !(Number(v) > 0) ? null : Math.round(Number(v) * 100) / 100);
  const list = num(b?.list), custom = num(b?.custom);
  if (list == null && custom == null) throw new Error("请输入 Rate");
  return { brand, cat, from, list, custom };
}
