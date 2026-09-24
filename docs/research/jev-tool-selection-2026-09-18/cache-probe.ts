// docs/research/jev-tool-selection-2026-09-18/cache-probe.ts
// Where do tool schemas sit in the provider's cached prefix, and what does a
// per-turn tool change invalidate? Sends synthetic prompts only (no user data)
// to the production acting model, pinned to one provider at a time.
//
//   cd apps/worker && NODE_OPTIONS=--conditions=development ./node_modules/.bin/tsx \
//     ../../docs/research/jev-tool-selection-2026-09-18/cache-probe.ts [--providers deepinfra,alibaba]
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { workerOpeningSurface } from './surfaces';

const MODEL = 'deepseek/deepseek-v4-flash';
const HERE = resolve(__dirname);
// The G02 Jev selection (create task + calendar block) from results-v1.json.
const SUBSET = [
	'request_turn_clarification',
	'search_onto_projects',
	'search_all_projects',
	'list_onto_tasks',
	'get_onto_task_details',
	'create_onto_task',
	'list_calendar_events',
	'create_calendar_event'
];

function apiKey(): string {
	for (const file of ['../../../apps/worker/.env', '../../../.env.local', '../../../.env']) {
		const path = resolve(HERE, file);
		if (!existsSync(path)) continue;
		const match = /^(?:export\s+)?PRIVATE_OPENROUTER_API_KEY\s*=\s*["']?([^"'\n]+)/m.exec(
			readFileSync(path, 'utf8')
		);
		if (match) return match[1]!.trim();
	}
	throw new Error('No PRIVATE_OPENROUTER_API_KEY');
}

// ~3k-token static instruction block, made unique per run so older caches cannot help.
function systemPrompt(runId: string): string {
	const rules = Array.from(
		{ length: 90 },
		(_, i) =>
			`Rule ${i + 1}: keep project records accurate, confirm destinations before writing, prefer existing tasks over duplicates, and explain changes plainly.`
	);
	return [`Run ${runId}. You are the BuildOS planning assistant.`, ...rules].join('\n');
}

async function call(key: string, provider: string, body: Record<string, unknown>) {
	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: MODEL,
			max_tokens: 32,
			tool_choice: 'auto',
			usage: { include: true },
			provider: { order: [provider], allow_fallbacks: false },
			...body
		})
	});
	const json = (await response.json()) as Record<string, any>;
	if (!response.ok)
		throw new Error(
			`${provider} HTTP ${response.status}: ${JSON.stringify(json).slice(0, 300)}`
		);
	return {
		provider: json.provider as string,
		prompt: json.usage?.prompt_tokens as number,
		cached: (json.usage?.prompt_tokens_details?.cached_tokens ?? 0) as number,
		cost: json.usage?.cost as number
	};
}

async function main() {
	const providers = (process.argv[process.argv.indexOf('--providers') + 1] ?? 'deepinfra,alibaba')
		.split(',')
		.filter(Boolean);
	const key = apiKey();
	const full = workerOpeningSurface('global');
	const subset = full.filter((t) => SUBSET.includes(t.function.name));
	const out: any[] = [];
	for (const provider of providers) {
		const run = randomUUID();
		const system = systemPrompt(run);
		const user = { role: 'user', content: 'block 2 hours tomorrow morning for the pitch deck' };
		const steps: Array<[string, Record<string, unknown>]> = [
			[
				'1 warm: system + FULL tools + user',
				{ messages: [{ role: 'system', content: system }, user], tools: full }
			],
			[
				'2 repeat identical',
				{ messages: [{ role: 'system', content: system }, user], tools: full }
			],
			[
				'3 same system, NARROWED tools',
				{ messages: [{ role: 'system', content: system }, user], tools: subset }
			],
			[
				'4 repeat narrowed',
				{ messages: [{ role: 'system', content: system }, user], tools: subset }
			],
			[
				'5 same system + FULL tools, new user message',
				{
					messages: [
						{ role: 'system', content: system },
						{ role: 'user', content: 'what is overdue?' }
					],
					tools: full
				}
			],
			[
				'6 system changed at its start, FULL tools',
				{
					messages: [{ role: 'system', content: `Now 15:42. ${system}` }, user],
					tools: full
				}
			]
		];
		console.log(`\n${provider} (run ${run.slice(0, 8)})`);
		for (const [label, body] of steps) {
			const result = await call(key, provider, body);
			out.push({ provider, label, ...result });
			console.log(
				`  ${label.padEnd(46)} prompt ${String(result.prompt).padStart(6)}  cached ${String(result.cached).padStart(6)}  (${Math.round((100 * result.cached) / result.prompt)}%)  via ${result.provider}`
			);
			await new Promise((r) => setTimeout(r, 1_500));
		}
	}
	const file = resolve(
		HERE,
		`cache-probe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
	);
	writeFileSync(
		file,
		JSON.stringify(
			{ model: MODEL, fullTools: full.length, subsetTools: subset.length, out },
			null,
			2
		)
	);
	console.log(`\nspend $${out.reduce((s, r) => s + (r.cost ?? 0), 0).toFixed(5)} → ${file}`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
