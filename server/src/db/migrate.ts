// Применяет новые миграции к базе из DATABASE_URL
import { pool } from './pool.js';
import { runMigrations } from './runMigrations.js';

const applied = await runMigrations();
for (const file of applied) console.log(`Применена миграция ${file}`);
console.log(applied.length ? `Готово, применено миграций: ${applied.length}` : 'Новых миграций нет');
await pool.end();
