const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE.replace(/ssl=[^&]+/, '') });

async function verifyColumns() {
  try {
    // Check companies table
    const companies = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'companies' ORDER BY ordinal_position");
    console.log('companies columns:');
    companies.rows.forEach(r => console.log('  ' + r.column_name + ' (' + r.data_type + ')'));
    
    // Check employee_face_references table
    const faceRefs = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'employee_face_references' ORDER BY ordinal_position");
    console.log('\\nemployee_face_references columns:');
    faceRefs.rows.forEach(r => console.log('  ' + r.column_name + ' (' + r.data_type + ')'));
    
    // Check attendances table
    const attendances = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'attendances' ORDER BY ordinal_position");
    console.log('\\nattendances columns:');
    attendances.rows.forEach(r => console.log('  ' + r.column_name + ' (' + r.data_type + ')'));
    
    console.log('\\n✓ All column checks completed');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

verifyColumns();