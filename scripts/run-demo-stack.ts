import { spawn } from 'node:child_process';

// Regenerates the fictional demo dataset and runs the mock stack on it.
const generate = Bun.spawnSync(['bun', 'scripts/generate-demo-data.ts', '.demo'], { stdio: ['inherit', 'inherit', 'inherit'] });
if (generate.exitCode !== 0) process.exit(generate.exitCode ?? 1);

const child = spawn('bun', ['run', 'dev:mock'], {
  cwd: process.cwd(),
  env: { ...process.env, MOCK_SCAN_ROOT: '.demo/scan-root', MOCK_DATA_DIR: '.demo/data' },
  stdio: 'inherit'
});

child.on('exit', (code) => process.exit(code ?? 1));
