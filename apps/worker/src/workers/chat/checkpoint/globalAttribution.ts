// apps/worker/src/workers/chat/checkpoint/globalAttribution.ts
//
// Global chats feed projects (docs/architecture/JEV_GLOBAL_CONTEXT_2026-09-23.md). A global
// session has no project, so capture used to skip it. Each global turn now carries Jev's
// hop-1 receipt (the `context_selection` event), and this decides from those receipts whether
// the new turns were clearly about one project. The rule is deliberately strict: a wrong
// attribution would write one chat's thinking into another project's START HERE.
import { type ContextSelectionEventV1, parseContextSelectionEventV1 } from '@buildos/shared-types';

/** A turn counts for a project only when Jev scored it at least this high. */
export const GLOBAL_CAPTURE_MIN_P = 0.7;

/**
 * The one project a batch of global turns was about, or null.
 * - A turn that needed no saved work (scope `none`) is neutral.
 * - Every other turn must name the same top project at >= 0.7, with no second project that
 *   high; a portfolio turn, a missing or failed receipt, or a different project means null.
 * - At least one turn must name the project.
 */
export function attributeGlobalTurns(
	receipts: ReadonlyArray<ContextSelectionEventV1 | null>
): string | null {
	let projectId: string | null = null;
	for (const receipt of receipts) {
		if (!receipt || receipt.status === 'unavailable' || !receipt.workspace) return null;
		if (receipt.workspace.scope === 'none') continue;
		if (receipt.workspace.scope !== 'projects') return null;
		const [top, second] = receipt.projects;
		if (!top || (top.p ?? 0) < GLOBAL_CAPTURE_MIN_P) return null;
		if (second && (second.p ?? 0) >= GLOBAL_CAPTURE_MIN_P) return null;
		if (projectId && projectId !== top.id) return null;
		projectId = top.id;
	}
	return projectId;
}

/** Users whose global chats may feed projects (CHAT_CHECKPOINT_GLOBAL_USER_IDS). */
export function globalCaptureUserIds(
	value = process.env.CHAT_CHECKPOINT_GLOBAL_USER_IDS
): string[] {
	return (value ?? '')
		.split(',')
		.map((id) => id.trim().toLowerCase())
		.filter((id) => /^[0-9a-f-]{36}$/.test(id));
}

/** The receipt for each user message, matched by the message's client turn id. */
export function receiptsForMessages(
	messages: ReadonlyArray<{ id: string; clientTurnId: string | null }>,
	events: ReadonlyArray<{ payload: unknown }>
): Array<ContextSelectionEventV1 | null> {
	const byTurn = new Map<string, ContextSelectionEventV1>();
	// Events arrive oldest first; a retried turn's later receipt wins.
	for (const event of events) {
		const receipt = parseContextSelectionEventV1(event.payload);
		if (receipt) byTurn.set(receipt.client_turn_id, receipt);
	}
	return messages.map((message) =>
		message.clientTurnId ? (byTurn.get(message.clientTurnId) ?? null) : null
	);
}
