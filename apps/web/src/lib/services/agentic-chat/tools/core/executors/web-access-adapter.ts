// apps/web/src/lib/services/agentic-chat/tools/core/executors/web-access-adapter.ts
//
// Web adapter for the shared tools access port (Slice 18 S3-T3). Preserves the
// legacy BaseExecutor semantics byte-for-byte: the RLS user client, the
// auth.uid()-backed membership RPC, the project-first entity walk, and the
// created_by escape hatch for project-less entities. The worker adapter must
// NOT reproduce that escape hatch (S3 map, correction 2).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type {
	AgenticChatToolAccessLevelV1,
	AgenticChatToolAccessPortV1,
	AgenticChatToolProjectSummaryV1
} from '@buildos/agentic-chat-runtime/tools';
import { fetchProjectSummaries } from '$lib/services/ontology/ontology-projects.service';

const ENTITY_TABLES = [
	'onto_tasks',
	'onto_plans',
	'onto_goals',
	'onto_documents',
	'onto_milestones',
	'onto_risks',
	'onto_requirements'
] as const;

export function createWebAgenticChatToolAccessAdapter(input: {
	supabase: SupabaseClient<Database>;
	getActorId: () => Promise<string>;
}): AgenticChatToolAccessPortV1 {
	const { supabase, getActorId } = input;

	async function assertProjectAccess(
		projectId: string,
		requiredAccess: AgenticChatToolAccessLevelV1
	): Promise<void> {
		await getActorId();
		const { data, error } = await supabase.rpc('current_actor_has_project_member_access', {
			p_project_id: projectId,
			p_required_access: requiredAccess
		});

		if (error) throw error;
		if (!data) {
			throw new Error('Project not found or access denied');
		}
	}

	return {
		getActorId,
		async resolveProjectSummaries(): Promise<AgenticChatToolProjectSummaryV1[]> {
			const actorId = await getActorId();
			return (await fetchProjectSummaries(
				supabase as never,
				actorId
			)) as unknown as AgenticChatToolProjectSummaryV1[];
		},
		assertProjectAccess,
		async assertEntityAccess(
			entityId: string,
			requiredAccess: AgenticChatToolAccessLevelV1
		): Promise<void> {
			const { data: project, error: projectError } = await supabase
				.from('onto_projects')
				.select('id')
				.eq('id', entityId)
				.maybeSingle();

			if (projectError) throw projectError;
			if (project?.id) {
				await assertProjectAccess(project.id, requiredAccess);
				return;
			}

			const actorId = await getActorId();
			for (const table of ENTITY_TABLES) {
				const { data, error } = await supabase
					.from(table)
					.select('project_id, created_by')
					.eq('id', entityId)
					.maybeSingle();

				if (error) throw error;
				if (!data) continue;

				if (data.project_id) {
					await assertProjectAccess(data.project_id, requiredAccess);
					return;
				}

				if (data.created_by === actorId) {
					return;
				}
			}

			throw new Error('Entity not found or access denied');
		}
	};
}
