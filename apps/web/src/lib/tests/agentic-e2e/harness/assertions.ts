// apps/web/src/lib/tests/agentic-e2e/harness/assertions.ts
//
// Deterministic assertion helpers. Each throws an Error with a rich, debuggable
// message (captured tool list, telemetry, text) so a failure explains itself.
import type { TurnResult } from './types';
import type { ToolExecutionRow, TurnRunRow } from './telemetry';

// Phrases that must never appear in user-visible assistant text: self-correction
// spirals and prompt-scaffolding echoes. Mirrors lite-prompt-live.test.ts.
export const FORBIDDEN_ASSISTANT_PATTERNS = [
	'No, wait',
	'Prompt variant:',
	'lite_seed_v1',
	'Final-response rules',
	'Communication pattern',
	'# BuildOS Agentic Chat'
];

function toolNames(turn: TurnResult): string[] {
	return turn.toolCalls.map((c) => c.function.name);
}

// finished_reason values the stream reports on a normal, healthy turn. The raw
// LLM stop reason ("stop"/"end_turn") passes through alongside the orchestrator's
// own "completed"; treat all of these as success. Only genuine failure/abort
// reasons are rejected here (the authoritative status check is on the persisted
// chat_turn_runs row via assertTurnRunCompleted).
const FAILURE_FINISH_REASONS = new Set(['error', 'cancelled', 'failed', 'turn_rejected']);

/** The turn streamed to a clean completion with no error events. */
export function assertTurnSucceeded(turn: TurnResult): void {
	if (turn.errors.length > 0) {
		throw new Error(
			`[assert] turn emitted ${turn.errors.length} error event(s): ` +
				turn.errors.map((e) => e.error).join(' | ')
		);
	}
	if (!turn.completed) {
		throw new Error(
			'[assert] turn did not reach a terminal `done` event (stream closed early)'
		);
	}
	if (turn.finishedReason && FAILURE_FINISH_REASONS.has(turn.finishedReason)) {
		throw new Error(
			`[assert] turn finished_reason was "${turn.finishedReason}" (a failure state)`
		);
	}
}

/** The model called `name` at least once this turn. */
export function assertToolCalled(turn: TurnResult, name: string): void {
	if (!toolNames(turn).includes(name)) {
		throw new Error(
			`[assert] expected tool "${name}" to be called; got [${toolNames(turn).join(', ') || 'none'}]. ` +
				`Assistant text: "${turn.assistantText.slice(0, 200)}"`
		);
	}
}

/** The model called at least one of `names` this turn. Returns the ones it did call. */
export function assertAnyToolCalled(turn: TurnResult, names: string[]): string[] {
	const called = toolNames(turn).filter((n) => names.includes(n));
	if (called.length === 0) {
		throw new Error(
			`[assert] expected one of [${names.join(', ')}]; got [${toolNames(turn).join(', ') || 'none'}]. ` +
				`Assistant text: "${turn.assistantText.slice(0, 200)}"`
		);
	}
	return called;
}

/** Assistant text is free of scaffolding/self-correction leakage. */
export function assertCleanText(turn: TurnResult): void {
	for (const pattern of FORBIDDEN_ASSISTANT_PATTERNS) {
		if (turn.assistantText.includes(pattern)) {
			throw new Error(`[assert] assistant text contained forbidden pattern "${pattern}"`);
		}
	}
}

// Per-turn observability (chat_turn_runs / chat_tool_executions) is flushed on a
// lambda-tuned budget that completes on Vercel but NOT under local `vite dev`, so
// those rows can stay at status='running' locally even for a healthy turn. The
// authoritative local signals are the SSE stream + ground-truth onto_* rows.
// Telemetry assertions are therefore SOFT by default (warn, don't fail); set
// AGENTIC_ASSERT_TELEMETRY=true when running against an environment that
// finalizes observability (production/CI) to make them hard.
const TELEMETRY_STRICT = process.env.AGENTIC_ASSERT_TELEMETRY === 'true';

function telemetryFail(message: string): void {
	if (TELEMETRY_STRICT) throw new Error(`[assert] ${message}`);
	console.warn(`[agentic-e2e] (soft telemetry) ${message} — not finalized under local vite dev`);
}

/** The persisted turn telemetry row shows a completed run (soft unless STRICT). */
export function assertTurnRunCompleted(row: TurnRunRow | null): void {
	if (!row) {
		telemetryFail('no chat_turn_runs row persisted for this stream_run_id');
		return;
	}
	if (row.status !== 'completed') {
		telemetryFail(
			`chat_turn_runs.status was "${row.status}" (finished_reason=${row.finished_reason})`
		);
	}
}

/** A tool execution for `name` was persisted with success=true (soft unless STRICT). */
export function assertToolExecutionSucceeded(
	execs: ToolExecutionRow[],
	name: string
): ToolExecutionRow | null {
	const match = execs.filter((e) => e.tool_name === name);
	if (match.length === 0) {
		telemetryFail(
			`no chat_tool_executions row for "${name}"; got [${
				execs.map((e) => e.tool_name).join(', ') || 'none'
			}]`
		);
		return null;
	}
	const ok = match.find((e) => e.success);
	if (!ok) {
		telemetryFail(
			`"${name}" ran but every persisted execution failed: ` +
				match.map((e) => JSON.stringify(e.result)).join(' | ')
		);
		return null;
	}
	return ok;
}

/**
 * At least one persisted tool execution reports an affected entity matching the
 * predicate — the ground-truth signal that a mutation actually landed.
 */
export function assertMutationRecorded(
	execs: ToolExecutionRow[],
	predicate: { kind?: string; operation?: string }
): void {
	const hit = execs.some((e) =>
		e.affected_entities.some(
			(ent) =>
				(!predicate.kind || ent.kind === predicate.kind) &&
				(!predicate.operation || ent.operation === predicate.operation)
		)
	);
	if (!hit) {
		const seen = execs
			.flatMap((e) => e.affected_entities)
			.map((x) => `${x.operation}:${x.kind}`);
		throw new Error(
			`[assert] no affected_entities matched ${JSON.stringify(predicate)}; saw [${
				seen.join(', ') || 'none'
			}]`
		);
	}
}

/** Compact transcript for the LLM judge: what the assistant said + did. */
export function buildTranscript(turn: TurnResult, extra?: Record<string, unknown>): string {
	const parts: string[] = [];
	parts.push(`ASSISTANT TEXT:\n${turn.assistantText || '(none)'}`);
	parts.push(
		`TOOL CALLS:\n${
			turn.toolCalls.map((c) => `- ${c.function.name}(${c.function.arguments})`).join('\n') ||
			'(none)'
		}`
	);
	if (extra) parts.push(`RESULTING STATE:\n${JSON.stringify(extra, null, 2)}`);
	return parts.join('\n\n');
}

export function assertNumericPriorityAtMost(
	actual: number | null,
	maximum: number,
	label: string
): void {
	if (typeof actual !== 'number' || actual > maximum) {
		throw new Error(
			`[assert] ${label} priority was ${actual ?? 'unset'}; expected ${maximum} or higher priority (lower number)`
		);
	}
}

export function nextWeekdayDate(now: Date, weekday: number, timeZone = 'America/New_York'): string {
	const zonedToday = formatDateInZone(now, timeZone);
	const date = new Date(`${zonedToday}T12:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + ((weekday - date.getUTCDay() + 7) % 7));
	return date.toISOString().slice(0, 10);
}

export function assertIsoDate(
	actual: string | null,
	expectedDate: string,
	label: string,
	timeZone = 'America/New_York'
): void {
	const literalDate = actual?.slice(0, 10) ?? null;
	const parsed = actual ? new Date(actual) : null;
	const zonedDate =
		parsed && !Number.isNaN(parsed.getTime()) ? formatDateInZone(parsed, timeZone) : null;
	if (literalDate !== expectedDate && zonedDate !== expectedDate) {
		throw new Error(
			`[assert] ${label} date was ${literalDate ?? 'unset'} (${zonedDate ?? 'invalid'} in ${timeZone}); expected ${expectedDate}`
		);
	}
}

export function extractMarkdownSection(content: string, heading: string): string | null {
	const lines = content.split(/\r?\n/);
	const start = lines.findIndex((line) => normalizeHeading(line) === heading.toLowerCase());
	if (start < 0) return null;
	let end = lines.length;
	for (let index = start + 1; index < lines.length; index += 1) {
		if (normalizeHeading(lines[index] ?? '') !== null) {
			end = index;
			break;
		}
	}
	return lines
		.slice(start + 1, end)
		.join('\n')
		.trim();
}

export function assertMarkdownSectionBullets(
	content: string,
	heading: string,
	minimum: number,
	maximum: number
): string {
	const section = extractMarkdownSection(content, heading);
	if (section === null) {
		throw new Error(`[assert] markdown section "${heading}" was missing`);
	}
	const bulletCount = section.split(/\r?\n/).filter((line) => /^\s*[-*+]\s+\S/.test(line)).length;
	if (bulletCount < minimum || bulletCount > maximum) {
		throw new Error(
			`[assert] markdown section "${heading}" had ${bulletCount} bullets; expected ${minimum}-${maximum}`
		);
	}
	return section;
}

export function normalizeComparableText(value: string): string {
	return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeHeading(line: string): string | null {
	const trimmed = line.trim();
	const markdown = trimmed.match(/^#{1,6}\s+(.+?)\s*#*$/)?.[1];
	const bold = trimmed.match(/^\*\*(.+?)\*\*:?$/)?.[1];
	const heading = markdown ?? bold;
	return heading ? heading.trim().toLowerCase() : null;
}

function formatDateInZone(date: Date, timeZone: string): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(date);
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${values.year}-${values.month}-${values.day}`;
}
