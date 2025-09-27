// src/routes/api/projects/[id]/phases/generate/+server.ts
// Simplified API handler using the new phase generation orchestrator

import type { RequestHandler } from './$types';
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';
import { PhaseGenerationOrchestrator } from '$lib/services/phase-generation/orchestrator';
import type { PhaseGenerationConfig, SchedulingMethod } from '$lib/services/phase-generation/types';

/**
 * Phase Generation API Handler
 *
 * This handler delegates all phase generation logic to the orchestrator,
 * maintaining clean separation of concerns:
 * - Authentication and validation in the handler
 * - Business logic in the orchestrator and strategies
 */
export const POST: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	try {
		// 1. Authentication
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		// 2. Parse and validate request
		const { id: projectId } = params;
		const body = await parseRequestBody(request);
		if (!body) {
			return ApiResponse.badRequest('Invalid request body');
		}

		// 3. Extract and validate configuration
		const config: PhaseGenerationConfig = {
			selectedStatuses: body.selected_statuses || ['backlog', 'in_progress', 'blocked'],
			schedulingMethod: validateSchedulingMethod(body.scheduling_method),
			projectStartDate: body.project_start_date,
			projectEndDate: body.project_end_date,
			projectDatesChanged: body.project_dates_changed || false,
			includeRecurringTasks: body.include_recurring_tasks || false,
			allowRecurringReschedule: body.allow_recurring_reschedule || false,
			preserveExistingDates: body.preserve_existing_dates || false, // Default to false (reschedule all)
			preserveHistoricalPhases: body.preserve_historical_phases !== false, // Default to true (preserve history)
			userInstructions: body.user_instructions || '', // Add user instructions
			userId: user.id
		};

		// 4. Validate required fields based on scheduling method
		const validationError = validateConfig(config);
		if (validationError) {
			return ApiResponse.badRequest(validationError);
		}

		// 5. Create and execute orchestrator
		const orchestrator = new PhaseGenerationOrchestrator(supabase, user.id, projectId, config);

		const result = await orchestrator.generate();

		// 6. Return success response with all metadata
		return ApiResponse.success({
			...result,
			project_dates_updated: config.projectDatesChanged,
			calendar_optimization_pending: config.schedulingMethod === 'calendar_optimized',
			recurring_tasks_included: config.includeRecurringTasks,
			recurring_task_suggestions: result.recurring_task_suggestions
		});
	} catch (error: any) {
		// Handle specific error types
		if (error.message?.includes('Project not found')) {
			return ApiResponse.notFound('Project');
		}

		if (error.message?.includes('No tasks found')) {
			return ApiResponse.error('No tasks found for phase generation', 400, {
				details: ['No compatible tasks were found based on the selected criteria']
			});
		}

		if (error.message?.includes('validation failed')) {
			return ApiResponse.error('Validation failed', 400, {
				details: [error.message]
			});
		}

		// Generic error handler
		return ApiResponse.internalError(error, 'Error generating phases');
	}
};

/**
 * Validate scheduling method
 */
function validateSchedulingMethod(method: string = 'schedule_in_phases'): SchedulingMethod {
	const validMethods: SchedulingMethod[] = [
		'phases_only',
		'schedule_in_phases',
		'calendar_optimized'
	];

	if (!validMethods.includes(method as SchedulingMethod)) {
		throw new Error(`Invalid scheduling method: ${method}`);
	}

	return method as SchedulingMethod;
}

/**
 * Validate configuration based on scheduling method
 */
function validateConfig(config: PhaseGenerationConfig): string | null {
	// Start date is always required
	if (!config.projectStartDate) {
		return 'Project start date is required';
	}

	// Validate date formats
	if (config.projectStartDate) {
		const startDate = new Date(config.projectStartDate);
		if (isNaN(startDate.getTime())) {
			return 'Invalid project start date format';
		}
	}

	if (config.projectEndDate) {
		const endDate = new Date(config.projectEndDate);
		if (isNaN(endDate.getTime())) {
			return 'Invalid project end date format';
		}

		// Validate date order
		if (config.projectStartDate) {
			const startDate = new Date(config.projectStartDate);
			if (startDate >= endDate) {
				return 'Project start date must be before end date';
			}
		}
	}

	return null;
}
