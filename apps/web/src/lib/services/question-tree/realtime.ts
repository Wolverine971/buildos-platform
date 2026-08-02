// apps/web/src/lib/services/question-tree/realtime.ts
import type {
	QuestionTreeEvent,
	QuestionTreeNode,
	QuestionTreeProposal,
	QuestionTreeRun,
	QuestionTreeRunDetail
} from './types';

export type QuestionTreeRealtimeTable =
	| 'question_tree_runs'
	| 'question_tree_nodes'
	| 'question_tree_proposals'
	| 'question_tree_events';

export type QuestionTreeRealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

type IdentifiedRow = { id: string };
type TimestampedRow = IdentifiedRow & { updated_at: string };

function newest<T extends TimestampedRow>(left: T, right: T): T {
	return Date.parse(right.updated_at) >= Date.parse(left.updated_at) ? right : left;
}

function reconcileRows<T extends TimestampedRow>(current: T[], incoming: T[]): T[] {
	const rows = new Map(current.map((row) => [row.id, row]));
	for (const row of incoming) {
		const existing = rows.get(row.id);
		rows.set(row.id, existing ? newest(existing, row) : row);
	}
	return [...rows.values()];
}

function upsert<T extends IdentifiedRow>(rows: T[], row: T): T[] {
	const existingIndex = rows.findIndex((entry) => entry.id === row.id);
	if (existingIndex === -1) return [...rows, row];
	return rows.map((entry, index) => (index === existingIndex ? row : entry));
}

function remove<T extends IdentifiedRow>(rows: T[], id: string): T[] {
	return rows.filter((row) => row.id !== id);
}

function sortNodes(nodes: QuestionTreeNode[]): QuestionTreeNode[] {
	return [...nodes].sort((left, right) => left.node_number - right.node_number);
}

function sortProposals(proposals: QuestionTreeProposal[]): QuestionTreeProposal[] {
	return [...proposals].sort((left, right) => {
		const created = Date.parse(left.created_at) - Date.parse(right.created_at);
		return created || left.rank - right.rank;
	});
}

function sortEvents(events: QuestionTreeEvent[]): QuestionTreeEvent[] {
	return [...events].sort((left, right) => right.seq - left.seq).slice(0, 300);
}

/** Merge a fetch snapshot without overwriting a newer websocket update. */
export function reconcileQuestionTreeDetail(
	current: QuestionTreeRunDetail | null,
	incoming: QuestionTreeRunDetail
): QuestionTreeRunDetail {
	if (!current) return incoming;
	const events = new Map(current.events.map((event) => [event.id, event]));
	for (const event of incoming.events) events.set(event.id, event);
	return {
		run: newest(current.run, incoming.run),
		nodes: sortNodes(reconcileRows(current.nodes, incoming.nodes)),
		proposals: sortProposals(reconcileRows(current.proposals, incoming.proposals)),
		events: sortEvents([...events.values()])
	};
}

/** Apply one Supabase postgres_changes payload using immutable replacements for $state.raw. */
export function applyQuestionTreeRealtimeChange(
	detail: QuestionTreeRunDetail,
	table: QuestionTreeRealtimeTable,
	eventType: QuestionTreeRealtimeEvent,
	row: Record<string, unknown>
): QuestionTreeRunDetail {
	const id = typeof row.id === 'string' ? row.id : null;
	if (!id) return detail;

	if (table === 'question_tree_runs') {
		if (eventType === 'DELETE' || id !== detail.run.id) return detail;
		return { ...detail, run: row as unknown as QuestionTreeRun };
	}

	if (table === 'question_tree_nodes') {
		const nodes =
			eventType === 'DELETE'
				? remove(detail.nodes, id)
				: upsert(detail.nodes, row as unknown as QuestionTreeNode);
		return { ...detail, nodes: sortNodes(nodes) };
	}

	if (table === 'question_tree_proposals') {
		const proposals =
			eventType === 'DELETE'
				? remove(detail.proposals, id)
				: upsert(detail.proposals, row as unknown as QuestionTreeProposal);
		return { ...detail, proposals: sortProposals(proposals) };
	}

	const events =
		eventType === 'DELETE'
			? remove(detail.events, id)
			: upsert(detail.events, row as unknown as QuestionTreeEvent);
	return { ...detail, events: sortEvents(events) };
}
