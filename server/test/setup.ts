import { afterAll } from 'vitest';
import { pool } from '../src/db/pool.js';

// Каждый файл тестов получает свой пул соединений; закрываем его, чтобы процесс завершился
afterAll(async () => {
  await pool.end();
});
