import { Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { pool } from "../../config/database";

function isTokenError(row: {
  used_at: Date | null;
  expires_at: Date;
}): string | null {
  if (row.used_at) return "TOKEN_ALREADY_USED";
  if (new Date(row.expires_at).getTime() <= Date.now()) return "TOKEN_EXPIRED";
  return null;
}

export async function onboardingInfo(req: Request, res: Response) {
  try {
    const tokenHash = crypto
      .createHash("sha256")
      .update(String(req.params.token))
      .digest("hex");
    const result = await pool.query(
      `SELECT t.email, t.expires_at, t.used_at, c.name AS company_name, c.onboarded_at
       FROM company_onboarding_tokens t
       JOIN companies c ON c.id = t.company_id
       WHERE t.token_hash = $1`,
      [tokenHash],
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_TOKEN", message: "Undangan tidak valid" },
      });
    }

    const row = result.rows[0];
    const tokenErr = isTokenError(row);
    if (tokenErr) {
      return res.status(400).json({
        success: false,
        error: {
          code: tokenErr,
          message:
            tokenErr === "TOKEN_ALREADY_USED"
              ? "Undangan ini sudah pernah digunakan"
              : "Undangan sudah kedaluwarsa",
        },
      });
    }

    res.json({
      success: true,
      data: {
        company_name: row.company_name,
        email: row.email,
        expires_at: row.expires_at,
        already_onboarded: !!row.onboarded_at,
      },
    });
  } catch (err) {
    console.error("[onboardingInfo] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function acceptOnboarding(req: Request, res: Response) {
  try {
    const { token, name, password } = req.body;

    if (!token || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Token dan nama wajib diisi" },
      });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        success: false,
        error: { code: "PASSWORD_TOO_SHORT", message: "Password minimal 8 karakter" },
      });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const tokenResult = await pool.query(
      `SELECT * FROM company_onboarding_tokens
       WHERE token_hash = $1`,
      [tokenHash],
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_TOKEN", message: "Undangan tidak valid" },
      });
    }

    const invite = tokenResult.rows[0];
    const tokenErr = isTokenError(invite);
    if (tokenErr) {
      return res.status(400).json({
        success: false,
        error: {
          code: tokenErr,
          message:
            tokenErr === "TOKEN_ALREADY_USED"
              ? "Undangan ini sudah pernah digunakan"
              : "Undangan sudah kedaluwarsa",
        },
      });
    }

    const companyId = invite.company_id;

    const dupResult = await pool.query(
      `SELECT 1 FROM employees WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [invite.email],
    );
    if (dupResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: "EMAIL_ALREADY_USED",
          message: "Email sudah terdaftar. Silakan login atau reset password.",
        },
      });
    }

    // ensure an admin role exists for this company
    let roleResult = await pool.query(
      `SELECT id FROM roles WHERE company_id = $1 AND name = 'admin' LIMIT 1`,
      [companyId],
    );
    if (roleResult.rows.length === 0) {
      roleResult = await pool.query(
        `INSERT INTO roles (company_id, name) VALUES ($1, 'admin') RETURNING id`,
        [companyId],
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO employees (company_id, role_id, name, email, password_hash, join_date, status)
         VALUES ($1, $2, $3, $4, $5, NOW(), 'active')`,
        [companyId, roleResult.rows[0].id, name.trim(), invite.email, passwordHash],
      );
      await client.query(
        `UPDATE companies SET status = 'active', onboarded_at = now(), updated_at = now() WHERE id = $1`,
        [companyId],
      );
      await client.query(
        `UPDATE company_onboarding_tokens SET used_at = now() WHERE id = $1`,
        [invite.id],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      data: { message: "Akun admin berhasil dibuat. Silakan login." },
    });
  } catch (err) {
    console.error("[acceptOnboarding] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}
