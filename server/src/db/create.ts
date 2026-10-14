// Создаёт базу данных из DATABASE_URL, если её ещё нет
import pg from 'pg';
import { env } from '../config/env.js';

const url = new URL(env.DATABASE_URL);
const dbName = decodeURIComponent(url.pathname.slice(1));
if (!/^\w+$/.test(dbName)) throw new Error(`Недопустимое имя базы данных: "${dbName}"`);

url.pathname = '/postgres';
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (rowCount) {
    console.log(`База данных "${dbName}" уже существует`);
  } else {
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`База данных "${dbName}" создана`);
  }
} finally {
  await client.end();
}
