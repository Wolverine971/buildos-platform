// apps/worker/src/workers/agentic-chat/provider/review/decision-handling.ts
import type { JsonObject } from '@buildos/shared-types';
import {
	type MutationReviewFinding,
	parseMutationReviewFindings
} from '@buildos/agentic-chat-runtime/loop';

export type PendingProposalRevision = {
	reason: string;
	requiredCorrection: string;
	findings?: MutationReviewFinding[];
	/** One-based held calls a batch revision names as wrong (structured, never parsed prose). */
	defectiveCalls?: number[];
};

/**
 * The structured `defective_calls` of a batch revision: distinct one-based
 * call numbers, or null when the field is absent or not an integer array.
 * Range against the held batch is the caller's check.
 */
export function readDefectiveCalls(value: unknown): number[] | null {
	if (!Array.isArray(value) || value.length > 40) return null;
	const calls: number[] = [];
	for (const item of value) {
		if (typeof item !== 'number' || !Number.isSafeInteger(item) || item < 1) return null;
		if (!calls.includes(item)) calls.push(item);
	}
	return calls;
}

export function readProposalRevision(argumentsValue: JsonObject): PendingProposalRevision {
	const reason =
		typeof argumentsValue.reason === 'string'
			? argumentsValue.reason.trim().slice(0, 1200)
			: '';
	const requiredCorrection =
		typeof argumentsValue.required_correction === 'string'
			? argumentsValue.required_correction.trim().slice(0, 2000)
			: '';
	const findings = parseMutationReviewFindings(argumentsValue.findings) ?? [];
	const defectiveCalls = readDefectiveCalls(argumentsValue.defective_calls) ?? [];
	return {
		reason,
		requiredCorrection,
		...(findings.length ? { findings } : {}),
		...(defectiveCalls.length ? { defectiveCalls } : {})
	};
}

/**
 * NFKC + lowercase + whitespace collapse, so a reflowed or retyped label still
 * matches (curly quotes, non-breaking spaces, wrapped lines).
 */
function normalizeCandidateMatchText(value: string): string {
	return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

const CLARIFICATION_QUESTION_MAX_LENGTH = 500;

export type ClarificationRender = {
	question: string;
	labels: string[];
};

const CLARIFICATION_RENDER_MAX_LABELS = 20;

/**
 * The structured question the clarification executor already accepted. A
 * forced-synthesis pass that originates from a clarification disposition has
 * to put this in front of the user; the model's prose is only allowed to
 * paraphrase it, never to replace it with a promise to act.
 */
export function readClarificationRender(argumentsValue: JsonObject): ClarificationRender | null {
	const question =
		typeof argumentsValue.question === 'string'
			? argumentsValue.question.trim().slice(0, CLARIFICATION_QUESTION_MAX_LENGTH)
			: '';
	if (!question) return null;
	const labels: string[] = [];
	if (Array.isArray(argumentsValue.candidates)) {
		for (const item of argumentsValue.candidates.slice(0, CLARIFICATION_RENDER_MAX_LABELS)) {
			if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
			const label = (item as Record<string, unknown>).label;
			const trimmed = typeof label === 'string' ? label.trim().slice(0, 200) : '';
			if (trimmed && !labels.includes(trimmed)) labels.push(trimmed);
		}
	}
	return { question, labels };
}

/**
 * The question survived if the prose repeats it, or at least asks something
 * and names every candidate. Both are checked case-insensitively on collapsed
 * whitespace so a reflowed paragraph still counts.
 */
export function clarificationRenderSatisfied(text: string, render: ClarificationRender): boolean {
	const normalized = normalizeCandidateMatchText(text);
	if (!normalized) return false;
	// Every candidate label has to reach the user: the clarification executor
	// no longer requires the question itself to repeat them, so the render is
	// the one place that guarantees the choices are visible.
	const labelsPresent = render.labels.every((label) =>
		normalized.includes(normalizeCandidateMatchText(label))
	);
	if (!labelsPresent) return false;
	if (normalized.includes(normalizeCandidateMatchText(render.question))) return true;
	return normalized.includes('?') && render.labels.length > 0;
}

export function renderClarificationText(render: ClarificationRender): string {
	if (render.labels.length === 0) return render.question;
	return [render.question, ...render.labels.map((label) => `- ${label}`)].join('\n');
}
