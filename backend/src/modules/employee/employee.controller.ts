import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { pool } from "../../config/database";
import cloudinary from "../../config/cloudinary";

const GENDERS = new Set(["male", "female"]);
const MARITAL_STATUSES = new Set(["single", "married", "divorced"]);

function normalizePersonalFields(body: Record<string, unknown>) {
  const str = (v: unknown, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

  return {
    phone: str(body.phone, 32),
    address: str(body.address, 500),
    birth_date:
      typeof body.birth_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.birth_date)
        ? body.birth_date
        : null,
    gender:
      typeof body.gender === "string" && GENDERS.has(body.gender)
        ? body.gender
        : null,
    marital_status:
      typeof body.marital_status === "string" &&
      MARITAL_STATUSES.has(body.marital_status)
        ? body.marital_status
        : null,
    nik: str(body.nik, 16),
    npwp: str(body.npwp, 20),
    tempat_lahir: str(body.tempat_lahir, 100),
    no_telp: str(body.no_telp, 20),
    emergency_contact_name: str(body.emergency_contact_name, 100),
    emergency_contact_relation: str(body.emergency_contact_relation, 50),
    emergency_contact_phone: str(body.emergency_contact_phone, 20),
    alamat_ktp: str(body.alamat_ktp, 200),
    agama: str(body.agama, 50),
    pendidikan_terakhir: str(body.pendidikan_terakhir, 50),
    no_rekening: str(body.no_rekening, 50),
    nama_bank: str(body.nama_bank, 50),
    golongan_darah: str(body.golongan_darah, 10),
  };
}

export async function listEmployees(req: Request, res: Response) {
  try {
    const { department_id, status, search } = req.query;

    let sql = `SELECT e.id, e.name, e.email, e.status, r.name as role_name, e.department_id, e.position_id,
                      e.phone, e.address, e.birth_date, e.gender, e.marital_status, e.join_date
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
    const personal = normalizePersonalFields(req.body ?? {});

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO employees (company_id, role_id, department_id, position_id, supervisor_id, name, email, password_hash, join_date, status,
                              nik, npwp, tempat_lahir, no_telp, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, alamat_ktp, agama, pendidikan_terakhir, no_rekening, nama_bank, golongan_darah, phone, address, birth_date, gender, marital_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active',
                      $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
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
        personal.nik,
        personal.npwp,
        personal.tempat_lahir,
        personal.no_telp,
        personal.emergency_contact_name,
        personal.emergency_contact_relation,
        personal.emergency_contact_phone,
        personal.alamat_ktp,
        personal.agama,
        personal.pendidikan_terakhir,
        personal.no_rekening,
        personal.nama_bank,
        personal.golongan_darah,
        personal.phone,
        personal.address,
        personal.birth_date,
        personal.gender,
        personal.marital_status,
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
      `SELECT e.id, e.name, e.email, e.status, r.name as role_name, e.department_id, e.position_id,
              e.nik, e.npwp, e.tempat_lahir, e.no_telp, e.emergency_contact_name, e.emergency_contact_relation, e.emergency_contact_phone, e.alamat_ktp, e.agama, e.pendidikan_terakhir, e.no_rekening, e.nama_bank, e.golongan_darah, e.phone, e.address, e.birth_date, e.gender, e.marital_status, e.join_date
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
    const personal = normalizePersonalFields(req.body ?? {});

    const result = await pool.query(
      `UPDATE employees SET name = COALESCE($1, name), department_id = COALESCE($2, department_id),
       position_id = COALESCE($3, position_id),
       nik = COALESCE($4, nik), npwp = COALESCE($5, npwp), tempat_lahir = COALESCE($6, tempat_lahir),
       no_telp = COALESCE($7, no_telp), emergency_contact_name = COALESCE($8, emergency_contact_name),
       emergency_contact_relation = COALESCE($9, emergency_contact_relation), emergency_contact_phone = COALESCE($10, emergency_contact_phone),
       alamat_ktp = COALESCE($11, alamat_ktp), agama = COALESCE($12, agama), pendidikan_terakhir = COALESCE($13, pendidikan_terakhir),
       no_rekening = COALESCE($14, no_rekening), nama_bank = COALESCE($15, nama_bank), golongan_darah = COALESCE($16, golongan_darah),
       phone = COALESCE($17, phone), address = COALESCE($18, address),
       birth_date = COALESCE($19, birth_date), gender = COALESCE($20, gender),
       marital_status = COALESCE($21, marital_status), updated_at = now()
       WHERE id = $22 AND company_id = $23
       RETURNING id, name, email, nik, npwp, tempat_lahir, no_telp, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, alamat_ktp, agama, pendidikan_terakhir, no_rekening, nama_bank, golongan_darah, phone, address, birth_date, gender, marital_status, status`,
      [
        name,
        department_id,
        position_id,
        personal.nik,
        personal.npwp,
        personal.tempat_lahir,
        personal.no_telp,
        personal.emergency_contact_name,
        personal.emergency_contact_relation,
        personal.emergency_contact_phone,
        personal.alamat_ktp,
        personal.agama,
        personal.pendidikan_terakhir,
        personal.no_rekening,
        personal.nama_bank,
        personal.golongan_darah,
        personal.phone,
        personal.address,
        personal.birth_date,
        personal.gender,
        personal.marital_status,
        req.params.id,
        req.user.companyId,
      ],
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
      `
      SELECT
          e.id,
          e.name,
          e.email,
            e.join_date,
            e.status,
            e.image,
          r.id AS role_id,
          r.name AS role_name,
          d.id AS department_id,
          d.name AS department_name,
          p.id AS position_id,
          p.name AS position_name,
          s.id AS supervisor_id,
          s.name AS supervisor_name,
          c.id AS company_id,
          c.name AS company_name
      FROM employees e
      LEFT JOIN roles r
          ON r.id = e.role_id
      LEFT JOIN departments d
          ON d.id = e.department_id
      LEFT JOIN positions p
          ON p.id = e.position_id
      LEFT JOIN employees s
          ON s.id = e.supervisor_id
      LEFT JOIN companies c
          ON c.id = e.company_id
      WHERE e.id = $1
      `,
      [req.user.sub],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Employee profile not found",
        },
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
    });
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
      const { name, image } = req.body; // intentionally limited -- not role/department/company
      let imageUrl: string | null = null;
      if (image && typeof image === "string") {
        const dataUri = image.includes(",")
          ? image
          : `data:image/jpeg;base64,${image}`;
        const uploadResult = await cloudinary.uploader.upload(dataUri, {
          folder: "sams/avatars",
        });
        imageUrl = uploadResult.secure_url;
      }
      const result = await pool.query(
        `UPDATE employees SET name = COALESCE($1, name), image = COALESCE($2, image), updated_at = now() WHERE id = $3 RETURNING id, name, email, image`,
        [name, imageUrl, req.user.sub],
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
