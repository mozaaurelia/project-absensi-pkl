import bcrypt from "bcrypt";
import { pool } from "../config/database";

async function seed() {
  // 1. Bikin 1 company dummy
  const companyRes = await pool.query(
    `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
    ["PT Contoh Sejahtera"],
  );
  const companyId = companyRes.rows[0].id;

  // 2. Bikin role admin
  const roleRes = await pool.query(
    `INSERT INTO roles (company_id, name) VALUES ($1, 'admin') RETURNING id`,
    [companyId],
  );
  const roleId = roleRes.rows[0].id;

  // 3. Bikin 1 employee admin buat login testing
  const passwordHash = await bcrypt.hash("password123", 10);
  await pool.query(
    `INSERT INTO employees (company_id, role_id, name, email, password_hash, join_date, status)
     VALUES ($1, $2, 'Admin Utama', 'admin@test.com', $3, NOW(), 'active')`,
    [companyId, roleId, passwordHash],
  );

  console.log(
    "✅ Seed data berhasil dibuat. Login: admin@test.com / password123",
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed gagal:", err);
  process.exit(1);
});
