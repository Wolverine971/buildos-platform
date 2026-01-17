// apps/web/src/routes/api/onto/projects/[id]/entities/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { verifyProjectAccess, sanitizeSearchQuery } from '$lib/utils/api-helpers';
import type { FocusEntitySummary } from '@buildos/shared-types';

type FocusEntityType = 'task' | 'goal' | 'plan' | 'document' | 'milestone' | 'risk' | 'requirement';

const ENTITY_CONFIG: Record<
	FocusEntityType,
	{ table: string; select: string; searchField: 'name' | 'title' }
> = {
	task: {
		table: 'onto_tasks',
		select: 'id, title, state_key, priority, due_at, created_at, props',
		searchField: 'title'
	},
	goal: {
		table: 'onto_goals',
		select: 'id, name, type_key, created_at, props',
		searchField: 'name'
	},
	plan: {
		table: 'onto_plans',
		select: 'id, name, state_key, created_at, props',
		searchField: 'name'
	},
	document: {
		table: 'onto_documents',
		select: 'id, title, state_key, created_at, props',
		searchField: 'title'
	},
	milestone: {
		table: 'onto_milestones',
		select: 'id, title, due_at, state_key, created_at, props',
		searchField: 'title'
	},
	risk: {
		table: 'onto_risks',
		select: 'id, title, state_key, impact, probability, created_at, props',
		searchField: 'title'
	},
	requirement: {
		table: 'onto_requirements',
		select: 'id, text, priority, type_key, created_at, props',
		searchField: 'text'
	}
};

export const GET: RequestHandler = async ({ params, url, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const projectId = params.id;
		if (!projectId) {
			return ApiResponse.badRequest('Project ID required');
		}

		const supabase = locals.supabase;

		// Verify user has access to this project (security fix: 2026-01-03)
		const authResult = await verifyProjectAccess(supabase, projectId, session.user.id);
		if (!authResult.authorized) {
			return authResult.error!;
		}

		const typeParam = (url.searchParams.get('type') ?? 'task') as FocusEntityType;
		if (!(typeParam in ENTITY_CONFIG)) {
			return ApiResponse.badRequest('Invalid focus entity type');
		}

		const search = url.searchParams.get('search');
		const { table, select, searchField } = ENTITY_CONFIG[typeParam];

		let query = supabase
			.from(table)
			.select(select)
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.limit(50);

		// Sanitize search input to prevent SQL injection (security fix: 2026-01-03)
		if (search) {
			const sanitizedSearch = sanitizeSearchQuery(search);
			if (sanitizedSearch) {
				query = query.ilike(searchField, `%${sanitizedSearch}%`);
			}
		}

		if (typeParam === 'task') {
			query = query
				.order('priority', { ascending: false, nullsFirst: false })
				.order('created_at', { ascending: false });
		} else if (typeParam === 'milestone') {
			query = query
				.order('due_at', { ascending: true, nullsFirst: true })
				.order('created_at', { ascending: false });
		} else {
			query = query.order('created_at', { ascending: false });
		}

		const { data, error } = await query;
		if (error) {
			console.error('[FocusEntitiesAPI] Failed to load entities:', error);
			return ApiResponse.error('Failed to load project entities', 500);
		}

		const entities: FocusEntitySummary[] = (data || []).map((item: any) => {
			const resolvedName = item.title ?? item.name ?? item.text ?? 'Untitled';
			const dueAt = item.due_at ?? null;

			return {
				id: item.id,
				name: resolvedName,
				type: typeParam,
				metadata: {
					state_key: item.state_key ?? item.type_key ?? null,
					priority: 'priority' in item ? item.priority : null,
					due_at: dueAt
				}
			};
		});

		return ApiResponse.success(entities);
	} catch (error) {
		console.error('[FocusEntitiesAPI] Unexpected error:', error);
		return ApiResponse.internalError(error, 'Failed to load focus entities');
	}
};
