import { pool } from "../config/database";

export async function syncSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS overtime_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      employee_id UUID NOT NULL,
      overtime_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      total_hours NUMERIC(5,2) NOT NULL,
      category TEXT,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      approved_by UUID,
      approved_at TIMESTAMPTZ,
      rejection_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS personal_agendas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      employee_id UUID NOT NULL,
      agenda_date DATE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      start_time TIME,
      end_time TIME,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL,
      account_type TEXT NOT NULL DEFAULT 'employee'
        CHECK (account_type IN ('employee','superadmin')),
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_account
    ON password_reset_tokens(account_type, account_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reimbursements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      employee_id UUID NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      expense_date DATE NOT NULL,
      amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
      description TEXT,
      attachment_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','rejected')),
      approved_by UUID,
      approved_at TIMESTAMPTZ,
      approval_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_reimbursements_company
    ON reimbursements(company_id, status)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      author_id UUID,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_announcements_company
    ON announcements(company_id, created_at DESC)
  `);

  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS image TEXT
  `);

  await pool.query(`
    ALTER TABLE departments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
  `);

  await pool.query(`
    ALTER TABLE positions ADD COLUMN IF NOT EXISTS reimbursement_limit NUMERIC(15,2) NOT NULL DEFAULT 0
  `);

  await pool.query(`
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS pic_name TEXT
  `);

  await pool.query(`
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS pic_email TEXT
  `);

  await pool.query(`
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_onboarding_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_company_onboarding_tokens_hash
    ON company_onboarding_tokens(token_hash)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      employee_id UUID NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_messages_company_created
    ON messages(company_id, created_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      sender_id UUID NOT NULL,
      recipient_id UUID NOT NULL,
      body TEXT NOT NULL,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_direct_messages_company_created
    ON direct_messages(company_id, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient_unread
    ON direct_messages(recipient_id, read_at)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      employee_id UUID NOT NULL,
      task_date DATE NOT NULL,
      title TEXT NOT NULL,
      done BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone VARCHAR(32)
  `);
  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS address TEXT
  `);
  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS birth_date DATE
  `);
  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender VARCHAR(10)
    CHECK (gender IN ('male','female'))
  `);
  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS marital_status VARCHAR(20)
    CHECK (marital_status IN ('single','married','divorced'))
  `);

  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS nik VARCHAR(16) UNIQUE
  `);

  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS npwp VARCHAR
  `);

  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS tempat_lahir VARCHAR
  `);

  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS no_telp VARCHAR
  `);

  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR
  `);

  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_relation VARCHAR
  `);

  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR
  `);

  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS alamat_ktp TEXT
  `);

  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS agama VARCHAR
  `);

  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS pendidikan_terakhir VARCHAR
  `);

  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS no_rekening VARCHAR
  `);

  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS nama_bank VARCHAR
  `);

  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS golongan_darah VARCHAR
  `);

  await pool.query(`
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_face_references (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      face_descriptor JSONB,
      image_url TEXT,
      cloudinary_public_id TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    ALTER TABLE employee_face_references
    ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT
  `);

  await pool.query(`
    ALTER TABLE employee_face_references
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true
  `);

  await pool.query(`
    ALTER TABLE employee_face_references
    ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved'
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_face_ref_review_status
    ON employee_face_references(review_status)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_employee_date
    ON tasks(employee_id, task_date)
  `);

  await pool.query(`
    ALTER TABLE office_locations ADD COLUMN IF NOT EXISTS address TEXT
  `);

  await pool.query(`
    ALTER TABLE office_locations
    ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'kantor_pusat'
  `);

  await pool.query(`
    ALTER TABLE office_locations ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true
  `);

  await pool.query(`
    ALTER TABLE shifts ADD COLUMN IF NOT EXISTS checkin_window_minutes INT
  `);

  await pool.query(`
    ALTER TABLE attendances ADD COLUMN IF NOT EXISTS late_minutes INT NOT NULL DEFAULT 0
  `);

  await pool.query(`
    ALTER TABLE attendances ADD COLUMN IF NOT EXISTS early_clock_out BOOLEAN NOT NULL DEFAULT false
  `);

  await pool.query(`
    ALTER TABLE attendances ADD COLUMN IF NOT EXISTS clock_out_kind TEXT NOT NULL DEFAULT 'in_range'
  `);

  await pool.query(`
    ALTER TABLE attendances ADD COLUMN IF NOT EXISTS clock_out_note TEXT
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_attendances_employee_date
    ON attendances(employee_id, clock_in_time)
  `);
}