// scripts/agentic/continuation-reasoning-report.ts
//
// Free, read-only report for the AGENTIC_CHAT_CONTINUATION_REASONING experiment
// (docs/technical/reviews/AGENTIC_CHAT_PIPELINE_AUDIT_2026-10-17.md, S3). Compares
// variants on reasoning tokens (opening vs continuation acting passes), latency,
// prompt tokens, cost, and battery score. Makes no model calls and writes nothing
// to the database.
//
//   # Two prod-battery runs (the first label is the baseline):
//   node --import tsx scripts/agentic/continuation-reasoning-report.ts \
//     --run default=output/agentic-prod-battery/2026-10-17T20-59-39-807Z \
//     --run replay=output/agentic-prod-battery/<replay run>
//
//   # A time window of live traffic (all users unless --user):
//   node --import tsx scripts/agentic/continuation-reasoning-report.ts \
//     --window before=2026-10-10T00:00Z..2026-10-17T00:00Z \
//     --window replay=2026-10-18T00:00Z..2026-10-25T00:00Z
//
// Options: repeat a label to pool runs; --source=evidence reads only the battery's
// turn files (offline); --user=<email|uuid> narrows windows; --exclude-user=<email|uuid>
// (repeatable) drops an account such as the battery harness; --json=<path> writes
// the full numbers. Battery cleanup nulls llm_usage_logs.turn_run_id, so DB rows
// are found by the harness user + the run's [startedAt, finishedAt] window and
// grouped into turns by stream_run_id.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import {
	type PassRow,
	type VariantReport,
	buildVariantReport,
	renderReport
} from './continuation-reasoning-metrics';

const root = fileURLToPath(new URL('../../', import.meta.url));
const TURN_OPERATIONS = new Set(['agentic_chat_worker_stream', 'agentic_chat_tool_selection']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Source =
	| { kind: 'battery'; label: string; dir: string }
	| { kind: 'window'; label: string; from: string; to: string };

type Options = {
	sources: Source[];
	mode: 'db' | 'evidence';
	user: string | null;
	excludeUsers: string[];
	json: string | null;
};

function parseArgs(argv: readonly string[]): Options {
	const sources: Source[] = [];
	let mode: Options['mode'] = 'db';
	let user: string | null = null;
	const excludeUsers: string[] = [];
	let json: string | null = null;
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]!;
		const [flag, inline] =
			arg.includes('=') && arg.startsWith('--') ? splitOnce(arg, '=') : [arg, null];
		const value = () => inline ?? argv[++index] ?? '';
		if (flag === '--run' || flag === '--window') {
			const [label, spec] = splitOnce(value(), '=');
			if (!label || !spec) throw new Error(`${flag} expects label=value`);
			if (flag === '--run') {
				sources.push({ kind: 'battery', label, dir: resolve(root, spec) });
			} else {
				const [from, to] = splitOnce(spec, '..');
				if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)))
					throw new Error('--window expects label=<ISO start>..<ISO end>');
				sources.push({
					kind: 'window',
					label,
					from: new Date(from).toISOString(),
					to: new Date(to).toISOString()
				});
			}
		} else if (flag === '--source') {
			const source = value();
			if (source !== 'db' && source !== 'evidence')
				throw new Error('--source must be db or evidence');
			mode = source;
		} else if (flag === '--user') {
			user = value();
		} else if (flag === '--exclude-user') {
			excludeUsers.push(value());
		} else if (flag === '--json') {
			json = resolve(root, value());
		} else {
			throw new Error(`Unknown argument ${arg}`);
		}
	}
	if (sources.length === 0)
		throw new Error(
			'Pass at least one --run label=<battery dir> or --window label=<from>..<to>'
		);
	return { sources, mode, user, excludeUsers, json };
}

function splitOnce(value: string, separator: string): [string, string | null] {
	const at = value.indexOf(separator);
	return at < 0 ? [value, null] : [value.slice(0, at), value.slice(at + separator.length)];
}

const num = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0;
const optionalNumber = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? value : null;
const text = (value: unknown) => (typeof value === 'string' && value ? value : null);

/** One llm_usage_logs row (DB or battery evidence) → PassRow. */
function toPassRow(row: Record<string, unknown>, fallbackTurnKey: string): PassRow {
	const metadata = (
		row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
	) as Record<string, unknown>;
	const startedAtMs = Date.parse(String(row.request_started_at ?? row.created_at));
	const completedAtMs = Date.parse(String(row.request_completed_at ?? row.created_at));
	return {
		turnKey:
			text(row.stream_run_id) ??
			text(row.client_turn_id) ??
			text(row.turn_run_id) ??
			fallbackTurnKey,
		passRole: text(metadata.passRole),
		logicalProviderRound: optionalNumber(metadata.logicalProviderRound),
		providerAttempt: optionalNumber(metadata.providerAttempt),
		startedAtMs,
		completedAtMs,
		responseTimeMs: num(row.response_time_ms),
		promptTokens: num(row.prompt_tokens),
		cachedPromptTokens: num(row.cached_prompt_tokens),
		completionTokens: num(row.completion_tokens),
		reasoningTokens: num(row.reasoning_tokens),
		costUsd: num(row.total_cost_usd),
		status: text(metadata.providerStatus) ?? text(row.status),
		modelUsed: text(row.model_used)
	};
}

function readEnvFile(path: string): Record<string, string> {
	const absolute = resolve(root, path);
	if (!existsSync(absolute)) throw new Error(`Missing env file ${path}`);
	return parse(readFileSync(absolute));
}

/** Read-only PostgREST GETs with the service key (the same access prod-battery uses). */
function database() {
	const app = readEnvFile('apps/web/.env');
	const url = app.PUBLIC_SUPABASE_URL;
	const key = app.PRIVATE_SUPABASE_SERVICE_KEY;
	if (!url || !key)
		throw new Error('apps/web/.env needs PUBLIC_SUPABASE_URL and PRIVATE_SUPABASE_SERVICE_KEY');
	const get = async (path: string): Promise<Array<Record<string, unknown>>> => {
		const response = await fetch(`${url}/rest/v1/${path}`, {
			method: 'GET',
			headers: { apikey: key, Authorization: `Bearer ${key}` },
			signal: AbortSignal.timeout(30_000)
		});
		const body = await response.text();
		if (!response.ok)
			throw new Error(`${path.split('?')[0]} → ${response.status}: ${body.slice(0, 200)}`);
		return JSON.parse(body) as Array<Record<string, unknown>>;
	};
	return {
		async userId(emailOrId: string): Promise<string> {
			if (UUID.test(emailOrId)) return emailOrId;
			const users = await get(`users?select=id&email=eq.${encodeURIComponent(emailOrId)}`);
			if (users.length !== 1) throw new Error(`No single user for ${emailOrId}`);
			return String(users[0]!.id);
		},
		async usage(from: string, to: string, userId: string | null) {
			const columns = [
				'id',
				'created_at',
				'operation_type',
				'user_id',
				'stream_run_id',
				'client_turn_id',
				'turn_run_id',
				'model_used',
				'status',
				'request_started_at',
				'request_completed_at',
				'response_time_ms',
				'prompt_tokens',
				'cached_prompt_tokens',
				'completion_tokens',
				'reasoning_tokens',
				'total_cost_usd',
				'metadata'
			].join(',');
			const rows: Array<Record<string, unknown>> = [];
			const page = 1000;
			for (let offset = 0; ; offset += page) {
				const batch = await get(
					`llm_usage_logs?select=${columns}` +
						`&created_at=gte.${encodeURIComponent(from)}&created_at=lte.${encodeURIComponent(to)}` +
						(userId ? `&user_id=eq.${userId}` : '') +
						`&order=created_at.asc&limit=${page}&offset=${offset}`
				);
				rows.push(...batch);
				if (batch.length < page) return rows;
			}
		}
	};
}

type Collected = {
	rows: PassRow[];
	wallMsByTurn: Map<string, number>;
	quality: VariantReport['quality'];
	sources: string[];
	otherCostUsd: number;
};

function readJson(path: string): any {
	return JSON.parse(readFileSync(path, 'utf8'));
}

/** Battery evidence: client wall times, scorecard, and the turn files' own usage rows. */
function readBattery(dir: string) {
	const evidence = readJson(resolve(dir, 'prod-battery.json'));
	const scorecard = existsSync(resolve(dir, 'scorecard.json'))
		? readJson(resolve(dir, 'scorecard.json'))
		: null;
	const wallMsByTurn = new Map<string, number>();
	const rows: PassRow[] = [];
	const turnsDir = resolve(dir, 'turns');
	for (const file of existsSync(turnsDir)
		? readdirSync(turnsDir).filter((name) => name.endsWith('.json'))
		: []) {
		const turn = readJson(resolve(turnsDir, file));
		const streamRunId = text(turn?.result?.streamRunId) ?? file;
		const wall = optionalNumber(turn?.result?.timing?.totalDurationMs);
		if (wall !== null) wallMsByTurn.set(streamRunId, wall);
		for (const pass of Array.isArray(turn?.modelPasses) ? turn.modelPasses : []) {
			rows.push(toPassRow({ ...pass, stream_run_id: streamRunId }, streamRunId));
		}
	}
	const summary = scorecard?.summary;
	return {
		startedAt: String(evidence.startedAt),
		finishedAt: String(evidence.finishedAt ?? new Date().toISOString()),
		status: String(evidence.status),
		wallMsByTurn,
		evidenceRows: rows,
		quality:
			summary && typeof summary.totalScore === 'number'
				? {
						totalScore: summary.totalScore,
						maxScore: summary.maxScore,
						percent: summary.percent
					}
				: null
	};
}

async function collect(
	sources: readonly Source[],
	options: Options,
	db: ReturnType<typeof database> | null
) {
	const harnessEmail = (() => {
		try {
			return readEnvFile(
				process.env.AGENTIC_PROD_BATTERY_ENV_FILE ?? '.env.agentic-prod-battery.local'
			).AGENTIC_TEST_USER_EMAIL?.trim();
		} catch {
			return undefined;
		}
	})();
	const collected: Collected = {
		rows: [],
		wallMsByTurn: new Map(),
		quality: null,
		sources: [],
		otherCostUsd: 0
	};
	let scored = { totalScore: 0, maxScore: 0 };
	for (const source of sources) {
		let rows: PassRow[];
		if (source.kind === 'battery') {
			const battery = readBattery(source.dir);
			for (const [key, value] of battery.wallMsByTurn) collected.wallMsByTurn.set(key, value);
			if (battery.quality) {
				scored = {
					totalScore: scored.totalScore + battery.quality.totalScore,
					maxScore: scored.maxScore + battery.quality.maxScore
				};
			}
			const name = source.dir.split('/').at(-1)!;
			if (options.mode === 'db' && db) {
				const user = options.user ?? harnessEmail;
				if (!user)
					throw new Error('No harness user: pass --user or set AGENTIC_TEST_USER_EMAIL');
				const raw = await db.usage(
					battery.startedAt,
					battery.finishedAt,
					await db.userId(user)
				);
				rows = raw
					.filter(
						(row) =>
							TURN_OPERATIONS.has(String(row.operation_type)) && row.stream_run_id
					)
					.map((row) => toPassRow(row, String(row.id)));
				collected.otherCostUsd += raw
					.filter(
						(row) =>
							!TURN_OPERATIONS.has(String(row.operation_type)) || !row.stream_run_id
					)
					.reduce((sum, row) => sum + num(row.total_cost_usd), 0);
				collected.sources.push(`${name} (db, ${battery.status})`);
			} else {
				rows = battery.evidenceRows;
				collected.sources.push(`${name} (evidence, ${battery.status})`);
			}
		} else {
			if (!db) throw new Error('--window needs database access (apps/web/.env)');
			const raw = await db.usage(
				source.from,
				source.to,
				options.user ? await db.userId(options.user) : null
			);
			const excluded = new Set(
				await Promise.all(options.excludeUsers.map((user) => db.userId(user)))
			);
			rows = raw
				.filter((row) => !excluded.has(String(row.user_id)))
				.filter(
					(row) => TURN_OPERATIONS.has(String(row.operation_type)) && row.stream_run_id
				)
				.map((row) => toPassRow(row, String(row.id)));
			collected.sources.push(`${source.from.slice(0, 16)}..${source.to.slice(0, 16)}`);
		}
		collected.rows.push(...rows);
	}
	if (scored.maxScore > 0) {
		collected.quality = {
			...scored,
			percent: Number(((scored.totalScore / scored.maxScore) * 100).toFixed(1))
		};
	}
	return collected;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	let db: ReturnType<typeof database> | null = null;
	const needsDb =
		options.mode === 'db' || options.sources.some((source) => source.kind === 'window');
	if (needsDb) {
		try {
			db = database();
		} catch (error) {
			if (options.sources.some((source) => source.kind === 'window')) throw error;
			console.warn(
				`[continuation-reasoning-report] no database access (${String(error)}); using battery evidence`
			);
			options.mode = 'evidence';
		}
	}
	const labels = [...new Set(options.sources.map((source) => source.label))];
	const reports: VariantReport[] = [];
	const otherSpend: Record<string, number> = {};
	for (const label of labels) {
		const collected = await collect(
			options.sources.filter((source) => source.label === label),
			options,
			db
		);
		otherSpend[label] = collected.otherCostUsd;
		reports.push(
			buildVariantReport({
				label,
				sources: collected.sources,
				rows: collected.rows,
				wallMsByTurn: collected.wallMsByTurn,
				quality: collected.quality
			})
		);
	}
	console.log(renderReport(reports));
	if (Object.values(otherSpend).some((value) => value > 0)) {
		console.log(
			`\nOther harness spend in the run windows (emoji, entity extraction, …): ${Object.entries(
				otherSpend
			)
				.map(([label, value]) => `${label} $${value.toFixed(4)}`)
				.join(', ')}`
		);
	}
	if (options.json) {
		writeFileSync(
			options.json,
			JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2) + '\n'
		);
		console.log(`\nWrote ${options.json}`);
	}
}

main().catch((error) => {
	console.error(
		`[continuation-reasoning-report] ${error instanceof Error ? error.message : String(error)}`
	);
	process.exitCode = 1;
});
