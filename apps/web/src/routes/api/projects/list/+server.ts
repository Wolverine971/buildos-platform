// src/routes/api/projects/list/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, handleConditionalRequest } from '$lib/utils/api-response';

// Feature flag to toggle between old and new implementation
const USE_RPC_FUNCTION = true;

export const GET: RequestHandler = async ({ locals, url, request }) => {
	const { safeGetSession, supabase } = locals;

	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.error('Unauthorized', 401);
		}

		// Get query parameters for pagination and filtering
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const status = url.searchParams.get('status') || 'all';
		const search = url.searchParams.get('search') || '';
		const offset = (page - 1) * limit;

		// Use new RPC function for optimized performance
		if (USE_RPC_FUNCTION) {
			const { data: rpcResult, error: rpcError } = await supabase.rpc(
				'get_projects_with_stats',
				{
					p_user_id: user.id,
					p_status: status,
					p_search: search,
					p_limit: limit,
					p_offset: offset
				}
			);

			if (rpcError) {
				console.error('Error calling projects list RPC:', rpcError);
				// Fall back to original implementation
				return handleOriginalProjectsList({
					supabase,
					user,
					page,
					limit,
					status,
					search,
					offset,
					request
				});
			}

			// Process RPC result
			const projects = rpcResult?.projects || [];
			const pagination = rpcResult?.pagination || {};

			// Projects already come sorted from RPC, but ensure client compatibility
			const responseData = {
				projects,
				pagination: {
					page,
					limit,
					total: pagination.total || 0,
					totalPages: pagination.totalPages || Math.ceil((pagination.total || 0) / limit)
				},
				// Include additional metadata from RPC
				enhanced: {
					lastFetched: rpcResult?.metadata?.fetched_at,
					filters: rpcResult?.metadata?.filters
				}
			};

			// Check for conditional request (304 Not Modified)
			const conditionalResponse = handleConditionalRequest(request, responseData);
			if (conditionalResponse) {
				return conditionalResponse;
			}

			// Return without cache headers to ensure fresh data
			return ApiResponse.success(responseData);
		}

		// Fall back to original implementation
		return handleOriginalProjectsList({
			supabase,
			user,
			page,
			limit,
			status,
			search,
			offset,
			request
		});
	} catch (error) {
		console.error('Error in projects list API:', error);
		return ApiResponse.error('An unexpected error occurred');
	}
};

// Original implementation for fallback
async function handleOriginalProjectsList({
	supabase,
	user,
	page,
	limit,
	status,
	search,
	offset,
	request
}: any) {
	// Build the query
	let query = supabase
		.from('projects')
		.select(
			`
			*,
			tasks(
				id,
				status,
				priority,
				title
			)
		`,
			{ count: 'exact' }
		)
		.eq('user_id', user.id)
		.order('created_at', { ascending: false })
		.range(offset, offset + limit - 1);

	// Apply status filter
	if (status !== 'all') {
		query = query.eq('status', status);
	}

	// Apply search filter
	if (search) {
		query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
	}

	const { data: projects, error: projectsError, count } = await query;

	if (projectsError) {
		console.error('Error loading projects:', projectsError);
		return ApiResponse.error('Failed to load projects');
	}

	// Transform projects with computed task stats
	const transformedProjects = (projects || []).map((project) => {
		const tasks = project.tasks || [];
		const activeTasks = tasks.filter(
			(t: any) => t.status === 'active' || t.status === 'in_progress'
		);
		const completedTasks = tasks.filter((t: any) => t.status === 'done');
		const blockedTasks = tasks.filter((t: any) => t.status === 'blocked');

		return {
			...project,
			tasks: undefined, // Remove raw tasks from response
			taskStats: {
				total: tasks.length,
				active: activeTasks.length,
				completed: completedTasks.length,
				blocked: blockedTasks.length,
				completionRate:
					tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0
			}
		};
	});

	// Sort projects by status priority (active first, then paused, then completed)
	const sortedProjects = transformedProjects.sort((a, b) => {
		const statusOrder = { active: 0, paused: 1, completed: 2 };
		const aOrder = statusOrder[a.status as keyof typeof statusOrder] ?? 3;
		const bOrder = statusOrder[b.status as keyof typeof statusOrder] ?? 3;

		if (aOrder !== bOrder) return aOrder - bOrder;
		return (a.name || '').localeCompare(b.name || '');
	});

	const responseData = {
		projects: sortedProjects,
		pagination: {
			page,
			limit,
			total: count || 0,
			totalPages: Math.ceil((count || 0) / limit)
		}
	};

	// Check for conditional request
	const conditionalResponse = handleConditionalRequest(request, responseData);
	if (conditionalResponse) {
		return conditionalResponse;
	}

	// Return without cache headers to ensure fresh data
	return ApiResponse.success(responseData);
}
