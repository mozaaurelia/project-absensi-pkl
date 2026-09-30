// src/database/queries/seedTesting.ts
// Seed data idempotent untuk PT Testing SAMS â€” tidak menyentuh PT Contoh Sejahtera / PT Mitra Baru.
// Strategi idempotent: hapus rows yang terkait "PT Testing SAMS" dari child ke parent dalam transaction,
// lalu insert ulang. Bisa dijalankan berulang (npm run seed:testing) tanpa duplikasi.
//
// âš ï¸  EMAIL PLACEHOLDER â€” TIDAK AMAN dipakai langsung
// Alamat email di bawah adalah placeholder publik dari layanan temp-mail.
// Inbox temp-mail (mis. temp-mail.org) BERSIFAT PUBLIK: siapa saja yang tahu
// alamatnya bisa buka isinya. Karena forgot-password mengirim link reset
// (sensitif), user HARUS:
//   1) Generate alamat temp-mail baru sendiri di temp-mail.org sesaat
//      sebelum run seed beneran, lalu replace konstanta EMAIL_* di file ini.
//   2) Lihat inbox di temp-mail.org untuk token reset yang masuk.
//
// Seed di bawah cukup untuk development/testing UI; untuk forgot-password
// flow yang valid, gunakan alamat yang baru di-generate user.

import bcrypt from "bcrypt";
import { pool } from "../../config/database";

// ---------- Email placeholders (TEMP-MAIL â€” bukan alamat asli user) ----------
const EMAIL_SUPERADMIN = "lahapi7651@joystill.com";  // password superadmin: *superadmin123*
const EMAIL_ADMIN = "yokafa5745@novelv.com";         // password karyawan/supervisor/admin: *password123*
const EMAIL_SUPERVISOR = "mipesa7964@luhupo.com";
const EMAIL_KARYAWAN1 = "vawik29615@luhupo.com";
const EMAIL_KARYAWAN2 = "majase5156@neplis.com";
const EMAIL_KARYAWAN3 = "kareto3124@neplis.com";

// const COMPANY_NAME = "PT Mitra Baru";
// const EMAIL_ADMIN = "mitraadmin4182@linuq.com";
// const EMAIL_KARYAWAN = "mitrakaryawan5871@linuq.com";
// const PASSWORD = "password123";

// ---------- Constants ----------
const COMPANY_NAME = "PT Testing SAMS";
const OFFICE_NAME = "Kantor Testing";
const OFFICE_LAT = -6.361770417679232;
const OFFICE_LNG = 106.84274445193988;
const OFFICE_RADIUS_M = 500;

// Shift 1 — normal pagi (jadwal default semua karyawan)
const SHIFT_NAME = "Shift Normal";
const SHIFT_START = "09:00:00";
const SHIFT_END = "17:00:00";
const SHIFT_TOLERANCE_MIN = 0; // 09.00 tepat = hadir, lewat 09.00 = telat
const SHIFT_CHECKIN_WINDOW_MIN = 60; // jendela absen 09.00–10.00

// Shift 2 — shift sore, dipakai Karyawan Testing 3 untuk membuktikan
// bahwa 1 company bisa punya banyak shift berbeda (multi-jadwal dalam 1 tenant)
const SHIFT2_NAME = "Shift Sore";
const SHIFT2_START = "14:00:00";
const SHIFT2_END = "22:00:00";
const SHIFT2_TOLERANCE_MIN = 5; // telat kalau lewat 14.05
const SHIFT2_CHECKIN_WINDOW_MIN = 60; // jendela absen 14.00–15.00

const WDP_NAME = "Senin-Jumat";
const WDP_ACTIVE_DAYS = [1, 2, 3, 4, 5]; // ISO weekday Senin..Jumat

// ---------- Helpers ----------
function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ---------- Cleanup (DELETE child â†’ parent, scoped to PT Testing SAMS) ----------
async function cleanup(companyId: string): Promise<void> {
  // Get employee ids in this company
  const empRes = await pool.query<{ id: string }>(
    `SELECT id FROM employees WHERE company_id = $1`,
    [companyId],
  );
  const empIds = empRes.rows.map((r) => r.id);

  if (empIds.length === 0) {
    // No employees â€” but master data / superadmin may still exist. Clean by company_id & email scope.
    await pool.query(`DELETE FROM superadmins WHERE email = $1`, [EMAIL_SUPERADMIN]);
    await pool.query(`DELETE FROM holidays WHERE company_id = $1`, [companyId]);
    await pool.query(`DELETE FROM calendar_events WHERE company_id = $1`, [companyId]);
    await pool.query(`DELETE FROM leave_types WHERE company_id = $1`, [companyId]);
    await pool.query(`DELETE FROM shifts WHERE company_id = $1`, [companyId]);
    await pool.query(`DELETE FROM working_day_patterns WHERE company_id = $1`, [companyId]);
    await pool.query(`DELETE FROM office_locations WHERE company_id = $1`, [companyId]);
    await pool.query(`DELETE FROM department_policies WHERE department_id IN (SELECT id FROM departments WHERE company_id = $1)`, [companyId]);
    await pool.query(`DELETE FROM positions WHERE company_id = $1`, [companyId]);
    await pool.query(`DELETE FROM departments WHERE company_id = $1`, [companyId]);
    await pool.query(`DELETE FROM roles WHERE company_id = $1`, [companyId]);
    await pool.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
    return;
  }

  // Delete in FK-safe order. Many FKs are NO ACTION, so order matters.
  // 1. attendance
  await pool.query(`DELETE FROM attendances WHERE company_id = $1`, [companyId]);
  // 2. overtime_requests
  await pool.query(`DELETE FROM overtime_requests WHERE company_id = $1`, [companyId]);
  // 3. personal_agendas
  await pool.query(`DELETE FROM personal_agendas WHERE company_id = $1`, [companyId]);
  // 4. calendar_events (created_by â†’ employees; company_id exists)
  await pool.query(`DELETE FROM calendar_events WHERE company_id = $1`, [companyId]);
  // 5. holidays
  await pool.query(`DELETE FROM holidays WHERE company_id = $1`, [companyId]);
  // 5b. leave_quota_ledger rows referencing leave_requests of this company
  //     (FK leave_quota_ledger_reference_id_fkey â†’ leave_requests.id, populated on approval)
  await pool.query(
    `DELETE FROM leave_quota_ledger WHERE reference_id IN (SELECT id FROM leave_requests WHERE company_id = $1)`,
    [companyId],
  );
  // 6. leave_requests (approved_by â†’ employees)
  await pool.query(`DELETE FROM leave_requests WHERE company_id = $1`, [companyId]);
  // 7. leave_quota_ledger
  await pool.query(
    `DELETE FROM leave_quota_ledger WHERE employee_id = ANY($1::uuid[])`,
    [empIds],
  );
  // 8. notifications (employee_id â†’ employees)
  await pool.query(
    `DELETE FROM notifications WHERE employee_id = ANY($1::uuid[])`,
    [empIds],
  );
  // 9. employee_face_references (CASCADE on employee_id)
  await pool.query(
    `DELETE FROM employee_face_references WHERE employee_id = ANY($1::uuid[])`,
    [empIds],
  );
  // 10. password_reset_tokens (account_id, no FK anymore â€” scope by account)
  await pool.query(
    `DELETE FROM password_reset_tokens WHERE account_id = ANY($1::uuid[])`,
    [empIds],
  );
  // 11. employee_schedules (employee_id â†’ employees)
  await pool.query(
    `DELETE FROM employee_schedules WHERE employee_id = ANY($1::uuid[])`,
    [empIds],
  );
  // 12. audit_logs (entity_id may point to employees etc; scope by actor_id in employees)
  await pool.query(
    `DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[])`,
    [empIds],
  );
  // 13. department_policies (department_id â†’ departments)
  await pool.query(
    `DELETE FROM department_policies WHERE department_id IN (SELECT id FROM departments WHERE company_id = $1)`,
    [companyId],
  );
  // 14. employees (supervisor_id self-FK â†’ employees) â€” set supervisor_id to NULL first
  await pool.query(
    `UPDATE employees SET supervisor_id = NULL WHERE company_id = $1`,
    [companyId],
  );
  await pool.query(`DELETE FROM employees WHERE company_id = $1`, [companyId]);
  // 15. superadmins (no FK; clean by email scope)
  await pool.query(
    `DELETE FROM superadmins WHERE email = $1`,
    [EMAIL_SUPERADMIN],
  );
  // 16. master data
  await pool.query(`DELETE FROM leave_types WHERE company_id = $1`, [companyId]);
  await pool.query(`DELETE FROM shifts WHERE company_id = $1`, [companyId]);
  await pool.query(`DELETE FROM working_day_patterns WHERE company_id = $1`, [companyId]);
  await pool.query(`DELETE FROM office_locations WHERE company_id = $1`, [companyId]);
  await pool.query(`DELETE FROM positions WHERE company_id = $1`, [companyId]);
  await pool.query(`DELETE FROM departments WHERE company_id = $1`, [companyId]);
  await pool.query(`DELETE FROM roles WHERE company_id = $1`, [companyId]);
  // 17. company
  await pool.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
}

// ---------- Build id maps from in-memory inserts ----------
type IdMaps = {
  companyId: string;
  roleAdmin: string;
  roleSupervisor: string;
  roleEmployee: string;
  departmentIT: string;
  departmentHRD: string;
  departmentOperasional: string;
  positionStaff: string;
  positionManager: string;
  positionSupervisor: string;
  shiftId: string;
  shift2Id: string;
  wdpId: string;
  locationId: string;
  location2Id: string;
  leaveTypeCuti: string;
  leaveTypeIzin: string;
  leaveTypeSakit: string;
  superadminId: string;
  adminId: string;
  supervisorId: string;
  karyawan1Id: string;
  karyawan2Id: string;
  karyawan3Id: string;
  scheduleByEmp: Record<string, string>;
  leaveReqIds: {
    cutiPending: string;
    izinApproved: string;
    cutiApproved: string;
    sakitRejected: string;
    izinPending: string;
    sakitPending: string;
  };
  overtimeReqIds: {
    pending: string;
    approved: string;
    rejected: string;
  };
};

async function buildFreshCompany(): Promise<IdMaps> {
  // Company
  const companyRes = await pool.query<{ id: string }>(
    `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
    [COMPANY_NAME],
  );
  const companyId = companyRes.rows[0].id;

  // Roles
  const adminRoleRes = await pool.query<{ id: string }>(
    `INSERT INTO roles (company_id, name) VALUES ($1, 'admin') RETURNING id`,
    [companyId],
  );
  const supervisorRoleRes = await pool.query<{ id: string }>(
    `INSERT INTO roles (company_id, name) VALUES ($1, 'supervisor') RETURNING id`,
    [companyId],
  );
  const employeeRoleRes = await pool.query<{ id: string }>(
    `INSERT INTO roles (company_id, name) VALUES ($1, 'employee') RETURNING id`,
    [companyId],
  );

  // Departments â€” 3 departemen agar ada variasi relasi & kebijakan
  const deptITRes = await pool.query<{ id: string }>(
    `INSERT INTO departments (company_id, name) VALUES ($1, 'IT') RETURNING id`,
    [companyId],
  );
  const deptHRDRes = await pool.query<{ id: string }>(
    `INSERT INTO departments (company_id, name) VALUES ($1, 'HRD') RETURNING id`,
    [companyId],
  );
  const deptOpsRes = await pool.query<{ id: string }>(
    `INSERT INTO departments (company_id, name) VALUES ($1, 'Operasional') RETURNING id`,
    [companyId],
  );

  // Positions
  const posStaffRes = await pool.query<{ id: string }>(
    `INSERT INTO positions (company_id, name) VALUES ($1, 'Staff') RETURNING id`,
    [companyId],
  );
  const posManagerRes = await pool.query<{ id: string }>(
    `INSERT INTO positions (company_id, name) VALUES ($1, 'Manager') RETURNING id`,
    [companyId],
  );
  const posSupervisorRes = await pool.query<{ id: string }>(
    `INSERT INTO positions (company_id, name) VALUES ($1, 'Supervisor') RETURNING id`,
    [companyId],
  );

  // Shift
  const shiftRes = await pool.query<{ id: string }>(
    `INSERT INTO shifts (company_id, name, start_time, end_time, tolerance_minutes, checkin_window_minutes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [companyId, SHIFT_NAME, SHIFT_START, SHIFT_END, SHIFT_TOLERANCE_MIN, SHIFT_CHECKIN_WINDOW_MIN],
  );

  // Shift 2 — bukti 1 tenant bisa punya banyak jadwal berbeda
  const shift2Res = await pool.query<{ id: string }>(
    `INSERT INTO shifts (company_id, name, start_time, end_time, tolerance_minutes, checkin_window_minutes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [companyId, SHIFT2_NAME, SHIFT2_START, SHIFT2_END, SHIFT2_TOLERANCE_MIN, SHIFT2_CHECKIN_WINDOW_MIN],
  );

  // Working day pattern (ISO weekday array)
  const wdpRes = await pool.query<{ id: string }>(
    `INSERT INTO working_day_patterns (company_id, name, active_days)
     VALUES ($1, $2, $3) RETURNING id`,
    [companyId, WDP_NAME, WDP_ACTIVE_DAYS],
  );

  // Office location
  const locRes = await pool.query<{ id: string }>(
    `INSERT INTO office_locations (company_id, name, latitude, longitude, radius_meters)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [companyId, OFFICE_NAME, OFFICE_LAT, OFFICE_LNG, OFFICE_RADIUS_M],
  );

  // Lokasi kedua — untuk scenario multi-cabang (test C3/C3b)
  const loc2Res = await pool.query<{ id: string }>(
    `INSERT INTO office_locations (company_id, name, latitude, longitude, radius_meters)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [companyId, "Kantor Cabang 2", -6.29194, 106.84994, OFFICE_RADIUS_M],
  );

  // Leave types
  const ltCutiRes = await pool.query<{ id: string }>(
    `INSERT INTO leave_types (company_id, name, requires_attachment) VALUES ($1, 'Cuti Tahunan', false) RETURNING id`,
    [companyId],
  );
  const ltIzinRes = await pool.query<{ id: string }>(
    `INSERT INTO leave_types (company_id, name, requires_attachment) VALUES ($1, 'Izin', false) RETURNING id`,
    [companyId],
  );
  const ltSakitRes = await pool.query<{ id: string }>(
    `INSERT INTO leave_types (company_id, name, requires_attachment) VALUES ($1, 'Sakit', true) RETURNING id`,
    [companyId],
  );

  return {
    companyId,
    roleAdmin: adminRoleRes.rows[0].id,
    roleSupervisor: supervisorRoleRes.rows[0].id,
    roleEmployee: employeeRoleRes.rows[0].id,
    departmentIT: deptITRes.rows[0].id,
    departmentHRD: deptHRDRes.rows[0].id,
    departmentOperasional: deptOpsRes.rows[0].id,
    positionStaff: posStaffRes.rows[0].id,
    positionManager: posManagerRes.rows[0].id,
    positionSupervisor: posSupervisorRes.rows[0].id,
    shiftId: shiftRes.rows[0].id,
    shift2Id: shift2Res.rows[0].id,
    wdpId: wdpRes.rows[0].id,
    locationId: locRes.rows[0].id,
    location2Id: loc2Res.rows[0].id,
    leaveTypeCuti: ltCutiRes.rows[0].id,
    leaveTypeIzin: ltIzinRes.rows[0].id,
    leaveTypeSakit: ltSakitRes.rows[0].id,
    superadminId: "",
    adminId: "",
    supervisorId: "",
    karyawan1Id: "",
    karyawan2Id: "",
    karyawan3Id: "",
    scheduleByEmp: {},
    leaveReqIds: { cutiPending: "", izinApproved: "", cutiApproved: "", sakitRejected: "", izinPending: "", sakitPending: "" },
    overtimeReqIds: { pending: "", approved: "", rejected: "" },
  };
}

async function insertAccounts(maps: IdMaps): Promise<void> {
  const hash = (pw: string) => bcrypt.hash(pw, 10);

  // Superadmin (table superadmins)
  const superadminHash = await hash("superadmin123");
  const saRes = await pool.query<{ id: string }>(
    `INSERT INTO superadmins (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id`,
    ["Super Admin Testing", EMAIL_SUPERADMIN, superadminHash],
  );
  maps.superadminId = saRes.rows[0].id;

  const adminHash = await hash("password123");
  const supervisorHash = await hash("password123");
  const employeeHash = await hash("password123");

// Admin (HRD, Manager)
  const adminRes = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, role_id, department_id, position_id, supervisor_id, name, email, password_hash, join_date, status,
                             nik, npwp, tempat_lahir, no_telp, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, alamat_ktp, agama, pendidikan_terakhir, no_rekening, nama_bank, golongan_darah, phone, address, birth_date, gender, marital_status)
     VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, NOW(), 'active', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25) RETURNING id`,
    [
      maps.companyId,
      maps.roleAdmin,
      maps.departmentHRD,
      maps.positionManager,
      "Admin Testing",
      EMAIL_ADMIN,
      adminHash,
      "1013170101010001",
      "01.234.567.8-901.000",
      "Jakarta",
      "081234567890",
      "Ibu Admin",
      "Ibu",
      "081298765432",
      "Jl. Merdeka No. 1, Jakarta",
      "Islam",
      "S1",
      "1234567890",
      "BCA",
      "O",
      "081234567890",
      "Jl. Merdeka No. 1, Jakarta",
      "1990-05-15",
      "female",
      "married",
    ],
  );
  maps.adminId = adminRes.rows[0].id;

  // Supervisor (IT, Supervisor position)
  const supRes = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, role_id, department_id, position_id, supervisor_id, name, email, password_hash, join_date, status,
                             nik, npwp, tempat_lahir, no_telp, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, alamat_ktp, agama, pendidikan_terakhir, no_rekening, nama_bank, golongan_darah, phone, address, birth_date, gender, marital_status)
     VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, NOW(), 'active', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25) RETURNING id`,
    [
      maps.companyId,
      maps.roleSupervisor,
      maps.departmentIT,
      maps.positionSupervisor,
      "Supervisor Testing",
      EMAIL_SUPERVISOR,
      supervisorHash,
      "1013170102020002",
      "01.234.567.8-902.000",
      "Bandung",
      "081345678901",
      "Istri Supervisor",
      "Istri",
      "081356789012",
      "Jl. Sudirman No. 2, Bandung",
      "Kristen",
      "S1",
      "2345678901",
      "Mandiri",
      "B",
      "081345678901",
      "Jl. Sudirman No. 2, Bandung",
      "1988-11-20",
      "male",
      "married",
    ],
  );
  maps.supervisorId = supRes.rows[0].id;

  // Karyawan 1 (IT, Staff) — bawahan langsung supervisor
  const k1Res = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, role_id, department_id, position_id, supervisor_id, name, email, password_hash, join_date, status,
                             nik, npwp, tempat_lahir, no_telp, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, alamat_ktp, agama, pendidikan_terakhir, no_rekening, nama_bank, golongan_darah, phone, address, birth_date, gender, marital_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 'active', $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26) RETURNING id`,
    [
      maps.companyId,
      maps.roleEmployee,
      maps.departmentIT,
      maps.positionStaff,
      maps.supervisorId,
      "Karyawan Testing 1",
      EMAIL_KARYAWAN1,
      employeeHash,
      "1013170103030003",
      "01.234.567.8-903.000",
      "Surabaya",
      "081456789012",
      "Ayah Karyawan 1",
      "Ayah",
      "081467890123",
      "Jl. Raya No. 3, Surabaya",
      "Islam",
      "SMA",
      "3456789012",
      "BRI",
      "A",
      "081456789012",
      "Jl. Raya No. 3, Surabaya",
      "1998-03-10",
      "male",
      "single",
    ],
  );
  maps.karyawan1Id = k1Res.rows[0].id;

  // Karyawan 2 (Operasional, Staff) — bawahan supervisor (lintas departemen)
  const k2Res = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, role_id, department_id, position_id, supervisor_id, name, email, password_hash, join_date, status,
                             nik, npwp, tempat_lahir, no_telp, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, alamat_ktp, agama, pendidikan_terakhir, no_rekening, nama_bank, golongan_darah, phone, address, birth_date, gender, marital_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 'active', $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26) RETURNING id`,
    [
      maps.companyId,
      maps.roleEmployee,
      maps.departmentOperasional,
      maps.positionStaff,
      maps.supervisorId,
      "Karyawan Testing 2",
      EMAIL_KARYAWAN2,
      employeeHash,
      "1013170104040004",
      "01.234.567.8-904.000",
      "Yogyakarta",
      "081567890123",
      "Ibu Karyawan 2",
      "Ibu",
      "081578901234",
      "Jl. Malioboro No. 4, Yogyakarta",
      "Islam",
      "D3",
      "4567890123",
      "BNI",
      "AB",
      "081567890123",
      "Jl. Malioboro No. 4, Yogyakarta",
      "1999-07-25",
      "female",
      "single",
    ],
  );
  maps.karyawan2Id = k2Res.rows[0].id;

  // Karyawan Testing 3 — shift sore (multi-jadwal dalam 1 company)
  const k3Res = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, role_id, department_id, position_id, supervisor_id, name, email, password_hash, join_date, status,
                             nik, npwp, tempat_lahir, no_telp, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, alamat_ktp, agama, pendidikan_terakhir, no_rekening, nama_bank, golongan_darah, phone, address, birth_date, gender, marital_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 'active', $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26) RETURNING id`,
    [
      maps.companyId,
      maps.roleEmployee,
      maps.departmentIT,
      maps.positionStaff,
      maps.supervisorId,
      "Karyawan Testing 3 (Sore)",
      EMAIL_KARYAWAN3,
      employeeHash,
      "1013170105050005",
      "01.234.567.8-905.000",
      "Semarang",
      "081678901234",
      "Ibu Karyawan 3",
      "Ibu",
      "081689012345",
      "Jl. Pandanaran No. 5, Semarang",
      "Islam",
      "SMA",
      "5678901234",
      "BRI",
      "O",
      "081678901234",
      "Jl. Pandanaran No. 5, Semarang",
      "2000-12-10",
      "male",
      "single",
    ],
  );
  maps.karyawan3Id = k3Res.rows[0].id;
}

async function insertDepartmentPolicies(maps: IdMaps): Promise<void> {
  // GET/PUT /departments/:id/policy returns latest by effective_date DESC
  // Seed 1 row per department, effective_date = today.
  const today = ymd(new Date());
  for (const deptId of [maps.departmentIT, maps.departmentHRD, maps.departmentOperasional]) {
    await pool.query(
      `INSERT INTO department_policies (department_id, allow_overtime, allow_wfh, min_attendance_percentage, effective_date)
       VALUES ($1, $2, $3, $4, $5)`,
      [deptId, true, true, 90.0, today],
    );
  }
}

async function insertEmployeeSchedules(maps: IdMaps): Promise<void> {
  const startDate = ymd(addDays(new Date(), -21));
  const employeeIds = [maps.karyawan1Id, maps.karyawan2Id, maps.adminId, maps.supervisorId];
  for (const empId of employeeIds) {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO employee_schedules (employee_id, shift_id, working_day_pattern_id, location_id, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, NULL) RETURNING id`,
      [empId, maps.shiftId, maps.wdpId, maps.locationId, startDate],
    );
    maps.scheduleByEmp[empId] = res.rows[0].id;
  }

  // Karyawan 3 — shift sore (jadwal beda dalam tenant yang sama)
  const k3 = await pool.query<{ id: string }>(
    `INSERT INTO employee_schedules (employee_id, shift_id, working_day_pattern_id, location_id, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5, NULL) RETURNING id`,
    [maps.karyawan3Id, maps.shift2Id, maps.wdpId, maps.locationId, startDate],
  );
  maps.scheduleByEmp[maps.karyawan3Id] = k3.rows[0].id;

  // Karyawan 2 di-assign ke 2 cabang sekaligus (multi-cabang) untuk test C3/C3b
  const k2 = await pool.query<{ id: string }>(
    `INSERT INTO employee_schedules (employee_id, shift_id, working_day_pattern_id, location_id, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5, NULL) RETURNING id`,
    [maps.karyawan2Id, maps.shiftId, maps.wdpId, maps.location2Id, startDate],
  );
  maps.scheduleByEmp[`${maps.karyawan2Id}_l2`] = k2.rows[0].id;
}

async function insertLeaveQuotas(maps: IdMaps): Promise<void> {
  // Earn 12 hari cuti tahunan di awal periode (1 Jan tahun ini) untuk tiap akun
  const period = `${new Date().getFullYear()}-01-01`;
  const empIds = [maps.karyawan1Id, maps.karyawan2Id, maps.adminId, maps.supervisorId];
  for (const empId of empIds) {
    await pool.query(
      `INSERT INTO leave_quota_ledger (employee_id, period, entry_type, amount, reason, created_by)
       VALUES ($1, $2, 'earn', 12, 'Initial annual leave quota', $3)`,
      [empId, period, maps.adminId],
    );
  }
  await pool.query(
    `INSERT INTO leave_quota_ledger (employee_id, period, entry_type, amount, reason, created_by)
     VALUES ($1, $2, 'earn', 12, 'Initial annual leave quota', $3)`,
    [maps.karyawan3Id, period, maps.adminId],
  );
}

async function insertHistoricalAttendances(maps: IdMaps): Promise<void> {
  // 21 hari ke belakang, hanya hari kerja (Mon-Fri sesuai WDP).
  // Variasi status untuk testing laporan/rekap:
  //   - "hadir" â€” clock_in sebelum 09:00 + tolerance
  //   - "telat" â€” clock_in lewat 09:00 + tolerance
  //   - "alpha" â€” di-insert oleh cron 23:00; di sini kita juga tulis manual utk history
  // Hari leave approved untuk karyawan 1 â†’ SKIP (di-handle leave_requests).
  // Hari yang di-skip sama sekali â†’ simulate tidak ada record (artinya alpha kalau lewat tengah malam)

  const today = new Date();
  const empIds = [
    { id: maps.karyawan1Id, scheduleId: maps.scheduleByEmp[maps.karyawan1Id] },
    { id: maps.karyawan2Id, scheduleId: maps.scheduleByEmp[maps.karyawan2Id] },
  ];

  // Hari leave approved (skip attendance)
  const leaveApprovedK1: number[] = [3, 8];
  // Hari telat untuk karyawan 1
  const telatDaysK1 = [2, 10];
  // Hari telat untuk karyawan 2
  const telatDaysK2 = [4, 11];
  // Hari alpha eksplisit (di-insert sebagai status=alpha)
  const alphaDaysK1: number[] = [15];
  const alphaDaysK2: number[] = [6, 13, 18];

  for (let offset = 1; offset <= 21; offset++) {
    const date = addDays(today, -offset);
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    const dateStr = ymd(date);

    for (const e of empIds) {
      const isK1 = e.id === maps.karyawan1Id;
      const leaveApproved = isK1 && leaveApprovedK1.includes(offset);
      if (leaveApproved) continue;

      const telat = (isK1 && telatDaysK1.includes(offset)) || (!isK1 && telatDaysK2.includes(offset));
      const isAlpha = (isK1 && alphaDaysK1.includes(offset)) || (!isK1 && alphaDaysK2.includes(offset));

      if (isAlpha) {
        // Insert dengan status=alpha (tidak ada clock_in_time)
        await pool.query(
          `INSERT INTO attendances (company_id, employee_id, schedule_id, status)
           VALUES ($1, $2, $3, 'alpha')`,
          [maps.companyId, e.id, e.scheduleId],
        );
        continue;
      }

      // Default: hadir / telat
      let clockInHour = 8;
      let clockInMin = 55;
      let status = "hadir";
      if (telat) {
        clockInHour = 9;
        clockInMin = 25;
        status = "telat";
      }

      const clockIn = new Date(date);
      clockIn.setHours(clockInHour, clockInMin, 0, 0);
      const clockOut = new Date(date);
      clockOut.setHours(17, 5, 0, 0);

      const jitterLat = (Math.random() - 0.5) * 0.0008;
      const jitterLng = (Math.random() - 0.5) * 0.0008;

      await pool.query(
        `INSERT INTO attendances (company_id, employee_id, schedule_id, clock_in_time, clock_in_lat, clock_in_lng, clock_in_distance_m, clock_out_time, clock_out_lat, clock_out_lng, clock_out_distance_m, face_match_status, status)
         VALUES ($1, $2, $3, $4, $5, $6, 50, $7, $8, $9, 55, 'passed', $10)`,
        [
          maps.companyId,
          e.id,
          e.scheduleId,
          clockIn.toISOString(),
          OFFICE_LAT + jitterLat,
          OFFICE_LNG + jitterLng,
          clockOut.toISOString(),
          OFFICE_LAT + jitterLat,
          OFFICE_LNG + jitterLng,
          status,
        ],
      );
    }
  }
}

async function insertLeaveRequests(maps: IdMaps): Promise<void> {
  // Tiap status (pending/approved/rejected) x tiap leave type
  const today = new Date();

  // 1. PENDING cuti tahunan (karyawan 1)
  const cutiPending = await pool.query<{ id: string }>(
    `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, total_days, reason, status)
     VALUES ($1, $2, $3, $4, $5, 2, 'Cuti keluarga', 'pending') RETURNING id`,
    [maps.companyId, maps.karyawan1Id, maps.leaveTypeCuti, ymd(addDays(today, 7)), ymd(addDays(today, 8))],
  );
  maps.leaveReqIds.cutiPending = cutiPending.rows[0].id;

  // 2. PENDING izin (karyawan 2)
  const izinPending = await pool.query<{ id: string }>(
    `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, total_days, reason, status)
     VALUES ($1, $2, $3, $4, $5, 1, 'Izin urusan mendadak', 'pending') RETURNING id`,
    [maps.companyId, maps.karyawan2Id, maps.leaveTypeIzin, ymd(addDays(today, 3)), ymd(addDays(today, 3))],
  );
  maps.leaveReqIds.izinPending = izinPending.rows[0].id;

  // 3. PENDING sakit dengan lampiran (karyawan 1)
  const sakitPending = await pool.query<{ id: string }>(
    `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, total_days, reason, attachment_url, status)
     VALUES ($1, $2, $3, $4, $5, 1, 'Sakit demam', 'https://res.cloudinary.com/demo/image/upload/sample.jpg', 'pending') RETURNING id`,
    [maps.companyId, maps.karyawan1Id, maps.leaveTypeSakit, ymd(addDays(today, 10)), ymd(addDays(today, 10))],
  );
  maps.leaveReqIds.sakitPending = sakitPending.rows[0].id;

  // 4. APPROVED izin 5 hari lalu (karyawan 1)
  const izinApproved = await pool.query<{ id: string }>(
    `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, total_days, reason, status, approved_by, approved_at, approval_note)
     VALUES ($1, $2, $3, $4, $5, 1, 'Izin urusan keluarga', 'approved', $6, now(), 'Disetujui') RETURNING id`,
    [maps.companyId, maps.karyawan1Id, maps.leaveTypeIzin, ymd(addDays(today, -5)), ymd(addDays(today, -5)), maps.supervisorId],
  );
  maps.leaveReqIds.izinApproved = izinApproved.rows[0].id;

  // 5. APPROVED cuti 3 hari lalu (karyawan 2)
  const cutiApproved = await pool.query<{ id: string }>(
    `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, total_days, reason, status, approved_by, approved_at, approval_note)
     VALUES ($1, $2, $3, $4, $5, 2, 'Cuti pribadi', 'approved', $6, now(), 'Disetujui') RETURNING id`,
    [maps.companyId, maps.karyawan2Id, maps.leaveTypeCuti, ymd(addDays(today, -3)), ymd(addDays(today, -2)), maps.supervisorId],
  );
  maps.leaveReqIds.cutiApproved = cutiApproved.rows[0].id;

  // 6. REJECTED sakit kemarin (karyawan 1) â€” lampiran tidak lengkap
  const sakitRejected = await pool.query<{ id: string }>(
    `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, total_days, reason, status, approved_by, approved_at, approval_note)
     VALUES ($1, $2, $3, $4, $5, 1, 'Sakit', 'rejected', $6, now(), 'Lampiran surat dokter belum dilampirkan') RETURNING id`,
    [maps.companyId, maps.karyawan1Id, maps.leaveTypeSakit, ymd(addDays(today, -1)), ymd(addDays(today, -1)), maps.supervisorId],
  );
  maps.leaveReqIds.sakitRejected = sakitRejected.rows[0].id;
}

async function insertOvertimeRequests(maps: IdMaps): Promise<void> {
  const today = new Date();

  // 1. PENDING lembur besok (karyawan 1)
  const pending = await pool.query<{ id: string }>(
    `INSERT INTO overtime_requests (company_id, employee_id, overtime_date, start_time, end_time, total_hours, category, reason, status)
     VALUES ($1, $2, $3, '17:30:00', '19:00:00', 1.5, 'project_deadline', 'Deadline project klien', 'pending') RETURNING id`,
    [maps.companyId, maps.karyawan1Id, ymd(addDays(today, 1))],
  );
  maps.overtimeReqIds.pending = pending.rows[0].id;

  // 2. APPROVED lembur kemarin (karyawan 2)
  const approved = await pool.query<{ id: string }>(
    `INSERT INTO overtime_requests (company_id, employee_id, overtime_date, start_time, end_time, total_hours, category, reason, status, approved_by, approved_at)
     VALUES ($1, $2, $3, '17:30:00', '19:30:00', 2.0, 'system_maintenance', 'Maintenance server produksi', 'approved', $4, now()) RETURNING id`,
    [maps.companyId, maps.karyawan2Id, ymd(addDays(today, -1)), maps.supervisorId],
  );
  maps.overtimeReqIds.approved = approved.rows[0].id;

  // 3. REJECTED lembur 3 hari lalu (karyawan 1)
  const rejected = await pool.query<{ id: string }>(
    `INSERT INTO overtime_requests (company_id, employee_id, overtime_date, start_time, end_time, total_hours, category, reason, status, approved_by, approved_at, rejection_note)
     VALUES ($1, $2, $3, '18:00:00', '22:00:00', 4.0, 'other', 'Lembur tambahan', 'rejected', $4, now(), 'Durasi melebihi 2 jam, mohon revisi') RETURNING id`,
    [maps.companyId, maps.karyawan1Id, ymd(addDays(today, -3)), maps.supervisorId],
  );
  maps.overtimeReqIds.rejected = rejected.rows[0].id;
}

async function insertHolidays(maps: IdMaps): Promise<void> {
  const today = new Date();
  const year = today.getFullYear();
  await pool.query(
    `INSERT INTO holidays (company_id, date, name) VALUES ($1, $2, 'Hari Kemerdekaan RI')`,
    [maps.companyId, `${year}-08-17`],
  );
  await pool.query(
    `INSERT INTO holidays (company_id, date, name) VALUES ($1, $2, 'Cuti Bersama')`,
    [maps.companyId, ymd(addDays(today, 14))],
  );
  // Holiday di masa lalu (untuk testing history)
  await pool.query(
    `INSERT INTO holidays (company_id, date, name) VALUES ($1, $2, 'Hari Raya Idul Fitri')`,
    [maps.companyId, `${year}-03-21`],
  );
}

async function insertCalendarEvents(maps: IdMaps): Promise<void> {
  const today = new Date();
  await pool.query(
    `INSERT INTO calendar_events (company_id, title, description, event_date, created_by)
     VALUES ($1, 'Town Hall Bulanan', 'Rapat evaluasi bulanan seluruh karyawan', $2, $3)`,
    [maps.companyId, ymd(addDays(today, 7)), maps.adminId],
  );
  await pool.query(
    `INSERT INTO calendar_events (company_id, title, description, event_date, created_by)
     VALUES ($1, 'Training K3', 'Pelatihan keselamatan dan kesehatan kerja', $2, $3)`,
    [maps.companyId, ymd(addDays(today, -7)), maps.adminId],
  );
  await pool.query(
    `INSERT INTO calendar_events (company_id, title, description, event_date, created_by)
     VALUES ($1, 'Company Anniversary', 'Perayaan ulang tahun perusahaan', $2, $3)`,
    [maps.companyId, ymd(addDays(today, 30)), maps.adminId],
  );
}

async function insertPersonalAgendas(maps: IdMaps): Promise<void> {
  const today = new Date();
  const tomorrow = ymd(addDays(today, 1));
  const dayAfter = ymd(addDays(today, 2));

  await pool.query(
    `INSERT INTO personal_agendas (company_id, employee_id, agenda_date, title, description, start_time, end_time)
     VALUES ($1, $2, $3, 'Meeting klien A', 'Diskusi requirement klien A', '10:00:00', '11:00:00')`,
    [maps.companyId, maps.karyawan1Id, tomorrow],
  );
  await pool.query(
    `INSERT INTO personal_agendas (company_id, employee_id, agenda_date, title, description, start_time, end_time)
     VALUES ($1, $2, $3, 'Review code PR #123', 'Pull request review untuk fitur absensi', '14:00:00', '15:30:00')`,
    [maps.companyId, maps.karyawan1Id, dayAfter],
  );
  await pool.query(
    `INSERT INTO personal_agendas (company_id, employee_id, agenda_date, title, description, start_time, end_time)
     VALUES ($1, $2, $3, 'Stand-up tim Operasional', 'Daily stand-up dengan tim', '09:30:00', '10:00:00')`,
    [maps.companyId, maps.karyawan2Id, tomorrow],
  );
  // Agenda tanpa jam spesifik (null start/end) â€” variasi
  await pool.query(
    `INSERT INTO personal_agendas (company_id, employee_id, agenda_date, title, description, start_time, end_time)
     VALUES ($1, $2, $3, 'Reminder deadline laporan bulanan', 'Submit laporan bulanan ke admin', NULL, NULL)`,
    [maps.companyId, maps.karyawan1Id, ymd(addDays(today, 5))],
  );
}

async function insertNotifications(maps: IdMaps): Promise<void> {
  // Variasi tipe notifikasi yang dipakai di sistem: leave_request, overtime_request,
  // leave_approved, leave_rejected, overtime_approved, overtime_rejected, reminder

  // Untuk supervisor (approval queue)
  await pool.query(
    `INSERT INTO notifications (employee_id, type, message, is_read, reference_type, reference_id)
     VALUES ($1, 'leave_request', 'Pengajuan cuti baru dari Karyawan Testing 1', false, 'leave_request', $2)`,
    [maps.supervisorId, maps.leaveReqIds.cutiPending],
  );
  await pool.query(
    `INSERT INTO notifications (employee_id, type, message, is_read, reference_type, reference_id)
     VALUES ($1, 'overtime_request', 'Pengajuan lembur baru dari Karyawan Testing 1', false, 'overtime_request', $2)`,
    [maps.supervisorId, maps.overtimeReqIds.pending],
  );

  // Untuk karyawan 1
  await pool.query(
    `INSERT INTO notifications (employee_id, type, message, is_read, reference_type, reference_id)
     VALUES ($1, 'leave_approved', 'Pengajuan izin Anda telah disetujui', false, 'leave_request', $2)`,
    [maps.karyawan1Id, maps.leaveReqIds.izinApproved],
  );
  await pool.query(
    `INSERT INTO notifications (employee_id, type, message, is_read, reference_type, reference_id)
     VALUES ($1, 'leave_rejected', 'Pengajuan sakit Anda ditolak: lampiran belum lengkap', false, 'leave_request', $2)`,
    [maps.karyawan1Id, maps.leaveReqIds.sakitRejected],
  );
  await pool.query(
    `INSERT INTO notifications (employee_id, type, message, is_read, reference_type, reference_id)
     VALUES ($1, 'overtime_rejected', 'Pengajuan lembur Anda perlu direvisi (durasi > 2 jam)', false, 'overtime_request', $2)`,
    [maps.karyawan1Id, maps.overtimeReqIds.rejected],
  );

  // Untuk karyawan 2
  await pool.query(
    `INSERT INTO notifications (employee_id, type, message, is_read, reference_type, reference_id)
     VALUES ($1, 'overtime_approved', 'Pengajuan lembur Anda telah disetujui', true, 'overtime_request', $2)`,
    [maps.karyawan2Id, maps.overtimeReqIds.approved],
  );
  await pool.query(
    `INSERT INTO notifications (employee_id, type, message, is_read, reference_type, reference_id)
     VALUES ($1, 'leave_approved', 'Pengajuan cuti Anda telah disetujui', true, 'leave_request', $2)`,
    [maps.karyawan2Id, maps.leaveReqIds.cutiApproved],
  );

  // Reminder untuk semua (variasi role & status baca)
  await pool.query(
    `INSERT INTO notifications (employee_id, type, message, is_read, reference_type, reference_id)
     VALUES ($1, 'reminder', 'Jangan lupa clock-in hari ini', false, NULL, NULL)`,
    [maps.karyawan1Id],
  );
  await pool.query(
    `INSERT INTO notifications (employee_id, type, message, is_read, reference_type, reference_id)
     VALUES ($1, 'reminder', 'Laporakan lembur mingguan sudah dibuka', false, NULL, NULL)`,
    [maps.karyawan2Id],
  );
  await pool.query(
    `INSERT INTO notifications (employee_id, type, message, is_read, reference_type, reference_id)
     VALUES ($1, 'reminder', 'Reminder: review pengajuan lembur tim Anda', true, NULL, NULL)`,
    [maps.supervisorId],
  );
}

async function insertAuditLogs(maps: IdMaps): Promise<void> {
  // audit_logs tidak ada trigger otomatis di DB dan belum ada helper app-level.
  // Seed manual sample untuk demo history view (kalau nanti dibuat UI).
  const today = new Date();
  const days = (n: number) => ymd(addDays(today, -n));

  await pool.query(
    `INSERT INTO audit_logs (actor_id, actor_type, action, entity_type, entity_id, reason, created_at)
     VALUES ($1, 'employee', 'create', 'leave_request', $2, 'Pengajuan cuti baru', now() - interval '1 day')`,
    [maps.karyawan1Id, maps.leaveReqIds.cutiPending],
  );
  await pool.query(
    `INSERT INTO audit_logs (actor_id, actor_type, action, entity_type, entity_id, old_value, new_value, reason, created_at)
     VALUES ($1, 'employee', 'approve', 'leave_request', $2, $3, $4, 'Disetujui supervisor', now() - interval '5 days')`,
    [
      maps.supervisorId,
      maps.leaveReqIds.izinApproved,
      JSON.stringify({ status: "pending" }),
      JSON.stringify({ status: "approved", approval_note: "Disetujui" }),
    ],
  );
  await pool.query(
    `INSERT INTO audit_logs (actor_id, actor_type, action, entity_type, entity_id, old_value, new_value, reason, created_at)
     VALUES ($1, 'employee', 'reject', 'leave_request', $2, $3, $4, 'Lampiran tidak lengkap', now() - interval '1 day')`,
    [
      maps.supervisorId,
      maps.leaveReqIds.sakitRejected,
      JSON.stringify({ status: "pending" }),
      JSON.stringify({ status: "rejected", approval_note: "Lampiran surat dokter belum dilampirkan" }),
    ],
  );
  await pool.query(
    `INSERT INTO audit_logs (actor_id, actor_type, action, entity_type, entity_id, reason, created_at)
     VALUES ($1, 'employee', 'create', 'overtime_request', $2, 'Pengajuan lembur project deadline', now() - interval '1 day')`,
    [maps.karyawan1Id, maps.overtimeReqIds.pending],
  );
  await pool.query(
    `INSERT INTO audit_logs (actor_id, actor_type, action, entity_type, entity_id, reason, created_at)
     VALUES ($1, 'superadmin', 'login', 'superadmin', $2, 'Login superadmin berhasil', now() - interval '2 hours')`,
    [maps.superadminId, maps.superadminId],
  );
}

// ---------- Main ----------
async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Find or initialize company
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM companies WHERE name = $1`,
      [COMPANY_NAME],
    );
    let companyId: string;
    if (existing.rows.length > 0) {
      companyId = existing.rows[0].id;
      console.log(`â™»ï¸  Found existing company ${COMPANY_NAME} (id=${companyId}), cleaning up...`);
      await cleanup(companyId);
    }

    console.log(`ðŸŒ± Seeding ${COMPANY_NAME}...`);
    const maps = await buildFreshCompany();
    console.log(`  âœ“ Company + master data created`);

    await insertAccounts(maps);
    console.log(`  âœ“ Accounts (1 superadmin, 1 admin, 1 supervisor, 3 karyawan)`);

    await insertDepartmentPolicies(maps);
    console.log(`  âœ“ Department policies (1 per department)`);

    await insertEmployeeSchedules(maps);
    console.log(`  âœ“ Employee schedules`);

    await insertLeaveQuotas(maps);
    console.log(`  âœ“ Leave quota ledger (12 days Cuti Tahunan per employee)`);

    await insertHistoricalAttendances(maps);
    console.log(`  âœ“ Historical attendances (21 days, status: hadir/telat/alpha + skip on leave)`);

    await insertLeaveRequests(maps);
    console.log(`  âœ“ Leave requests (3 pending, 2 approved, 1 rejected â€” tiap leave type)`);

    await insertOvertimeRequests(maps);
    console.log(`  âœ“ Overtime requests (1 pending, 1 approved, 1 rejected)`);

    await insertHolidays(maps);
    console.log(`  âœ“ Holidays (3 entries)`);

    await insertCalendarEvents(maps);
    console.log(`  âœ“ Calendar events (3 entries)`);

    await insertPersonalAgendas(maps);
    console.log(`  âœ“ Personal agendas (4 entries)`);

    await insertNotifications(maps);
    console.log(`  âœ“ Notifications (10 entries â€” 7 type variations)`);

    await insertAuditLogs(maps);
    console.log(`  âœ“ Audit logs (5 entries â€” sample manual)`);

    await client.query("COMMIT");
    console.log(`\nâœ… Seed complete!`);
    console.log(`\nLogin credentials (EMAIL PLACEHOLDER â€” belum tentu terkirim ke real inbox):`);
    console.log(`  Superadmin: ${EMAIL_SUPERADMIN} / superadmin123`);
    console.log(`  Admin:      ${EMAIL_ADMIN} / password123`);
    console.log(`  Supervisor: ${EMAIL_SUPERVISOR} / password123`);
    console.log(`  Karyawan 1: ${EMAIL_KARYAWAN1} / password123`);
    console.log(`  Karyawan 2: ${EMAIL_KARYAWAN2} / password123`);
    console.log(`  Karyawan 3: ${EMAIL_KARYAWAN3} / password123`);
    console.log(`\n  Jadwal (multi-jadwal dalam 1 company):`);
    console.log(`  -> ${SHIFT_NAME}:  ${SHIFT_START} - ${SHIFT_END} (telat lewat ${SHIFT_START} + ${SHIFT_TOLERANCE_MIN}m)`);
    console.log(`     Karyawan 1, Karyawan 2, Admin, Supervisor`);
    console.log(`  -> ${SHIFT2_NAME}: ${SHIFT2_START} - ${SHIFT2_END} (telat lewat ${SHIFT2_START} + ${SHIFT2_TOLERANCE_MIN}m)`);
    console.log(`     Karyawan 3`);
    console.log(`\nâš ï¸  LANGKAH MANUAL setelah seed:`);
    console.log(`  1. Buka temp-mail.org dan generate alamat BARU (mis. xxx123@temp-mail.org).`);
    console.log(`  2. Replace konstanta EMAIL_* di file src/database/queries/seedTesting.ts dengan`);
    console.log(`     alamat yang baru, lalu run ulang npm run seed:testing.`);
    console.log(`  3. Setiap akun employees WAJIB mendaftarkan wajah lewat FaceRegisterPanel`);
    console.log(`     sebelum bisa clock-in.`);
    console.log(`  4. Hanya role superadmin yang TIDAK butuh face registration.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("âŒ Seed gagal:", err);
    process.exit(1);
  });
