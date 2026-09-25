# Architecture & Domain Model: Christmas Celebration System

## 1. Rekomendasi Tech Stack & Deployment
Sistem ini dirancang menggunakan ekosistem modern yang sangat aman dan mudah dikelola.

- **Bahasa Pemrograman:** **TypeScript** - Sangat direkomendasikan karena memberikan pengamanan tipe data (*type-safety*) yang mencegah banyak error/bug sebelum aplikasi dijalankan.
- **Framework:** **Next.js (App Router)** - Menyatukan Frontend (UI) dan Backend (API) dalam satu codebase. 
- **Database:** **PostgreSQL** - Handal untuk mengelola data relasional dan menjamin integritas data.
- **ORM:** **Prisma** - Memudahkan interaksi tipe data TypeScript dengan database.
- **UI & Styling:** **Tailwind CSS + Shadcn UI** - Untuk tampilan modern dan responsive.
- **Autentikasi:** **NextAuth.js (Auth.js)** - Untuk sistem login admin.
- **QR Scanner:** **`html5-qrcode`** - Web-based scanner untuk panitia.

### Rekomendasi Cara Deployment (ke VPS Sendiri)
Karena Anda menggunakan VPS sendiri, cara yang paling rapi, aman, dan standar industri saat ini adalah menggunakan **Docker**:
1. **Docker & Docker Compose:** Aplikasi Next.js dan Database PostgreSQL akan dibungkus ke dalam container terpisah menggunakan `docker-compose.yml`. Keuntungannya: instalasi sangat bersih, tidak mengotori sistem bawaan VPS, dan mudah di-backup.
2. **Reverse Proxy (Nginx / Traefik):** Di VPS Anda, kita akan menginstal Nginx yang bertugas menangkap trafik dari domain asli (misal: `gerejaanda.com`) lalu mengarahkannya secara internal ke port aplikasi Next.js di dalam Docker.
3. **SSL / HTTPS (Wajib):** Karena sistem web-scanner membutuhkan akses kamera HP, browser **mewajibkan** koneksi HTTPS. Kita bisa menggunakan **Let's Encrypt (Certbot)** untuk mengamankan Nginx secara gratis.
4. **CI/CD Automation (Sangat Disarankan):** Agar Anda tidak perlu login ke VPS setiap kali ada perubahan kode, kita bisa mengatur **GitHub Actions**. Setiap kode baru di-push ke GitHub, sistem akan otomatis men-deploy versi terbarunya ke VPS Anda.

---

## 2. Domain Data (Database Schema)

### A. Tabel `Participant` (Peserta)
Menyimpan data peserta dan mendukung pendaftaran lebih dari 1 orang sekaligus.
- `id` (UUID, Primary Key)
- `full_name` (String)
- `whatsapp_number` (String) - *Jika peserta adalah anak, sistem akan otomatis mengisi field ini dengan nomor WA pendaftar utama (orang tuanya).*
- `church_status` (String) - Jawaban dari "Apakah sudah bergereja? Jika iya, di cabang mana/lainnya".
- `is_child` (Boolean) - Default `false`. Opsi centang anak jika mendaftarkan orang ke-2 dsb.
- `is_wa_opt_in` (Boolean) - Wajib `true` saat daftar.
- `qr_token` (String, Unique) - Token acak dan aman untuk isi QR Code.
- `status` (Enum: `REGISTERED`, `CHECKED_IN`, `CANCELLED`) - `CANCELLED` digunakan jika peserta menyatakan "Tidak Hadir" pada RSVP, sehingga kuota kembali kosong.
- `registration_type` (Enum: `ONLINE`, `ON_SITE`)
- `checked_in_at` (DateTime, Nullable)
- `created_at` (DateTime)

> **Constraint Penting (Pencegahan Ganda):** Sistem menerapkan aturan `UNIQUE(full_name, whatsapp_number)`. 
> *Solusi untuk Anak:* Karena form anak tidak meminta nomor WA, sistem akan meminjam nomor WA Pendaftar Utama. Jika ada anak dengan nama *persis sama* didaftarkan oleh *orang tua yang sama*, sistem akan menganggapnya duplikat. Namun, jika ada anak bernama sama dari orang tua yang BERBEDA, mereka akan lolos karena nomor WA orang tuanya berbeda.

### B. Tabel `User` (Admin)
- `id` (UUID, Primary Key)
- `username` (String, Unique)
- `password_hash` (String)
- `role` (Enum: `MASTER`, `ADMIN`) 
- `created_at` (DateTime)

### C. Tabel `SystemConfig` (Pengaturan Sistem)
- `key` (String, Primary Key) - Contoh: `is_registration_open`, `max_online_quota` (Default: 400).
- `value` (String) 

---

## 3. Alur Sistem Terperinci (Flows)

### A. Tampilan Utama (Company Profile Gereja)
1. Website dirancang sebagai **Company Profile Gereja** yang komprehensif, bukan sekadar halaman registrasi.
2. Konten landing page akan mencakup:
   - **Hero Section:** Banner dengan teks ajakan dan tombol CTA "Daftar Christmas Celebration".
   - **About Us:** Informasi dan sejarah gereja.
   - **Visi & Misi.**
   - **Galeri:** Dokumentasi foto kegiatan gereja.
   - **Gembala & Pengurus:** Daftar lengkap pengurus gereja.
   - **Contact Us:** Informasi kontak dan alamat.

### B. Pendaftaran Online (Bisa Multi-Peserta)
1. Pada form, terdapat isian Nama, WA, Pertanyaan Bergereja, consent WA, dan tombol **Contact Us** (redirect ke WA Admin).
2. **Tambah Peserta:** Satu orang dapat mendaftarkan beberapa orang sekaligus. Terdapat tombol "Tambah Peserta". Setiap penambahan peserta akan memiliki *tickbox* "Anak".
3. **Logika Anak:** Jika dicentang, input Nomor WA akan disembunyikan.
4. Jika disubmit, data disimpan terpisah. **Semua QR Code (termasuk milik anak) akan dikirimkan secara otomatis ke nomor WA pendaftar utama**.

### C. Sistem RSVP via WhatsApp (H-7)
1. Tujuh hari menjelang acara, sistem mengirimkan pesan RSVP ke WhatsApp (Untuk anak, pesan masuk ke WA orang tuanya).
2. Jika dibalas "Tidak Hadir", status peserta menjadi `CANCELLED`.
3. Jika dibalas "Hadir" atau diam, status tetap `REGISTERED`.

### D. Proses Check-in via Dashboard (Hari H)
1. Dashboard admin dapat diakses dari laptop maupun smartphone. Namun, **menu Scanner QR akan mendeteksi perangkat dan hanya bisa dibuka jika diakses menggunakan smartphone**.
2. Panitia melakukan scan QR Code peserta, dan layar akan merespon dengan warna (Hijau/Kuning/Merah).
3. **Manual Check-in:** Admin dapat menekan tombol "Check In" langsung dari tabel dashboard tanpa perlu scan.

### E. Manajemen Pendaftaran Hari H
1. Pada hari H, admin (`MASTER`) dapat membuka kembali pendaftaran via website hingga kapasitas penuh (440).
2. Admin juga dapat mendaftarkan peserta secara manual di tempat (On-Site Registration).

---

## 4. Fitur Dashboard Admin

1. **Overview / Statistik:** Statistik kapasitas (Total, Sisa, Hadir, Batal).
2. **Participant Data:** Tabel data peserta dengan fitur:
   - Pencarian & Filter.
   - Tombol **Check-in Manual** per baris.
   - **Fitur Import Data** (dari `.csv` / `.xlsx`).
   - **Fitur Export Data** (unduh ke `.csv` / `.xlsx`).
3. **QR Check-in:** Terkunci hanya untuk akses dari *smartphone*.
4. **WhatsApp System (Mock):** Simulasi webhook RSVP dan pengiriman QR.
5. **System Management:** Toggle buka/tutup pendaftaran landing page (sangat berguna di hari H).
