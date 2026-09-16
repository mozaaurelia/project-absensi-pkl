// src/database/queries/seedSuperadmin.ts
import bcrypt from "bcrypt";
import { pool } from "../../config/database";

async function run() {
  const passwordHash = await bcrypt.hash("superadmin123", 10);
  await pool.query(
    `INSERT INTO superadmins (name, email, password_hash) VALUES ($1, $2, $3)`,
    ["Platform Owner", "superadmin@sams.com", passwordHash],
  );
  console.log(
    "âœ… SuperAdmin dibuat. Login: superadmin@sams.com / superadmin123",
  );
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
