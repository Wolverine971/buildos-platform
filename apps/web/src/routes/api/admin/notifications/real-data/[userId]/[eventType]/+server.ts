// apps/web/src/routes/api/admin/notifications/real-data/[userId]/[eventType]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import type { EventType } from '@buildos/shared-types';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();

		if (!user?.is_admin) {
			return ApiResponse.forbidden('Admin access required');
		}

		const { userId, eventType } = params;

		if (!userId || !eventType) {
			return ApiResponse.error('User ID and event type are required');
		}

		// Fetch real data based on event type
		let payload: Record<string, any> = {};

		switch (eventType as EventType) {
			case 'brief.completed': {
				// Fetch user's most recent brief
				const { data: brief } = await supabase
					.from('ontology_daily_briefs')
					.select('id, brief_date, metadata')
					.eq('user_id', userId)
					.eq('generation_status', 'completed')
					.order('brief_date', { ascending: false })
					.limit(1)
					.single();

				if (brief) {
					const metadata = (brief.metadata || {}) as Record<string, any>;
					// Get user's timezone
					const { data: userData } = await supabase
						.from('users')
						.select('timezone')
						.eq('id', userId)
						.single();

					payload = {
						brief_id: brief.id,
						brief_date: brief.brief_date,
						timezone: metadata?.timezone || userData?.timezone || 'America/Los_Angeles',
						task_count: metadata?.totalTasks || 0,
						project_count: metadata?.totalProjects || 0
					};
				}
				break;
			}

			case 'brief.failed': {
				// Get user's timezone for failed brief
				const { data: userData } = await supabase
					.from('users')
					.select('timezone')
					.eq('id', userId)
					.single();

				payload = {
					brief_date: new Date().toISOString().split('T')[0],
					error_message: 'Example error: Rate limit exceeded',
					timezone: userData?.timezone || 'America/Los_Angeles'
				};
				break;
			}

			case 'brain_dump.processed': {
				// Fetch user's most recent brain dump
				const { data: brainDump } = await supabase
					.from('onto_braindumps')
					.select('id, status, metadata, processed_at, created_at')
					.eq('user_id', userId)
					.eq('status', 'processed')
					.order('created_at', { ascending: false })
					.limit(1)
					.single();

				if (brainDump) {
					const metadata = (brainDump.metadata || {}) as Record<string, any>;
					const projectId =
						typeof metadata?.project_id === 'string'
							? metadata.project_id
							: typeof metadata?.projectId === 'string'
								? metadata.projectId
								: null;
					let projectName = 'Unlinked Project';

					if (projectId) {
						const { data: project } = await supabase
							.from('onto_projects')
							.select('name')
							.eq('id', projectId)
							.single();
						projectName = project?.name || 'Unnamed Project';
					}

					const tasksCreated =
						typeof metadata?.tasks_created === 'number'
							? metadata.tasks_created
							: typeof metadata?.task_count === 'number'
								? metadata.task_count
								: 0;
					const processingTimeMs =
						typeof metadata?.processing_time_ms === 'number'
							? metadata.processing_time_ms
							: brainDump.processed_at && brainDump.created_at
								? new Date(brainDump.processed_at).getTime() -
									new Date(brainDump.created_at).getTime()
								: 1500;
					const safeProcessingTimeMs = Math.max(0, processingTimeMs);

					payload = {
						brain_dump_id: brainDump.id,
						project_id: projectId || '',
						project_name: projectName,
						tasks_created: tasksCreated,
						processing_time_ms: safeProcessingTimeMs
					};
				}
				break;
			}

			case 'task.due_soon': {
				// Fetch user's next upcoming task
				const now = new Date().toISOString();
				const { data: task } = await supabase
					.from('onto_tasks')
					.select(
						`
						id,
						title,
						due_at,
						onto_projects!inner(id, name)
					`
					)
					.eq('created_by', userId)
					.not('due_at', 'is', null)
					.gte('due_at', now)
					.neq('state_key', 'done')
					.order('due_at', { ascending: true })
					.limit(1)
					.single();

				if (task && task.due_at) {
					const dueDate = new Date(task.due_at);
					const hoursUntilDue = Math.floor(
						(dueDate.getTime() - Date.now()) / (1000 * 60 * 60)
					);

					payload = {
						task_id: task.id,
						task_title: task.title,
						project_id: (task.onto_projects as any)?.id || '',
						project_name: (task.onto_projects as any)?.name || 'Unnamed Project',
						due_date: task.due_at,
						hours_until_due: Math.max(0, hoursUntilDue)
					};
				}
				break;
			}

			case 'project.phase_scheduled': {
				// Fetch user's most recent project with phases
				const { data: phasePlans } = await supabase
					.from('onto_plans')
					.select(
						`
						id,
						name,
						project_id,
						props,
						created_at,
						onto_projects!inner(id, name)
					`
					)
					.eq('type_key', 'plan.phase.project')
					.eq('created_by', userId)
					.is('deleted_at', null)
					.order('created_at', { ascending: false })
					.limit(5);

				const phasePlan =
					(phasePlans || []).find((plan: any) => {
						const dateRange = plan?.props?.date_range || plan?.props?.dateRange;
						return dateRange?.start || dateRange?.end;
					}) || (phasePlans || [])[0];

				if (phasePlan) {
					const dateRange =
						(phasePlan.props as any)?.date_range ||
						(phasePlan.props as any)?.dateRange ||
						{};
					const scheduledDate =
						dateRange?.start ||
						dateRange?.end ||
						phasePlan.created_at ||
						new Date().toISOString();

					// Count tasks in this phase
					const { count: taskCount } = await supabase
						.from('onto_tasks')
						.select('id', { count: 'exact', head: true })
						.eq('plan_id', phasePlan.id);

					payload = {
						project_id: phasePlan.project_id || '',
						project_name: (phasePlan.onto_projects as any)?.name || 'Unnamed Project',
						phase_id: phasePlan.id,
						phase_name: phasePlan.name,
						scheduled_date: scheduledDate,
						task_count: taskCount || 0
					};
				}
				break;
			}

			case 'calendar.sync_failed': {
				// Fetch user's calendar info
				const { data: calendar } = await supabase
					.from('project_calendars')
					.select(
						`
						id,
						project_id,
						last_sync_error
					`
					)
					.eq('user_id', userId)
					.not('last_sync_error', 'is', null)
					.order('updated_at', { ascending: false })
					.limit(1)
					.single();

				if (calendar) {
					payload = {
						calendar_id: calendar.id,
						project_id: calendar.project_id,
						error_message: calendar.last_sync_error || 'Sync failed',
						sync_attempted_at: new Date().toISOString()
					};
				}
				break;
			}

			case 'user.signup': {
				// Get user's signup info
				const { data: userData } = await supabase
					.from('users')
					.select('email, created_at')
					.eq('id', userId)
					.single();

				if (userData) {
					payload = {
						user_email: userData.email,
						signup_method: 'email',
						created_at: userData.created_at
					};
				}
				break;
			}

			case 'user.trial_expired': {
				// Get user info for trial expiration
				const { data: userData } = await supabase
					.from('users')
					.select('email, trial_end_date')
					.eq('id', userId)
					.single();

				if (userData) {
					payload = {
						user_email: userData.email,
						trial_end_date: userData.trial_end_date || new Date().toISOString()
					};
				}
				break;
			}

			case 'payment.failed':
			case 'error.critical':
			default:
				// These event types don't have user-specific data
				return ApiResponse.error(`Cannot load real data for event type: ${eventType}`);
		}

		// If no data was found, return an error
		if (Object.keys(payload).length === 0) {
			return ApiResponse.error(
				`No real data found for user. User may not have any ${eventType.split('.')[0]} records.`,
				{ canUseSample: true }
			);
		}

		return ApiResponse.success(payload);
	} catch (error) {
		console.error('Error fetching real notification data:', error);
		return ApiResponse.error(
			error instanceof Error ? error.message : 'Failed to fetch real data'
		);
	}
};
