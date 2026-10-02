// apps/worker/scripts/project-emoji-backfill.ts
//
// Picks tile emoji for projects that already exist (new projects get theirs from the
// pick_project_emoji job). Same picker as the job: src/workers/project-emoji/project-emoji.ts.
// Plan: docs/specs/PROJECT_EMOJI_PLAN_2026-10-01.md.
//
//   Dump (free, read-only; private content, keep it out of the repo). Edit the email in the
//   SQL to choose whose projects:
//     supabase db query --linked -o json -f apps/worker/scripts/project-emoji-backfill.sql > <dump.json>
//   Dry (free):   pnpm exec tsx scripts/project-emoji-backfill.ts --dump <dump.json> --out <dir>
//   Live (paid):  PROJECT_EMOJI_LIVE=1 ... --live --user-id <id> [--limit 3] [--max-usd 0.2]
//                 Reads apps/worker/.env; usage is logged as project_emoji_pick. Resumes: a
//                 project already in <dir>/results.json with the same words and prompt is
//                 skipped.
//   SQL (free):   ... --sql   → <dir>/write.sql, one UPDATE per project that skips projects
//                 whose owner chose their own emoji; apply with `supabase db query --linked -f`.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
	MAX_COST_PER_CALL_USD,
	PROJECT_EMOJI_OPERATION,
	PROJECT_EMOJI_PROMPT_VERSION,
	PROJECT_EMOJI_SYSTEM_PROMPT,
	pickProjectEmojis,
	projectEmojiInputHash,
	projectEmojiUserPrompt,
	projectEmojiValue,
	type ProjectEmojiInput,
	type ProjectEmojiPick
} from '../src/workers/project-emoji/project-emoji';

type DumpRow = { id: string; name: string; description: string | null; start_here: string | null };
type Result = Omit<ProjectEmojiPick, 'ok'> & {
	id: string;
	name: string;
	durationMs: number;
	generatedAt: string;
};

/** GPT-6 Luna list prices; output includes reasoning tokens. */
const USD_PER_INPUT_TOKEN = 0.1 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 0.5 / 1_000_000;
/** Measured on the 2026-10-02 run of 46 projects (865 in, 446 out incl. reasoning). */
const MEASURED_OUTPUT_TOKENS = 446;
const CONCURRENCY = 4;
const REPO = (() => {
	let dir = process.cwd();
	while (!existsSync(join(dir, 'pnpm-workspace.yaml')) && dirname(dir) !== dir)
		dir = dirname(dir);
	return dir;
})();

const arg = (name: string, fallback?: string) => {
	const index = process.argv.indexOf(name);
	return index > 0 ? process.argv[index + 1] : fallback;
};
const flag = (name: string) => process.argv.includes(name);

function readDump(path: string): DumpRow[] {
	const parsed = JSON.parse(readFileSync(path, 'utf8')) as { rows?: DumpRow[] } | DumpRow[];
	return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

const toInput = (row: DumpRow): ProjectEmojiInput => ({
	name: row.name,
	description: row.description,
	startHere: row.start_here
});

function readResults(path: string): Map<string, Result> {
	if (!existsSync(path)) return new Map();
	const rows = JSON.parse(readFileSync(path, 'utf8')) as Result[];
	return new Map(rows.map((row) => [row.id, row]));
}

function dry(rows: DumpRow[]) {
	let inputTokens = 0;
	for (const row of rows) {
		const chars =
			PROJECT_EMOJI_SYSTEM_PROMPT.length + projectEmojiUserPrompt(toInput(row)).length;
		inputTokens += chars / 3.5;
	}
	const cost =
		inputTokens * USD_PER_INPUT_TOKEN +
		rows.length * MEASURED_OUTPUT_TOKENS * USD_PER_OUTPUT_TOKEN;
	console.log(
		[
			`Projects: ${rows.length}`,
			`Prompt: ~${Math.round(inputTokens / Math.max(1, rows.length))} input tokens per project`,
			`Estimated: ~$${cost.toFixed(4)} (~$${(cost / Math.max(1, rows.length)).toFixed(5)} per project)`,
			`Ceiling: $${MAX_COST_PER_CALL_USD} per call, at most 2 calls per project → $${(rows.length * 2 * MAX_COST_PER_CALL_USD).toFixed(3)}`
		].join('\n')
	);
}

async function live(rows: DumpRow[], out: string) {
	if (process.env.PROJECT_EMOJI_LIVE !== '1')
		throw new Error('Live runs are paid: set PROJECT_EMOJI_LIVE=1 after approval');
	const userId = arg('--user-id');
	if (!userId) throw new Error('--user-id <id> is required (usage is logged against it)');
	const envFile = join(REPO, 'apps/worker/.env');
	if (!process.env.PRIVATE_SUPABASE_SERVICE_KEY && existsSync(envFile))
		process.loadEnvFile(envFile);
	const { SmartLLMService } = await import('../src/lib/services/smart-llm-service.js');
	const { supabase } = await import('../src/lib/supabase.js');
	const llm = new SmartLLMService({ appName: 'BuildOS Project Emoji Backfill' });
	const maxUsd = Number(arg('--max-usd', '0.2'));
	const resultsPath = join(out, 'results.json');
	const results = readResults(resultsPath);
	const todo = rows.filter(
		(row) =>
			results.get(row.id)?.inputHash !== projectEmojiInputHash(toInput(row)) ||
			results.get(row.id)?.promptVersion !== PROJECT_EMOJI_PROMPT_VERSION
	);
	const startedAt = new Date().toISOString();
	let ceiling = 0;
	let failed = 0;
	console.log(`${todo.length} to pick (${rows.length - todo.length} already done)`);
	const queue = [...todo];
	const work = async () => {
		for (let row = queue.shift(); row; row = queue.shift()) {
			// Worst case before each project: two calls at the per-call ceiling.
			if (ceiling + 2 * MAX_COST_PER_CALL_USD > maxUsd)
				throw new Error(`Stopped: worst-case spend would pass $${maxUsd}`);
			ceiling += 2 * MAX_COST_PER_CALL_USD;
			const started = Date.now();
			const pick = await pickProjectEmojis(llm, toInput(row), { userId, projectId: row.id });
			ceiling -= (2 - pick.attempts) * MAX_COST_PER_CALL_USD;
			if (!pick.ok) {
				failed += 1;
				console.log(`✗ ${row.name}: ${pick.problems.join('; ')}`);
				continue;
			}
			const { ok: _ok, ...rest } = pick;
			results.set(row.id, {
				id: row.id,
				name: row.name,
				...rest,
				durationMs: Date.now() - started,
				generatedAt: new Date().toISOString()
			});
			writeFileSync(resultsPath, JSON.stringify([...results.values()], null, '\t'));
			const notes = pick.notes.length ? `; ${pick.notes.join('; ')}` : '';
			console.log(
				`${pick.glyphs.join('')}  ${row.name}  (${pick.attempts} call(s), ${Date.now() - started} ms${notes})`
			);
		}
	};
	await Promise.all(Array.from({ length: CONCURRENCY }, work));
	// Usage rows are written just after each call returns.
	await new Promise((resolve) => setTimeout(resolve, 5000));
	const { data: usage } = await supabase
		.from('llm_usage_logs')
		.select('total_cost_usd, openrouter_usage_cost_usd, model_used')
		.eq('operation_type', PROJECT_EMOJI_OPERATION)
		.eq('user_id', userId)
		.gte('created_at', startedAt);
	const spent = (usage ?? []).reduce(
		(sum, row) => sum + Number(row.openrouter_usage_cost_usd ?? row.total_cost_usd ?? 0),
		0
	);
	const models = [...new Set((usage ?? []).map((row) => row.model_used))].join(', ');
	console.log(
		`Done: ${todo.length - failed} picked, ${failed} failed; ${usage?.length ?? 0} calls on ${models || 'n/a'}, spent $${spent.toFixed(4)} (from llm_usage_logs)`
	);
}

/** Single-quoted SQL literal. */
const sql = (value: string) => `'${value.replace(/'/g, "''")}'`;

function writeSql(out: string) {
	const results = readResults(join(out, 'results.json'));
	const statements = [...results.values()].map((result) => {
		const value = projectEmojiValue({ ok: true, ...result }, result.generatedAt);
		return `UPDATE public.onto_projects SET icon_emoji = ${sql(JSON.stringify(value))}::jsonb WHERE id = ${sql(result.id)} AND coalesce(icon_emoji->>'source', '') <> 'user';`;
	});
	const path = join(out, 'write.sql');
	writeFileSync(path, ['BEGIN;', ...statements, 'COMMIT;', ''].join('\n'));
	console.log(`Wrote ${statements.length} updates to ${path} (owner-chosen emoji are skipped)`);
}

async function main() {
	const out = arg('--out');
	if (!out) throw new Error('--out <dir> is required');
	mkdirSync(out, { recursive: true });
	if (flag('--sql')) return writeSql(out);
	const dump = arg('--dump');
	if (!dump) throw new Error('--dump <file> is required');
	const limit = Number(arg('--limit', '0'));
	const rows = readDump(dump).slice(0, limit > 0 ? limit : undefined);
	return flag('--live') ? live(rows, out) : dry(rows);
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
