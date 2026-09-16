import { Request, Response } from "express";
import crypto from "crypto";
import { pool } from "../../config/database";
import { sendEmail } from "../../shared/helpers/sendEmail";

export async function listCompanies(req: Request, res: Response) {
  try {
    const result = await pool.query(`SELECT * FROM companies ORDER BY name`);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[listCompanies] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function getCompanyById(req: Request, res: Response) {
  try {
    const result = await pool.query(`SELECT * FROM companies WHERE id = $1`, [
      req.params.id,
    ]);
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Company not found" },
        });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[getCompanyById] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function createCompany(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const { name, pic_name, pic_email, office_location } = req.body ?? {};

    const loc =
      office_location && typeof office_location === "object"
        ? office_location
        : null;
    const lat = loc ? Number(loc.latitude) : NaN;
    const lng = loc ? Number(loc.longitude) : NaN;
    if (!loc || isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Office location is required: provide latitude and longitude",
        },
      });
    }

    await client.query("BEGIN");

    const companyResult = await client.query(
      `INSERT INTO companies (name, status, pic_name, pic_email) VALUES ($1, 'active', $2, $3) RETURNING *`,
      [name, pic_name ?? null, pic_email ?? null],
    );

    const company = companyResult.rows[0];

    const radius = Number(loc.radius_meters);
    const locName =
      typeof loc.name === "string" && loc.name.trim()
        ? loc.name.trim()
        : "Kantor Pusat";
    await client.query(
      `INSERT INTO office_locations (company_id, name, latitude, longitude, radius_meters)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        company.id,
        locName,
        lat,
        lng,
        !isNaN(radius) && radius > 0 ? radius : 150,
      ],
    );

    await client.query("COMMIT");
    res.status(201).json({ success: true, data: company });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[createCompany] Error:", err);
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

export async function updateCompany(req: Request, res: Response) {
  try {
    const { name, pic_name, pic_email } = req.body;
    const result = await pool.query(
      `UPDATE companies
       SET name = COALESCE($1, name),
           pic_name = COALESCE($2, pic_name),
           pic_email = COALESCE($3, pic_email),
           updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [name, pic_name ?? null, pic_email ?? null, req.params.id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Company not found" },
        });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[updateCompany] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function updateCompanyStatus(req: Request, res: Response) {
  try {
    const { status } = req.body; // 'active' | 'inactive'
    const result = await pool.query(
      `UPDATE companies SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [status, req.params.id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "NOT_FOUND", message: "Company not found" },
        });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[updateCompanyStatus] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function deleteCompany(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const companyRes = await client.query<{ id: string }>(
      `SELECT id FROM companies WHERE id = $1`,
      [req.params.id],
    );
    if (companyRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Company not found" },
      });
    }
    const companyId = companyRes.rows[0].id;

    const empRes = await client.query<{ id: string }>(
      `SELECT id FROM employees WHERE company_id = $1`,
      [companyId],
    );
    const empIds = empRes.rows.map((r) => r.id);

    if (empIds.length > 0) {
      await client.query(`DELETE FROM attendances WHERE company_id = $1`, [companyId]);
      await client.query(`DELETE FROM overtime_requests WHERE company_id = $1`, [companyId]);
      await client.query(`DELETE FROM personal_agendas WHERE company_id = $1`, [companyId]);
      await client.query(`DELETE FROM calendar_events WHERE company_id = $1`, [companyId]);
      await client.query(`DELETE FROM holidays WHERE company_id = $1`, [companyId]);
      await client.query(
        `DELETE FROM leave_quota_ledger WHERE reference_id IN (SELECT id FROM leave_requests WHERE company_id = $1)`,
        [companyId],
      );
      await client.query(`DELETE FROM leave_requests WHERE company_id = $1`, [companyId]);
      await client.query(`DELETE FROM reimbursements WHERE company_id = $1`, [companyId]);
      await client.query(`DELETE FROM announcements WHERE company_id = $1`, [companyId]);
      await client.query(
        `DELETE FROM leave_quota_ledger WHERE employee_id = ANY($1::uuid[])`,
        [empIds],
      );
      await client.query(
        `DELETE FROM notifications WHERE employee_id = ANY($1::uuid[])`,
        [empIds],
      );
      await client.query(
        `DELETE FROM employee_face_references WHERE employee_id = ANY($1::uuid[])`,
        [empIds],
      );
      await client.query(
        `DELETE FROM password_reset_tokens WHERE account_id = ANY($1::uuid[])`,
        [empIds],
      );
      await client.query(
        `DELETE FROM employee_schedules WHERE employee_id = ANY($1::uuid[])`,
        [empIds],
      );
      await client.query(
        `DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[])`,
        [empIds],
      );
      await client.query(
        `DELETE FROM department_policies WHERE department_id IN (SELECT id FROM departments WHERE company_id = $1)`,
        [companyId],
      );
      await client.query(
        `UPDATE employees SET supervisor_id = NULL WHERE company_id = $1`,
        [companyId],
      );
      await client.query(`DELETE FROM employees WHERE company_id = $1`, [companyId]);
    } else {
      await client.query(
        `DELETE FROM department_policies WHERE department_id IN (SELECT id FROM departments WHERE company_id = $1)`,
        [companyId],
      );
    }

    await client.query(`DELETE FROM leave_types WHERE company_id = $1`, [companyId]);
    await client.query(`DELETE FROM shifts WHERE company_id = $1`, [companyId]);
    await client.query(`DELETE FROM working_day_patterns WHERE company_id = $1`, [companyId]);
    await client.query(`DELETE FROM office_locations WHERE company_id = $1`, [companyId]);
    await client.query(`DELETE FROM positions WHERE company_id = $1`, [companyId]);
    await client.query(`DELETE FROM departments WHERE company_id = $1`, [companyId]);
    await client.query(
      `UPDATE employees
       SET role_id = NULL
       WHERE role_id IN (SELECT id FROM roles WHERE company_id = $1)`,
      [companyId],
    );
    await client.query(`DELETE FROM roles WHERE company_id = $1`, [companyId]);
    await client.query(`DELETE FROM companies WHERE id = $1`, [companyId]);

    await client.query("COMMIT");
    res.json({
      success: true,
      data: { message: "Company and all related data deleted" },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[deleteCompany] Error:", err);
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

export async function inviteCompanyAdmin(req: Request, res: Response) {
  try {
    const companyResult = await pool.query(
      `SELECT id, name, status FROM companies WHERE id = $1`,
      [req.params.id],
    );
    if (companyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Company not found" },
      });
    }

    const email = (req.body?.email ?? "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "A valid PIC email is required" },
      });
    }

    const existingAdmin = await pool.query(
      `SELECT 1 FROM employees e
       JOIN roles r ON e.role_id = r.id
       WHERE e.company_id = $1 AND LOWER(e.email) = $2 AND r.name = 'admin'`,
      [req.params.id, email],
    );
    if (existingAdmin.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: "ADMIN_ALREADY_EXISTS",
          message: "An admin account with this email already exists for this company",
        },
      });
    }

    // persist PIC contact on the company
    await pool.query(
      `UPDATE companies SET pic_email = $1, updated_at = now() WHERE id = $2`,
      [email, req.params.id],
    );

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 jam

    await pool.query(
      `UPDATE company_onboarding_tokens SET used_at = now()
       WHERE company_id = $1 AND used_at IS NULL`,
      [req.params.id],
    );
    await pool.query(
      `INSERT INTO company_onboarding_tokens (company_id, email, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, email, tokenHash, expiresAt],
    );

    const inviteUrl = `${
      process.env.FRONTEND_ONBOARDING_URL || "http://localhost:3000/onboarding"
    }?token=${rawToken}`;

    const mailResult = await sendEmail(
      email,
      "Undangan Setup Akun Admin SAMS",
      `<p>Halo,</p>
       <p>Anda ditunjuk sebagai admin perusahaan <strong>${companyResult.rows[0].name}</strong> di SAMS.</p>
       <p>Klik link di bawah untuk membuat akun Anda (berlaku 24 jam):</p>
       <p><a href="${inviteUrl}">Setup Akun Admin</a></p>
       <p>Jika Anda tidak merasa diundang, abaikan email ini.</p>`,
    );

    res.json({
      success: true,
      data: {
        message: `Undangan dikirim ke ${email}`,
        expiresAt,
        emailSent: !!mailResult?.success,
        devLink: mailResult?.success ? undefined : inviteUrl,
      },
    });
  } catch (err) {
    console.error("[inviteCompanyAdmin] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}
