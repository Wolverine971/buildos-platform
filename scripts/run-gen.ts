// scripts/run-gen.ts
import { spawnSync } from 'node:child_process';

const commands: Record<string, string> = {
	all: 'gen:all',
	types: 'gen:types',
	schema: 'gen:schema',
	web: 'gen:web'
};

const requestedCommand = process.argv[2] ?? 'all';
const scriptName = commands[requestedCommand];

if (!scriptName) {
	console.error(`Unknown gen command: ${requestedCommand}`);
	console.error(`Available commands: ${Object.keys(commands).join(', ')}`);
	process.exit(1);
}

const result = spawnSync('pnpm', ['run', scriptName, ...process.argv.slice(3)], {
	stdio: 'inherit',
	shell: process.platform === 'win32'
});

if (result.error) {
	console.error(result.error.message);
	process.exit(1);
}

process.exit(result.status ?? 1);
