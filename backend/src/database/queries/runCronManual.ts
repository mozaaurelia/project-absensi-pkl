// src/database/queries/runCronManual.ts
// Jalankan job cron tertentu secara manual (tanpa menunggu jadwal).
//
// Run:
//   npm run cron:run -- --auto-alpha        (jalankan autoMarkAlpha utk hari ini)
//   npm run cron:run -- --reminders         (jalankan generateAttendanceReminders)
//   npm run cron:run -- --quota             (jalankan monthlyLeaveQuota)
//   npm run cron:run                        (semua di atas)

import { pool } from "../../config/database";
import {
  autoMarkAlpha,
  generateAttendanceReminders,
  monthlyLeaveQuota,
  generateMonthlyRecap,
} from "../cronJobs";

async function run() {
  const args = process.argv.slice(2);
  const all = args.length === 0;

  if (all || args.includes("--auto-alpha")) {
    await autoMarkAlpha();
  }
  if (all || args.includes("--reminders")) {
    await generateAttendanceReminders();
  }
  if (all || args.includes("--quota")) {
    await monthlyLeaveQuota();
  }
  if (all || args.includes("--recap")) {
    await generateMonthlyRecap();
  }

  await pool.end();
  console.log("Selesai.");
}

run().catch((err) => {
  console.error("Gagal menjalankan cron manual:", err);
  process.exit(1);
});