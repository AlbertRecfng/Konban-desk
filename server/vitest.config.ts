import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Тесты работают с отдельной базой: имя основной базы + "_test" (или TEST_DATABASE_URL).
// Переменные задаются до загрузки приложения, а .env не перезаписывает уже заданные.
try {
  process.loadEnvFile(path.join(import.meta.dirname, '.env'));
} catch {
  // .env необязателен, если переменные заданы в окружении
}
const testUrl = new URL(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/kanban');
if (!process.env.TEST_DATABASE_URL) testUrl.pathname = `${testUrl.pathname}_test`;
process.env.DATABASE_URL = testUrl.toString();
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-secret-for-automated-tests';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: './test/globalSetup.ts',
    setupFiles: ['./test/setup.ts'],
    // Файлы работают с одной базой; по очереди проще разбирать падения
    fileParallelism: false,
  },
});
