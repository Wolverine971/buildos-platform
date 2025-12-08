// apps/web/src/routes/admin/migration/errors/+page.server.ts
// Error browser page - data loader
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	MigrationErrorService,
	type ErrorsQueryParams
} from '$lib/services/ontology/migration-error.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const load: PageServerLoad = async ({ url, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		throw redirect(303, '/auth/login');
	}

	if (!user.is_admin) {
		throw error(403, 'Admin access required');
	}

	// Parse query parameters
	const params: ErrorsQueryParams = {
		limit: Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200),
		offset: parseInt(url.searchParams.get('offset') ?? '0', 10),
		userId: url.searchParams.get('userId') ?? undefined,
		entityType:
			(url.searchParams.get('entityType') as ErrorsQueryParams['entityType']) ?? undefined,
		errorCategory:
			(url.searchParams.get('errorCategory') as ErrorsQueryParams['errorCategory']) ??
			undefined,
		runId: url.searchParams.get('runId') ?? undefined,
		projectId: url.searchParams.get('projectId') ?? undefined,
		search: url.searchParams.get('search') ?? undefined,
		sortBy: (url.searchParams.get('sortBy') as ErrorsQueryParams['sortBy']) ?? 'createdAt',
		sortOrder: (url.searchParams.get('sortOrder') as ErrorsQueryParams['sortOrder']) ?? 'desc'
	};

	const supabase = createAdminSupabaseClient();
	const errorService = new MigrationErrorService(supabase);

	try {
		const errorsData = await errorService.getErrors(params);
		return {
			errors: errorsData.errors,
			pagination: errorsData.pagination,
			categoryCounts: errorsData.categoryCounts,
			filters: errorsData.filters
		};
	} catch (err) {
		console.error('[Migration Errors] Failed to load errors:', err);
		throw error(
			500,
			`Failed to load errors: ${err instanceof Error ? err.message : 'Unknown error'}`
		);
	}
};
