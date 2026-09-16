import { Request, Response } from "express";
import { pool } from "../../config/database";

export async function listRoles(req: Request, res: Response) {
  try {
    const result = await pool.query(`SELECT id, name FROM roles ORDER BY name`);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[listRoles] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}