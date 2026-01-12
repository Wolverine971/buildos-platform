// apps/web/src/routes/projects/[id]/tasks/[task_id]/+page.server.ts
/**
 * Task Focus Page - Server Load Function
 *
 * Loads task data along with project context (goals, plans, documents, milestones)
 * for the focused task work area page.
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Task API: /apps/web/src/routes/api/onto/tasks/[id]/full/+server.ts
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const { id: projectId, task_id: taskId } = params;

	if (!projectId || !taskId) {
		throw error(400, 'Project ID and Task ID required');
	}

	// Fetch project data and task data in parallel
	const [projectResponse, taskResponse] = await Promise.all([
		fetch(`/api/onto/projects/${projectId}`),
		fetch(`/api/onto/tasks/${taskId}/full`)
	]);

	if (!projectResponse.ok) {
		if (projectResponse.status === 404) {
			throw error(404, 'Project not found');
		}
		throw error(500, 'Failed to load project');
	}

	if (!taskResponse.ok) {
		if (taskResponse.status === 404) {
			throw error(404, 'Task not found');
		}
		throw error(500, 'Failed to load task');
	}

	const [projectData, taskData] = await Promise.all([
		projectResponse.json(),
		taskResponse.json()
	]);

	// Verify task belongs to this project
	const task = taskData.data?.task;
	if (task && task.project_id !== projectId) {
		throw error(404, 'Task not found in this project');
	}

	return {
		projectId,
		taskId,
		project: projectData.data?.project,
		task: task,
		linkedEntities: taskData.data?.linkedEntities || {},
		// Project context data
		plans: projectData.data?.plans || [],
		goals: projectData.data?.goals || [],
		documents: projectData.data?.documents || [],
		milestones: projectData.data?.milestones || [],
		tasks: projectData.data?.tasks || [],
		risks: projectData.data?.risks || []
	};
};
