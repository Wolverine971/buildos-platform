// packages/shared-agent-ops/src/knowledge/vocabulary.ts
//
// Code mirror of the knowledge_kinds / knowledge_predicates rows seeded by
// supabase/migrations/20261116230000_knowledge_graph.sql. The database is the source of truth
// and enforces the same rules with triggers; this copy lets writers fail fast with a readable
// message, lets the UI label things without a round trip, and lets tools describe the
// vocabulary to models. Keep both in sync when adding a kind or predicate.

export const KNOWLEDGE_KINDS = [
	'person',
	'org',
	'website',
	'channel',
	'video',
	'place',
	'topic',
	'product',
	'event'
] as const;

export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export interface KnowledgeKindDefinition {
	key: KnowledgeKind;
	label: string;
	pluralLabel: string;
	description: string;
}

export const KNOWLEDGE_KIND_DEFINITIONS: Record<KnowledgeKind, KnowledgeKindDefinition> = {
	person: {
		key: 'person',
		label: 'Person',
		pluralLabel: 'People',
		description: 'A human being: a contact, a colleague, a creator, an executive.'
	},
	org: {
		key: 'org',
		label: 'Organization',
		pluralLabel: 'Organizations',
		description: 'A company, nonprofit, school, agency, show or other group.'
	},
	website: {
		key: 'website',
		label: 'Website',
		pluralLabel: 'Websites',
		description: 'A website or web property, identified by its domain or URL.'
	},
	channel: {
		key: 'channel',
		label: 'Channel',
		pluralLabel: 'Channels',
		description: 'A YouTube channel, podcast, newsletter or other publishing channel.'
	},
	video: {
		key: 'video',
		label: 'Video',
		pluralLabel: 'Videos',
		description: 'A single video, such as a YouTube video.'
	},
	place: {
		key: 'place',
		label: 'Place',
		pluralLabel: 'Places',
		description: 'A city, region, office or other location.'
	},
	topic: {
		key: 'topic',
		label: 'Topic',
		pluralLabel: 'Topics',
		description: 'A subject, field or theme that other entities are about.'
	},
	product: {
		key: 'product',
		label: 'Product',
		pluralLabel: 'Products',
		description: 'A product, service or tool.'
	},
	event: {
		key: 'event',
		label: 'Event',
		pluralLabel: 'Events',
		description: 'A conference, meetup or other happening.'
	}
};

export type KnowledgeValueType =
	| 'entity'
	| 'text'
	| 'url'
	| 'email'
	| 'phone'
	| 'date'
	| 'number'
	| 'json';

export interface KnowledgePredicateDefinition {
	key: string;
	label: string;
	inverseLabel: string | null;
	description: string;
	valueType: KnowledgeValueType;
	/** Allowed subject kinds; empty = any. */
	subjectKinds: readonly KnowledgeKind[];
	/** Allowed object kinds for entity predicates; empty = any. */
	objectKinds: readonly KnowledgeKind[];
	cardinality: 'one' | 'many';
	/** Subject kinds for which a public fact is allowed; empty = never public. */
	shareableSubjectKinds: readonly KnowledgeKind[];
	qualifierKeys: readonly string[];
	sortOrder: number;
}

const p = (
	key: string,
	label: string,
	inverseLabel: string | null,
	description: string,
	valueType: KnowledgeValueType,
	subjectKinds: KnowledgeKind[],
	objectKinds: KnowledgeKind[],
	cardinality: 'one' | 'many',
	shareableSubjectKinds: KnowledgeKind[],
	qualifierKeys: string[],
	sortOrder: number
): KnowledgePredicateDefinition => ({
	key,
	label,
	inverseLabel,
	description,
	valueType,
	subjectKinds,
	objectKinds,
	cardinality,
	shareableSubjectKinds,
	qualifierKeys,
	sortOrder
});

const SHAREABLE_NON_PERSON: KnowledgeKind[] = [
	'org',
	'website',
	'channel',
	'video',
	'place',
	'topic',
	'product',
	'event'
];

export const KNOWLEDGE_PREDICATES: readonly KnowledgePredicateDefinition[] = [
	p(
		'alias',
		'Also known as',
		null,
		'Another name, spelling, handle or nickname for this entity.',
		'text',
		[],
		[],
		'many',
		SHAREABLE_NON_PERSON,
		[],
		10
	),
	p(
		'description',
		'Description',
		null,
		'A short factual description of the entity.',
		'text',
		[],
		[],
		'one',
		SHAREABLE_NON_PERSON,
		[],
		20
	),
	p(
		'headline',
		'Headline',
		null,
		'A person\'s current professional headline or title line, e.g. "CEO at Palantir".',
		'text',
		['person'],
		[],
		'one',
		[],
		[],
		30
	),
	p(
		'url',
		'URL',
		null,
		'The canonical web address of this entity itself: the website, the video page, the channel page.',
		'url',
		['website', 'channel', 'video', 'product', 'event'],
		[],
		'one',
		['website', 'channel', 'video', 'product', 'event'],
		[],
		40
	),
	p(
		'homepage',
		'Website',
		null,
		'The main website of a person or organization.',
		'url',
		['person', 'org'],
		[],
		'one',
		['org'],
		[],
		50
	),
	p(
		'profile_url',
		'Profile',
		null,
		'A profile page on a platform (LinkedIn, X, Instagram, GitHub, YouTube).',
		'url',
		['person', 'org'],
		[],
		'many',
		['org'],
		['platform'],
		60
	),
	p(
		'email',
		'Email',
		null,
		'An email address for contacting this person or organization.',
		'email',
		['person', 'org'],
		[],
		'many',
		[],
		['label'],
		70
	),
	p(
		'phone',
		'Phone',
		null,
		'A phone number for contacting this person, organization or place.',
		'phone',
		['person', 'org', 'place'],
		[],
		'many',
		[],
		['label'],
		80
	),
	p(
		'address',
		'Address',
		null,
		'A postal or street address.',
		'text',
		['person', 'org', 'place'],
		[],
		'many',
		['org', 'place'],
		['label'],
		90
	),
	p(
		'birthday',
		'Birthday',
		null,
		"A person's birthday.",
		'date',
		['person'],
		[],
		'one',
		[],
		[],
		100
	),
	p(
		'note',
		'Note',
		null,
		"The user's own note about this entity.",
		'text',
		[],
		[],
		'many',
		[],
		[],
		110
	),
	p(
		'works_at',
		'Works at',
		'People',
		'The person works or worked at the organization. Use qualifiers for title and dates.',
		'entity',
		['person'],
		['org'],
		'many',
		[],
		['title', 'start', 'end', 'current'],
		200
	),
	p(
		'educated_at',
		'Studied at',
		'Alumni',
		'The person studied at the school, college or university (an organization). Use qualifiers for degree, field and years.',
		'entity',
		['person'],
		['org'],
		'many',
		[],
		['degree', 'field', 'start', 'end'],
		205
	),
	p(
		'knows',
		'Knows',
		'Known by',
		'The subject person knows the object person. From the user\'s own entity this means "I know them". Qualifier via says how (linkedin, phone, met, client, friend, family).',
		'entity',
		['person'],
		['person'],
		'many',
		[],
		['via', 'since', 'context'],
		210
	),
	p(
		'connected_on',
		'Connected on LinkedIn',
		null,
		'The date the owner connected with this person on LinkedIn.',
		'date',
		['person'],
		[],
		'one',
		[],
		[],
		215
	),
	p(
		'part_of',
		'Part of',
		'Includes',
		'The organization is part of a larger organization, or a place lies within a larger place.',
		'entity',
		['org', 'place'],
		['org', 'place'],
		'many',
		['org', 'place'],
		[],
		220
	),
	p(
		'located_in',
		'Located in',
		'Here',
		'The entity is based in or located at the place.',
		'entity',
		['person', 'org', 'event', 'website'],
		['place'],
		'many',
		['org', 'event'],
		[],
		230
	),
	p(
		'owns',
		'Owns',
		'Owned by',
		'The subject owns or runs the object: a website, channel, video, product or organization.',
		'entity',
		['person', 'org'],
		['website', 'channel', 'video', 'product', 'org'],
		'many',
		['org'],
		['role'],
		240
	),
	p(
		'published_by',
		'Published by',
		'Videos',
		'The video was published on this channel.',
		'entity',
		['video'],
		['channel'],
		'one',
		['video'],
		[],
		250
	),
	p(
		'features',
		'Features',
		'Appears in',
		'The video or channel features this person, organization, product or topic.',
		'entity',
		['video', 'channel'],
		['person', 'org', 'product', 'topic'],
		'many',
		['video', 'channel'],
		[],
		260
	),
	p(
		'about',
		'About',
		'Covered by',
		'The entity is about this topic.',
		'entity',
		['video', 'channel', 'website', 'product', 'event', 'org'],
		['topic'],
		'many',
		['video', 'channel', 'website', 'product', 'event', 'org'],
		[],
		270
	),
	p(
		'industry',
		'Industry',
		null,
		"The organization's industry or field.",
		'text',
		['org'],
		[],
		'many',
		['org'],
		[],
		300
	),
	p(
		'founded',
		'Founded',
		null,
		'When the organization was founded.',
		'date',
		['org'],
		[],
		'one',
		['org'],
		[],
		310
	),
	p(
		'published_at',
		'Published',
		null,
		'When the video was published.',
		'date',
		['video'],
		[],
		'one',
		['video'],
		[],
		320
	),
	p(
		'duration_seconds',
		'Length (seconds)',
		null,
		"The video's length in seconds.",
		'number',
		['video'],
		[],
		'one',
		['video'],
		[],
		330
	),
	p(
		'thumbnail_url',
		'Thumbnail',
		null,
		'An image URL representing the entity.',
		'url',
		['video', 'channel', 'website', 'org', 'person', 'product'],
		[],
		'one',
		['video', 'channel', 'website', 'org', 'product'],
		[],
		340
	),
	p(
		'related_to',
		'Related to',
		'Related to',
		'A loose connection when no more specific relationship fits. Prefer a specific predicate.',
		'entity',
		[],
		[],
		'many',
		[],
		['context'],
		900
	)
];

export const KNOWLEDGE_PREDICATE_MAP: ReadonlyMap<string, KnowledgePredicateDefinition> = new Map(
	KNOWLEDGE_PREDICATES.map((def) => [def.key, def])
);

/**
 * A person's contact details and private notes. BuildOS's own chat shows them; a connected AI
 * tool (MCP, agent keys) sees them only when its key opts in to `knowledge.contacts` (DJ,
 * 2026-11-18). Organizations' public phone and email are not covered.
 */
export const KNOWLEDGE_CONTACT_PREDICATES: ReadonlySet<string> = new Set([
	'email',
	'phone',
	'address',
	'birthday',
	'note'
]);

export function isKnowledgeKind(value: unknown): value is KnowledgeKind {
	return typeof value === 'string' && (KNOWLEDGE_KINDS as readonly string[]).includes(value);
}

export function getKnowledgePredicate(key: string): KnowledgePredicateDefinition | null {
	return KNOWLEDGE_PREDICATE_MAP.get(key) ?? null;
}

/** Why a fact would be refused, or null when the subject/object kinds fit the predicate. */
export function checkKnowledgeFactShape(input: {
	predicate: string;
	subjectKind: KnowledgeKind;
	objectKind?: KnowledgeKind | null;
	hasValue: boolean;
}): string | null {
	const def = getKnowledgePredicate(input.predicate);
	if (!def) return `Unknown predicate "${input.predicate}".`;
	if (def.subjectKinds.length > 0 && !def.subjectKinds.includes(input.subjectKind)) {
		return `${def.key} does not apply to a ${input.subjectKind}.`;
	}
	if (def.valueType === 'entity') {
		if (!input.objectKind) return `${def.key} needs another entity, not a value.`;
		if (def.objectKinds.length > 0 && !def.objectKinds.includes(input.objectKind)) {
			return `${def.key} cannot point at a ${input.objectKind}.`;
		}
		return null;
	}
	if (input.objectKind) return `${def.key} takes a value, not an entity.`;
	if (!input.hasValue) return `${def.key} needs a value.`;
	return null;
}

export function isShareableKnowledgeFact(predicate: string, subjectKind: KnowledgeKind): boolean {
	const def = getKnowledgePredicate(predicate);
	return Boolean(def && def.shareableSubjectKinds.includes(subjectKind));
}

/** Compact vocabulary for a model: kinds plus predicates with their shapes. */
export function describeKnowledgeVocabulary(): {
	kinds: Array<{ key: KnowledgeKind; description: string }>;
	predicates: Array<{
		key: string;
		description: string;
		value: KnowledgeValueType;
		subjects: readonly KnowledgeKind[] | 'any';
		objects?: readonly KnowledgeKind[] | 'any';
		qualifiers?: readonly string[];
		cardinality: 'one' | 'many';
	}>;
} {
	return {
		kinds: KNOWLEDGE_KINDS.map((key) => ({
			key,
			description: KNOWLEDGE_KIND_DEFINITIONS[key].description
		})),
		predicates: KNOWLEDGE_PREDICATES.map((def) => ({
			key: def.key,
			description: def.description,
			value: def.valueType,
			subjects: def.subjectKinds.length ? def.subjectKinds : 'any',
			...(def.valueType === 'entity'
				? { objects: def.objectKinds.length ? def.objectKinds : 'any' }
				: {}),
			...(def.qualifierKeys.length ? { qualifiers: def.qualifierKeys } : {}),
			cardinality: def.cardinality
		}))
	};
}
