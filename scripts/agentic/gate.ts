// scripts/agentic/gate.ts
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';
import {
	assertSourceProvenance,
	readSourceProvenance
} from '../../packages/agentic-chat-runtime/src/provenance.mts';
import { evaluateGateScorecard } from './gate-policy';
import { writeGateLatencyAnalysis } from './latency-analysis';
import {
	prepareGateDatabase,
	assertGateCalendarConfiguration,
	assertGateCalendarConnection,
	assertGateModelAllowed
} from './preflight';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(
	root,
	process.env.AGENTIC_GATE_OUTPUT_DIR ??
		`output/agentic-gate/${new Date().toISOString().replace(/[:.]/g, '-')}`
);
mkdirSync(output, { recursive: true });
const diagnostic = process.env.AGENTIC_GATE_DIAGNOSTIC === 'true';
const repetitions = Number(process.env.AGENTIC_GATE_REPETITIONS ?? '3');
if (!Number.isSafeInteger(repetitions) || repetitions < 1)
	throw new Error('AGENTIC_GATE_REPETITIONS must be positive');
const testGate = process.env.PATH?.split(':')
	.map((dir) => resolve(dir, 'test-gate'))
	.find(existsSync);
const processes: ChildProcess[] = [];
const evidence: Record<string, unknown> = {
	startedAt: new Date().toISOString(),
	repetitions,
	diagnostic,
	status: 'running',
	provenance: readSourceProvenance(root)
};
let stopping = false;

function gateEnvPath(): string | undefined {
	if (process.env.AGENTIC_GATE_ENV_FILE?.trim()) return process.env.AGENTIC_GATE_ENV_FILE.trim();
	const localEnvPath = resolve(root, '.env.local');
	if (!existsSync(localEnvPath)) return undefined;
	return parse(readFileSync(localEnvPath)).AGENTIC_GATE_ENV_FILE?.trim() || undefined;
}

async function stop() {
	if (stopping) return;
	stopping = true;
	for (const child of processes)
		if (child.exitCode === null && child.pid) {
			try {
				process.kill(-child.pid, 'SIGTERM');
			} catch {
				/* already exited */
			}
		}
	await Promise.all(
		processes.map(
			(child) =>
				new Promise<void>((done) => {
					if (child.exitCode !== null) return done();
					const timer = setTimeout(() => {
						if (child.pid)
							try {
								process.kill(-child.pid, 'SIGKILL');
							} catch {
								/* exited */
							}
						done();
					}, 30_000);
					child.once('exit', () => {
						clearTimeout(timer);
						done();
					});
				})
		)
	);
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
	process.once(signal, () => {
		void stop().then(() => process.exit(130));
	});

function start(label: string, args: string[], env: NodeJS.ProcessEnv, cwd = root, gated = false) {
	console.info(`[agentic:gate] ${label}`);
	const log = createWriteStream(resolve(output, `${label}.log`));
	const child = spawn(
		gated && testGate ? testGate : 'pnpm',
		gated && testGate ? ['run', 'pnpm', ...args] : args,
		{ cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
	);
	child.stdout!.pipe(log, { end: false });
	child.stderr!.pipe(log, { end: false });
	child.once('error', (error) => log.end(String(error)));
	child.once('close', () => log.end());
	processes.push(child);
	return child;
}
async function run(label: string, args: string[], env = process.env, cwd = root): Promise<number> {
	for (let attempt = 0; attempt < 2; attempt++) {
		const child = start(attempt ? `${label}-retry` : label, args, env, cwd, true);
		const code = await new Promise<number>((done, reject) => {
			child.once('error', reject);
			child.once('exit', (code) => done(code ?? 1));
		});
		if (code !== 75 || attempt === 1) return code;
		console.info(
			'[agentic:gate] test-gate refused; waiting 60 seconds before the single allowed retry'
		);
		await new Promise((done) => setTimeout(done, 60_000));
	}
	return 1;
}
async function port() {
	const server = createServer();
	await new Promise<void>((done, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', done);
	});
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Could not allocate gate port');
	await new Promise<void>((done) => server.close(() => done()));
	return address.port;
}
async function ready(url: string, child: ChildProcess) {
	const deadline = Date.now() + 180_000;
	while (Date.now() < deadline) {
		if (child.exitCode !== null)
			throw new Error(`Service exited before readiness: ${url}; inspect ${output}`);
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
			if (response.ok) return await response.json();
		} catch {
			/* startup */
		}
		await new Promise((done) => setTimeout(done, 1_000));
	}
	throw new Error(`Service readiness timed out: ${url}; inspect ${output}`);
}

async function main() {
	try {
		// These oracle guards are required even when the live environment is missing.
		const oracleExit = await run('oracle', [
			'--filter',
			'@buildos/web',
			'exec',
			'vitest',
			'run',
			'src/lib/tests/agentic-e2e/harness',
			'src/lib/tests/agentic-e2e/scenarios/cedar-house/cedar-house.test.ts',
			'src/lib/tests/agentic-e2e/scenarios/cedar-house/budget-absence.test.ts'
		]);
		if (oracleExit)
			throw new Error(`Battery oracle tests failed (${oracleExit}); see oracle.log`);
		const diagnosticsExit = await run('diagnostics-oracle', [
			'exec',
			'node',
			'--import',
			'tsx',
			'--test',
			'scripts/agentic/http-trace.test.mjs',
			'scripts/agentic/latency-analysis.test.ts'
		]);
		if (diagnosticsExit)
			throw new Error(
				`Gate diagnostics tests failed (${diagnosticsExit}); see diagnostics-oracle.log`
			);
		const envPath = gateEnvPath();
		if (!envPath)
			throw new Error(
				'Set AGENTIC_GATE_ENV_FILE to an isolated test-database env file. Ports alone do not isolate the shared chat queue. See docs/testing/agentic-chat-gate.md.'
			);
		const isolated = parse(readFileSync(resolve(root, envPath)));
		if (isolated.AGENTIC_GATE_DATABASE_ISOLATED !== 'true')
			throw new Error(
				'The gate env file must declare AGENTIC_GATE_DATABASE_ISOLATED=true for a dedicated test database with no other chat workers.'
			);
		for (const key of [
			'PUBLIC_SUPABASE_URL',
			'PUBLIC_SUPABASE_ANON_KEY',
			'PRIVATE_SUPABASE_SERVICE_KEY',
			'PRIVATE_OPENROUTER_API_KEY',
			'AGENTIC_TEST_USER_EMAIL',
			'AGENTIC_TEST_USER_PASSWORD'
		]) {
			if (!isolated[key]?.trim()) throw new Error(`Gate env file is missing ${key}`);
		}
		// Refuse models outside the cost allowlist before any service boots or model spends.
		const gateModel = assertGateModelAllowed(isolated);
		console.info(
			`[agentic:gate] acting model ${gateModel.model}; known three-repetition spend ${gateModel.knownRunCostUsd === null ? 'unknown' : `about $${gateModel.knownRunCostUsd.toFixed(2)}`}`
		);
		// Refuse accidental reuse of the normal development/production queue.
		for (const file of ['apps/web/.env', 'apps/worker/.env']) {
			if (
				existsSync(resolve(root, file)) &&
				parse(readFileSync(resolve(root, file))).PUBLIC_SUPABASE_URL ===
					isolated.PUBLIC_SUPABASE_URL
			)
				throw new Error(
					'Gate database matches the normal app database; provide a separate test project.'
				);
		}
		evidence.preflight = await prepareGateDatabase(isolated);
		try {
			assertGateCalendarConfiguration(isolated);
			await assertGateCalendarConnection(isolated);
		} catch (error) {
			evidence.setupFailure = String(error);
			if (!diagnostic) throw error;
			console.info(
				'[agentic:gate] DIAGNOSTIC ONLY: Calendar setup incomplete; this run cannot pass the release gate'
			);
		}
		// Rebuild dependencies that resolve to dist even under development conditions.
		const buildExit = await run('dependencies', [
			'exec',
			'turbo',
			'build',
			'--filter=@buildos/worker^...',
			'--concurrency=1'
		]);
		if (buildExit) throw new Error(`Dependency build failed (${buildExit})`);
		const expected = readSourceProvenance(root);
		evidence.provenance = expected;
		const webPort = await port();
		let workerPort = await port();
		while (workerPort === webPort) workerPort = await port();
		const baseUrl = `http://127.0.0.1:${webPort}`;
		const workerUrl = `http://127.0.0.1:${workerPort}`;
		const env: NodeJS.ProcessEnv = {
			...process.env,
			...isolated,
			NODE_ENV: 'development',
			NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --conditions=development --import=${new URL('./http-trace.mjs', import.meta.url).href}`,
			AGENTIC_GATE_HTTP_TRACE: 'true',
			CHAT_MUTATION_BATCH_LANE: 'true',
			AGENTIC_CHAT_LOCAL_PROMPT_DUMPS: 'true',
			AGENTIC_CHAT_LOCAL_PROMPT_DUMP_DIRECTORY: resolve(output, 'provider-passes'),
			AGENTIC_CHAT_TRANSPORT_LEASE_SECRET: randomBytes(32).toString('hex'),
			PRIVATE_RAILWAY_WORKER_TOKEN: randomBytes(32).toString('hex'),
			PRIVATE_AGENTIC_CHAT_WORKER_URL: workerUrl,
			AGENTIC_E2E_BASE_URL: baseUrl,
			VITE_HMR_PORT: 'auto',
			AGENTIC_BATTERY: 'cedar-house',
			AGENTIC_SCENARIOS: diagnostic
				? (process.env.AGENTIC_GATE_DIAGNOSTIC_SCENARIOS ?? '')
				: '',
			AGENTIC_E2E_RETRY_COUNT: '0',
			AGENTIC_ASSERT_TELEMETRY: 'true',
			AGENTIC_PHASE0_CAPTURE: 'false',
			AGENTIC_GATE_EVIDENCE_DIR: resolve(output, 'turns'),
			AGENTIC_PHASE0_REPETITIONS: String(repetitions),
			AGENTIC_E2E_WORKER_PREFLIGHT_ONLY: 'false',
			AGENTIC_BATTERY_OUTPUT_PATH: resolve(output, 'scorecard.json'),
			...(diagnostic && process.env.AGENTIC_GATE_PROVIDER_ORDER
				? {
						AGENTIC_CHAT_OPENROUTER_PROVIDER_ORDER:
							process.env.AGENTIC_GATE_PROVIDER_ORDER
					}
				: {}),
			...(diagnostic && process.env.AGENTIC_GATE_PROVIDER_SORT
				? {
						AGENTIC_CHAT_OPENROUTER_PROVIDER_SORT:
							process.env.AGENTIC_GATE_PROVIDER_SORT
					}
				: {})
		};
		const worker = start(
			'worker',
			['exec', 'node', '--import', 'tsx', 'src/chat-worker.ts'],
			{ ...env, PORT: String(workerPort) },
			resolve(root, 'apps/worker')
		);
		const web = start(
			'web',
			[
				'exec',
				'vite',
				'dev',
				'--host',
				'127.0.0.1',
				'--port',
				String(webPort),
				'--strictPort'
			],
			env,
			resolve(root, 'apps/web')
		);
		const [workerHealth, webHealth] = await Promise.all([
			ready(`${workerUrl}/health`, worker),
			ready(`${baseUrl}/__agentic/provenance`, web)
		]);
		assertSourceProvenance(expected, workerHealth.provenance, 'Worker startup');
		assertSourceProvenance(expected, webHealth.provenance, 'Web startup');
		evidence.routing = {
			model: env.AGENTIC_CHAT_OPENROUTER_MODEL,
			providerOrder: env.AGENTIC_CHAT_OPENROUTER_PROVIDER_ORDER ?? null,
			providerSort: env.AGENTIC_CHAT_OPENROUTER_PROVIDER_SORT ?? null
		};
		evidence.services = { worker: workerHealth, web: webHealth, baseUrl, workerUrl };
		const exitCode = await run(
			'battery',
			['--filter', '@buildos/web', 'test:agentic:battery'],
			env
		);
		const scorecard = JSON.parse(readFileSync(resolve(output, 'scorecard.json'), 'utf8'));
		const failures = evaluateGateScorecard(scorecard, repetitions);
		if (diagnostic) failures.unshift('Diagnostic run: not a release gate');
		if (repetitions < 3) failures.unshift('Release gate requires at least three repetitions');
		assertSourceProvenance(expected, readSourceProvenance(root), 'Checkout after battery');
		evidence.summary = scorecard.summary;
		evidence.failures = failures;
		if (exitCode || failures.length)
			throw new Error(`Battery gate failed (${exitCode}): ${failures.join('; ')}`);
		evidence.status = 'passed';
	} catch (error) {
		evidence.status = 'failed';
		evidence.error = error instanceof Error ? error.message : String(error);
		console.error(`[agentic:gate] ${evidence.error}`);
		process.exitCode = 1;
	} finally {
		await stop();
		try {
			writeGateLatencyAnalysis(output);
		} catch (error) {
			console.warn('[agentic:gate] Latency analysis unavailable:', String(error));
		}
		evidence.finishedAt = new Date().toISOString();
		writeFileSync(resolve(output, 'gate.json'), JSON.stringify(evidence, null, 2) + '\n');
		console.info(`[agentic:gate] ${evidence.status}: ${output}`);
	}
}
void main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
