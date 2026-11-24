# Musik Pintar (Smart Audio Scheduler)

Aplikasi pemutar musik terjadwal dan otomatisasi jadwal sholat / adzan untuk kantor, sekolah, maupun instansi — tersedia dalam versi **Web / PWA** dan **Aplikasi Desktop Native (Windows & Linux)** berbasis Electron.

## Fitur Utama

- **Jadwal Musik Otomatis:** Putar audio atau playlist sesuai jam mulai, jam selesai, hari aktif, volume per-jadwal, dan mode *Loop* / *1x* — lengkap dengan fitur **Export & Import JSON**.
- **Jadwal Sholat & Adzan Otomatis:** Perhitungan waktu sholat standar Kemenag RI / MABIMS dengan jeda musik otomatis sebelum adzan, audio adzan per waktu sholat, serta doa setelah adzan.
- **Library Lokal & Google Drive Cache:** Mendukung file audio/video lokal (tersimpan offline) maupun link Google Drive yang otomatis di-cache ke disk lokal server/desktop untuk menghemat bandwidth.
- **Mode Desktop Native (Electron — Windows & Linux):**
  - Berjalan **100% lokal (Database Lokal)** tanpa perlu login atau koneksi database cloud.
  - Tetap berjalan di **System Tray** saat jendela ditutup (`X`), mendukung **Auto-Start** saat komputer menyala, dan tombol **Shutdown App** untuk mematikan aplikasi sepenuhnya.
- **Mode Web / PWA:** Mendukung multi-user dengan Neon Postgres & Neon Auth, dapat diinstal sebagai Progressive Web App (PWA).

## Menjalankan Secara Lokal

### 1. Instalasi Dependensi
```bash
npm install
```

### 2. Konfigurasi Environment (Khusus Mode Web / Server)
Salin `.env.example` menjadi `.env` lalu isi kredensial Neon Anda (tidak diperlukan jika hanya memakai Mode Desktop Lokal):
```bash
cp .env.example .env
```

### 3. Menjalankan Aplikasi
- **Mode Web (Development):** `npm run dev`
- **Mode Web (Build & Preview):** `npm run build && npm run preview`
- **Mode Desktop (Electron):** `npm run electron:dev`
- **Build Installer Desktop:**
  - Linux (`.AppImage` & `.deb`): `npm run build:linux`
  - Windows (`.zip` / `.exe`): `npm run build:win`
