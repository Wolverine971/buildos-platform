// apps/web/src/lib/services/dailyBrief/repository.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { ProjectWithRelations } from '$lib/types/project';
import type { UserContext } from '$lib/types/user-context';

export interface UserData {
	projects: ProjectWithRelations[];
	userContext: UserContext | null;
}

export class DailyBriefRepository {
	constructor(public readonly supabase: SupabaseClient<Database>) {}

	async getUserData(userId: string): Promise<UserData> {
		// Use a single optimized query with relationships
		const [projectsResponse, userContextResponse] = await Promise.all([
			this.supabase
				.from('projects')
				.select(
					`
			*,
			tasks!project_id (
				*
			),
			notes!project_id (
				*
			),
			phases!project_id (
				*,
				phase_tasks (
					task_id,
					phase_id
				)
			)
		`
				)
				.eq('user_id', userId)
				.eq('status', 'active')
				.order('updated_at', { ascending: false, foreignTable: 'tasks' })
				.order('updated_at', { ascending: false, foreignTable: 'notes' })
				.order('order', { ascending: true, foreignTable: 'phases' }),

			this.supabase.from('user_context').select('*').eq('user_id', userId).single()
		]);

		if (projectsResponse.error) {
			console.error('Error fetching projects with relations:', projectsResponse.error);
			throw projectsResponse.error;
		}

		const projects = projectsResponse.data || [];

		// If we have projects with phases, we need to get the tasks for each phase
		const projectsWithRelations: ProjectWithRelations[] = [];

		for (const project of projects) {
			// Create a map of task IDs to tasks for quick lookup
			const taskMap = new Map((project.tasks || []).map((task) => [task.id, task]));

			// Process phases to include their tasks
			const phasesWithTasks = (project.phases || []).map((phase) => {
				const phaseTasks = (phase.phase_tasks || [])
					.map((pt) => taskMap.get(pt.task_id))
					.filter(Boolean);

				return {
					...phase,
					tasks: phaseTasks,
					task_count: phaseTasks.length,
					completed_tasks: phaseTasks.filter((t) => t.status === 'done').length
				};
			});

			projectsWithRelations.push({
				...project,
				tasks: project.tasks || [],
				notes: project.notes || [],
				phases: phasesWithTasks
			});
		}

		const userContext = userContextResponse.data as UserContext | null;

		return {
			projects: projectsWithRelations,
			userContext: userContext
		};
	}

	async checkConcurrentGenerations(userId: string): Promise<{
		canStart: boolean;
		message: string;
		staleBriefs?: Array<{ id: string; brief_date: string }>;
	}> {
		// First, clean up any stale generations atomically
		const { data: cleanedBriefs } = await this.supabase.rpc('cleanup_stale_brief_generations', {
			p_user_id: userId,
			p_timeout_minutes: 10
		});

		// Now check for active generations
		const { data: activeGenerations } = await this.supabase
			.from('daily_briefs')
			.select('id, brief_date, generation_started_at')
			.eq('user_id', userId)
			.eq('generation_status', 'processing');

		if (!activeGenerations || activeGenerations.length === 0) {
			return {
				canStart: true,
				message: 'Can start generation',
				staleBriefs: cleanedBriefs || []
			};
		}

		// All remaining generations are non-stale (cleanup already happened)
		return {
			canStart: false,
			message: `You already have a brief generating for ${activeGenerations[0].brief_date}.`,
			staleBriefs: cleanedBriefs || []
		};
	}

	async startGeneration(userId: string, briefDate: string, forceRegenerate: boolean) {
		// Use atomic RPC function to handle concurrent requests safely
		const { data, error } = await this.supabase
			.rpc('start_or_resume_brief_generation', {
				p_user_id: userId,
				p_brief_date: briefDate,
				p_force_regenerate: forceRegenerate
			})
			.single();

		if (error) {
			// Check for specific error codes
			if (error.code === 'P0001' && error.message?.includes('already in progress')) {
				return {
					started: false,
					message: 'Brief generation already in progress',
					brief_id: null
				};
			}
			if (error.code === 'P0002' && error.message?.includes('already completed')) {
				return {
					started: false,
					message: 'Brief already exists for this date',
					brief_id: null
				};
			}
			throw error;
		}

		return {
			started: data.started,
			brief_id: data.brief_id,
			message: data.message || 'Generation started successfully'
		};
	}

	async markGenerationCompleted(briefId: string, result: any) {
		await this.supabase
			.from('daily_briefs')
			.update({
				generation_status: 'completed',
				generation_completed_at: new Date().toISOString(),
				summary_content: result.main_brief.content,
				project_brief_ids: result.project_briefs.map((b: any) => b.id),
				generation_progress: {
					projects_completed: result.project_briefs.length,
					total_projects: result.project_briefs.length
				}
			})
			.eq('id', briefId);
	}

	async markGenerationFailed(userId: string, briefDate: string, errorMessage: string) {
		await this.supabase
			.from('daily_briefs')
			.update({
				generation_status: 'failed',
				generation_error: errorMessage,
				generation_completed_at: new Date().toISOString()
			})
			.eq('user_id', userId)
			.eq('brief_date', briefDate);
	}

	// Add these methods to your existing DailyBriefRepository class

	// Update the saveProjectBrief method to handle condensed content
	async saveProjectBrief(
		userId: string,
		projectId: string,
		content: string,
		briefDate: string,
		metadata: any
	) {
		// Extract condensed content from metadata if present
		const condensedContent = metadata.condensed_content;
		delete metadata.condensed_content; // Remove from metadata before saving

		const { data, error } = await this.supabase
			.from('project_daily_briefs')
			.upsert(
				{
					user_id: userId,
					project_id: projectId,
					brief_content: content,
					brief_date: briefDate,
					generation_status: 'completed',
					metadata: {
						...metadata,
						has_condensed: !!condensedContent,
						condensed_stored_separately: true
					}
				},
				{
					onConflict: 'project_id,brief_date',
					ignoreDuplicates: false
				}
			)
			.select()
			.single();

		if (error) throw error;

		// Store condensed version separately if provided
		if (condensedContent) {
			await this.saveCondensedBrief(userId, projectId, data.id, condensedContent, briefDate);
		}

		return data;
	}

	// New method to save condensed briefs
	private async saveCondensedBrief(
		userId: string,
		projectId: string,
		fullBriefId: string,
		condensedContent: string,
		briefDate: string
	) {
		// You could store this in a separate table or in a JSONB field
		// Option 1: Store in metadata of the main brief
		await this.supabase
			.from('project_daily_briefs')
			.update({
				metadata: {
					condensed_content: condensedContent,
					condensed_generated_at: new Date().toISOString()
				}
			})
			.eq('id', fullBriefId);

		// Option 2: Create a separate table for condensed briefs (if you prefer)
		// await this.supabase
		//     .from('project_daily_briefs_condensed')
		//     .upsert({
		//         user_id: userId,
		//         project_id: projectId,
		//         full_brief_id: fullBriefId,
		//         brief_date: briefDate,
		//         content: condensedContent
		//     });
	}

	async saveMainBrief(
		userId: string,
		briefDate: string,
		content: string,
		projectBriefIds: string[]
	) {
		const priorityActions = this.extractPriorityActions(content);

		const { data, error } = await this.supabase
			.from('daily_briefs')
			.upsert(
				{
					user_id: userId,
					brief_date: briefDate,
					summary_content: content,
					project_brief_ids: projectBriefIds,
					priority_actions: priorityActions,
					generation_status: 'completed',
					generation_completed_at: new Date().toISOString()
				},
				{
					onConflict: 'user_id,brief_date',
					ignoreDuplicates: false
				}
			)
			.select()
			.single();

		if (error) throw error;
		return data;
	}

	private extractPriorityActions(content: string): string[] {
		const actions: string[] = [];
		const lines = content.split('\n');

		for (const line of lines) {
			const trimmed = line.trim();
			// Match numbered lists or bullet points
			const match = trimmed.match(/^(\d+\.|[-•*])\s+(.+)$/);
			if (match && match[2]) {
				actions.push(match[2].trim());
				if (actions.length >= 5) break;
			}
		}

		return actions;
	}
}
