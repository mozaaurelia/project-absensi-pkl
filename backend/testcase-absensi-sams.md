# Test Case Checklist — Modul Absensi (SAMS)

Dokumen ini **fokus pada alur fitur yang dipakai setiap hari** per role (Karyawan, Atasan, Admin/HRD, Superadmin).
Checklist di bawah = "real test case": jalankan langkahnya, cocokkan dengan harapan, lalu isi [x].

---

## 1. Persiapan

### 1.1 Akun Test (`npm run seed:testing`)

| Role       | Email                    | Password        | Jadwal      |
| :---       | :---                     | :---            | :---        |
| Superadmin | `lahapi7651@joystill.com`| `superadmin123` | -           |
| Admin/HRD  | `yokafa5745@novelv.com`  | `password123`   | 09:00–17:00 |
| Supervisor | `mipesa7964@luhupo.com`  | `password123`   | 09:00–17:00 |
| Karyawan 1 | `vawik29615@luhupo.com`  | `password123`   | 09:00–17:00 |
| Karyawan 2 | `majase5156@neplis.com`  | `password123`   | 09:00–17:00 |
| Karyawan 3 | `kareto3124@neplis.com`  | `password123`   | 14:00–22:00 |

> Aturan SAMS: jendela absen masuk = 1 jam (09:00–10:00), telat kalau > 09:00.
> Karyawan 3: jendela 14:00–15:00, telat kalau > 14:05.

### 1.2 Akun Mitra (`npm run seed:mitra`) — bukti multi-tenant

| Role           | Email                         | Password      | Jadwal      |
| :---           | :---                          | :---          | :---        |
| Admin Mitra    | `mitraadmin4182@linuq.com`    | `password123` | 10:00–18:00 |
| Karyawan Mitra | `mitrakaryawan5871@linuq.com` | `password123` | 10:00–18:00 |

> Aturan Mitra: jendela absen masuk = 45 menit (10:00–10:45), telat kalau > 10:10.

### 1.3 Perintah Bantu

| Perintah                           | Fungsi                                            |
| :---                               | :---                                              |
| `npm run seed:testing`             | Seed ulang PT Testing SAMS (idempotent)           |
| `npm run seed:mitra`               | Seed ulang PT Mitra Baru (idempotent)             |
| `npm run reset:testing-attendance` | Hapus absensi/notif hari ini utk uji ulang        |
| `npm run cron:run -- --auto-alpha` | Jalankan auto-alpha sekarang (tanpa tunggu 23:00) |
| `npm run cron:run -- --reminders`  | Jalankan reminder absen sekarang                  |

---

## 2. Karyawan (alur harian paling sering)

### 2.1 Absen Masuk

**K1 — Login & absen masuk tepat waktu**
Login Karyawan 1, buka Dashboard, klik "Absen Masuk" jam 09:00, foto wajah di depan kantor.
Expected: Diterima, status "Tepat Waktu", muncul di History.

- [ ] Pass — Hasil aktual: **______________**

**K2 — Absen masuk saat telat**
Clock-in jam 09:20 (masih dalam jendela 09–10).
Expected: Diterima, status "Telat", tercatat jumlah menit telat.

- [ ] Pass — Hasil aktual: **______________**

**K3 — Absen masuk sebelum waktunya**
Clock-in jam 07:30 (di luar jendela).
Expected: Ditolak "Belum waktunya absen", tombol terkunci.

- [ ] Pass — Hasil aktual: **______________**

**K4 — Absen masuk setelah jendela tutup**
Clock-in jam 10:05.
Expected: Ditolak "Jendela absen sudah tutup".

- [ ] Pass — Hasil aktual: **______________**

**K5 — Absen masuk 2x di hari yang sama**
Setelah K1 sukses, coba clock-in lagi.
Expected: Ditolak "Sudah absen hari ini".

- [ ] Pass — Hasil aktual: **______________**

**K6 — Absen masuk di luar radius kantor**
Jauh dari kantor (GPS di luar radius 500m).
Expected: Ditolak di step lokasi, tidak lanjut ke foto wajah.

- [ ] Pass — Hasil aktual: **______________**

### 2.2 Absen Pulang

**K7 — Clock-out normal di kantor jam 17:00**
Foto wajah di depan kantor.
Expected: Diterima, tercatat jam pulang.

- [ ] Pass — Hasil aktual: **______________**

**K8 — Clock-out darurat di luar radius (maks 20 km)**
Jauh 2–20 km dari kantor, pilih clock-out.
Expected: Tampil form alasan, isi alasan + foto wajah → diterima, tercatat "Darurat (luar area)" dengan alasan.

- [ ] Pass — Hasil aktual: **______________**

**K9 — Clock-out darurat tanpa alasan**
Di luar radius tapi alasan dikosongkan.
Expected: Ditolak "Alasan wajib diisi".

- [ ] Pass — Hasil aktual: **______________**

**K10 — Clock-out terlalu jauh (> 20 km)**
Jauh lebih dari 20 km dari kantor.
Expected: Ditolak total.

- [ ] Pass — Hasil aktual: **______________**

**K11 — Coba absen pulang 2x di hari yang sama**
Setelah clock-out sukses, coba lagi.
Expected: Muncul "No active clock-in today" (karena hari ini sudah punya jam pulang).

- [ ] Pass — Hasil aktual: **______________**

### 2.3 Notifikasi

**K12 — Klik notif → pindah ke halaman yang dimaksud**
Dari lonceng notif, klik notif "belum absen masuk".
Expected: Pindah ke halaman kehadiran sesuai role (bukan hanya jadi "sudah dibaca").

- [ ] Pass — Hasil aktual: **______________**

**K13 — Notif muncul otomatis tanpa refresh**
Minta admin/atasan membuat notif saat layar Karyawan sedang terbuka.
Expected: Lonence berubah & isi muncul ≤ 15 detik.

- [ ] Pass — Hasil aktual: **______________**

### 2.4 Cuti / Izin / Sakit

**K14 — Ajukan cuti**
Menu Leave → Cuti Tahunan, isi tanggal + alasan, submit.
Expected: Status "Pending", muncul di daftar pengajuan.

- [ ] Pass — Hasil aktual: **______________**

**K15 — Cek status setelah disetujui/ditolak atasan**
Lihat pengajuan; notif masuk.
Expected: Status berubah, notif "disetujui/ditolak" muncul.

- [ ] Pass — Hasil aktual: **______________**

**K16 — Ajukan lembur**
Menu (Overtime) → tanggal + jam + alasan, submit.
Expected: Status "Pending".

- [ ] Pass — Hasil aktual: **______________**

**K17 — Lihat jadwal shift**
Menu Schedule.
Expected: Tampil shift & jam sesuai akun (Karyawan 1 = 09–17; Karyawan 3 = 14–22).

- [ ] Pass — Hasil aktual: **______________**

**K18 — Lihat riwayat & statistik kehadiran**
Menu History.
Expected: Rekap bulan berjalan, status hadir/telat, total jam kerja.

- [ ] Pass — Hasil aktual: **______________**

### 2.5 Wajah (Selftie Register)

**K19 — Daftar wajah pertama kali**
Menu Settings → Registrasi Wajah, foto selfie, submit.
Expected: Status "Menunggu Persetujuan".

- [ ] Pass — Hasil aktual: **______________**

**K20 — Coba kirim ulang saat masih pending**
Setelah K19, capture lagi & submit.
Expected: Ditolak "masih menunggu persetujuan" (maks 1 pending).

- [ ] Pass — Hasil aktual: **______________**

**K21 — Kirim ulang setelah ditolak admin — batas 3x/hari**
Setelah admin reject, kirim lagi berturut-turut.
Expected: Kiriman ke-1..3 diterima; ke-4 ditolak (maks 3 pengajuan/hari).

- [ ] Pass — Hasil aktual: **______________**

---

## 3. Atasan / Supervisor

**S1 — Lihat kehadiran anggota tim**
Menu Attendance.
Expected: Muncul data anak buah (hadir/telat/alpha) sesuai jadwal masing-masing.

- [ ] Pass — Hasil aktual: **______________**

**S2 — Setujui / tolak pengajuan cuti anggota**
Menu Leave → pilih pending → Approve/Reject (dengan catatan bila perlu).
Expected: Status berubah; karyawan dapat notif.

- [ ] Pass — Hasil aktual: **______________**

**S3 — Setujui / tolak lembur anggota**
Menu Overtime → Ambil keputusan.
Expected: Status berubah; karyawan dapat notif.

- [ ] Pass — Hasil aktual: **______________**

**S4 — Dapat notif anggota telat / tidak masuk**
Expected: Notif muncul (telat / belum absen masuk) untuk tim yang jadi tanggung jawabnya.

- [ ] Pass — Hasil aktual: **______________**

---

## 4. Admin / HRD

**A1 — Susun shift & jadwal karyawan**
Menu Jadwal/Shift.
Expected: Bisa buat shift baru (jam/toleransi/jendela) & assign ke karyawan; Karyawan 3 di shift sore 14–22.

- [ ] Pass — Hasil aktual: **______________**

**A2 — Kelola master lokasi kantor**
Menu Lokasi → Tambah/Edit kantor (nama, **tipe**, **alamat lengkap**, koordinat, radius).
Expected: Tersimpan; saat edit, tipe & alamat ikut ter-update (bug lama sudah diperbaiki).

- [ ] Pass — Hasil aktual: **______________**

**A3 — Toggle aktif/nonaktif lokasi**
Tutup satu lokasi (nonaktif) → coba absen di lokasi itu.
Expected: Lokasi nonaktif tidak bisa dipakai absen.

- [ ] Pass — Hasil aktual: **______________**

**A4 — Persetujuan registrasi wajah karyawan**
Menu Settings → daftar pending → Approve / Reject.
Expected: Pending hapus; karyawan dapat notif; wajah aktif kalau approved.

- [ ] Pass — Hasil aktual: **______________**

**A5 — Lihat rekap kehadiran semua karyawan**
Menu Kehadiran / Laporan.
Expected: Data lengkap (status, jam, lokasi), bisa filter tanggal & departemen.

- [ ] Pass — Hasil aktual: **______________**

**A6 — Kelola pengguna**
Menu Karyawan → buat/ ubah/ nonaktifkan akun karyawan.
Expected: Tersimpan, bisa login sesuai status.

- [ ] Pass — Hasil aktual: **______________**

**A7 — Lihat rekap otomatis (auto-alpha)**
Pastikan ada karyawan berjadwal hari ini tapi tidak pernah clock-in, lalu jalankan `npm run cron:run -- --auto-alpha`.
Expected: Hari itu tercatat status Alpha untuk karyawan tsb (tanpa jam masuk).

- [ ] Pass — Hasil aktual: **______________**

**A8 — Notif admin utk karyawan yg tidak masuk**
Jalankan `npm run cron:run -- --reminders` saat ada yang belum absen masuk.
Expected: Admin dapat notif "karyawan belum absen masuk".

- [ ] Pass — Hasil aktual: **______________**

---

## 5. Multi-Tenant (bukti data antar-perusahaan terpisah)

**M1 — Karyawan Mitra absen sesuai jadwal Mitra**
Login Karyawan Mitra, absen masuk jam 10:00 (di kantor mitra).
Expected: Diterima "Tepat Waktu" (jadwal & radius Mitra, bukan SAMS).

- [ ] Pass — Hasil aktual: **______________**

**M2 — Karyawan SAMS tidak melihat data Mitra**
Login Karyawan 1 → History.
Expected: Tidak ada data karyawan Mitra; total rekapan tetap milik SAMS saja.

- [ ] Pass — Hasil aktual: **______________**

**M3 — Admin SAMS tidak melihat karyawan Mitra**
Login Admin → menu Karyawan / Kehadiran.
Expected: Daftar karyawan & absensi hanya dari SAMS.

- [ ] Pass — Hasil aktual: **______________**

---

## 6. Ringkasan

| Bagian          | Total       | Pass | Fail |
| :---            | :--:        | :--: | :--: |
| 2. Karyawan     | 21          |      |      |
| 3. Atasan       | 4           |      |      |
| 4. Admin/HRD    | 8           |      |      |
| 5. Multi-Tenant | 3           |      |      |
| **Total**       | **36**      |      |      |

> Belum termasuk: **A/B/C/D lama** (waktu clock-in, lokasi, department, notifikasi) — lihat file revisi sebelumnya bila perlu.

### Bug / Temuan

1.
2.
3.

### Catatan Tambahan

- Wajah harus terdaftar & disetujui admin dulu sebelum bisa clock-in (kecuali superadmin).
- Untuk reset data absen antar skenario: `npm run reset:testing-attendance`.
- Uji realtime notif pakai 2 browser/jendela berbeda agar bisa saling mengamati.