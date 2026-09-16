require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE,
  ssl: { rejectUnauthorized: false }
});

async function runMigrations() {
  try {
    // Ensure the face-reference table exists before applying compatibility fixes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_face_references (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        face_descriptor JSONB,
        image_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    console.log('✓ ensured employee_face_references table exists');

    // Fix 1: Add updated_at column to companies table
    await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ');
    console.log('✓ Added updated_at column to companies table');
    
    // Fix 2: Add cloudinary_public_id column to employee_face_references table
    await pool.query(
      'ALTER TABLE employee_face_references ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT'
    );
    console.log('✓ Added cloudinary_public_id column to employee_face_references table');

    // Fix 2b: Add active-state column used by face registration and verification
    await pool.query(
      'ALTER TABLE employee_face_references ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true'
    );
    console.log('✓ Added is_active column to employee_face_references table');
    
    // Fix 3: Add created_at column to attendances table if not exists
    await pool.query(
      "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attendances' AND column_name = 'created_at') THEN ALTER TABLE attendances ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now(); END IF; END \$\$;"
    );
    console.log('✓ ensured created_at column exists on attendances table');
    
    console.log('\nAll database migrations completed successfully!');
  } catch (err) {
    console.error('Migration error:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runMigrations();