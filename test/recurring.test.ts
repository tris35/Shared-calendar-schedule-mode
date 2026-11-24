// 从 Google 读：主日历先读；只读过去 2 个月～未来 1 年；重复行程展开；Google 删掉的 App 也拿掉；分几次读完；Google 不会被写入
// TEST_DB_URL=postgres://... deno run -A --config supabase/functions/api/deno.json test/recurring.test.ts
import pg from "pg";
const PORT = 9102;
const calls: { cal: string; q: URLSearchParams }[] = [];
const writes: string[] = [];
let mainItems: any[] = [];
let photoPages = 1;
const server = Deno.serve({ port: PORT, onListen() {} }, (req) => {
  const u = new URL(req.url);
  if (u.pathname === "/token") return Response.json({ access_token: "fake", expires_in: 3600 });
  if (req.method !== "GET") { if (u.pathname.startsWith("/calendar/v3/calendars")) writes.push(`${req.method} ${u.pathname}`); return Response.json({}); }
  if (u.pathname.endsWith("/calendarList")) return Response.json({ items: [
    { id: "aaa-photo@group.calendar.google.com", summary: "拍摄", backgroundColor: "#f6bf26" },
    { id: "a@x.com", summary: "A", primary: true, backgroundColor: "#9fc6e7" }] });
  if (u.pathname.includes("/events")) {
    const cal = decodeURIComponent(u.pathname.split("/calendars/")[1].split("/events")[0]);
    calls.push({ cal, q: u.searchParams });
    if (cal === "a@x.com") return Response.json({ items: mainItems });
    // 拍摄：分两页
    if (photoPages === 2 && !u.searchParams.get("pageToken")) return Response.json({ items: [{ id: "p1", summary: "拍摄 1", start: { date: "2026-11-26" }, end: { date: "2026-11-27" }, etag: "p1" }], nextPageToken: "PAGE2" });
    return Response.json({ items: [{ id: "p2", summary: "拍摄 2", start: { date: "2026-11-27" }, end: { date: "2026-11-28" }, etag: "p2" }] });
  }
  return Response.json({});
});
for (const [k, v] of Object.entries({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s", GOOGLE_TOKEN_URL: `http://localhost:${PORT}/token`, GOOGLE_API_BASE: `http://localhost:${PORT}`, API_BASE: "http://localhost:8081" })) Deno.env.set(k, v);
const db = new pg.Client({ connectionString: Deno.env.get("TEST_DB_URL") });
await db.connect();
await db.query("TRUNCATE users, events, kv, calendars RESTART IDENTITY CASCADE");
await db.query("INSERT INTO users (email, name, password_hash) VALUES ('a@x.com','A','x')");
await db.query("INSERT INTO calendars (name, owner_id) VALUES ('A', 1)");
await db.query("INSERT INTO google_links (user_id, gmail, refresh_token, calendar_id, app_calendar_id) VALUES (1,'a@x.com','rt','a@x.com',1)");
// 以前用旧方式读进来的：重复行程只有一笔（master）
await db.query("INSERT INTO google_calendars (user_id, calendar_id, name, enabled, sync_token) VALUES (1,'a@x.com','A',TRUE,'OLDTOKEN')");
const old = (await db.query("INSERT INTO events (title, start, all_day, calendar_id) VALUES ('Meera off day', '2026-11-23T16:00:00Z', TRUE, 1) RETURNING id")).rows[0].id;
await db.query("INSERT INTO event_google (event_id, user_id, google_event_id, calendar_id, etag, synced_at) VALUES ($1,1,'r1','a@x.com','0',NOW())", [old]);

mainItems = [
  { id: "r1_20261124", recurringEventId: "r1", summary: "Meera off day", start: { date: "2026-11-24" }, end: { date: "2026-11-25" }, etag: "1" },
  { id: "r1_20261201", recurringEventId: "r1", summary: "Meera off day", start: { date: "2026-12-01" }, end: { date: "2026-12-02" }, etag: "2" },
  { id: "e1", summary: "6961 选礼服", start: { dateTime: "2026-11-25T15:30:00+08:00" }, end: { dateTime: "2026-11-25T17:30:00+08:00" }, etag: "3" },
  { id: "s1", summary: "(Esther) STORY", colorId: "5", start: { date: "2026-11-23" }, end: { date: "2026-11-24" }, etag: "4" },
];
const g = await import("../supabase/functions/api/lib/gcal.mts");
let fails = 0;
const check = (n: string, ok: boolean, got?: unknown) => { console.log(`${ok ? "✅" : "❌"} ${n}${ok ? "" : " got: " + JSON.stringify(got)}`); if (!ok) fails++; };
const titles = async () => (await db.query("SELECT title FROM events ORDER BY start, title")).rows.map((r: any) => r.title);
const pull = (deadline?: number) => g.pullFromGoogle(1, "http://x", { minSeconds: 0, ...(deadline ? { deadline } : {}) });

const r: any = await pull();
check("pull ok", r.ok && r.done, r);
check("main calendar read first", calls[0]?.cal === "a@x.com", calls.map((c) => c.cal));
const q0 = calls[0].q;
const days = (iso: string) => Math.round((Date.parse(iso) - Date.now()) / 86400_000);
check("only 2 months back … 1 year ahead, repeats expanded", q0.get("singleEvents") === "true" && days(q0.get("timeMin")!) === -60 && days(q0.get("timeMax")!) === 365 && !q0.get("syncToken"), Object.fromEntries(q0));
let t = await titles();
check("old single copy removed; every repeat + STORY imported", t.filter((x) => x === "Meera off day").length === 2 && t.includes("(Esther) STORY") && t.includes("6961 选礼服") && t.includes("拍摄 2"), t);
const story = (await db.query("SELECT label FROM events WHERE title = '(Esther) STORY'")).rows[0];
check("STORY keeps its yellow colour (label 5)", story.label === "5", story);

// Google 删掉 6961 → 下一轮 App 也拿掉
mainItems = mainItems.filter((e) => e.id !== "e1");
await pull();
t = await titles();
check("deleted in Google → removed from app", !t.includes("6961 选礼服") && t.includes("(Esther) STORY"), t);

// 拍摄 有两页，时间到了 → 记住第 2 页，下次继续
photoPages = 2; calls.length = 0;
await db.query("UPDATE google_calendars SET sync_token = NULL WHERE calendar_id LIKE 'aaa%'");
await db.query("DELETE FROM events WHERE title LIKE '拍摄%'");
const r2: any = await pull(Date.now() - 1);
const tok = (await db.query("SELECT sync_token FROM google_calendars WHERE calendar_id LIKE 'aaa%'")).rows[0].sync_token;
check("time up → remembers next page", r2.done === false || /PAGE2$/.test(tok), { r2, tok });
await pull();
t = await titles();
check("next time continues from page 2, both pages imported", t.includes("拍摄 1") && t.includes("拍摄 2") && calls.some((c) => c.q.get("pageToken") === "PAGE2"), t);
check("reading from Google does not write anything back (only one person connected)", writes.length === 0, writes);

// 连接 Google 之前在 App 建的行程 → 按「同步」后写进 Google；之后读回来不会重复
await db.query("UPDATE google_calendars SET enabled = FALSE WHERE calendar_id LIKE 'aaa%'");
const appEv = (await db.query("INSERT INTO events (title, start, calendar_id) VALUES ('建在 App 的行程', NOW() + interval '2 day', 1) RETURNING id")).rows[0].id;
const sr: any = await g.syncEvent(appEv, "http://x");
check("app event written to Google", sr.ok && writes.some((w) => w.startsWith("PATCH") || w.startsWith("POST")), { sr, writes });
const gid = (await db.query("SELECT google_event_id FROM event_google WHERE event_id = $1", [appEv])).rows[0].google_event_id;
mainItems.push({ id: gid, summary: "建在 App 的行程", start: { dateTime: new Date(Date.now() + 2 * 86400_000).toISOString() }, etag: "x", extendedProperties: { private: { familyCalendarId: String(appEv) } } });
await pull();
t = await titles();
check("read back from Google → not duplicated", t.filter((x) => x === "建在 App 的行程").length === 1, t);

await db.end(); await server.shutdown();
console.log(fails ? `${fails} FAILED` : "ALL PASSED"); Deno.exit(fails ? 1 : 0);
