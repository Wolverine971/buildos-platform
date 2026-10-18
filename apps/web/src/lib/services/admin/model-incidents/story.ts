// apps/web/src/lib/services/admin/model-incidents/story.ts
//
// A plain-language account of one model-call incident, built only from the
// row's structured fields (reason codes, timeline events, byte samples, the
// attempt receipt, the drain result, OpenRouter's generation record). Nothing
// here interprets prompt or reply text.
import type { IncidentEvent, IncidentJson, ModelIncidentRow } from './types';

export type IncidentFindingTone = 'info' | 'warning' | 'danger' | 'success';

export type IncidentStory = {
	/** One line: what went wrong. */
	headline: string;
	/** Where the call came from: "Chat · main step", "Daily brief · project brief". */
	source: string;
	/** What happened, in order: the call, the timeline, the ending, OpenRouter's record, the reply. */
	paragraphs: string[];
	/** What the data points at, each with how much it matters. */
	findings: Array<{ tone: IncidentFindingTone; text: string }>;
};

const record = (value: unknown): IncidentJson =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as IncidentJson) : {};
const num = (value: unknown): number | null =>
	typeof value === 'number' && Number.isFinite(value) ? value : null;
const str = (value: unknown): string | null =>
	typeof value === 'string' && value.trim() ? value.trim() : null;

export function seconds(ms: number | null | undefined): string {
	if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
	return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

function plural(count: number, noun: string): string {
	return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;
}

function humanize(code: string): string {
	const text = code.replace(/[_-]+/g, ' ').trim();
	return text.charAt(0).toUpperCase() + text.slice(1);
}

const PASS_ROLE_LABELS: Record<string, string> = {
	acting: 'main step',
	final_response: 'final answer',
	repair: 'repair pass',
	mutation_review: 'change reviewer',
	contract_review: 'change reviewer',
	research_review: 'research reviewer'
};

const CHAT_LANES = new Set(['agentic_chat_worker_stream']);

/** "Chat · main step", or the background job's own name. */
export function incidentSource(row: Pick<ModelIncidentRow, 'lane' | 'pass_role'>): string {
	if (CHAT_LANES.has(row.lane)) {
		const role = row.pass_role
			? (PASS_ROLE_LABELS[row.pass_role] ?? humanize(row.pass_role))
			: null;
		return role ? `Chat · ${role}` : 'Chat';
	}
	const families: Array<[string, string]> = [
		['daily_brief_', 'Daily brief'],
		['project_loop_', 'Project check'],
		['chat_checkpoint_', 'Chat checkpoint'],
		['consolidation_', 'Consolidation'],
		['table_ai_fill', 'Table AI fill']
	];
	for (const [prefix, label] of families) {
		if (!row.lane.startsWith(prefix)) continue;
		const tail = row.lane.slice(prefix.length).replace(/_+/g, ' ').trim();
		return tail ? `${label} · ${tail}` : label;
	}
	return humanize(row.lane);
}

const REASON_LABELS: Record<string, string> = {
	slow_stream: 'The reply slowed to a crawl mid-stream',
	hedge_slow_stream: 'The reply stalled, so a backup request started',
	hedge_no_first_progress: 'The model sent nothing for 6 s, so a backup request started',
	first_progress_stall: 'The response opened but the model sent no output',
	first_progress_timeout: 'The response opened but the model sent no output',
	response_headers_timeout: 'The provider did not start responding in time',
	request_timeout: 'The request ran past its deadline',
	reviewer_first_progress_stall: 'The reviewer sent no output after the response opened',
	reviewer_slow_stream: 'The reviewer streamed too slowly',
	runaway_reasoning_cutoff: 'The model kept thinking without answering, so it was cut off',
	output_budget_exhausted: 'The model used its whole output budget',
	tool_call_rejected: 'The model called a tool it was not offered, or wrote invalid arguments',
	provider_tool_arguments_truncated: "A tool call's arguments were cut off",
	provider_tool_call_disabled: 'The model called a tool while tools were off',
	provider_finish_reason_error: 'The provider ended the reply with an error',
	provider_retryable_error: 'The request failed before the reply started',
	provider_permanent_error: 'The request failed',
	timeout: 'The request ran past its deadline',
	empty_reply: 'The model returned no text',
	empty_reply_length: 'The model spent its whole token budget thinking and returned no text',
	invalid_response: 'The reply was not in the shape the job asked for',
	invalid_json_body: 'OpenRouter sent a body that was not JSON',
	provider_error_response: 'OpenRouter returned an error inside a 200 response'
};

export function incidentHeadline(row: Pick<ModelIncidentRow, 'reason' | 'http_status'>): string {
	const http = /^http_(\d{3})$/.exec(row.reason);
	if (http) {
		const status = Number(http[1]);
		if (status === 429) return 'OpenRouter returned 429: rate limited';
		if (status >= 500) return `OpenRouter returned ${status}: a server error`;
		return `OpenRouter returned ${status}: the request was rejected`;
	}
	return REASON_LABELS[row.reason] ?? humanize(row.reason);
}

function eventsOf(row: ModelIncidentRow): IncidentEvent[] {
	const events = record(row.timeline).events;
	return Array.isArray(events) ? (events as IncidentEvent[]) : [];
}

function samplesOf(row: ModelIncidentRow): Array<[number, number]> {
	const bytes = record(row.timeline).bytes;
	return Array.isArray(bytes) ? (bytes as Array<[number, number]>) : [];
}

/** The longest stretch with no bytes between the request and the attempt's end. */
export function longestSilence(
	samples: ReadonlyArray<readonly [number, number]>,
	endMs: number | null
): { fromMs: number; toMs: number } | null {
	let previous = 0;
	let best: { fromMs: number; toMs: number } | null = null;
	const points = [
		...samples.map(([at]) => at).filter((at) => endMs === null || at <= endMs),
		...(endMs === null ? [] : [endMs])
	];
	for (const at of points) {
		if (!best || at - previous > best.toMs - best.fromMs) best = { fromMs: previous, toMs: at };
		previous = at;
	}
	return best;
}

const firstEvent = (events: IncidentEvent[], name: string) =>
	events.find((event) => event.event === name) ?? null;

function timelineParagraph(row: ModelIncidentRow, events: IncidentEvent[]): string | null {
	if (!events.length) return null;
	const parts: string[] = [];
	const opened = firstEvent(events, 'response_opened');
	const firstByte = firstEvent(events, 'first_byte');
	const ended = firstEvent(events, 'attempt_ended');
	if (opened) {
		parts.push(
			`The response opened after ${seconds(opened.at_ms)} (HTTP ${String(opened.status ?? '?')})`
		);
	} else {
		parts.push('No response ever opened during the attempt');
	}
	if (firstByte) parts.push(`the first bytes arrived at ${seconds(firstByte.at_ms)}`);
	const stalls = events.filter((event) => event.event === 'stall');
	if (stalls[0]) {
		const detail = stalls[0];
		const window = num(detail.window_ms);
		const bytes = num(detail.output_bytes);
		parts.push(
			`the stall was detected at ${seconds(detail.at_ms)} (${String(detail.reason)}${
				window !== null && bytes !== null
					? `: ${plural(bytes, 'byte')} of output in ${seconds(window)}`
					: ''
			})`
		);
	}
	const samples = samplesOf(row);
	const silence = longestSilence(samples, ended?.at_ms ?? null);
	if (silence && silence.toMs - silence.fromMs >= 1000 && firstByte) {
		parts.push(
			`the longest gap with nothing arriving was ${seconds(silence.toMs - silence.fromMs)} (${seconds(silence.fromMs)}–${seconds(silence.toMs)})`
		);
	}
	if (ended) {
		parts.push(
			`the attempt ended at ${seconds(ended.at_ms)} as ${String(ended.status ?? 'unknown')}${
				ended.error_class ? ` (${String(ended.error_class)})` : ''
			}`
		);
	}
	const sentence = parts.join(', ');
	return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

function endingParagraph(row: ModelIncidentRow, events: IncidentEvent[]): string | null {
	const eventual = row.eventual ? record(row.eventual) : null;
	if (eventual) {
		if (eventual.status === 'running') {
			return 'It was left running in the background so its ending could be recorded, but no ending was saved (the worker may have restarted).';
		}
		const total = seconds(num(eventual.total_ms));
		const endedBy = str(eventual.ended_by);
		const usage = record(eventual.usage);
		const tokens = num(usage.completion_tokens);
		if (endedBy === 'stream_end' && eventual.completed === true) {
			return `It was left running in the background and finished on its own ${total} after it was sent (finish reason ${String(eventual.finish_reason)}${
				tokens !== null ? `, ${plural(tokens, 'output token')}` : ''
			}). So it was slow, not dead.`;
		}
		if (endedBy === 'deadline') {
			return `It was left running in the background and was still going at the ${total} limit, so it was ended there.`;
		}
		if (endedBy === 'response_error') {
			return `It was left running; ${total} after it was sent the provider answered with HTTP ${String(eventual.http_status ?? '?')}.`;
		}
		if (endedBy === 'cancelled') {
			return `It was left running until the job itself was cancelled, ${total} after it was sent.`;
		}
		if (endedBy === 'request_error' || endedBy === 'stream_error') {
			return `It was left running, and the connection failed ${total} after it was sent.`;
		}
		return `It was left running and ended (${String(endedBy ?? 'unknown')}) ${total} after it was sent.`;
	}
	const skipped = firstEvent(events, 'drain_skipped');
	if (skipped) {
		const why = String(skipped.why ?? '');
		const reasons: Record<string, string> = {
			drain_budget: 'too many stalled requests were already running in the background',
			budgeted_request: 'it was a budgeted workflow request',
			stream_already_ended: 'its reply had already arrived in full',
			nothing_to_record: 'there was no reply stream to record'
		};
		return `It was ended with its attempt, not left running, because ${reasons[why] ?? why}.`;
	}
	// An error that got its answer has no separate ending to tell.
	return row.kind === 'stall' ? 'It was ended with its attempt.' : null;
}

function openRouterParagraph(row: ModelIncidentRow): string | null {
	const stats = row.generation_stats ? record(row.generation_stats) : null;
	if (!stats) return null;
	if ('lookup_failed' in stats) {
		return `OpenRouter's record of the generation could not be fetched (${String(stats.lookup_failed)}).`;
	}
	const parts = [
		`OpenRouter recorded it as served by ${String(stats.provider_name ?? 'an unknown provider')}`
	];
	const latency = num(stats.latency);
	const generation = num(stats.generation_time);
	if (latency !== null) parts.push(`first token after ${seconds(latency)}`);
	if (generation !== null) parts.push(`generation time ${seconds(generation)}`);
	const completion = num(stats.tokens_completion) ?? num(stats.native_tokens_completion);
	if (completion !== null) parts.push(plural(completion, 'output token'));
	if (typeof stats.cancelled === 'boolean') {
		parts.push(stats.cancelled ? 'cancelled upstream' : 'not cancelled upstream');
	}
	return parts.join(', ') + '.';
}

function replyParagraph(row: ModelIncidentRow): string | null {
	const outcome = record(row.outcome);
	const captured = record(outcome.captured_stream);
	const projection = record(outcome.request_projection);
	const parts: string[] = [];
	const content = num(captured.content_chars);
	const reasoning = num(captured.reasoning_chars);
	const tools = Array.isArray(captured.tool_calls) ? (captured.tool_calls as string[]) : [];
	if (content !== null || reasoning !== null || tools.length) {
		parts.push(
			`Before the attempt ended the model had sent ${plural(reasoning ?? 0, 'character')} of reasoning and ${plural(content ?? 0, 'character')} of text${
				tools.length
					? `, and started ${tools.length === 1 ? 'a tool call' : 'tool calls'}: ${tools.join(', ')}`
					: ''
			}.`
		);
	}
	// Background jobs (not streamed) record the reply's token usage instead.
	const usage = record(outcome.usage);
	const outputTokens = num(usage.completion_tokens);
	if (outputTokens !== null) {
		const reasoningTokens = num(record(usage.completion_tokens_details).reasoning_tokens);
		parts.push(
			`The model used ${plural(outputTokens, 'output token')}${
				reasoningTokens !== null
					? `, ${reasoningTokens.toLocaleString('en-US')} of them reasoning`
					: ''
			}${outcome.finish_reason ? `, and stopped with finish reason ${String(outcome.finish_reason)}` : ''}.`
		);
	}
	const errorBody = str(row.response_body);
	if (row.http_status !== null && row.http_status >= 400 && errorBody) {
		let message = errorBody.slice(0, 240);
		try {
			const parsed = record(JSON.parse(errorBody));
			const error = record(parsed.error);
			const metadata = record(error.metadata);
			// The provider's own short error text, when OpenRouter passes it through.
			const raw = str(metadata.raw);
			message =
				[
					str(error.message),
					raw && raw.length <= 200 ? `: ${raw}` : null,
					str(metadata.provider_name)
						? ` (provider ${String(metadata.provider_name)})`
						: null
				]
					.filter(Boolean)
					.join('') || message;
		} catch {
			// Plain-text error bodies are shown as is.
		}
		parts.push(`The error said: “${message}”.`);
	}
	if (projection.reply_withheld === true) {
		parts.push(
			'The request carried email, calendar or web content, so that content and the reply text were not stored; only timing and counts were.'
		);
	}
	return parts.length ? parts.join(' ') : null;
}

function findingsFor(row: ModelIncidentRow, events: IncidentEvent[]): IncidentStory['findings'] {
	const findings: IncidentStory['findings'] = [];
	const eventual = row.eventual ? record(row.eventual) : null;
	const stats = row.generation_stats ? record(row.generation_stats) : null;
	const outcome = record(row.outcome);
	const provider = row.provider ?? (stats ? str(stats.provider_name) : null) ?? 'the provider';
	const opened = firstEvent(events, 'response_opened');

	if (eventual?.completed === true && num(eventual.total_ms) !== null) {
		findings.push({
			tone: 'warning',
			text: `${provider} was slow, not broken: the full reply took ${seconds(num(eventual.total_ms))}. Repeated rows like this point at that provider's throughput.`
		});
	}
	if (eventual?.ended_by === 'deadline') {
		findings.push({
			tone: 'danger',
			text: `${provider} never finished, even with ${seconds(num(eventual.total_ms))}. That looks like a stuck or dropped request upstream.`
		});
	}
	if (row.reason === 'response_headers_timeout' && eventual?.ended_by === 'response_error') {
		findings.push({
			tone: 'warning',
			text: `The provider eventually answered with HTTP ${String(eventual.http_status)}: it was queueing the request before rejecting it.`
		});
	}
	if (
		stats &&
		stats.cancelled === false &&
		(row.eventual === null || eventual?.completed !== true)
	) {
		const ended = firstEvent(events, 'attempt_aborted');
		if (ended) {
			findings.push({
				tone: 'warning',
				text: `We hung up, but OpenRouter did not cancel upstream: ${provider} kept generating and the full generation was likely billed. This provider may not support stream cancellation.`
			});
		}
	}
	const latency = stats ? num(stats.latency) : null;
	if (latency !== null && opened && latency > 4_000) {
		findings.push({
			tone: 'info',
			text: `Most of the wait happened before the first token (${seconds(latency)} on OpenRouter's clock): the provider was slow to start, not slow to stream.`
		});
	}
	if (row.reason === 'http_429') {
		findings.push({
			tone: 'warning',
			text: 'Rate limited. Check whether the request pinned one provider (provider.order with allow_fallbacks: false); OpenRouter only passes a 429 back when it cannot fall back.'
		});
	}
	if (row.reason === 'tool_call_rejected') {
		findings.push({
			tone: 'info',
			text: "The model's mistake, not the provider's: look at the tools it was offered and the tool call in the reply below."
		});
	}
	if (row.reason === 'runaway_reasoning_cutoff' || row.reason === 'empty_reply_length') {
		findings.push({
			tone: 'info',
			text: 'The model reasoned past its budget. The prompt may be ambiguous or ask for too much at once; compare it with similar calls that succeeded.'
		});
	}
	if (num(row.provider_attempt) !== null && (row.provider_attempt ?? 1) > 1) {
		findings.push({
			tone: 'info',
			text: `This was attempt ${row.provider_attempt}: an earlier attempt for the same step also failed or was replaced.`
		});
	}
	const context = record(outcome.context);
	if (context.hedge_backup) {
		const hedge = record(context.hedge_backup);
		findings.push({
			tone: 'info',
			text: `This request was the backup for a stalled one (${String(hedge.reason ?? 'stall')}), avoiding ${
				Array.isArray(hedge.avoided_providers) && hedge.avoided_providers.length
					? hedge.avoided_providers.join(', ')
					: 'no provider'
			}.`
		});
	}
	return findings;
}

export function buildIncidentStory(row: ModelIncidentRow): IncidentStory {
	const events = eventsOf(row);
	const source = incidentSource(row);
	const route =
		row.model_used && row.model_used !== row.model_requested
			? `${row.model_requested} (answered by ${row.model_used})`
			: row.model_requested;
	const opening = [
		`${source}${
			row.logical_provider_round !== null ? `, round ${row.logical_provider_round}` : ''
		}${row.provider_attempt !== null ? `, attempt ${row.provider_attempt}` : ''}: asked ${route}${
			row.provider ? `, served by ${row.provider}` : ''
		}.`,
		row.duration_ms !== null ? `The attempt lasted ${seconds(row.duration_ms)}.` : null
	]
		.filter(Boolean)
		.join(' ');
	const paragraphs = [
		opening,
		timelineParagraph(row, events),
		endingParagraph(row, events),
		openRouterParagraph(row),
		replyParagraph(row)
	].filter((paragraph): paragraph is string => Boolean(paragraph));
	return {
		headline: incidentHeadline(row),
		source,
		paragraphs,
		findings: findingsFor(row, events)
	};
}
