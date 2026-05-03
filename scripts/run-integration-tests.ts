import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const composeArgs = ['compose', '-f', 'docker/compose.integration.yml', 'up', '--build', '--abort-on-container-exit', '--exit-code-from', 'test'];

if (process.platform === 'win32') {
  const repoPath = toWslPath(process.cwd());
  const command = `cd ${shellQuote(repoPath)} && docker ${composeArgs.map(shellQuote).join(' ')}`;
  runCommand('wsl', ['bash', '-lc', command]);
} else {
  runCommand('docker', composeArgs);
}

function toWslPath(input: string) {
  const normalized = path.resolve(input).replace(/\\/g, '/');
  const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)$/);

  if (!driveMatch) {
    return normalized;
  }

  const drive = driveMatch[1]!.toLowerCase();
  const rest = driveMatch[2]!;
  return `/mnt/${drive}/${rest}`;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function runCommand(command: string, args: string[]) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });
}
