import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { pool } from "../../config/database";
import { sendEmail } from "../../shared/helpers/sendEmail";

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

    if (employee.status !== "active") {
      return res.status(403).json({
        success: false,
        error: {
          code: "ACCOUNT_INACTIVE",
          message:
            "Akun Anda sudah tidak aktif (resign/dinonaktifkan). Hubungi administrator.",
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
            image: employee.image,
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
      `SELECT e.id as employee_id, e.name, e.email, e.image, r.name as role_name,
              e.department_id, d.name as department,
              e.position_id, p.name as position
       FROM employees e
       JOIN roles r ON e.role_id = r.id
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN positions p ON e.position_id = p.id
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

export async function forgotPassword(req: Request, res: Response) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: { code: "EMAIL_REQUIRED", message: "Email is required" },
      });
    }

    // Lookup account across employees and superadmins. The response is identical
    // regardless of where the email is found to avoid leaking which table matched.
    const accountResult = await pool.query(
      `SELECT id, name, email, 'employee' AS account_type FROM employees WHERE LOWER(email) = LOWER($1)
       UNION ALL
       SELECT id, name, email, 'superadmin' AS account_type FROM superadmins WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email],
    );

    if (accountResult.rows.length > 0) {
      const account = accountResult.rows[0];
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 menit (Gmail SMTP delay bisa 1-2 menit)

      await pool.query(
        `UPDATE password_reset_tokens SET used_at = now()
         WHERE account_id = $1 AND account_type = $2 AND used_at IS NULL`,
        [account.id, account.account_type],
      );

      await pool.query(
        `INSERT INTO password_reset_tokens (account_id, account_type, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [account.id, account.account_type, tokenHash, expiresAt],
      );

      const resetUrl = `${
        process.env.FRONTEND_RESET_PASSWORD_URL ||
        "http://localhost:3000/auth/reset-password"
      }?token=${rawToken}`;

      await sendEmail(
        account.email,
        "Reset Password SAMS",
        `<p>Halo ${account.name},</p>
         <p>Kamu meminta reset password. Klik link di bawah untuk mengatur ulang kata sandi (berlaku 15 menit):</p>
         <p><a href="${resetUrl}">Reset Password</a></p>
         <p>Jika kamu tidak meminta reset password, abaikan email ini.</p>`,
      );
    }

    res.json({
      success: true,
      data: {
        message:
          "Jika email terdaftar, link reset password sudah dikirim.",
      },
    });
  } catch (err) {
    console.error("[forgotPassword] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function resetPassword(req: Request, res: Response) {
  try {
    const { token, password, newPassword } = req.body;

    const newPass = newPassword ?? password;
    if (!token || typeof newPass !== "string" || !newPass) {
      return res.status(400).json({
        success: false,
        error: {
          code: "TOKEN_AND_PASSWORD_REQUIRED",
          message: "Token and new password are required",
        },
      });
    }

    if (typeof newPass !== "string" || newPass.length < 8) {
      return res.status(400).json({
        success: false,
        error: {
          code: "PASSWORD_TOO_SHORT",
          message: "Password must be at least 8 characters long",
        },
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const tokenResult = await pool.query(
      `SELECT * FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [tokenHash],
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_OR_EXPIRED_TOKEN",
          message: "Reset link invalid or expired",
        },
      });
    }

    const resetToken = tokenResult.rows[0];
    const passwordHash = await bcrypt.hash(newPass, 10);

    if (resetToken.account_type === "superadmin") {
      await pool.query(
        `UPDATE superadmins SET password_hash = $1 WHERE id = $2`,
        [passwordHash, resetToken.account_id],
      );
    } else {
      await pool.query(
        `UPDATE employees SET password_hash = $1, updated_at = now() WHERE id = $2`,
        [passwordHash, resetToken.account_id],
      );
    }

    await pool.query(
      `UPDATE password_reset_tokens SET used_at = now()
       WHERE account_id = $1 AND account_type = $2 AND used_at IS NULL`,
      [resetToken.account_id, resetToken.account_type],
    );

    res.json({
      success: true,
      data: { message: "Password berhasil diubah. Silakan login." },
    });
  } catch (err) {
    console.error("[resetPassword] Error:", err);
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

export async function changePassword(req: Request, res: Response) {
  try {
    const { oldPassword, newPassword } = req.body;

    if (typeof oldPassword !== "string" || !oldPassword) {
      return res.status(400).json({
        success: false,
        error: {
          code: "OLD_PASSWORD_REQUIRED",
          message: "Password lama wajib diisi",
        },
      });
    }

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: {
          code: "PASSWORD_TOO_SHORT",
          message: "Password baru minimal 8 karakter",
        },
      });
    }

    if (req.user.actorType !== "employee") {
      return res.status(403).json({
        success: false,
        error: {
          code: "NOT_SUPPORTED",
          message: "Ganti password hanya tersedia untuk karyawan",
        },
      });
    }

    const result = await pool.query(
      `SELECT password_hash FROM employees WHERE id = $1`,
      [req.user.sub],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Karyawan tidak ditemukan",
        },
      });
    }

    const isValid = await bcrypt.compare(oldPassword, result.rows[0].password_hash);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: "WRONG_OLD_PASSWORD",
          message: "Password lama salah",
        },
      });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE employees SET password_hash = $1, updated_at = now() WHERE id = $2`,
      [newHash, req.user.sub],
    );

    res.json({ success: true, data: { message: "Password berhasil diubah" } });
  } catch (err) {
    console.error("[changePassword] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}
