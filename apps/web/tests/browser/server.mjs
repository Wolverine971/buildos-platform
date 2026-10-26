// apps/web/tests/browser/server.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startFixtures } from './supabase-fixture.mjs';
if (process.env.BUILDOS_BROWSER_FIXTURE !== '1') throw new Error('Use the isolated browser runner');
const fixture = await startFixtures();
const child = spawn(
	process.execPath,
	[
		fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url)),
		'preview',
		'--host',
		'127.0.0.1',
		'--port',
		'4173',
		'--strictPort'
	],
	{ cwd: process.env.BUILDOS_BROWSER_APP_DIR, env: process.env, stdio: 'inherit' }
);
for (const signal of ['SIGTERM', 'SIGINT'])
	process.on(signal, () => {
		child.kill(signal);
		fixture.close();
	});
child.on('exit', (code) => {
	fixture.close();
	process.exitCode = code ?? 1;
});
