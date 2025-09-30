// apps/web/src/routes/api/dashboard/bottom-sections/+server.ts
import type { RequestHandler } from './$types';
import { addDays, format, startOfWeek, endOfWeek } from 'date-fns';
import { getTaskDateRanges } from '$lib/utils/date-utils';
import { ApiResponse } from '$lib/utils/api-response';

// Helper function to enrich braindumps with computed properties
async function enrichBraindumps(supabase: any, userId: string, braindumps: any[]) {
	if (!braindumps || braindumps.length === 0) {
		return braindumps;
	}

	const braindumpIds = braindumps.map((b) => b.id);

	// Get brain_dump_links for all braindumps in a single query
	let braindumpLinks = [];
	if (braindumpIds.length > 0) {
		const { data: linksData, error: linksError } = await supabase
			.from('brain_dump_links')
			.select('*')
			.in('brain_dump_id', braindumpIds);

		if (linksError) {
			console.error('Error fetching brain dump links:', linksError);
		} else {
			braindumpLinks = linksData || [];
		}
	}

	// Get all unique project IDs we need to fetch (both from braindumps and links)
	const projectIds = [
		...new Set([
			...braindumps.map((b) => b.project_id).filter(Boolean),
			...braindumpLinks.map((l) => l.project_id).filter(Boolean)
		])
	];

	// Get projects in a single query
	let projects = [];
	if (projectIds.length > 0) {
		const { data: projectsData, error: projectsError } = await supabase
			.from('projects')
			.select(
				`
				id, 
				name, 
				slug, 
				description, 
				status, 
				created_at,
				calendar_color_id,
				project_calendars (
					id,
					color_id,
					hex_color
				)
			`
			)
			.in('id', projectIds)
			.eq('user_id', userId);

		if (projectsError) {
			console.error('Error fetching projects:', projectsError);
		} else {
			projects = projectsData || [];
		}
	}

	// Enrich braindumps with computed properties
	return braindumps.map((braindump) => {
		// Get links for this braindump
		const links = braindumpLinks.filter((link) => link.brain_dump_id === braindump.id);

		// Determine if this is unlinked (no project_id in brain_dumps table)
		const isUnlinked = !braindump.project_id;

		// Get linked project if exists
		const linkedProject = braindump.project_id
			? projects.find((p) => p.id === braindump.project_id)
			: null;

		// Determine if this is a new project
		let isNewProject = false;
		if (linkedProject && links.length > 0) {
			const braindumpCreated = new Date(braindump.created_at);
			const projectCreated = new Date(linkedProject.created_at);

			// Check if there's a brain_dump_link with this project_id
			const hasProjectLink = links.some((link) => link.project_id === braindump.project_id);

			if (hasProjectLink) {
				const timeDiff = Math.abs(projectCreated.getTime() - braindumpCreated.getTime());
				// If created within 5 minutes of each other, consider it a new project
				isNewProject = timeDiff <= 5 * 60 * 1000;
			}
		}

		// Determine linked types from brain_dump_links
		const linkedTypes = [];
		links.forEach((link) => {
			if (link.project_id) linkedTypes.push('project');
			if (link.task_id) linkedTypes.push('task');
			if (link.note_id) linkedTypes.push('note');
		});

		return {
			...braindump,
			brain_dump_links: links,
			isNote: isUnlinked,
			isNewProject,
			linkedProject,
			linkedTypes: [...new Set(linkedTypes)] // Remove duplicates
		};
	});
}

export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	try {
		const { user } = await safeGetSession();

		if (!user) {
			return ApiResponse.unauthorized();
		}

		// Use consistent date utilities for core date ranges
		const { today: todayStr, weekEnd: weekEndStr } = getTaskDateRanges();

		// Additional dates for bottom sections (preserve existing logic)
		const today = new Date();
		const monthEnd = addDays(today, 30); // Extended to 30 days for better phase coverage
		const sevenDaysAgo = addDays(today, -7); // Last 7 days for braindumps
		const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
		const sevenDaysAgoStr = format(sevenDaysAgo, 'yyyy-MM-dd');

		// Create timeout promise for queries
		const createTimeoutPromise = (ms: number) =>
			new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), ms));

		// Load below-the-fold data sections
		const bottomSectionResults = await Promise.allSettled([
			// 1. Recent braindumps (last 7 days) - Basic data first
			Promise.race([
				supabase
					.from('brain_dumps')
					.select(
						`
						id,
						title,
						content,
						ai_summary,
						ai_insights,
						status,
						tags,
						project_id,
						created_at,
						projects (
							id, 
							name, 
							slug,
							calendar_color_id,
							project_calendars (
								id,
								color_id,
								hex_color
							)
						)
					`
					)
					.eq('user_id', user.id)
					.gte('created_at', sevenDaysAgoStr)
					.order('created_at', { ascending: false })
					.limit(50),
				createTimeoutPromise(5000)
			]),

			// 2. Project phases for next 30 days
			Promise.race([
				supabase
					.from('phases')
					.select(
						`
						id,
						name,
						description,
						start_date,
						end_date,
						"order",
						project_id,
						projects (
							id, 
							name, 
							slug, 
							status,
							calendar_color_id,
							project_calendars (
								id,
								color_id,
								hex_color
							)
						)
					`
					)
					.eq('user_id', user.id)
					.not('start_date', 'is', null)
					.not('end_date', 'is', null)
					.lte('start_date', monthEndStr)
					.gte('end_date', todayStr)
					.order('start_date'),
				createTimeoutPromise(4000)
			]),

			// 3. Today's brief - use consistent date
			Promise.race([
				supabase
					.from('daily_briefs')
					.select(
						`
						id,
						brief_date,
						summary_content,
						priority_actions,
						insights,
						created_at,
						updated_at
					`
					)
					.eq('user_id', user.id)
					.eq('brief_date', todayStr) // Use consistent todayStr
					.maybeSingle(), // Use maybeSingle to handle no results gracefully
				createTimeoutPromise(3000)
			]),

			// 4. Weekly progress calculation - Use consistent date ranges
			Promise.race([
				supabase
					.from('tasks')
					.select('id, status, start_date, completed_at, priority, created_at')
					.eq('user_id', user.id)
					.neq('deleted_at', true)
					.gte('created_at', format(startOfWeek(today), 'yyyy-MM-dd'))
					.lte('created_at', format(endOfWeek(today), 'yyyy-MM-dd')),
				createTimeoutPromise(4000)
			])
		]);

		// Helper function to safely extract data
		const safeExtractData = (result: PromiseSettledResult<any>, defaultValue: any = []) => {
			if (result.status === 'fulfilled') {
				// Handle different response formats
				if (result.value?.data !== undefined) {
					return result.value.data;
				}
				// For direct returns
				if (result.value && typeof result.value === 'object') {
					return result.value;
				}
			}
			if (result.status === 'rejected') {
				console.warn('Bottom section query failed:', result.reason);
			}
			return defaultValue;
		};

		// Extract results
		const [braindumpsResult, phasesResult, todaysBriefResult, weeklyProgressResult] =
			bottomSectionResults;

		const rawBraindumps = safeExtractData(braindumpsResult, []);
		const phases = safeExtractData(phasesResult, []);
		const weeklyProgressTasks = safeExtractData(weeklyProgressResult, []);

		// Get today's brief with proper null handling
		const todaysBriefData =
			todaysBriefResult.status === 'fulfilled'
				? safeExtractData(todaysBriefResult, null)
				: null;

		// Enrich braindumps with additional data needed by the modal
		let enrichedBraindumps = rawBraindumps;
		if (rawBraindumps && rawBraindumps.length > 0) {
			try {
				enrichedBraindumps = await enrichBraindumps(supabase, user.id, rawBraindumps);
			} catch (err) {
				console.warn('Failed to enrich braindumps:', err);
				// Fall back to raw braindumps if enrichment fails
				enrichedBraindumps = rawBraindumps;
			}
		}

		// Calculate detailed weekly progress
		const weeklyProgress = {
			completed: Array.isArray(weeklyProgressTasks)
				? weeklyProgressTasks.filter((t: any) => t?.status === 'done').length
				: 0,
			total: Array.isArray(weeklyProgressTasks) ? weeklyProgressTasks.length : 0
		};

		// Group braindumps by date for weekly view with consistent date formatting
		const braindumpsByDate = Array.isArray(enrichedBraindumps)
			? enrichedBraindumps.reduce((acc: any, braindump: any) => {
					try {
						// Use consistent date formatting matching date-utils
						const date = new Date(braindump.created_at);
						const dateKey = date.toISOString().split('T')[0]; // yyyy-mm-dd format

						if (!acc[dateKey]) {
							acc[dateKey] = [];
						}
						acc[dateKey].push(braindump);
					} catch (err) {
						console.warn('Error processing braindump date:', braindump.created_at, err);
					}
					return acc;
				}, {})
			: {};

		return ApiResponse.success({
			braindumps: Array.isArray(enrichedBraindumps) ? enrichedBraindumps : [],
			braindumpsByDate,
			phases: Array.isArray(phases) ? phases : [],
			todaysBrief: todaysBriefData,
			weeklyProgress,
			// Updated stats for the dashboard
			stats: {
				recentBraindumps: Array.isArray(enrichedBraindumps) ? enrichedBraindumps : [],
				weeklyProgress
			}
		});
	} catch (error) {
		console.error('Error loading bottom sections:', error);
		return ApiResponse.internalError(error, 'Failed to load bottom sections');
	}
};
