// 第 2 版后端测试：第一次登录的步骤、生日、申请管理员、通知、最新动态、移除员工、邀请连结、20 种颜色、模板只能改名
// TEST_DB_URL=postgres://... deno run -A --config supabase/functions/api/deno.json test/v2.test.ts
import pg from "pg";
Deno.env.set("API_BASE", "http://localhost:8081");
Deno.env.set("ADMIN_EMAILS", "");
const { handle } = await import("../supabase/functions/api/index.ts");

const db = new pg.Client({ connectionString: Deno.env.get("TEST_DB_URL") });
await db.connect();
await db.query("TRUNCATE users, events, kv, calendars, admin_requests, notifications, activity RESTART IDENTITY CASCADE");

let fails = 0;
const check = (n: string, ok: boolean, got?: unknown) => { console.log(`${ok ? "✅" : "❌"} ${n}${ok ? "" : " got: " + JSON.stringify(got)}`); if (!ok) fails++; };
const flush = () => Promise.all(((globalThis as any).__pending ??= []).splice(0));
async function call(token: string | null, method: string, path: string, body?: unknown) {
  const res = await handle(new Request(`http://localhost/api/${path}`, {
    method, headers: { "content-type": "application/json", "x-lang": "zh", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  const data: any = await res.json().catch(() => null);
  return { status: res.status, data };
}
const signup = async (email: string, name: string) => (await call(null, "POST", "auth/signup", { email, name, password: "abc123!" })).data;

// 1. 注册后还没有日历 → 先走第一次登录的步骤
const boss = await signup("szeweielsa@gmail.com", "Elsa");
check("first admin is admin", boss.user.admin === true && boss.user.onboarded === false, boss.user);
const B = boss.token;
check("no calendar yet → events blocked", (await call(B, "GET", "events")).status === 409);
let r = await call(B, "PATCH", "auth/me", { emoji: "🦊", color: "#ff8fb8", name: "Elsa", birth_month: 2, birth_day: 30 });
check("bad birthday refused", r.status === 400, r);
const tz = "Asia/Kuala_Lumpur";
const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
const [ty, tm, td] = today.split("-").map(Number);
// 生日 = 明天（一定在以后）
const tmr = new Date(Date.UTC(ty, tm - 1, td + 1));
r = await call(B, "PATCH", "auth/me", { emoji: "🦊", color: "#ff8fb8", birth_month: tmr.getUTCMonth() + 1, birth_day: tmr.getUTCDate() });
check("profile saved", r.data.emoji === "🦊" && r.data.color === "#ff8fb8", r.data);
r = await call(B, "POST", "calendars", { name: "The Legend" });
const calId = r.data.id;
await call(B, "PATCH", "auth/me", { onboarded: true });
await flush();
let bd = (await db.query("SELECT title, all_day, label_id, template_id, to_char(start AT TIME ZONE $1, 'MM-DD') AS d FROM events WHERE birthday_user_id = 1 ORDER BY start", [tz])).rows;
check("birthday events this year + next year, all day, label 生日", bd.length === 2 && bd[0].all_day && bd[0].title === "🎂 Elsa" && bd[0].template_id === "normal" && !!bd[0].label_id, bd);
r = await call(B, "PATCH", "auth/me", { name: "Elsa Sze" });
await flush();
bd = (await db.query("SELECT title FROM events WHERE birthday_user_id = 1")).rows;
check("rename → birthday events renamed", bd.length === 2 && bd.every((x: any) => x.title === "🎂 Elsa Sze"), bd);
r = await call(B, "PATCH", "auth/me", { birth_month: null, birth_day: null });
await flush();
check("clear birthday → future birthday events removed", (await db.query("SELECT 1 FROM events WHERE birthday_user_id = 1")).rowCount === 0);

// 2. 邀请连结：只有管理员；3 天有效
const staff = await signup("amy@test.com", "Amy");
const S = staff.token;
check("staff is not admin", staff.user.admin === false);
r = await call(B, "POST", `calendars/${calId}/invite`, { role: "editor" });
const inv = r.data;
check("admin invite link valid 3 days", !!inv.token && Math.abs(Date.parse(inv.expires_at) - Date.now() - 3 * 86400_000) < 60_000, inv);
r = await call(S, "POST", "join", { token: inv.token });
check("staff joins with link", r.data.id === calId, r);
r = await call(S, "POST", `calendars/${calId}/invite`, { role: "editor" });
check("staff cannot make invite links", r.status === 403, r);
await db.query("UPDATE calendar_invites SET expires_at = NOW() - interval '1 minute'");
const late = await signup("late@test.com", "Late");
r = await call(late.token, "POST", "join", { token: inv.token });
check("expired link refused", r.status === 404, r);

// 3. 申请管理员 → 管理员收到通知 → 批准
r = await call(S, "POST", "admin-request");
check("staff applies", r.data.request?.status === "pending", r);
await call(S, "POST", "admin-request"); // 按两次不会重复
let n = (await call(B, "GET", "notifications")).data;
check("admin notified once", n.unread === 1 && n.items[0].kind === "admin_request" && n.items[0].body.includes("Amy"), n);
const reqs = (await call(B, "GET", "admin/requests")).data;
check("admin sees request", reqs.length === 1 && reqs[0].name === "Amy", reqs);
r = await call(S, "GET", "admin/requests");
check("staff cannot see requests", r.status === 403);
r = await call(B, "POST", `admin/requests/${reqs[0].id}`, { approve: true });
check("approved", r.data.ok && r.data.requests.length === 0, r);
const amyMe = (await call(S, "GET", "auth/me")).data;
check("Amy is admin now", amyMe.admin === true, amyMe);
n = (await call(B, "GET", "notifications")).data;
check("handled request → notification read", n.unread === 0, n);
const admins = (await call(B, "GET", "admin/list")).data;
check("admin list: Elsa fixed, Amy not", admins.length === 2 && admins.find((a: any) => a.name === "Elsa Sze").fixed && !admins.find((a: any) => a.name === "Amy").fixed, admins);
r = await call(S, "DELETE", "admin/list/1");
check("first admin cannot be removed", r.status === 400, r);
await call(B, "DELETE", "admin/list/2");
check("Amy removed from admins", (await call(S, "GET", "auth/me")).data.admin === false);

// 4. 模板只有 3 个、只能改名；20 种颜色；+ 新增标签
r = await call(B, "PUT", "event-templates", { templates: [{ id: "photo", name: "选片 Selection" }, { id: "extra", name: "x" }] });
check("templates: 3 fixed, rename only", r.data.templates.length === 3 && r.data.templates[0].name === "选片 Selection" && r.data.templates[2].kind === "normal", r.data);
r = await call(S, "POST", "label-list", { name: "试婚纱", color: "15", template_id: "photo" });
check("staff adds label with colour 15 + template", r.data.label?.color === "15" && r.data.label?.template_id === "photo", r);
const lab = r.data.label;
const cfg = (await call(S, "GET", "config")).data;
check("20 colours", Object.keys(cfg.labels).length === 20, Object.keys(cfg.labels).length);

// 5. 新增行程：负责人 = 建立的人；最新动态
r = await call(S, "POST", "events", { title: "WM0222 试婚纱", start: new Date(Date.now() + 86400_000).toISOString(), all_day: true, template_id: "photo", brand: "WM", soft: "all_soft", label_id: lab.id });
const ev = r.data;
check("event created, label colour stored, creator = Amy", ev.label === "15" && ev.creator_name === "Amy" && ev.created_by_id === 2, ev);
const { googleColor } = await import("../supabase/functions/api/lib/db.mts");
check("colour 15 → Google colour 2", googleColor("15") === "2" && googleColor("5") === "5");
r = await call(B, "DELETE", `events/${ev.id}`);
check("anyone (editor) can delete", r.data.ok, r);
const feed = (await call(S, "GET", "activity")).data;
const acts = feed.map((a: any) => a.action);
check("activity: created, deleted, label, template, joined", ["event_created", "event_deleted", "label_added", "template_renamed", "joined"].every((x) => acts.includes(x)), acts);

// 6. 移除员工：名字变「未知用户」，资料保留，不能再登录
const ev2 = (await call(S, "POST", "events", { title: "Amy 的行程", start: new Date(Date.now() + 2 * 86400_000).toISOString(), all_day: true, template_id: "normal" })).data;
r = await call(S, "DELETE", "people/1");
check("staff cannot remove people", r.status === 403, r);
r = await call(B, "DELETE", "people/2");
check("admin removes Amy", r.data.ok, r);
const kept = (await call(B, "GET", `events/${ev2.id}`)).data;
check("her event kept, shown as 未知用户", kept.title === "Amy 的行程" && kept.creator_name === "未知用户" && kept.created_by === "未知用户", kept);
check("removed user logged out", (await call(S, "GET", "auth/me")).status === 401);
check("her Gmail can register again", !!(await signup("amy@test.com", "Amy 2")).token);
const people = (await call(B, "GET", "people")).data;
check("People list without her", people.length === 1 && people[0].name === "Elsa Sze", people);
const feed2 = (await call(B, "GET", "activity")).data;
check("activity by her shows 未知用户", feed2.some((a: any) => a.action === "event_created" && a.name === "未知用户"), feed2.slice(0, 4));

await flush();
await db.end();
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
Deno.exit(fails ? 1 : 0);
