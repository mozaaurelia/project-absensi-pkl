import { Request, Response } from "express";
import { pool } from "../../config/database";
import cloudinary from "../../config/cloudinary";
import { createNotification } from "../../shared/helpers/createNotification";

export async function listLeaveTypes(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT * FROM leave_types WHERE company_id = $1`,
      [req.user.companyId],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[listLeaveTypes] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function createLeaveRequest(req: Request, res: Response) {
  try {
    const { leave_type_id, start_date, end_date, reason, attachment } = req.body;
    const employeeId = req.user.sub;

    // count number of days (simple: date difference, doesn't exclude weekends/holidays)
    const start = new Date(start_date);
    const end = new Date(end_date);
    const totalDays =
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // check quota balance first
    const balanceResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as balance FROM leave_quota_ledger WHERE employee_id = $1`,
      [employeeId],
    );
    const balance = Number(balanceResult.rows[0].balance);

    if (balance < totalDays) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INSUFFICIENT_QUOTA",
          message: `Insufficient leave quota (balance: ${balance}, required: ${totalDays})`,
        },
      });
    }

    // upload attachment (base64 data URL) to Cloudinary if provided
    let attachmentUrl: string | null = null;
    if (attachment && typeof attachment === "string") {
      const dataUri = attachment.includes(",")
        ? attachment
        : `data:image/jpeg;base64,${attachment}`;
      const uploadResult = await cloudinary.uploader.upload(dataUri, {
        folder: "sams/leave-attachments",
        resource_type: "auto",
      });
      attachmentUrl = uploadResult.secure_url;
    }

    const result = await pool.query(
      `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, total_days, reason, attachment_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') RETURNING *`,
      [
        req.user.companyId,
        employeeId,
        leave_type_id,
        start_date,
        end_date,
        totalDays,
        reason,
        attachmentUrl,
      ],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[createLeaveRequest] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function myLeaveRequests(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT lr.*, lt.name as leave_type_name FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       WHERE lr.employee_id = $1 ORDER BY lr.created_at DESC`,
      [req.user.sub],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[myLeaveRequests] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function teamLeaveRequests(req: Request, res: Response) {
  try {
    const supervisorId = req.user.sub;

    const result = await pool.query(
      `SELECT lr.*, lt.name as leave_type_name, e.name as employee_name
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       JOIN employees e ON lr.employee_id = e.id
       WHERE e.supervisor_id = $1
       ORDER BY lr.created_at DESC`,
      [supervisorId],
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[teamLeaveRequests] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function adminLeaveRequests(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT lr.*, lt.name as leave_type_name, e.name as employee_name, d.name as department_name
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       JOIN employees e ON lr.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE lr.company_id = $1
       ORDER BY lr.created_at DESC`,
      [req.user.companyId],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[adminLeaveRequests] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

  export async function approveLeaveRequest(req: Request, res: Response) {
  const { id } = req.params;
  const { approval_note } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Get leave request, make sure it's still pending
    const leaveResult = await client.query(
      `SELECT * FROM leave_requests WHERE id = $1 AND company_id = $2 AND status = 'pending' FOR UPDATE`,
      [id, req.user.companyId],
    );
    if (leaveResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Request not found or already processed",
        },
      });
    }
    const leave = leaveResult.rows[0];

    // 2. Update status to approved
    await client.query(
      `UPDATE leave_requests SET status = 'approved', approved_by = $1, approved_at = now(), approval_note = $2 WHERE id = $3`,
      [req.user.sub, approval_note, id],
    );

    // 3. Insert into ledger — used quota (negative amount)
    await client.query(
      `INSERT INTO leave_quota_ledger (employee_id, period, entry_type, amount, reference_id, created_by)
       VALUES ($1, date_trunc('month', $2::date), 'use', $3, $4, $5)`,
      [
        leave.employee_id,
        leave.start_date,
        -leave.total_days,
        leave.id,
        req.user.sub,
      ],
    );

    await client.query("COMMIT");

    await createNotification(
      leave.employee_id,
      "leave_approved",
      `Your leave request (${leave.start_date} - ${leave.end_date}) has been approved`,
      "leave_request",
      leave.id,
    );
    res.json({
      success: true,
      data: { message: "Request approved, quota has been updated" },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[approveLeaveRequest] Error:", err);
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

export async function rejectLeaveRequest(req: Request, res: Response) {
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
      `UPDATE leave_requests SET status = 'rejected', approved_by = $1, approved_at = now(), approval_note = $2
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
      "leave_rejected",
      `Your leave request was rejected: ${approval_note}`,
      "leave_request",
      result.rows[0].id,
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[rejectLeaveRequest] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function getLeaveQuota(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as balance FROM leave_quota_ledger WHERE employee_id = $1`,
      [req.params.employeeId],
    );
    res.json({
      success: true,
      data: { balance: Number(result.rows[0].balance) },
    });
  } catch (err) {
    console.error("[getLeaveQuota] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function adjustLeaveQuota(req: Request, res: Response) {
  try {
    const { amount, reason } = req.body;
    const { employeeId } = req.params;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: {
          code: "REASON_REQUIRED",
          message: "Adjustment reason is required",
        },
      });
    }

    const result = await pool.query(
      `INSERT INTO leave_quota_ledger (employee_id, period, entry_type, amount, reason, created_by)
       VALUES ($1, date_trunc('month', CURRENT_DATE), 'adjustment', $2, $3, $4) RETURNING *`,
      [employeeId, amount, reason, req.user.sub],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[adjustLeaveQuota] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}
