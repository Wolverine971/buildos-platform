// src/routes/history/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { safeGetSession, supabase } = locals;
	const { user } = await safeGetSession();

	if (!user) {
		redirect(302, '/');
	}

	try {
		const currentYear = new Date().getFullYear();
		const selectedYear = parseInt(url.searchParams.get('year') || currentYear.toString());
		const searchQuery = url.searchParams.get('search') || '';
		const selectedDay = url.searchParams.get('day') || '';
		const braindumpId = url.searchParams.get('braindump') || '';

		// Get contribution data directly instead of API call
		let contributionData = { contributions: [], stats: {} };
		try {
			contributionData = await getContributionData(
				supabase,
				user.id,
				selectedYear,
				searchQuery
			);
		} catch (err) {
			console.warn('Could not fetch contribution data:', err);
		}

		// Helper function to enrich braindumps with computed properties
		function enrichBraindumps(braindumps: any[], braindumpLinks: any[], projects: any[]) {
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
					const braindumpCreated = new Date(braindump.updated_at);
					const projectCreated = new Date(linkedProject.updated_at);

					// Check if there's a brain_dump_link with this project_id
					const hasProjectLink = links.some(
						(link) => link.project_id === braindump.project_id
					);

					if (hasProjectLink) {
						const timeDiff = Math.abs(
							projectCreated.getTime() - braindumpCreated.getTime()
						);
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

		// Helper function to build braindump query with filters
		function buildBraindumpQuery() {
			let query = supabase
				.from('brain_dumps')
				.select('*')
				.eq('user_id', user.id)
				.order('updated_at', { ascending: false });

			// Apply year filter
			const year = selectedYear;
			const startOfYear = `${year}-01-01T00:00:00.000Z`;
			const endOfYear = `${year}-12-31T23:59:59.999Z`;
			query = query.gte('updated_at', startOfYear).lte('updated_at', endOfYear);

			// Apply day filter if specified
			if (selectedDay) {
				const startOfDay = `${selectedDay}T00:00:00.000Z`;
				const endOfDay = `${selectedDay}T23:59:59.999Z`;
				query = query.gte('updated_at', startOfDay).lte('updated_at', endOfDay);
			}

			// Apply search filter
			if (searchQuery) {
				query = query.or(
					`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%,ai_summary.ilike.%${searchQuery}%`
				);
			}

			return query;
		}

		// Get braindumps based on filters
		let braindumps = [];
		let braindumpIds = [];

		if (selectedDay) {
			// Get braindumps for selected day
			const { data: dayData, error: dayError } = await buildBraindumpQuery().limit(50);

			if (dayError) {
				console.error('Error fetching day braindumps:', dayError);
			} else {
				braindumps = dayData || [];
			}
		} else {
			// Get recent braindumps (last 7 days or search results)
			let recentQuery = buildBraindumpQuery();

			if (!searchQuery) {
				// Only limit to last 7 days if not searching
				const sevenDaysAgo = new Date();
				sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
				recentQuery = recentQuery.gte('updated_at', sevenDaysAgo.toISOString());
			}

			const { data: recentData, error: recentError } = await recentQuery.limit(20);

			if (recentError) {
				console.error('Error fetching recent braindumps:', recentError);
			} else {
				braindumps = recentData || [];
			}
		}

		braindumpIds = braindumps.map((b) => b.id);

		// Handle specific braindump URL parameter
		let urlBraindump = null;
		let urlBraindumpInResults = false;

		if (braindumpId) {
			// Check if the requested braindump is already in our results
			urlBraindumpInResults = braindumps.some((b) => b.id === braindumpId);

			if (!urlBraindumpInResults) {
				// Fetch the specific braindump
				const { data: specificBraindump, error: specificError } = await supabase
					.from('brain_dumps')
					.select('*')
					.eq('id', braindumpId)
					.eq('user_id', user.id)
					.single();

				if (!specificError && specificBraindump) {
					urlBraindump = specificBraindump;
					// Add to our list for link processing
					braindumps.push(specificBraindump);
					braindumpIds.push(specificBraindump.id);
				}
			}
		}

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

		// Get all unique project IDs we need to fetch
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
				.select('id, name, slug, description, status, updated_at')
				.in('id', projectIds)
				.eq('user_id', user.id);

			if (projectsError) {
				console.error('Error fetching projects:', projectsError);
			} else {
				projects = projectsData || [];
			}
		}

		// Enrich braindumps with computed properties
		const enrichedBraindumps = enrichBraindumps(braindumps, braindumpLinks, projects);

		// Remove the URL braindump from the main list if it was added separately
		let finalBraindumps = enrichedBraindumps;
		if (urlBraindump && !urlBraindumpInResults) {
			finalBraindumps = enrichedBraindumps.filter((b) => b.id !== braindumpId);
		}

		// Separate day and recent braindumps for the component
		const dayBraindumps = selectedDay ? finalBraindumps : [];
		const recentBraindumps = !selectedDay ? finalBraindumps : [];

		// Get the enriched URL braindump if it exists
		let enrichedUrlBraindump = null;
		if (braindumpId) {
			enrichedUrlBraindump = enrichedBraindumps.find((b) => b.id === braindumpId);
		}

		// Get available years for navigation
		const availableYears = [];
		const firstYear = contributionData.stats?.firstBraindumpDate
			? new Date(contributionData.stats.firstBraindumpDate).getFullYear()
			: currentYear;

		for (let year = firstYear; year <= currentYear; year++) {
			availableYears.push(year);
		}

		return {
			contributionData,
			dayBraindumps,
			recentBraindumps,
			availableYears,
			filters: {
				selectedYear,
				searchQuery,
				selectedDay,
				currentYear,
				braindumpId
			},
			stats: contributionData.stats || {},
			urlBraindump: enrichedUrlBraindump,
			urlBraindumpInResults,
			user
		};
	} catch (err) {
		console.error('Error loading braindumps page:', err);
		return {
			contributionData: { contributions: [], stats: {} },
			dayBraindumps: [],
			recentBraindumps: [],
			availableYears: [new Date().getFullYear()],
			filters: {
				selectedYear: new Date().getFullYear(),
				searchQuery: '',
				selectedDay: '',
				currentYear: new Date().getFullYear(),
				braindumpId: ''
			},
			stats: {},
			urlBraindump: null,
			urlBraindumpInResults: false,
			user: null
		};
	}
};

// Move the contribution data logic to a helper function
async function getContributionData(
	supabase: any,
	userId: string,
	year: number,
	searchQuery?: string
) {
	const startOfYear = `${year}-01-01T00:00:00.000Z`;
	const endOfYear = `${year}-12-31T23:59:59.999Z`;

	// First, get the first braindump date for this user
	const { data: firstBraindump } = await supabase
		.from('brain_dumps')
		.select('updated_at')
		.eq('user_id', userId)
		.order('updated_at', { ascending: true })
		.limit(1);

	const firstBraindumpDate = firstBraindump?.[0]?.updated_at
		? new Date(firstBraindump[0].updated_at)
		: new Date();

	// Build the contribution query
	let query = supabase
		.from('brain_dumps')
		.select('updated_at')
		.eq('user_id', userId)
		.gte('updated_at', startOfYear)
		.lte('updated_at', endOfYear);

	// Apply search filter if provided
	if (searchQuery) {
		query = query.or(
			`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%,ai_summary.ilike.%${searchQuery}%,ai_insights.ilike.%${searchQuery}%`
		);
	}

	const { data: braindumps, error } = await query;

	if (error) {
		throw error;
	}

	// Create contribution map and process data (same logic as your API)
	const contributionMap: Record<string, number> = {};

	const startDate = new Date(startOfYear);
	const endDate = new Date(endOfYear);

	for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
		const dateStr = d.toISOString().split('T')[0];
		contributionMap[dateStr] = 0;
	}

	braindumps?.forEach((braindump) => {
		const date = new Date(braindump.updated_at);
		const dateStr = date.toISOString().split('T')[0];
		contributionMap[dateStr] = (contributionMap[dateStr] || 0) + 1;
	});

	const contributions = Object.entries(contributionMap).map(([date, count]) => ({
		date,
		count,
		level: getContributionLevel(count)
	}));

	const totalBraindumps = braindumps?.length || 0;
	const daysWithActivity = contributions.filter((c) => c.count > 0).length;
	const maxDailyCount = Math.max(...contributions.map((c) => c.count));
	const avgDailyCount = totalBraindumps / 365;

	return {
		contributions,
		stats: {
			year,
			totalBraindumps,
			daysWithActivity,
			maxDailyCount,
			avgDailyCount: Math.round(avgDailyCount * 100) / 100,
			firstBraindumpDate: firstBraindumpDate.toISOString(),
			searchQuery
		}
	};
}

function getContributionLevel(count: number): number {
	if (count === 0) return 0;
	if (count === 1) return 1;
	if (count <= 3) return 2;
	if (count <= 6) return 3;
	return 4;
}
