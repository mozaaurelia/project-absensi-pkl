import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../../config/database";

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      `SELECT e.*, r.name as role_name, c.status as company_status FROM employees e
       JOIN roles r ON e.role_id = r.id
       JOIN companies c ON e.company_id = c.id
       WHERE e.email = $1`,
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Wrong email or password",
        },
      });
    }

    const employee = result.rows[0];

    if (employee.company_status !== "active") {
      return res.status(403).json({
        success: false,
        error: {
          code: "COMPANY_INACTIVE",
          message: "Your company is no longer active, please contact the administrator",
        },
      });
    }

    const isValid = await bcrypt.compare(password, employee.password_hash);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Wrong email or password",
        },
      });
    }

    const token = jwt.sign(
      {
        sub: employee.id,
        actorType: "employee",
        role: employee.role_name,
        companyId: employee.company_id,
        supervisorId: employee.supervisor_id,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "8h" },
    );

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: employee.id,
          name: employee.name,
          email: employee.email,
          role: employee.role_name,
        },
      },
    });
  } catch (err) {
    console.error("[login] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function me(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT e.id, e.name, e.email, r.name as role_name, e.department_id, e.position_id
       FROM employees e
       JOIN roles r ON e.role_id = r.id
       WHERE e.id = $1`,
      [req.user.sub],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "User not found" },
      });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[me] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function superadminLogin(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      `SELECT * FROM superadmins WHERE email = $1`,
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Wrong email or password",
        },
      });
    }

    const superadmin = result.rows[0];
    const isValid = await bcrypt.compare(password, superadmin.password_hash);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Wrong email or password",
        },
      });
    }

    const token = jwt.sign(
      {
        sub: superadmin.id,
        actorType: "superadmin",
        role: "superadmin",
        companyId: null,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "8h" },
    );

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: superadmin.id,
          name: superadmin.name,
          email: superadmin.email,
        },
      },
    });
  } catch (err) {
    console.error("[superadminLogin] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}
