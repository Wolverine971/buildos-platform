// src/lib/services/prompts/core/project-data-fetcher.ts
/**
 * Centralized project data fetching for prompt generation
 * Provides consistent project data retrieval across all prompt services
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { ProjectWithRelations, ProjectQuestion } from '$lib/types/project';
import { formatProjectData, type FullProjectData } from './data-formatter';

const MAX_TASKS_TO_DISPLAY = 15;

export interface ProjectDataOptions {
	includeQuestions?: boolean;
	includeTasks?: boolean;
	includePhases?: boolean;
	includeNotes?: boolean;
	taskLimit?: number;
}

export interface FullProjectDataWithQuestions extends FullProjectData {
	questions?: ProjectQuestion[];
}

export class ProjectDataFetcher {
	private supabase: SupabaseClient<Database>;

	constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
	}

	/**
	 * Get project data with related entities
	 * This is the main method for fetching comprehensive project data
	 */
	async getFullProjectData({
		userId,
		projectId,
		options = {}
	}: {
		userId: string;
		projectId: string;
		options?: ProjectDataOptions;
	}): Promise<FullProjectDataWithQuestions> {
		const {
			includeQuestions = false,
			includeTasks = true,
			includePhases = true,
			includeNotes = false,
			taskLimit = MAX_TASKS_TO_DISPLAY
		} = options;

		try {
			// Build parallel queries array
			const queries = [];

			// Always get the project
			queries.push(
				this.supabase
					.from('projects')
					.select('*')
					.eq('user_id', userId)
					.eq('id', projectId)
					.single()
			);

			// Conditionally add tasks query
			if (includeTasks) {
				queries.push(
					this.supabase
						.from('tasks')
						.select('*')
						.eq('user_id', userId)
						.eq('project_id', projectId)
						.in('status', ['backlog', 'in_progress', 'blocked'])
						.order('updated_at', { ascending: false })
						.limit(taskLimit + 5)
				);
			}

			// Conditionally add phases query
			if (includePhases) {
				queries.push(
					this.supabase
						.from('phases')
						.select('*, tasks:tasks(*)')
						.eq('project_id', projectId)
						.order('phase_number', { ascending: true })
				);
			}

			// Conditionally add notes query
			if (includeNotes) {
				queries.push(
					this.supabase
						.from('notes')
						.select('*')
						.eq('user_id', userId)
						.eq('project_id', projectId)
						.order('created_at', { ascending: false })
						.limit(10)
				);
			}

			// Add questions query if requested
			if (includeQuestions) {
				queries.push(
					this.supabase
						.from('project_questions')
						.select('*')
						.eq('project_id', projectId)
						.eq('user_id', userId)
						.eq('status', 'active')
						.order('priority', { ascending: false })
						.limit(10)
				);
			}

			// Execute all queries in parallel
			const results = await Promise.all(queries);

			// Extract results based on what was requested
			let queryIndex = 0;
			const projectResult = results[queryIndex++];
			const tasksResult = includeTasks ? results[queryIndex++] : null;
			const phasesResult = includePhases ? results[queryIndex++] : null;
			const notesResult = includeNotes ? results[queryIndex++] : null;
			const questionsResult = includeQuestions ? results[queryIndex++] : null;

			// Check for errors
			if (projectResult?.error && projectResult.error.code !== 'PGRST116') {
				throw projectResult.error;
			}

			if (!projectResult?.data) {
				return {
					user_id: userId,
					fullProjectWithRelations: null,
					timestamp: new Date().toISOString(),
					...(includeQuestions && { questions: [] })
				};
			}

			const fullProjectWithRelations: ProjectWithRelations = {
				...projectResult.data,
				tasks: tasksResult?.data || [],
				notes: notesResult?.data || [],
				phases: phasesResult?.data || []
			};

			const result: FullProjectDataWithQuestions = {
				user_id: userId,
				fullProjectWithRelations,
				timestamp: new Date().toISOString()
			};

			// Add questions if they were requested
			if (includeQuestions && questionsResult) {
				result.questions = questionsResult.data || [];
			}

			return result;
		} catch (error) {
			console.error('Error getting project data:', error);

			return {
				user_id: userId,
				fullProjectWithRelations: null,
				timestamp: new Date().toISOString(),
				...(includeQuestions && { questions: [] })
			};
		}
	}

	/**
	 * Get formatted project data ready for prompt inclusion
	 * Combines data fetching with formatting
	 */
	async getFormattedProjectData({
		userId,
		projectId,
		options = {}
	}: {
		userId: string;
		projectId: string;
		options?: ProjectDataOptions;
	}): Promise<string> {
		const projectData = await this.getFullProjectData({
			userId,
			projectId,
			options
		});

		if (!projectData.fullProjectWithRelations) {
			return 'No project data available';
		}

		return formatProjectData(projectData);
	}

	/**
	 * Get project data for an existing project (with all defaults)
	 * Convenience method for common use case
	 */
	async getExistingProjectData(
		userId: string,
		projectId: string
	): Promise<FullProjectDataWithQuestions> {
		return this.getFullProjectData({
			userId,
			projectId,
			options: {
				includeTasks: true,
				includePhases: true,
				includeNotes: false,
				includeQuestions: false
			}
		});
	}

	/**
	 * Get minimal project data (just project, no relations)
	 * Useful for context updates that don't need tasks/notes
	 */
	async getMinimalProjectData(
		userId: string,
		projectId: string
	): Promise<FullProjectDataWithQuestions> {
		return this.getFullProjectData({
			userId,
			projectId,
			options: {
				includeTasks: false,
				includePhases: false,
				includeNotes: false,
				includeQuestions: false
			}
		});
	}
}

// Export singleton factory for convenience
let instance: ProjectDataFetcher | null = null;

export function getProjectDataFetcher(supabase: SupabaseClient<Database>): ProjectDataFetcher {
	if (!instance) {
		instance = new ProjectDataFetcher(supabase);
	}
	return instance;
}
