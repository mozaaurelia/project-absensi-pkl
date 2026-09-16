// src/database/queries/seedTestingClean.ts
// Hapus seluruh data terkait "PT Testing SAMS" TANPA insert ulang.
// Dipakai untuk reset berkala sebelum re-seed (npm run seed:testing).
// Tidak menyentuh PT Contoh Sejahtera / PT Mitra Baru.
// Strategi: DELETE child â†’ parent dalam satu transaction, scoped ke company tsb.

import { pool } from "../../config/database";
import type { PoolClient } from "pg";

const COMPANY_NAME = "PT Testing SAMS";
const EMAIL_SUPERADMIN = "pomol90551@lanvos.com";

async function cleanup(client: PoolClient, companyId: string): Promise<void> {
  // Get employee ids in this company
  const empRes = await client.query<{ id: string }>(
    `SELECT id FROM employees WHERE company_id = $1`,
    [companyId],
  );
  const empIds = empRes.rows.map((r) => r.id);

  if (empIds.length === 0) {
    // No employees â€” but master data / superadmin may still exist. Clean by company_id & email scope.
    await client.query(`DELETE FROM superadmins WHERE email = $1`, [EMAIL_SUPERADMIN]);
    await client.query(`DELETE FROM holidays WHERE company_id = $1`, [companyId]);
    await client.query(`DELETE FROM calendar_events WHERE company_id = $1`, [companyId]);
    await client.query(`DELETE FROM leave_types WHERE company_id = $1`, [companyId]);
    await client.query(`DELETE FROM shifts WHERE company_id = $1`, [companyId]);
    await client.query(`DELETE FROM working_day_patterns WHERE company_id = $1`, [companyId]);
    await client.query(`DELETE FROM office_locations WHERE company_id = $1`, [companyId]);
    await client.query(`DELETE FROM department_policies WHERE department_id IN (SELECT id FROM departments WHERE company_id = $1)`, [companyId]);
    await client.query(`DELETE FROM positions WHERE company_id = $1`, [companyId]);
    await client.query(`DELETE FROM departments WHERE company_id = $1`, [companyId]);
    await client.query(`DELETE FROM roles WHERE company_id = $1`, [companyId]);
    await client.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
    return;
  }

  // Delete in FK-safe order. Many FKs are NO ACTION, so order matters.
  // 1. attendance
  await client.query(`DELETE FROM attendances WHERE company_id = $1`, [companyId]);
  // 2. overtime_requests
  await client.query(`DELETE FROM overtime_requests WHERE company_id = $1`, [companyId]);
  // 3. personal_agendas
  await client.query(`DELETE FROM personal_agendas WHERE company_id = $1`, [companyId]);
  // 4. calendar_events (created_by â†’ employees; company_id exists)
  await client.query(`DELETE FROM calendar_events WHERE company_id = $1`, [companyId]);
  // 5. holidays
  await client.query(`DELETE FROM holidays WHERE company_id = $1`, [companyId]);
  // 5b. leave_quota_ledger rows referencing leave_requests of this company
  //     (FK leave_quota_ledger_reference_id_fkey â†’ leave_requests.id, populated on approval)
  await client.query(
    `DELETE FROM leave_quota_ledger WHERE reference_id IN (SELECT id FROM leave_requests WHERE company_id = $1)`,
    [companyId],
  );
  // 6. leave_requests (approved_by â†’ employees)
  await client.query(`DELETE FROM leave_requests WHERE company_id = $1`, [companyId]);
  // 7. leave_quota_ledger
  await client.query(
    `DELETE FROM leave_quota_ledger WHERE employee_id = ANY($1::uuid[])`,
    [empIds],
  );
  // 8. notifications (employee_id â†’ employees)
  await client.query(
    `DELETE FROM notifications WHERE employee_id = ANY($1::uuid[])`,
    [empIds],
  );
  // 9. employee_face_references (CASCADE on employee_id)
  await client.query(
    `DELETE FROM employee_face_references WHERE employee_id = ANY($1::uuid[])`,
    [empIds],
  );
  // 10. password_reset_tokens (account_id, no FK anymore â€” scope by account)
  await client.query(
    `DELETE FROM password_reset_tokens WHERE account_id = ANY($1::uuid[])`,
    [empIds],
  );
  // 11. employee_schedules (employee_id â†’ employees)
  await client.query(
    `DELETE FROM employee_schedules WHERE employee_id = ANY($1::uuid[])`,
    [empIds],
  );
  // 12. audit_logs (entity_id may point to employees etc; scope by actor_id in employees)
  await client.query(
    `DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[])`,
    [empIds],
  );
  // 13. department_policies (department_id â†’ departments)
  await client.query(
    `DELETE FROM department_policies WHERE department_id IN (SELECT id FROM departments WHERE company_id = $1)`,
    [companyId],
  );
  // 14. employees (supervisor_id self-FK â†’ employees) â€” set supervisor_id to NULL first
  await client.query(
    `UPDATE employees SET supervisor_id = NULL WHERE company_id = $1`,
    [companyId],
  );
  await client.query(`DELETE FROM employees WHERE company_id = $1`, [companyId]);
  // 15. superadmins (no FK; clean by email scope)
  await client.query(
    `DELETE FROM superadmins WHERE email = $1`,
    [EMAIL_SUPERADMIN],
  );
  // 16. master data
  await client.query(`DELETE FROM leave_types WHERE company_id = $1`, [companyId]);
  await client.query(`DELETE FROM shifts WHERE company_id = $1`, [companyId]);
  await client.query(`DELETE FROM working_day_patterns WHERE company_id = $1`, [companyId]);
  await client.query(`DELETE FROM office_locations WHERE company_id = $1`, [companyId]);
  await client.query(`DELETE FROM positions WHERE company_id = $1`, [companyId]);
  await client.query(`DELETE FROM departments WHERE company_id = $1`, [companyId]);
  await client.query(`DELETE FROM roles WHERE company_id = $1`, [companyId]);
  // 17. company
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

    if (existing.rows.length === 0) {
      console.log(`â„¹ï¸  Tidak ada company "${COMPANY_NAME}" â€” tidak ada yang perlu dibersihkan.`);
      await client.query("COMMIT");
      return;
    }

    const companyId = existing.rows[0].id;
    console.log(`ðŸ§¹ Membersihkan ${COMPANY_NAME} (id=${companyId})...`);
    await cleanup(client, companyId);

    await client.query("COMMIT");
    console.log(`âœ… Clean selesai â€” seluruh data "${COMPANY_NAME}" telah dihapus.`);
    console.log(`   Jalankan "npm run seed:testing" untuk seed ulang.`);
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
    console.error("âŒ Clean gagal:", err);
    process.exit(1);
  });