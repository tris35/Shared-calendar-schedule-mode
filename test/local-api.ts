// 本地测试：用 Deno 执行后端函数（需要本地 Postgres）
// TEST_DB_URL=postgres://... LOCAL_PHOTO_DIR=/tmp/photos API_BASE=http://localhost:8081 APP_URL=http://localhost:8080/Shared-calendar \
//   deno run -A --config supabase/functions/api/deno.json test/local-api.ts
import { handle } from "../supabase/functions/api/index.ts";

const port = Number(Deno.env.get("PORT") || 8081);
Deno.serve({ port }, async (req) => {
  if (new URL(req.url).pathname === "/__test/flush") { // 等背景工作（Google 同步等）做完
    await Promise.all(((globalThis as any).__pending ??= []).splice(0));
    return Response.json({ ok: true });
  }
  return handle(req);
});
