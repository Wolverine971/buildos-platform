// apps/web/src/lib/server/chat-entity-lookups.ts
//
// Batched title lookups for ontology entities a chat refers to (timeline refs,
// a pending change's targets). One query per entity kind, on the caller's
// user-scoped client, so RLS decides what resolves.

function readString(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export type EntityLookupConfig = {
	table: string;
	select: string;
	titleFields: string[];
	hasProjectId: boolean;
};

export const ENTITY_LOOKUP_CONFIG: Record<string, EntityLookupConfig> = {
	project: {
		table: 'onto_projects',
		select: 'id, name',
		titleFields: ['name'],
		hasProjectId: false
	},
	task: {
		table: 'onto_tasks',
		select: 'id, title, project_id',
		titleFields: ['title'],
		hasProjectId: true
	},
	document: {
		table: 'onto_documents',
		select: 'id, title, project_id',
		titleFields: ['title'],
		hasProjectId: true
	},
	goal: {
		table: 'onto_goals',
		select: 'id, name, project_id',
		titleFields: ['name'],
		hasProjectId: true
	},
	plan: {
		table: 'onto_plans',
		select: 'id, name, project_id',
		titleFields: ['name'],
		hasProjectId: true
	},
	milestone: {
		table: 'onto_milestones',
		select: 'id, title, project_id',
		titleFields: ['title'],
		hasProjectId: true
	},
	risk: {
		table: 'onto_risks',
		select: 'id, title, project_id',
		titleFields: ['title'],
		hasProjectId: true
	},
	requirement: {
		table: 'onto_requirements',
		select: 'id, text, project_id',
		titleFields: ['text'],
		hasProjectId: true
	},
	event: {
		table: 'onto_events',
		select: 'id, title, project_id',
		titleFields: ['title'],
		hasProjectId: true
	}
};

export type EntityLookupValue = {
	kind: string;
	id: string;
	title: string | null;
	projectId: string | null;
};

export function entityLookupKey(kind: string, id: string): string {
	return `${kind}:${id}`;
}

function displayTitleFromRow(row: Record<string, unknown>, fields: string[]): string | null {
	for (const field of fields) {
		const value = readString(row[field]);
		if (value) return value;
	}
	return null;
}

export async function fetchEntityLookups(params: {
	supabase: unknown;
	idsByKind: Map<string, Set<string>>;
}): Promise<Map<string, EntityLookupValue>> {
	const lookups = new Map<string, EntityLookupValue>();
	const supabase = params.supabase as any;

	for (const [kind, ids] of params.idsByKind) {
		const config = ENTITY_LOOKUP_CONFIG[kind];
		const idList = Array.from(ids).filter(Boolean);
		if (!config || idList.length === 0) continue;

		const { data, error } = await supabase
			.from(config.table)
			.select(config.select)
			.in('id', idList)
			.limit(idList.length);

		if (error) {
			console.warn(`Failed to enrich ${kind} timeline refs`, error);
			continue;
		}

		for (const row of (data ?? []) as Record<string, unknown>[]) {
			const id = readString(row.id);
			if (!id) continue;
			const projectId =
				kind === 'project' ? id : config.hasProjectId ? readString(row.project_id) : null;
			lookups.set(entityLookupKey(kind, id), {
				kind,
				id,
				title: displayTitleFromRow(row, config.titleFields),
				projectId
			});
		}
	}

	return lookups;
}
