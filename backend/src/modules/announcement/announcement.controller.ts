import { Request, Response } from "express";
import { pool } from "../../config/database";

export async function listAnnouncements(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT a.*, e.name as author_name
       FROM announcements a
       LEFT JOIN employees e ON a.author_id = e.id
       WHERE a.company_id = $1
       ORDER BY a.created_at DESC`,
      [req.user.companyId],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[listAnnouncements] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function getAnnouncement(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT a.*, e.name as author_name
       FROM announcements a
       LEFT JOIN employees e ON a.author_id = e.id
       WHERE a.id = $1 AND a.company_id = $2`,
      [req.params.id, req.user.companyId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Announcement not found" },
      });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[getAnnouncement] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function createAnnouncement(req: Request, res: Response) {
  try {
    const { title, content } = req.body;
    if (!title || !title.trim() || !content || !content.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "title and content are required",
        },
      });
    }

    const result = await pool.query(
      `INSERT INTO announcements (company_id, author_id, title, content)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.companyId, req.user.sub, title.trim(), content.trim()],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[createAnnouncement] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function updateAnnouncement(req: Request, res: Response) {
  try {
    const { title, content } = req.body;
    if (!title || !title.trim() || !content || !content.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "title and content are required",
        },
      });
    }

    const result = await pool.query(
      `UPDATE announcements SET title = $1, content = $2, updated_at = now()
       WHERE id = $3 AND company_id = $4 RETURNING *`,
      [title.trim(), content.trim(), req.params.id, req.user.companyId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Announcement not found" },
      });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("[updateAnnouncement] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function deleteAnnouncement(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `DELETE FROM announcements WHERE id = $1 AND company_id = $2 RETURNING id`,
      [req.params.id, req.user.companyId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Announcement not found" },
      });
    }
    res.json({ success: true, data: { message: "Announcement deleted" } });
  } catch (err) {
    console.error("[deleteAnnouncement] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}