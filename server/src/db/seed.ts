// Демо-данные: владелец demo@example.com и редактор anna@example.com (пароль у обоих demo1234),
// общая доска с задачами
import { pool } from './pool.js';
import { registerUser } from '../services/authService.js';
import { createBoard, getBoardDetails } from '../services/boardService.js';
import { addMember } from '../services/memberService.js';
import { createTask, type Priority } from '../services/taskService.js';

const DEMO_EMAIL = 'demo@example.com';

const { rowCount } = await pool.query('SELECT 1 FROM users WHERE email = $1', [DEMO_EMAIL]);
if (rowCount) {
  console.log(`Демо-пользователь ${DEMO_EMAIL} уже существует, пропускаю`);
} else {
  const user = await registerUser(DEMO_EMAIL, 'demo1234', 'Демо Пользователь');
  const anna = await registerUser('anna@example.com', 'demo1234', 'Анна Иванова');
  const board = await createBoard(user.id, 'Курсовая работа', 'Пример доски с задачами');
  await addMember(board.id, anna.email, 'editor');
  const { columns } = await getBoardDetails(board.id, 'owner');

  const tasks: [number, string, Priority, number | null][] = [
    [0, 'Написать введение', 'medium', user.id],
    [0, 'Нарисовать ER-диаграмму', 'high', anna.id],
    [0, 'Сделать обзор аналогов', 'low', null],
    [1, 'Реализовать REST API', 'high', user.id],
    [2, 'Утвердить тему', 'medium', anna.id],
  ];
  for (const [columnIndex, title, priority, assigneeId] of tasks) {
    await createTask(columns[columnIndex].id, user.id, { title, priority, assigneeId });
  }
  console.log(`Созданы пользователи ${DEMO_EMAIL} и ${anna.email} (пароль demo1234) и доска «${board.title}»`);
}

await pool.end();
