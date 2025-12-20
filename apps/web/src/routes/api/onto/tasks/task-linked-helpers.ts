// apps/web/src/routes/api/onto/tasks/task-linked-helpers.ts
/**
 * Helper functions for fetching linked entities for tasks via onto_edges.
 *
 * This resolves all entities connected to a task through the graph-based
 * relationship system, enabling the TaskEditModal to display and navigate
 * to linked plans, goals, milestones, documents, and related tasks.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface LinkedEntity {
	id: string;
	name?: string;
	title?: string;
	type_key?: string;
	state_key?: string;
	due_at?: string;
	edge_rel: string;
	edge_direction: 'outgoing' | 'incoming';
}

export interface LinkedEntitiesResult {
	plans: LinkedEntity[];
	goals: LinkedEntity[];
	milestones: LinkedEntity[];
	documents: LinkedEntity[];
	dependentTasks: LinkedEntity[];
	outputs: LinkedEntity[];
}

/**
 * Fetches all entities linked to a task via onto_edges and resolves their details.
 *
 * @param supabase - Supabase client
 * @param taskId - The task ID to find linked entities for
 * @returns Object containing arrays of linked entities by type
 */
export async function resolveLinkedEntities(
	supabase: SupabaseClient,
	taskId: string
): Promise<LinkedEntitiesResult> {
	const result: LinkedEntitiesResult = {
		plans: [],
		goals: [],
		milestones: [],
		documents: [],
		dependentTasks: [],
		outputs: []
	};

	// Fetch all edges where task is source or destination
	const { data: edges, error } = await supabase
		.from('onto_edges')
		.select('*')
		.or(`src_id.eq.${taskId},dst_id.eq.${taskId}`);

	if (error || !edges || edges.length === 0) {
		return result;
	}

	// Group entity IDs by type
	const planIds: string[] = [];
	const goalIds: string[] = [];
	const milestoneIds: string[] = [];
	const documentIds: string[] = [];
	const taskIds: string[] = [];
	const outputIds: string[] = [];

	// Track edge info for each entity
	interface EdgeInfo {
		rel: string;
		direction: 'outgoing' | 'incoming';
	}
	const edgeMap = new Map<string, EdgeInfo>();

	for (const edge of edges) {
		const isSource = edge.src_id === taskId;
		const linkedId = isSource ? edge.dst_id : edge.src_id;
		const linkedKind = isSource ? edge.dst_kind : edge.src_kind;

		// Skip if already processed (keep first occurrence)
		if (edgeMap.has(linkedId)) continue;

		edgeMap.set(linkedId, {
			rel: edge.rel,
			direction: isSource ? 'outgoing' : 'incoming'
		});

		switch (linkedKind) {
			case 'plan':
				planIds.push(linkedId);
				break;
			case 'goal':
				goalIds.push(linkedId);
				break;
			case 'milestone':
				milestoneIds.push(linkedId);
				break;
			case 'document':
				documentIds.push(linkedId);
				break;
			case 'task':
				if (linkedId !== taskId) {
					taskIds.push(linkedId);
				}
				break;
			case 'output':
				outputIds.push(linkedId);
				break;
		}
	}

	// Fetch entity details in parallel
	const [plansData, goalsData, milestonesData, documentsData, tasksData, outputsData] =
		await Promise.all([
			planIds.length > 0
				? supabase
						.from('onto_plans')
						.select('id, name, state_key, type_key')
						.is('deleted_at', null)
						.in('id', planIds)
				: Promise.resolve({ data: [] }),
			goalIds.length > 0
				? supabase
						.from('onto_goals')
						.select('id, name, state_key, type_key')
						.is('deleted_at', null)
						.in('id', goalIds)
				: Promise.resolve({ data: [] }),
			milestoneIds.length > 0
				? supabase
						.from('onto_milestones')
						.select('id, title, due_at, type_key')
						.is('deleted_at', null)
						.in('id', milestoneIds)
				: Promise.resolve({ data: [] }),
			documentIds.length > 0
				? supabase
						.from('onto_documents')
						.select('id, title, type_key, state_key')
						.is('deleted_at', null)
						.in('id', documentIds)
				: Promise.resolve({ data: [] }),
			taskIds.length > 0
				? supabase
						.from('onto_tasks')
						.select('id, title, state_key, type_key, priority')
						.is('deleted_at', null)
						.in('id', taskIds)
				: Promise.resolve({ data: [] }),
			outputIds.length > 0
				? supabase
						.from('onto_outputs')
						.select('id, name, type_key, state_key')
						.is('deleted_at', null)
						.in('id', outputIds)
				: Promise.resolve({ data: [] })
		]);

	// Map results with edge relationships
	if (plansData.data) {
		result.plans = plansData.data.map((p) => {
			const edgeInfo = edgeMap.get(p.id);
			return {
				id: p.id,
				name: p.name,
				state_key: p.state_key,
				type_key: p.type_key,
				edge_rel: edgeInfo?.rel || 'belongs_to_plan',
				edge_direction: edgeInfo?.direction || 'outgoing'
			};
		});
	}

	if (goalsData.data) {
		result.goals = goalsData.data.map((g) => {
			const edgeInfo = edgeMap.get(g.id);
			return {
				id: g.id,
				name: g.name,
				state_key: g.state_key,
				type_key: g.type_key,
				edge_rel: edgeInfo?.rel || 'supports_goal',
				edge_direction: edgeInfo?.direction || 'incoming'
			};
		});
	}

	if (milestonesData.data) {
		result.milestones = milestonesData.data.map((m) => {
			const edgeInfo = edgeMap.get(m.id);
			return {
				id: m.id,
				title: m.title,
				due_at: m.due_at,
				type_key: m.type_key,
				edge_rel: edgeInfo?.rel || 'contains',
				edge_direction: edgeInfo?.direction || 'incoming'
			};
		});
	}

	if (documentsData.data) {
		// Filter out scratch/workspace documents that are shown in workspace tab
		result.documents = documentsData.data
			.filter((d) => {
				// Exclude scratch documents - they're shown in workspace tab
				const isScratch =
					d.type_key?.includes('scratch') ||
					d.type_key?.includes('workspace') ||
					d.type_key === 'document.workspace.scratch';
				return !isScratch;
			})
			.map((d) => {
				const edgeInfo = edgeMap.get(d.id);
				return {
					id: d.id,
					title: d.title,
					type_key: d.type_key,
					state_key: d.state_key,
					edge_rel: edgeInfo?.rel || 'has_document',
					edge_direction: edgeInfo?.direction || 'outgoing'
				};
			});
	}

	if (tasksData.data) {
		result.dependentTasks = tasksData.data.map((t) => {
			const edgeInfo = edgeMap.get(t.id);
			return {
				id: t.id,
				title: t.title,
				state_key: t.state_key,
				type_key: t.type_key,
				edge_rel: edgeInfo?.rel || 'depends_on',
				edge_direction: edgeInfo?.direction || 'outgoing'
			};
		});
	}

	if (outputsData.data) {
		result.outputs = outputsData.data.map((o) => {
			const edgeInfo = edgeMap.get(o.id);
			return {
				id: o.id,
				name: o.name,
				type_key: o.type_key,
				state_key: o.state_key,
				edge_rel: edgeInfo?.rel || 'produces',
				edge_direction: edgeInfo?.direction || 'outgoing'
			};
		});
	}

	return result;
}

/**
 * Check if there are any linked entities
 */
export function hasLinkedEntities(linked: LinkedEntitiesResult): boolean {
	return (
		linked.plans.length > 0 ||
		linked.goals.length > 0 ||
		linked.milestones.length > 0 ||
		linked.documents.length > 0 ||
		linked.dependentTasks.length > 0 ||
		linked.outputs.length > 0
	);
}
