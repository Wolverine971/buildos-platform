// apps/web/src/lib/components/agent/context-selection-chips.ts
//
// "Working from" chips: pure helpers for the turn's context selection (the worker's
// `context_selection` event) and the records the model actually read during that turn.
import {
	buildRecordHref,
	parseContextSelectionEventV1,
	type ContextSelectionChipV1,
	type ContextSelectionEventV1
} from '@buildos/shared-types';
import type { UIMessage } from './agent-chat.types';

export function contextSelectionOf(message: UIMessage): ContextSelectionEventV1 | null {
	const selection = parseContextSelectionEventV1(message.metadata?.context_selection);
	return selection?.visible ? selection : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every UUID-shaped string inside a tool call's arguments (ids are structured, not prose). */
function collectIds(value: unknown, into: Set<string>, depth = 0): void {
	if (depth > 6 || value == null) return;
	if (typeof value === 'string') {
		if (UUID.test(value)) into.add(value.toLowerCase());
		else if (value.startsWith('{') || value.startsWith('[')) {
			try {
				collectIds(JSON.parse(value), into, depth + 1);
			} catch {
				// Not JSON; not an id.
			}
		}
		return;
	}
	if (Array.isArray(value)) {
		for (const item of value) collectIds(item, into, depth + 1);
		return;
	}
	if (typeof value === 'object')
		for (const item of Object.values(value)) collectIds(item, into, depth + 1);
}

/**
 * Record ids the model's tools touched, per turn run, from the thinking blocks' tool
 * activity. A chip whose id appears here gets a "read" tick.
 */
export function readRecordIdsByTurn(messages: readonly UIMessage[]): Map<string, Set<string>> {
	const byTurn = new Map<string, Set<string>>();
	for (const message of messages) {
		if (message.type !== 'thinking_block') continue;
		const turnRunId = message.metadata?.turn_run_id;
		if (typeof turnRunId !== 'string') continue;
		const ids = byTurn.get(turnRunId) ?? new Set<string>();
		const activities = (message as { activities?: { metadata?: Record<string, unknown> }[] })
			.activities;
		for (const activity of activities ?? []) {
			collectIds(activity.metadata?.rawArguments, ids);
			collectIds(activity.metadata?.arguments, ids);
		}
		byTurn.set(turnRunId, ids);
	}
	return byTurn;
}

export function chipHref(chip: ContextSelectionChipV1, projectId: string | null): string | null {
	if (chip.kind !== 'task' && chip.kind !== 'document') return null;
	return buildRecordHref(chip.kind, chip.id, projectId ?? undefined);
}

/** Full items first, then summaries; each group keeps the ranker's order. */
export function orderedChips(selection: ContextSelectionEventV1): ContextSelectionChipV1[] {
	return [
		...selection.items.filter((item) => item.tier === 'full'),
		...selection.items.filter((item) => item.tier === 'summary')
	];
}

export const COLLAPSED_CHIP_COUNT = 5;
