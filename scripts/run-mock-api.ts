import { spawn } from 'node:child_process';
import { createMockEnv } from './mock-env';

const child = spawn('bun', ['--watch', 'apps/api/src/index.ts'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ...createMockEnv()
  },
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
