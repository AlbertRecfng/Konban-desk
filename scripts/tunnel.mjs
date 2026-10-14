// Запускает Cloudflare Tunnel к http://localhost:4000 (npm run tunnel).
// Если cloudflared нет в PATH (например, терминал открыт до установки), ищет его в стандартных папках.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const KNOWN_PATHS = [
  'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  'C:\\Program Files\\cloudflared\\cloudflared.exe',
];
const args = ['tunnel', '--no-autoupdate', '--url', 'http://localhost:4000'];

function run(command, fallbacks) {
  const child = spawn(command, args, { stdio: 'inherit' });
  child.on('error', (error) => {
    if (error.code !== 'ENOENT') throw error;
    const next = fallbacks.find((path) => existsSync(path));
    if (next) {
      run(next, []);
      return;
    }
    console.error('cloudflared не найден. Установите его командой:');
    console.error('  winget install --id Cloudflare.cloudflared');
    console.error('и перезапустите терминал (в VS Code - перезапустите VS Code целиком).');
    process.exit(1);
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

run('cloudflared', KNOWN_PATHS);
