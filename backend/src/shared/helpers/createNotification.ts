import { pool } from "../../config/database";

export async function createNotification(
  employeeId: string,
  type: string,
  message: string,
  referenceType?: string,
  referenceId?: string,
) {
  await pool.query(
    `INSERT INTO notifications (employee_id, type, message, reference_type, reference_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [employeeId, type, message, referenceType ?? null, referenceId ?? null],
  );
}
