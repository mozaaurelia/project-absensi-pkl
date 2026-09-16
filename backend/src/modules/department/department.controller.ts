import { Request, Response } from "express";
import { pool } from "../../config/database";

export async function listDepartments(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT d.*,
              (
                SELECT COUNT(*)
                FROM employees e
                WHERE e.department_id = d.id AND e.status = 'active'
              ) AS employee_count
       FROM departments d
       WHERE d.company_id = $1
       ORDER BY d.name`,
      [req.user.companyId],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[listDepartments] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function getDepartmentById(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT * FROM departments WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.user.companyId],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Department not found" },
        });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[getDepartmentById] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function createDepartment(req: Request, res: Response) {
  try {
    const { name } = req.body;
    const result = await pool.query(
      `INSERT INTO departments (company_id, name) VALUES ($1, $2) RETURNING *`,
      [req.user.companyId, name],
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[createDepartment] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function updateDepartment(req: Request, res: Response) {
  try {
    const { name, status } = req.body;
    const result = await pool.query(
      `UPDATE departments SET name = $1, status = COALESCE($2, status) WHERE id = $3 AND company_id = $4 RETURNING *`,
      [name, status ?? null, req.params.id, req.user.companyId],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Department not found" },
        });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[updateDepartment] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function deleteDepartment(req: Request, res: Response) {
  try {
    // check first if there are active employees in this department to avoid orphans
    const check = await pool.query(
      `SELECT id FROM employees WHERE department_id = $1 AND status = 'active' LIMIT 1`,
      [req.params.id],
    );
    if (check.rows.length > 0) {
      return res
        .status(400)
        .json({
          success: false,
          error: {
            code: "DEPARTMENT_IN_USE",
            message: "There are still active employees in this department",
          },
        });
    }

    // release non-active employees from this department so the FK constraint
    // does not block the delete
    await pool.query(
      `UPDATE employees SET department_id = NULL WHERE department_id = $1 AND status <> 'active'`,
      [req.params.id],
    );

    // remove department policies referencing this department
    await pool.query(
      `DELETE FROM department_policies WHERE department_id = $1`,
      [req.params.id],
    );

    const result = await pool.query(
      `DELETE FROM departments WHERE id = $1 AND company_id = $2 RETURNING id`,
      [req.params.id, req.user.companyId],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Department not found" },
        });
    }
    res.json({ success: true, data: { message: "Department deleted" } });
  } catch (err) {
    console.error("[deleteDepartment] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function getDepartmentPolicy(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT * FROM department_policies WHERE department_id = $1 ORDER BY effective_date DESC LIMIT 1`,
      [req.params.id],
    );
    res.json({ success: true, data: result.rows[0] || null });
  } catch (err) {
    console.error("[getDepartmentPolicy] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function updateDepartmentPolicy(req: Request, res: Response) {
  try {
    const {
      allow_overtime,
      allow_wfh,
      min_attendance_percentage,
      effective_date,
    } = req.body;
    // INSERT a new row instead of updating so old policy history is preserved
    const result = await pool.query(
      `INSERT INTO department_policies (department_id, allow_overtime, allow_wfh, min_attendance_percentage, effective_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        req.params.id,
        allow_overtime,
        allow_wfh,
        min_attendance_percentage,
        effective_date,
      ],
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[updateDepartmentPolicy] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}
