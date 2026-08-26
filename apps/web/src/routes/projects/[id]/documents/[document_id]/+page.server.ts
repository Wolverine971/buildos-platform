// apps/web/src/routes/projects/[id]/documents/[document_id]/+page.server.ts
/**
 * Document Focus Page - Server Load Function
 *
 * Loads a single project document with project context for a dedicated
 * document workspace page.
 */

import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

function filterDocumentEvents(events: any[], linkedEntities: any, documentId: string) {
	const linkedEventIds = new Set(
		(linkedEntities?.events ?? []).map((linkedEvent: { id?: string }) => linkedEvent.id)
	);

	return events.filter(
		(event) =>
			(event?.owner_entity_type === 'document' && event?.owner_entity_id === documentId) ||
			linkedEventIds.has(event?.id)
	);
}

export const load: PageServerLoad = async ({ params, fetch, locals, url }) => {
	const { id: projectId, document_id: documentId } = params;
	const loginRedirect = `/auth/login?redirect=${encodeURIComponent(`${url.pathname}${url.search}`)}`;

	if (!projectId || !documentId) {
		throw error(400, 'Project ID and Document ID required');
	}

	const [projectResponse, documentResponse, eventsResponse, linkedResponse] = await Promise.all([
		fetch(`/api/onto/projects/${projectId}`),
		fetch(`/api/onto/documents/${documentId}/full`),
		fetch(`/api/onto/projects/${projectId}/events?limit=1000`),
		fetch(
			`/api/onto/edges/linked?sourceId=${documentId}&sourceKind=document&projectId=${projectId}&includeAvailable=false`
		)
	]);

	if (!projectResponse.ok) {
		if (projectResponse.status === 401) {
			throw redirect(303, loginRedirect);
		}
		if (projectResponse.status === 403 || projectResponse.status === 404) {
			const { data: routeAccessState, error: accessStateError } = await (
				locals.supabase as any
			).rpc('get_project_route_access_state', {
				p_project_id: projectId
			});

			if (accessStateError) {
				console.error(
					'[Document Focus Page] Failed to resolve project access:',
					accessStateError
				);
				throw error(500, 'Failed to check project access');
			}
			if (routeAccessState === 'forbidden') {
				throw error(403, 'You do not have access to this project.');
			}
			if (routeAccessState === 'unauthenticated') {
				throw redirect(303, loginRedirect);
			}
		}
		if (projectResponse.status === 404) {
			throw error(404, 'Project not found');
		}
		throw error(500, 'Failed to load project');
	}

	if (!documentResponse.ok) {
		if (documentResponse.status === 401) {
			throw redirect(303, loginRedirect);
		}
		if (documentResponse.status === 403) {
			throw error(403, 'You do not have access to this project.');
		}
		if (documentResponse.status === 404) {
			throw error(404, 'Document not found');
		}
		throw error(500, 'Failed to load document');
	}

	const [projectData, documentData] = await Promise.all([
		projectResponse.json(),
		documentResponse.json()
	]);
	const eventsData = eventsResponse.ok ? await eventsResponse.json() : null;
	const linkedData = linkedResponse.ok ? await linkedResponse.json() : null;

	const document = documentData.data?.document;
	if (document && document.project_id !== projectId) {
		throw error(404, 'Document not found in this project');
	}

	return {
		projectId,
		documentId,
		project: projectData.data?.project,
		document,
		linkedEntities: documentData.data?.linkedEntities || {},
		plans: projectData.data?.plans || [],
		goals: projectData.data?.goals || [],
		documents: projectData.data?.documents || [],
		milestones: projectData.data?.milestones || [],
		tasks: projectData.data?.tasks || [],
		risks: projectData.data?.risks || [],
		events: filterDocumentEvents(
			eventsData?.data?.events || [],
			linkedData?.data?.linkedEntities,
			documentId
		)
	};
};
