// apps/web/src/lib/services/prompts/core/project-data-fetcher.ts
/**
 * Centralized project data fetching for prompt generation
 * Provides consistent project data retrieval across all prompt services
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
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

export interface ProjectSummary {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	executive_summary: string | null;
	tags: string[];
	status: string;
	updated_at: string;
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
			const { data: actorId, error: actorError } = await this.supabase.rpc(
				'ensure_actor_for_user',
				{
					p_user_id: userId
				}
			);
			if (actorError || !actorId) {
				throw actorError || new Error('Failed to resolve ontology actor');
			}

			// Build parallel queries array
			const queries = [];

			// Always get the project
			queries.push(
				this.supabase
					.from('onto_projects')
					.select('*')
					.eq('created_by', actorId)
					.eq('id', projectId)
					.is('deleted_at', null)
					.single()
			);

			// Conditionally add tasks query
			if (includeTasks) {
				queries.push(
					this.supabase
						.from('onto_tasks')
						.select('*')
						.eq('project_id', projectId)
						.is('deleted_at', null)
						.in('state_key', ['todo', 'in_progress', 'blocked'])
						.order('updated_at', { ascending: false })
						.limit(taskLimit + 5)
				);
			}

			// Conditionally add phases query
			if (includePhases) {
				queries.push(
					this.supabase
						.from('onto_plans')
						.select('*')
						.eq('project_id', projectId)
						.is('deleted_at', null)
						.order('updated_at', { ascending: false })
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

			const tasksData = ((tasksResult?.data ?? []) as Array<Record<string, any>>).map(
				(task) => ({
					id: task.id,
					user_id: userId,
					project_id: task.project_id,
					title: task.title,
					description: task.description ?? null,
					details:
						task.props && typeof task.props === 'object' && !Array.isArray(task.props)
							? (((task.props as Record<string, unknown>).details as string | null) ??
								null)
							: null,
					status:
						task.state_key === 'in_progress'
							? 'in_progress'
							: task.state_key === 'done'
								? 'done'
								: task.state_key === 'blocked'
									? 'blocked'
									: 'backlog',
					priority:
						task.priority == null
							? 'medium'
							: task.priority >= 4
								? 'high'
								: task.priority <= 2
									? 'low'
									: 'medium',
					start_date: task.start_at,
					due_date: task.due_at,
					completed_at: task.completed_at,
					created_at: task.created_at,
					updated_at: task.updated_at
				})
			) as ProjectWithRelations['tasks'];
			const notesData = (notesResult?.data ?? []) as ProjectWithRelations['notes'];
			const phasesData = ((phasesResult?.data ?? []) as Array<Record<string, any>>).map(
				(plan, index) => ({
					id: plan.id,
					project_id: plan.project_id,
					name: plan.name,
					description: plan.description ?? null,
					start_date: null,
					end_date: null,
					order: index + 1,
					phase_number: index + 1,
					tasks: [],
					task_count: 0,
					completed_tasks: 0,
					created_at: plan.created_at,
					updated_at: plan.updated_at
				})
			) as ProjectWithRelations['phases'];

			const projectRow = projectResult.data as Record<string, any>;
			const projectBase = {
				...projectRow,
				user_id: userId,
				slug: null,
				status:
					projectRow.state_key === 'planning'
						? 'paused'
						: projectRow.state_key === 'completed'
							? 'completed'
							: projectRow.state_key === 'cancelled'
								? 'archived'
								: 'active',
				start_date: projectRow.start_at ?? null,
				end_date: projectRow.end_at ?? null,
				executive_summary: null,
				tags: Array.isArray(projectRow.tags) ? projectRow.tags : []
			} as ProjectWithRelations;

			const fullProjectWithRelations: ProjectWithRelations = {
				...projectBase,
				tasks: tasksData,
				notes: notesData,
				phases: phasesData
			};

			const result: FullProjectDataWithQuestions = {
				user_id: userId,
				fullProjectWithRelations,
				timestamp: new Date().toISOString()
			};

			// Add questions if they were requested
			if (includeQuestions && questionsResult) {
				result.questions = (questionsResult.data ?? []) as ProjectQuestion[];
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

	/**
	 * Get summaries of all user's active projects
	 * Used for similarity detection when creating new projects
	 * Returns lightweight project data (no tasks, notes, or phases)
	 */
	async getAllUserProjectsSummary(
		userId: string,
		options?: {
			limit?: number;
			includeStatus?: string[];
		}
	): Promise<ProjectSummary[]> {
		const { limit = 50, includeStatus = ['active'] } = options || {};

		try {
			const { data: actorId, error: actorError } = await this.supabase.rpc(
				'ensure_actor_for_user',
				{
					p_user_id: userId
				}
			);
			if (actorError || !actorId) {
				console.error('Error resolving actor for project summary:', actorError);
				return [];
			}

			const includeStates = includeStatus.map((status) => {
				switch (status) {
					case 'paused':
						return 'planning';
					case 'archived':
						return 'cancelled';
					case 'completed':
						return 'completed';
					case 'active':
					default:
						return 'active';
				}
			});

			const { data, error } = await this.supabase
				.from('onto_projects')
				.select('id, name, description, state_key, updated_at')
				.eq('created_by', actorId)
				.in('state_key', includeStates)
				.is('deleted_at', null)
				.order('updated_at', { ascending: false })
				.limit(limit);

			if (error) {
				console.error('Error fetching user projects summary:', error);
				return [];
			}

			return (data || []).map((project) => ({
				id: project.id,
				name: project.name,
				slug: null,
				description: project.description,
				executive_summary: null,
				tags: [],
				status:
					project.state_key === 'planning'
						? 'paused'
						: project.state_key === 'completed'
							? 'completed'
							: project.state_key === 'cancelled'
								? 'archived'
								: 'active',
				updated_at: project.updated_at
			}));
		} catch (error) {
			console.error('Error in getAllUserProjectsSummary:', error);
			return [];
		}
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
