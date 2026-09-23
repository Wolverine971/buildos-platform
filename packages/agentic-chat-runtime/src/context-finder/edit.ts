// packages/agentic-chat-runtime/src/context-finder/edit.ts
//
// A person's edits to Jev's plan: pin loads an item in full (its best sections for
// documents), drop removes it, add pins something Jev did not rank highly. Pure, so the
// browser can preview the result and the server validates the same shape.
import type { ContextFinderCandidateV1 } from './finder';
import { CONTEXT_FINDER_POLICY, type ContextPlanItemV1, type ContextPlanV1 } from './select';

export type ContextPlanEditsV1 = {
	pins: readonly string[];
	drops: readonly string[];
	/** Records added from the candidate list; they load pinned. */
	added: readonly ContextFinderCandidateV1[];
};

export const EMPTY_CONTEXT_PLAN_EDITS: ContextPlanEditsV1 = Object.freeze({
	pins: [],
	drops: [],
	added: []
});

export function hasContextPlanEdits(edits: ContextPlanEditsV1): boolean {
	return edits.pins.length > 0 || edits.drops.length > 0 || edits.added.length > 0;
}

/** Applies edits in order: drops win over pins; pins beyond the limit are ignored. */
export function applyContextPlanEdits(
	base: ContextPlanV1,
	edits: ContextPlanEditsV1
): ContextPlanV1 {
	if (!hasContextPlanEdits(edits)) return base;
	const drops = new Set(edits.drops);
	const pins = new Set(
		[...edits.pins, ...edits.added.map((candidate) => candidate.id)].filter(
			(id) => !drops.has(id)
		)
	);
	const pinnedIds = [...pins].slice(0, CONTEXT_FINDER_POLICY.maxPins);
	const allowed = new Set(pinnedIds);
	const existing = new Map(base.items.map((item) => [item.id, item]));
	const pinned: ContextPlanItemV1[] = pinnedIds.map((id) => {
		const item = existing.get(id);
		if (item) return { ...item, tier: 'full', pinned: true };
		const candidate = edits.added.find((x) => x.id === id)!;
		return {
			kind: candidate.kind,
			id: candidate.id,
			title: candidate.title,
			tier: 'full',
			p: candidate.p,
			pinned: true,
			sections: []
		};
	});
	const rest = base.items
		.filter((item) => !drops.has(item.id) && !allowed.has(item.id))
		.map(({ pinned: _pinned, ...item }) => item);
	const dropped = [
		...base.dropped.filter((x) => !pins.has(x.id)),
		...base.items
			.filter((item) => drops.has(item.id))
			.map((item) => ({ kind: item.kind, id: item.id }))
	];
	return {
		...base,
		source: 'curated',
		items: [
			...pinned,
			...rest.filter((i) => i.tier === 'full'),
			...rest.filter((i) => i.tier === 'summary')
		],
		dropped
	};
}
