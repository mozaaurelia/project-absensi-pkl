import cron from "node-cron";
import { pool } from "../config/database";

// ============================================
// JOB 1: Auto-mark Alpha
// Jalan tiap hari jam 23:00 — cek siapa yang punya jadwal
// hari itu tapi nggak pernah clock-in
// ============================================
async function autoMarkAlpha() {
  console.log("🔄 Menjalankan auto-mark Alpha...");

  const result = await pool.query(`
    INSERT INTO attendances (company_id, employee_id, schedule_id, status, created_at)
    SELECT e.company_id, e.id, es.id, 'alpha', now()
    FROM employees e
    JOIN employee_schedules es ON es.employee_id = e.id
      AND (es.end_date IS NULL OR es.end_date >= CURRENT_DATE)
    JOIN working_day_patterns wdp ON es.working_day_pattern_id = wdp.id
    WHERE e.status = 'active'
      -- hari ini termasuk hari kerja karyawan (1=Senin ... 7=Minggu)
      AND EXTRACT(ISODOW FROM CURRENT_DATE) = ANY(wdp.active_days)
      -- belum ada attendance record hari ini sama sekali
      AND NOT EXISTS (
        SELECT 1 FROM attendances a
        WHERE a.employee_id = e.id AND a.clock_in_time >= CURRENT_DATE
      )
    RETURNING id
  `);

  console.log(`✅ ${result.rowCount} karyawan ditandai Alpha`);
}

// ============================================
// JOB 2: Reset/Tambah Kuota Cuti Bulanan
// Jalan tiap tanggal 1, jam 00:00
// ============================================
async function monthlyLeaveQuota() {
  console.log("🔄 Menjalankan reset kuota cuti bulanan...");

  const result = await pool.query(`
    INSERT INTO leave_quota_ledger (employee_id, period, entry_type, amount, reason, created_by)
    SELECT id, date_trunc('month', CURRENT_DATE), 'earn', 1, 'Kuota bulanan otomatis', NULL
    FROM employees
    WHERE status = 'active'
    RETURNING id
  `);

  console.log(`✅ Kuota cuti ditambahkan untuk ${result.rowCount} karyawan`);
}

// ============================================
// JOB 3: Generate Rekap Terjadwal
// Jalan tiap akhir bulan, jam 23:30
// ============================================
async function generateMonthlyRecap() {
  console.log("🔄 Menjalankan generate rekap bulanan...");

  const result = await pool.query(`
    SELECT company_id, employee_id,
           COUNT(*) FILTER (WHERE status = 'hadir') as total_hadir,
           COUNT(*) FILTER (WHERE status = 'telat') as total_telat,
           COUNT(*) FILTER (WHERE status = 'alpha') as total_alpha
    FROM attendances
    WHERE clock_in_time >= date_trunc('month', CURRENT_DATE)
    GROUP BY company_id, employee_id
  `);

  // Untuk sekarang, rekap ini di-log aja / bisa disimpan ke tabel rekap terpisah kalau nanti dibutuhkan
  console.log(`✅ Rekap bulanan dihitung untuk ${result.rowCount} karyawan`);
  // TODO: simpan ke tabel monthly_recap kalau nanti dibutuhkan history rekap tersimpan
}

// ============================================
// Registrasi semua cron job
// ============================================
export function startCronJobs() {
  // Auto-mark Alpha — tiap hari jam 23:00
  cron.schedule("0 23 * * *", autoMarkAlpha);

  // Reset kuota bulanan — tanggal 1, jam 00:00
  cron.schedule("0 0 1 * *", monthlyLeaveQuota);

  // Generate rekap — hari terakhir tiap bulan, jam 23:30
  // (pakai cara: jalan tiap hari jam 23:30, tapi cuma eksekusi kalau besok udah beda bulan)
  cron.schedule("30 23 * * *", async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (tomorrow.getMonth() !== today.getMonth()) {
      await generateMonthlyRecap();
    }
  });

  console.log("⏰ Cron jobs aktif: auto-alpha, monthly quota, monthly recap");
}

// Export juga fungsi individualnya, buat testing manual tanpa nunggu jadwal
export { autoMarkAlpha, monthlyLeaveQuota, generateMonthlyRecap };
