// Claude 助手：用自然语言（和照片）查看/新增/修改行程、成员、留言
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import * as db from "./db.mts";
import { env } from "./env.mts";

const MODEL = () => env("CLAUDE_MODEL") || "claude-opus-5-5";
export const claudeEnabled = () => Boolean(env("ANTHROPIC_API_KEY"));
let _client: Anthropic | null = null;
const client = () => (claudeEnabled() ? (_client ??= new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") })) : null);

// 安全回退：如果 Claude 拒答某个请求，服务端自动换到合适的模型继续
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } as const;
const AUTHOR = "Claude";

const json = (v: unknown) => JSON.stringify(v ?? null);
const fmt = (iso: string | Date, tz: string) =>
  new Date(iso).toLocaleString("zh-CN", { timeZone: tz, dateStyle: "full", timeStyle: "short" });

/** hooks：资料改动后通知（用来同步 Google 日历） */
export type ChangeHooks = { changed: (eventId: number) => void; deleted: (mappings: any[]) => void; canWhatsApp?: boolean };

const labelIds = Object.keys(db.LABELS) as [string, ...string[]];
const labelHelp = Object.entries(db.LABELS).map(([id, l]) => `${id}=${l.name}`).join("，");

function buildTools(tz: string, hooks: ChangeHooks) {
  const isoTime = z.string().describe(`ISO 8601 时间，务必带时区偏移，例如 2026-11-25T15:00:00+08:00。用户时区：${tz}`);
  const fields = {
    end: isoTime.optional(),
    all_day: z.boolean().optional().describe("全天行程（可跨多天）"),
    notes: z.string().optional(),
    label: z.enum(labelIds).optional().describe(`颜色标签：${labelHelp}`),
    member_id: z.number().int().optional().describe("负责/参加的成员 id（见 list_members）"),
    remind: z.boolean().optional().describe("前一天 12:00 Google 日历通知，默认开"),
    customer_phone: z.string().optional().describe("客户的 WhatsApp 电话号码，例如 012-345 6789"),
    customer_note: z.string().optional().describe("给客户的讯息（可多行）。会在行程前一天下午 4 点自动用 WhatsApp 发给客户"),
    customer_auto: z.boolean().optional().describe("是否自动发送给客户的讯息，默认开；用户说取消发送时设为 false"),
  };
  if (!hooks.canWhatsApp) { delete (fields as any).customer_phone; delete (fields as any).customer_note; delete (fields as any).customer_auto; } // 没权限就不能设定 WhatsApp
  return [
    betaZodTool({
      name: "list_events",
      description: "查询日历中的行程。可按时间范围或关键字筛选。",
      inputSchema: z.object({ from: isoTime.optional(), to: isoTime.optional(), q: z.string().optional().describe("标题或备注中的关键字") }),
      run: async (i) => json(await db.listEvents(i)),
    }),
    betaZodTool({
      name: "create_event",
      description: "新增行程。",
      inputSchema: z.object({ title: z.string(), start: isoTime, ...fields }),
      run: async (i) => { const e = await db.createEvent(i, AUTHOR); hooks.changed(e.id); return json(e); },
    }),
    betaZodTool({
      name: "update_event",
      description: "修改已有行程（只传要改的字段）。",
      inputSchema: z.object({ id: z.number().int(), title: z.string().optional(), start: isoTime.optional(), ...fields }),
      run: async ({ id, ...rest }) => {
        const e = await db.updateEvent(id, rest, AUTHOR);
        if (!e) return `找不到行程 ${id}`;
        hooks.changed(id);
        return json(e);
      },
    }),
    betaZodTool({
      name: "delete_event",
      description: "删除行程。只有用户明确要求删除时才使用。",
      inputSchema: z.object({ id: z.number().int() }),
      run: async ({ id }) => {
        const mappings = await db.listEventGoogle(id);
        if (!(await db.deleteEvent(id))) return `找不到行程 ${id}`;
        hooks.deleted(mappings);
        return "已删除";
      },
    }),
    betaZodTool({
      name: "list_members",
      description: "列出成员。",
      inputSchema: z.object({}),
      run: async () => json(await db.listMembers()),
    }),
    betaZodTool({
      name: "create_member",
      description: "新增成员。",
      inputSchema: z.object({ name: z.string() }),
      run: async (i) => json(await db.createMember(i)),
    }),
    betaZodTool({
      name: "get_event_details",
      description: "读取单个行程的完整内容和时间线（留言、照片、修改纪录，含是谁发的）。",
      inputSchema: z.object({ id: z.number().int() }),
      run: async ({ id }) => {
        const e = await db.getEvent(id);
        if (!e) return `找不到行程 ${id}`;
        return json({ ...e, timeline: await db.eventFeed(id) });
      },
    }),
    betaZodTool({
      name: "attach_photo",
      description: "把用户在对话中上传的照片（photo_id）附加到某个行程。",
      inputSchema: z.object({ photo_id: z.number().int(), event_id: z.number().int(), caption: z.string().optional() }),
      run: async ({ photo_id, event_id, caption }) => {
        if (!(await db.getPhoto(photo_id))) return `找不到照片 ${photo_id}`;
        if (!(await db.getEvent(event_id))) return `找不到行程 ${event_id}`;
        await db.attachPhoto(photo_id, event_id, caption);
        hooks.changed(event_id);
        return "已附加";
      },
    }),
    betaZodTool({
      name: "add_comment",
      description: "在行程里写一条留言，或在某张照片下写评论（给 photo_id 时为照片评论）。",
      inputSchema: z.object({ event_id: z.number().int().optional(), photo_id: z.number().int().optional(), body: z.string() }),
      run: async ({ event_id, photo_id, body }) => {
        if (!event_id && !photo_id) return "需要 event_id 或 photo_id";
        if (!photo_id && !(await db.getEvent(event_id!))) return `找不到行程 ${event_id}`;
        const c = await db.addComment({ event_id, photo_id, author: AUTHOR, body });
        if (c.event_id) hooks.changed(c.event_id);
        return json(c);
      },
    }),
  ];
}

const LANG_NAMES: Record<string, string> = { en: "English", zh: "简体中文", "zh-TW": "繁體中文", ms: "Bahasa Melayu" };
function systemPrompt(tz: string, userName: string, lang: string) {
  const now = new Date();
  return `你是一个共享日历 App 的助手，帮大家管理行程、留言和照片。正在和你对话的是「${userName}」。
请用 ${LANG_NAMES[lang] || "English"} 回答（除非用户用别的语言跟你说话）。
现在时间：${fmt(now, tz)}（${now.toISOString()}），用户时区 ${tz}。
- 用工具读取和修改资料，不要凭空编造行程或成员。
- 行程会自动同步到 Google 日历（含前一天 12:00 的通知），你不需要另外处理。
- 用户上传照片（例如手写行程表、截图）时，读取其中的信息并整理成行程，或按要求附加到行程。
- 有歧义（例如日期不明确）时先问清楚再改。删除前必须是用户明确要求的。
- 完成后简短总结做了什么，时间用用户时区显示。`;
}

export async function chat(history: { role: "user" | "assistant"; content: string }[], text: string,
  photos: { id: number; mime: string; data: string }[], tz: string, userName: string, lang: string, hooks: ChangeHooks) {
  const c = client();
  if (!c) return lang.startsWith("zh") ? "尚未设置 ANTHROPIC_API_KEY，Claude 助手未启用。" : lang === "ms" ? "ANTHROPIC_API_KEY belum ditetapkan, jadi pembantu Claude dimatikan." : "ANTHROPIC_API_KEY isn't set, so the Claude assistant is off.";
  const content: any[] = photos.map((p) => ({ type: "image", source: { type: "base64", media_type: p.mime, data: p.data } }));
  const note = photos.length ? `\n\n[已上传照片 photo_id: ${photos.map((p) => p.id).join(", ")}]` : "";
  content.push({ type: "text", text: (text || "请看这张照片") + note });
  const messages: any[] = [...history.slice(-20).map((m) => ({ role: m.role, content: String(m.content) })), { role: "user", content }];

  // 函数时间有限：用较低的 effort 让回答更快
  const final: any = await c.beta.messages.toolRunner({
    model: MODEL(), max_tokens: 16000, output_config: { effort: "low" },
    system: systemPrompt(tz, userName, lang), tools: buildTools(tz, hooks), messages, max_iterations: 12, ...FALLBACK,
  } as any, { timeout: 55_000 } as any);
  if (final.stop_reason === "refusal") return "抱歉，这个请求无法处理。";
  return final.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim() || "已完成。";
}
