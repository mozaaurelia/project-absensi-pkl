import { pool } from "../../config/database";
import { emitToEmployee } from "../../socket";

export async function createNotification(
  employeeId: string,
  type: string,
  message: string,
  referenceType?: string,
  referenceId?: string,
) {
  const result = await pool.query(
    `INSERT INTO notifications (employee_id, type, message, reference_type, reference_id, is_read)
     VALUES ($1, $2, $3, $4, $5, false)
     RETURNING id, type, message, is_read, reference_type, reference_id, created_at`,
    [employeeId, type, message, referenceType ?? null, referenceId ?? null],
  );
  const row = result.rows[0];
  emitToEmployee(employeeId, "notification:new", row);
  return row;
}
