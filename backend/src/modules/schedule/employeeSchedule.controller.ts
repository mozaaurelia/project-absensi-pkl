import { Request, Response } from "express";
import { pool } from "../../config/database";

export async function getEmployeeSchedule(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT es.*, s.name as shift_name, s.start_time, s.end_time, l.name as location_name
       FROM employee_schedules es
       JOIN shifts s ON es.shift_id = s.id
       JOIN office_locations l ON es.location_id = l.id
       WHERE es.employee_id = $1 AND (es.end_date IS NULL OR es.end_date >= CURRENT_DATE)
       ORDER BY es.start_date DESC LIMIT 1`,
      [req.params.employeeId],
    );
    res.json({ success: true, data: result.rows[0] || null });
  } catch (err) {
    console.error("[getEmployeeSchedule] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function assignSchedule(req: Request, res: Response) {
  try {
    const {
      employee_id,
      shift_id,
      working_day_pattern_id,
      location_id,
      start_date,
    } = req.body;
    const result = await pool.query(
      `INSERT INTO employee_schedules (employee_id, shift_id, working_day_pattern_id, location_id, start_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [employee_id, shift_id, working_day_pattern_id, location_id, start_date],
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[assignSchedule] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function endSchedule(req: Request, res: Response) {
  try {
    const { end_date } = req.body;
    // end_date omitted => end the schedule immediately ("Akhiri sekarang"):
    // set end_date to yesterday so every "active" predicate
    // (end_date IS NULL OR end_date >= CURRENT_DATE) turns false right away.
    // end_date provided => schedule stays valid THROUGH that date (inclusive).
    const result = await pool.query(
      `UPDATE employee_schedules es
       SET end_date = COALESCE($1::date, CURRENT_DATE - 1)
       WHERE es.id = $2
         AND EXISTS (
           SELECT 1 FROM employees e
           WHERE e.id = es.employee_id AND e.company_id = $3
         )
       RETURNING es.*`,
      [end_date ?? null, req.params.id, req.user.companyId],
    );
    if (result.rows.length === 0)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Schedule not found" },
        });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[endSchedule] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}
