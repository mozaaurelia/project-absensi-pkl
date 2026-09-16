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
    const { name, address, type, latitude, longitude, radius_meters } = req.body;
    const result = await pool.query(
      `INSERT INTO office_locations (company_id, name, address, type, latitude, longitude, radius_meters)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        req.user.companyId,
        name,
        address ?? null,
        type ?? "kantor_pusat",
        latitude,
        longitude,
        radius_meters ?? 500,
      ],
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
    const { name, address, type, latitude, longitude, radius_meters } = req.body;
    const result = await pool.query(
      `UPDATE office_locations SET name = COALESCE($1, name), address = COALESCE($2, address),
       type = COALESCE($3, type), latitude = COALESCE($4, latitude),
       longitude = COALESCE($5, longitude), radius_meters = COALESCE($6, radius_meters)
       WHERE id = $7 AND company_id = $8 RETURNING *`,
      [
        name,
        address ?? null,
        type ?? null,
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
  const client = await pool.connect();
  try {
    // Check for dependent records in employee_schedules
    const checkRes = await client.query(
      `SELECT id FROM employee_schedules WHERE location_id = $1 AND company_id = $2`,
      [req.params.id, req.user.companyId],
    );
    
    if (checkRes.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: { code: "DEPENDENCY_EXISTS", message: "Cannot delete location: location is used by employee schedules. Remove or reassign schedules first." },
      });
    }
    
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
  } finally {
    client.release();
  }
}
