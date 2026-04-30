// apps/web/src/lib/components/landing/public-project-preview/lib/public-project-types.ts
/**
 * Shared types for the read-only public project preview suite on the landing page.
 *
 * Mirrors the response shapes from:
 * - GET /api/public/projects
 * - GET /api/public/projects/[id]/graph
 */

import type { GraphSourceData, GraphStats } from '$lib/components/ontology/graph/lib/graph.types';

export interface PublicProjectSummary {
	id: string;
	name: string;
	description: string | null;
	props: Record<string, unknown> | null;
	start_at: string | null;
	end_at: string | null;
}

export interface PublicProjectInfo {
	id: string;
	name: string;
	description: string | null;
	props: Record<string, unknown> | null;
	state_key: string;
	start_at: string | null;
	end_at: string | null;
}

export interface PublicProjectFullData {
	source: GraphSourceData;
	stats: GraphStats & {
		totalDecisions?: number;
	};
	project: PublicProjectInfo;
}

/**
 * Hand-curated commander/lead names for known public projects.
 * Falls back to project.props.commander when unavailable.
 */
export const PROJECT_COMMANDERS: Record<string, string> = {
	'11111111-1111-1111-1111-111111111111': 'General George Washington',
	'22222222-2222-2222-2222-222222222222': 'NASA Administrator James E. Webb',
	'33333333-3333-3333-3333-333333333333': 'Dr. Ryland Grace',
	'44444444-4444-4444-4444-444444444444': 'George R.R. Martin',
	'55555555-5555-5555-5555-555555555555': 'Sarah J. Maas',
	'66666666-6666-6666-6666-666666666666': 'Brigadier General Leslie R. Groves'
};

/**
 * Default project to show on first load. Project Hail Mary is the most
 * universally recognizable creator-facing example.
 */
export const DEFAULT_PUBLIC_PROJECT_ID = '33333333-3333-3333-3333-333333333333';

export function getCommander(
	projectId: string | null,
	props: Record<string, unknown> | null | undefined
): string | undefined {
	if (!projectId) return undefined;
	const hardcoded = PROJECT_COMMANDERS[projectId];
	if (hardcoded) return hardcoded;
	const fromProps = (props as Record<string, unknown> | undefined)?.commander;
	return typeof fromProps === 'string' ? fromProps : undefined;
}

export function formatTimelineYearRange(
	start: string | null | undefined,
	end: string | null | undefined
): string {
	if (!start || !end) return '';
	const startDate = new Date(start);
	const endDate = new Date(end);
	const fmt = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
	return `${fmt(startDate)} - ${fmt(endDate)}`;
}
