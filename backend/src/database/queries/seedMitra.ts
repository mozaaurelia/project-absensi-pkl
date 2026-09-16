// src/database/queries/seedMitra.ts
// Seed idempotent untuk PT Mitra Baru — company/mitra kedua dengan JADWAL BERBEDA
// dari PT Testing SAMS (10:00–18:00, bukan 09:00–17:00).
//
// Tujuan: bukti multi-tenant — tiap company punya shift/window/tolerance sendiri.
// Jadi jadwal, telat, jendela absen, & auto-alpha dihitung per jadwal company tsb.
//
// Run: npm run seed:mitra
// (bisa dijalankan setelah/di depan seed:testing — tidak saling menghapus)
//
//   TIP reset: untuk mengulang, cukup run ulang script ini (idempotent).

import bcrypt from "bcrypt";
import { pool } from "../../config/database";
import type { PoolClient } from "pg";

const COMPANY_NAME = "PT Mitra Baru";
const EMAIL_ADMIN = "mitraadmin4182@linuq.com";
const EMAIL_KARYAWAN = "mitrakaryawan5871@linuq.com";
const PASSWORD = "password123";

// Jadwal MITRA: masuk 10:00, pulang 18:00. Toleransi 10 menit, jendela 45 menit.
const SHIFT_NAME = "Shift Mitra";
const SHIFT_START = "10:00:00";
const SHIFT_END = "18:00:00";
const SHIFT_TOLERANCE_MIN = 10;
const SHIFT_CHECKIN_WINDOW_MIN = 45;

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function cleanup(client: PoolClient, companyId: string, empIds: string[]): Promise<void> {
  if (empIds.length > 0) {
    await client.query(`DELETE FROM attendances WHERE company_id = $1`, [companyId]);
    await client.query(
      `DELETE FROM notifications WHERE employee_id = ANY($1::uuid[])`,
      [empIds],
    );
    await client.query(
      `DELETE FROM employee_face_references WHERE employee_id = ANY($1::uuid[])`,
      [empIds],
    );
    await client.query(
      `DELETE FROM employee_schedules WHERE employee_id = ANY($1::uuid[])`,
      [empIds],
    );
    await client.query(`UPDATE employees SET supervisor_id = NULL WHERE company_id = $1`, [companyId]);
    await client.query(`DELETE FROM employees WHERE company_id = $1`, [companyId]);
  }
  await client.query(`DELETE FROM leave_types WHERE company_id = $1`, [companyId]);
  await client.query(`DELETE FROM shifts WHERE company_id = $1`, [companyId]);
  await client.query(`DELETE FROM working_day_patterns WHERE company_id = $1`, [companyId]);
  await client.query(`DELETE FROM office_locations WHERE company_id = $1`, [companyId]);
  await client.query(`DELETE FROM roles WHERE company_id = $1`, [companyId]);
  await client.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ id: string }>(
      `SELECT id FROM companies WHERE name = $1`,
      [COMPANY_NAME],
    );
    let companyId = existing.rows[0]?.id;
    if (companyId) {
      const empRes = await client.query<{ id: string }>(
        `SELECT id FROM employees WHERE company_id = $1`,
        [companyId],
      );
      await cleanup(client, companyId, empRes.rows.map((r) => r.id));
      console.log(`↻ Re-seed ${COMPANY_NAME}...`);
    }

    // Company + roles
    const companyRes = await client.query<{ id: string }>(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [COMPANY_NAME],
    );
    companyId = companyRes.rows[0].id;

    const adminRole = await client.query<{ id: string }>(
      `INSERT INTO roles (company_id, name) VALUES ($1, 'admin') RETURNING id`,
      [companyId],
    );
    const empRole = await client.query<{ id: string }>(
      `INSERT INTO roles (company_id, name) VALUES ($1, 'employee') RETURNING id`,
      [companyId],
    );

    // Shift + WDP + lokasi (jadwal MIRTA berbeda dari SAMS)
    const shiftRes = await client.query<{ id: string }>(
      `INSERT INTO shifts (company_id, name, start_time, end_time, tolerance_minutes, checkin_window_minutes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [companyId, SHIFT_NAME, SHIFT_START, SHIFT_END, SHIFT_TOLERANCE_MIN, SHIFT_CHECKIN_WINDOW_MIN],
    );
    const wdpRes = await client.query<{ id: string }>(
      `INSERT INTO working_day_patterns (company_id, name, active_days)
       VALUES ($1, 'Senin-Jumat', ARRAY[1,2,3,4,5]::int[]) RETURNING id`,
      [companyId],
    );
    const locRes = await client.query<{ id: string }>(
      `INSERT INTO office_locations (company_id, name, latitude, longitude, radius_meters)
       VALUES ($1, 'Kantor Mitra', -6.2088, 106.8456, 300) RETURNING id`,
      [companyId],
    );

    // Leave types (minimal utk halaman perizinan)
    await client.query(
      `INSERT INTO leave_types (company_id, name, requires_attachment) VALUES ($1, 'Cuti Tahunan', false)`,
      [companyId],
    );
    await client.query(
      `INSERT INTO leave_types (company_id, name, requires_attachment) VALUES ($1, 'Izin', false)`,
      [companyId],
    );

    // Accounts
    const hash = await bcrypt.hash(PASSWORD, 10);
    const adminRes = await client.query<{ id: string }>(
      `INSERT INTO employees (company_id, role_id, name, email, password_hash, join_date, status)
       VALUES ($1, $2, 'Admin Mitra', $3, $4, NOW(), 'active') RETURNING id`,
      [companyId, adminRole.rows[0].id, EMAIL_ADMIN, hash],
    );
    const kRes = await client.query<{ id: string }>(
      `INSERT INTO employees (company_id, role_id, name, email, password_hash, join_date, status)
       VALUES ($1, $2, 'Karyawan Mitra', $3, $4, NOW(), 'active') RETURNING id`,
      [companyId, empRole.rows[0].id, EMAIL_KARYAWAN, hash],
    );

    // Schedules — admin & karyawan memakai jadwal mitra (10:00–18:00)
    const startDate = ymd(addDays(new Date(), -21));
    const scheduleRes = await client.query<{ id: string }>(
      `INSERT INTO employee_schedules (employee_id, shift_id, working_day_pattern_id, location_id, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, NULL) RETURNING id`,
      [kRes.rows[0].id, shiftRes.rows[0].id, wdpRes.rows[0].id, locRes.rows[0].id, startDate],
    );
    await client.query(
      `INSERT INTO employee_schedules (employee_id, shift_id, working_day_pattern_id, location_id, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, NULL)`,
      [adminRes.rows[0].id, shiftRes.rows[0].id, wdpRes.rows[0].id, locRes.rows[0].id, startDate],
    );

    // Kuota cuti
    await client.query(
      `INSERT INTO leave_quota_ledger (employee_id, period, entry_type, amount, reason, created_by)
       VALUES ($1, $2, 'earn', 12, 'Initial annual leave quota', $3)`,
      [kRes.rows[0].id, `${new Date().getFullYear()}-01-01`, adminRes.rows[0].id],
    );

    await client.query("COMMIT");

    console.log(`✅ Seed ${COMPANY_NAME} selesai!`);
    console.log(`   Shift: ${SHIFT_NAME} ${SHIFT_START}–${SHIFT_END} (telat lewat ${SHIFT_START} + ${SHIFT_TOLERANCE_MIN}m, jendela ${SHIFT_CHECKIN_WINDOW_MIN}m)`);
    console.log(`   Admin:     ${EMAIL_ADMIN} / ${PASSWORD}`);
    console.log(`   Karyawan:  ${EMAIL_KARYAWAN} / ${PASSWORD}`);
    console.log(`   Schedule karyawan: ${scheduleRes.rows[0].id}`);
    console.log(`\n   Untuk bukti multi-tenant: bandingkan jadwal ini dengan PT Testing SAMS`);
    console.log(`   (09:00–17:00, Karyawan 3 sore 14:00–22:00).`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed mitra gagal:", err);
    process.exit(1);
  });