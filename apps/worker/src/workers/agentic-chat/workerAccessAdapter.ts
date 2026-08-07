// apps/worker/src/workers/agentic-chat/workerAccessAdapter.ts
//
// Worker adapter for the shared tools access port (Slice 18 S3). The worker
// reads with a service-role Supabase client, so RLS grants nothing and the
// auth.uid()-derived `current_actor_has_project_member_access` RPC web uses
// fails CLOSED (S3 extraction map, correction 1). This adapter resolves the
// acting user's ontology actor explicitly (`ensureActorId`) and gates project
// membership through the actor-explicit RPC twin
// `actor_has_project_member_access(p_actor_id, ...)`, which is already granted
// to service_role by the same migration.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type {
	AgenticChatToolAccessLevelV1,
	AgenticChatToolAccessPortV1,
	AgenticChatToolProjectSummaryV1
} from '@buildos/agentic-chat-runtime/tools';
import { AgenticChatToolAccessDeniedError } from '@buildos/agentic-chat-runtime/tools';
import {
	ensureActorId,
	fetchProjectSummaries
} from '@buildos/shared-agent-ops/ontology/ontology-projects.service';

/**
 * Same seven entity tables the web adapter walks
 * (apps/web/src/lib/services/agentic-chat/tools/core/executors/web-access-adapter.ts),
 * kept in the same order so the two hosts resolve an entity identically.
 */
const ENTITY_TABLES = [
	'onto_tasks',
	'onto_plans',
	'onto_goals',
	'onto_documents',
	'onto_milestones',
	'onto_risks',
	'onto_requirements'
] as const;

export class WorkerAgenticChatToolAccessAdapter implements AgenticChatToolAccessPortV1 {
	private readonly client: SupabaseClient<Database>;
	private readonly userId: string;
	/** Actor resolution is cached per adapter instance (one adapter per user). */
	private actorIdPromise: Promise<string> | null = null;

	constructor(input: { client: SupabaseClient<Database>; userId: string }) {
		this.client = input.client;
		this.userId = input.userId;
	}

	getActorId(): Promise<string> {
		if (!this.actorIdPromise) {
			this.actorIdPromise = ensureActorId(this.client as never, this.userId).catch(
				(error) => {
					// Do not cache failures: a transient RPC error must not poison
					// every later read for this user.
					this.actorIdPromise = null;
					throw error;
				}
			);
		}
		return this.actorIdPromise;
	}

	async resolveProjectSummaries(): Promise<AgenticChatToolProjectSummaryV1[]> {
		const actorId = await this.getActorId();
		return (await fetchProjectSummaries(
			this.client as never,
			actorId
		)) as unknown as AgenticChatToolProjectSummaryV1[];
	}

	async assertProjectAccess(
		projectId: string,
		requiredAccess: AgenticChatToolAccessLevelV1
	): Promise<void> {
		const actorId = await this.getActorId();
		const { data, error } = await this.client.rpc('actor_has_project_member_access', {
			p_actor_id: actorId,
			p_project_id: projectId,
			p_required_access: requiredAccess
		});

		if (error) throw error;
		if (!data) {
			// Byte-identical to the web adapter's message so error payloads stay
			// parity-identical across hosts.
			throw new AgenticChatToolAccessDeniedError();
		}
	}

	async assertEntityAccess(
		entityId: string,
		requiredAccess: AgenticChatToolAccessLevelV1
	): Promise<void> {
		const { data: project, error: projectError } = await this.client
			.from('onto_projects')
			.select('id')
			.eq('id', entityId)
			.maybeSingle();

		if (projectError) throw projectError;
		if (project?.id) {
			await this.assertProjectAccess(project.id, requiredAccess);
			return;
		}

		for (const table of ENTITY_TABLES) {
			const { data, error } = await this.client
				.from(table)
				.select('project_id')
				.eq('id', entityId)
				.maybeSingle();

			if (error) throw error;
			if (!data) continue;

			if (data.project_id) {
				await this.assertProjectAccess(data.project_id, requiredAccess);
				return;
			}

			// DELIBERATE ASYMMETRY with the web adapter (S3 extraction map,
			// correction 2): web grants a project-less entity when
			// `created_by === actorId` — safe there because its RLS user client
			// already scoped the row. Under the worker's service-role client that
			// escape hatch would be fail-OPEN (every row is visible), so a
			// project-less entity NEVER grants here and falls through to the
			// closed throw below.
		}

		throw new AgenticChatToolAccessDeniedError('Entity not found or access denied');
	}
}
