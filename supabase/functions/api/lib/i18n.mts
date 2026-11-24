// 服务器端的多语言：错误讯息、Google 日历活动说明
export type Lang = "en" | "zh" | "zh-TW" | "ms";
export const LANG_CODES: Lang[] = ["en", "zh", "zh-TW", "ms"];
export const normLang = (l: any): Lang => (LANG_CODES.includes(l) ? l : "en");
export const langFrom = (req: Request) => normLang(req.headers.get("x-lang"));

// 服务器内部用简体中文写错误讯息，回传前依语言翻译（$1、$2 是括号里抓到的内容）
const T: [RegExp, Record<Exclude<Lang, "zh">, string>][] = [
  [/^请输入正确的 Gmail 地址$/, { en: "Please enter a valid Gmail address", "zh-TW": "請輸入正確的 Gmail 地址", ms: "Sila masukkan alamat Gmail yang sah" }],
  [/^请输入你的名字$/, { en: "Please enter your name", "zh-TW": "請輸入你的名字", ms: "Sila masukkan nama anda" }],
  [/^请输入名字$/, { en: "Please enter a name", "zh-TW": "請輸入名字", ms: "Sila masukkan nama" }],
  [/^请填写名字$/, { en: "Please enter a name", "zh-TW": "請填寫名字", ms: "Sila masukkan nama" }],
  [/^密码至少 6 个字，并包含 1 个特殊符号（例如 ! @ # \$ %）$/, { en: "Password needs at least 6 characters and 1 special character (e.g. ! @ # $ %)", "zh-TW": "密碼至少 6 個字，並包含 1 個特殊符號（例如 ! @ # $ %）", ms: "Kata laluan perlu sekurang-kurangnya 6 aksara dan 1 aksara khas (cth. ! @ # $ %)" }],
  [/^这个 Gmail 已经注册过了，请直接登录$/, { en: "This Gmail is already registered. Please log in.", "zh-TW": "這個 Gmail 已經註冊過了，請直接登入", ms: "Gmail ini sudah didaftarkan. Sila log masuk." }],
  [/^忘记密码功能还没设定好，请联络管理员$/, { en: "Forgot password isn't set up yet — please contact the admin", "zh-TW": "忘記密碼功能還沒設定好，請聯絡管理員", ms: "Lupa kata laluan belum disediakan — sila hubungi pentadbir" }],
  [/^寄信失败，请稍后再试$/, { en: "Couldn't send the email — please try again later", "zh-TW": "寄信失敗，請稍後再試", ms: "Gagal menghantar e-mel — sila cuba lagi nanti" }],
  [/^请等 20 秒再要求新的验证码$/, { en: "Please wait 20 seconds before asking for a new code", "zh-TW": "請等 20 秒再要求新的驗證碼", ms: "Sila tunggu 20 saat sebelum meminta kod baharu" }],
  [/^验证码不正确或已过期$/, { en: "The code is wrong or has expired", "zh-TW": "驗證碼不正確或已過期", ms: "Kod salah atau telah tamat tempoh" }],
  [/^Gmail 或密码不正确$/, { en: "Incorrect Gmail or password", "zh-TW": "Gmail 或密碼不正確", ms: "Gmail atau kata laluan salah" }],
  [/^请先登录$/, { en: "Please log in first", "zh-TW": "請先登入", ms: "Sila log masuk dahulu" }],
  [/^登录已过期，请重新登录$/, { en: "Your login has expired. Please log in again.", "zh-TW": "登入已過期，請重新登入", ms: "Log masuk anda telah tamat. Sila log masuk semula." }],
  [/^请重新登录$/, { en: "Please log in again", "zh-TW": "請重新登入", ms: "Sila log masuk semula" }],
  [/^原密码不正确$/, { en: "Current password is incorrect", "zh-TW": "原密碼不正確", ms: "Kata laluan semasa salah" }],
  [/^找不到$/, { en: "Not found", "zh-TW": "找不到", ms: "Tidak dijumpai" }],
  [/^找不到照片$/, { en: "Photo not found", "zh-TW": "找不到照片", ms: "Foto tidak dijumpai" }],
  [/^照片太大（上限 4MB）$/, { en: "Photo is too large (max 4 MB)", "zh-TW": "照片太大（上限 4MB）", ms: "Foto terlalu besar (maks 4 MB)" }],
  [/^请输入文字或选择照片$/, { en: "Write something or choose a photo", "zh-TW": "請輸入文字或選擇照片", ms: "Tulis sesuatu atau pilih foto" }],
  [/^内容不能为空$/, { en: "Can't be empty", "zh-TW": "內容不能為空", ms: "Tidak boleh kosong" }],
  [/^请填写标题$/, { en: "Please enter a title", "zh-TW": "請填寫標題", ms: "Sila masukkan tajuk" }],
  [/^请填写开始时间$/, { en: "Please enter a start time", "zh-TW": "請填寫開始時間", ms: "Sila masukkan masa mula" }],
  [/^结束时间不能早于开始时间$/, { en: "End can't be before start", "zh-TW": "結束時間不能早於開始時間", ms: "Masa tamat tidak boleh sebelum masa mula" }],
  [/^无效的颜色标签$/, { en: "Invalid colour label", "zh-TW": "無效的顏色標籤", ms: "Label warna tidak sah" }],
  [/^无效时间: (.*)$/, { en: "Invalid time: $1", "zh-TW": "無效時間：$1", ms: "Masa tidak sah: $1" }],
  [/^无效的时区$/, { en: "Invalid time zone", "zh-TW": "無效的時區", ms: "Zon waktu tidak sah" }],
  [/^这个日历没有修改权限，不能双向同步$/, { en: "You can't edit this calendar, so it can't be synced both ways", "zh-TW": "這個日曆沒有修改權限，不能雙向同步", ms: "Anda tidak boleh mengedit kalendar ini, jadi ia tidak boleh disegerakkan dua hala" }],
  [/^你还没连接 Google 日历$/, { en: "You haven't connected Google Calendar yet", "zh-TW": "你還沒連接 Google 日曆", ms: "Anda belum menyambung Kalendar Google" }],
  [/^App 还没设定 Google 登录.*$/, { en: "The app owner hasn't finished the one-time Google setup yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in Supabase)", "zh-TW": "App 管理員還沒完成 Google 設定（Supabase 函數密鑰 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）", ms: "Pemilik aplikasi belum selesai persediaan Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET dalam Supabase)" }],
  [/^Google 授权已失效.*$/, { en: "Google access has expired. Reconnect Google Calendar in Settings.", "zh-TW": "Google 授權已失效，請到「設定」重新連接 Google 日曆", ms: "Akses Google telah tamat. Sambung semula Kalendar Google dalam Tetapan." }],
  [/^Google 登录失败：(.*)$/, { en: "Google sign-in failed: $1", "zh-TW": "Google 登入失敗：$1", ms: "Log masuk Google gagal: $1" }],
  [/^你取消了 Google 授权$/, { en: "You cancelled the Google permission", "zh-TW": "你取消了 Google 授權", ms: "Anda membatalkan kebenaran Google" }],
  [/^Google 授权失败：(.*)$/, { en: "Google permission failed: $1", "zh-TW": "Google 授權失敗：$1", ms: "Kebenaran Google gagal: $1" }],
  [/^连接已过期.*$/, { en: "The connection expired. Tap “Connect Google Calendar” again.", "zh-TW": "連接已過期，請重新按「連接 Google 日曆」", ms: "Sambungan tamat. Ketik “Sambung Kalendar Google” sekali lagi." }],
  [/^你选了 (.*)，但你填的是 (.*)。请重新连接，并在 Google 画面选择 .*$/, { en: "You chose $1, but you entered $2. Connect again and choose $2 on Google's screen.", "zh-TW": "你選了 $1，但你填的是 $2。請重新連接，並在 Google 畫面選擇 $2", ms: "Anda memilih $1, tetapi anda memasukkan $2. Sambung semula dan pilih $2 pada skrin Google." }],
  [/^Google 没有给长期授权.*$/, { en: "Google didn't grant lasting access. Remove this app at myaccount.google.com/permissions and connect again.", "zh-TW": "Google 沒有給長期授權，請到 myaccount.google.com/permissions 移除本 App 後再連接一次", ms: "Google tidak memberi akses berterusan. Buang aplikasi ini di myaccount.google.com/permissions dan sambung semula." }],
  [/^请在 Google 授权画面勾选「日历」权限$/, { en: "Please tick the “Calendar” permission on Google's screen", "zh-TW": "請在 Google 授權畫面勾選「日曆」權限", ms: "Sila tandakan kebenaran “Kalendar” pada skrin Google" }],
  [/^Google 日历上找不到（(.*)）$/, { en: "Not found in Google Calendar ($1)", "zh-TW": "Google 日曆上找不到（$1）", ms: "Tidak dijumpai dalam Kalendar Google ($1)" }],
  [/^只有管理员允许的帐号可以发送 WhatsApp$/, { en: "Only accounts the admin allows can send WhatsApp", "zh-TW": "只有管理員允許的帳號可以發送 WhatsApp", ms: "Hanya akaun yang dibenarkan oleh pentadbir boleh menghantar WhatsApp" }],
  [/^只有管理员可以设定$/, { en: "Only the admin can change this", "zh-TW": "只有管理員可以設定", ms: "Hanya pentadbir boleh menukar ini" }],
  [/^本月 WhatsApp 讯息已用完（(\d+) 则）$/, { en: "This month's WhatsApp messages are used up ($1)", "zh-TW": "本月 WhatsApp 訊息已用完（$1 則）", ms: "Mesej WhatsApp bulan ini sudah habis ($1)" }],
  [/^WhatsApp 还没设定$/, { en: "WhatsApp isn't set up yet", "zh-TW": "WhatsApp 還沒設定", ms: "WhatsApp belum disediakan" }],
  [/^请填写客户电话$/, { en: "Please enter the customer's phone number", "zh-TW": "請填寫客戶電話", ms: "Sila masukkan nombor telefon pelanggan" }],
  [/^请填写给客户的讯息$/, { en: "Please write the message to the customer", "zh-TW": "請填寫給客戶的訊息", ms: "Sila tulis mesej kepada pelanggan" }],
  [/^电话号码不正确$/, { en: "The phone number isn't valid", "zh-TW": "電話號碼不正確", ms: "Nombor telefon tidak sah" }],
  [/^WhatsApp 错误：(.*)$/, { en: "WhatsApp error: $1", "zh-TW": "WhatsApp 錯誤：$1", ms: "Ralat WhatsApp: $1" }],
  [/^Google 日历错误 (\d+)：(.*)$/, { en: "Google Calendar error $1: $2", "zh-TW": "Google 日曆錯誤 $1：$2", ms: "Ralat Kalendar Google $1: $2" }],
];

export function tr(msg: string, lang: Lang) {
  if (lang === "zh") return msg;
  for (const [re, out] of T) if (re.test(msg)) return msg.replace(re, out[lang]);
  return msg;
}

// Google 日历 / 订阅链接里的活动说明文字
const DESC: Record<Lang, Record<string, string>> = {
  en: { posts: "💬 Comments & photos", uploaded: "uploaded a photo", view: "View photo", open: "Open in Shared Calendar (photos, comments)", anon: "Anonymous", calendar: "Shared Calendar", calDesc: "Synced automatically by the Shared Calendar app" },
  zh: { posts: "💬 留言与照片", uploaded: "上传了照片", view: "看照片", open: "在共享日历中打开（看照片、留言）", anon: "匿名", calendar: "共享日历", calDesc: "由共享日历 App 自动同步" },
  "zh-TW": { posts: "💬 留言與照片", uploaded: "上傳了照片", view: "看照片", open: "在共享日曆中打開（看照片、留言）", anon: "匿名", calendar: "共享日曆", calDesc: "由共享日曆 App 自動同步" },
  ms: { posts: "💬 Komen & foto", uploaded: "memuat naik foto", view: "Lihat foto", open: "Buka dalam Kalendar Bersama (foto, komen)", anon: "Tanpa nama", calendar: "Kalendar Bersama", calDesc: "Disegerakkan secara automatik oleh aplikasi Kalendar Bersama" },
};
export const desc = (lang: Lang, key: string) => DESC[lang][key] ?? DESC.en[key];
export const LOCALES: Record<Lang, string> = { en: "en-GB", zh: "zh-CN", "zh-TW": "zh-TW", ms: "ms-MY" };
