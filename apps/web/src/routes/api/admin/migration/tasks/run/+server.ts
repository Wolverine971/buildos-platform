// apps/web/src/routes/api/admin/migration/tasks/run/+server.ts
import { randomUUID } from 'crypto';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { TaskMigrationService } from '$lib/services/ontology/task-migration.service';
import { CalendarMigrationService } from '$lib/services/ontology/calendar-migration.service';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { getLegacyMapping } from '$lib/services/ontology/legacy-mapping.service';
import {
	isMigrationDualWriteEnabledForOrg,
	isMigrationDualWriteEnabledForUser
} from '$lib/utils/feature-flags';
import type { MigrationServiceContext } from '$lib/services/ontology/migration.types';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const payload = await request.json().catch(() => ({}));
	const projectId = typeof payload?.projectId === 'string' ? payload.projectId.trim() : '';
	const dryRun = Boolean(payload?.dryRun);

	if (!projectId) {
		return ApiResponse.badRequest('projectId is required');
	}

	try {
		const { data: projectRow, error: projectError } = await supabase
			.from('projects')
			.select('id, user_id, org_id, name, status')
			.eq('id', projectId)
			.maybeSingle();

		if (projectError || !projectRow) {
			return ApiResponse.notFound('Project');
		}

		const mapping = await getLegacyMapping(supabase, 'projects', projectId);
		const ontoProjectId = mapping?.onto_id ?? null;

		if (!ontoProjectId && !dryRun) {
			return ApiResponse.badRequest(
				'Project must be migrated before tasks can be written to ontology.'
			);
		}

		const actorId = await ensureActorId(supabase, projectRow.user_id);
		const featureFlags = await resolveFeatureFlags(
			supabase,
			projectRow.org_id ?? null,
			projectRow.user_id
		);

		const context: MigrationServiceContext = {
			runId: randomUUID(),
			batchId: randomUUID(),
			dryRun,
			initiatedBy: user.id,
			featureFlags,
			now: new Date().toISOString()
		};

		const taskService = new TaskMigrationService(supabase);
		const calendarService = new CalendarMigrationService(supabase);

		const taskResult = await taskService.migrateTasks(
			projectId,
			ontoProjectId,
			actorId,
			context
		);

		const calendarResult = await calendarService.migrateCalendarData(
			projectId,
			ontoProjectId,
			actorId,
			context,
			taskResult.taskMappings
		);

		return ApiResponse.success({
			runId: context.runId,
			dryRun,
			project: {
				id: projectRow.id,
				name: projectRow.name,
				status: projectRow.status,
				ontoProjectId
			},
			tasks: {
				summary: taskResult.summary,
				records: taskResult.tasks,
				preview: taskResult.preview
			},
			calendars: {
				createdEvents: calendarResult.createdEvents,
				skippedEvents: calendarResult.skippedEvents,
				taskEventCount: calendarResult.taskEventCount,
				preview: calendarResult.preview
			}
		});
	} catch (error) {
		console.error('[Migration] Task run failed', error);
		return ApiResponse.internalError(error, 'Failed to migrate tasks');
	}
};

async function resolveFeatureFlags(
	client: TypedSupabaseClient,
	orgId: string | null,
	userId: string
): Promise<MigrationServiceContext['featureFlags']> {
	const orgFlag = await isMigrationDualWriteEnabledForOrg(client, orgId, {
		fallbackUserId: userId
	});
	const userFlag = await isMigrationDualWriteEnabledForUser(client, userId);

	return {
		dualWriteProjects: orgFlag || userFlag
	};
}
