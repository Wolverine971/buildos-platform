// apps/web/src/lib/server/cleanup-note.service.ts
//
// AI Inbox quick notes: instead of pressing a button on a Project cleanup item, the owner
// leaves a short note ("keep it, I'm still talking to them", "archive it but move the FDE
// doc under Applications first"). One focused model call reads the note into a decision
// field; nothing here interprets the note's words itself.
//
//   apply       -> approve the verified change as shown
//   not_needed  -> dismiss, with the note kept as the reviewer's feedback
//   done        -> mark addressed (handled outside the list)
//   agent       -> hand the item to a background agent run with the owner's words
//                  (clarified approval: it applies the intent, adjusted by the note)

import type { ProjectCleanupItem } from '@buildos/shared-types';
import { isCleanupItemSelectable } from '$lib/components/inbox/project-cleanup-presentation';
import { decideProjectSuggestionWithClarification } from '$lib/server/clarified-decision.service';
import {
	runCleanupDecisions,
	type CleanupDecisionInput,
	type CleanupDismissReason,
	type CleanupOutcome
} from '$lib/server/project-cleanup-decisions.service';

export type CleanupNoteDecision = 'apply' | 'not_needed' | 'done' | 'agent';

export type CleanupNoteReading = {
	decision: CleanupNoteDecision;
	dismissReason: CleanupDismissReason;
	agentBrief: string | null;
	reply: string;
};

export type CleanupNoteResult =
	| {
			ok: true;
			decision: CleanupNoteDecision;
			reply: string;
			outcomes: CleanupOutcome[];
			agentRunId: string | null;
	  }
	| { ok: false; status: number; message: string };

export const CLEANUP_NOTE_MAX_LENGTH = 2000;

const DISMISS_REASONS = new Set<CleanupDismissReason>([
	'not_relevant',
	'wrong_evidence',
	'intentional',
	'too_risky',
	'other'
]);

export const CLEANUP_NOTE_SYSTEM_PROMPT = [
	'You are Jev, the assistant inside BuildOS. The owner is going through their AI Inbox: cleanup items that a project review proposed. On one item they left a quick note instead of pressing a button. Read the note and pick exactly one decision.',
	'',
	'Decisions:',
	'- "apply": the note agrees with the proposed change exactly as shown (for example "yes", "do it", "archive it", "good call"). Only allowed when item.can_apply is true.',
	'- "not_needed": the note says to leave things as they are, keep it, the item is wrong, or it does not matter.',
	'- "done": the note says the owner already handled it some other way.',
	'- "agent": the note asks for anything the proposal does not do exactly as shown: a different or partial change, an edit, a move to another place, a rename, extra work, or "do it" on an item with no ready change (item.can_apply is false). A background agent with read and write access to the project\'s tasks and documents will carry it out.',
	'',
	'When the note asks for a change you cannot express as apply, not_needed or done, choose "agent". Never choose "apply" when the note adds conditions or extra steps.',
	'',
	'Return only JSON:',
	'{',
	'  "decision": "apply" | "not_needed" | "done" | "agent",',
	'  "dismiss_reason": "not_relevant" | "wrong_evidence" | "intentional" | "too_risky" | "other",  // only for not_needed',
	'  "agent_brief": "only for agent: 1-4 plain sentences telling the agent exactly what to change, naming the tasks or documents involved",',
	'  "reply": "one short sentence to the owner, first person, saying what you did or handed off. No filler, no questions."',
	'}'
].join('\n');

export function buildCleanupNotePrompt(params: {
	projectName: string | null;
	item: ProjectCleanupItem;
	note: string;
}): string {
	const { item } = params;
	return JSON.stringify({
		project: params.projectName ?? 'Project',
		item: {
			title: item.title,
			summary: item.summary,
			why_now: item.why_now,
			section: item.section,
			can_apply: isCleanupItemSelectable(item),
			proposed_changes: item.rows.flatMap((row) => {
				const operations = (row.verified_operations ?? []).map((operation) =>
					[operation.actionLabel, operation.entityLabel, operation.target]
						.filter((part) => typeof part === 'string' && part.trim())
						.join(' ')
				);
				return [row.verified_headline ?? row.title, ...operations].filter(Boolean);
			})
		},
		note: params.note
	});
}

function readText(value: unknown, max: number): string | null {
	return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

/** Validates the model's reading. Apply on an item that can't apply becomes an agent hand-off. */
export function parseCleanupNoteReading(
	raw: unknown,
	canApply: boolean
): CleanupNoteReading | null {
	if (!raw || typeof raw !== 'object') return null;
	const record = raw as Record<string, unknown>;
	const decision = record.decision;
	if (
		decision !== 'apply' &&
		decision !== 'not_needed' &&
		decision !== 'done' &&
		decision !== 'agent'
	) {
		return null;
	}
	const agentBrief = readText(record.agent_brief, 1200);
	const resolved: CleanupNoteDecision = decision === 'apply' && !canApply ? 'agent' : decision;
	const reason = record.dismiss_reason as CleanupDismissReason;
	const fallbackReply: Record<CleanupNoteDecision, string> = {
		apply: 'Applied it.',
		not_needed: 'Left it as is.',
		done: 'Marked it done.',
		agent: 'Handed it to an agent.'
	};
	return {
		decision: resolved,
		dismissReason: DISMISS_REASONS.has(reason) ? reason : 'other',
		agentBrief,
		reply:
			resolved === decision
				? (readText(record.reply, 300) ?? fallbackReply[resolved])
				: fallbackReply[resolved]
	};
}

function rowDecisions(
	item: ProjectCleanupItem,
	reading: CleanupNoteReading,
	note: string,
	expectedFingerprints: Record<string, string | null>
): CleanupDecisionInput[] {
	return item.rows.map((row) => {
		if (reading.decision === 'apply') {
			return {
				suggestion_id: row.suggestion_id,
				action: 'approve' as const,
				expected_fingerprint:
					row.suggestion_id in expectedFingerprints
						? expectedFingerprints[row.suggestion_id]
						: row.verified_fingerprint
			};
		}
		if (reading.decision === 'done') {
			return { suggestion_id: row.suggestion_id, action: 'address' as const, note };
		}
		return {
			suggestion_id: row.suggestion_id,
			action: 'dismiss' as const,
			reason: reading.dismissReason,
			note
		};
	});
}

function failureReply(outcomes: CleanupOutcome[]): string | null {
	const changed = outcomes.find((outcome) => outcome.status === 'changed');
	if (changed) return 'It changed since you saw it, so I left it in the list for another look.';
	const failed = outcomes.find(
		(outcome) => outcome.status === 'failed' || outcome.status === 'error'
	);
	return failed ? `Couldn't do that: ${failed.message ?? 'something went wrong.'}` : null;
}

/** Carries out a reading on one cleanup item. */
export async function actOnCleanupNote(params: {
	supabase: any;
	userId: string;
	projectId: string;
	item: ProjectCleanupItem;
	note: string;
	reading: CleanupNoteReading;
	expectedFingerprints?: Record<string, string | null>;
}): Promise<CleanupNoteResult> {
	const { item, note, reading } = params;
	if (!item.rows.length) {
		return { ok: false, status: 404, message: 'This item is no longer in the cleanup list.' };
	}

	if (reading.decision !== 'agent') {
		const outcomes = await runCleanupDecisions({
			supabase: params.supabase,
			userId: params.userId,
			projectId: params.projectId,
			decisions: rowDecisions(item, reading, note, params.expectedFingerprints ?? {})
		});
		return {
			ok: true,
			decision: reading.decision,
			reply: failureReply(outcomes) ?? reading.reply,
			outcomes,
			agentRunId: null
		};
	}

	const [lead, ...rest] = item.rows;
	const clarification = [
		`Owner's note: ${note}`,
		reading.agentBrief ? `What to do: ${reading.agentBrief}` : null,
		rest.length
			? `This item also covers: ${rest.map((row) => row.verified_headline ?? row.title).join('; ')}. Handle them the same way.`
			: null
	]
		.filter(Boolean)
		.join('\n');
	const handed = await decideProjectSuggestionWithClarification({
		supabase: params.supabase,
		userId: params.userId,
		projectId: params.projectId,
		suggestionId: lead.suggestion_id,
		action: 'approve',
		clarification
	});
	if (!handed.ok) {
		return {
			ok: false,
			status: handed.status,
			message:
				handed.status === 429
					? 'Agents are busy right now. Try again in a minute.'
					: handed.message
		};
	}
	if (handed.superseded) {
		return {
			ok: true,
			decision: 'agent',
			reply: 'It changed since you saw it, so I left it in the list for another look.',
			outcomes: [{ suggestion_id: lead.suggestion_id, ok: false, status: 'changed' }],
			agentRunId: null
		};
	}
	// The other rows ride along with the lead's agent run.
	const restOutcomes = rest.length
		? await runCleanupDecisions({
				supabase: params.supabase,
				userId: params.userId,
				projectId: params.projectId,
				decisions: rest.map((row) => ({
					suggestion_id: row.suggestion_id,
					action: 'address' as const,
					note: `Handed to an agent with "${item.title}": ${note}`.slice(0, 1000)
				}))
			})
		: [];
	return {
		ok: true,
		decision: 'agent',
		reply: handed.alreadyDecided ? 'This was already handled.' : reading.reply,
		outcomes: [
			{
				suggestion_id: lead.suggestion_id,
				ok: true,
				status: handed.alreadyDecided ? 'already_decided' : 'addressed'
			},
			...restOutcomes
		],
		agentRunId: handed.agent_run_id ?? null
	};
}
