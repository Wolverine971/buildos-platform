// apps/web/src/routes/projects/[id]/documents/[document_id]/+page.server.ts
/**
 * Document Focus Page - Server Load Function
 *
 * Loads a single project document with project context for a dedicated
 * document workspace page.
 */

import { error } from '@sveltejs/kit';
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

export const load: PageServerLoad = async ({ params, fetch }) => {
	const { id: projectId, document_id: documentId } = params;

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
		if (projectResponse.status === 404) {
			throw error(404, 'Project not found');
		}
		throw error(500, 'Failed to load project');
	}

	if (!documentResponse.ok) {
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
