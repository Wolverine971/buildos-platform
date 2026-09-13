// scripts/agentic/calendar-setup.ts
// One-time Calendar provisioning helper for the Agentic Chat gate.
//
// The gate boots web on an ephemeral loopback port, which can never be a
// registered Google redirect URI. The QA Calendar connection is therefore
// established ONCE against a fixed origin and read from the isolated database
// by every later gate run. This script boots that fixed origin, tells the
// operator exactly what to click, and waits for the rows the gate preflight
// requires -- so a half-finished consent cannot be mistaken for a connection.
//
//   AGENTIC_GATE_ENV_FILE=.env.agentic-gate.local pnpm agentic:calendar-setup
//   AGENTIC_GATE_ENV_FILE=.env.agentic-gate.local pnpm agentic:calendar-setup --check
//
// --check runs the same assertions the gate runs, without booting anything.
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { assertGateCalendarConfiguration, assertGateCalendarConnection } from './preflight';

const root = fileURLToPath(new URL('../../', import.meta.url));
const PORT = Number(process.env.AGENTIC_CALENDAR_SETUP_PORT ?? 5173);
const ORIGIN = `http://localhost:${PORT}`;
const REDIRECT_URI = `${ORIGIN}/auth/google/calendar-callback`;
const checkOnly = process.argv.includes('--check');

function loadIsolatedEnv(): Record<string, string> {
	const envPath = process.env.AGENTIC_GATE_ENV_FILE;
	if (!envPath)
		throw new Error(
			'Set AGENTIC_GATE_ENV_FILE to the isolated gate env file (see docs/testing/agentic-chat-gate.md).'
		);
	const isolated = parse(readFileSync(resolve(root, envPath)));
	if (isolated.AGENTIC_GATE_DATABASE_ISOLATED !== 'true')
		throw new Error('The gate env file must declare AGENTIC_GATE_DATABASE_ISOLATED=true.');
	return isolated;
}

/** Report every missing piece at once; one-at-a-time discovery wastes a console trip. */
function reportConfiguration(isolated: Record<string, string>): string[] {
	const problems: string[] = [];
	try {
		assertGateCalendarConfiguration(isolated);
	} catch (error) {
		problems.push(String(error instanceof Error ? error.message : error));
	}
	if (
		isolated.PRIVATE_GOOGLE_CALENDAR_CLIENT_ID &&
		isolated.PRIVATE_GOOGLE_CALENDAR_CLIENT_ID === isolated.PRIVATE_GOOGLE_CLIENT_ID
	)
		problems.push(
			'PRIVATE_GOOGLE_CALENDAR_CLIENT_ID must be a dedicated Calendar OAuth client, not the login client.'
		);
	return problems;
}

async function connectionState(isolated: Record<string, string>) {
	try {
		await assertGateCalendarConnection(isolated);
		return { connected: true, detail: 'active connection with a readable source' };
	} catch (error) {
		return { connected: false, detail: error instanceof Error ? error.message : String(error) };
	}
}

async function main() {
	const isolated = loadIsolatedEnv();
	const problems = reportConfiguration(isolated);

	if (problems.length) {
		console.error('\n[calendar-setup] Calendar configuration is incomplete:\n');
		for (const problem of problems) console.error(`  - ${problem}`);
		console.error(
			[
				'',
				'Fix in the gate env file, then rerun:',
				'  1. Google Cloud Console -> Credentials -> Create OAuth client ID -> Web application.',
				'     Name it for QA, and register this authorized redirect URI exactly:',
				`       ${REDIRECT_URI}`,
				'     It MUST be a different client from PRIVATE_GOOGLE_CLIENT_ID.',
				'  2. Put its id/secret in PRIVATE_GOOGLE_CALENDAR_CLIENT_ID / _CLIENT_SECRET.',
				'  3. PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1 needs >= 32 UTF-8 bytes;',
				'     generate one with:  openssl rand -base64 48',
				''
			].join('\n')
		);
		process.exitCode = 1;
		return;
	}

	const before = await connectionState(isolated);
	if (before.connected) {
		console.info('[calendar-setup] Gate calendar already provisioned: ' + before.detail);
		return;
	}
	console.info(`[calendar-setup] Not connected yet: ${before.detail}`);
	if (checkOnly) {
		process.exitCode = 1;
		return;
	}

	const env: NodeJS.ProcessEnv = {
		...process.env,
		...isolated,
		NODE_ENV: 'development',
		NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --conditions=development`,
		PUBLIC_APP_URL: ORIGIN,
		VITE_HMR_PORT: 'auto'
	};
	// `localhost` rather than 127.0.0.1: Google refuses redirect URIs it was not
	// registered with, and the two spellings are different origins to Google.
	const web: ChildProcess = spawn(
		'pnpm',
		['exec', 'vite', 'dev', '--host', 'localhost', '--port', String(PORT), '--strictPort'],
		{ cwd: resolve(root, 'apps/web'), env, stdio: 'inherit' }
	);
	const stop = () => {
		if (!web.killed) web.kill('SIGTERM');
	};
	for (const signal of ['SIGINT', 'SIGTERM'] as const)
		process.once(signal, () => {
			stop();
			process.exit(130);
		});

	console.info(
		[
			'',
			'============================================================',
			'[calendar-setup] Isolated web app booting on ' + ORIGIN,
			'',
			'Do this once, in a browser:',
			`  1. Open ${ORIGIN}/auth/login`,
			`  2. Sign in as ${isolated.AGENTIC_TEST_USER_EMAIL}`,
			'     (password is AGENTIC_TEST_USER_PASSWORD in the gate env file)',
			`  3. Open ${ORIGIN}/profile?tab=calendar and connect Google Calendar`,
			'  4. Complete consent with the dedicated QA Google account',
			'     (NOT a production user; the current app requests full Calendar access,',
			'      including edits; this gate exercises reads only)',
			'',
			'This script polls the isolated database and exits as soon as an',
			'active connection with a readable source exists. Ctrl-C to abort.',
			'============================================================',
			''
		].join('\n')
	);

	const deadline = Date.now() + 20 * 60_000;
	let last = '';
	while (Date.now() < deadline) {
		await new Promise((done) => setTimeout(done, 5_000));
		const state = await connectionState(isolated);
		if (state.connected) {
			console.info(`\n[calendar-setup] Connected: ${state.detail}`);
			console.info('[calendar-setup] Now run the full gate:');
			console.info('  AGENTIC_GATE_ENV_FILE=.env.agentic-gate.local pnpm agentic:gate\n');
			stop();
			return;
		}
		if (state.detail !== last) {
			console.info(`[calendar-setup] waiting: ${state.detail}`);
			last = state.detail;
		}
	}
	stop();
	throw new Error('[calendar-setup] Timed out waiting for the QA calendar connection.');
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
