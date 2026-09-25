// apps/worker/scripts/reviewer-model-replay.ts
//
// Tasker 108 item 5: does GPT-6 Luna make the same semantic-review decisions
// as GPT-5.6 Luna? Replays the real reviewer requests captured in
// apps/worker/.prompt-dumps/*mutation_review*.json against a candidate model
// and compares its decision tool call with the one GPT-5.6 made at capture
// time (reconstructed from the dump's streamed tool-call deltas).
//
//   Dry run (free):  pnpm --filter @buildos/worker exec tsx scripts/reviewer-model-replay.ts
//   Live (paid):     ... --live --max-usd 0.08
//   Options:         --model openai/gpt-6-luna  --samples 2  --only <dump name substring>
//                    --reasoning low|medium|high (default: the captured request's effort, low)
//
// Each request is sent as captured except: the candidate model, Azure as the
// only provider (Luna's one ZDR host, what prod routes to), no streaming, and
// no session cache key. A call is skipped when spend so far plus its worst
// case (captured prompt tokens and max_tokens at Azure/us rates) would pass
// --max-usd. Output stays in the gitignored dump directory.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'dotenv';

// Azure/us, the highest Luna ZDR rate on 2026-09-25 (GPT-6 Luna $0.11/$0.55 per M).
const PROMPT_USD_PER_TOKEN = 0.11e-6;
const COMPLETION_USD_PER_TOKEN = 0.55e-6;

type Decision = { name: string | null; args: Record<string, unknown> | null };

type Dump = {
	file: string;
	body: Record<string, any>;
	promptTokens: number;
	baseline: Decision;
	baselineModel: string | null;
	baselineCostUsd: number | null;
	baselineWallMs: number | null;
};

function arg(name: string, fallback?: string): string | undefined {
	const at = process.argv.indexOf(`--${name}`);
	return at >= 0 ? process.argv[at + 1] : fallback;
}

function parseArgs(text: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(text);
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

/** Rebuild the first tool call from streamed `tool_call` delta events. */
function baselineDecision(events: unknown[]): Decision {
	let name: string | null = null;
	let argsText = '';
	for (const event of events as Array<Record<string, any>>) {
		if (event?.type !== 'tool_call' || !Array.isArray(event.toolCall)) continue;
		for (const delta of event.toolCall) {
			if ((delta?.index ?? 0) !== 0) continue;
			if (typeof delta?.function?.name === 'string' && delta.function.name) {
				name = delta.function.name;
			}
			if (typeof delta?.function?.arguments === 'string')
				argsText += delta.function.arguments;
		}
	}
	return { name, args: parseArgs(argsText) };
}

function loadDumps(directory: string, only?: string): Dump[] {
	return readdirSync(directory)
		.filter(
			(file) =>
				file.includes('--mutation_review--') &&
				file.endsWith('.json') &&
				(!only || file.includes(only))
		)
		.sort()
		.map((file) => {
			const dump = JSON.parse(readFileSync(join(directory, file), 'utf8'));
			const timing = dump.outcome?.timing ?? {};
			return {
				file,
				body: dump.request,
				promptTokens: Number(dump.outcome?.usage?.prompt_tokens ?? 30_000),
				baseline: baselineDecision(dump.responseEvents ?? []),
				baselineModel: dump.outcome?.modelUsed ?? null,
				baselineCostUsd:
					typeof dump.outcome?.usage?.cost === 'number' ? dump.outcome.usage.cost : null,
				baselineWallMs:
					typeof timing.networkStartedAtMs === 'number' && dump.outcome?.completedAt
						? Date.parse(dump.outcome.completedAt) - timing.networkStartedAtMs
						: null
			};
		});
}

function summarize(decision: Decision): string {
	if (!decision.name) return 'no decision';
	const reason = typeof decision.args?.reason === 'string' ? decision.args.reason : '';
	return `${decision.name}: ${reason.slice(0, 160)}`;
}

async function main() {
	const model = arg('model', 'openai/gpt-6-luna') as string;
	const samples = Number(arg('samples', '2'));
	const maxUsd = Number(arg('max-usd', '0.08'));
	const live = process.argv.includes('--live');
	const reasoningEffort = arg('reasoning');
	if (reasoningEffort && !['low', 'medium', 'high'].includes(reasoningEffort)) {
		throw new Error('--reasoning must be low, medium or high');
	}
	const dumpDir = resolve(process.cwd(), '.prompt-dumps');
	const dumps = loadDumps(dumpDir, arg('only'));
	console.info(
		`${dumps.length} captured reviews × ${samples} samples on ${model}${reasoningEffort ? ` (reasoning ${reasoningEffort})` : ''}; cap $${maxUsd}${live ? '' : ' (dry run)'}`
	);

	const apiKey = parse(readFileSync(resolve(process.cwd(), '.env'))).PRIVATE_OPENROUTER_API_KEY;
	if (live && !apiKey)
		throw new Error('PRIVATE_OPENROUTER_API_KEY missing from apps/worker/.env');

	const results: Record<string, unknown>[] = [];
	let spent = 0;
	for (const dump of dumps) {
		console.info(
			`\n${dump.file.slice(0, 60)}…\n  baseline ${dump.baselineModel}: ${summarize(dump.baseline)}`
		);
		for (let sample = 1; sample <= samples; sample += 1) {
			const maxTokens = Number(dump.body.max_tokens ?? 4_000);
			const worst =
				dump.promptTokens * PROMPT_USD_PER_TOKEN + maxTokens * COMPLETION_USD_PER_TOKEN;
			if (spent + worst > maxUsd) {
				console.warn(
					`  skip sample ${sample}: $${spent.toFixed(4)} + worst $${worst.toFixed(4)} > $${maxUsd}`
				);
				continue;
			}
			const {
				stream: _stream,
				stream_options: _options,
				prompt_cache_key: _key,
				session_id: _session,
				...rest
			} = dump.body;
			const body = {
				...rest,
				model,
				provider: { ...(rest.provider ?? {}), order: ['azure'], zdr: true },
				...(reasoningEffort
					? { reasoning: { ...(rest.reasoning ?? {}), effort: reasoningEffort } }
					: {}),
				usage: { include: true }
			};
			if (!live) {
				console.info(
					`  would send sample ${sample}: ${JSON.stringify(body).length} bytes, worst $${worst.toFixed(4)}`
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
					'X-Title': 'BuildOS reviewer model replay'
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(120_000)
			});
			const json = (await response.json().catch(() => null)) as Record<string, any> | null;
			const wallMs = Date.now() - started;
			const usage = json?.usage ?? {};
			const cost = typeof usage.cost === 'number' ? usage.cost : worst;
			spent += cost;
			const toolCall = json?.choices?.[0]?.message?.tool_calls?.[0];
			const decision: Decision = {
				name: toolCall?.function?.name ?? null,
				args: parseArgs(String(toolCall?.function?.arguments ?? ''))
			};
			const sameDecision = decision.name === dump.baseline.name;
			const sameBatch =
				decision.name !== 'approve_mutation_batch_review' ||
				decision.args?.batch_sha256 === dump.baseline.args?.batch_sha256;
			const row = {
				file: dump.file,
				sample,
				model: json?.model ?? null,
				provider: json?.provider ?? null,
				status: response.status,
				finishReason: json?.choices?.[0]?.finish_reason ?? null,
				promptTokens: usage.prompt_tokens ?? null,
				completionTokens: usage.completion_tokens ?? null,
				reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
				wallMs,
				costUsd: cost,
				baseline: dump.baseline,
				baselineCostUsd: dump.baselineCostUsd,
				baselineWallMs: dump.baselineWallMs,
				decision,
				sameDecision,
				sameBatch,
				error: response.ok ? null : JSON.stringify(json?.error ?? json).slice(0, 500)
			};
			results.push(row);
			console.info(
				`  ${sameDecision && sameBatch ? 'MATCH ' : 'DIFFER'} s${sample} ${row.provider} · ${(wallMs / 1000).toFixed(1)}s · ${row.completionTokens} tok (${row.reasoningTokens} reasoning) · $${cost.toFixed(4)} · ${summarize(decision)}`
			);
		}
	}
	if (live) {
		const matches = results.filter((row) => row.sameDecision && row.sameBatch).length;
		const outFile = join(
			dumpDir,
			`reviewer-replay-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
		);
		writeFileSync(outFile, JSON.stringify(results, null, 2), { mode: 0o600 });
		console.info(
			`\n${matches}/${results.length} match the GPT-5.6 decision · spent $${spent.toFixed(4)} → ${outFile}`
		);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
