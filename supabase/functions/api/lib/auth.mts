import { env } from "./env.mts";
// 个人帐号：用 Gmail + 密码注册 / 登录。密码用 scrypt 加盐保存；登录后发一个签名的 token（90 天）。
import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import * as db from "./db.mts";
import { sign, verify, extraAdmins } from "./settings.mts";
import { normLang } from "./i18n.mts";

// 登录不会过期：直到在「设置」按「登出」，或修改密码（其他设备会被登出）
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 密码：至少 6 个字，且至少 1 个特殊符号（不是字母、数字、空白）
const PW_RULE = "密码至少 6 个字，并包含 1 个特殊符号（例如 ! @ # $ %）";
export const passwordOk = (pw: string) => pw.length >= 6 && /[^\p{L}\p{N}\s]/u.test(pw);

export class AuthError extends Error {
  status: number;
  constructor(msg: string, status = 401) { super(msg); this.status = status; }
}

function scrypt(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))));
}
async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${(await scrypt(password, salt)).toString("base64")}`;
}
async function checkPassword(password: string, stored: string) {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const got = await scrypt(password, Buffer.from(salt, "base64"));
  const want = Buffer.from(hash, "base64");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export const normalizeEmail = (e: any) => String(e || "").trim().toLowerCase();
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// token 的签名包含密码 hash 的一部分：改密码后，其他设备的旧登录自动失效
const tokenText = (payload: string, user: any) => `session:${payload}:${String(user.password_hash).slice(-16)}`;
async function makeToken(user: any) {
  const payload = Buffer.from(JSON.stringify({ u: user.id, t: Date.now() })).toString("base64url");
  return `${payload}.${await sign(tokenText(payload, user))}`;
}

/** 注册：Gmail、名字、密码 */
export async function signup(body: any) {
  const email = normalizeEmail(body.email);
  const name = String(body.name || "").trim().slice(0, 40);
  const password = String(body.password || "");
  if (!EMAIL_RE.test(email)) throw new AuthError("请输入正确的 Gmail 地址", 400);
  if (!name) throw new AuthError("请输入你的名字", 400);
  if (!passwordOk(password)) throw new AuthError(PW_RULE, 400);
  if (await db.getUserByEmail(email)) throw new AuthError("这个 Gmail 已经注册过了，请直接登录", 400);
  const user = await db.createUser({ email, name, password_hash: await hashPassword(password), lang: normLang(body.lang) });
  const calId = await db.createCalendar(name, user.id); // 每个帐号自己一个日历
  await db.ensureMember(name, calId); // 自己出现在这个日历的「成员」列表
  return { token: await makeToken(user), user: publicUser(user) };
}

// ---------- 忘记密码：用 App 的 Gmail 寄 6 位数验证码 ----------
const codeHash = (email: string, code: string) => crypto.createHash("sha256").update(`${email}:${code}:${env("SUPABASE_SERVICE_ROLE_KEY") || "pepper"}`).digest("hex");
const RESET_TEXT: Record<string, { subject: string; body: (c: string) => string }> = {
  en: { subject: "Your password reset code", body: (c) => `Your code to reset your Shared Calendar password is:\n\n${c}\n\nIt expires in 5 minutes. If you didn't ask for this, you can ignore this email.` },
  zh: { subject: "重设密码验证码", body: (c) => `你的共享日历重设密码验证码：\n\n${c}\n\n5 分钟内有效。如果不是你要求的，可以不理会这封信。` },
  "zh-TW": { subject: "重設密碼驗證碼", body: (c) => `你的共享日曆重設密碼驗證碼：\n\n${c}\n\n5 分鐘內有效。如果不是你要求的，可以不理會這封信。` },
  ms: { subject: "Kod set semula kata laluan", body: (c) => `Kod untuk set semula kata laluan Shared Calendar anda:\n\n${c}\n\nSah selama 5 minit. Jika anda tidak memintanya, abaikan e-mel ini.` },
};
async function sendResetMail(to: string, code: string, lang: string) {
  const tx0 = RESET_TEXT[lang] || RESET_TEXT.en;
  const text0 = tx0.body(code);
  const html0 = `<div style="font-family:sans-serif;font-size:16px">${text0.replace(code, `<b style="font-size:28px;letter-spacing:4px">${code}</b>`).replace(/\n/g, "<br>")}</div>`;
  // 用 Gmail 寄（Google「应用程式密码」；Supabase 不能用 587 端口，所以用 465 SSL）
  const gUser = (env("GMAIL_USER") || "").trim(), gPass = (env("GMAIL_APP_PASSWORD") || "").replace(/\s+/g, "");
  if (gUser && gPass) {
    const nodemailer = (await import("nodemailer")).default;
    const tr = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: gUser, pass: gPass } });
    try { await tr.sendMail({ from: `"Shared Calendar" <${gUser}>`, to, subject: tx0.subject, text: text0, html: html0 }); return; }
    catch (e: any) { console.error("gmail", e?.code || "", e?.responseCode || "", String(e?.message || e).slice(0, 300)); throw new AuthError("寄信失败，请稍后再试", 502); }
  }
  throw new AuthError("忘记密码功能还没设定好，请联络管理员", 503);
}
/** 忘记密码第 1 步：寄验证码（不透露这个 Gmail 有没有注册） */
export async function forgotPassword(body: any, lang: string) {
  const email = normalizeEmail(body.email);
  if (!EMAIL_RE.test(email)) throw new AuthError("请输入正确的 Gmail 地址", 400);
  const old = await db.getReset(email);
  if (old && Number(old.age) < 20) throw new AuthError("请等 20 秒再要求新的验证码", 429);
  const user = await db.getUserByEmail(email);
  if (!user) { await delay(600); return { ok: true }; }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  await db.saveReset(email, codeHash(email, code));
  await sendResetMail(email, code, lang);
  return { ok: true };
}
/** 忘记密码第 2 步：验证码 + 新密码 → 改密码并登录 */
export async function resetPassword(body: any) {
  const email = normalizeEmail(body.email);
  const code = String(body.code || "").replace(/\D/g, "");
  const password = String(body.password || "");
  if (!passwordOk(password)) throw new AuthError(PW_RULE, 400);
  const r = await db.getReset(email);
  const bad = () => new AuthError("验证码不正确或已过期", 400);
  if (!r || new Date(r.expires_at) < new Date() || r.attempts >= 5) { await delay(600); throw bad(); }
  const want = Buffer.from(r.code_hash, "hex"), got = Buffer.from(codeHash(email, code), "hex");
  if (code.length !== 6 || !crypto.timingSafeEqual(want, got)) { await db.bumpResetAttempts(email); await delay(600); throw bad(); }
  const user = await db.getUserByEmail(email);
  if (!user) throw bad();
  await db.setUserPassword(user.id, await hashPassword(password));
  await db.deleteReset(email);
  const fresh = await db.getUserByEmail(email);
  return { token: await makeToken(fresh), user: publicUser(fresh) };
}

/** 登录 */
export async function login(body: any) {
  const email = normalizeEmail(body.email);
  const user = email ? await db.getUserByEmail(email) : null;
  if (!user || !(await checkPassword(String(body.password || ""), user.password_hash))) {
    await delay(800); // 减慢猜密码
    throw new AuthError("Gmail 或密码不正确");
  }
  return { token: await makeToken(user), user: publicUser(user) };
}

/** 从请求取出登录的人（Authorization: Bearer <token>，或照片网址的 ?t=） */
export async function currentUser(req: Request, url: URL) {
  const raw = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || url.searchParams.get("t") || "";
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) throw new AuthError("请先登录");
  let data: any;
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { throw new AuthError("请先登录"); }
  if (!Number.isInteger(data?.u)) throw new AuthError("请重新登录"); // 不检查期限：永久登录
  const user = await db.getUser(data.u);
  if (!user || !(await verify(tokenText(payload, user), sig))) throw new AuthError("请重新登录");
  return user;
}

export async function changePassword(user: any, body: any) {
  if (!(await checkPassword(String(body.oldPassword || ""), user.password_hash))) throw new AuthError("原密码不正确", 400);
  const pw = String(body.newPassword || "");
  if (!passwordOk(pw)) throw new AuthError(PW_RULE, 400);
  await db.setUserPassword(user.id, await hashPassword(pw));
  return { token: await makeToken(await db.getUser(user.id)) };
}

// 管理员：Supabase 函数密钥 ADMIN_EMAILS（固定的）＋ 在 App「设置」里加的
export const fixedAdmins = () => (env("ADMIN_EMAILS") || "").toLowerCase().split(/[,\s]+/).filter(Boolean);
export const isAdmin = (u: any) => {
  const email = String(u?.email || "").toLowerCase();
  return !!email && (fixedAdmins().includes(email) || extraAdmins.includes(email));
};
export const canWhatsApp = (u: any) => isAdmin(u) || !!u?.wa_allowed;
export const publicUser = (u: any) => ({ id: u.id, email: u.email, name: u.name, lang: u.lang || "en", admin: isAdmin(u), can_whatsapp: canWhatsApp(u) });
