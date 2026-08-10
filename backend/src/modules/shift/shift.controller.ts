import { Request, Response } from "express";
import { pool } from "../../config/database";

export async function listShifts(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT * FROM shifts WHERE company_id = $1 ORDER BY name`,
      [req.user.companyId],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[listShifts] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function createShift(req: Request, res: Response) {
  try {
    const { name, start_time, end_time, tolerance_minutes } = req.body;
    const result = await pool.query(
      `INSERT INTO shifts (company_id, name, start_time, end_time, tolerance_minutes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.companyId, name, start_time, end_time, tolerance_minutes ?? 15],
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[createShift] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function updateShift(req: Request, res: Response) {
  try {
    const { name, start_time, end_time, tolerance_minutes } = req.body;
    const result = await pool.query(
      `UPDATE shifts SET name = COALESCE($1, name), start_time = COALESCE($2, start_time),
       end_time = COALESCE($3, end_time), tolerance_minutes = COALESCE($4, tolerance_minutes)
       WHERE id = $5 AND company_id = $6 RETURNING *`,
      [
        name,
        start_time,
        end_time,
        tolerance_minutes,
        req.params.id,
        req.user.companyId,
      ],
    );
    if (result.rows.length === 0)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Shift not found" },
        });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[updateShift] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function deleteShift(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `DELETE FROM shifts WHERE id = $1 AND company_id = $2 RETURNING id`,
      [req.params.id, req.user.companyId],
    );
    if (result.rows.length === 0)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Shift not found" },
        });
    res.json({ success: true, data: { message: "Shift deleted" } });
  } catch (err) {
    console.error("[deleteShift] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}
