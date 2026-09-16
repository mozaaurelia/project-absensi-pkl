// src/database/queries/resetTestingAttendance.ts
// Reset hasil uji manual absensi PT Testing SAMS:
//   - Hapus attendances (default: hanya hari ini) + notifications (default: hanya hari ini)
//     untuk seluruh karyawan company tsb.
//   - Tidak menyentuh PT Contoh Sejahtera / PT Mitra Baru.
//   - `--all` = hapus SEMUA attendance & notification company (bukan hanya hari ini).
// Dipakai sebelum mengulang skenario test case (A1/A2/A4/A5/A6, B1, D5).
//
// Run: npm run reset:testing-attendance     (hanya hari ini)
//      npm run reset:testing-attendance -- --all

import { pool } from "../../config/database";

const COMPANY_NAME = "PT Testing SAMS";

async function run() {
  const scope = process.argv.includes("--all") ? "semua data" : "data hari ini";
  console.log(
    `\u23f9\ufe0f  Reset absensi ${COMPANY_NAME} (${scope}) untuk uji ulang test case...`,
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const companyRes = await client.query<{ id: string }>(
      `SELECT id FROM companies WHERE name = $1`,
      [COMPANY_NAME],
    );
    if (companyRes.rows.length === 0) {
      console.log(`\u2139\ufe0f  Tidak ada company "${COMPANY_NAME}" \u2014 tidak ada yang di-reset.`);
      console.log(`   Jalankan "npm run seed:testing" dulu.`);
      await client.query("COMMIT");
      return;
    }
    const companyId = companyRes.rows[0].id;

    const empRes = await client.query<{ id: string }>(
      `SELECT id FROM employees WHERE company_id = $1`,
      [companyId],
    );
    const empIds = empRes.rows.map((r) => r.id);

    const dateFilter = process.argv.includes("--all") ? "" : " AND clock_in_time >= CURRENT_DATE";
    const notifDateFilter = process.argv.includes("--all")
      ? ""
      : " AND created_at >= CURRENT_DATE";

    if (empIds.length === 0) {
      console.log(`\u2139\ufe0f  Tidak ada karyawan di ${COMPANY_NAME}.`);
      await client.query("COMMIT");
      return;
    }

    const attendRes = await client.query(
      `DELETE FROM attendances WHERE company_id = $1${dateFilter}`,
      [companyId],
    );
    const notifRes = await client.query(
      `DELETE FROM notifications WHERE employee_id = ANY($1::uuid[])${notifDateFilter}`,
      [empIds],
    );

    await client.query("COMMIT");

    console.log(`\u2705  Selesai. Terhapus: ${attendRes.rowCount ?? 0} attendance, ${notifRes.rowCount ?? 0} notification.`);
    console.log(`   Sekarang boleh mengulang skenario test case dari awal.`);
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
    console.error(`\u274c  Reset gagal:`, err);
    process.exit(1);
  });