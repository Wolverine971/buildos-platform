// apps/worker/scripts/workflow-reasoning-replay.ts
//
// Tasker 98: does V4.1 Flash honor a reasoning setting on workflow steps, and what does it
// save? Replays requests the context finder pilot captured (runs/*.json from
// apps/worker/tests/contextFinderPilot.live.test.ts) with each reasoning variant and records
// hidden-reasoning tokens, finish reason, wall time, serving provider and cost. For the
// planner it also checks that the reply still parses as an assignment.
//
//   Dry run (free):  pnpm --filter @buildos/worker exec tsx scripts/workflow-reasoning-replay.ts \
//                      --run-dir output/context-finder-pilot/<ts> --steps risk_reviewer,planner
//   Live (paid):     ... --live --max-usd 0.03
//   Options:         --variants low,off  --per-step 1  --only <run file substring>
//
// Every call is checked before it is sent: it is skipped when the spend so far plus its
// worst case (captured prompt tokens at $0.30/M + max_tokens at $1.20/M, the workflow's
// admitted maximum rates) would pass --max-usd. Output stays in the private run directory.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'dotenv';
import { parseWorkflowAssignments } from '../src/workers/agentic-chat/workflow/prototype-provider';

type Variant = 'low' | 'off' | 'default';
const REASONING: Record<Variant, Record<string, unknown>> = {
	// What workflow steps send today (`reasoningEffort: 'low'`).
	low: { effort: 'low', exclude: true },
	// `reasoningEffort: 'none'` in the client.
	off: { enabled: false },
	default: { exclude: true }
};
const PROMPT_USD_PER_TOKEN = 0.3e-6;
const COMPLETION_USD_PER_TOKEN = 1.2e-6;

function arg(name: string, fallback?: string): string | undefined {
	const at = process.argv.indexOf(`--${name}`);
	return at >= 0 ? process.argv[at + 1] : fallback;
}

type CapturedRun = {
	scenario: string;
	arm: string;
	timeline: { calls: { step: string | null; physicalAttempt: number | null }[] };
	calls: {
		body: Record<string, any> | null;
		usage: { promptTokens: number | null };
		request: { maxTokens: unknown };
	}[];
};

async function main() {
	const runDir = resolve(process.cwd(), '../..', arg('run-dir') ?? '');
	const steps = (arg('steps', 'risk_reviewer,planner') ?? '').split(',').map((s) => s.trim());
	const variants = (arg('variants', 'low,off') ?? '').split(',').map((v) => v.trim() as Variant);
	const perStep = Number(arg('per-step', '1'));
	const maxUsd = Number(arg('max-usd', '0.03'));
	const live = process.argv.includes('--live');
	for (const variant of variants)
		if (!REASONING[variant]) throw new Error(`Unknown variant ${variant}`);

	const runsDir = join(runDir, 'runs');
	const only = arg('only');
	const runs = readdirSync(runsDir)
		.filter((file) => file.endsWith('.json') && (!only || file.includes(only)))
		.map((file) => JSON.parse(readFileSync(join(runsDir, file), 'utf8')) as CapturedRun);

	const picked: {
		step: string;
		label: string;
		body: Record<string, any>;
		promptTokens: number;
	}[] = [];
	for (const step of steps) {
		let taken = 0;
		for (const run of runs) {
			run.timeline.calls.forEach((meta, index) => {
				const call = run.calls[index];
				if (
					taken >= perStep ||
					meta.step !== step ||
					meta.physicalAttempt !== 1 ||
					!call?.body ||
					call.usage.promptTokens === null
				)
					return;
				taken += 1;
				picked.push({
					step,
					label: `${run.scenario}/${run.arm}`,
					body: call.body,
					promptTokens: call.usage.promptTokens
				});
			});
		}
	}
	console.info(
		`${picked.length} captured requests × ${variants.length} variants; cap $${maxUsd}`
	);

	const apiKey = parse(readFileSync(resolve(process.cwd(), '.env'))).PRIVATE_OPENROUTER_API_KEY;
	if (live && !apiKey)
		throw new Error('PRIVATE_OPENROUTER_API_KEY missing from apps/worker/.env');
	const results: Record<string, unknown>[] = [];
	let spent = 0;
	// Alternate the variant order per request: a provider prefix-cache hit favors whichever
	// variant runs second. Compare pairs on reasoning/completion tokens and the same provider.
	for (const [itemIndex, item] of picked.entries())
		for (const variant of itemIndex % 2 ? [...variants].reverse() : variants) {
			const maxTokens = Number(item.body.max_tokens ?? 4_000);
			const worst =
				item.promptTokens * PROMPT_USD_PER_TOKEN + maxTokens * COMPLETION_USD_PER_TOKEN;
			if (spent + worst > maxUsd) {
				console.warn(
					`skip ${item.step} ${item.label} ${variant}: $${spent.toFixed(4)} + worst $${worst.toFixed(4)} > $${maxUsd}`
				);
				continue;
			}
			// The captured body as the workflow sent it, minus streaming and the session cache
			// key; only `reasoning` varies. Provider routing and max_price are kept.
			const {
				stream: _stream,
				stream_options: _options,
				prompt_cache_key: _key,
				session_id: _session,
				...rest
			} = item.body;
			const body = { ...rest, reasoning: REASONING[variant], usage: { include: true } };
			if (!live) {
				console.info(
					`would send ${item.step} ${item.label} ${variant}: ${JSON.stringify(body).length} bytes, worst $${worst.toFixed(4)}`
				);
				continue;
			}
			const started = Date.now();
			const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': 'https://build-os.com',
					'X-Title': 'BuildOS workflow reasoning replay'
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(120_000)
			});
			// Non-streaming responses open early; the wall clock includes reading the body.
			const json = (await response.json().catch(() => null)) as Record<string, any> | null;
			const wallMs = Date.now() - started;
			const usage = json?.usage ?? {};
			const cost = typeof usage.cost === 'number' ? usage.cost : worst;
			spent += cost;
			const text = String(json?.choices?.[0]?.message?.content ?? '');
			const row = {
				step: item.step,
				run: item.label,
				variant,
				status: response.status,
				provider: json?.provider ?? null,
				model: json?.model ?? null,
				finishReason: json?.choices?.[0]?.finish_reason ?? null,
				promptTokens: usage.prompt_tokens ?? null,
				cachedPromptTokens: usage.prompt_tokens_details?.cached_tokens ?? null,
				completionTokens: usage.completion_tokens ?? null,
				reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
				wallMs,
				costUsd: cost,
				visibleChars: text.length,
				plannerParses:
					item.step === 'planner' ? parseWorkflowAssignments(text) !== null : null,
				error: response.ok ? null : JSON.stringify(json?.error ?? json).slice(0, 500),
				text
			};
			results.push(row);
			console.info(
				`${row.step} ${row.run} ${variant}: ${row.status} ${row.provider} · ${row.completionTokens} tok (${row.reasoningTokens} reasoning) · ${(wallMs / 1000).toFixed(1)}s · ${row.finishReason} · $${cost.toFixed(4)}${row.plannerParses === null ? '' : ` · parses ${row.plannerParses}`}`
			);
		}
	if (live) {
		writeFileSync(join(runDir, 'reasoning-replays.json'), JSON.stringify(results, null, 2), {
			mode: 0o600
		});
		console.info(`spent $${spent.toFixed(4)} → ${join(runDir, 'reasoning-replays.json')}`);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
