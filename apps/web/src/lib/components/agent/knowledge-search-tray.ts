// apps/web/src/lib/components/agent/knowledge-search-tray.ts
//
// Guided search in chat (2026-11-22): the Entities tray under a reply.
//
// A `find_in_knowledge` or `explore_knowledge` result lists knowledge entries (people,
// companies, places…). The chat shows them as chips the user can tick; the next message
// carries the ticked ids (`knowledgeSelection`) and says where to go. This module turns tool
// results into one tray per turn, live (SSE) and on reload (stored tool executions), and
// offers next steps from what is ticked.
//
// Everything here is structured: the tray comes from tool results, the next steps from the
// kinds of the ticked entries. Nothing reads the conversation.

import {
	EXPLORE_KNOWLEDGE_TOOL_NAME,
	FIND_IN_KNOWLEDGE_TOOL_NAME,
	GUIDED_SEARCH_HOP_LIMIT,
	readGuidedSearchResult,
	readKnowledgeSelectionRefs,
	type GuidedCheck,
	type GuidedEntity,
	type GuidedSearchView,
	type KnowledgeSelectionRef
} from '@buildos/shared-agent-ops/knowledge';

export type { GuidedCheck, GuidedEntity, GuidedSearchView, KnowledgeSelectionRef };

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The guided-search view inside a tool result, or null. Live SSE results nest the payload at
 * `result`; stored tool executions may hold it directly or under the legacy `data` alias.
 */
export function extractGuidedSearch(toolResult: unknown): GuidedSearchView | null {
	if (!isRecord(toolResult)) return null;
	const candidates = [
		toolResult,
		toolResult.result,
		toolResult.data,
		isRecord(toolResult.result) ? toolResult.result.result : undefined
	];
	for (const candidate of candidates) {
		if (!isRecord(candidate)) continue;
		if (isRecord(candidate.knowledge_explore))
			return readGuidedSearchResult(EXPLORE_KNOWLEDGE_TOOL_NAME, candidate);
		if (isRecord(candidate.knowledge_find))
			return readGuidedSearchResult(FIND_IN_KNOWLEDGE_TOOL_NAME, candidate);
	}
	return null;
}

/** One turn's search results as the tray shows them. */
export interface KnowledgeTray {
	/** Stable per turn: the ids it holds, so a replayed turn never shows twice. */
	id: string;
	/** Where the entries came from: inside the graph, the web, or both in one turn. */
	source: 'graph' | 'web' | 'both';
	/** The furthest hop in this turn (0 = inside the graph). */
	hop: number;
	hopLimit: number;
	checks: GuidedCheck[];
	need: string[];
	entities: GuidedEntity[];
	/** `flagged`: the page had text written to steer an AI (it was still read). */
	pages: Array<{ url: string; title: string | null; flagged?: boolean }>;
	queries: string[];
	/** Set when a search stopped itself. */
	stopped: string | null;
}

/** Merge a turn's searches into one tray (first-seen order; a later result updates an entry). */
export function buildKnowledgeTray(views: GuidedSearchView[]): KnowledgeTray | null {
	const usable = views.filter((view) => view.entities.length || view.stopped);
	if (!usable.length) return null;
	const entities = new Map<string, GuidedEntity>();
	const checks = new Map<string, GuidedCheck>();
	const pages = new Map<string, { url: string; title: string | null; flagged?: boolean }>();
	const need = new Set<string>();
	const queries = new Set<string>();
	let stopped: string | null = null;
	let hop = 0;
	for (const view of usable) {
		hop = Math.max(hop, view.hop);
		for (const check of view.checks) if (!checks.has(check.key)) checks.set(check.key, check);
		for (const key of view.need) need.add(key);
		for (const query of view.queries) queries.add(query);
		for (const page of view.pages) {
			const earlier = pages.get(page.url);
			// A flag from any search in the turn sticks.
			if (!earlier) pages.set(page.url, page);
			else if (page.flagged && !earlier.flagged)
				pages.set(page.url, { ...earlier, flagged: true });
		}
		for (const entity of view.entities) {
			const earlier = entities.get(entity.id);
			entities.set(
				entity.id,
				earlier
					? {
							...earlier,
							...entity,
							fit: { ...earlier.fit, ...entity.fit },
							// Something the graph already held stays marked that way.
							origin: earlier.origin === 'graph' ? 'graph' : entity.origin,
							hop: Math.min(earlier.hop, entity.hop)
						}
					: entity
			);
		}
		if (view.stopped) stopped = view.stopped;
	}
	const list = [...entities.values()];
	const hasWeb = usable.some((view) => view.tool === EXPLORE_KNOWLEDGE_TOOL_NAME);
	const hasGraph = usable.some((view) => view.tool === FIND_IN_KNOWLEDGE_TOOL_NAME);
	// The outside hops behind it make a tray its own: two hops that happen to return the same
	// entries are still two trays.
	const runs = usable
		.map((view) => view.runId)
		.filter((id): id is string => Boolean(id))
		.sort()
		.join('+');
	return {
		id: `${runs || 'graph'}:${
			list
				.map((entity) => entity.id)
				.sort()
				.join(',') || `stopped:${hop}:${stopped ?? ''}`
		}`,
		source: hasWeb && hasGraph ? 'both' : hasWeb ? 'web' : 'graph',
		hop,
		hopLimit: GUIDED_SEARCH_HOP_LIMIT,
		checks: [...checks.values()],
		need: [...need],
		entities: list,
		pages: [...pages.values()],
		queries: [...queries],
		stopped
	};
}

/** The tray stored on a `knowledge_entities` message, if it is one. */
export function readKnowledgeTray(value: unknown): KnowledgeTray | null {
	if (!isRecord(value) || !Array.isArray(value.entities) || typeof value.id !== 'string')
		return null;
	return value as unknown as KnowledgeTray;
}

/** How an entry stands against the checks: all yes, some no, or not known. */
export function entityFit(entity: GuidedEntity): 'pass' | 'out' | 'unknown' | null {
	const values = Object.values(entity.fit ?? {});
	if (!values.length) return null;
	if (values.some((value) => value === 'no')) return 'out';
	return values.every((value) => value === 'yes') ? 'pass' : 'unknown';
}

export function selectionRefOf(entity: GuidedEntity): KnowledgeSelectionRef {
	return { entity_id: entity.id, name: entity.name, kind: entity.kind };
}

/** The entries a user message was sent about (its stored metadata), for the bubble. */
export function messageKnowledgeSelection(metadata: unknown): KnowledgeSelectionRef[] {
	return isRecord(metadata) ? readKnowledgeSelectionRefs(metadata.knowledge_selection) : [];
}

export interface KnowledgeNextStep {
	id: string;
	/** The button. */
	label: string;
	/** The message it sends (the ticked entries ride along as ids). */
	message: string;
}

function named(refs: KnowledgeSelectionRef[], one: string, many: string): string {
	return refs.length === 1 ? refs[0]!.name : `these ${refs.length} ${many || one}`;
}

/**
 * Where the search can go next, from what is ticked. Driven by the kinds of the ticked
 * entries and the tray's state; the user can always type something else.
 */
export function knowledgeNextSteps(
	tray: KnowledgeTray,
	selected: KnowledgeSelectionRef[]
): KnowledgeNextStep[] {
	const atLimit = tray.source !== 'graph' && tray.hop >= tray.hopLimit;
	if (!selected.length) {
		if (tray.source === 'graph') {
			return [
				{
					id: 'outside',
					label: 'Look outside BuildOS',
					message: 'Extend this search outside BuildOS.'
				}
			];
		}
		return [];
	}
	const kinds = new Set(selected.map((ref) => ref.kind));
	const only = kinds.size === 1 ? [...kinds][0] : null;
	const steps: KnowledgeNextStep[] = [];
	const further = atLimit ? ' Keep going past the hop limit.' : '';
	if (only === 'org') {
		const target = named(selected, 'company', 'companies');
		steps.push(
			{
				id: 'people',
				label: `Find the people who run ${target}`,
				message: `Find the people who run ${target}.${further}`
			},
			{
				id: 'known-there',
				label: 'Who do I know there?',
				message: `Who do I already know at ${target}?`
			}
		);
	} else if (only === 'person') {
		const target = named(selected, 'person', 'people');
		steps.push(
			{
				id: 'about',
				label: `Tell me more about ${target}`,
				message: `Tell me more about ${target}.${further}`
			},
			{
				id: 'path',
				label: 'How could I reach them?',
				message: `Who do I know who could introduce me to ${target}?`
			}
		);
	} else if (only === 'place') {
		const target = named(selected, 'place', 'places');
		steps.push(
			{
				id: 'companies',
				label: `Find companies in ${target}`,
				message: `Find companies in ${target} that fit what I'm looking for.${further}`
			},
			{
				id: 'known-there',
				label: 'Who do I know there?',
				message: `Who do I already know in ${target}?`
			}
		);
	} else {
		steps.push({
			id: 'further',
			label: `Search further on these ${selected.length}`,
			message: `Search further on these ${selected.length}.${further}`
		});
	}
	return steps;
}

/** One line of the trail: an entry, how far out it is, and what it was found from. */
export interface KnowledgeTrailRow {
	/** Entry id, or a synthetic id for a folded group. */
	id: string;
	name: string;
	kind: GuidedEntity['kind'] | null;
	hop: number;
	/** Indent: how many entries lie between it and the question. */
	depth: number;
	origin: 'graph' | 'web';
	/** A folded group of graph entries nothing was searched from ("12 people", "8 entries"). */
	count?: number;
}

/**
 * The search so far as an indented trail: what the graph held, then each web find under the
 * entry it was found from. Built from every tray in the chat, oldest first; an entry appears
 * once, at the shallowest hop that found it. Graph entries nothing was searched from fold into
 * one line so the trail stays about the hops.
 */
export function buildKnowledgeTrail(trays: KnowledgeTray[]): KnowledgeTrailRow[] {
	const entities = new Map<string, GuidedEntity>();
	for (const tray of trays) {
		for (const entity of tray.entities) {
			const earlier = entities.get(entity.id);
			if (!earlier || entity.hop < earlier.hop) entities.set(entity.id, entity);
		}
	}
	const children = new Map<string, GuidedEntity[]>();
	const roots: GuidedEntity[] = [];
	for (const entity of entities.values()) {
		const parent =
			entity.from_entity_id && entity.from_entity_id !== entity.id
				? entities.get(entity.from_entity_id)
				: undefined;
		if (parent) children.set(parent.id, [...(children.get(parent.id) ?? []), entity]);
		else roots.push(entity);
	}
	const rows: KnowledgeTrailRow[] = [];
	const seen = new Set<string>();
	const walk = (entity: GuidedEntity, depth: number) => {
		// A cycle in what was found from what must not loop.
		if (seen.has(entity.id)) return;
		seen.add(entity.id);
		rows.push({
			id: entity.id,
			name: entity.name,
			kind: entity.kind,
			hop: entity.hop,
			depth,
			origin: entity.origin
		});
		for (const child of children.get(entity.id) ?? []) walk(child, depth + 1);
	};
	const quietGraph = roots.filter(
		(entity) => entity.origin === 'graph' && !children.has(entity.id)
	);
	if (quietGraph.length) {
		rows.push({
			id: 'graph-group',
			name:
				quietGraph.length === 1
					? quietGraph[0]!.name
					: quietGraph.every((entity) => entity.kind === 'person')
						? 'people'
						: 'entries',
			kind: quietGraph.length === 1 ? quietGraph[0]!.kind : null,
			hop: 0,
			depth: 0,
			origin: 'graph',
			...(quietGraph.length > 1 ? { count: quietGraph.length } : {})
		});
	}
	for (const root of roots) {
		if (root.origin === 'graph' && !children.has(root.id)) continue;
		walk(root, 0);
	}
	return rows;
}

/** A page's site name for the "Sites read" row. */
export function siteName(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}
