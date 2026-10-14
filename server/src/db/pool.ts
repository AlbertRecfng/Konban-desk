import pg from 'pg';
import { env } from '../config/env.js';

// DATE отдаём строкой 'YYYY-MM-DD', иначе pg превращает её в Date с часовым поясом
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

export type Db = pg.Pool | pg.PoolClient;

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

/** Собирает "col1 = $1, col2 = $2" из полей, у которых значение не undefined. */
export function buildSetClause(fields: Record<string, unknown>, firstIndex = 1) {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  return {
    sql: entries.map(([column], i) => `${column} = $${firstIndex + i}`).join(', '),
    params: entries.map(([, value]) => value),
  };
}
