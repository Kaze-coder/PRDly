# Setup — AI PRD Generator

Aplikasi **langsung jalan tanpa konfigurasi apa pun** (semua data mock). Tambahkan kredensial di bawah untuk mengaktifkan fitur produksi satu per satu.

```bash
npm install
npm run dev          # http://localhost:3000 (mode mock, langsung bisa dipakai)
```

Salin env:
```bash
cp .env.example .env.local
```

---

## Level 1 — AI Generation (paling penting)

Tanpa ini, tombol Generate cuma menampilkan teks contoh (mock). Dengan ini, PRD di-generate AI beneran secara streaming.

1. Daftar di https://openrouter.ai → menu **Keys** → **Create Key**
2. Isi di `.env.local`:
   ```env
   OPENROUTER_API_KEY=sk-or-v1-xxxxx
   ```
3. Restart `npm run dev`. Selesai — 1 key ini otomatis memberi akses ke semua model (GPT, Claude, Gemini, Kimi, DeepSeek, Qwen).

> Mapping model internal → OpenRouter ada di `src/lib/ai/openrouter.ts` (`OPENROUTER_MODEL_MAP`). Sesuaikan slug bila perlu.

---

## Level 2 — Database + Auth

Tanpa ini, data hilang saat refresh & semua orang bisa akses dashboard. Dengan ini, ada login asli + penyimpanan permanen.

1. Buat project di https://supabase.com
2. **Project Settings → API** → salin `Project URL` + `anon key` + `service_role key`
3. **Project Settings → Database → Connection string** → salin dua connection string (pooler port 6543 & direct port 5432)
4. Isi di `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxx
   SUPABASE_SERVICE_ROLE_KEY=xxxx
   DATABASE_URL="postgresql://...6543/postgres?pgbouncer=true"
   DIRECT_URL="postgresql://...5432/postgres"
   ```
5. Jalankan migrasi (buat 7 tabel):
   ```bash
   npm run db:migrate     # buat tabel dari prisma/schema.prisma
   npm run db:studio      # (opsional) lihat isi DB di browser
   ```

Begitu env Supabase terisi, `src/middleware.ts` otomatis aktif: route `/dashboard`, `/new`, `/account`, `/prd`, `/checkout` butuh login; kalau belum login diarahkan ke `/login`.

> Login/register/forgot-password **sudah di-wire** ke Supabase (`signInWithPassword`, `signUp`, `resetPasswordForEmail`, Google OAuth). Selama env Supabase kosong, form otomatis jalan mode mock. Callback OAuth/email di `/auth/callback`, logout di header dashboard sudah aktif.
>
> Aktifkan **Google OAuth** di Supabase Dashboard → Authentication → Providers → Google (isi Client ID/Secret dari Google Cloud Console), lalu tambahkan `{origin}/auth/callback` ke Redirect URLs.

---

## Level 3 — Payment (Midtrans)

Untuk monetisasi asli. UI checkout & pricing sudah lengkap; tinggal ganti mock jadi Snap SDK.

1. Daftar di https://midtrans.com → **Settings → Access Keys**
2. Isi di `.env.local`:
   ```env
   MIDTRANS_SERVER_KEY=xxxx
   MIDTRANS_CLIENT_KEY=xxxx
   NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=xxxx
   MIDTRANS_IS_PRODUCTION=false   # true untuk live
   ```
3. Ganti `src/app/api/checkout/route.ts` (sekarang return redirect mock) dengan pemanggilan Midtrans Snap, lalu tambahkan webhook handler untuk konfirmasi pembayaran.

> Checkout **sudah di-wire** ke Midtrans Snap (`src/lib/payments/midtrans.ts`). Tanpa key → mock redirect ke halaman sukses. Dengan key → buat Snap transaction & redirect ke halaman pembayaran Midtrans. Webhook handler di `/api/billing/webhook` (verifikasi SHA512 signature). Satu TODO tersisa: sambungkan webhook ke Prisma untuk aktivasi langganan/kredit (ada contoh kode di file webhook).
>
> Set **Payment Notification URL** di Midtrans Dashboard → `{origin}/api/billing/webhook`.

---

## Level 4 — Opsional

| Env | Fungsi |
|-----|--------|
| `RESEND_API_KEY` | Email verifikasi & notifikasi |
| `UPSTASH_REDIS_URL` / `UPSTASH_REDIS_TOKEN` | Rate limiting |
| `NEXT_PUBLIC_POSTHOG_KEY` | Analytics |
| `SENTRY_DSN` | Error monitoring |

---

## Ringkasan Status

| Fitur | Status sekarang | Aktif setelah |
|-------|-----------------|---------------|
| UI lengkap (27 route) | ✅ Jalan | — |
| Generate PRD | 🟡 Mock streaming | `OPENROUTER_API_KEY` |
| Login/Register/Forgot/OAuth | ✅ Wired (mock fallback) | Supabase env |
| DB / persist data | 🟡 Mock | Supabase env + `db:migrate` |
| Auth guard | 🟡 Nonaktif (mock mode) | Supabase env otomatis mengaktifkan |
| Checkout Midtrans | ✅ Wired (mock fallback) | Midtrans keys |
| Aktivasi langganan pasca-bayar | 🟡 TODO webhook→DB | Midtrans + Prisma wiring |
