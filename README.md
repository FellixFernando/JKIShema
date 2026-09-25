# JKI Shema - Landing Page & Event Management System

Sistem Web Company Profile dan Pengelolaan Registrasi Event **Christmas Celebration** untuk JKI Shema.

## 🛠️ Tech Stack
- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Database:** PostgreSQL (Supabase)
- **ORM:** Prisma ORM
- **Authentication:** NextAuth.js
- **Styling:** Tailwind CSS
- **Testing:** Jest + React Testing Library

---

## 🚀 Langkah-Langkah Memulai Development (Getting Started)

### 1. Prasyarat System
Pastikan komputer Anda sudah terinstal:
- [Node.js](https://nodejs.org/) (v20 atau lebih baru)
- [Git](https://git-scm.com/)

### 2. Clone Repository & Install Dependencies
```bash
# Clone repository ini
git clone https://github.com/FellixFernando/JKIShema.git

# Masuk ke direktori proyek
cd JKIShema

# Install seluruh dependensi paket
npm install
```

### 3. Konfigurasi Environment Variable (`.env`)
Buat file `.env` di akar direktori proyek (sejajar dengan `package.json`) dan isi dengan konfigurasi berikut (sesuaikan dengan kredensial Supabase Anda):

```env
# Connection Pooling (Port 6543)
DATABASE_URL="postgresql://postgres.[project-id]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"

# Direct Connection (Port 5432)
DIRECT_URL="postgresql://postgres.[project-id]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"

# Secret Key untuk NextAuth
NEXTAUTH_SECRET="rahasia_gereja_christmas_123"
```

### 4. Sinkronisasi Database & Generate Prisma Client
Jalankan perintah berikut untuk membuat tabel ke Supabase dan meng-generate Prisma Client:

```bash
# Generate Prisma Client
npx prisma generate

# Push skema tabel ke Supabase
npx prisma db push
```

### 5. Buat Akun Master Admin Pertama (Seeding)
Jalankan seeder untuk mengisi akun Master Admin default:
```bash
npx prisma db seed
```
> **Default Kredensial Admin:**
> - Username: `master`
> - Password: `master123`

### 6. Jalankan Unit Test (TDD Check)
Pastikan seluruh pengujian fitur dalam keadaan lulus (PASS):
```bash
npm test
```

### 7. Jalankan Server Development
```bash
npm run dev
```
Buka browser Anda dan akses:
- **Public Landing Page:** `http://localhost:3000`
- **Admin Dashboard:** `http://localhost:3000/admin`

---

## 👥 Alur Kerja Kolaborasi Git (Fellix & Tiffany)

Untuk menjaga agar kode di branch utama (`main`) selalu stabil dan tidak bentrok (*merge conflict*), ikuti aturan alur kerja di bawah ini:

### 📍 Struktur Branch
- **`main`**: Branch produksi/utama yang stabil. **Dilarang commit langsung ke branch `main`**.
- **`fellix`**: Branch khusus untuk area pengembangan Fellix.
- **`tiffany`**: Branch khusus untuk area pengembangan Tiffany.

---

### 🔄 Workflow Harian

#### A. Sebelum Mulai Bekerja (Setiap Hari)
Selalu update branch `main` lokal Anda dan gabungkan ke branch milik Anda agar kode Anda selalu terbaru:

```bash
# 1. Pindah ke branch main dan ambil pembaruan terbaru dari GitHub
git checkout main
git pull origin main

# 2. Pindah ke branch pribadi Anda (fellix / tiffany)
git checkout fellix      # (Jika Anda Fellix)
# atau
git checkout tiffany     # (Jika Anda Tiffany)

# 3. Merge pembaruan dari main ke branch pribadi Anda
git merge main
```

---

#### B. Saat Menulis Kode & Commit
Pastikan Anda selalu berada di branch pribadi Anda saat mengubah kode:

```bash
# Cek posisi branch saat ini
git branch

# Pastikan ada di branch fellix atau tiffany!
# Jika belum, pindah dengan: git checkout fellix (atau tiffany)

# Setelah membuat/mengubah kode:
git add .
git commit -m "feat: deskripsi singkat fitur yang selesai dikerjakan"
```

---

#### C. Setelah Fitur Selesai & Mengirim Kode ke GitHub
Push hasil pekerjaan dari branch lokal ke branch pribadi di GitHub:

```bash
# Push ke branch pribadi Anda
git push origin fellix      # (Fellix)
# atau
git push origin tiffany     # (Tiffany)
```

---

#### D. Penggabungan Kode ke Branch Utama (`main`)
1. Buka repository di browser: [https://github.com/FellixFernando/JKIShema](https://github.com/FellixFernando/JKIShema)
2. Buat **Pull Request (PR)** dari branch Anda (`fellix` atau `tiffany`) menuju branch `main`.
3. Diskusikan / periksa bersama rekan tim (code review).
4. Klik **Merge Pull Request** jika pengujian sudah dipastikan aman.
5. Setelah di-merge, kembali ke terminal komputer masing-masing dan jalankan `git checkout main && git pull origin main`.
