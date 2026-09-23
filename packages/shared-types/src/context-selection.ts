// packages/shared-types/src/context-selection.ts
//
// "Working from" chips: the worker's `context_selection` event for a project chat turn
// (apps/worker/src/workers/agentic-chat/provider/chat-context-finder.ts). It carries record
// ids, titles, tiers and section headings only; never record text.

export type ContextSelectionKindV1 = 'document' | 'task' | 'goal' | 'plan' | 'milestone' | 'risk';

export type ContextSelectionChipV1 = {
	kind: ContextSelectionKindV1;
	id: string;
	label: string;
	/** full: its content (or best sections) was selected; summary: one line only. */
	tier: 'full' | 'summary';
	p: number | null;
	pinned: boolean;
	sections: string[];
};

export type ContextSelectionEventV1 = {
	type: 'context_selection';
	version: 1;
	mode: 'shadow' | 'chips' | 'on';
	/** False in shadow mode: persisted for measurement, never rendered. */
	visible: boolean;
	/** True when the selected evidence was added to the model's prompt. */
	injected: boolean;
	status: 'selected' | 'empty' | 'unavailable';
	failure: string | null;
	client_turn_id: string;
	turn_run_id: string;
	project_id: string | null;
	items: ContextSelectionChipV1[];
	counts: { full: number; summary: number; checked: number };
	elapsed_ms: number;
};

const KINDS = new Set<ContextSelectionKindV1>([
	'document',
	'task',
	'goal',
	'plan',
	'milestone',
	'risk'
]);
const MAX_ITEMS = 30;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Structural parse of a persisted or live payload. Returns null for anything that is not a
 * well-formed selection, so a malformed event can never break message rendering.
 */
export function parseContextSelectionEventV1(value: unknown): ContextSelectionEventV1 | null {
	if (!isRecord(value) || value.type !== 'context_selection' || value.version !== 1) return null;
	const mode = value.mode;
	const status = value.status;
	if (mode !== 'shadow' && mode !== 'chips' && mode !== 'on') return null;
	if (status !== 'selected' && status !== 'empty' && status !== 'unavailable') return null;
	if (typeof value.client_turn_id !== 'string' || typeof value.turn_run_id !== 'string')
		return null;
	if (!Array.isArray(value.items)) return null;
	const items: ContextSelectionChipV1[] = [];
	for (const raw of value.items.slice(0, MAX_ITEMS)) {
		if (!isRecord(raw)) continue;
		const kind = raw.kind as ContextSelectionKindV1;
		if (!KINDS.has(kind) || typeof raw.id !== 'string' || typeof raw.label !== 'string')
			continue;
		items.push({
			kind,
			id: raw.id,
			label: raw.label,
			tier: raw.tier === 'full' ? 'full' : 'summary',
			p: typeof raw.p === 'number' && Number.isFinite(raw.p) ? raw.p : null,
			pinned: raw.pinned === true,
			sections: Array.isArray(raw.sections)
				? raw.sections.filter((s): s is string => typeof s === 'string').slice(0, 8)
				: []
		});
	}
	const counts = isRecord(value.counts) ? value.counts : {};
	const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
	return {
		type: 'context_selection',
		version: 1,
		mode,
		visible: value.visible === true,
		injected: value.injected === true,
		status,
		failure: typeof value.failure === 'string' ? value.failure : null,
		client_turn_id: value.client_turn_id,
		turn_run_id: value.turn_run_id,
		project_id: typeof value.project_id === 'string' ? value.project_id : null,
		items,
		counts: {
			full: count(counts.full),
			summary: count(counts.summary),
			checked: count(counts.checked)
		},
		elapsed_ms: count(value.elapsed_ms)
	};
}
