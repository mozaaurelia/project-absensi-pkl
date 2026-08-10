import { Request, Response } from "express";
import { pool } from "../../config/database";

export async function listLocations(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT * FROM office_locations WHERE company_id = $1 ORDER BY name`,
      [req.user.companyId],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[listLocations] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function createLocation(req: Request, res: Response) {
  try {
    const { name, latitude, longitude, radius_meters } = req.body;
    const result = await pool.query(
      `INSERT INTO office_locations (company_id, name, latitude, longitude, radius_meters)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.companyId, name, latitude, longitude, radius_meters ?? 100],
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[createLocation] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function updateLocation(req: Request, res: Response) {
  try {
    const { name, latitude, longitude, radius_meters } = req.body;
    const result = await pool.query(
      `UPDATE office_locations SET name = COALESCE($1, name), latitude = COALESCE($2, latitude),
       longitude = COALESCE($3, longitude), radius_meters = COALESCE($4, radius_meters)
       WHERE id = $5 AND company_id = $6 RETURNING *`,
      [
        name,
        latitude,
        longitude,
        radius_meters,
        req.params.id,
        req.user.companyId,
      ],
    );
    if (result.rows.length === 0)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Location not found" },
        });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[updateLocation] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function deleteLocation(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `DELETE FROM office_locations WHERE id = $1 AND company_id = $2 RETURNING id`,
      [req.params.id, req.user.companyId],
    );
    if (result.rows.length === 0)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Location not found" },
        });
    res.json({ success: true, data: { message: "Location deleted" } });
  } catch (err) {
    console.error("[deleteLocation] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}
