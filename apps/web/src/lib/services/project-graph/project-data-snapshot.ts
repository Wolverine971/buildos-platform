// apps/web/src/lib/services/project-graph/project-data-snapshot.ts
/**
 * Canonical snapshot of project data used for agentic chat context building.
 * Mirrors the shape described in docs/plans/AGENTIC_CHAT_SERVICES_ANALYSIS.md.
 * No persistence or fetching logic here — this is a shared contract only.
 */

export interface ProjectEntitySummary {
	id: string;
	name: string;
	description?: string | null;
	state_key?: string | null;
	type_key?: string | null;
	priority?: number | null;
	plan_id?: string | null;
	project_id?: string | null;
	title?: string | null; // For documents
	kind?: string | null; // For documents
	props?: Record<string, any> | null;
}

export interface ProjectRelationship {
	source_id: string;
	target_id: string;
	relation: string;
	metadata?: Record<string, any>;
}

export interface ProjectDataSnapshot {
	project: {
		id: string;
		name: string;
		description: string | null;
		state_key: string | null;
		type_key: string | null;
		props: Record<string, any>;
	};
	entities: {
		tasks: ProjectEntitySummary[];
		goals: ProjectEntitySummary[];
		plans: ProjectEntitySummary[];
		documents: ProjectEntitySummary[];
	};
	relationships: ProjectRelationship[];
	metadata: {
		loadedAt: string; // ISO timestamp
		cacheKey: string;
		tokenEstimate?: number;
		entityCounts: Record<string, number>;
	};
}
