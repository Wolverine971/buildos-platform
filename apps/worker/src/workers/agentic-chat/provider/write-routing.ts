// apps/worker/src/workers/agentic-chat/provider/write-routing.ts
import {
	type AgenticChatReviewedMutationSpecV1,
	reviewedAgenticChatMutationSpecV1
} from '../mutationToolCatalog';
import type { CompletedProviderToolCall } from './stream-tool-calls';

export const MAX_DIRECT_SIMPLE_MUTATIONS_PER_TURN = 3;

export type DirectWriteRouteContext = {
	contextType: string;
	entityId: string | null;
	projectId: string | null;
	/** The current user message; an id it literally names was chosen by the user. */
	userMessage?: string | null;
	/**
	 * Ids that a successful read in this turn returned as the only entity of
	 * their kind (id → kind), e.g. a search or filtered list with one hit. A
	 * read that was asked for an id by that id proves nothing and is excluded
	 * by the collector.
	 */
	resolvedEntityIds?: ReadonlyMap<string, string>;
};

export type DirectWriteBatchAssessment =
	| { kind: 'not_a_write' }
	| {
			kind: 'simple';
			mutationCount: number;
	  }
	| {
			kind: 'contract_required';
			reason:
				| 'mixed_tool_batch'
				| 'mutation_count_exceeded'
				| 'operation_requires_contract'
				| 'ordered_or_dependent_batch'
				| 'target_resolution_requires_review';
			mutationCount: number;
	  };

/**
 * Deterministic floor for the acting model's write-route declaration.
 *
 * Direct mutation calls declare a simple request. The worker accepts that
 * declaration only for one small, independent, internally classified batch.
 * A turn contract declares the complex route and remains independently
 * reviewed. Selecting an existing child entity from a collection is complex:
 * an exact UUID proves adapter scope, not that the user's language uniquely
 * selected that row. New entities and the already focused project retain the
 * low-latency direct lane, and so does an existing entity whose id was
 * resolved deterministically — it is the focused entity, the user typed it,
 * or one read this turn returned exactly one entity of that kind (Decision 3,
 * turn-executor audit 2026-09-02). Any id merely present somewhere in a
 * multi-hit read still goes to the contract lane: three plausible "email"
 * tasks stay a clarification, not a guess.
 */
export function assessDirectWriteBatch(
	calls: readonly CompletedProviderToolCall[],
	context?: DirectWriteRouteContext
): DirectWriteBatchAssessment {
	const mutationCalls = calls.filter((call) => reviewedAgenticChatMutationSpecV1(call.name));
	if (mutationCalls.length === 0) return { kind: 'not_a_write' };
	if (mutationCalls.length !== calls.length) {
		return {
			kind: 'contract_required',
			reason: 'mixed_tool_batch',
			mutationCount: mutationCalls.length
		};
	}
	if (mutationCalls.length > MAX_DIRECT_SIMPLE_MUTATIONS_PER_TURN) {
		return {
			kind: 'contract_required',
			reason: 'mutation_count_exceeded',
			mutationCount: mutationCalls.length
		};
	}
	if (
		mutationCalls.some(
			(call) => reviewedAgenticChatMutationSpecV1(call.name)?.directWriteClass !== 'ordinary'
		)
	) {
		return {
			kind: 'contract_required',
			reason: 'operation_requires_contract',
			mutationCount: mutationCalls.length
		};
	}
	if (
		mutationCalls.some(
			(call) =>
				call.scheduling && (call.scheduling.callRef || call.scheduling.after.length > 0)
		)
	) {
		return {
			kind: 'contract_required',
			reason: 'ordered_or_dependent_batch',
			mutationCount: mutationCalls.length
		};
	}
	const focusedProjectId =
		context?.projectId ??
		(context?.contextType === 'project' || context?.contextType === 'ontology'
			? context.entityId
			: null);
	if (
		mutationCalls.some((call) => {
			const spec = reviewedAgenticChatMutationSpecV1(call.name);
			if (!spec || spec.directWriteClass !== 'ordinary') return false;
			if (spec.directWriteSelectionPolicy === 'resolved_existing') {
				return !isResolvedExistingTargetDeterministic(
					call,
					spec,
					context,
					focusedProjectId
				);
			}
			if (spec.directWriteSelectionPolicy === 'focused_project') {
				const target = call.arguments.project_id;
				return typeof target !== 'string' || target !== focusedProjectId;
			}
			if (spec.directWriteSelectionPolicy !== 'new_entity') return true;
			if (
				Object.hasOwn(call.arguments, 'project_id') &&
				(typeof call.arguments.project_id !== 'string' ||
					call.arguments.project_id !== focusedProjectId)
			) {
				return true;
			}
			return (spec.directWriteExistingReferenceNames ?? []).some(
				(name) => call.arguments[name] !== undefined && call.arguments[name] !== null
			);
		})
	) {
		return {
			kind: 'contract_required',
			reason: 'target_resolution_requires_review',
			mutationCount: mutationCalls.length
		};
	}
	return { kind: 'simple', mutationCount: mutationCalls.length };
}

const ARGUMENT_ENTITY_KINDS: Readonly<Record<string, string>> = {
	task_id: 'task',
	document_id: 'document',
	new_parent_id: 'document',
	goal_id: 'goal',
	plan_id: 'plan',
	milestone_id: 'milestone',
	supporting_milestone_id: 'milestone',
	risk_id: 'risk',
	project_id: 'project',
	edge_id: 'edge'
};

function entityKindForArgument(name: string, args: CompletedProviderToolCall['arguments']) {
	if (name === 'src_id') return typeof args.src_kind === 'string' ? args.src_kind : null;
	if (name === 'dst_id') return typeof args.dst_kind === 'string' ? args.dst_kind : null;
	if (name === 'entity_id') return typeof args.entity_type === 'string' ? args.entity_type : null;
	return ARGUMENT_ENTITY_KINDS[name] ?? null;
}

/**
 * Every string argument named `*_id` on a resolved_existing call is a target
 * or reference the model selected. Each must be deterministically resolved.
 * Array-valued ids (assignees, mentioned users) are values, not targets, and
 * follow the same treatment creates already receive in the direct lane.
 */
function isResolvedExistingTargetDeterministic(
	call: CompletedProviderToolCall,
	spec: AgenticChatReviewedMutationSpecV1,
	context: DirectWriteRouteContext | undefined,
	focusedProjectId: string | null
): boolean {
	if (!context) return false;
	const referenceNames = new Set<string>(spec.directWriteExistingReferenceNames ?? []);
	for (const [name, value] of Object.entries(call.arguments)) {
		if (!name.endsWith('_id') && !referenceNames.has(name)) continue;
		if (value === null || value === undefined) continue;
		if (typeof value !== 'string') return false;
		if (
			!isDeterministicallyResolvedId(
				value,
				entityKindForArgument(name, call.arguments),
				context,
				focusedProjectId
			)
		) {
			return false;
		}
	}
	return spec.requiredNames
		.filter((name) => name.endsWith('_id'))
		.every((name) => typeof call.arguments[name] === 'string');
}

function isDeterministicallyResolvedId(
	id: string,
	kind: string | null,
	context: DirectWriteRouteContext,
	focusedProjectId: string | null
): boolean {
	if (id.length === 0) return false;
	if (id === context.entityId || id === focusedProjectId) return true;
	if (context.userMessage?.includes(id)) return true;
	const resolvedKind = context.resolvedEntityIds?.get(id.toLowerCase());
	if (resolvedKind === undefined) return false;
	return kind === null || resolvedKind === 'entity' || resolvedKind === kind.toLowerCase();
}

export function directWriteContractInstruction(
	assessment: Extract<DirectWriteBatchAssessment, { kind: 'contract_required' }>
): string {
	const reason = (() => {
		switch (assessment.reason) {
			case 'mixed_tool_batch':
				return 'The proposal mixed durable mutations with other calls.';
			case 'mutation_count_exceeded':
				return `The proposal contains ${assessment.mutationCount} mutations; the direct lane permits at most ${MAX_DIRECT_SIMPLE_MUTATIONS_PER_TURN}.`;
			case 'operation_requires_contract':
				return 'At least one proposed operation is destructive, organizational, high-impact, or otherwise contract-only.';
			case 'ordered_or_dependent_batch':
				return 'The proposal contains explicit ordering or dependencies.';
			case 'target_resolution_requires_review':
				return 'At least one proposed mutation selects an existing entity or parent project from broader context, so its target resolution requires semantic review.';
		}
	})();
	return [
		'A prior mutation proposal was withheld and no mutation executed.',
		reason,
		'This is a complex write request. Declare the complete outcome set with declare_turn_contract before proposing any mutation.',
		'Request clarification instead only when a required user choice is genuinely unresolved. Do not narrate this routing correction to the user.'
	].join(' ');
}

// ---------------------------------------------------------------------------
// Entity evidence extracted from read results. Two consumers: the direct
// lane above (which ids did a read resolve deterministically?) and the
// continuation builder (what must a superseded tool result still remember?).
// ---------------------------------------------------------------------------

export type ReadResultEntityRef = {
	id: string;
	kind: string;
	title: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KNOWN_ENTITY_KINDS: ReadonlySet<string> = new Set([
	'project',
	'task',
	'document',
	'goal',
	'plan',
	'milestone',
	'risk',
	'event',
	'asset',
	'member',
	'user',
	'edge',
	'note',
	'metric',
	'source'
]);
const COLLECTION_ENTITY_KINDS: Readonly<Record<string, string>> = {
	project: 'project',
	projects: 'project',
	task: 'task',
	tasks: 'task',
	document: 'document',
	documents: 'document',
	docs: 'document',
	goal: 'goal',
	goals: 'goal',
	plan: 'plan',
	plans: 'plan',
	milestone: 'milestone',
	milestones: 'milestone',
	risk: 'risk',
	risks: 'risk',
	event: 'event',
	events: 'event',
	calendar_events: 'event',
	asset: 'asset',
	assets: 'asset',
	member: 'member',
	members: 'member',
	user: 'user',
	users: 'user',
	edge: 'edge',
	edges: 'edge',
	relationships: 'edge'
};
const PASSTHROUGH_WRAPPER_KEYS: ReadonlySet<string> = new Set([
	'result',
	'data',
	'results',
	'items',
	'hits',
	'matches',
	'entities',
	'records',
	'rows',
	'children',
	'root',
	'structure'
]);
const MAX_WALKED_NODES = 4_000;
const MAX_WALK_DEPTH = 10;
const MAX_TITLE_CHARS = 80;

function fieldEntityKind(record: Record<string, unknown>): string | null {
	for (const key of ['kind', 'entity_kind', 'entity_type', 'type']) {
		const value = record[key];
		if (typeof value === 'string') {
			const normalized = value.trim().toLowerCase();
			if (KNOWN_ENTITY_KINDS.has(normalized)) return normalized;
		}
	}
	return null;
}

function firstText(...values: unknown[]): string | null {
	for (const value of values) {
		if (typeof value === 'string' && value.trim().length > 0) {
			return value.trim().slice(0, MAX_TITLE_CHARS);
		}
	}
	return null;
}

/**
 * Every object carrying a UUID `id`, with its kind inferred from its own
 * fields, else from the collection key it sits under, else `entity`. Bounded
 * walk; ids are de-duplicated, keeping the first sighting but upgrading an
 * unknown kind to a later known one.
 */
export function collectReadResultEntityRefs(result: unknown): ReadResultEntityRef[] {
	const refs = new Map<string, ReadResultEntityRef>();
	const budget = { nodes: MAX_WALKED_NODES };
	const walk = (value: unknown, contextKind: string | null, depth: number): void => {
		if (budget.nodes <= 0 || depth > MAX_WALK_DEPTH) return;
		budget.nodes -= 1;
		if (Array.isArray(value)) {
			for (const item of value) walk(item, contextKind, depth + 1);
			return;
		}
		if (!value || typeof value !== 'object') return;
		const record = value as Record<string, unknown>;
		const id = record.id;
		if (typeof id === 'string' && UUID_PATTERN.test(id)) {
			const normalizedId = id.toLowerCase();
			const kind = fieldEntityKind(record) ?? contextKind ?? 'entity';
			const title = firstText(record.title, record.name, record.label);
			const existing = refs.get(normalizedId);
			if (!existing) {
				refs.set(normalizedId, { id: normalizedId, kind, title });
			} else {
				if (existing.kind === 'entity' && kind !== 'entity') existing.kind = kind;
				if (existing.title === null && title !== null) existing.title = title;
			}
		}
		for (const [key, child] of Object.entries(record)) {
			if (child === null || typeof child !== 'object') continue;
			const childKind = UUID_PATTERN.test(key)
				? contextKind
				: (COLLECTION_ENTITY_KINDS[key] ??
					(PASSTHROUGH_WRAPPER_KEYS.has(key) ? contextKind : null));
			walk(child, childKind, depth + 1);
		}
	};
	walk(result, null, 0);
	return [...refs.values()];
}

/**
 * Ids a read returned as the only entity of their kind. A read whose own
 * arguments already named the id (a by-id details read) resolves nothing: the
 * model chose that id, the user did not.
 */
export function collectSingleHitEntityIds(
	result: unknown,
	callArguments?: CompletedProviderToolCall['canonicalArguments']
): Map<string, string> {
	const refs = collectReadResultEntityRefs(result);
	const countByKind = new Map<string, number>();
	for (const ref of refs) countByKind.set(ref.kind, (countByKind.get(ref.kind) ?? 0) + 1);
	const argumentsText = (callArguments ?? '').toLowerCase();
	const resolved = new Map<string, string>();
	for (const ref of refs) {
		if (countByKind.get(ref.kind) !== 1) continue;
		if (argumentsText.includes(ref.id)) continue;
		resolved.set(ref.id, ref.kind);
	}
	return resolved;
}

export function summarizeReadResultEntityRefs(refs: readonly ReadResultEntityRef[]): string {
	const countByKind = new Map<string, number>();
	for (const ref of refs) countByKind.set(ref.kind, (countByKind.get(ref.kind) ?? 0) + 1);
	return [...countByKind.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([kind, count]) => `${count} ${kind}${count === 1 ? '' : 's'}`)
		.join(', ');
}
