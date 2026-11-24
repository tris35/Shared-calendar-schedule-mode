// 照片档案：线上存在 Supabase Storage 的私人 bucket「photos」；本地测试存在资料夹（LOCAL_PHOTO_DIR）
import { env } from "./env.mts";

const BUCKET = "photos";
function storage() {
  const url = env("SUPABASE_URL"), key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  // 新式 secret key（sb_secret_…）只放 apikey；旧式 JWT key 也放 Authorization
  const headers: Record<string, string> = { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) };
  return { base: `${url}/storage/v1/object/${BUCKET}`, headers };
}
const localPath = (key: string) => `${env("LOCAL_PHOTO_DIR")}/${key.replace(/[^\w.-]/g, "_")}`;

export async function putPhoto(key: string, data: ArrayBuffer, mime: string) {
  const s = storage();
  if (!s) { await Deno.writeFile(localPath(key), new Uint8Array(data)); return; }
  const res = await fetch(`${s.base}/${encodeURIComponent(key)}`, { method: "POST", headers: { ...s.headers, "Content-Type": mime, "x-upsert": "true" }, body: data });
  if (!res.ok) throw new Error(`照片上传失败（${res.status} ${await res.text().catch(() => "")}）`);
}

export async function getPhotoData(key: string): Promise<ArrayBuffer | null> {
  const s = storage();
  if (!s) { try { return (await Deno.readFile(localPath(key))).buffer as ArrayBuffer; } catch { return null; } }
  const res = await fetch(`${s.base}/${encodeURIComponent(key)}`, { headers: s.headers });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`读取照片失败（${res.status}）`);
  return await res.arrayBuffer();
}

export async function deletePhotoData(key: string) {
  const s = storage();
  if (!s) { await Deno.remove(localPath(key)).catch(() => {}); return; }
  await fetch(`${s.base}/${encodeURIComponent(key)}`, { method: "DELETE", headers: s.headers }).catch(() => {});
}
