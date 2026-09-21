// scripts/agentic/workflow-prototype.ts
// Local pilot runner. Uses only the isolated QA database; never the normal app queue.
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';
import { prepareGateDatabase } from './preflight';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(
	root,
	process.env.WORKFLOW_PROTOTYPE_OUTPUT_DIR ?? 'output/workflow-prototype'
);
mkdirSync(output, { recursive: true });
const children: ChildProcess[] = [];
const testGate = process.env.PATH?.split(':')
	.map((dir) => resolve(dir, 'test-gate'))
	.find(existsSync);
function stop() {
	for (const child of children)
		if (child.pid && child.exitCode === null) {
			try {
				process.kill(-child.pid, 'SIGTERM');
			} catch {
				/* already stopped */
			}
		}
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
	process.once(signal, () => {
		stop();
		process.exit(130);
	});
function start(label: string, args: string[], env: NodeJS.ProcessEnv, cwd: string) {
	const log = createWriteStream(resolve(output, `${label}.log`));
	const gated = label.startsWith('smoke') && testGate;
	const child = spawn(gated || 'pnpm', gated ? ['run', 'pnpm', ...args] : args, {
		cwd,
		env,
		detached: true,
		stdio: ['ignore', 'pipe', 'pipe']
	});
	children.push(child);
	child.stdout!.pipe(log, { end: false });
	child.stderr!.pipe(log, { end: false });
	child.once('close', () => log.end());
	child.once('error', () => {
		console.error(`${label} could not start`);
		stop();
		process.exitCode = 1;
	});
	return child;
}
async function ready(url: string, child: ChildProcess) {
	const deadline = Date.now() + 90_000;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) throw new Error(`Service exited; inspect ${output} logs`);
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
			if (response.ok) return;
		} catch {
			/* starting */
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error('Service did not become ready');
}
async function main() {
	const envPath = process.env.AGENTIC_GATE_ENV_FILE;
	if (!envPath) throw new Error('Set AGENTIC_GATE_ENV_FILE to the isolated QA env file.');
	const isolated = parse(readFileSync(resolve(root, envPath)));
	if (isolated.AGENTIC_GATE_DATABASE_ISOLATED !== 'true')
		throw new Error('An isolated QA database is required.');
	for (const file of ['apps/web/.env', 'apps/worker/.env']) {
		if (
			existsSync(resolve(root, file)) &&
			parse(readFileSync(resolve(root, file))).PUBLIC_SUPABASE_URL ===
				isolated.PUBLIC_SUPABASE_URL
		)
			throw new Error('Refusing to use the normal app database.');
	}
	const login = await fetch(`${isolated.PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
		method: 'POST',
		headers: { apikey: isolated.PUBLIC_SUPABASE_ANON_KEY!, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: isolated.AGENTIC_TEST_USER_EMAIL,
			password: isolated.AGENTIC_TEST_USER_PASSWORD
		}),
		signal: AbortSignal.timeout(15_000)
	});
	if (!login.ok) throw new Error('QA account login failed');
	const auth = (await login.json()) as { user: { id: string } };
	await prepareGateDatabase(isolated);
	const port = Number(process.env.WORKFLOW_PROTOTYPE_PORT ?? 5188);
	const workerPort = port + 1;
	if (!Number.isSafeInteger(port) || port < 1024 || workerPort > 65535)
		throw new Error('Invalid prototype port');
	const baseUrl = `http://127.0.0.1:${port}`;
	const workerUrl = `http://127.0.0.1:${workerPort}`;
	const env = {
		...process.env,
		...isolated,
		NODE_ENV: 'development',
		NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --conditions=development`,
		AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS: auth.user.id,
		AGENTIC_CHAT_TRANSPORT_LEASE_SECRET: randomBytes(32).toString('hex'),
		PRIVATE_RAILWAY_WORKER_TOKEN: randomBytes(32).toString('hex'),
		PRIVATE_AGENTIC_CHAT_WORKER_URL: workerUrl,
		CHAT_CONCURRENCY: '2',
		PUBLIC_APP_URL: baseUrl,
		AGENTIC_E2E_BASE_URL: baseUrl,
		VITE_HMR_PORT: 'auto',
		WORKFLOW_PROTOTYPE_SMOKE: 'true',
		WORKFLOW_PROTOTYPE_EVIDENCE: resolve(output, 'smoke.json')
	};
	const worker = start(
		'worker',
		['exec', 'node', '--import', 'tsx', 'src/chat-worker.ts'],
		{ ...env, PORT: String(workerPort) },
		resolve(root, 'apps/worker')
	);
	const web = start(
		'web',
		['exec', 'vite', 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
		env,
		resolve(root, 'apps/web')
	);
	await Promise.all([
		ready(`${workerUrl}/health`, worker),
		ready(`${baseUrl}/__agentic/provenance`, web)
	]);
	console.info(`Workflow lab ready: ${baseUrl}/workflow-lab`);
	console.info(
		'Sign in using AGENTIC_TEST_USER_EMAIL / PASSWORD from the isolated env file. Ctrl-C stops both services.'
	);
	if (process.argv.includes('--smoke')) {
		let smoke = start(
			'smoke',
			[
				'--filter',
				'@buildos/web',
				'exec',
				'vitest',
				'run',
				'--config',
				'vitest.config.agentic.ts',
				'src/lib/tests/agentic-e2e/workflow-prototype.live.test.ts',
				'--retry=0'
			],
			env,
			root
		);
		let code = await new Promise<number>((resolve) =>
			smoke.once('exit', (code) => resolve(code ?? 1))
		);
		if (code === 75) {
			console.info('test-gate refused; waiting 60 seconds before one retry');
			await new Promise((resolve) => setTimeout(resolve, 60_000));
			smoke = start(
				'smoke-retry',
				[
					'--filter',
					'@buildos/web',
					'exec',
					'vitest',
					'run',
					'--config',
					'vitest.config.agentic.ts',
					'src/lib/tests/agentic-e2e/workflow-prototype.live.test.ts',
					'--retry=0'
				],
				env,
				root
			);
			code = await new Promise<number>((resolve) =>
				smoke.once('exit', (code) => resolve(code ?? 1))
			);
		}
		console.info(`Workflow smoke ${code === 0 ? 'passed' : 'failed'}; evidence in ${output}.`);
		if (code !== 0) process.exitCode = code;
	}
	console.info(
		'Services remain running for interactive testing. Do not run the gate against this database until they stop.'
	);
}
main().catch((error) => {
	console.error(error instanceof Error ? error.message : 'Prototype startup failed');
	stop();
	process.exitCode = 1;
});
