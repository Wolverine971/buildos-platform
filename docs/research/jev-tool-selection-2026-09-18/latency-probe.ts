// docs/research/jev-tool-selection-2026-09-18/latency-probe.ts
// Does a narrowed tool list make the acting model's first token arrive sooner?
// Uncached on purpose (unique nonce per call). Synthetic prompts only.
//   cd apps/worker && NODE_OPTIONS=--conditions=development ./node_modules/.bin/tsx \
//     ../../docs/research/jev-tool-selection-2026-09-18/latency-probe.ts --providers alibaba,nextbit --reps 4
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { workerOpeningSurface } from './surfaces';

const HERE = resolve(__dirname);
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
const arg = (name: string, fallback: string) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? process.argv[i + 1]! : fallback;
};
const key = (() => {
	const text = readFileSync(resolve(HERE, '../../../apps/worker/.env'), 'utf8');
	return /^PRIVATE_OPENROUTER_API_KEY\s*=\s*["']?([^"'\n]+)/m.exec(text)![1]!.trim();
})();

async function ttft(provider: string, tools: unknown[]) {
	const system =
		`Run ${randomUUID()}. You are the BuildOS planning assistant.\n` +
		Array.from(
			{ length: 90 },
			(_, i) =>
				`Rule ${i + 1}: keep records accurate and confirm destinations before writing.`
		).join('\n');
	const started = performance.now();
	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: 'deepseek/deepseek-v4-flash',
			stream: true,
			max_tokens: 24,
			tool_choice: 'auto',
			tools,
			provider: { order: [provider], allow_fallbacks: false },
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: 'block 2 hours tomorrow morning for the pitch deck' }
			]
		})
	});
	if (!response.ok) throw new Error(`${provider} HTTP ${response.status}`);
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let first: number | null = null;
	let buffer = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		// First real delta (content, reasoning, or tool call), not keep-alive comments.
		if (
			first === null &&
			/"delta":\{"(content|reasoning|tool_calls|role)/.test(buffer) &&
			/"delta":\{[^}]*"(content|reasoning)":"[^"]|tool_calls/.test(buffer)
		) {
			first = performance.now() - started;
		}
	}
	return {
		ttftMs: Math.round(first ?? performance.now() - started),
		totalMs: Math.round(performance.now() - started)
	};
}

async function main() {
	const full = workerOpeningSurface('global');
	const narrowed = full.filter((t) => SUBSET.includes(t.function.name));
	const rows: any[] = [];
	for (const provider of arg('providers', 'alibaba,nextbit').split(',')) {
		for (let rep = 0; rep < Number(arg('reps', '4')); rep++) {
			// Alternate order so provider warm-up does not favor one arm.
			for (const [arm, tools] of (rep % 2
				? [
						['narrowed', narrowed],
						['full', full]
					]
				: [
						['full', full],
						['narrowed', narrowed]
					]) as [string, unknown[]][]) {
				try {
					const r = await ttft(provider, tools);
					rows.push({ provider, arm, ...r });
					console.log(
						`${provider.padEnd(10)} ${arm.padEnd(9)} ttft ${String(r.ttftMs).padStart(5)}ms  total ${r.totalMs}ms`
					);
				} catch (e) {
					console.log(`${provider} ${arm} error ${(e as Error).message}`);
				}
			}
		}
	}
	const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
	for (const provider of new Set(rows.map((r) => r.provider))) {
		const m = (arm: string) =>
			median(
				rows.filter((r) => r.provider === provider && r.arm === arm).map((r) => r.ttftMs)
			);
		console.log(`${provider}: median TTFT full ${m('full')}ms vs narrowed ${m('narrowed')}ms`);
	}
	writeFileSync(
		resolve(HERE, `latency-probe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
		JSON.stringify(rows, null, 2)
	);
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
