import { Request, Response } from "express";
import { pool } from "../../config/database";

export async function listCompanies(req: Request, res: Response) {
  try {
    const result = await pool.query(`SELECT * FROM companies ORDER BY name`);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[listCompanies] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function getCompanyById(req: Request, res: Response) {
  try {
    const result = await pool.query(`SELECT * FROM companies WHERE id = $1`, [
      req.params.id,
    ]);
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Company not found" },
        });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[getCompanyById] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function createCompany(req: Request, res: Response) {
  try {
    const { name } = req.body;
    const result = await pool.query(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING *`,
      [name],
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[createCompany] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function updateCompany(req: Request, res: Response) {
  try {
    const { name } = req.body;
    const result = await pool.query(
      `UPDATE companies SET name = COALESCE($1, name), updated_at = now() WHERE id = $2 RETURNING *`,
      [name, req.params.id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Company not found" },
        });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[updateCompany] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function updateCompanyStatus(req: Request, res: Response) {
  try {
    const { status } = req.body; // 'active' | 'inactive'
    const result = await pool.query(
      `UPDATE companies SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [status, req.params.id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Company not found" },
        });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[updateCompanyStatus] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}
