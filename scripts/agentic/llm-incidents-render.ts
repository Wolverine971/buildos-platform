// scripts/agentic/llm-incidents-render.ts
//
// Pure rendering for scripts/agentic/llm-incidents.ts: one `llm_call_incidents`
// row as a readable page (what happened, when the bytes stopped, how it ended,
// what OpenRouter recorded, what came back, and exactly what we sent).

export type IncidentRow = Record<string, unknown>;

type Event = { at_ms: number; event: string } & Record<string, unknown>;

const json = (value: unknown) => JSON.stringify(value, null, 2) ?? 'null';
const seconds = (ms: unknown) => (typeof ms === 'number' ? `${(ms / 1000).toFixed(2)} s` : '—');
const record = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

/** A fence longer than any backtick run inside, so prompts that hold code stay intact. */
function fence(value: string, language = ''): string {
	const longest = Math.max(2, ...Array.from(value.matchAll(/`+/g), (match) => match[0].length));
	const ticks = '`'.repeat(longest + 1);
	return `${ticks}${language}\n${value}\n${ticks}`;
}

/** The longest stretch with no bytes, from first request to the last byte seen. */
export function longestSilence(
	samples: ReadonlyArray<readonly [number, number]>,
	endMs: number | null
): { fromMs: number; toMs: number } | null {
	let previous = 0;
	let best: { fromMs: number; toMs: number } | null = null;
	const points = [...samples.map(([at]) => at), ...(endMs === null ? [] : [endMs])];
	for (const at of points) {
		if (!best || at - previous > best.toMs - best.fromMs) best = { fromMs: previous, toMs: at };
		previous = at;
	}
	return best;
}

/** Bytes per second, as a bar per second of the request. */
export function throughputBars(samples: ReadonlyArray<readonly [number, number]>): string[] {
	if (!samples.length) return [];
	const last = samples.at(-1)![0];
	const buckets = new Array(Math.min(240, Math.floor(last / 1000) + 1)).fill(0) as number[];
	let previousBytes = 0;
	for (const [at, total] of samples) {
		const bucket = Math.min(buckets.length - 1, Math.floor(at / 1000));
		buckets[bucket]! += total - previousBytes;
		previousBytes = total;
	}
	const peak = Math.max(1, ...buckets);
	return buckets.map(
		(bytes, second) =>
			`${String(second).padStart(3)}s ${'█'.repeat(Math.round((bytes / peak) * 40)).padEnd(40)} ${bytes} B`
	);
}

/** Reasoning, text, and tool calls reassembled from raw SSE. */
export function assembleStream(raw: string): {
	reasoning: string;
	content: string;
	toolCalls: Array<{ name: string; arguments: string }>;
	errors: unknown[];
} {
	let reasoning = '';
	let content = '';
	const tools = new Map<number, { name: string; arguments: string }>();
	const errors: unknown[] = [];
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed.startsWith('data:')) continue;
		const data = trimmed.slice(5).trim();
		if (!data || data === '[DONE]') continue;
		let chunk: Record<string, unknown>;
		try {
			chunk = JSON.parse(data) as Record<string, unknown>;
		} catch {
			continue;
		}
		if (chunk.error) errors.push(chunk.error);
		for (const choice of (Array.isArray(chunk.choices) ? chunk.choices : []) as Array<
			Record<string, unknown>
		>) {
			const delta = record(choice.delta);
			if (typeof delta.reasoning === 'string') reasoning += delta.reasoning;
			if (typeof delta.content === 'string') content += delta.content;
			for (const call of (Array.isArray(delta.tool_calls) ? delta.tool_calls : []) as Array<
				Record<string, unknown>
			>) {
				const index = typeof call.index === 'number' ? call.index : tools.size;
				const entry = tools.get(index) ?? { name: '', arguments: '' };
				const fn = record(call.function);
				if (typeof fn.name === 'string') entry.name += fn.name;
				if (typeof fn.arguments === 'string') entry.arguments += fn.arguments;
				tools.set(index, entry);
			}
		}
	}
	return {
		reasoning,
		content,
		toolCalls: [...tools.entries()].sort(([a], [b]) => a - b).map(([, call]) => call),
		errors
	};
}

export function renderIncident(row: IncidentRow): string {
	const timeline = record(row.timeline);
	const events = (Array.isArray(timeline.events) ? timeline.events : []) as Event[];
	const samples = (Array.isArray(timeline.bytes) ? timeline.bytes : []) as Array<
		[number, number]
	>;
	const outcome = record(row.outcome);
	const receipt = record(outcome.receipt);
	const usageLog = record(outcome.usage_log);
	const eventual = row.eventual ? record(row.eventual) : null;
	const stats = row.generation_stats ? record(row.generation_stats) : null;
	const endedAt = events.find((event) => event.event === 'attempt_ended')?.at_ms ?? null;
	const silence = longestSilence(samples, endedAt);
	const lines: string[] = [];

	lines.push(
		`# ${row.kind === 'stall' ? 'Stall' : 'Error'}: ${String(row.reason)}`,
		'',
		`${String(row.created_at)} · ${String(row.lane)} · ${String(row.pass_role ?? '—')} round ${String(row.logical_provider_round ?? '—')} attempt ${String(row.provider_attempt ?? '—')}`,
		'',
		'| | |',
		'|---|---|',
		`| Model asked for | ${String(row.model_requested)} |`,
		`| Model that answered | ${String(row.model_used ?? '—')} |`,
		`| Provider | ${String(row.provider ?? '—')} |`,
		`| HTTP status | ${String(row.http_status ?? 'no response')} |`,
		`| Attempt lasted | ${seconds(row.duration_ms)} |`,
		`| Error | ${String(usageLog.error ?? receipt.error_class ?? '—')} |`,
		`| Turn · session | ${String(row.turn_run_id ?? '—')} · ${String(row.session_id ?? '—')} |`,
		`| Usage log · generation | ${String(row.usage_log_id ?? '—')} · ${String(row.generation_id ?? '—')} |`,
		`| Request size | ${String(outcome.request_bytes ?? '—')} bytes${outcome.request_truncated ? ' (stored truncated)' : ''} |`,
		''
	);

	lines.push('## What happened', '');
	for (const event of events) {
		const { at_ms: at, event: name, ...detail } = event;
		const extra = Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : '';
		lines.push(`- ${seconds(at).padStart(9)}  ${name}${extra}`);
	}
	if (silence && silence.toMs - silence.fromMs >= 1000) {
		lines.push(
			'',
			`Longest silence: ${seconds(silence.toMs - silence.fromMs)} (from ${seconds(silence.fromMs)} to ${seconds(silence.toMs)}).`
		);
	}
	const bars = throughputBars(samples);
	if (bars.length) lines.push('', 'Bytes received per second:', '', fence(bars.join('\n')));
	lines.push('');

	lines.push('## How it ended', '');
	if (eventual) {
		lines.push(
			eventual.status === 'running'
				? 'Left running in the background; the worker had not recorded its end.'
				: `Left running in the background, it ended by **${String(eventual.ended_by)}** after ${seconds(eventual.total_ms)} from the request` +
						`${eventual.completed ? ', and the provider finished the answer' : ', without a finished answer'}` +
						` (finish reason ${String(eventual.finish_reason ?? '—')}, ${String(eventual.bytes ?? 0)} bytes).`,
			'',
			fence(json(eventual), 'json'),
			''
		);
	} else {
		lines.push('The request was ended with its attempt (not left running).', '');
	}
	if (stats) {
		lines.push(
			"### OpenRouter's record of the generation",
			'',
			`Provider ${String(stats.provider_name ?? '—')} · first token ${String(stats.latency ?? '—')} ms · generation ${String(stats.generation_time ?? '—')} ms · cancelled ${String(stats.cancelled ?? '—')} · finish ${String(stats.native_finish_reason ?? stats.finish_reason ?? '—')}`,
			'',
			fence(json(stats), 'json'),
			''
		);
	}
	lines.push('### Attempt receipt and outcome', '', fence(json(outcome), 'json'), '');

	lines.push('## What came back', '');
	const body = typeof row.response_body === 'string' ? row.response_body : '';
	const assembled = assembleStream(body);
	if (assembled.reasoning) lines.push('### Reasoning', '', fence(assembled.reasoning), '');
	if (assembled.content) lines.push('### Text', '', fence(assembled.content), '');
	for (const call of assembled.toolCalls) {
		lines.push(`### Tool call: ${call.name || '(unnamed)'}`, '', fence(call.arguments), '');
	}
	if (assembled.errors.length) {
		lines.push('### Error frames', '', fence(json(assembled.errors), 'json'), '');
	}
	if (body && !assembled.reasoning && !assembled.content && !assembled.toolCalls.length) {
		lines.push('### Body', '', fence(body), '');
	}
	if (!body) lines.push('No response bytes were received.', '');
	if (row.response_truncated)
		lines.push('(The stored response is cut at the capture bound.)', '');
	lines.push('### Response headers', '', fence(json(row.response_headers ?? null), 'json'), '');

	lines.push('## What we sent', '');
	let request: Record<string, unknown> = {};
	try {
		request = JSON.parse(String(row.request_body)) as Record<string, unknown>;
	} catch {
		lines.push('(The stored body is not complete JSON.)', '', fence(String(row.request_body)));
	}
	const { messages, tools, ...settings } = request;
	lines.push('### Settings', '', fence(json(settings), 'json'), '');
	lines.push('### Headers', '', fence(json(row.request_headers ?? {}), 'json'), '');
	const messageList = Array.isArray(messages) ? (messages as Array<Record<string, unknown>>) : [];
	lines.push(`### Messages (${messageList.length}, in order)`, '');
	messageList.forEach((message, index) => {
		const { role, content, ...extra } = message;
		lines.push(
			`#### ${index + 1}. ${String(role)}`,
			'',
			fence(typeof content === 'string' ? content : json(content)),
			...(Object.keys(extra).length ? ['', fence(json(extra), 'json')] : []),
			''
		);
	});
	const toolList = Array.isArray(tools) ? (tools as Array<Record<string, unknown>>) : [];
	if (toolList.length) {
		lines.push(
			`### Tools (${toolList.length})`,
			'',
			toolList.map((tool) => `- ${String(record(tool.function).name)}`).join('\n'),
			'',
			fence(json(toolList), 'json'),
			''
		);
	}
	return lines.join('\n');
}

export function renderIncidentList(rows: IncidentRow[]): string {
	if (!rows.length) return 'No incidents in this window.';
	const header =
		'when (UTC)           kind   reason                     role             model / provider                          http  lasted   left running                id';
	return [
		header,
		...rows.map((row) => {
			const eventual = row.eventual ? record(row.eventual) : null;
			const ran = eventual
				? eventual.status === 'running'
					? 'running'
					: `${String(eventual.ended_by)} ${seconds(eventual.total_ms)}`
				: '—';
			return [
				String(row.created_at).slice(0, 19).replace('T', ' ').padEnd(20),
				String(row.kind).padEnd(6),
				String(row.reason).slice(0, 26).padEnd(26),
				String(row.pass_role ?? '—').padEnd(16),
				`${String(row.model_used ?? row.model_requested)} / ${String(row.provider ?? '—')}`
					.slice(0, 41)
					.padEnd(41),
				String(row.http_status ?? '—').padEnd(5),
				seconds(row.duration_ms).padEnd(8),
				ran.slice(0, 27).padEnd(27),
				String(row.id)
			].join(' ');
		})
	].join('\n');
}
