import { spawn, type ChildProcess } from 'node:child_process';
import { createMockEnv } from './mock-env';

const children: ChildProcess[] = [];
let shuttingDown = false;
const mockEnv = createMockEnv();

children.push(spawn('bun', ['run', 'dev:mock:api'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit'
}));

children.push(spawn('bun', ['run', 'dev:web'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    VITE_API_PROXY_TARGET: `http://localhost:${mockEnv.PORT}`
  },
  stdio: 'inherit'
}));

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    for (const sibling of children) {
      if (sibling.pid && !sibling.killed) {
        sibling.kill();
      }
    }

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    for (const child of children) {
      if (child.pid && !child.killed) {
        child.kill(signal);
      }
    }
  });
}
