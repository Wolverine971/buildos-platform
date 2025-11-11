// apps/web/src/lib/services/ontology/onto-event.service.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database, Json } from '@buildos/shared-types';

type OntoEventRow = Database['public']['Tables']['onto_events']['Row'];
type OntoTemplateRow = Database['public']['Tables']['onto_templates']['Row'];

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
	templateId?: string | null;
	templateSnapshot?: Json;
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
	templateId?: string | null;
	templateSnapshot?: Json;
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

		const template = await this.resolveTemplate(client, {
			typeKey: input.typeKey,
			templateId: input.templateId ?? undefined,
			templateSnapshot: input.templateSnapshot
		});

		const payload = {
			org_id: input.orgId ?? null,
			project_id: input.projectId ?? null,
			owner_entity_type: input.owner.type,
			owner_entity_id: input.owner.type === 'standalone' ? null : (input.owner.id ?? null),
			type_key: input.typeKey,
			state_key: input.stateKey ?? 'scheduled',
			template_id: template?.id ?? null,
			template_snapshot: template?.snapshot ?? {},
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
		const template =
			input.typeKey || input.templateId || input.templateSnapshot
				? await this.resolveTemplate(client, {
						typeKey: input.typeKey,
						templateId: input.templateId ?? undefined,
						templateSnapshot: input.templateSnapshot
					})
				: null;

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
			props: input.props,
			template_id: template?.id,
			template_snapshot: template?.snapshot
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

	private static async resolveTemplate(
		client: TypedSupabaseClient,
		opts: {
			typeKey?: string;
			templateId?: string;
			templateSnapshot?: Json;
		}
	): Promise<{ id: string | null; snapshot: Json } | null> {
		if (opts.templateSnapshot && opts.templateId) {
			return { id: opts.templateId, snapshot: opts.templateSnapshot };
		}

		if (opts.templateId) {
			const { data, error } = await client
				.from('onto_templates')
				.select('*')
				.eq('id', opts.templateId)
				.single();

			if (error || !data) {
				throw new Error(error?.message ?? 'Template not found for ontology event');
			}

			return { id: data.id, snapshot: data as unknown as Json };
		}

		if (opts.typeKey) {
			const { data, error } = await client
				.from('onto_templates')
				.select('*')
				.eq('type_key', opts.typeKey)
				.order('updated_at', { ascending: false })
				.limit(1)
				.single();

			if (error || !data) {
				throw new Error(
					error?.message ?? `No template found for ontology event type ${opts.typeKey}`
				);
			}

			return { id: data.id, snapshot: data as unknown as Json };
		}

		return null;
	}
}
