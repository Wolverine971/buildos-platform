// apps/web/src/lib/components/knowledge/connections-client.ts
// Browser side of "find connections" (tasker 166): one request returns the people that pass
// the filters, the groups they fall into, and plain sentences about what the graph is missing.

import type {
	KnowledgeConnectionFacet,
	KnowledgeConnectionFilters,
	KnowledgeConnectionGapNote,
	KnowledgeConnectionGroup,
	KnowledgeConnectionPerson,
	KnowledgeConnectionsResult
} from '@buildos/shared-agent-ops/knowledge';
import { requireApiData } from '$lib/utils/api-client-helpers';

export type {
	KnowledgeConnectionFacet,
	KnowledgeConnectionFilters,
	KnowledgeConnectionGapNote,
	KnowledgeConnectionGroup,
	KnowledgeConnectionPerson
};

export type ConnectionsAnswer = KnowledgeConnectionsResult & {
	notes: KnowledgeConnectionGapNote[];
};

/** `null` when the server doesn't have connections switched on yet. */
export async function findConnections(
	filters: KnowledgeConnectionFilters,
	options: {
		facets?: KnowledgeConnectionFacet[];
		limit?: number;
		offset?: number;
		facetLimit?: number;
		signal?: AbortSignal;
	} = {}
): Promise<ConnectionsAnswer | null> {
	const res = await fetch('/api/knowledge/connections', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			filters,
			facets: options.facets ?? [],
			limit: options.limit ?? 50,
			offset: options.offset ?? 0,
			facet_limit: options.facetLimit ?? 12
		}),
		signal: options.signal
	});
	const data = await requireApiData<ConnectionsAnswer | { unavailable: true }>(
		res,
		'Could not find connections'
	);
	return 'unavailable' in data ? null : data;
}

/** "Senior Engineer at Acme", "Acme", or the entry's own one-liner. */
export function connectionLine(person: KnowledgeConnectionPerson): string {
	const job = person.jobs[0];
	if (!job) return person.summary ?? '';
	// Some titles already carry the employer ("Instructor at UXM").
	const named = job.title?.toLowerCase().endsWith(` at ${job.org.toLowerCase()}`);
	const role = job.title ? (named ? job.title : `${job.title} at ${job.org}`) : job.org;
	return job.current ? role : `Formerly ${role}`;
}

/** The words of a filter box: split on commas, trimmed, no blanks or repeats. */
export function filterWords(text: string): string[] {
	return [
		...new Set(
			text
				.split(',')
				.map((word) => word.replace(/\s+/g, ' ').trim())
				.filter(Boolean)
		)
	].slice(0, 12);
}

export interface ConnectionChip {
	facet: 'company' | 'place';
	key: string;
	name: string;
	/** Other people there (the card's own person is never counted). */
	people: number;
	sample: string[];
}

/**
 * The chips on a person's card: "Also at Acme · 4", "Near Annapolis, Maryland · 9". Only the
 * person's own employers and places count; the other people's second jobs don't make chips.
 */
export function connectionChips(answer: ConnectionsAnswer): ConnectionChip[] {
	const anchor = answer.anchor;
	if (!anchor) return [];
	const chips: ConnectionChip[] = [];
	const pick = (facet: 'company' | 'place', keys: Set<string>) => {
		for (const group of answer.facets[facet]?.groups ?? []) {
			if (!keys.has(group.key) || group.people < 1) continue;
			chips.push({
				facet,
				key: group.key,
				name: group.name,
				people: group.people,
				sample: group.sample
			});
		}
	};
	pick('company', new Set(anchor.companies.map((company) => company.key)));
	pick('place', new Set(anchor.places.map((place) => place.key)));
	return chips;
}
