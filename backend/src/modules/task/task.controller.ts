import { Request, Response } from "express";
import { pool } from "../../config/database";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function myTasks(req: Request, res: Response) {
  try {
    const date = req.query.date;
    let sql = `SELECT * FROM tasks WHERE employee_id = $1`;
    const params: unknown[] = [req.user.sub];
    if (typeof date === "string" && DATE_RE.test(date)) {
      sql += ` AND task_date = $2`;
      params.push(date);
    }
    sql += ` ORDER BY created_at ASC`;
    const result = await pool.query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[myTasks] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function createTask(req: Request, res: Response) {
  try {
    const { title, task_date } = req.body;
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_FIELDS", message: "title is required" },
      });
    }
    if (!task_date || typeof task_date !== "string" || !DATE_RE.test(task_date)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "task_date is required (YYYY-MM-DD)",
        },
      });
    }

    const result = await pool.query(
      `INSERT INTO tasks (company_id, employee_id, task_date, title)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.companyId, req.user.sub, task_date, title.trim().slice(0, 200)],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[createTask] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function updateTask(req: Request, res: Response) {
  try {
    const { done, title } = req.body;
    if (done === undefined && title === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "Nothing to update",
        },
      });
    }
    if (done !== undefined && typeof done !== "boolean") {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_FIELDS", message: "done must be boolean" },
      });
    }

    const result = await pool.query(
      `UPDATE tasks
       SET done = COALESCE($1, done),
           title = COALESCE($2, title),
           done_at = CASE
             WHEN $1::boolean IS TRUE THEN now()
             WHEN $1::boolean IS FALSE THEN NULL
             ELSE done_at
           END
       WHERE id = $3 AND employee_id = $4
       RETURNING *`,
      [
        done ?? null,
        typeof title === "string" && title.trim()
          ? title.trim().slice(0, 200)
          : null,
        req.params.id,
        req.user.sub,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Task not found" },
      });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[updateTask] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function deleteTask(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `DELETE FROM tasks WHERE id = $1 AND employee_id = $2 RETURNING id`,
      [req.params.id, req.user.sub],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Task not found" },
      });
    }

    res.json({ success: true, data: { message: "Task deleted" } });
  } catch (err) {
    console.error("[deleteTask] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}
