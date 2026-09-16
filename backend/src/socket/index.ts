import { Server as SocketServer, Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { JwtPayload } from "../shared/types/jwt.types";
import { pool } from "../config/database";

let io: SocketServer | null = null;

export function getIo(): SocketServer | null {
  return io;
}

export function emitToEmployee(
  employeeId: string,
  event: string,
  data: unknown,
): void {
  if (!io) return;
  io.to(`employee:${employeeId}`).emit(event, data);
}

export function emitToCompany(
  companyId: string,
  event: string,
  data: unknown,
): void {
  if (!io) return;
  io.to(`company:${companyId}`).emit(event, data);
}

interface SocketData {
  employeeId: string;
  companyId: string;
  role: string;
}

const lastMessageAt = new Map<string, number>();
const RATE_LIMIT_MS = 300;

export function initSocketServer(httpServer: HttpServer) {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()) ?? [
        "http://localhost:3000",
      ],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("NO_TOKEN"));

      let payload: JwtPayload;
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
      } catch {
        return next(new Error("INVALID_TOKEN"));
      }

      if (payload.actorType !== "employee") {
        return next(new Error("FORBIDDEN"));
      }

      const result = await pool.query(
        `SELECT id, company_id, status FROM employees WHERE id = $1`,
        [payload.sub],
      );
      const employee = result.rows[0];
      if (!employee || employee.status !== "active") {
        return next(new Error("ACCOUNT_INACTIVE"));
      }

      socket.data.employeeId = employee.id;
      socket.data.companyId = employee.company_id;
      socket.data.role = payload.role;
      next();
    } catch (err) {
      console.error("[socket] auth error:", err);
      next(new Error("INTERNAL_SERVER_ERROR"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const { employeeId, companyId } = socket.data as SocketData;
    socket.join(`company:${companyId}`);
    socket.join(`employee:${employeeId}`);
    lastMessageAt.delete(socket.id);

    socket.on(
      "message:send",
      async (raw: { body?: unknown }, ack?: (response: unknown) => void) => {
        try {
          const now = Date.now();
          const last = lastMessageAt.get(socket.id) ?? 0;
          if (now - last < RATE_LIMIT_MS) {
            ack?.({ success: false, error: { code: "TOO_FAST" } });
            return;
          }

          const body =
            typeof raw?.body === "string" ? raw.body.trim().slice(0, 1000) : "";
          if (!body) {
            ack?.({ success: false, error: { code: "EMPTY_MESSAGE" } });
            return;
          }
          lastMessageAt.set(socket.id, now);

          const result = await pool.query(
            `WITH ins AS (
               INSERT INTO messages (company_id, employee_id, body)
               VALUES ($1, $2, $3)
               RETURNING id, company_id, employee_id, body, created_at
             )
             SELECT ins.*, e.name AS employee_name, e.image AS employee_image
             FROM ins
             JOIN employees e ON e.id = ins.employee_id`,
            [companyId, employeeId, body],
          );
          const message = result.rows[0];

          io!.to(`company:${companyId}`).emit("message:new", message);
          ack?.({ success: true, data: message });
        } catch (err) {
          console.error("[socket] message:send error:", err);
          ack?.({
            success: false,
            error: { code: "INTERNAL_SERVER_ERROR" },
          });
        }
      },
    );

    socket.on(
      "dm:send",
      async (
        raw: { recipientId?: unknown; body?: unknown },
        ack?: (response: unknown) => void,
      ) => {
        try {
          const now = Date.now();
          const last = lastMessageAt.get(socket.id) ?? 0;
          if (now - last < RATE_LIMIT_MS) {
            ack?.({ success: false, error: { code: "TOO_FAST" } });
            return;
          }

          const recipientId =
            typeof raw?.recipientId === "string" ? raw.recipientId : "";
          const body =
            typeof raw?.body === "string" ? raw.body.trim().slice(0, 1000) : "";

          if (!body) {
            ack?.({ success: false, error: { code: "EMPTY_MESSAGE" } });
            return;
          }
          if (
            !recipientId ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              recipientId,
            ) ||
            recipientId === employeeId
          ) {
            ack?.({
              success: false,
              error: { code: "INVALID_RECIPIENT" },
            });
            return;
          }
          lastMessageAt.set(socket.id, now);

          const partnerResult = await pool.query(
            `SELECT id FROM employees WHERE id = $1 AND company_id = $2 AND status = 'active'`,
            [recipientId, companyId],
          );
          if (partnerResult.rows.length === 0) {
            ack?.({
              success: false,
              error: { code: "RECIPIENT_NOT_FOUND" },
            });
            return;
          }

          const result = await pool.query(
            `WITH ins AS (
               INSERT INTO direct_messages (company_id, sender_id, recipient_id, body)
               VALUES ($1, $2, $3, $4)
               RETURNING id, company_id, sender_id, recipient_id, body, created_at
             )
             SELECT ins.*, e.name AS employee_name, e.image AS employee_image
             FROM ins
             JOIN employees e ON e.id = ins.sender_id`,
            [companyId, employeeId, recipientId, body],
          );
          const message = result.rows[0];

          io!.to(`employee:${recipientId}`).emit("dm:new", message);
          io!.to(`employee:${employeeId}`).emit("dm:new", message);
          ack?.({ success: true, data: message });
        } catch (err) {
          console.error("[socket] dm:send error:", err);
          ack?.({
            success: false,
            error: { code: "INTERNAL_SERVER_ERROR" },
          });
        }
      },
    );

    socket.on("disconnect", () => {
      lastMessageAt.delete(socket.id);
    });
  });

  console.log("[socket] WebSocket server initialized");
}
