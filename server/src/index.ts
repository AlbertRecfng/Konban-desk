import { createApp } from './app.js';
import { env } from './config/env.js';
import { attachRealtime } from './realtime.js';

const server = createApp().listen(env.PORT, () => {
  console.log(`API запущен: http://localhost:${env.PORT}/api`);
});
attachRealtime(server);
