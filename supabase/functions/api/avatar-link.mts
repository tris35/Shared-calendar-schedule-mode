// 头像照片公开链接：/api/av/:userId?v=版本&s=签名（只有带正确签名的链接能看到这一张头像）
import * as db from "./lib/db.mts";
import { verifyAvatarSignature } from "./lib/settings.mts";

export async function handleAvatarLink(req: Request, idParam: string): Promise<Response> {
  const id = Number(idParam);
  const sig = new URL(req.url).searchParams.get("s") || "";
  if (!id || !(await verifyAvatarSignature(id, sig))) return new Response("链接无效", { status: 403 });
  const a: any = await db.getAvatar(id);
  if (!a) return new Response("没有头像", { status: 404 });
  // 网址带版本号：换照片 = 新网址，所以可以缓存很久
  return new Response(a.data, { headers: { "Content-Type": a.mime, "Cache-Control": "public, max-age=31536000, immutable" } });
}
