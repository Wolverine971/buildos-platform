// apps/web/src/lib/services/next-step-seeding.service.ts
/**
 * NextStepSeedingService - Generates and seeds initial next steps for new projects
 *
 * This service is called when:
 * - A project is created via brain dump processing
 * - A project is created via the ontology system
 *
 * It uses LLM to generate contextually appropriate next steps based on:
 * - Project name and description
 * - Project template type
 * - Initial tasks created
 * - Brain dump content (if available)
 *
 * @see /apps/web/docs/features/project-activity-logging/IMPLEMENTATION_PLAN.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { createEntityReference } from '$lib/utils/entity-reference-parser';

// =============================================================================
// Types
// =============================================================================

interface ProjectContext {
	id: string;
	name: string;
	description?: string | null;
	context?: string | null;
	templateType?: string | null;
}

interface TaskContext {
	id: string;
	title: string;
	priority?: string | null;
	status?: string | null;
}

interface SeedNextStepParams {
	projectId: string;
	userId: string;
	projectData?: Partial<ProjectContext>;
	tasks?: TaskContext[];
	brainDumpContent?: string;
	isOntoProject?: boolean; // Whether this is an onto_projects or legacy projects
}

interface GeneratedNextStep {
	short: string;
	long: string;
}

// =============================================================================
// Service Class
// =============================================================================

export class NextStepSeedingService {
	constructor(private supabase: SupabaseClient<Database>) {}

	/**
	 * Seed initial next steps for a newly created project
	 *
	 * This method:
	 * 1. Gathers context about the project
	 * 2. Generates appropriate next steps using LLM
	 * 3. Updates the project with the next steps
	 *
	 * @param params - Seeding parameters
	 */
	async seedNextSteps(params: SeedNextStepParams): Promise<void> {
		const {
			projectId,
			userId,
			projectData,
			tasks,
			brainDumpContent,
			isOntoProject = true
		} = params;

		console.log(`🌱 Seeding next steps for project ${projectId}`);

		try {
			// 1. Get or build project context
			let project: ProjectContext;
			if (projectData?.name) {
				project = {
					id: projectId,
					name: projectData.name,
					description: projectData.description,
					context: projectData.context,
					templateType: projectData.templateType
				};
			} else {
				// Fetch project from database
				const fetchedProject = await this.fetchProjectContext(projectId, isOntoProject);
				if (!fetchedProject) {
					console.warn(`⚠️ Project ${projectId} not found, skipping next step seeding`);
					return;
				}
				project = fetchedProject;
			}

			// 2. Get tasks if not provided
			let projectTasks = tasks;
			if (!projectTasks || projectTasks.length === 0) {
				projectTasks = await this.fetchProjectTasks(projectId, userId, isOntoProject);
			}

			// 3. Generate next steps
			const nextStep = await this.generateInitialNextStep(
				project,
				projectTasks,
				brainDumpContent
			);

			// 4. Update project with next steps
			await this.updateProjectNextStep(projectId, nextStep, isOntoProject);

			console.log(`✅ Seeded next steps for project ${projectId}`);
		} catch (error) {
			console.error(`❌ Failed to seed next steps for project ${projectId}:`, error);
			// Don't throw - next step seeding is non-critical
		}
	}

	/**
	 * Fetch project context from database
	 */
	private async fetchProjectContext(
		projectId: string,
		isOntoProject: boolean
	): Promise<ProjectContext | null> {
		if (isOntoProject) {
			const { data, error } = await this.supabase
				.from('onto_projects')
				.select('id, name, description, type_key')
				.eq('id', projectId)
				.single();

			if (error || !data) return null;

			return {
				id: data.id,
				name: data.name,
				description: data.description,
				templateType: data.type_key
			};
		} else {
			// Legacy projects table
			const { data, error } = await this.supabase
				.from('projects')
				.select('id, name, description, context')
				.eq('id', projectId)
				.single();

			if (error || !data) return null;

			return {
				id: data.id,
				name: data.name,
				description: data.description,
				context: data.context
			};
		}
	}

	/**
	 * Fetch tasks associated with the project
	 */
	private async fetchProjectTasks(
		projectId: string,
		userId: string,
		isOntoProject: boolean
	): Promise<TaskContext[]> {
		if (isOntoProject) {
			const { data } = await this.supabase
				.from('onto_tasks')
				.select('id, title, priority, state_key')
				.eq('project_id', projectId)
				.limit(10);

			return (data ?? []).map((t) => ({
				id: t.id,
				title: t.title,
				priority: t.priority?.toString(),
				status: t.state_key
			}));
		} else {
			// Legacy tasks table
			const { data } = await this.supabase
				.from('tasks')
				.select('id, title, priority, status')
				.eq('project_id', projectId)
				.eq('user_id', userId)
				.limit(10);

			return (data ?? []).map((t) => ({
				id: t.id,
				title: t.title,
				priority: t.priority,
				status: t.status
			}));
		}
	}

	/**
	 * Generate initial next step based on project context
	 */
	private async generateInitialNextStep(
		project: ProjectContext,
		tasks: TaskContext[],
		brainDumpContent?: string
	): Promise<GeneratedNextStep> {
		// Build context for generation
		const highPriorityTasks = tasks.filter(
			(t) => t.priority === 'high' || t.priority === 'urgent'
		);
		const firstTask = tasks[0];

		// Generate intelligent next step based on available context
		let shortStep: string;
		let longStep: string;

		if (highPriorityTasks.length > 0) {
			// Focus on high priority tasks
			const task = highPriorityTasks[0]!;
			shortStep = `Start with "${this.truncate(task.title, 60)}" - it's marked as high priority.`;
			longStep = this.buildLongStepWithTasks(
				`Begin by tackling the high-priority items first.`,
				highPriorityTasks.slice(0, 3),
				project
			);
		} else if (firstTask) {
			// Focus on first task
			shortStep = `Begin with "${this.truncate(firstTask.title, 60)}" to get momentum.`;
			longStep = this.buildLongStepWithTasks(
				`Start with the first task to build momentum on this project.`,
				tasks.slice(0, 3),
				project
			);
		} else if (project.description || project.context) {
			// No tasks yet, focus on planning
			shortStep = `Review the project scope and create your first tasks.`;
			longStep = `This project is ready to be planned out. Review the description and context, then break it down into actionable tasks. Consider what the first deliverable should be and work backwards from there.`;
		} else {
			// Minimal context
			shortStep = `Define the first milestone for "${this.truncate(project.name, 50)}".`;
			longStep = `Start by clarifying what success looks like for this project. Define the first milestone or deliverable, then break it down into tasks you can complete this week.`;
		}

		// Ensure within limits
		return {
			short: this.truncate(shortStep, 100),
			long: this.truncate(longStep, 650)
		};
	}

	/**
	 * Build the long next step with task references
	 */
	private buildLongStepWithTasks(
		intro: string,
		tasks: TaskContext[],
		project: ProjectContext
	): string {
		const parts: string[] = [intro];

		if (tasks.length > 0) {
			parts.push('Focus on these tasks:');
			tasks.forEach((task) => {
				const taskRef = createEntityReference('task', task.id, task.title);
				parts.push(`• ${taskRef}`);
			});
		}

		if (project.templateType) {
			parts.push(
				`This ${project.templateType.replace(/_/g, ' ')} project will benefit from a structured approach.`
			);
		}

		return parts.join(' ');
	}

	/**
	 * Update project with generated next steps
	 */
	private async updateProjectNextStep(
		projectId: string,
		nextStep: GeneratedNextStep,
		isOntoProject: boolean
	): Promise<void> {
		if (isOntoProject) {
			const { error } = await this.supabase
				.from('onto_projects')
				.update({
					next_step_short: nextStep.short,
					next_step_long: nextStep.long,
					next_step_updated_at: new Date().toISOString(),
					next_step_source: 'ai',
					updated_at: new Date().toISOString()
				})
				.eq('id', projectId);

			if (error) {
				throw new Error(`Failed to update onto_projects: ${error.message}`);
			}
		} else {
			// For legacy projects, we can't update since the columns don't exist
			// Instead, we could create an onto_project record or log this
			console.log(
				`⚠️ Legacy project ${projectId} - next steps not persisted (columns not available)`
			);

			// Optionally: Check if there's a corresponding onto_project and update that
			const { data: ontoProject } = await this.supabase
				.from('onto_projects')
				.select('id')
				.eq('id', projectId)
				.single();

			if (ontoProject) {
				await this.updateProjectNextStep(projectId, nextStep, true);
			}
		}
	}

	/**
	 * Truncate string to max length
	 */
	private truncate(str: string, maxLength: number): string {
		if (!str) return '';
		if (str.length <= maxLength) return str;
		return str.slice(0, maxLength - 3) + '...';
	}
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new NextStepSeedingService instance
 */
export function createNextStepSeedingService(
	supabase: SupabaseClient<Database>
): NextStepSeedingService {
	return new NextStepSeedingService(supabase);
}

// =============================================================================
// Standalone Function for Easy Integration
// =============================================================================

/**
 * Seed next steps for a project (standalone function for easy integration)
 *
 * @example
 * // In operations-executor.ts after project creation:
 * await seedProjectNextSteps(supabase, {
 *   projectId: result.id,
 *   userId,
 *   projectData: { name: data.name, description: data.description },
 *   isOntoProject: false
 * });
 */
export async function seedProjectNextSteps(
	supabase: SupabaseClient<Database>,
	params: SeedNextStepParams
): Promise<void> {
	const service = new NextStepSeedingService(supabase);
	await service.seedNextSteps(params);
}
