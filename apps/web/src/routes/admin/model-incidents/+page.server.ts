// apps/web/src/routes/admin/model-incidents/+page.server.ts
//
// Stalled and failed model calls over a window. The list carries metadata only
// (no prompt or reply text); opening or exporting one incident is logged.
import type { PageServerLoad } from './$types';
import {
	MODEL_INCIDENT_DAY_CHOICES,
	incidentUserEmails,
	listModelIncidents,
	modelIncidentFiltersFromUrl,
	requireModelIncidentAdmin
} from '$lib/server/model-incidents';
import { summarizeIncidents } from '$lib/services/admin/model-incidents/overview';
import { buildIncidentStory } from '$lib/services/admin/model-incidents/story';

export const load: PageServerLoad = async ({ locals, url, setHeaders }) => {
	await requireModelIncidentAdmin(locals);
	setHeaders({ 'cache-control': 'private, no-store' });
	const filters = modelIncidentFiltersFromUrl(url);
	// Facets come from the window without the facet filters, so every choice stays visible.
	const [{ rows, truncated }, unfiltered] = await Promise.all([
		listModelIncidents(filters),
		filters.kind || filters.lane || filters.passRole || filters.provider
			? listModelIncidents({
					...filters,
					kind: null,
					lane: null,
					passRole: null,
					provider: null
				})
			: null
	]);
	const facetRows = unfiltered?.rows ?? rows;
	const emails = await incidentUserEmails(rows.map((row) => row.user_id));
	return {
		filters,
		dayChoices: [...MODEL_INCIDENT_DAY_CHOICES],
		truncated,
		overview: summarizeIncidents(rows, { days: filters.days }),
		facets: {
			lanes: [...new Set(facetRows.map((row) => row.lane))].sort(),
			providers: [
				...new Set(
					facetRows.map((row) => row.provider).filter((value): value is string => !!value)
				)
			].sort()
		},
		incidents: rows.map((row) => {
			const story = buildIncidentStory(row);
			const eventual = row.eventual ?? null;
			return {
				id: row.id,
				createdAt: row.created_at,
				kind: row.kind,
				reason: row.reason,
				headline: story.headline,
				source: story.source,
				lane: row.lane,
				model: row.model_used ?? row.model_requested,
				provider: row.provider,
				httpStatus: row.http_status,
				durationMs: row.duration_ms,
				attempt: row.provider_attempt,
				eventual: eventual
					? {
							status: typeof eventual.status === 'string' ? eventual.status : null,
							endedBy:
								typeof eventual.ended_by === 'string' ? eventual.ended_by : null,
							completed: eventual.completed === true,
							totalMs:
								typeof eventual.total_ms === 'number' ? eventual.total_ms : null
						}
					: null,
				userEmail: row.user_id ? (emails[row.user_id] ?? null) : null,
				topFinding: story.findings[0] ?? null
			};
		})
	};
};
