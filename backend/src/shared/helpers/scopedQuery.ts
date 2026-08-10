import { pool } from '../../config/database';

export async function queryScoped(companyId: string, sql: string, params: any[] = []) {
  return pool.query(sql, [companyId, ...params]);
}

// untuk query yang perlu lintas company (khusus Superadmin)
export async function queryUnscoped(sql: string, params: any[] = []) {
  return pool.query(sql, params);
}