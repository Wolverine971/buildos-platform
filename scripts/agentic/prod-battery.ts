// scripts/agentic/prod-battery.ts
//
// Deployed-stack battery: the 13-case Cedar House battery sent through
// production (Vercel web, Railway chat worker, production Supabase) as the
// dedicated harness account. It starts no local services. It proves what users
// get after a deploy; since the QA database was retired (2026-09-24) it is the only
// live check. See docs/testing/agentic-chat-gate.md.
//
//   pnpm agentic:prod-battery --preflight-only   # free: target, model, deploy, calendar
//   pnpm agentic:prod-battery --confirm-prod     # paid: the full three-repetition run
//   pnpm agentic:prod-battery --confirm-prod --cases=1,2,14   # paid: selected cases only
//
// Paid: it spends production model budget. Run it only with the user's explicit
// approval for that run (AGENTS.md).
import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import type { SourceProvenance } from '@buildos/agentic-chat-runtime/provenance';
import { evaluateGateScorecard } from './gate-policy';
import { assertGateModelAllowed } from './preflight';
import {
	DEFAULT_PROD_WEB_URL,
	DEFAULT_PROD_WORKER_URL,
	assertDeploymentUnchanged,
	CEDAR_SCENARIO_IDS,
	assertProdBatteryTarget,
	deployedProvenance,
	evaluateCaseSubset,
	failedTurnStreamRunIds,
	parseCaseSelection,
	parseVercelProductionDeployment
} from './prod-battery-policy';

const root = fileURLToPath(new URL('../../', import.meta.url));
const startedAt = new Date();
const output = resolve(
	root,
	process.env.AGENTIC_PROD_BATTERY_OUTPUT_DIR ??
		`output/agentic-prod-battery/${startedAt.toISOString().replace(/[:.]/g, '-')}`
);
mkdirSync(output, { recursive: true });
const repetitions = Number(process.env.AGENTIC_PROD_BATTERY_REPETITIONS ?? '3');
const webUrl = (process.env.AGENTIC_PROD_WEB_URL ?? DEFAULT_PROD_WEB_URL).replace(/\/$/, '');
const workerUrl = (process.env.AGENTIC_PROD_WORKER_URL ?? DEFAULT_PROD_WORKER_URL).replace(
	/\/$/,
	''
);
const evidence: Record<string, unknown> = {
	kind: 'agentic_chat_deployed_battery',
	startedAt: startedAt.toISOString(),
	repetitions,
	target: { webUrl, workerUrl },
	status: 'running'
};
const testGate = process.env.PATH?.split(':')
	.map((dir) => resolve(dir, 'test-gate'))
	.find(existsSync);

function readEnvFile(path: string): Record<string, string> {
	const absolute = resolve(root, path);
	if (!existsSync(absolute)) throw new Error(`Missing env file ${path}`);
	return parse(readFileSync(absolute));
}

async function getJson(url: string, init: RequestInit = {}): Promise<any> {
	const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
	const text = await response.text();
	if (!response.ok)
		throw new Error(`${url.split('?')[0]} → ${response.status}: ${text.slice(0, 200)}`);
	return text ? JSON.parse(text) : null;
}

/** Vercel CLI login or VERCEL_TOKEN; project and team from the linked `.vercel/project.json`. */
async function readWebDeployment() {
	const project = JSON.parse(readFileSync(resolve(root, '.vercel/project.json'), 'utf8')) as {
		orgId: string;
	};
	const token =
		process.env.VERCEL_TOKEN ??
		(JSON.parse(
			readFileSync(
				resolve(homedir(), 'Library/Application Support/com.vercel.cli/auth.json'),
				'utf8'
			)
		).token as string);
	const host = new URL(webUrl).host;
	return parseVercelProductionDeployment(
		await getJson(
			`https://api.vercel.com/v13/deployments/${host}?teamId=${encodeURIComponent(project.orgId)}`,
			{ headers: { Authorization: `Bearer ${token}` } }
		)
	);
}

async function readDeployed() {
	const [health, web] = await Promise.all([getJson(`${workerUrl}/health`), readWebDeployment()]);
	// `web` from deployedProvenance is the web provenance; the raw Vercel record is `vercel`.
	return { ...deployedProvenance(health, web), health, vercel: web };
}

/** The acting model the production worker is configured with; the cost allowlist applies to it. */
function readProductionActingModel(): string {
	if (process.env.AGENTIC_PROD_BATTERY_ACTING_MODEL?.trim())
		return process.env.AGENTIC_PROD_BATTERY_ACTING_MODEL.trim();
	try {
		const raw = execFileSync(
			'railway',
			['variables', '--service', 'agentic-chat-worker', '--json'],
			{ cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
		);
		const model = (JSON.parse(raw) as Record<string, string>).AGENTIC_CHAT_OPENROUTER_MODEL;
		if (model?.trim()) return model.trim();
	} catch {
		/* reported below */
	}
	throw new Error(
		'Could not read the production acting model from Railway (railway login, service agentic-chat-worker). Set AGENTIC_PROD_BATTERY_ACTING_MODEL to the model you approved.'
	);
}

function serviceRest(app: Record<string, string>) {
	const key = app.PRIVATE_SUPABASE_SERVICE_KEY!;
	return (path: string, init: RequestInit = {}) =>
		getJson(`${app.PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
			...init,
			headers: {
				apikey: key,
				Authorization: `Bearer ${key}`,
				'Content-Type': 'application/json',
				...(init.headers ?? {})
			}
		});
}

/**
 * Metadata only; Case 10 still has to prove a complete Google read. Either
 * connection kind counts: nearly every production user is on the single-calendar
 * flow (`user_calendar_tokens`); the multi-calendar flow is allowlisted per user.
 */
async function assertCalendarConnected(rest: ReturnType<typeof serviceRest>, userId: string) {
	const connections = await rest(
		`user_calendar_connections?select=id&user_id=eq.${userId}&provider=eq.google_calendar&status=eq.active&deleted_at=is.null`
	);
	if (connections.length) {
		const sources = await rest(
			`user_calendar_sources?select=id&user_id=eq.${userId}&connection_id=in.(${connections.map((row: { id: string }) => row.id).join(',')})&read_enabled=eq.true&deleted_at=is.null&provider_deleted_at=is.null`
		);
		if (!sources.length) throw new Error('The harness account has no readable calendar source');
		return {
			flow: 'multi_calendar',
			connections: connections.length,
			readableSources: sources.length
		};
	}
	const tokens = await rest(`user_calendar_tokens?select=user_id&user_id=eq.${userId}`);
	if (tokens.length) return { flow: 'single_calendar', connections: tokens.length };
	throw new Error(
		`The harness account has no Google Calendar connection in production. Sign in at ${webUrl}/profile?tab=calendar as the harness account and connect the dedicated QA Google account, then rerun.`
	);
}

/** Hard-delete every project the harness account owns; children cascade. Verified empty. */
async function deleteHarnessProjects(rest: ReturnType<typeof serviceRest>, actorId: string) {
	const deleted = await rest(`onto_projects?created_by=eq.${actorId}&select=id`, {
		method: 'DELETE',
		headers: { Prefer: 'return=representation' }
	});
	const remaining = await rest(`onto_projects?created_by=eq.${actorId}&select=id`);
	if (remaining.length) throw new Error(`${remaining.length} harness projects survived cleanup`);
	return deleted.length as number;
}

/** Deletes the run's chat sessions through the product's own delete path, as the harness account. */
async function deleteRunChatSessions(
	app: Record<string, string>,
	rest: ReturnType<typeof serviceRest>,
	credentials: { email: string; password: string; userId: string },
	since: string
) {
	const session = await getJson(`${app.PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
		method: 'POST',
		headers: { apikey: app.PUBLIC_SUPABASE_ANON_KEY!, 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: credentials.email, password: credentials.password })
	});
	const sessions = await rest(
		`chat_sessions?select=id&user_id=eq.${credentials.userId}&created_at=gte.${encodeURIComponent(since)}`
	);
	const failures: string[] = [];
	for (const { id } of sessions as Array<{ id: string }>) {
		try {
			await getJson(`${app.PUBLIC_SUPABASE_URL}/rest/v1/rpc/delete_my_chat_session`, {
				method: 'POST',
				headers: {
					apikey: app.PUBLIC_SUPABASE_ANON_KEY!,
					Authorization: `Bearer ${session.access_token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ p_session_id: id })
			});
		} catch (error) {
			failures.push(`${id}: ${String(error).slice(0, 160)}`);
		}
	}
	const remaining = await rest(
		`chat_sessions?select=id&user_id=eq.${credentials.userId}&created_at=gte.${encodeURIComponent(since)}`
	);
	return { found: sessions.length as number, remaining: remaining.length as number, failures };
}

/**
 * Copies the durable rows of each failed turn into `failed-turn-rows/` before
 * cleanup deletes them: the turn run, its semantic events (reviewer
 * rejections, terminal reason), tool executions (reviewer arguments) and usage
 * rows. Harness-account rows only; best effort, so a read failure is recorded
 * and never masks the battery result.
 */
async function captureFailedTurnRows(
	rest: ReturnType<typeof serviceRest>,
	userId: string,
	streamRunIds: readonly string[],
	output: string
) {
	const directory = resolve(output, 'failed-turn-rows');
	const captured: string[] = [];
	const failures: string[] = [];
	for (const streamRunId of streamRunIds) {
		try {
			const id = encodeURIComponent(streamRunId);
			const turnRuns = await rest(`chat_turn_runs?select=*&stream_run_id=eq.${id}`);
			const owned = (turnRuns as Array<{ user_id?: string }>).every(
				(row) => row.user_id === undefined || row.user_id === userId
			);
			if (!owned) throw new Error('turn run is not the harness account');
			const [events, toolExecutions, usage] = await Promise.all([
				rest(`chat_turn_events?select=*&stream_run_id=eq.${id}&order=created_at.asc`),
				rest(`chat_tool_executions?select=*&stream_run_id=eq.${id}&order=created_at.asc`),
				rest(
					`llm_usage_logs?select=*&stream_run_id=eq.${id}&user_id=eq.${userId}&order=created_at.asc`
				)
			]);
			mkdirSync(directory, { recursive: true });
			writeFileSync(
				resolve(directory, `${streamRunId}.json`),
				JSON.stringify({ streamRunId, turnRuns, events, toolExecutions, usage }, null, 2) +
					'\n'
			);
			captured.push(streamRunId);
		} catch (error) {
			failures.push(`${streamRunId}: ${String(error).slice(0, 160)}`);
		}
	}
	return { captured, failures };
}

async function openRouterUsage(key: string): Promise<number | null> {
	try {
		return (
			await getJson('https://openrouter.ai/api/v1/key', {
				headers: { Authorization: `Bearer ${key}` }
			})
		).data.usage as number;
	} catch {
		return null;
	}
}

function runBattery(env: NodeJS.ProcessEnv): Promise<number> {
	const attempt = (label: string) =>
		new Promise<number>((done, reject) => {
			console.info(`[agentic:prod-battery] ${label}`);
			const log = createWriteStream(resolve(output, `${label}.log`));
			const args = ['--filter', '@buildos/web', 'test:agentic:battery'];
			const child = spawn(testGate ?? 'pnpm', testGate ? ['run', 'pnpm', ...args] : args, {
				cwd: root,
				env,
				stdio: ['ignore', 'pipe', 'pipe']
			});
			child.stdout.pipe(log, { end: false });
			child.stderr.pipe(log, { end: false });
			child.once('error', reject);
			child.once('close', (code) => {
				log.end();
				done(code ?? 1);
			});
		});
	return attempt('battery').then(async (code) => {
		if (code !== 75) return code;
		console.info('[agentic:prod-battery] test-gate refused; waiting 60 seconds, retrying once');
		await new Promise((done) => setTimeout(done, 60_000));
		return attempt('battery-retry');
	});
}

async function main() {
	let cleanup: (() => Promise<void>) | null = null;
	try {
		const app = readEnvFile('apps/web/.env');
		const local = readEnvFile(
			process.env.AGENTIC_PROD_BATTERY_ENV_FILE ?? '.env.agentic-prod-battery.local'
		);
		const email = local.AGENTIC_TEST_USER_EMAIL?.trim();
		const password = local.AGENTIC_TEST_USER_PASSWORD;
		const judgeKey = local.PRIVATE_OPENROUTER_API_KEY?.trim();
		const preflightOnly = process.argv.includes('--preflight-only');
		evidence.preflightOnly = preflightOnly;
		const selectedCases = parseCaseSelection(process.argv);
		evidence.cases = selectedCases ?? 'all';
		assertProdBatteryTarget({
			confirmed: preflightOnly || process.argv.includes('--confirm-prod'),
			testUserEmail: email,
			supabaseUrl: app.PUBLIC_SUPABASE_URL,
			webUrl,
			workerUrl
		});
		if (!password || !judgeKey)
			throw new Error(
				'The prod battery env file needs AGENTIC_TEST_USER_PASSWORD and PRIVATE_OPENROUTER_API_KEY (judge only)'
			);
		if (!Number.isSafeInteger(repetitions) || repetitions < 1)
			throw new Error('AGENTIC_PROD_BATTERY_REPETITIONS must be positive');

		// Refuse before any spend: model allowlist, one clean deployed commit, calendar.
		const acting = assertGateModelAllowed({
			AGENTIC_CHAT_OPENROUTER_MODEL: readProductionActingModel(),
			AGENTIC_GATE_ALLOWED_MODELS: process.env.AGENTIC_GATE_ALLOWED_MODELS
		});
		evidence.actingModel = acting;
		console.info(
			`[agentic:prod-battery] production acting model ${acting.model}; known three-repetition spend ${acting.knownRunCostUsd === null ? 'unknown' : `about $${acting.knownRunCostUsd.toFixed(2)}`}`
		);
		const before = await readDeployed();
		evidence.deployed = {
			provenance: before.expected,
			vercelDeploymentId: before.vercel.deploymentId,
			workerRelease: before.health.release ?? null
		};
		console.info(
			`[agentic:prod-battery] deployed commit ${before.expected.gitSha.slice(0, 9)}`
		);
		try {
			evidence.localHead = execFileSync('git', ['rev-parse', 'HEAD'], {
				cwd: root,
				encoding: 'utf8'
			}).trim();
		} catch {
			evidence.localHead = null;
		}

		const rest = serviceRest(app);
		const users = await rest(`users?select=id&email=eq.${encodeURIComponent(email!)}`);
		if (users.length !== 1) throw new Error('The harness account does not exist in production');
		const userId = users[0].id as string;
		const actors = await rest(`onto_actors?select=id&user_id=eq.${userId}`);
		if (actors.length !== 1) throw new Error('The harness account has no single actor row');
		const actorId = actors[0].id as string;
		// Only Case 10 reads the calendar; a subset without it does not need the connection.
		evidence.calendar =
			!selectedCases || selectedCases.includes(10)
				? await assertCalendarConnected(rest, userId)
				: 'not_required';
		if (preflightOnly) {
			evidence.status = 'preflight_passed';
			return;
		}

		// Hard-delete leftovers first so readback starts from an empty account.
		evidence.preClean = { projectsDeleted: await deleteHarnessProjects(rest, actorId) };
		const judgeUsageBefore = await openRouterUsage(judgeKey);
		const runSince = new Date().toISOString();
		cleanup = async () => {
			const projectsDeleted = await deleteHarnessProjects(rest, actorId);
			const sessions = await deleteRunChatSessions(
				app,
				rest,
				{ email: email!, password, userId },
				runSince
			);
			evidence.postClean = { projectsDeleted, chatSessions: sessions };
			if (sessions.remaining)
				throw new Error(
					`${sessions.remaining} chat sessions from this run survived cleanup`
				);
		};

		const env: NodeJS.ProcessEnv = {
			...process.env,
			PUBLIC_SUPABASE_URL: app.PUBLIC_SUPABASE_URL,
			PUBLIC_SUPABASE_ANON_KEY: app.PUBLIC_SUPABASE_ANON_KEY,
			PRIVATE_SUPABASE_SERVICE_KEY: app.PRIVATE_SUPABASE_SERVICE_KEY,
			PRIVATE_OPENROUTER_API_KEY: judgeKey,
			AGENTIC_TEST_USER_EMAIL: email,
			AGENTIC_TEST_USER_PASSWORD: password,
			AGENTIC_E2E_BASE_URL: webUrl,
			PRIVATE_AGENTIC_CHAT_WORKER_URL: workerUrl,
			AGENTIC_BATTERY_TARGET: 'deployed',
			AGENTIC_BATTERY_EXPECTED_PROVENANCE: JSON.stringify(before.expected),
			AGENTIC_BATTERY_WEB_PROVENANCE: JSON.stringify(before.web),
			CHAT_MUTATION_BATCH_LANE: 'true',
			AGENTIC_BATTERY: 'cedar-house',
			AGENTIC_SCENARIOS: selectedCases
				? selectedCases.map((value) => CEDAR_SCENARIO_IDS[value]).join(',')
				: '',
			AGENTIC_E2E_RETRY_COUNT: '0',
			AGENTIC_ASSERT_TELEMETRY: 'true',
			AGENTIC_PHASE0_CAPTURE: 'false',
			AGENTIC_GATE_EVIDENCE_DIR: resolve(output, 'turns'),
			AGENTIC_PHASE0_REPETITIONS: String(repetitions),
			AGENTIC_E2E_WORKER_PREFLIGHT_ONLY: 'false',
			AGENTIC_BATTERY_OUTPUT_PATH: resolve(output, 'scorecard.json')
		};
		// Never the isolated-database flags or local prompt capture: production records no prompts.
		delete env.AGENTIC_GATE_DATABASE_ISOLATED;
		delete env.AGENTIC_CHAT_LOCAL_PROMPT_DUMPS;
		delete env.AGENTIC_CHAT_LOCAL_PROMPT_DUMP_DIRECTORY;

		const exitCode = await runBattery(env);
		const scorecard = JSON.parse(readFileSync(resolve(output, 'scorecard.json'), 'utf8'));
		const failures = selectedCases
			? evaluateCaseSubset(scorecard, selectedCases, repetitions)
			: evaluateGateScorecard(scorecard, repetitions);
		if (repetitions < 3) failures.unshift('A full run requires three repetitions');
		const after = await readDeployed();
		assertDeploymentUnchanged(before.expected, after.expected, 'Production deployment');

		// Cost before cleanup: usage rows survive session deletion, but read them first anyway.
		const usage = (await rest(
			`llm_usage_logs?select=total_cost_usd&user_id=eq.${userId}&created_at=gte.${encodeURIComponent(runSince)}`
		)) as Array<{ total_cost_usd: number | null }>;
		const judgeUsageAfter = await openRouterUsage(judgeKey);
		evidence.cost = {
			productionModelUsd: Number(
				usage.reduce((sum, row) => sum + (Number(row.total_cost_usd) || 0), 0).toFixed(4)
			),
			productionModelCalls: usage.length,
			judgeUsd:
				judgeUsageBefore === null || judgeUsageAfter === null
					? null
					: Number((judgeUsageAfter - judgeUsageBefore).toFixed(4))
		};
		evidence.summary = scorecard.summary;
		evidence.failures = failures;
		// Before cleanup: the session delete takes these rows with it.
		evidence.failedTurnRows = await captureFailedTurnRows(
			rest,
			userId,
			failedTurnStreamRunIds(scorecard),
			output
		);
		if (exitCode || failures.length)
			throw new Error(`Deployed battery failed (${exitCode}): ${failures.join('; ')}`);
		// A green subset is evidence for those cases only, never a full post-deploy pass.
		evidence.status = selectedCases ? 'passed_selected_cases' : 'passed';
	} catch (error) {
		evidence.status = 'failed';
		evidence.error = error instanceof Error ? error.message : String(error);
		console.error(`[agentic:prod-battery] ${evidence.error}`);
		process.exitCode = 1;
	} finally {
		if (cleanup) {
			try {
				await cleanup();
			} catch (error) {
				evidence.cleanupError = String(error);
				console.error(`[agentic:prod-battery] cleanup: ${String(error)}`);
				process.exitCode = 1;
			}
		}
		evidence.finishedAt = new Date().toISOString();
		writeFileSync(
			resolve(output, 'prod-battery.json'),
			JSON.stringify(evidence, null, 2) + '\n'
		);
		console.info(`[agentic:prod-battery] ${evidence.status}: ${output}`);
	}
}

void main();
