# Presensi Generus — Karanganyar Barat

Aplikasi **Progressive Web App (PWA)** absensi digital pengajian muda-mudi berbasis **QR Code**, **Role-Based Access Control (RBAC)** bertingkat wilayah, **sinkronisasi real-time antar perangkat**, serta **ekspor rekapitulasi PDF resmi per acara**.

Dirancang khusus agar berjalan 100% pada layanan *free-tier* (React + Vite PWA + Supabase PostgreSQL/Auth/Realtime) dengan prinsip *zero public signup* dan jejak audit penuh untuk setiap perubahan kehadiran.

---

## Fitur Utama

### 1. Progressive Web App (PWA) & Pengalaman Mobile-First
- Dapat diinstal langsung ke *Home Screen* Android, iOS, maupun Desktop (*standalone mode*).
- Dukungan aset *offline* via Workbox Service Worker serta indikator status koneksi jaringan.
- Antarmuka responsif (*bottom navigation* pada ponsel, *sidebar* pada desktop) dengan target sentuh minimal `44px`.

### 2. Autentikasi Google & RBAC Bertingkat (Email Whitelist)
- **Tanpa pendaftaran publik**: hanya email Google yang didaftarkan oleh admin berwenang ke tabel `user_whitelist` yang dapat masuk melalui `sync_my_profile()`.
- **Hierarki 5 Peran & Wilayah**:
  - `super_admin` — kendali penuh seluruh Daerah, Desa, Kelompok, RBAC, acara, dan koreksi.
  - `admin_daerah` — mengelola Daerah Karanganyar Barat, menambah kelompok, mendaftarkan `admin_desa` dan `pamong` tingkat Daerah, serta menyelenggarakan acara Daerah.
  - `admin_desa` — mengelola kelompok & generus di Desanya, mendaftarkan `admin_kelompok` dan `pamong` tingkat Desa, menyelenggarakan acara Desa, serta melihat hasil anggotanya pada acara Daerah (*read-only*).
  - `admin_kelompok` — mengelola generus Kelompoknya sendiri, menyelenggarakan acara Kelompok, serta melihat hasil anggotanya pada acara Desa/Daerah (*read-only*). Tidak dapat membuat akun `pamong`.
  - `pamong` — petugas lapangan untuk acara aktif (Mode Scanner HP 1 & Mode Monitor HP 2).

### 3. Manajemen Generus, Import Excel & Kartu QR Massal
- Data peserta (*generus*) ringkas: nama lengkap, jenis kelamin (`L`/`P`), Desa, Kelompok, dan `qr_token` unik permanen.
- **Import Excel (`.xlsx`)**: tersedia template bawaan lengkap dengan sheet `Referensi Wilayah` dan validasi cakupan wilayah otomatis sesuai peran admin.
- **Kartu QR Permanen**: berlaku lintas tingkatan acara (Kelompok, Desa, Daerah) dan otomatis ditolak apabila peserta berada di luar cakupan acara tersebut.
- **Ekspor Kartu QR**: unduh kartu PNG satuan, cetak layout grid A4 langsung dari browser, atau ekspor massal dalam **1 file ZIP** yang otomatis dikelompokkan berdasarkan folder `Desa/Kelompok/Nama.png`.

### 4. Presensi Acara 2 Perangkat (*Real-time*) & Audit Trail
- Saat acara dibuka (`open`), sistem otomatis mengisi daftar target peserta aktif dalam cakupan penyelenggara dengan status awal `belum_hadir`.
- **HP 1 (Mode Scanner QR)**: pemindaian kamera via `html5-qrcode` disertai umpan balik suara/visual cepat serta dukungan input manual Hadir/Izin.
- **HP 2 (Mode Monitor Real-time)**: memantau pembaruan kehadiran secara instan melalui *Supabase Realtime* tanpa perlu memuat ulang halaman.
- **Tutup Acara Otomatis**: menutup acara (`closed`) akan mengubah seluruh status `belum_hadir` menjadi `alfa` secara atomik dan mencatatnya di `attendance_logs`.
- **Koreksi Pasca-Penutupan**: hanya penyelenggara acara terkait atau `super_admin` yang dapat mengoreksi status setelah acara ditutup, dengan wajib menyertakan alasan koreksi di Audit Log.

### 5. Rekapitulasi & Ekspor PDF per Acara
- Ringkasan statistik per acara (Target, Hadir, Izin, Alfa, Belum Hadir, dan persentase kehadiran).
- Tabel pemecahan wilayah otomatis per **Desa** (untuk acara tingkat Daerah) atau per **Kelompok** (untuk acara tingkat Desa/Kelompok).
- Ekspor PDF A4 siap cetak (Kop Laporan, ringkasan, tabel wilayah, daftar peserta lengkap, catatan koreksi audit, dan nomor halaman) langsung di browser menggunakan `jsPDF` + `jspdf-autotable`.

---

## Arsitektur & Teknologi

| Lapisan | Teknologi | Alasan Pemilihan |
| :--- | :--- | :--- |
| Frontend | React 19, TypeScript, Tailwind CSS v4 | Komponen modular, tipe data ketat, ukuran bundle ringan |
| Build & PWA | Vite, `vite-plugin-pwa`, Workbox | *Dynamic import* untuk library berat (`xlsx`, `html5-qrcode`, `jspdf`) agar load awal cepat |
| Backend & DB | Supabase (PostgreSQL, Row Level Security, Realtime) | Keamanan data diproteksi di tingkat database (RLS + RPC), gratis untuk skala komunitas |
| Autentikasi | Google OAuth via Supabase Auth + `user_whitelist` | Tidak perlu manajemen password manual; akses dikontrol ketat per email |
| QR & Dokumen | `qrcode`, `html5-qrcode`, `xlsx`, `jspdf`, `jspdf-autotable` | Pembuatan kartu PNG/ZIP, scan kamera, import Excel, dan ekspor PDF sepenuhnya di sisi klien |

---

## Struktur Proyek

```text
├── public/                 # Ikon PWA (SVG, PNG 192/512/maskable, Apple touch icon)
├── supabase/
│   └── schema.sql          # Skema tabel, index, fungsi helper RLS, RPC, dan seed wilayah awal
├── src/
│   ├── components/         # UI per modul (AppShell, Region, Whitelist, Generus, Events, Scanner, Reports)
│   ├── context/            # AuthContext (sesi Google OAuth & sinkronisasi profil whitelist)
│   ├── hooks/              # usePWAInstall & useOnlineStatus
│   ├── lib/                # Inisialisasi Supabase client
│   ├── types/              # Tipe TypeScript database & label peran
│   └── utils/              # Permission helper, Excel parser, QR PNG/ZIP builder, PDF generator
├── .env.example            # Contoh variabel environment (tanpa kredensial asli)
├── vite.config.ts          # Konfigurasi Vite + manifest PWA + Workbox caching
└── package.json
```

---

## Panduan Setup & Menjalankan Secara Lokal

### Prasyarat
- Node.js 20+ dan `npm`
- Akun & proyek [Supabase](https://supabase.com) (*Free Tier* sudah mencukupi)
- OAuth Client Google di Google Cloud Console (untuk login Google melalui Supabase Auth)

### 1. Clone Repositori & Instal Dependensi

```bash
git clone <URL_REPOSITORI_ANDA>
cd <NAMA_FOLDER_PROYEK>
npm install
```

### 2. Setup Database Supabase
1. Buka dashboard proyek Supabase Anda, lalu masuk ke menu **SQL Editor**.
2. Salin seluruh isi file `supabase/schema.sql`.
3. Pada bagian paling bawah `supabase/schema.sql`, ubah `GANTI_DENGAN_EMAIL_GOOGLE_ANDA@gmail.com` menjadi alamat email Google yang akan bertindak sebagai `super_admin` pertama.
4. Jalankan skrip SQL tersebut (*Run*). Skrip ini akan:
   - Membuat seluruh tabel (`desas`, `kelompoks`, `user_whitelist`, `profiles`, `generus`, `events`, `attendances`, `attendance_logs`)
   - Mengaktifkan Row Level Security (RLS), fungsi RPC (`sync_my_profile`), dan `GRANT` role `authenticated`
   - Mengisi data awal 4 Desa (`Jaten`, `Karangmojo`, `Kaling`, `Banjarharjo`) beserta 12 Kelompok di Desa `Jaten`
   - Mengaktifkan publikasi Realtime untuk tabel `attendances` dan `events`

### 3. Aktifkan Google Sign-In di Supabase Auth
1. Di Supabase Dashboard, buka **Authentication → Providers → Google** dan aktifkan (*Enable*).
2. Masukkan **Client ID** dan **Client Secret** dari Google Cloud Console.
3. Di Google Cloud Console (*Authorized redirect URIs*), tambahkan callback URL dari Supabase:
   `https://<PROJECT_REF>.supabase.co/auth/v1/callback` (sesuai yang tampil pada menu Google Provider di dashboard Supabase).
4. Di Supabase **Authentication → URL Configuration**, tambahkan URL lokal (`http://localhost:3000`) dan domain produksi Anda ke **Redirect URLs**.

### 4. Konfigurasi Variabel Environment
Salin `.env.example` menjadi `.env`, lalu isi kredensial publik proyek Supabase Anda:

```bash
cp .env.example .env
```

Isi nilai berikut pada `.env`:

```env
VITE_SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY"
```

> **Catatan Keamanan:** Jangan pernah memasukkan `service_role` key ke file `.env` frontend dan **jangan pernah melakukan commit file `.env`** ke repositori Git. File `.gitignore` proyek ini sudah dikonfigurasi untuk mengabaikan seluruh file `.env*` kecuali `.env.example`.

### 5. Jalankan Aplikasi

```bash
# Mode pengembangan (berjalan di http://localhost:3000)
npm run dev

# Pemeriksaan tipe TypeScript
npm run lint

# Build produksi + Service Worker PWA
npm run build
```

---

## Catatan Deployment (Gratis)
Aplikasi ini menghasilkan output statis di folder `dist/` melalui `npm run build` dan dapat di-deploy gratis ke **Vercel**, **Netlify**, atau **Cloudflare Pages**:
1. Hubungkan repositori GitHub ke platform pilihan Anda.
2. Set *Build Command* ke `npm run build` dan *Output Directory* ke `dist`.
3. Tambahkan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` pada menu **Environment Variables** di dashboard hosting.
4. Daftarkan domain hosting produksi ke **Supabase → Authentication → URL Configuration → Redirect URLs**.

---

## Lisensi
Proyek ini dilisensikan di bawah [MIT License](./LICENSE).
