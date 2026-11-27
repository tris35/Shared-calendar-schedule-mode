// Dashboard 规则测试（不用数据库）：deno test -A --config supabase/functions/api/deno.json test/dashboard.test.ts
import { resolveTicks, buildEvents, cleanRate, cleanTemplates, cleanLabels, applyLabel, DEFAULT_TEMPLATES, calLabels } from "../supabase/functions/api/lib/dashboard.mts";

const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const throws = (fn: () => unknown, msg: string) => { try { fn(); } catch (e) { if (String((e as Error).message).includes(msg)) return; throw e; } throw new Error(`expected error: ${msg}`); };
const T = DEFAULT_TEMPLATES;

Deno.test("新增活动一定要选模板", () => throws(() => resolveTicks({ title: "x" }, null, T, true), "请选择模板"));
Deno.test("选片：要勾品牌和 All Soft / Non-All Soft", () => {
  throws(() => resolveTicks({ template_id: "photo" }, null, T, true), "Legends 或 WM");
  throws(() => resolveTicks({ template_id: "photo", brand: "WM" }, null, T, true), "All Soft");
  eq(resolveTicks({ template_id: "photo", brand: "WM", soft: "all_soft", sales_type: "vc" }, null, T, true),
    { template_id: "photo", brand: "WM", soft: "all_soft", sales_type: null });
});
Deno.test("了解：要勾品牌和上门 / VC", () => {
  throws(() => resolveTicks({ template_id: "sales", brand: "Legends" }, null, T, true), "上门了解");
  eq(resolveTicks({ template_id: "sales", brand: "Legends", sales_type: "visit" }, null, T, true),
    { template_id: "sales", brand: "Legends", soft: null, sales_type: "visit" });
});
Deno.test("普通：不用勾，勾了也清掉", () =>
  eq(resolveTicks({ template_id: "normal", brand: "WM", soft: "all_soft" }, null, T, true), { template_id: "normal", brand: null, soft: null, sales_type: null }));
Deno.test("改标题不用重选模板；只改品牌会沿用旧的勾", () => {
  eq(resolveTicks({ title: "y" }, { template_id: "photo" }, T), null);
  eq(resolveTicks({ brand: "WM" }, { template_id: "photo", brand: "Legends", soft: "non_all_soft" }, T),
    { template_id: "photo", brand: "WM", soft: "non_all_soft", sales_type: null });
});
Deno.test("Dashboard：未选模板的列出来、普通不算、手动数据取代那个月", () => {
  const rows = [
    { date: "2026-11-03", template_id: "photo", brand: "Legends", soft: "non_all_soft", person: "Tris", title: "a" },
    { date: "2026-11-04", template_id: null, person: "Tris · Google", title: "b" },
    { date: "2026-11-05", template_id: "normal", person: "Tris", title: "c" },
    { date: "2026-11-06", template_id: "gone", person: "Tris", title: "d" },
    { date: "2026-10-20", template_id: "sales", brand: "WM", sales_type: "vc", person: "Eve", title: "e" },
  ];
  const manual = [{ month: "2026-10", person: "Eve", brand: "WM", non_all_soft: 2, all_soft: 0, visit: 1, vc: 0 }];
  const { events, manualMonths } = buildEvents(rows, manual, T);
  eq(manualMonths, ["2026-10"]);
  eq(events.filter((e) => e.date.startsWith("2026-11")).map((e) => [e.type, e.brand]), [["Non-All Soft", "Legends"], ["未选模板", ""], ["未选模板", ""]]);
  eq(events.filter((e) => e.date.startsWith("2026-10")).map((e) => e.type), ["Non-All Soft", "Non-All Soft", "上门了解"]);
});
Deno.test("Rate：不能早于 2026-10-01，至少要有一个数字", () => {
  throws(() => cleanRate({ brand: "WM", cat: "photo", from: "2026-09-30", list: 1400 }), "不能早于");
  throws(() => cleanRate({ brand: "WM", cat: "photo", from: "2026-11-15" }), "请输入 Rate");
  eq(cleanRate({ brand: "WM", cat: "sales", from: "2026-11-15", custom: "3000" }), { brand: "WM", cat: "sales", from: "2026-11-15", list: null, custom: 3000 });
});
Deno.test("模板和标签可以新增；标签颜色可以重复", () => {
  const t = cleanTemplates([...T, { name: "新计费", kind: "sales" }]);
  eq(t.length, 4); eq(t[3].kind, "sales");
  throws(() => cleanTemplates([{ name: "x", kind: "money" }]), "种类");
  const l = cleanLabels([{ id: "a", name: "选片", color: "5" }, { name: "也是黄色", color: "5" }]);
  eq(l.map((x) => x.color), ["5", "5"]);
  const b: any = { label_id: l[1].id }; applyLabel(b, l); eq(b.label, "5");
  eq(calLabels({}).length, 11);
});
