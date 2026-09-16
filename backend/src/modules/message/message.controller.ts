import { Request, Response } from "express";
import { pool } from "../../config/database";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function myMessages(req: Request, res: Response) {
  try {
    const parsed = parseInt(req.query.limit as string, 10);
    const limit = Math.min(Number.isNaN(parsed) ? 50 : Math.max(parsed, 1), 100);

    const result = await pool.query(
      `SELECT m.id, m.employee_id, m.body, m.created_at,
              e.name AS employee_name, e.image AS employee_image
       FROM (
         SELECT id, employee_id, body, created_at
         FROM messages
         WHERE company_id = $1
         ORDER BY created_at DESC
         LIMIT $2
       ) m
       JOIN employees e ON e.id = m.employee_id
       ORDER BY m.created_at ASC`,
      [req.user.companyId, limit],
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[myMessages] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function listDmConversations(req: Request, res: Response) {
  try {
    const me = req.user.sub;
    const companyId = req.user.companyId;

    const result = await pool.query(
      `SELECT e.id, e.name, e.image, r.name AS role_name,
              lm.body AS last_message_body,
              lm.created_at AS last_message_at,
              lm.sender_id AS last_message_sender_id,
              COALESCE(u.unread_count, 0) AS unread_count
       FROM employees e
       JOIN roles r ON r.id = e.role_id
       LEFT JOIN LATERAL (
         SELECT dm.body, dm.created_at, dm.sender_id
         FROM direct_messages dm
         WHERE (dm.sender_id = e.id AND dm.recipient_id = $1)
            OR (dm.sender_id = $1 AND dm.recipient_id = e.id)
         ORDER BY dm.created_at DESC
         LIMIT 1
       ) lm ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS unread_count
         FROM direct_messages dm
         WHERE dm.sender_id = e.id AND dm.recipient_id = $1 AND dm.read_at IS NULL
       ) u ON true
       WHERE e.company_id = $2 AND e.status = 'active' AND e.id <> $1
       ORDER BY lm.created_at DESC NULLS LAST, e.name ASC`,
      [me, companyId],
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[listDmConversations] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

async function assertPartner(
  me: string,
  partnerId: string,
  companyId: string | null,
) {
  if (!companyId || !UUID_RE.test(partnerId)) return false;
  const result = await pool.query(
    `SELECT id FROM employees WHERE id = $1 AND company_id = $2 AND status = 'active'`,
    [partnerId, companyId],
  );
  return result.rows.length > 0;
}

export async function getDmHistory(req: Request, res: Response) {
  try {
    const me = req.user.sub;
    const companyId = req.user.companyId;
    const partnerId = (typeof req.params.partnerId === "string" ? req.params.partnerId : "");

    if (!(await assertPartner(me, partnerId, companyId))) {
      return res.status(404).json({
        success: false,
        error: { code: "PARTNER_NOT_FOUND", message: "Chat partner not found" },
      });
    }

    const parsed = parseInt(req.query.limit as string, 10);
    const limit = Math.min(Number.isNaN(parsed) ? 50 : Math.max(parsed, 1), 100);

    const result = await pool.query(
      `SELECT id, sender_id, recipient_id, body, created_at
       FROM direct_messages
       WHERE company_id = $1
         AND ((sender_id = $2 AND recipient_id = $3)
           OR (sender_id = $3 AND recipient_id = $2))
       ORDER BY created_at DESC
       LIMIT $4`,
      [companyId, me, partnerId, limit],
    );

    await pool.query(
      `UPDATE direct_messages SET read_at = now()
       WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL`,
      [me, partnerId],
    );

    res.json({ success: true, data: result.rows.reverse() });
  } catch (err) {
    console.error("[getDmHistory] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function markDmRead(req: Request, res: Response) {
  try {
    const me = req.user.sub;
    const companyId = req.user.companyId;
    const partnerId = (typeof req.params.partnerId === "string" ? req.params.partnerId : "");

    if (!(await assertPartner(me, partnerId, companyId))) {
      return res.status(404).json({
        success: false,
        error: { code: "PARTNER_NOT_FOUND", message: "Chat partner not found" },
      });
    }

    await pool.query(
      `UPDATE direct_messages SET read_at = now()
       WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL`,
      [me, partnerId],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[markDmRead] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}
