import { Request, Response } from "express";
import { pool } from "../../config/database";

export async function listPositions(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT * FROM positions WHERE company_id = $1 ORDER BY name`,
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
    const { name } = req.body;
    const result = await pool.query(
      `INSERT INTO positions (company_id, name) VALUES ($1, $2) RETURNING *`,
      [req.user.companyId, name],
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
    const { name } = req.body;
    const result = await pool.query(
      `UPDATE positions SET name = $1 WHERE id = $2 AND company_id = $3 RETURNING *`,
      [name, req.params.id, req.user.companyId],
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
