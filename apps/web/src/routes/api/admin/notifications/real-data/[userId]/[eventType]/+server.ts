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
					.from('daily_briefs')
					.select('id, brief_date, task_count, project_count')
					.eq('user_id', userId)
					.order('brief_date', { ascending: false })
					.limit(1)
					.single();

				if (brief) {
					// Get user's timezone
					const { data: userData } = await supabase
						.from('users')
						.select('timezone')
						.eq('id', userId)
						.single();

					payload = {
						brief_id: brief.id,
						brief_date: brief.brief_date,
						timezone: userData?.timezone || 'America/Los_Angeles',
						task_count: brief.task_count || 0,
						project_count: brief.project_count || 0
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
					.from('brain_dumps')
					.select(
						`
						id,
						project_id,
						processing_time_ms,
						projects!inner(name)
					`
					)
					.eq('user_id', userId)
					.not('project_id', 'is', null)
					.order('created_at', { ascending: false })
					.limit(1)
					.single();

				if (brainDump) {
					// Count tasks created from this brain dump
					const { count: taskCount } = await supabase
						.from('tasks')
						.select('id', { count: 'exact', head: true })
						.eq('brain_dump_id', brainDump.id);

					payload = {
						brain_dump_id: brainDump.id,
						project_id: brainDump.project_id,
						project_name: (brainDump.projects as any)?.name || 'Unnamed Project',
						tasks_created: taskCount || 0,
						processing_time_ms: brainDump.processing_time_ms || 1500
					};
				}
				break;
			}

			case 'task.due_soon': {
				// Fetch user's next upcoming task
				const now = new Date().toISOString();
				const { data: task } = await supabase
					.from('tasks')
					.select(
						`
						id,
						title,
						due_date,
						projects!inner(id, name)
					`
					)
					.eq('user_id', userId)
					.not('due_date', 'is', null)
					.gte('due_date', now)
					.order('due_date', { ascending: true })
					.limit(1)
					.single();

				if (task && task.due_date) {
					const dueDate = new Date(task.due_date);
					const hoursUntilDue = Math.floor(
						(dueDate.getTime() - Date.now()) / (1000 * 60 * 60)
					);

					payload = {
						task_id: task.id,
						task_title: task.title,
						project_id: (task.projects as any)?.id || '',
						project_name: (task.projects as any)?.name || 'Unnamed Project',
						due_date: task.due_date,
						hours_until_due: Math.max(0, hoursUntilDue)
					};
				}
				break;
			}

			case 'project.phase_scheduled': {
				// Fetch user's most recent project with phases
				const { data: phase } = await supabase
					.from('project_phases')
					.select(
						`
						id,
						name,
						target_date,
						projects!inner(id, name)
					`
					)
					.eq('projects.user_id', userId)
					.not('target_date', 'is', null)
					.order('target_date', { ascending: false })
					.limit(1)
					.single();

				if (phase) {
					// Count tasks in this phase
					const { count: taskCount } = await supabase
						.from('tasks')
						.select('id', { count: 'exact', head: true })
						.eq('phase_id', phase.id);

					payload = {
						project_id: (phase.projects as any)?.id || '',
						project_name: (phase.projects as any)?.name || 'Unnamed Project',
						phase_id: phase.id,
						phase_name: phase.name,
						scheduled_date: phase.target_date || new Date().toISOString(),
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
