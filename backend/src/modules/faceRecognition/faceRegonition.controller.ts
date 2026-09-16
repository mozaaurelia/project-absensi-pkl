import { Request, Response } from "express";
import cloudinary from "../../config/cloudinary";
import { pool } from "../../config/database";
import { emitToEmployee } from "../../socket";
import { createNotification } from "../../shared/helpers/createNotification";
import {
  verifyEmployeeFace,
  FaceReferenceNotFoundError,
  GeminiParseError,
} from "../../shared/helpers/verifyEmployeeFace";

const MAX_IMAGE_BASE64_LENGTH = 8 * 1024 * 1024; // ~6MB binary

function errorResponse(
  res: Response,
  status: number,
  code: string,
  message: string,
) {
  return res.status(status).json({ success: false, error: { code, message } });
}

export async function verifyFace(req: Request, res: Response) {
  try {
    const employeeId = req.user.sub;
    const { capturedImage } = req.body as { capturedImage: string };

    if (!capturedImage) {
      return errorResponse(res, 400, "CAPTURED_IMAGE_REQUIRED", "capturedImage is required");
    }

    if (capturedImage.length > MAX_IMAGE_BASE64_LENGTH) {
      return errorResponse(res, 413, "IMAGE_TOO_LARGE", "Image is too large. Maximum size is 6MB.");
    }

    let result: { match: boolean; confidence?: number; reason?: string };
    try {
      result = await verifyEmployeeFace(employeeId, capturedImage);
    } catch (error) {
      if (error instanceof FaceReferenceNotFoundError) {
        return errorResponse(res, 404, "FACE_REFERENCE_NOT_FOUND", error.message);
      }
      if (error instanceof GeminiParseError) {
        return res.status(502).json({
          success: false,
          error: {
            code: "FACE_VERIFICATION_PARSE_ERROR",
            message: error.message,
            raw: error.raw,
          },
        });
      }
      throw error;
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[verifyFace] Error:", error);
    return errorResponse(res, 500, "INTERNAL_SERVER_ERROR", "Something went wrong. Please try again later.");
  }
}

export async function registerFaceReference(req: Request, res: Response) {
  const client = await pool.connect();
  let previousPublicId: string | null = null;
  try {
    const requestedId =
      typeof req.body?.employeeId === "string" ? req.body.employeeId.trim() : "";
    const image = typeof req.body?.image === "string" ? req.body.image : "";

    if (!requestedId || !image) {
      return errorResponse(res, 400, "EMPLOYEE_ID_AND_IMAGE_REQUIRED", "employeeId and image are required");
    }
    if (image.length > MAX_IMAGE_BASE64_LENGTH) {
      return errorResponse(res, 413, "IMAGE_TOO_LARGE", "Image is too large. Maximum size is 6MB.");
    }

    const isSelf = requestedId === req.user.sub;
    const isAdmin =
      req.user.actorType === "employee" &&
      typeof req.user.role === "string" &&
      req.user.role.toLowerCase() === "admin";
    if (!isSelf && !isAdmin) {
      return errorResponse(res, 403, "FORBIDDEN", "You can only register your own face reference");
    }

    const targetResult = await client.query(
      `SELECT id, name FROM employees WHERE id = $1 AND company_id = $2`,
      [requestedId, req.user.companyId],
    );
    if (targetResult.rows.length === 0) {
      return errorResponse(res, 404, "EMPLOYEE_NOT_FOUND", "Employee not found in your company");
    }
    const targetName = targetResult.rows[0].name as string;

    if (isAdmin) {
      const oldRefResult = await client.query(
        `SELECT cloudinary_public_id FROM employee_face_references WHERE employee_id = $1 AND is_active = true LIMIT 1`,
        [requestedId],
      );
      previousPublicId = oldRefResult.rows[0]?.cloudinary_public_id ?? null;
    }

    const dataUri = image.includes(",")
      ? image
      : `data:image/jpeg;base64,${image}`;

    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      folder: "sams/face-references",
    });

    await client.query("BEGIN");

    if (isAdmin) {
      await client.query(
        `UPDATE employee_face_references SET is_active = false WHERE employee_id = $1 AND is_active = true`,
        [requestedId],
      );

      const insertResult = await client.query(
        `INSERT INTO employee_face_references (employee_id, image_url, cloudinary_public_id, is_active, review_status)
         VALUES ($1, $2, $3, true, 'approved')
         RETURNING id, image_url, created_at`,
        [requestedId, uploadResult.secure_url, uploadResult.public_id],
      );

      await client.query("COMMIT");

      if (previousPublicId) {
        cloudinary.uploader
          .destroy(previousPublicId)
          .catch((err) =>
            console.warn("[registerFaceReference] Failed to remove old reference asset:", err?.message ?? err),
          );
      }

      return res.status(201).json({ success: true, data: insertResult.rows[0] });
    }

    // Self-registration: wajah masuk antrian approval admin, tidak langsung aktif.
    // Limit: maksimal SELF_FACE_DAILY_LIMIT pengajuan per karyawan per hari
    // (mencegah spam kirim foto wajah setelah ditolak / mengulang terus-menerus).
    const SELF_FACE_DAILY_LIMIT = 3;
    const dailyCountResult = await client.query(
      `SELECT COUNT(*)::int AS cnt
       FROM employee_face_references
       WHERE employee_id = $1 AND created_at >= CURRENT_DATE`,
      [requestedId],
    );
    const dailyCount = dailyCountResult.rows[0]?.cnt ?? 0;
    if (dailyCount >= SELF_FACE_DAILY_LIMIT) {
      await client.query("ROLLBACK");
      cloudinary.uploader
        .destroy(uploadResult.public_id)
        .catch((err) =>
          console.warn("[registerFaceReference] Failed to remove rate-limited asset:", err?.message ?? err),
        );
      return errorResponse(
        res,
        429,
        "FACE_DAILY_LIMIT_EXCEEDED",
        `You can submit at most ${SELF_FACE_DAILY_LIMIT} face registration(s) per day.`,
      );
    }

    const pendingCheck = await client.query(
      `SELECT id FROM employee_face_references WHERE employee_id = $1 AND review_status = 'pending' LIMIT 1`,
      [requestedId],
    );
    if (pendingCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      cloudinary.uploader
        .destroy(uploadResult.public_id)
        .catch((err) =>
          console.warn("[registerFaceReference] Failed to remove duplicate asset:", err?.message ?? err),
        );
      return errorResponse(
        res,
        409,
        "FACE_PENDING_REVIEW",
        "Your previous face submission is still waiting for admin approval.",
      );
    }

    const insertResult = await client.query(
      `INSERT INTO employee_face_references (employee_id, image_url, cloudinary_public_id, is_active, review_status)
       VALUES ($1, $2, $3, false, 'pending')
       RETURNING id, image_url, created_at`,
      [requestedId, uploadResult.secure_url, uploadResult.public_id],
    );

    const adminsResult = await client.query(
      `SELECT e.id FROM employees e
       JOIN roles r ON e.role_id = r.id
       WHERE e.company_id = $1 AND e.status = 'active' AND LOWER(r.name) = 'admin'`,
      [req.user.companyId],
    );

    const message = `${targetName} mengirim wajah baru untuk persetujuan`;
    const insertedNotifications: any[] = [];
    for (const adminRow of adminsResult.rows) {
      const notifResult = await client.query(
        `INSERT INTO notifications (employee_id, type, message, reference_type, reference_id, is_read)
         VALUES ($1, 'face_review_pending', $2, 'face_reference', $3, false)
         RETURNING id, employee_id, type, message, is_read, reference_type, created_at`,
        [adminRow.id, message, insertResult.rows[0].id],
      );
      insertedNotifications.push(notifResult.rows[0]);
    }

    await client.query(
      `INSERT INTO audit_logs (actor_id, actor_type, action, entity_type, entity_id)
       VALUES ($1, $2, 'register_face_pending', 'face_reference', $3)`,
      [req.user.sub, req.user.actorType, insertResult.rows[0].id],
    );

    await client.query("COMMIT");

    for (const notif of insertedNotifications) {
      emitToEmployee(notif.employee_id, "notification:new", notif);
    }

    return res.status(201).json({
      success: true,
      data: { ...insertResult.rows[0], review_status: "pending" },
      reviewRequired: true,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[registerFaceReference] Error:", error);
    return errorResponse(res, 500, "INTERNAL_SERVER_ERROR", "Something went wrong. Please try again later.");
  } finally {
    client.release();
  }
}

export async function listPendingFaceReferences(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT fr.id, fr.employee_id, fr.image_url, fr.created_at,
              e.name AS employee_name, e.email AS employee_email,
              d.name AS department_name
       FROM employee_face_references fr
       JOIN employees e ON e.id = fr.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE fr.review_status = 'pending' AND e.company_id = $1
       ORDER BY fr.created_at DESC
       LIMIT 100`,
      [req.user.companyId],
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("[listPendingFaceReferences] Error:", error);
    return errorResponse(res, 500, "INTERNAL_SERVER_ERROR", "Something went wrong. Please try again later.");
  }
}

async function setReferenceStatus(
  referenceId: string,
  status: "approved" | "rejected",
  companyId: string,
  actorId: string,
  actorType: string,
): Promise<{ employeeId: string; imageUrl: string; employeeName: string } | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const refResult = await client.query(
      `SELECT fr.id, fr.employee_id, fr.image_url, fr.cloudinary_public_id,
              e.name AS employee_name
       FROM employee_face_references fr
       JOIN employees e ON e.id = fr.employee_id
       WHERE fr.id = $1 AND e.company_id = $2 AND fr.review_status = 'pending'
       FOR UPDATE`,
      [referenceId, companyId],
    );
    if (refResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const ref = refResult.rows[0];

    if (status === "approved") {
      await client.query(
        `UPDATE employee_face_references SET is_active = false
         WHERE employee_id = $1 AND is_active = true AND id <> $2`,
        [ref.employee_id, ref.id],
      );
    }

    const isActive = status === "approved";
    await client.query(
      `UPDATE employee_face_references
       SET review_status = $2, is_active = $3
       WHERE id = $1`,
      [ref.id, status, isActive],
    );

    await client.query(
      `INSERT INTO audit_logs (actor_id, actor_type, action, entity_type, entity_id, old_value, new_value)
       VALUES ($1, $2, $3, 'face_reference', $4, $5, $6)`,
      [
        actorId,
        actorType,
        status === "approved" ? "approve_face" : "reject_face",
        ref.id,
        JSON.stringify({ review_status: "pending" }),
        JSON.stringify({ review_status: status, is_active: isActive }),
      ],
    );

    await client.query("COMMIT");

    if (status === "rejected" && ref.cloudinary_public_id) {
      cloudinary.uploader
        .destroy(ref.cloudinary_public_id)
        .catch((err) =>
          console.warn("[face review] Failed to remove rejected asset:", err?.message ?? err),
        );
    }

    return {
      employeeId: ref.employee_id,
      imageUrl: ref.image_url,
      employeeName: ref.employee_name,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function reviewFaceReference(req: Request, res: Response) {
  const referenceId =
    typeof req.params?.id === "string" ? req.params.id.trim() : "";
  const { decision } = req.body as { decision?: string };

  if (!referenceId || (decision !== "approve" && decision !== "reject")) {
    return errorResponse(res, 400, "INVALID_DECISION", 'decision must be "approve" or "reject"');
  }

  try {
    const result = await setReferenceStatus(
      referenceId,
      decision === "approve" ? "approved" : "rejected",
      req.user.companyId!,
      req.user.sub,
      req.user.actorType,
    );

    if (!result) {
      return errorResponse(res, 404, "FACE_REFERENCE_NOT_FOUND", "Pending face reference not found");
    }

    const targetName = result.employeeName;

    if (decision === "approve") {
      await createNotification(
        result.employeeId,
        "face_approved",
        "Wajah Anda sudah disetujui dan siap dipakai absensi.",
        "face_reference",
        referenceId,
      );
    } else {
      await createNotification(
        result.employeeId,
        "face_rejected",
        "Wajah Anda ditolak. Silakan kirim ulang foto wajah Anda.",
        "face_reference",
        referenceId,
      );
    }

    console.log(`[face review] ${decision} face reference for ${targetName}`);

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("[reviewFaceReference] Error:", error);
    return errorResponse(res, 500, "INTERNAL_SERVER_ERROR", "Something went wrong. Please try again later.");
  }
}
