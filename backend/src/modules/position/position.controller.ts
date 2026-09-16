import { Request, Response } from "express";
import { pool } from "../../config/database";

export async function listPositions(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT p.*,
              (
                SELECT COUNT(*)
                FROM employees e
                WHERE e.position_id = p.id AND e.status = 'active'
              ) AS employee_count
       FROM positions p
       WHERE p.company_id = $1
       ORDER BY p.name`,
      [req.user.companyId],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[listPositions] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function createPosition(req: Request, res: Response) {
  try {
    const { name, reimbursement_limit } = req.body;
    const result = await pool.query(
      `INSERT INTO positions (company_id, name, reimbursement_limit)
       VALUES ($1, $2, COALESCE($3::numeric, 0)) RETURNING *`,
      [req.user.companyId, name, reimbursement_limit ?? null],
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[createPosition] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function updatePosition(req: Request, res: Response) {
  try {
    const { name, reimbursement_limit } = req.body;
    const result = await pool.query(
      `UPDATE positions
       SET name = $1,
           reimbursement_limit = COALESCE($2::numeric, reimbursement_limit)
       WHERE id = $3 AND company_id = $4
       RETURNING *`,
      [name, reimbursement_limit ?? null, req.params.id, req.user.companyId],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Position not found" },
        });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[updatePosition] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function deletePosition(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `DELETE FROM positions WHERE id = $1 AND company_id = $2 RETURNING id`,
      [req.params.id, req.user.companyId],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Position not found" },
        });
    }
    res.json({ success: true, data: { message: "Position deleted" } });
  } catch (err) {
    console.error("[deletePosition] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}
