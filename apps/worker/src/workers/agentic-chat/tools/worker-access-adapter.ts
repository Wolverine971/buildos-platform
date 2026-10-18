// apps/worker/src/workers/agentic-chat/tools/worker-access-adapter.ts
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
		const projectId = await this.resolveEntityProjectId(entityId);
		await this.assertProjectAccess(projectId, requiredAccess);
	}

	/**
	 * The project that owns `entityId` (a project's own id resolves to itself).
	 * Throws the closed denial when the entity is missing or project-less.
	 */
	async resolveEntityProjectId(entityId: string): Promise<string> {
		const { data: project, error: projectError } = await this.client
			.from('onto_projects')
			.select('id')
			.eq('id', entityId)
			.maybeSingle();

		if (projectError) throw projectError;
		if (project?.id) return project.id;

		for (const table of ENTITY_TABLES) {
			const { data, error } = await this.client
				.from(table)
				.select('project_id')
				.eq('id', entityId)
				.maybeSingle();

			if (error) throw error;
			if (!data) continue;

			if (data.project_id) return data.project_id;

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

const ACCESS_RANK: Record<AgenticChatToolAccessLevelV1, number> = { read: 1, write: 2, admin: 3 };

/**
 * One turn's view of a user's access adapter (pipeline audit S7). A project
 * membership check that passed is remembered for the rest of the turn, so the
 * many reads of one turn stop re-running `actor_has_project_member_access` for
 * the same project; a pass at a level also covers every lower level (admin ⊇
 * write ⊇ read, exactly as the SQL function grades membership). Concurrent
 * checks of the same project and level share one RPC.
 *
 * Only passes are cached. A denial or an error is never remembered: the next
 * call asks the database again. Entity-to-project resolution is not cached
 * either (an entity can move), only the project check behind it. The owner
 * drops the cache when a batch that may write is scheduled (`invalidate`) and
 * when the turn ends, so a turn that removes its own access re-checks.
 */
export class WorkerTurnAgenticChatToolAccess implements AgenticChatToolAccessPortV1 {
	private readonly granted = new Map<string, AgenticChatToolAccessLevelV1>();
	private readonly inFlight = new Map<string, Promise<void>>();
	private epoch = 0;
	/** False while a tool batch that may write runs: every check goes to the database. */
	private caching = true;

	constructor(private readonly base: AgenticChatToolAccessPortV1) {}

	getActorId(): Promise<string> {
		return this.base.getActorId();
	}

	resolveProjectSummaries(): Promise<AgenticChatToolProjectSummaryV1[]> {
		return this.base.resolveProjectSummaries();
	}

	assertProjectAccess(
		projectId: string,
		requiredAccess: AgenticChatToolAccessLevelV1
	): Promise<void> {
		if (!this.caching) return this.base.assertProjectAccess(projectId, requiredAccess);
		const projectKey = projectId.toLowerCase();
		const granted = this.granted.get(projectKey);
		if (granted && ACCESS_RANK[granted] >= ACCESS_RANK[requiredAccess]) {
			return Promise.resolve();
		}
		const flightKey = `${projectKey}:${requiredAccess}`;
		const existing = this.inFlight.get(flightKey);
		if (existing) return existing;
		const epoch = this.epoch;
		const check = this.base.assertProjectAccess(projectId, requiredAccess).then(() => {
			// A check that started before an invalidation proves nothing after it.
			if (epoch !== this.epoch) return;
			const current = this.granted.get(projectKey);
			if (!current || ACCESS_RANK[requiredAccess] > ACCESS_RANK[current]) {
				this.granted.set(projectKey, requiredAccess);
			}
		});
		const shared = check.finally(() => {
			if (this.inFlight.get(flightKey) === shared) this.inFlight.delete(flightKey);
		});
		this.inFlight.set(flightKey, shared);
		return shared;
	}

	async assertEntityAccess(
		entityId: string,
		requiredAccess: AgenticChatToolAccessLevelV1
	): Promise<void> {
		if (!(this.base instanceof WorkerAgenticChatToolAccessAdapter)) {
			await this.base.assertEntityAccess(entityId, requiredAccess);
			return;
		}
		const projectId = await this.base.resolveEntityProjectId(entityId);
		await this.assertProjectAccess(projectId, requiredAccess);
	}

	/**
	 * Called before each provider tool batch. A batch that may write starts
	 * clean and remembers nothing while it runs (one of its writes could remove
	 * the access a sibling read just proved); the next read-only batch starts
	 * clean too, then caches again.
	 */
	beginToolBatch(mayWrite: boolean): void {
		if (mayWrite || !this.caching) this.invalidate();
		this.caching = !mayWrite;
	}

	/** Forget every remembered pass, including checks still in flight. */
	invalidate(): void {
		this.epoch += 1;
		this.granted.clear();
		this.inFlight.clear();
	}
}
