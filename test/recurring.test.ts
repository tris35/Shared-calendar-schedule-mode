// 重复的行程要展开成每一次；旧的（没展开的）资料会清掉重读一次；Google 不会被写入
// TEST_DB_URL=postgres://... deno run -A --config supabase/functions/api/deno.json test/recurring.test.ts
import pg from "pg";
const PORT = 9102;
const calls: string[] = [];
const writes: string[] = [];
const server = Deno.serve({ port: PORT, onListen() {} }, (req) => {
  const u = new URL(req.url);
  if (u.pathname === "/token") return Response.json({ access_token: "fake", expires_in: 3600 });
  if (req.method !== "GET") { if (u.pathname.startsWith("/calendar/v3/calendars")) writes.push(`${req.method} ${u.pathname}`); return Response.json({}); }
  if (u.pathname.endsWith("/calendarList")) return Response.json({ items: [{ id: "a@x.com", summary: "A", primary: true, backgroundColor: "#9fc6e7" }] });
  if (u.pathname.includes("/events")) {
    calls.push(u.search);
    const single = u.searchParams.get("singleEvents") === "true";
    if (u.searchParams.get("syncToken")) return Response.json({ items: [], nextSyncToken: "T2" });
    const items = single
      ? [{ id: "r1_20261124", recurringEventId: "r1", summary: "Meera off day", start: { date: "2026-11-24" }, end: { date: "2026-11-25" }, etag: "1" },
         { id: "r1_20261201", recurringEventId: "r1", summary: "Meera off day", start: { date: "2026-12-01" }, end: { date: "2026-12-02" }, etag: "2" },
         { id: "e1", summary: "6961 选礼服", start: { dateTime: "2026-11-25T15:30:00+08:00" }, end: { dateTime: "2026-11-25T17:30:00+08:00" }, etag: "3" }]
      : [{ id: "r1", summary: "Meera off day", recurrence: ["RRULE:FREQ=WEEKLY"], start: { date: "2026-11-24" }, end: { date: "2026-11-25" }, etag: "0" }];
    return Response.json({ items, nextSyncToken: "T1" });
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
await db.query("INSERT INTO event_google (event_id, user_id, google_event_id, calendar_id, etag) VALUES ($1,1,'r1','a@x.com','0')", [old]);

const g = await import("../supabase/functions/api/lib/gcal.mts");
let fails = 0;
const check = (n: string, ok: boolean, got?: unknown) => { console.log(`${ok ? "✅" : "❌"} ${n}${ok ? "" : " got: " + JSON.stringify(got)}`); if (!ok) fails++; };

const r: any = await g.pullFromGoogle(1, "http://x", { minSeconds: 0 });
const evs = (await db.query("SELECT title, start, all_day, source_color FROM events ORDER BY start")).rows;
check("pull ok", r.ok, r);
check("asked Google to expand repeats (singleEvents=true)", calls.every((c) => c.includes("singleEvents=true")), calls);
check("old single copy removed, every repeat imported", evs.filter((e: any) => e.title === "Meera off day").length === 2 && evs.length === 3, evs);
check("weekly repeat on 24 Nov and 1 Dec", evs.filter((e: any) => e.title === "Meera off day").map((e: any) => e.start.toISOString().slice(0, 10)).join() === "2026-11-23,2026-11-30", evs.map((e: any) => e.start)); // 00:00 MYT = 16:00Z 前一天
check("calendar colour applied", evs.every((e: any) => e.source_color === "#9fc6e7"), evs.map((e: any) => e.source_color));
const tok = (await db.query("SELECT sync_token FROM google_calendars")).rows[0].sync_token;
check("new sync position saved", tok === "v2:T1", tok);
calls.length = 0;
await db.query("UPDATE google_links SET last_pull_at = NULL");
await g.pullFromGoogle(1, "http://x", { minSeconds: 0 });
check("next pull uses saved position, still expanded", calls.length === 1 && calls[0].includes("syncToken=T1") && calls[0].includes("singleEvents=true"), calls);
check("nothing written to Google", writes.length === 0, writes);

await db.end(); await server.shutdown();
console.log(fails ? `${fails} FAILED` : "ALL PASSED"); Deno.exit(fails ? 1 : 0);
