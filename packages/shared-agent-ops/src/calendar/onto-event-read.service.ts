// packages/shared-agent-ops/src/calendar/onto-event-read.service.ts
// Read half of the ontology event sync service, shared by web and the worker.
//
// Moved verbatim from apps/web/src/lib/services/ontology/onto-event-sync.service.ts
// so both hosts return byte-identical `onto_events` payloads (including the
// per-user scoping of `onto_event_sync` rows). The write half stays on the web
// service — it needs OAuth, project-calendar provisioning, and activity logging
// that this read path never touches.
import type { Database } from '@buildos/shared-types';
import type { TypedSupabaseClient } from '@buildos/supabase-client';

export type OntoEventRow = Database['public']['Tables']['onto_events']['Row'];
export type OntoEventSyncRow = Database['public']['Tables']['onto_event_sync']['Row'];

export type OntoEventWithSyncRows = OntoEventRow & { onto_event_sync?: OntoEventSyncRow[] };

export interface ListProjectEventsParams {
	timeMin?: string | null;
	timeMax?: string | null;
	ownerType?: string | null;
	ownerId?: string | null;
	includeDeleted?: boolean;
	limit?: number | null;
	orderDirection?: 'ascending' | 'descending';
}

// The sync-row projection is part of the payload contract: both hosts must
// select exactly these columns or the merged calendar view drifts. Exported
// because the shared chat read tools build a second, actor-scoped variant of
// this query (user-scope `list_calendar_events`) that the service does not own;
// selecting the same columns there is what keeps the two payloads identical.
export const ONTO_EVENT_WITH_SYNC_SELECT = `*,
				onto_event_sync (
					id,
					project_calendar_id,
					calendar_source_id,
					user_id,
					provider,
					external_event_id,
					external_calendar_id,
					sync_status,
					sync_error,
					last_synced_at
				)`;

export class OntoEventReadService {
	constructor(protected readonly supabase: TypedSupabaseClient) {}

	async listProjectEvents(
		projectId: string,
		params: ListProjectEventsParams,
		syncUserId?: string | null
	): Promise<OntoEventWithSyncRows[]> {
		let query = this.supabase
			.from('onto_events')
			.select(ONTO_EVENT_WITH_SYNC_SELECT)
			.eq('project_id', projectId)
			.order('start_at', { ascending: params.orderDirection !== 'descending' });

		if (!params.includeDeleted) {
			query = query.is('deleted_at', null);
		}

		if (params.ownerType) {
			query = query.eq('owner_entity_type', params.ownerType);
		}

		if (params.ownerId) {
			query = query.eq('owner_entity_id', params.ownerId);
		}

		if (params.timeMin) {
			query = query.gte('start_at', params.timeMin);
		}

		if (params.timeMax) {
			query = query.lte('start_at', params.timeMax);
		}

		if (params.limit) {
			query = query.limit(params.limit);
		}

		const { data, error } = await query;
		if (error) {
			throw new Error(error.message);
		}

		const events = (data ?? []) as unknown as OntoEventWithSyncRows[];
		return events.map((event) => ({
			...event,
			onto_event_sync: this.scopeSyncRows(event.onto_event_sync, syncUserId)
		}));
	}

	async getEvent(
		eventId: string,
		syncUserId?: string | null
	): Promise<OntoEventWithSyncRows | null> {
		const { data, error } = await this.supabase
			.from('onto_events')
			.select(ONTO_EVENT_WITH_SYNC_SELECT)
			.eq('id', eventId)
			.maybeSingle();

		if (error) {
			throw new Error(error.message);
		}

		if (!data) {
			return null;
		}

		const event = data as unknown as OntoEventWithSyncRows;
		return {
			...event,
			onto_event_sync: this.scopeSyncRows(event.onto_event_sync, syncUserId)
		};
	}

	/**
	 * `undefined` means "caller did not ask for a user scope, keep every row";
	 * an empty/absent user id means "scoped read with no identity", which must
	 * return nothing rather than leaking another member's sync rows.
	 */
	protected scopeSyncRows(
		syncRows: OntoEventSyncRow[] | undefined,
		syncUserId?: string | null
	): OntoEventSyncRow[] {
		return scopeOntoEventSyncRows(syncRows, syncUserId);
	}
}

/**
 * Free-function form of the per-user sync-row scope, for callers that build the
 * `onto_events` query themselves (the shared chat read tools' actor-scoped
 * user-scope list) instead of going through the service.
 */
export function scopeOntoEventSyncRows(
	syncRows: OntoEventSyncRow[] | undefined,
	syncUserId?: string | null
): OntoEventSyncRow[] {
	const rows = syncRows ?? [];
	if (syncUserId === undefined) return rows;
	if (!syncUserId) return [];
	return rows.filter((row) => row.user_id === syncUserId);
}
