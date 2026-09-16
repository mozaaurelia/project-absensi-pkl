import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JwtPayload } from "../shared/types/jwt.types";
import { pool } from "../config/database";

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({
      success: false,
      error: { code: "NO_TOKEN", message: "No token provided" },
    });
  }

  const token = header.split(" ")[1];
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: {
        code: "INVALID_TOKEN",
        message: "Invalid token or expired",
      },
    });
  }

  // Re-check account status on every request so resigned/deactivated users are
  // cut off immediately (not waiting for token expiry). Superadmins have no
  // status column, so only employees are checked here.
  if (payload.actorType === "employee") {
    try {
      const result = await pool.query(
        `SELECT status FROM employees WHERE id = $1`,
        [payload.sub],
      );
      if (result.rows.length === 0 || result.rows[0].status !== "active") {
        return res.status(401).json({
          success: false,
          error: {
            code: "ACCOUNT_INACTIVE",
            message:
              "Akun Anda sudah tidak aktif (resign/dinonaktifkan). Hubungi administrator.",
          },
        });
      }
    } catch (err) {
      console.error("[authenticate] status check error:", err);
      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong. Please try again later.",
        },
      });
    }
  }

  req.user = payload;
  next();
}