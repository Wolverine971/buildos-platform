// apps/web/src/lib/server/fsm/actions/notify.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { FSMAction } from '$lib/types/onto';
import type { TransitionContext } from '../engine';
import type { TypedSupabaseClient } from '@buildos/supabase-client';

type EntityContext = {
	id: string;
	project_id: string;
	type_key: string;
	state_key: string;
};

/**
 * Execute the notify action by creating user notifications for the targeted actors.
 */
export async function executeNotifyAction(
	action: FSMAction,
	entity: EntityContext,
	ctx: TransitionContext,
	clientParam?: TypedSupabaseClient
): Promise<string> {
	const toActorIds = dedupeActorIds(action.to_actor_ids, ctx.actor_id);

	if (toActorIds.length === 0) {
		return 'notify(0 actors)';
	}

	const client = clientParam ?? createAdminSupabaseClient();

	// Resolve actors → users (skip actors without backing user_id, e.g. automation agents)
	const { data: actors, error: actorsError } = await client
		.from('onto_actors')
		.select('id, user_id')
		.in('id', toActorIds);

	if (actorsError) {
		throw new Error(`Failed to resolve notification recipients: ${actorsError.message}`);
	}

	const userIds = Array.from(
		new Set(
			(actors || [])
				.map((actor) => actor.user_id)
				.filter((userId): userId is string => Boolean(userId))
		)
	);

	if (userIds.length === 0) {
		return 'notify(0 actors)';
	}

	const message =
		action.message ?? `State updated to "${entity.state_key}" for ${entity.type_key}`;
	const title = action.name ?? 'Project Updated';
	const actionUrl = entity.project_id ? `/ontology/projects/${entity.project_id}` : null;

	const notificationRows = userIds.map((userId) => ({
		user_id: userId,
		type: 'ontology.fsm_transition',
		event_type: 'ontology.fsm_transition',
		title,
		message,
		action_url: actionUrl,
		priority: 'normal'
	}));

	const { error: notificationError } = await client
		.from('user_notifications')
		.insert(notificationRows);

	if (notificationError) {
		throw new Error(`Failed to create notifications: ${notificationError.message}`);
	}

	return `notify(${notificationRows.length} actors)`;
}

function dedupeActorIds(
	toActorIds: string[] | undefined,
	fallbackActorId: string | null | undefined
): string[] {
	const resolved = new Set<string>();

	if (Array.isArray(toActorIds)) {
		for (const id of toActorIds) {
			if (id) resolved.add(id);
		}
	}

	if (fallbackActorId) {
		resolved.add(fallbackActorId);
	}

	return Array.from(resolved);
}
