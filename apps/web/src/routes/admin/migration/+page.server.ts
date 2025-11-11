// apps/web/src/routes/admin/migration/+page.server.ts
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const DEFAULT_USER_ID = '255735ad-a34b-4ca9-942c-397ed8cc1435';

type ProjectRow = {
	id: string;
	name: string;
	status: string;
	updated_at: string;
	created_at: string;
	hasMapping: boolean;
	runtimeOntoId: string | null;
};

type RunRow = {
	run_id: string;
	status: string;
	created_at: string;
	updated_at: string;
	metadata: Record<string, unknown> | null;
};

export const load: PageServerLoad = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		throw redirect(303, '/auth/login');
	}

	if (!user.is_admin) {
		throw error(403, 'Admin access required');
	}

	const targetUserId = url.searchParams.get('userId')?.trim() || DEFAULT_USER_ID;

	let targetUser: { id: string; email: string; name: string | null } | null = null;
	let projects: ProjectRow[] = [];

	if (targetUserId) {
		const { data: userRow } = await supabase
			.from('users')
			.select('id, email, name')
			.eq('id', targetUserId)
			.maybeSingle();

		targetUser = (userRow as typeof targetUser) ?? null;

		const { data: projectRows, error: projectError } = await supabase
			.from('projects')
			.select('id, name, status, updated_at, created_at')
			.eq('user_id', targetUserId)
			.order('created_at', { ascending: true });

		if (projectError) {
			throw error(500, `Failed to load projects: ${projectError.message}`);
		}

		const projectIds = (projectRows ?? []).map((project) => project.id);

		let mappingMap = new Map<string, string | null>();
		if (projectIds.length) {
			const { data: mappings, error: mappingError } = await supabase
				.from('legacy_entity_mappings')
				.select('legacy_id, onto_id')
				.eq('legacy_table', 'projects')
				.in('legacy_id', projectIds);

			if (mappingError) {
				throw error(500, `Failed to load project mappings: ${mappingError.message}`);
			}

			mappingMap = new Map((mappings ?? []).map((row) => [row.legacy_id, row.onto_id]));
		}

		projects = (projectRows ?? []).map((project) => ({
			id: project.id,
			name: project.name,
			status: project.status,
			updated_at: project.updated_at,
			created_at: project.created_at,
			hasMapping: mappingMap.has(project.id),
			runtimeOntoId: mappingMap.get(project.id) ?? null
		}));
	}

	const { data: runRows, error: runsError } = await supabase
		.from('migration_log')
		.select('run_id, status, created_at, updated_at, metadata')
		.eq('entity_type', 'run')
		.order('created_at', { ascending: false })
		.limit(10);

	if (runsError) {
		throw error(500, `Failed to load migration runs: ${runsError.message}`);
	}

	return {
		targetUser,
		targetUserId,
		defaultUserId: DEFAULT_USER_ID,
		projects,
		runs: (runRows as RunRow[]) ?? []
	};
};
