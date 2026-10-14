// Перед запуском тестов пересоздаёт тестовую базу и применяет миграции
import pg from 'pg';

export default async function setup() {
  const url = new URL(process.env.DATABASE_URL!);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  // Защита от случайного удаления рабочей базы
  if (!/^\w+_test$/.test(dbName)) throw new Error(`Тесты запускаются только на базе с суффиксом _test, а не "${dbName}"`);

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  const { runMigrations } = await import('../src/db/runMigrations.js');
  const { pool } = await import('../src/db/pool.js');
  await runMigrations();
  await pool.end();
}
