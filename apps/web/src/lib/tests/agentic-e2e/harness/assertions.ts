// apps/web/src/lib/tests/agentic-e2e/harness/assertions.ts
//
// Deterministic assertion helpers. Each throws an Error with a rich, debuggable
// message (captured tool list, telemetry, text) so a failure explains itself.
import type { AgenticE2EExecutionMode, TurnResult } from './types';
import type { ToolExecutionRow, TurnRunRow } from './telemetry';
import { HARNESS_TIMEZONE } from './timezone';

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

/** Require a tool only on the implementation path that owns it. */
export function assertToolCalledForExecutionMode(
	turn: TurnResult,
	name: string,
	executionMode: AgenticE2EExecutionMode,
	requiredMode: AgenticE2EExecutionMode
): void {
	if (executionMode === requiredMode) assertToolCalled(turn, name);
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
		return;
	}
	if (row.execution_mode === 'worker_realtime' && row.llm_pass_count < 1) {
		telemetryFail('completed worker_realtime turn has no classified logical provider passes');
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

// ---------------------------------------------------------------------------
// Mutation / restraint assertions
//
// Added 2026-07-25 for the Tier 1 breadth scenarios. Nothing in the suite could
// previously assert that a turn wrote NOTHING, which is the eager-agent failure
// mode, nor that a turn wrote something instead of stalling on a confirmation
// question, which is the failure DJ actually reports hitting.
// ---------------------------------------------------------------------------

/**
 * Every ontology write tool follows `{create,update,delete}_onto_*`. Classifying
 * by name keeps this list from drifting as tools are added — a new write tool is
 * caught automatically, which is the safe direction for a restraint assertion.
 */
const MUTATING_TOOL_PATTERN = /^(create|update|delete)_onto_/;

/** Write-tool calls observed on the stream this turn. */
export function mutatingToolCalls(turn: TurnResult): string[] {
	return toolNames(turn).filter((name) => MUTATING_TOOL_PATTERN.test(name));
}

/** The model did NOT call `name` this turn. */
export function assertToolNotCalled(turn: TurnResult, name: string): void {
	if (toolNames(turn).includes(name)) {
		throw new Error(
			`[assert] tool "${name}" was called but must not have been. ` +
				`All calls: [${toolNames(turn).join(', ')}]. ` +
				`Assistant text: "${turn.assistantText.slice(0, 300)}"`
		);
	}
}

/**
 * The turn wrote nothing. Used by the no-op and ambiguous-referent scenarios,
 * where any write at all is the failure regardless of how good it looks.
 */
export function assertNoMutations(turn: TurnResult, why: string): void {
	const writes = mutatingToolCalls(turn);
	if (writes.length > 0) {
		throw new Error(
			`[assert] expected zero mutations (${why}) but the agent called [${writes.join(', ')}]. ` +
				`Assistant text: "${turn.assistantText.slice(0, 300)}"`
		);
	}
}

/** Stable fingerprint of a row set, for before/after "nothing changed" checks. */
export function rowFingerprint(
	rows: Array<{ id: string; updated_at: string; state_key?: string }>
): string {
	return rows
		.map((row) => `${row.id}:${row.state_key ?? ''}:${row.updated_at}`)
		.sort()
		.join('|');
}

/**
 * Ground-truth restraint check: the DB row set is byte-identical to the
 * pre-turn snapshot. Stronger than `assertNoMutations`, which only sees the
 * stream — this catches a write that landed without a visible tool call.
 */
export function assertRowsUnchanged(before: string, after: string, label: string): void {
	if (before !== after) {
		throw new Error(
			`[assert] ${label} changed during a turn that must not have written.\n` +
				`  before: ${before}\n  after:  ${after}`
		);
	}
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, canonicalValue(entry)])
		);
	}
	return value;
}

function comparableValue(value: unknown): string {
	return JSON.stringify(canonicalValue(value)) ?? 'undefined';
}

/**
 * Fingerprint every field on a seeded row while allowing only the exact fields
 * commissioned for that row. This catches collateral edits that ordinary
 * state/count assertions miss (title, description, dates, priority, props,
 * ownership, and lifecycle metadata).
 */
export function assertOnlyAllowedRowFieldsChanged<T extends { id: string }>(
	beforeRows: readonly T[],
	afterRows: readonly T[],
	allowedFieldsById: Readonly<Record<string, readonly string[]>>,
	label: string
): void {
	const beforeIds = beforeRows.map((row) => row.id).sort();
	const afterIds = afterRows.map((row) => row.id).sort();
	if (comparableValue(beforeIds) !== comparableValue(afterIds)) {
		throw new Error(
			`[assert] ${label} row identities changed. before=${comparableValue(beforeIds)} after=${comparableValue(afterIds)}`
		);
	}

	const afterById = new Map(afterRows.map((row) => [row.id, row]));
	const collateral: string[] = [];
	for (const before of beforeRows) {
		const after = afterById.get(before.id);
		if (!after) continue;
		const allowed = new Set(allowedFieldsById[before.id] ?? []);
		const beforeRecord = before as Record<string, unknown>;
		const afterRecord = after as Record<string, unknown>;
		for (const field of new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])) {
			if (allowed.has(field)) continue;
			if (comparableValue(beforeRecord[field]) !== comparableValue(afterRecord[field])) {
				collateral.push(`${before.id}.${field}`);
			}
		}
	}
	if (collateral.length > 0) {
		throw new Error(
			`[assert] ${label} changed uncommissioned field(s): ${collateral.join(', ')}`
		);
	}
}

/**
 * The assistant asked the user something. Paired with `assertNoMutations` for
 * the ambiguous-referent case: asking is only correct if it also held off.
 */
export function assertQuestionAsked(turn: TurnResult): void {
	if (!turn.assistantText.includes('?')) {
		throw new Error(
			`[assert] expected a clarifying question; assistant text contained no question mark. ` +
				`Text: "${turn.assistantText.slice(0, 300)}"`
		);
	}
}

/**
 * The turn produced a real user-facing answer. Guards DJ's reported failure
 * where a research-heavy turn burns its tool budget and returns nothing — the
 * stream can still reach `done` with an empty body, so `assertTurnSucceeded`
 * alone does not catch it.
 */
export function assertNonEmptyAssistantText(turn: TurnResult, minimumChars = 40): void {
	const text = turn.assistantText.trim();
	if (text.length < minimumChars) {
		throw new Error(
			`[assert] assistant returned ${text.length} chars of text (need >= ${minimumChars}) ` +
				`after ${turn.toolCalls.length} tool call(s). This is the budget-exhaustion / ` +
				`dropped-final-response failure. finished_reason=${turn.finishedReason}. ` +
				`Text: "${text}"`
		);
	}
}

/**
 * Require a response to present a requested set of alternatives as visibly
 * distinct numbered/options headings or top-level bullets.
 */
export function assertMinimumDistinctOptions(turn: TurnResult, minimum = 3): void {
	const text = turn.assistantText.trim();
	const labeled = text.match(
		/^\s*(?:#{1,6}\s*)?(?:\*\*)?(?:option\s+)?(?:\d+|one|two|three|four|five)\s*(?:[.):—–-]|\*\*)/gim
	);
	const bullets = text.match(/^\s*[-*+]\s+\S/gm);
	const count = Math.max(labeled?.length ?? 0, bullets?.length ?? 0);
	if (count < minimum) {
		throw new Error(
			`[assert] assistant presented ${count} visibly distinct option(s); expected at least ${minimum}. ` +
				`Text: "${text.slice(0, 500)}"`
		);
	}
}

const OPTION_LABEL_COUNT_WORDS: Record<string, number> = {
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10
};

/**
 * Count distinct visibly labeled options the same way the runtime's synthesis
 * constraint does: `Option N` labels anywhere in the text (em-dash safe), with
 * a top-level numbered list as the only fallback. Deliberately NO generic
 * bullet fallback — an "exactly N options" request must not be satisfiable by
 * one option card whose fields happen to render as N bullets.
 */
export function assertExactVisiblyLabeledOptions(turn: TurnResult, expected: number): void {
	const text = turn.assistantText.trim();
	const optionNumbers = new Set<number>();
	for (const match of text.matchAll(
		/\boption\s*(?:#\s*)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi
	)) {
		const rawNumber = match[1]?.toLowerCase() ?? '';
		const number = OPTION_LABEL_COUNT_WORDS[rawNumber] ?? Number.parseInt(rawNumber, 10);
		if (Number.isInteger(number) && number > 0) optionNumbers.add(number);
	}
	let count = optionNumbers.size;
	if (count === 0) {
		const listNumbers = new Set<number>();
		for (const match of text.matchAll(/^[ \t]{0,3}(?:\*\*)?(\d{1,2})[.)](?:\*\*)?[ \t]+/gm)) {
			const number = Number.parseInt(match[1] ?? '', 10);
			if (Number.isInteger(number) && number > 0) listNumbers.add(number);
		}
		count = listNumbers.size;
	}
	if (count !== expected) {
		throw new Error(
			`[assert] assistant presented ${count} visibly labeled option(s); expected exactly ${expected}. ` +
				`Text: "${text.slice(0, 500)}"`
		);
	}
}

/**
 * The user saw what the agent was about to do before it started doing it. The
 * semantic worker intentionally withholds unreviewed model prose, so either
 * assistant text or a visible activity-log agent state counts as narration.
 * SSE events are ordered, making the long-silent-pause failure mechanical.
 */
export function assertNarratedBeforeActing(turn: TurnResult): void {
	const firstText = turn.rawEvents.findIndex(
		(ev) =>
			(ev.type === 'text' || ev.type === 'text_delta') &&
			typeof ev.content === 'string' &&
			ev.content.trim().length > 0
	);
	const firstVisibleActivity = turn.rawEvents.findIndex(
		(ev) =>
			ev.type === 'agent_state' &&
			(ev.activity_visibility === 'activity_log' ||
				(typeof ev.details === 'string' && ev.details.trim().length > 0))
	);
	const firstNarration = [firstText, firstVisibleActivity]
		.filter((index) => index >= 0)
		.sort((a, b) => a - b)[0];
	const firstToolCall = turn.rawEvents.findIndex((ev) => ev.type === 'tool_call');
	if (firstToolCall < 0) {
		throw new Error('[assert] no tool call was made, so narration order is unverifiable');
	}
	if (firstNarration === undefined || firstNarration > firstToolCall) {
		throw new Error(
			`[assert] the agent acted before saying anything: first tool_call at event ` +
				`${firstToolCall}, first visible narration at ${firstNarration ?? 'never'}. ` +
				`The user watches a silent pause while tools run.`
		);
	}
}

/**
 * Research-shaped tool calls — web search/fetch and the like.
 *
 * Backs the "learn through each chat" principle (DJ, 2026-07-25): "We want to
 * build context. We don't want bloat, but we do want to build context." Research
 * the agent performs is expensive and perishable; if it lands only in the chat
 * reply it is gone the moment the session ends. A turn that searched the web six
 * times and wrote nothing durable did the work and threw it away.
 */
const RESEARCH_TOOL_PATTERN = /^(web_|search_web|browse_|fetch_url)/;

/**
 * Titles of documents the SYSTEM creates on its own, not the model.
 *
 * `Research Log` is written by deterministic research capture on any turn with >=2 web research
 * calls (`$lib/server/research-log.service`). It must never count as "the model created a
 * document" — otherwise it silently satisfies assertions about model output. The sharp case is
 * `task-complete-cold-reference`, whose forward-carry check passes when ANY of four surfaces
 * changed, one being "a new document exists": an auto-captured log there would turn a real failure
 * green while the user's stated next step was still dropped.
 */
const SYSTEM_DOCUMENT_TITLES = new Set(['Research Log', 'Research Log (Archive)']);

export function isSystemGeneratedDocument(doc: { title?: string | null }): boolean {
	return SYSTEM_DOCUMENT_TITLES.has((doc.title ?? '').trim());
}

/** Drop system-generated documents so an assertion measures what the model actually authored. */
export function excludeSystemDocuments<T extends { title?: string | null }>(docs: T[]): T[] {
	return docs.filter((doc) => !isSystemGeneratedDocument(doc));
}

export function researchToolCalls(turn: TurnResult): string[] {
	return toolNames(turn).filter((name) => RESEARCH_TOOL_PATTERN.test(name));
}

/**
 * If the turn did substantive research, something durable must have changed.
 * `persisted` is the scenario's own evidence (new or materially updated
 * documents), since where context should land is scenario-specific.
 */
export function assertResearchPersisted(
	turn: TurnResult,
	persisted: string[],
	options: { minimumResearchCalls?: number } = {}
): void {
	const minimum = options.minimumResearchCalls ?? 2;
	const research = researchToolCalls(turn);
	if (research.length < minimum) return; // not a research turn; nothing to persist
	if (persisted.length === 0) {
		throw new Error(
			`[assert] the agent ran ${research.length} research call(s) ([${research.join(', ')}]) ` +
				'and persisted none of it. The findings exist only in the chat reply and are lost ' +
				'when the session ends. BuildOS should learn from each chat, not re-research. ' +
				`Assistant text: "${turn.assistantText.slice(0, 300)}"`
		);
	}
}

/** A task row is in the expected lifecycle state. */
export function assertTaskState(
	actual: string | null | undefined,
	expected: string,
	label: string
): void {
	if (actual !== expected) {
		throw new Error(
			`[assert] ${label} state_key was "${actual ?? 'unset'}"; expected "${expected}"`
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

export function nextWeekdayDate(now: Date, weekday: number, timeZone = HARNESS_TIMEZONE): string {
	const zonedToday = formatDateInZone(now, timeZone);
	const date = new Date(`${zonedToday}T12:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + ((weekday - date.getUTCDay() + 7) % 7));
	return date.toISOString().slice(0, 10);
}

export function assertIsoDate(
	actual: string | null,
	expectedDate: string,
	label: string,
	timeZone = HARNESS_TIMEZONE
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
