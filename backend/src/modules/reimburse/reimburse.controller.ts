import { Request, Response } from "express";
import { pool } from "../../config/database";
import cloudinary from "../../config/cloudinary";
import { createNotification } from "../../shared/helpers/createNotification";

const CATEGORIES = ["transport", "meal", "health", "education", "other"];

function normalizeCategory(raw: string): string {
  return CATEGORIES.includes(raw) ? raw : "other";
}

export async function createReimburseRequest(req: Request, res: Response) {
  try {
    const { title, category, expense_date, amount, description, attachment, employee_id } = req.body;
    const employeeId = employee_id || req.user.sub;

    if (!title || !expense_date || amount == null || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "title, expense_date, and a positive amount are required",
        },
      });
    }

    // only admin/supervisor may submit on behalf of another employee
    const isManager = req.user.role === "admin" || req.user.role === "supervisor";
    if (employee_id && !isManager) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "You may only submit reimbursement requests for yourself",
        },
      });
    }

    let attachmentUrl: string | null = null;
    if (attachment && typeof attachment === "string") {
      const dataUri = attachment.includes(",")
        ? attachment
        : `data:image/jpeg;base64,${attachment}`;
      const uploadResult = await cloudinary.uploader.upload(dataUri, {
        folder: "sams/reimburse-attachments",
        resource_type: "auto",
      });
      attachmentUrl = uploadResult.secure_url;
    }

    const positionResult = await pool.query(
      `SELECT p.reimbursement_limit
       FROM employees e
       JOIN positions p ON e.position_id = p.id
       WHERE e.id = $1`,
      [employeeId],
    );
    const limit = Number(positionResult.rows[0]?.reimbursement_limit ?? 0);
    if (limit > 0) {
      const usedResult = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total_used
         FROM reimbursements
         WHERE employee_id = $1
           AND status IN ('pending', 'approved')
           AND date_trunc('month', expense_date) = date_trunc('month', $2::date)`,
        [employeeId, expense_date],
      );
      const usedAmount = Number(usedResult.rows[0].total_used);
      const remaining = limit - usedAmount;
      if (Number(amount) > remaining) {
        return res.status(400).json({
          success: false,
          error: {
            code: "LIMIT_EXCEEDED",
            message: `Melebihi batas reimbursement jabatan untuk bulan ini. Limit: ${limit.toLocaleString("id-ID")}, terpakai: ${usedAmount.toLocaleString("id-ID")}, sisa: ${Math.max(remaining, 0).toLocaleString("id-ID")}.`,
          },
        });
      }
    }

    const result = await pool.query(
      `INSERT INTO reimbursements (company_id, employee_id, title, category, expense_date, amount, description, attachment_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') RETURNING *`,
      [
        req.user.companyId,
        employeeId,
        title,
        normalizeCategory(category),
        expense_date,
        Number(amount),
        description ?? null,
        attachmentUrl,
      ],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[createReimburseRequest] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function myReimburseRequests(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT * FROM reimbursements WHERE employee_id = $1 ORDER BY created_at DESC`,
      [req.user.sub],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[myReimburseRequests] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function teamReimburseRequests(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT r.*, e.name as employee_name
       FROM reimbursements r
       JOIN employees e ON r.employee_id = e.id
       WHERE e.supervisor_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.sub],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[teamReimburseRequests] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function adminReimburseRequests(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT r.*, e.name as employee_name, d.name as department_name,
              p.name as position_name
       FROM reimbursements r
       JOIN employees e ON r.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN positions p ON e.position_id = p.id
       WHERE r.company_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.companyId],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[adminReimburseRequests] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function approveReimburseRequest(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { approval_note } = req.body;

    const result = await pool.query(
      `UPDATE reimbursements SET status = 'approved', approved_by = $1, approved_at = now(), approval_note = $2
       WHERE id = $3 AND company_id = $4 AND status = 'pending' RETURNING *`,
      [req.user.sub, approval_note, id, req.user.companyId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Request not found or already processed",
        },
      });
    }

    await createNotification(
      result.rows[0].employee_id,
      "reimburse_approved",
      `Your reimbursement request (${result.rows[0].title}) has been approved`,
      "reimbursement",
      result.rows[0].id,
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[approveReimburseRequest] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function rejectReimburseRequest(req: Request, res: Response) {
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
      `UPDATE reimbursements SET status = 'rejected', approved_by = $1, approved_at = now(), approval_note = $2
       WHERE id = $3 AND company_id = $4 AND status = 'pending' RETURNING *`,
      [req.user.sub, approval_note, id, req.user.companyId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Request not found or already processed",
        },
      });
    }

    await createNotification(
      result.rows[0].employee_id,
      "reimburse_rejected",
      `Your reimbursement request (${result.rows[0].title}) was rejected: ${approval_note}`,
      "reimbursement",
      result.rows[0].id,
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[rejectReimburseRequest] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}