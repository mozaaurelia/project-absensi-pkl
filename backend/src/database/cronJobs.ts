import cron from "node-cron";
import { pool } from "../config/database";
import { createNotification } from "../shared/helpers/createNotification";

// ============================================
// JOB 0: Attendance reminder notifications
// Jalan tiap 15 menit — cek karyawan yang:
//  - belum clock-in padahal melewati jendela absen (D1 => karyawan, D2 => admin)
//  - sudah clock-in tapi belum clock-out padahal lewat jam pulang (D3 => karyawan, D4 => admin)
// ============================================
async function generateAttendanceReminders(): Promise<number> {
  console.log("🔔 Menjalankan generate attendance reminders...");

  // Karyawan dengan jadwal aktif hari ini (START < now < END).
  // NOTE: tanpa bergantung start_time, cukup selama shiftnya sedang/masih berlangsung.
  const result = await pool.query(`
    WITH today_schedule AS (
      SELECT es.employee_id, e.company_id,
             s.start_time, s.end_time, s.checkin_window_minutes,
             e.supervisor_id
      FROM employee_schedules es
      JOIN employees e ON e.id = es.employee_id
      JOIN shifts s ON es.shift_id = s.id
      WHERE e.status = 'active'
        AND (es.end_date IS NULL OR es.end_date >= CURRENT_DATE)
    ),
    attendance_today AS (
      SELECT employee_id, company_id,
             COUNT(*) FILTER (WHERE clock_out_time IS NOT NULL) AS has_clock_out
      FROM attendances
      WHERE clock_in_time >= CURRENT_DATE
        AND clock_in_time < CURRENT_DATE + INTERVAL '1 day'
        AND status <> 'alpha'
      GROUP BY employee_id, company_id
    )
    SELECT ts.*, at.has_clock_out,
           (at.has_clock_out > 0) AS clocked_out,
           EXISTS(SELECT 1 FROM attendances a
                  WHERE a.employee_id = ts.employee_id
                    AND a.clock_in_time >= CURRENT_DATE
                    AND a.clock_in_time < CURRENT_DATE + INTERVAL '1 day'
                    AND a.status <> 'alpha') AS clocked_in
    FROM today_schedule ts
    LEFT JOIN attendance_today at
      ON at.employee_id = ts.employee_id AND at.company_id = ts.company_id
  `);

  let count = 0;
  const now = Date.now();

  async function notify(employeeId: string, companyId: string, type: string, message: string) {
    // Jangan spam: 1 notifikasi per (employee, type, tanggal) per hari
    const dup = await pool.query(
      `SELECT 1 FROM notifications
       WHERE employee_id = $1 AND type = $2
         AND created_at >= CURRENT_DATE
       LIMIT 1`,
      [employeeId, type],
    );
    if (dup.rows.length > 0) return;
    await createNotification(
      employeeId,
      type,
      message,
      "attendance",
    );
    count++;
  }

  async function notifyAllAdmins(companyId: string, type: string, message: string) {
    const admins = await pool.query(
      `SELECT e.id FROM employees e
       JOIN roles r ON e.role_id = r.id
       WHERE e.company_id = $1 AND e.status = 'active' AND LOWER(r.name) = 'admin'`,
      [companyId],
    );
    for (const a of admins.rows) {
      await notify(a.id, companyId, type, message);
    }
  }

  for (const row of result.rows) {
    const [startH, startM] = row.start_time.split(":").map(Number);
    const scheduleStart = new Date();
    scheduleStart.setHours(startH, startM, 0, 0);
    const scheduleStartMs = scheduleStart.getTime();

    if (row.checkin_window_minutes != null && !row.clocked_in) {
      // Lewat jendela absen tapi belum clock-in
      const windowCloseMs = scheduleStartMs + row.checkin_window_minutes * 60 * 1000;
      if (now >= windowCloseMs) {
        await notify(
          row.employee_id,
          row.company_id,
          "missing_clock_in",
          "Anda belum melakukan absen masuk hari ini.",
        );
        await notifyAllAdmins(
          row.company_id,
          "missing_clock_in",
          `Karyawan belum absen masuk hari ini.`,
        );
      }
    }

    if (row.end_time) {
      const [endH, endM] = row.end_time.split(":").map(Number);
      const scheduleEnd = new Date();
      scheduleEnd.setHours(endH, endM, 0, 0);
      const scheduleEndMs = scheduleEnd.getTime();

      // Sudah lewat jam pulang tapi belum clock-out
      if (now >= scheduleEndMs && row.clocked_in && !row.clocked_out) {
        await notify(
          row.employee_id,
          row.company_id,
          "missing_clock_out",
          "Anda belum melakukan absen pulang. Jangan lupa clock-out.",
        );
        await notifyAllAdmins(
          row.company_id,
          "missing_clock_out",
          `Karyawan belum absen pulang hari ini.`,
        );
      }
    }
  }

  console.log(`✅ ${count} notifikasi remider absensi dibuat`);
  return count;
}

// ============================================
// JOB 1: Auto-mark Alpha
// Jalan tiap hari jam 23:00 — cek siapa yang punya jadwal
// hari itu tapi nggak pernah clock-in
// ============================================
async function autoMarkAlpha(): Promise<number> {
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
  return result.rowCount ?? 0;
}

// ============================================
// JOB 2: Reset/Tambah Kuota Cuti Bulanan
// Jalan tiap tanggal 1, jam 00:00
// ============================================
async function monthlyLeaveQuota(): Promise<number> {
  console.log("🔄 Menjalankan reset kuota cuti bulanan...");

  const result = await pool.query(`
    INSERT INTO leave_quota_ledger (employee_id, period, entry_type, amount, reason, created_by)
    SELECT id, date_trunc('month', CURRENT_DATE), 'earn', 1, 'Kuota bulanan otomatis', NULL
    FROM employees
    WHERE status = 'active'
    RETURNING id
  `);

  console.log(`✅ Kuota cuti ditambahkan untuk ${result.rowCount} karyawan`);
  return result.rowCount ?? 0;
}

// ============================================
// JOB 3: Generate Rekap Terjadwal
// Jalan tiap akhir bulan, jam 23:30
// ============================================
async function generateMonthlyRecap(): Promise<number> {
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
  return result.rowCount ?? 0;
}

// ============================================
// Registrasi semua cron job
// ============================================
export function startCronJobs() {
  // Attendance reminders — tiap 15 menit
  cron.schedule("*/15 * * * *", generateAttendanceReminders);

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

  console.log("Cron jobs aktif: auto-alpha, monthly quota, monthly recap");
}

// Export juga fungsi individualnya, buat testing manual tanpa nunggu jadwal
export {
  generateAttendanceReminders,
  autoMarkAlpha,
  monthlyLeaveQuota,
  generateMonthlyRecap,
};
