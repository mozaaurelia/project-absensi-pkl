import { Request, Response } from "express";
import { pool } from "../../config/database";

export async function myPersonalAgendas(req: Request, res: Response) {
  try {
    const upcoming = req.query.upcoming === "true";
    let sql = `SELECT * FROM personal_agendas WHERE employee_id = $1`;
    if (upcoming) {
      sql += ` AND agenda_date >= CURRENT_DATE ORDER BY agenda_date ASC, start_time ASC NULLS LAST LIMIT 10`;
    } else {
      sql += ` ORDER BY agenda_date ASC, start_time ASC NULLS LAST`;
    }
    const result = await pool.query(sql, [req.user.sub]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[myPersonalAgendas] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function createPersonalAgenda(req: Request, res: Response) {
  try {
    const { agenda_date, title, description, start_time, end_time } = req.body;

    if (!agenda_date || !title) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "agenda_date and title are required",
        },
      });
    }

    const result = await pool.query(
      `INSERT INTO personal_agendas
         (company_id, employee_id, agenda_date, title, description, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.user.companyId,
        req.user.sub,
        agenda_date,
        title,
        description ?? null,
        start_time ?? null,
        end_time ?? null,
      ],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[createPersonalAgenda] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function updatePersonalAgenda(req: Request, res: Response) {
  try {
    const { title, description, start_time, end_time, agenda_date } = req.body;
    const result = await pool.query(
      `UPDATE personal_agendas
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           start_time = COALESCE($3, start_time),
           end_time = COALESCE($4, end_time),
           agenda_date = COALESCE($5, agenda_date),
           updated_at = now()
       WHERE id = $6 AND employee_id = $7
       RETURNING *`,
      [
        title,
        description,
        start_time,
        end_time,
        agenda_date,
        req.params.id,
        req.user.sub,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Agenda not found" },
      });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[updatePersonalAgenda] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function deletePersonalAgenda(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `DELETE FROM personal_agendas WHERE id = $1 AND employee_id = $2 RETURNING id`,
      [req.params.id, req.user.sub],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Agenda not found" },
      });
    }

    res.json({ success: true, data: { message: "Agenda deleted" } });
  } catch (err) {
    console.error("[deletePersonalAgenda] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}