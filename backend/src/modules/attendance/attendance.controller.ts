import { Request, Response } from "express";
import { pool } from "../../config/database";
import { getDistanceMeters } from "../../shared/helpers/geoDistance";
import { emitToEmployee } from "../../socket";
import {
  verifyEmployeeFace,
  FaceReferenceNotFoundError,
  GeminiParseError,
} from "../../shared/helpers/verifyEmployeeFace";

async function getCompanyAdminIds(companyId: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT e.id FROM employees e
     JOIN roles r ON e.role_id = r.id
     WHERE e.company_id = $1 AND e.status = 'active' AND LOWER(r.name) = 'admin'`,
    [companyId],
  );
  return result.rows.map((r) => r.id);
}

async function getEmployeeName(employeeId: string): Promise<string> {
  const result = await pool.query(
    `SELECT name FROM employees WHERE id = $1`,
    [employeeId],
  );
  return result.rows[0]?.name ?? "Karyawan";
}

async function notifyLateClockIn(
  companyId: string,
  employeeId: string,
  lateMinutes: number,
): Promise<void> {
  const name = await getEmployeeName(employeeId);
  const empRes = await pool.query(
    `SELECT supervisor_id FROM employees WHERE id = $1`,
    [employeeId],
  );
  const supervisorId = empRes.rows[0]?.supervisor_id;

  const targets = new Set<string>([...await getCompanyAdminIds(companyId)]);
  if (supervisorId) targets.add(supervisorId);

  const message = `${name} absen telat ${lateMinutes} menit`;
  for (const targetId of targets) {
    const result = await pool.query(
      `INSERT INTO notifications (employee_id, type, message, reference_type, is_read)
       VALUES ($1, 'late_clock_in', $2, 'attendance', false)
       RETURNING id, employee_id, type, message, is_read, reference_type, created_at`,
      [targetId, message],
    );
    emitToEmployee(targetId, "notification:new", result.rows[0]);
  }
}

export async function assignedLocations(req: Request, res: Response) {
  try {
    const employeeId = req.user.sub;
    const result = await pool.query(
      `SELECT DISTINCT l.id, l.name, l.latitude, l.longitude, l.radius_meters
       FROM employee_schedules es
       JOIN office_locations l ON es.location_id = l.id
       WHERE es.employee_id = $1 AND (es.end_date IS NULL OR es.end_date >= CURRENT_DATE)`,
      [employeeId],
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("[attendance] assignedLocations error:", error);
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Something went wrong." },
    });
  }
}

export async function clockIn(req: Request, res: Response) {
  try {
    const { lat, lng, face_image: capturedImage } = req.body;
    const employeeId = req.user.sub;
    const companyId = req.user.companyId;

    if (!capturedImage) {
      return res.status(400).json({
        success: false,
        error: {
          code: "FACE_IMAGE_REQUIRED",
          message: "face_image is required",
        },
      });
    }

    const existingResult = await pool.query(
      `SELECT 1 FROM attendances
       WHERE employee_id = $1
         AND company_id = $2
         AND status <> 'alpha'
         AND clock_in_time >= CURRENT_DATE
         AND clock_in_time < CURRENT_DATE + INTERVAL '1 day'
       LIMIT 1`,
      [employeeId, companyId],
    );

    if (existingResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: { code: "ALREADY_CLOCKED_IN", message: "Already clocked in today" },
      });
    }

    const scheduleResult = await pool.query(
      `SELECT es.id as schedule_id, es.location_id, s.start_time, s.end_time, s.tolerance_minutes, s.checkin_window_minutes,
              l.latitude, l.longitude, l.radius_meters
       FROM employee_schedules es
       JOIN shifts s ON es.shift_id = s.id
       JOIN office_locations l ON es.location_id = l.id
       WHERE es.employee_id = $1 AND (es.end_date IS NULL OR es.end_date >= CURRENT_DATE)
       ORDER BY es.start_date DESC`,
      [employeeId],
    );

    if (scheduleResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "NO_SCHEDULE", message: "No active work schedule" },
      });
    }
    const schedules = scheduleResult.rows;

    let best: any = null;
    for (const s of schedules) {
      const d = getDistanceMeters(lat, lng, s.latitude, s.longitude);
      if (d <= s.radius_meters && (!best || d < best.distance)) {
        best = { ...s, distance: d };
      }
    }

    if (!best) {
      const assignedLocationIds = new Set(schedules.map((s) => s.location_id));
      const companyLocations = await pool.query(
        `SELECT id, latitude, longitude, radius_meters FROM office_locations WHERE company_id = $1`,
        [companyId],
      );
      let nearUnassignedLocation = false;
      for (const l of companyLocations.rows) {
        const d = getDistanceMeters(lat, lng, l.latitude, l.longitude);
        if (d <= l.radius_meters && !assignedLocationIds.has(l.id)) {
          nearUnassignedLocation = true;
          break;
        }
      }
      if (nearUnassignedLocation) {
        return res.status(400).json({
          success: false,
          error: {
            code: "LOCATION_NOT_ASSIGNED",
            message: "Location does not match your placement",
          },
        });
      }
      return res.status(400).json({
        success: false,
        error: {
          code: "OUTSIDE_RADIUS",
          message: `You are outside the office radius (distance: ${Math.round(
            Math.min(...schedules.map((s) => getDistanceMeters(lat, lng, s.latitude, s.longitude))),
          )}m)`,
        },
      });
    }
    const schedule = best;

    const now = new Date();
    const [schedHour, schedMin] = schedule.start_time.split(":").map(Number);
    const scheduledTime = new Date(now);
    scheduledTime.setHours(schedHour, schedMin, 0, 0);

    // A1 — sebelum jendela dibuka
    if (now.getTime() < scheduledTime.getTime()) {
      return res.status(400).json({
        success: false,
        error: { code: "TOO_EARLY", message: "Belum waktunya absen" },
      });
    }

    // A4/A5 — setelah jendela tutup (start_time + checkin_window_minutes)
    if (schedule.checkin_window_minutes != null) {
      const windowCloseMs =
        scheduledTime.getTime() + schedule.checkin_window_minutes * 60 * 1000;
      if (now.getTime() >= windowCloseMs) {
        return res.status(400).json({
          success: false,
          error: { code: "WINDOW_CLOSED", message: "Jendela absen sudah tutup" },
        });
      }
    }

    const toleranceMs = schedule.tolerance_minutes * 60 * 1000;
    const isLate = now.getTime() > scheduledTime.getTime() + toleranceMs;
    const status = isLate ? "telat" : "hadir";
    const lateMinutes = isLate
      ? Math.max(
          0,
          Math.floor((now.getTime() - (scheduledTime.getTime() + toleranceMs)) / 60000),
        )
      : 0;

    let faceMatchStatus: string;
    try {
      const faceResult = await verifyEmployeeFace(employeeId, capturedImage);
      if (!faceResult.match) {
        return res.status(400).json({
          success: false,
          error: {
            code: "FACE_MISMATCH",
            message: "Face verification failed. Please try again.",
            detail: {
              confidence: faceResult.confidence,
              reason: faceResult.reason,
            },
          },
        });
      }
      faceMatchStatus = "passed";
    } catch (error) {
      if (error instanceof FaceReferenceNotFoundError) {
        return res.status(404).json({
          success: false,
          error: { code: "FACE_REFERENCE_NOT_FOUND", message: error.message },
        });
      }
      if (error instanceof GeminiParseError) {
        return res.status(502).json({
          success: false,
          error: {
            code: "FACE_VERIFICATION_PARSE_ERROR",
            message: error.message,
          },
        });
      }
      throw error;
    }

    const result = await pool.query(
      `INSERT INTO attendances (company_id, employee_id, schedule_id, clock_in_time, clock_in_lat, clock_in_lng, clock_in_distance_m, face_match_status, status, late_minutes)
       VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        companyId,
        employeeId,
        schedule.schedule_id,
        lat,
        lng,
        Math.round(schedule.distance),
        faceMatchStatus,
        status,
        lateMinutes,
      ],
    );

    res.status(201).json({ success: true, data: result.rows[0] });

    if (status === "telat") {
      try {
        await notifyLateClockIn(companyId!, employeeId, lateMinutes);
      } catch (notifErr) {
        console.error("[clockIn] late notification error:", notifErr);
      }
    }
  } catch (err) {
    console.error("[clockIn] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function clockOut(req: Request, res: Response) {
  try {
    const { lat, lng, face_image: capturedImage, reason } = req.body;
    const employeeId = req.user.sub;
    const companyId = req.user.companyId;

    if (!capturedImage) {
      return res.status(400).json({
        success: false,
        error: {
          code: "FACE_IMAGE_REQUIRED",
          message: "face_image is required",
        },
      });
    }

    const todayResult = await pool.query(
      `SELECT a.*, s.end_time, l.latitude, l.longitude, l.radius_meters
       FROM attendances a
       JOIN employee_schedules es ON a.schedule_id = es.id
       JOIN shifts s ON es.shift_id = s.id
       JOIN office_locations l ON es.location_id = l.id
       WHERE a.employee_id = $1
         AND a.company_id = $2
         AND a.clock_out_time IS NULL
         AND a.clock_in_time >= CURRENT_DATE
         AND a.clock_in_time < CURRENT_DATE + INTERVAL '1 day'
       ORDER BY a.clock_in_time DESC
       LIMIT 1`,
      [employeeId, companyId],
    );

    if (todayResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "NO_CLOCK_IN", message: "No active clock-in today" },
      });
    }
    const attendance = todayResult.rows[0];

    const distance = getDistanceMeters(
      lat,
      lng,
      attendance.latitude,
      attendance.longitude,
    );

    const EMERGENCY_CLOCK_OUT_MAX_METERS = 20_000;
    const isOutside = distance > attendance.radius_meters;
    let clockOutKind: "in_range" | "emergency" = "in_range";
    let clockOutNote: string | null = null;

    if (isOutside) {
      if (distance > EMERGENCY_CLOCK_OUT_MAX_METERS) {
        return res.status(400).json({
          success: false,
          error: {
            code: "OUTSIDE_RADIUS",
            message: `You are outside the emergency clock-out limit (distance: ${Math.round(distance)}m, max ${EMERGENCY_CLOCK_OUT_MAX_METERS}m)`,
          },
        });
      }
      const note =
        typeof reason === "string" ? reason.trim().slice(0, 500) : "";
      if (!note) {
        return res.status(400).json({
          success: false,
          error: {
            code: "REASON_REQUIRED",
            message:
              "Please provide a reason for clocking out outside the office area.",
          },
        });
      }
      clockOutKind = "emergency";
      clockOutNote = note;
    }

    let faceResult;
    try {
      faceResult = await verifyEmployeeFace(employeeId, capturedImage);
    } catch (error) {
      if (error instanceof FaceReferenceNotFoundError) {
        return res.status(404).json({
          success: false,
          error: { code: "FACE_REFERENCE_NOT_FOUND", message: error.message },
        });
      }
      if (error instanceof GeminiParseError) {
        return res.status(502).json({
          success: false,
          error: {
            code: "FACE_VERIFICATION_PARSE_ERROR",
            message: error.message,
          },
        });
      }
      throw error;
    }

    if (!faceResult.match) {
      return res.status(400).json({
        success: false,
        error: {
          code: "FACE_MISMATCH",
          message: "Face verification failed. Please try again.",
          detail: {
            confidence: faceResult.confidence,
            reason: faceResult.reason,
          },
        },
      });
    }

    const now = new Date();
    const [endHour, endMin] = (attendance.end_time ?? "17:00:00").split(":").map(Number);
    const endTime = new Date(now);
    endTime.setHours(endHour, endMin, 0, 0);
    const earlyClockOut = now.getTime() < endTime.getTime();

    const result = await pool.query(
      `UPDATE attendances
       SET clock_out_time = now(), clock_out_lat = $1, clock_out_lng = $2, clock_out_distance_m = $3, face_match_status = $4, early_clock_out = $5, clock_out_kind = $6, clock_out_note = $7
       WHERE id = $8 AND company_id = $9 RETURNING *`,
      [lat, lng, distance, "passed", earlyClockOut, clockOutKind, clockOutNote, attendance.id, companyId],
    );

    if (clockOutKind === "emergency") {
      const empRes = await pool.query(
        `SELECT name, supervisor_id FROM employees WHERE id = $1`,
        [employeeId],
      );
      const empName = empRes.rows[0]?.name ?? "Karyawan";
      const targets = new Set<string>([...await getCompanyAdminIds(companyId ?? "")]);
      if (empRes.rows[0]?.supervisor_id) {
        targets.add(empRes.rows[0].supervisor_id);
      }
      const message = `${empName} clock out darurat dari luar area (${Math.round(distance)}m dari kantor): ${clockOutNote ?? "-"}`;
      for (const targetId of targets) {
        const nResult = await pool.query(
          `INSERT INTO notifications (employee_id, type, message, reference_type, is_read)
           VALUES ($1, 'early_clock_out', $2, 'attendance', false)
           RETURNING id, employee_id, type, message, is_read, reference_type, created_at`,
          [targetId, message],
        );
        emitToEmployee(targetId, "notification:new", nResult.rows[0]);
      }
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[clockOut] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function myAttendance(req: Request, res: Response) {
    try {
      const result = await pool.query(
        `SELECT a.*,
                (a.clock_in_time::date)::text AS date,
                COALESCE(l.name, '') AS location_name
         FROM attendances a
         LEFT JOIN employee_schedules es ON a.schedule_id = es.id
         LEFT JOIN office_locations l ON es.location_id = l.id
         WHERE a.employee_id = $1
         ORDER BY a.clock_in_time DESC LIMIT 30`,
        [req.user.sub],
      );
      res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error("[myAttendance] Error:", err);
      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong. Please try again later.",
        },
      });
    }
  }

export async function teamAttendance(req: Request, res: Response) {
  try {
    const supervisorId = req.user.sub;

    const result = await pool.query(
      `SELECT a.*, e.name as employee_name
       FROM attendances a
       JOIN employees e ON a.employee_id = e.id
       WHERE e.supervisor_id = $1 AND a.clock_in_time >= CURRENT_DATE
       ORDER BY a.clock_in_time DESC`,
      [supervisorId],
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[teamAttendance] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function allAttendance(req: Request, res: Response) {
  try {
    const { department_id, status, start_date, end_date } = req.query;

    let sql = `
      SELECT a.*, e.name as employee_name, e.department_id, d.name as department_name
      FROM attendances a
      JOIN employees e ON a.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE a.company_id = $1
    `;
    const params: any[] = [req.user.companyId];

    if (department_id) {
      params.push(department_id);
      sql += ` AND e.department_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND a.status = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      sql += ` AND a.clock_in_time::date >= $${params.length}::date`;
    }
    if (end_date) {
      params.push(end_date);
      sql += ` AND a.clock_in_time::date <= $${params.length}::date`;
    }

    sql += ` ORDER BY a.clock_in_time DESC`;

    const result = await pool.query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[allAttendance] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function adminAttendanceReport(req: Request, res: Response) {
  try {
    const { date, department_id, status } = req.query;
    const hasDate = !!date && String(date).length === 10;

    const params: any[] = [req.user.companyId];
    if (hasDate) params.push(String(date));
    const dateExpr = hasDate ? `$${params.length}::date` : "CURRENT_DATE";

    let sql = `
      SELECT e.id as employee_id, e.name as employee_name,
             d.name as department_name,
             ${dateExpr} AS date,
             CASE
               WHEN a.id IS NULL THEN 'absent'
               WHEN a.status = 'telat' THEN 'late'
               ELSE 'present'
             END AS status,
             to_char(a.clock_in_time, 'HH24:MI') AS check_in,
             to_char(a.clock_out_time, 'HH24:MI') AS check_out,
             a.status AS raw_status
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN attendances a ON a.employee_id = e.id AND a.company_id = $1
        AND a.clock_in_time::date = ${dateExpr}
      WHERE e.company_id = $1 AND e.status = 'active'
    `;

    if (department_id) {
      params.push(department_id);
      sql += ` AND e.department_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND (a.id IS NULL OR a.status = $${params.length})`;
    }

    sql += ` ORDER BY e.name ASC`;

    const result = await pool.query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[adminAttendanceReport] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}
