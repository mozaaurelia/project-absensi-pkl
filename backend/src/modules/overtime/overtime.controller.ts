import { Request, Response } from "express";
import { pool } from "../../config/database";
import { createNotification } from "../../shared/helpers/createNotification";

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function computeTotalHours(startTime: string, endTime: string): number {
  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  const diffMin =
    endMin - startMin >= 0 ? endMin - startMin : endMin - startMin + 24 * 60;
  return Math.round((diffMin / 60) * 100) / 100;
}

export async function createOvertimeRequest(req: Request, res: Response) {
  try {
    const { overtime_date, start_time, end_time, category, reason } = req.body;

    if (!overtime_date || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "overtime_date, start_time, and end_time are required",
        },
      });
    }

    const totalHours = computeTotalHours(start_time, end_time);
    if (totalHours <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_DURATION",
          message: "End time must be after start time",
        },
      });
    }

    const result = await pool.query(
      `INSERT INTO overtime_requests
         (company_id, employee_id, overtime_date, start_time, end_time, total_hours, category, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.user.companyId,
        req.user.sub,
        overtime_date,
        start_time,
        end_time,
        totalHours,
        category ?? null,
        reason ?? null,
      ],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[createOvertimeRequest] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function myOvertimeRequests(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT * FROM overtime_requests
       WHERE employee_id = $1
       ORDER BY created_at DESC`,
      [req.user.sub],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[myOvertimeRequests] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function teamOvertimeRequests(req: Request, res: Response) {
  try {
    const isAdmin = req.user.role === "admin";
    let result;
    if (isAdmin) {
      result = await pool.query(
        `SELECT o.*, e.name AS employee_name, e.supervisor_id
         FROM overtime_requests o
         JOIN employees e ON o.employee_id = e.id
         WHERE o.company_id = $1
         ORDER BY o.created_at DESC`,
        [req.user.companyId],
      );
    } else {
      result = await pool.query(
        `SELECT o.*, e.name AS employee_name, e.supervisor_id
         FROM overtime_requests o
         JOIN employees e ON o.employee_id = e.id
         WHERE e.supervisor_id = $1
         ORDER BY o.created_at DESC`,
        [req.user.sub],
      );
    }
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[teamOvertimeRequests] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function approveOvertimeRequest(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE overtime_requests o
       SET status = 'approved', approved_by = $1, approved_at = now()
       WHERE o.id = $2
         AND o.company_id = $3
         AND o.status = 'pending'
         AND (o.employee_id IN (SELECT e.id FROM employees e WHERE e.supervisor_id = $4) OR $5 = 'admin')
       RETURNING *`,
      [req.user.sub, id, req.user.companyId, req.user.sub, req.user.role],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Request not found or not authorized",
        },
      });
    }

    const row = result.rows[0];
    await createNotification(
      row.employee_id,
      "overtime_approved",
      `Your overtime request on ${row.overtime_date} has been approved`,
      "overtime_request",
      row.id,
    );

    res.json({ success: true, data: row });
  } catch (err) {
    console.error("[approveOvertimeRequest] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function rejectOvertimeRequest(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { approval_note } = req.body;

    if (!approval_note) {
      return res.status(400).json({
        success: false,
        error: {
          code: "REASON_REQUIRED",
          message: "Rejection reason is required",
        },
      });
    }

    const result = await pool.query(
      `UPDATE overtime_requests o
       SET status = 'rejected', approved_by = $1, approved_at = now(), rejection_note = $2
       WHERE o.id = $3
         AND o.company_id = $4
         AND o.status = 'pending'
         AND (o.employee_id IN (SELECT e.id FROM employees e WHERE e.supervisor_id = $5) OR $6 = 'admin')
       RETURNING *`,
      [
        req.user.sub,
        approval_note,
        id,
        req.user.companyId,
        req.user.sub,
        req.user.role,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Request not found or not authorized",
        },
      });
    }

    const row = result.rows[0];
    await createNotification(
      row.employee_id,
      "overtime_rejected",
      `Your overtime request was rejected: ${approval_note}`,
      "overtime_request",
      row.id,
    );

    res.json({ success: true, data: row });
  } catch (err) {
    console.error("[rejectOvertimeRequest] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}