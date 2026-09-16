import { Request, Response } from "express";
import { pool } from "../../config/database";
import {
  autoMarkAlpha,
  monthlyLeaveQuota,
  generateMonthlyRecap,
} from "../../database/cronJobs";

export async function employeeDashboard(req: Request, res: Response) {
  try {
    const employeeId = req.user.sub;

    const todayAttendance = await pool.query(
      `SELECT * FROM attendances WHERE employee_id = $1 AND clock_in_time >= CURRENT_DATE ORDER BY clock_in_time DESC LIMIT 1`,
      [employeeId],
    );

    const quotaBalance = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as balance FROM leave_quota_ledger WHERE employee_id = $1`,
      [employeeId],
    );

    const schedule = await pool.query(
      `SELECT s.name as shift_name, s.start_time, s.end_time, l.name as location_name
       FROM employee_schedules es
       JOIN shifts s ON es.shift_id = s.id
       JOIN office_locations l ON es.location_id = l.id
       WHERE es.employee_id = $1 AND (es.end_date IS NULL OR es.end_date >= CURRENT_DATE)
       ORDER BY es.start_date DESC LIMIT 1`,
      [employeeId],
    );

    res.json({
      success: true,
      data: {
        today_attendance: todayAttendance.rows[0] || null,
        leave_quota_balance: Number(quotaBalance.rows[0].balance),
        current_schedule: schedule.rows[0] || null,
      },
    });
  } catch (err) {
    console.error("[employeeDashboard] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function supervisorDashboard(req: Request, res: Response) {
  try {
    const supervisorId = req.user.sub;

    const teamToday = await pool.query(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE a.status = 'hadir')::int as present,
         COUNT(*) FILTER (WHERE a.status = 'telat')::int as late,
         COUNT(*) FILTER (WHERE a.status = 'alpha')::int as absent,
         COUNT(*) FILTER (WHERE a.clock_in_time IS NULL AND a.status IS NULL)::int as not_checked_in
       FROM employees e
       LEFT JOIN attendances a ON a.employee_id = e.id AND a.clock_in_time >= CURRENT_DATE
       WHERE e.supervisor_id = $1 AND e.status = 'active'`,
      [supervisorId],
    );

    const pendingLeaves = await pool.query(
      `SELECT COUNT(*) as count FROM leave_requests lr
       JOIN employees e ON lr.employee_id = e.id
       WHERE e.supervisor_id = $1 AND lr.status = 'pending'`,
      [supervisorId],
    );

    res.json({
      success: true,
      data: {
        team_today: teamToday.rows[0] ?? null,
        pending_leave_count: Number(pendingLeaves.rows[0].count),
      },
    });
  } catch (err) {
    console.error("[supervisorDashboard] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function adminDashboard(req: Request, res: Response) {
  try {
    const companyId = req.user.companyId;

    const totalEmployees = await pool.query(
      `SELECT COUNT(*) as count FROM employees WHERE company_id = $1 AND status = 'active'`,
      [companyId],
    );

    const todayStats = await pool.query(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE a.status = 'hadir')::int as present,
         COUNT(*) FILTER (WHERE a.status = 'telat')::int as late,
         COUNT(*) FILTER (WHERE a.status = 'alpha')::int as absent,
         COUNT(*) FILTER (WHERE a.clock_in_time IS NULL AND a.status IS NULL)::int as not_checked_in
       FROM employees e
       LEFT JOIN attendances a ON a.employee_id = e.id AND a.clock_in_time >= CURRENT_DATE
       WHERE e.company_id = $1 AND e.status = 'active'`,
      [companyId],
    );

    const pendingLeaves = await pool.query(
      `SELECT COUNT(*) as count FROM leave_requests WHERE company_id = $1 AND status = 'pending'`,
      [companyId],
    );

    const pendingOvertime = await pool.query(
      `SELECT COUNT(*) as count FROM overtime_requests WHERE company_id = $1 AND status = 'pending'`,
      [companyId],
    );

    res.json({
      success: true,
      data: {
        total_active_employees: Number(totalEmployees.rows[0].count),
        today_attendance_breakdown: todayStats.rows[0] ?? null,
        pending_leave_count: Number(pendingLeaves.rows[0].count),
        pending_overtime_count: Number(pendingOvertime.rows[0].count),
      },
    });
  } catch (err) {
    console.error("[adminDashboard] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function triggerCronManual(req: Request, res: Response) {
  try {
    const { job } = req.params;

    let processed: number;
    if (job === "auto-alpha") processed = await autoMarkAlpha();
    else if (job === "monthly-quota") processed = await monthlyLeaveQuota();
    else if (job === "monthly-recap") processed = await generateMonthlyRecap();
    else
      return res
        .status(400)
        .json({
          success: false,
          error: { code: "INVALID_JOB", message: "Unknown job" },
        });

    res.json({
      success: true,
      data: { job, processed },
    });
  } catch (err) {
    console.error("[triggerCronManual] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}
