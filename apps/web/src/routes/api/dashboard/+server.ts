// apps/web/src/routes/api/dashboard/+server.ts
import type { RequestHandler } from './$types';
import {
	getTodayInUserTimezone,
	getDatePlusDays,
	timestamptzToLocalDate,
	isDateBeforeToday,
	isDateToday,
	isDateTomorrow
} from '$lib/utils/date-utils';
import { toZonedTime } from 'date-fns-tz';
import { addDays, format } from 'date-fns';
import { GoogleOAuthService } from '$lib/services/google-oauth-service';
import { ApiResponse } from '$lib/utils/api-response';
import { RecurringInstanceService } from '$lib/services/recurring-instance.service';

// Feature flag to toggle between old and new implementation
const USE_RPC_FUNCTION = true;

export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase }, url }) => {
	try {
		const { user } = await safeGetSession();

		if (!user) {
			return ApiResponse.unauthorized();
		}

		// Get timezone from query params, fallback to UTC if not provided
		const timezone = url.searchParams.get('timezone') || 'UTC';

		// Use new RPC function for optimized performance
		if (USE_RPC_FUNCTION) {
			return handleRpcDashboard({ user, supabase, timezone });
		}

		// Fall back to original implementation if needed
		return handleOriginalDashboard({ user, supabase, timezone });
	} catch (err) {
		console.error('Error loading dashboard data:', err);
		return ApiResponse.internalError(err, 'Failed to load dashboard data');
	}
};

/**
 * Optimized dashboard handler using RPC function
 */
async function handleRpcDashboard({ user, supabase, timezone }: any) {
	try {
		// Get date ranges
		const today = getTodayInUserTimezone(timezone);
		const dateStart = format(addDays(new Date(today), -30), 'yyyy-MM-dd');
		const dateEnd = format(addDays(new Date(today), 14), 'yyyy-MM-dd');

		// Parallel fetch: RPC data and calendar status
		const [rpcResult, calendarStatusPromise] = await Promise.all([
			// Single RPC call to get all dashboard data
			supabase.rpc('get_dashboard_data', {
				p_user_id: user.id,
				p_timezone: timezone,
				p_date_start: dateStart,
				p_date_end: dateEnd,
				p_today: today
			}),

			// Get calendar status in parallel - non-blocking
			(async () => {
				try {
					const googleCalendarService = new GoogleOAuthService(supabase);
					return await googleCalendarService.getCalendarStatus(user.id);
				} catch (error) {
					console.warn('Calendar status check failed:', error);
					return { isConnected: false, needsRefresh: false };
				}
			})()
		]);

		const { data: dashboardData, error } = rpcResult;
		const calendarStatus = calendarStatusPromise;

		if (error) {
			console.error('Error calling dashboard RPC:', error);
			// Fall back to original implementation
			return handleOriginalDashboard({ user, supabase, timezone });
		}

		// Parse the RPC response
		const {
			regular_tasks = [],
			overdue_instances = [],
			week_instances = [],
			active_projects = [],
			dates,
			stats
		} = dashboardData || {};

		// Process and categorize tasks
		const pastDueTasks: any[] = [];
		const todaysTasks: any[] = [];
		const tomorrowsTasks: any[] = [];
		const weeklyTasks: any[] = [];
		const recurringTasks: any[] = [];

		// Process regular tasks
		regular_tasks.forEach((task: any) => {
			// Format task to match expected structure
			const formattedTask = {
				...task,
				projects: task.project // Rename for compatibility
			};

			// Keep track of recurring parent tasks
			if (task.task_type === 'recurring') {
				recurringTasks.push(formattedTask);
				return;
			}

			if (!task.start_date || task.status === 'done') return;

			// Categorize task
			const isPastDue = isDateBeforeToday(task.start_date, timezone);
			const isToday = isDateToday(task.start_date, timezone);
			const isTomorrow = isDateTomorrow(task.start_date, timezone);

			if (isPastDue) {
				pastDueTasks.push(formattedTask);
			} else if (isToday) {
				todaysTasks.push(formattedTask);
			} else if (isTomorrow) {
				tomorrowsTasks.push(formattedTask);
			}

			// Add to weekly if within range
			const taskDate = new Date(task.start_date);
			const weekEndDate = new Date(dates.week_end);
			if (!isPastDue && taskDate <= weekEndDate) {
				weeklyTasks.push(formattedTask);
			}
		});

		// Process recurring instances
		const allInstances = [...overdue_instances, ...week_instances];
		const uniqueInstances = Array.from(
			new Map(allInstances.map((i: any) => [i.id, i])).values()
		) as any[];

		uniqueInstances.forEach((instance: any) => {
			if (!instance.instance_date || !instance.task) return;

			// Create a task object with instance data
			const taskWithInstance = {
				...instance.task,
				// Override dates with instance date
				start_date: instance.instance_date,
				// Add instance-specific fields
				isRecurringInstance: true,
				instanceId: instance.id,
				instanceStatus: instance.status,
				recurrencePattern: instance.task.recurrence_pattern,
				// Format for compatibility
				projects: instance.task.project,
				task_calendar_events: instance.task.calendar_events
			};

			// Categorize instance
			const isPastDue = isDateBeforeToday(instance.instance_date, timezone);
			const isToday = isDateToday(instance.instance_date, timezone);
			const isTomorrow = isDateTomorrow(instance.instance_date, timezone);

			if (isPastDue) {
				pastDueTasks.push(taskWithInstance);
			} else if (isToday) {
				todaysTasks.push(taskWithInstance);
			} else if (isTomorrow) {
				tomorrowsTasks.push(taskWithInstance);
			}

			// Add to weekly if within range
			const instanceDate = new Date(instance.instance_date);
			const weekEndDate = new Date(dates.week_end);
			if (!isPastDue && instanceDate <= weekEndDate) {
				weeklyTasks.push(taskWithInstance);
			}
		});

		// Generate instances for any recurring tasks in background
		const instanceService = RecurringInstanceService.getInstance(supabase);
		if (user.id) {
			instanceService.generateInstancesForUser(user.id, 30).catch((err) => {
				console.error('Error generating instances in background:', err);
			});
		}

		// Group weekly tasks by date for calendar view
		const weeklyTasksByDate = weeklyTasks.reduce((acc: any, task: any) => {
			const dateKey = timestamptzToLocalDate(task.start_date, timezone);
			if (!acc[dateKey]) {
				acc[dateKey] = [];
			}
			acc[dateKey].push(task);
			return acc;
		}, {});

		// Calculate weekly progress
		const completedTasksCount = weeklyTasks.filter(
			(task) => task.status === 'completed' || task.status === 'done'
		).length;

		const formattedStats = {
			activeProjects: active_projects || [],
			pastDueTasks,
			todaysTasks,
			tomorrowsTasks,
			weeklyTasks,
			recentBraindumps: [],
			weeklyProgress: {
				completed: completedTasksCount,
				total: weeklyTasks.length
			}
		};

		return ApiResponse.success({
			pastDueTasks,
			todaysTasks,
			tomorrowsTasks,
			weeklyTasks,
			weeklyTasksByDate,
			activeProjects: active_projects || [],
			calendarStatus,
			stats: formattedStats,
			timezone,
			recurringTasks,
			recurringInstancesCount: uniqueInstances.length
		});
	} catch (err) {
		console.error('Error in RPC dashboard handler:', err);
		// Fall back to original implementation
		return handleOriginalDashboard({
			user: (err as any).user,
			supabase: (err as any).supabase,
			timezone: (err as any).timezone
		});
	}
}

/**
 * Original dashboard implementation for fallback
 */
async function handleOriginalDashboard({ user, supabase, timezone }: any) {
	const taskSelectFields = `
		id,
		title,
		description,
		status,
		priority,
		task_type,
		start_date,
		duration_minutes,
		project_id,
		created_at,
		updated_at,
		projects (
			id, 
			name, 
			slug, 
			status
		)
	`;

	// Get date ranges with user's timezone
	const today = getTodayInUserTimezone(timezone);
	const weekEnd = getDatePlusDays(7, timezone);

	// Initialize recurring instance service
	const instanceService = RecurringInstanceService.getInstance(supabase);

	// Parallel fetch: regular tasks, recurring instances, and calendar status
	const [tasksResult, instancesResult, calendarStatusPromise] = await Promise.all([
		// Get tasks within date range for better performance - 30 days back to 14 days ahead
		supabase
			.from('tasks')
			.select(taskSelectFields)
			.eq('user_id', user.id)
			.neq('status', 'done')
			.is('deleted_at', null)
			.gte('start_date', getDatePlusDays(-30, timezone)) // 30 days back for overdue
			.lte('start_date', getDatePlusDays(14, timezone)) // 14 days ahead for future
			.order('priority', { ascending: false })
			.order('start_date', { ascending: true }),

		// Get recurring instances for the week ahead (including overdue)
		Promise.all([
			// Get overdue instances
			instanceService.getOverdueInstances(user.id, new Date(today), timezone),
			// Get instances for next 7 days
			instanceService.getInstancesForDateRange(
				user.id,
				new Date(today),
				addDays(new Date(weekEnd), 1),
				timezone
			)
		]),

		// Get calendar status in parallel - non-blocking
		(async () => {
			try {
				const googleCalendarService = new GoogleOAuthService(supabase);
				return await googleCalendarService.getCalendarStatus(user.id);
			} catch (error) {
				console.warn('Calendar status check failed:', error);
				return { isConnected: false, needsRefresh: false };
			}
		})()
	]);

	const { data: allTasks, error } = tasksResult;
	const [overdueInstances, weekInstances] = instancesResult;
	const calendarStatus = calendarStatusPromise;

	if (error) {
		console.error('Error fetching tasks:', error);
		return ApiResponse.internalError(error, 'Failed to fetch tasks');
	}

	// Combine all instances (remove duplicates if any)
	const allInstances = [...overdueInstances, ...weekInstances];
	const uniqueInstances = Array.from(new Map(allInstances.map((i) => [i.id, i])).values());

	// Generate instances for any recurring tasks that don't have them yet
	if (user.id) {
		instanceService.generateInstancesForUser(user.id, 30).catch((err) => {
			console.error('Error generating instances in background:', err);
		});
	}

	// Pre-calculate timezone dates for efficiency
	const todayDate = new Date(today + 'T00:00:00');
	const weekEndDate = new Date(weekEnd + 'T23:59:59');
	const todayInTz = toZonedTime(todayDate, timezone);
	const weekEndInTz = toZonedTime(weekEndDate, timezone);

	// Filter tasks by date using the user's timezone
	const pastDueTasks: any[] = [];
	const todaysTasks: any[] = [];
	const tomorrowsTasks: any[] = [];
	const weeklyTasks: any[] = [];
	const recurringTasks: any[] = [];

	// Process regular one-off tasks - single pass optimization
	allTasks?.forEach((task) => {
		// Keep track of recurring parent tasks separately
		if (task.task_type === 'recurring') {
			recurringTasks.push(task);
			return;
		}

		if (!task.start_date || task.status === 'done') return;

		// Single timezone conversion for efficiency
		const taskDate = new Date(task.start_date);
		const taskInTz = toZonedTime(taskDate, timezone);

		// Categorize with single date comparison logic
		const isPastDue = isDateBeforeToday(task.start_date, timezone);
		const isToday = isDateToday(task.start_date, timezone);
		const isTomorrow = isDateTomorrow(task.start_date, timezone);

		// Add to appropriate categories
		if (isPastDue) {
			pastDueTasks.push(task);
		} else if (isToday) {
			todaysTasks.push(task);
		} else if (isTomorrow) {
			tomorrowsTasks.push(task);
		}

		// Add to weekly if within range (optimize: only check if not past due)
		if (!isPastDue && taskInTz >= todayInTz && taskInTz <= weekEndInTz) {
			weeklyTasks.push(task);
		}
	});

	// Process recurring task instances - optimized like regular tasks
	uniqueInstances.forEach((instance) => {
		if (!instance.instance_date || !instance.tasks) return;

		// Create a task object with instance data
		const taskWithInstance = {
			...instance.tasks,
			// Override dates with instance date
			start_date: instance.instance_date,
			// Add instance-specific fields
			isRecurringInstance: true,
			instanceId: instance.id,
			instanceStatus: instance.status,
			recurrencePattern: instance.tasks.recurrence_pattern
		};

		// Reuse same optimized logic as regular tasks
		const instanceDate = new Date(instance.instance_date);
		const instanceInTz = toZonedTime(instanceDate, timezone);

		const isPastDue = isDateBeforeToday(instance.instance_date, timezone);
		const isToday = isDateToday(instance.instance_date, timezone);
		const isTomorrow = isDateTomorrow(instance.instance_date, timezone);

		// Categorize instance
		if (isPastDue) {
			pastDueTasks.push(taskWithInstance);
		} else if (isToday) {
			todaysTasks.push(taskWithInstance);
		} else if (isTomorrow) {
			tomorrowsTasks.push(taskWithInstance);
		}

		// Add to weekly if within range (reuse pre-calculated dates)
		if (!isPastDue && instanceInTz >= todayInTz && instanceInTz <= weekEndInTz) {
			weeklyTasks.push(taskWithInstance);
		}
	});

	// Get active projects - limit fields for performance
	const { data: activeProjects } = await supabase
		.from('projects')
		.select('id, name, slug, status, updated_at')
		.eq('user_id', user.id)
		.eq('status', 'active')
		.order('updated_at', { ascending: false })
		.limit(10);

	// Group weekly tasks by date for calendar view with timezone
	const weeklyTasksByDate = weeklyTasks.reduce((acc: any, task: any) => {
		const dateKey = timestamptzToLocalDate(task.start_date, timezone);
		if (!acc[dateKey]) {
			acc[dateKey] = [];
		}
		acc[dateKey].push(task);
		return acc;
	}, {});

	// Calculate weekly progress
	const completedTasksCount = weeklyTasks.filter(
		(task) => task.status === 'completed' || task.status === 'done'
	).length;

	const stats = {
		activeProjects: activeProjects || [],
		pastDueTasks,
		todaysTasks,
		tomorrowsTasks,
		weeklyTasks,
		recentBraindumps: [],
		weeklyProgress: {
			completed: completedTasksCount,
			total: weeklyTasks.length
		}
	};

	return ApiResponse.success({
		pastDueTasks,
		todaysTasks,
		tomorrowsTasks,
		weeklyTasks,
		weeklyTasksByDate,
		activeProjects: activeProjects || [],
		calendarStatus,
		stats,
		timezone,
		recurringTasks, // Include parent recurring tasks for reference
		recurringInstancesCount: uniqueInstances.length
	});
}
