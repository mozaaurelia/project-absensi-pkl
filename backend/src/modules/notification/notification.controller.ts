import { Request, Response } from "express";
import { pool } from "../../config/database";

export async function myNotifications(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications WHERE employee_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.sub],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[myNotifications] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function markAsRead(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND employee_id = $2 RETURNING *`,
      [req.params.id, req.user.sub],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Notification not found" },
        });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[markAsRead] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function markAllAsRead(req: Request, res: Response) {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = true WHERE employee_id = $1 AND is_read = false`,
      [req.user.sub],
    );
    res.json({
      success: true,
      data: { message: "All notifications marked as read" },
    });
  } catch (err) {
    console.error("[markAllAsRead] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}
