import pg from 'pg';

function envBool(key: string, fallback = false): boolean {
  const v = String(process.env[key] || '').trim().toLowerCase();
  if (!v) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v);
}

export function getOdooDatabaseUrl(): string {
  return String(process.env.ODOO_DATABASE_URL || '').trim();
}

export function isOdooEnabled(): boolean {
  return Boolean(getOdooDatabaseUrl());
}

export function isOdooReadOnly(): boolean {
  return envBool('ODOO_READ_ONLY', true);
}

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  const url = getOdooDatabaseUrl();
  if (!url) {
    throw new Error('ODOO_DATABASE_URL no configurada');
  }
  if (!pool) {
    pool = new pg.Pool({
      connectionString: url,
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // El rol BI tiene search_path=bi_pub_operac; forzamos public.
      options: '-c search_path=public',
    });
    pool.on('error', (err) => {
      console.error('[odoo] pool error', err);
    });
  }
  return pool;
}

export async function odooQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function odooHealth(): Promise<{
  ok: boolean;
  readOnly: boolean;
  name?: string;
  error?: string;
}> {
  if (!isOdooEnabled()) {
    return { ok: false, readOnly: isOdooReadOnly(), error: 'ODOO_DATABASE_URL no configurada' };
  }
  try {
    const rows = await odooQuery<{ db: string }>('SELECT current_database() AS db');
    return { ok: true, readOnly: isOdooReadOnly(), name: rows[0]?.db };
  } catch (error) {
    return {
      ok: false,
      readOnly: isOdooReadOnly(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function closeOdooPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
