// Schedule Mode 测试：假的 Google 通讯录 + 假的 WhatsApp API + 本地 Postgres
// TEST_DB_URL=postgres://... deno run -A --config supabase/functions/api/deno.json test/schedule-mode.test.ts
import pg from "pg";

const PORT = 9100;
const sent: any[] = [];
const contacts = [
  { names: [{ displayName: "6961" }], phoneNumbers: [{ value: "11-5660 4342" }] },          // 只有号码、电话少了 0
  { names: [{ displayName: "WM 1902 Joey" }], phoneNumbers: [{ value: "+60 12-345 6789" }] },
  { names: [{ displayName: "6895 A" }], phoneNumbers: [{ value: "013-111 1111" }] },          // 两个联络人都是 6895
  { names: [{ displayName: "6895 B" }], phoneNumbers: [{ value: "013-222 2222" }] },
  { names: [{ displayName: "Mum" }], phoneNumbers: [{ value: "019-000 0000" }] },
  { names: [{ displayName: "8001 Tan (SG)" }], phoneNumbers: [{ value: "+65 9123 4567" }] },   // 外国号码
];
const server = Deno.serve({ port: PORT, onListen() {} }, async (req) => {
  const u = new URL(req.url);
  if (u.pathname === "/token") return Response.json({ access_token: "fake", expires_in: 3600 });
  if (u.pathname === "/v1/people/me/connections") return Response.json({ connections: contacts });
  if (u.pathname.endsWith("/messages")) { sent.push(await req.json()); return Response.json({ messages: [{ id: "wamid.test" }] }); }
  return new Response("nope", { status: 404 });
});

const env: Record<string, string> = {
  GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret",
  GOOGLE_TOKEN_URL: `http://localhost:${PORT}/token`, GOOGLE_PEOPLE_API_BASE: `http://localhost:${PORT}`,
  WHATSAPP_TOKEN: "fake", WHATSAPP_PHONE_NUMBER_ID: "123", WHATSAPP_API_BASE: `http://localhost:${PORT}`, WHATSAPP_API_VERSION: "v99",
  API_BASE: "http://localhost:8081",
};
for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);

const db = new pg.Client({ connectionString: Deno.env.get("TEST_DB_URL") });
await db.connect();
await db.query("TRUNCATE users, events, kv, contact_bookings, wa_sent RESTART IDENTITY CASCADE");
await db.query("INSERT INTO users (email, name, password_hash) VALUES ('boss@example.com', 'Boss', 'x')");
await db.query("INSERT INTO google_links (user_id, gmail, refresh_token, calendar_id) VALUES (1, 'boss@example.com', 'rt', 'boss@example.com')");

// 明天（马来西亚时间）
const tz = "Asia/Kuala_Lumpur";
const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
const tomorrow = new Date(Date.parse(today + "T00:00:00Z") + 86400_000).toISOString().slice(0, 10);
const at = (hhmm: string) => new Date(`${tomorrow}T${hhmm}:00+08:00`).toISOString();
const ev = async (title: string, start: string, allDay = false, phone: string | null = null, source: string | null = null) =>
  (await db.query(`INSERT INTO events (title, start, all_day, customer_phone, customer_note, customer_source) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [title, start, allDay, phone, phone ? "manual note" : null, source])).rows[0].id;
const A = await ev("6961 选礼服 Sam & Ivy", at("15:30"));
const B = await ev("WM1902 PW (Eric+Ruyin) Kiat", at("00:00"), true);
const C = await ev("6895 选片 Gibson", at("10:00"));
const Dn = await ev("7030 PW", at("11:00"));
const E = await ev("Meera off day", at("00:00"), true);
const F = await ev("6238 PW", at("12:00"), false, "0199999999", "manual");
const G = await ev("8001 PW Singapore", at("13:00"));

const { autoFillUpcoming, scheduleOverview } = await import("../supabase/functions/api/lib/schedule.mts");
const wa = await import("../supabase/functions/api/lib/whatsapp.mts");
const { saveSettings, getSettings } = await import("../supabase/functions/api/lib/settings.mts");

let fails = 0;
const check = (name: string, ok: boolean, got?: unknown) => { console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : "  got: " + JSON.stringify(got)}`); if (!ok) fails++; };
const row = async (id: number) => (await db.query("SELECT * FROM events WHERE id = $1", [id])).rows[0];

// 1. 自动填
const r = await autoFillUpcoming({ forceContacts: true });
check("autofill result", r.filled === 3 && r.notFound === 1 && r.multiple === 1, r);
const a = await row(A), b = await row(B), c = await row(C), d = await row(Dn), e = await row(E), f = await row(F);
check("6961 → phone 601156604342", a.customer_phone === "601156604342" && a.customer_source === "auto", a);
check("6961 → no name (number only)", a.customer_name === null, a.customer_name);
check("WM1902 (contact 'WM 1902 Joey') → Joey", b.customer_phone === "60123456789" && b.customer_name === "Joey", b);
check("6895 → multiple, not filled", c.customer_lookup === "multiple" && !c.customer_phone && /6895 A/.test(c.customer_lookup_detail), c);
check("7030 → notfound", d.customer_lookup === "notfound" && !d.customer_phone, d);
check("off day → untouched", !e.customer_phone && !e.customer_lookup, e);
check("manual phone → untouched", f.customer_phone === "0199999999" && f.customer_source === "manual", f);

check("foreign contact +65 → 6591234567", (await row(G)).customer_phone === "6591234567" && (await row(G)).customer_name === "Tan SG", await row(G));

// 2. 中文内容
const s = await getSettings();
const textA = wa.fillText(a.customer_note, { ...a, start: a.start.toISOString() }, tz);
console.log("   6961 message:", JSON.stringify(textA));
check("Chinese text has booking + time", textA.includes("6961") && textA.includes("下午3:30") && textA.startsWith("您好，"), textA);
const textB = wa.fillText(b.customer_note, { ...b, start: b.start.toISOString() }, tz);
console.log("   WM1902 message:", JSON.stringify(textB));
check("all-day: no time, has name", textB.startsWith("您好 Joey，") && textB.includes("WM1902") && !/\s{2}/.test(textB), textB);

// 3. 发送时间：前一天下午 2 点
const sendAt = wa.sendTimeFor({ start: a.start.toISOString() }, tz, wa.sendHourOf(s));
check("send time = day before 14:00 MYT", sendAt.toLocaleString("en-GB", { timeZone: tz }).startsWith(new Date(Date.parse(today + "T00:00:00Z")).toLocaleDateString("en-GB", { timeZone: "UTC" })) && sendAt.toLocaleTimeString("en-GB", { timeZone: tz }) === "14:00:00", sendAt.toISOString());

// 4. 预览模式（打开时）：不发
await saveSettings({ schedule: { ...(s.schedule || {}), preview: true } });
const nowMy = Number(new Date().toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }));
const p = await wa.sendDueCustomerMessages();
check("preview mode → nothing sent", (p as any).preview === true && sent.length === 0, { p, sent });
const ov = await scheduleOverview((x: any, t: string) => wa.sendTimeFor(x, t, 14));
const st = Object.fromEntries(ov.map((x: any) => [x.booking, x.status]));
check("overview statuses (PW without 拍摄 = no reminder type)", st["6895"] === "multiple" && st["7030"] === "notype" && st["6961"] === "preview" && st["8001"] === "notype" && ov.length === 6, st);
check("overview has template per type", ov.find((x: any) => x.booking === "6961")?.template === "reminder_gown_selection" && ov.find((x: any) => x.booking === "6895")?.template === "reminder_photo_select", ov);

// 5. 关掉预览 → 到时间的会发（现在 >= 下午 2 点才会发）
await saveSettings({ schedule: { ...(s.schedule || {}), preview: false } });
const res = await wa.sendDueCustomerMessages();
if (nowMy >= 14) {
  check("sent after 2pm (6961 auto + 6238 manual; PW-only auto skipped)", (res as any).sent === 2 && (res as any).skipped === 2 && sent.length === 2, { res, n: sent.length });
  const m = sent.find((x) => x.to === "601156604342");
  check("6961 → template reminder_gown_selection, {{1}} = 3:30pm", m?.template?.name === "reminder_gown_selection" && m.template.components[0].parameters[0].text === "3:30pm", m);
  const again = await wa.sendDueCustomerMessages();
  check("not sent twice", (again as any).sent === 0 && sent.length === 2, again);
} else {
  check("before 2pm → nothing due yet", (res as any).sent === 0, res);
}

// 6. 改了讯息 → 自动提醒都用新的讯息；测试发送
await saveSettings({ schedule: { preview: false, text: "新讯息 {booking}" } });
const n0 = sent.length;
await db.query("UPDATE events SET customer_sent_at = NULL WHERE id = $1", [A]);
await wa.sendCustomerMessage(A, { force: true });
check("auto event with type → its template", sent.length === n0 + 1 && sent.at(-1).template?.name === "reminder_gown_selection" && sent.at(-1).template.components[0].parameters[0].text === "3:30pm", sent.at(-1));
const tr = await wa.sendTest("011-5660 4342", "测试 {booking} {date}");
check("test send", tr.to === "601156604342" && sent.at(-1).text.body.startsWith("测试 6961 "), sent.at(-1));

// 7. 找不到电话 → 员工在 WhatsApp 提醒页签输入（外国号码），之后通讯录不会覆盖，用现在的讯息
const dbm = await import("../supabase/functions/api/lib/db.mts");
await dbm.setTypedPhone(Dn, wa.normPhone("+44 7911 123456"), "old");
await autoFillUpcoming({ forceContacts: true });
const d2 = await row(Dn);
check("typed UK phone kept", d2.customer_phone === "447911123456" && d2.customer_source === "typed" && !d2.customer_lookup, d2);
await wa.sendCustomerMessage(Dn, { force: true });
check("typed event without type, manual send → current message", sent.at(-1).to === "447911123456" && sent.at(-1).text.body === "新讯息 7030", sent.at(-1));

// 8. 员工改了电话 → 不再被通讯录覆盖
await db.query("UPDATE events SET customer_phone = '0177777777', customer_source = 'manual' WHERE id = $1", [B]);
await autoFillUpcoming({ forceContacts: true });
check("staff edit not overwritten", (await row(B)).customer_phone === "0177777777");

// 9. 每 3 天检查未来一个月：20 天后的行程也会被找到；3 天内不会再跑
const { weeklyScanIfDue } = await import("../supabase/functions/api/lib/schedule.mts");
const far = new Date(Date.now() + 20 * 86400_000).toISOString();
const H = (await db.query(`INSERT INTO events (title, start) VALUES ('6961 拍摄 (20 days later)', $1) RETURNING id`, [far])).rows[0].id;
const J = (await db.query(`INSERT INTO events (title, start) VALUES ('9999 选片 nobody', $1) RETURNING id`, [far])).rows[0].id;
const s0 = await getSettings(); await saveSettings({ schedule: { ...(s0.schedule || {}), weeklyDate: undefined } });
const w1: any = await weeklyScanIfDue(new Date(`${today}T09:00:00+08:00`));
check("first run scans a month ahead", w1.weekly && (await row(H)).customer_phone === "601156604342" && (await row(J)).customer_lookup === "notfound", { w1, H: await row(H), J: await row(J) });
const plus = (n: number) => new Date(Date.parse(today + "T09:00:00+08:00") + n * 86400_000);
check("not again after 1 day", (await weeklyScanIfDue(plus(1)) as any).skipped === true);
check("not again after 2 days", (await weeklyScanIfDue(plus(2)) as any).skipped === true);
check("runs again after 3 days", (await weeklyScanIfDue(plus(3)) as any).weekly === true);
const ovAll = await scheduleOverview((x: any, t: string) => wa.sendTimeFor(x, t, 14));
check("far not-found shows in list", ovAll.some((x: any) => x.id === J && x.status === "notfound"));

await db.end();
await server.shutdown();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
Deno.exit(fails ? 1 : 0);
