// 公开照片链接（放进 Google 日历的活动说明里）：/p/:id?s=签名
// 只有带正确签名的链接能看到那一张照片，不会泄露其他资料。
import { getPhotoData } from "./lib/photos.mts";
import * as db from "./lib/db.mts";
import { verifyPhotoSignature } from "./lib/settings.mts";

export async function handlePhotoLink(req: Request, idParam: string): Promise<Response> {
  const id = Number(idParam);
  const sig = new URL(req.url).searchParams.get("s") || "";
  if (!id || !(await verifyPhotoSignature(id, sig))) return new Response("链接无效", { status: 403 });
  const p = await db.getPhoto(id);
  if (!p) return new Response("照片已删除", { status: 404 });
  const data = await getPhotoData(p.blob_key);
  if (!data) return new Response("照片已删除", { status: 404 });
  return new Response(data, { headers: { "Content-Type": p.mime, "Cache-Control": "private, max-age=3600" } });
}
