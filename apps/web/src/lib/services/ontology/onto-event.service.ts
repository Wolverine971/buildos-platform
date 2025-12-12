// apps/web/src/lib/services/ontology/onto-event.service.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database, Json } from '@buildos/shared-types';

type OntoEventRow = Database['public']['Tables']['onto_events']['Row'];

export type OntoEventOwnerType =
	| 'project'
	| 'plan'
	| 'task'
	| 'goal'
	| 'output'
	| 'actor'
	| 'standalone';

export interface OntoEventOwner {
	type: OntoEventOwnerType;
	id?: string | null;
}

export interface CreateOntoEventInput {
	orgId?: string | null;
	projectId?: string | null;
	owner: OntoEventOwner;
	typeKey: string;
	stateKey?: string;
	title: string;
	startAt: string;
	endAt?: string | null;
	allDay?: boolean;
	timezone?: string | null;
	description?: string | null;
	location?: string | null;
	recurrence?: Json;
	externalLink?: string | null;
	props?: Json;
	createdBy: string;
}

export interface UpdateOntoEventInput {
	id: string;
	title?: string;
	description?: string | null;
	location?: string | null;
	startAt?: string;
	endAt?: string | null;
	allDay?: boolean;
	timezone?: string | null;
	stateKey?: string;
	typeKey?: string;
	recurrence?: Json;
	externalLink?: string | null;
	props?: Json;
}

export interface OntoEventQueryParams {
	projectId?: string;
	owner?: Partial<OntoEventOwner>;
	timeRange?: {
		start?: string;
		end?: string;
	};
	includeDeleted?: boolean;
	limit?: number;
}

export class OntoEventService {
	static async createEvent(
		client: TypedSupabaseClient,
		input: CreateOntoEventInput
	): Promise<OntoEventRow> {
		this.assertOwner(input.owner);

		// Template system removed Dec 2025 - events use type_key only
		const payload = {
			org_id: input.orgId ?? null,
			project_id: input.projectId ?? null,
			owner_entity_type: input.owner.type,
			owner_entity_id: input.owner.type === 'standalone' ? null : (input.owner.id ?? null),
			type_key: input.typeKey,
			state_key: input.stateKey ?? 'scheduled',
			title: input.title,
			description: input.description ?? null,
			location: input.location ?? null,
			start_at: input.startAt,
			end_at: input.endAt ?? null,
			all_day: input.allDay ?? false,
			timezone: input.timezone ?? null,
			recurrence: input.recurrence ?? {},
			external_link: input.externalLink ?? null,
			props: input.props ?? {},
			created_by: input.createdBy
		};

		const { data, error } = await client.from('onto_events').insert(payload).select().single();

		if (error || !data) {
			throw new Error(error?.message ?? 'Failed to create ontology event');
		}

		return data;
	}

	static async updateEvent(
		client: TypedSupabaseClient,
		input: UpdateOntoEventInput
	): Promise<OntoEventRow> {

		// Template system removed Dec 2025 - events use type_key only
		const updates: Partial<OntoEventRow> = {
			title: input.title,
			description: input.description,
			location: input.location,
			start_at: input.startAt,
			end_at: input.endAt,
			all_day: input.allDay,
			timezone: input.timezone,
			state_key: input.stateKey,
			type_key: input.typeKey,
			recurrence: input.recurrence,
			external_link: input.externalLink,
			props: input.props
		};

		const { data, error } = await client
			.from('onto_events')
			.update(this.stripUndefined(updates))
			.eq('id', input.id)
			.select()
			.single();

		if (error || !data) {
			throw new Error(error?.message ?? 'Failed to update ontology event');
		}

		return data;
	}

	static async fetchEvents(
		client: TypedSupabaseClient,
		params: OntoEventQueryParams
	): Promise<OntoEventRow[]> {
		let query = client.from('onto_events').select('*');

		if (!params.includeDeleted) {
			query = query.is('deleted_at', null);
		}

		if (params.projectId) {
			query = query.eq('project_id', params.projectId);
		}

		if (params.owner?.type) {
			query = query.eq('owner_entity_type', params.owner.type);
		}

		if (params.owner?.id) {
			query = query.eq('owner_entity_id', params.owner.id);
		}

		if (params.timeRange?.start) {
			query = query.gte('start_at', params.timeRange.start);
		}

		if (params.timeRange?.end) {
			query = query.lte('start_at', params.timeRange.end);
		}

		if (params.limit) {
			query = query.limit(params.limit);
		}

		query = query.order('start_at', { ascending: true });

		const { data, error } = await query;

		if (error) {
			throw new Error(error.message);
		}

		return data ?? [];
	}

	private static assertOwner(owner: OntoEventOwner) {
		if (!owner?.type) {
			throw new Error('Owner type is required for ontology events');
		}

		if (owner.type !== 'standalone' && !owner.id) {
			throw new Error(`Owner id is required when owner type is ${owner.type}`);
		}
	}

	private static stripUndefined<T extends Record<string, unknown>>(value: T): T {
		return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
	}
}
