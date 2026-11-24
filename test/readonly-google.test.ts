// Schedule Mode：只从 Google 读，不写回 Google；行程用 Google 日历的颜色
// TEST_DB_URL=postgres://... deno run -A --config supabase/functions/api/deno.json test/readonly-google.test.ts
import pg from "pg";
const PORT = 9101;
const writes: string[] = [];
const server = Deno.serve({ port: PORT, onListen() {} }, (req) => {
  const u = new URL(req.url);
  if (u.pathname === "/token") return Response.json({ access_token: "fake", expires_in: 3600 });
  if (req.method !== "GET" && u.pathname.startsWith("/calendar/")) writes.push(`${req.method} ${u.pathname}`);
  return Response.json({});
});
for (const [k, v] of Object.entries({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s", GOOGLE_TOKEN_URL: `http://localhost:${PORT}/token`, GOOGLE_API_BASE: `http://localhost:${PORT}`, API_BASE: "http://localhost:8081" })) Deno.env.set(k, v);
const db = new pg.Client({ connectionString: Deno.env.get("TEST_DB_URL") });
await db.connect();
await db.query("TRUNCATE users, events, kv, calendars RESTART IDENTITY CASCADE");
await db.query("INSERT INTO users (email, name, password_hash) VALUES ('a@x.com','A','x')");
await db.query("INSERT INTO calendars (name, owner_id) VALUES ('A', 1)");
await db.query("INSERT INTO google_links (user_id, gmail, refresh_token, calendar_id, app_calendar_id) VALUES (1,'a@x.com','rt','a@x.com',1)");
await db.query("INSERT INTO google_calendars (user_id, calendar_id, name, enabled) VALUES (1,'a@x.com','A',TRUE)");
const id = (await db.query("INSERT INTO events (title, start, calendar_id) VALUES ('6961 test', NOW() + interval '1 day', 1) RETURNING id")).rows[0].id;
const id2 = (await db.query("INSERT INTO events (title, start, calendar_id, label) VALUES ('labelled', NOW() + interval '1 day', 1, '5') RETURNING id")).rows[0].id;
await db.query("INSERT INTO event_google (event_id, user_id, google_event_id, calendar_id) VALUES ($1,1,'g1','a@x.com'), ($2,1,'g2','a@x.com')", [id, id2]);

const g = await import("../supabase/functions/api/lib/gcal.mts");
const dbm = await import("../supabase/functions/api/lib/db.mts");
let fails = 0;
const check = (n: string, ok: boolean, got?: unknown) => { console.log(`${ok ? "✅" : "❌"} ${n}${ok ? "" : " got: " + JSON.stringify(got)}`); if (!ok) fails++; };

const r = await g.syncEvent(id, "http://x");
await g.deleteGoogleEvents([{ user_id: 1, google_event_id: "g1", calendar_id: "a@x.com" }]);
check("edit/delete in app → nothing written to Google", (r as any).skipped === true && writes.length === 0, { r, writes });

await dbm.upsertGoogleCal(1, "a@x.com", "A", "#9fc6e7");
await dbm.applyCalendarColors(1);
check("no own colour → Google calendar colour", (await dbm.getEvent(id))?.color === "#9fc6e7", (await dbm.getEvent(id))?.color);
check("own colour (label) kept", (await dbm.getEvent(id2))?.color === dbm.LABELS["5"].hex, (await dbm.getEvent(id2))?.color);

await db.end(); await server.shutdown();
console.log(fails ? `${fails} FAILED` : "ALL PASSED"); Deno.exit(fails ? 1 : 0);
