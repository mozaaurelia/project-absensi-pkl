import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { pool } from "../../config/database";

export async function listEmployees(req: Request, res: Response) {
  try {
    const { department_id, status, search } = req.query;

    let sql = `SELECT e.id, e.name, e.email, e.status, r.name as role_name, e.department_id, e.position_id
               FROM employees e JOIN roles r ON e.role_id = r.id
               WHERE e.company_id = $1`;
    const params: any[] = [req.user.companyId];

    if (department_id) {
      params.push(department_id);
      sql += ` AND e.department_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND e.status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND e.name ILIKE $${params.length}`;
    }

    const result = await pool.query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[listEmployees] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function createEmployee(req: Request, res: Response) {
  try {
    const {
      name,
      email,
      password,
      role_id,
      department_id,
      position_id,
      supervisor_id,
      join_date,
    } = req.body;

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO employees (company_id, role_id, department_id, position_id, supervisor_id, name, email, password_hash, join_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
       RETURNING id, name, email, status`,
      [
        req.user.companyId,
        role_id,
        department_id,
        position_id,
        supervisor_id,
        name,
        email,
        passwordHash,
        join_date,
      ],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[createEmployee] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function getEmployeeById(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT e.id, e.name, e.email, e.status, r.name as role_name, e.department_id, e.position_id
       FROM employees e JOIN roles r ON e.role_id = r.id
       WHERE e.id = $1 AND e.company_id = $2`,
      [req.params.id, req.user.companyId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Employee not found" },
      });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[getEmployeeById] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function updateEmployee(req: Request, res: Response) {
  try {
    const { name, department_id, position_id } = req.body;

    const result = await pool.query(
      `UPDATE employees SET name = COALESCE($1, name), department_id = COALESCE($2, department_id),
       position_id = COALESCE($3, position_id), updated_at = now()
       WHERE id = $4 AND company_id = $5
       RETURNING id, name, email, status`,
      [name, department_id, position_id, req.params.id, req.user.companyId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Employee not found" },
      });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[updateEmployee] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function deleteEmployee(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `UPDATE employees SET status = 'resigned', updated_at = now()
       WHERE id = $1 AND company_id = $2 RETURNING id`,
      [req.params.id, req.user.companyId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Employee not found" },
      });
    }
    res.json({ success: true, data: { message: "Employee deactivated" } });
  } catch (err) {
    console.error("[deleteEmployee] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function getMyProfile(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT id, name, email, department_id, position_id FROM employees WHERE id = $1`,
      [req.user.sub],
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[getMyProfile] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function updateMyProfile(req: Request, res: Response) {
  try {
    const { name } = req.body; // intentionally limited — not role/department/company
    const result = await pool.query(
      `UPDATE employees SET name = COALESCE($1, name), updated_at = now() WHERE id = $2 RETURNING id, name, email`,
      [name, req.user.sub],
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[updateMyProfile] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}
