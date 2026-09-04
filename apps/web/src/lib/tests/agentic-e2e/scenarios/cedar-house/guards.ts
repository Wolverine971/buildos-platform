// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/guards.ts
//
// Assertions every Cedar House case shares. Kept apart from `fixture.ts` so the
// oracle file stays a plain list of the audit's saved values.
import { assertNoEventsCreated, assertNoLegacyRows } from '../../harness/assertions';
import type { ScenarioContext, TurnResult } from '../../harness/types';
import type { TaskRow } from '../../harness/telemetry';

export interface CedarProjectRow {
	id: string;
	name: string;
	description: string | null;
	start_at: string | null;
	end_at: string | null;
}

export async function readCedarProject(
	ctx: ScenarioContext,
	projectId: string
): Promise<CedarProjectRow> {
	const { data, error } = await ctx.db.admin
		.from('onto_projects')
		.select('id, name, description, start_at, end_at')
		.eq('id', projectId)
		.maybeSingle();
	if (error || !data) {
		throw new Error(
			`[assert] could not read project ${projectId}: ${error?.message ?? 'missing row'}`
		);
	}
	return data as CedarProjectRow;
}

export function requireStreamRunId(turn: TurnResult): string {
	if (!turn.streamRunId) throw new Error('[assert] turn did not expose a stream_run_id');
	return turn.streamRunId;
}

/**
 * The battery only means something if every case ran the same lane. Running it
 * on legacy SSE would produce a scorecard that silently grades a different
 * implementation than the one deployed.
 */
export async function assertWorkerLaneOnly(turn: TurnResult, ctx: ScenarioContext): Promise<void> {
	if (ctx.executionMode !== 'worker_realtime') {
		throw new Error(
			'[assert] the Cedar House battery is worker-path only; run it with ' +
				`AGENTIC_E2E_EXECUTION_MODE=worker_realtime (received ${ctx.executionMode})`
		);
	}
	await assertNoLegacyRows(ctx.db.admin, turn.sessionId, 'worker_realtime');
}

/** Every Cedar House prompt forbids calendar events; F5 says that is not enough. */
export async function assertNoCalendarSideEffects(
	ctx: ScenarioContext,
	projectId: string,
	why: string
): Promise<void> {
	await assertNoEventsCreated(ctx.db.admin, projectId, why);
}

export function taskByTitle(tasks: readonly TaskRow[], title: string): TaskRow {
	const match = tasks.filter((task) => task.title.trim() === title);
	if (match.length !== 1) {
		throw new Error(
			`[assert] expected exactly one task titled "${title}", found ${match.length}. ` +
				`All titles: [${tasks.map((task) => task.title).join(', ')}]`
		);
	}
	return match[0]!;
}

export function findTaskByTitle(tasks: readonly TaskRow[], title: string): TaskRow | undefined {
	return tasks.find((task) => task.title.trim() === title);
}

/** Whitespace/case-insensitive containment — survives markdown and wrapping noise. */
export function includesNormalized(haystack: string, needle: string): boolean {
	const flatten = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
	return flatten(haystack).includes(flatten(needle));
}

export function assertIncludesExactText(text: string, expected: string, label: string): void {
	if (!includesNormalized(text, expected)) {
		throw new Error(
			`[assert] ${label} did not contain the exact saved text "${expected}". ` +
				`Received: "${text.slice(0, 800)}"`
		);
	}
}

/** Budget figures survive currency formatting, so match the digits, not the prose. */
const BUDGET_CAP_PATTERN = /\$?\s?85[,.\s]?000/;
const CONTINGENCY_PATTERN = /\$?\s?10[,.\s]?000/;

export function assertBudgetCapPresent(text: string, label: string): void {
	if (!BUDGET_CAP_PATTERN.test(text)) {
		throw new Error(
			`[assert] ${label} does not carry the saved $85,000 budget cap. ` +
				`Received: "${text.slice(0, 800)}"`
		);
	}
}

export function assertContingencyPresent(text: string, label: string): void {
	if (!CONTINGENCY_PATTERN.test(text)) {
		throw new Error(
			`[assert] ${label} does not carry the saved $10,000 contingency. ` +
				`Received: "${text.slice(0, 800)}"`
		);
	}
}

/** Minutes are stored in task descriptions; the audit verified them there. */
export function assertMinutesRecorded(task: TaskRow, minutes: number): void {
	const text = `${task.title} ${task.description ?? ''}`;
	if (!new RegExp(`\\b${minutes}\\b`).test(text)) {
		throw new Error(
			`[assert] task "${task.title}" does not record its ${minutes}-minute estimate. ` +
				`Description: "${task.description ?? '(none)'}"`
		);
	}
}
