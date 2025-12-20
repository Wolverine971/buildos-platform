// apps/web/src/lib/services/dailyBrief/ontologyBriefRepository.ts
/**
 * Ontology Brief Repository
 * Database operations for ontology-based daily briefs.
 *
 * Spec Reference: /docs/specs/DAILY_BRIEF_ONTOLOGY_MIGRATION_SPEC.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

// ============================================================================
// TYPES
// ============================================================================

export interface OntologyDailyBrief {
	id: string;
	user_id: string;
	actor_id: string;
	brief_date: string;
	executive_summary: string;
	llm_analysis: string | null;
	priority_actions: string[];
	metadata: OntologyBriefMetadata;
	generation_status: string;
	generation_error: string | null;
	generation_started_at: string | null;
	generation_completed_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface OntologyProjectBrief {
	id: string;
	daily_brief_id: string;
	project_id: string;
	brief_content: string;
	metadata: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

export interface OntologyBriefEntity {
	id: string;
	daily_brief_id: string;
	project_id: string | null;
	entity_kind: string;
	entity_id: string;
	role: string | null;
	created_at: string;
}

export interface OntologyBriefMetadata {
	totalProjects: number;
	totalTasks: number;
	totalGoals: number;
	totalMilestones: number;
	activeRisksCount: number;
	totalOutputs: number;
	recentUpdatesCount: number;
	blockedCount: number;
	overdueCount: number;
	goalsAtRisk: number;
	milestonesThisWeek: number;
	outputsInReview: number;
	totalEdges: number;
	dependencyChains: number;
	generatedVia: string;
	timezone: string;
	isReengagement?: boolean;
	daysSinceLastLogin?: number;
}

export interface OntologyBriefWithProjects extends OntologyDailyBrief {
	projectBriefs: OntologyProjectBrief[];
}

// ============================================================================
// REPOSITORY CLASS
// ============================================================================

export class OntologyBriefRepository {
	constructor(public readonly supabase: SupabaseClient<Database>) {}

	// ============================================================================
	// DAILY BRIEF OPERATIONS
	// ============================================================================

	/**
	 * Get an ontology daily brief by ID
	 */
	async getBriefById(briefId: string): Promise<OntologyDailyBrief | null> {
		const { data, error } = await this.supabase
			.from('ontology_daily_briefs')
			.select('*')
			.eq('id', briefId)
			.single();

		if (error) {
			if (error.code === 'PGRST116') return null; // Not found
			throw error;
		}

		return data as unknown as OntologyDailyBrief;
	}

	/**
	 * Get an ontology daily brief by user and date
	 */
	async getBriefByUserAndDate(
		userId: string,
		briefDate: string
	): Promise<OntologyDailyBrief | null> {
		const { data, error } = await this.supabase
			.from('ontology_daily_briefs')
			.select('*')
			.eq('user_id', userId)
			.eq('brief_date', briefDate)
			.single();

		if (error) {
			if (error.code === 'PGRST116') return null;
			throw error;
		}

		return data as unknown as OntologyDailyBrief;
	}

	/**
	 * Get a brief with all its project briefs
	 */
	async getBriefWithProjects(briefId: string): Promise<OntologyBriefWithProjects | null> {
		const brief = await this.getBriefById(briefId);
		if (!brief) return null;

		const { data: projectBriefs, error } = await this.supabase
			.from('ontology_project_briefs')
			.select('*')
			.eq('daily_brief_id', briefId);

		if (error) throw error;

		return {
			...brief,
			projectBriefs: (projectBriefs || []) as OntologyProjectBrief[]
		};
	}

	/**
	 * Get recent briefs for a user
	 */
	async getRecentBriefs(userId: string, limit: number = 10): Promise<OntologyDailyBrief[]> {
		const { data, error } = await this.supabase
			.from('ontology_daily_briefs')
			.select('*')
			.eq('user_id', userId)
			.eq('generation_status', 'completed')
			.order('brief_date', { ascending: false })
			.limit(limit);

		if (error) throw error;

		return (data || []) as unknown as OntologyDailyBrief[];
	}

	/**
	 * Check for concurrent generations
	 */
	async checkConcurrentGenerations(userId: string): Promise<{
		canStart: boolean;
		message: string;
		existingBrief?: OntologyDailyBrief;
	}> {
		const { data: activeGenerations } = await this.supabase
			.from('ontology_daily_briefs')
			.select('*')
			.eq('user_id', userId)
			.eq('generation_status', 'processing')
			.single();

		if (activeGenerations) {
			// Check if it's stale (> 10 minutes)
			const startedAt = new Date(activeGenerations.generation_started_at || 0);
			const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

			if (startedAt < tenMinutesAgo) {
				// Mark as failed and allow new generation
				await this.supabase
					.from('ontology_daily_briefs')
					.update({
						generation_status: 'failed',
						generation_error: 'Generation timed out',
						generation_completed_at: new Date().toISOString()
					})
					.eq('id', activeGenerations.id);

				return { canStart: true, message: 'Previous generation timed out, cleaned up' };
			}

			return {
				canStart: false,
				message: `Brief generation already in progress for ${activeGenerations.brief_date}`,
				existingBrief: activeGenerations as unknown as OntologyDailyBrief
			};
		}

		return { canStart: true, message: 'Can start generation' };
	}

	/**
	 * Start a new brief generation
	 */
	async startGeneration(
		userId: string,
		actorId: string,
		briefDate: string,
		forceRegenerate: boolean
	): Promise<{
		started: boolean;
		briefId: string | null;
		message: string;
	}> {
		// Check for existing brief
		const existing = await this.getBriefByUserAndDate(userId, briefDate);

		if (existing) {
			if (existing.generation_status === 'processing') {
				return {
					started: false,
					briefId: existing.id,
					message: 'Brief generation already in progress'
				};
			}

			if (existing.generation_status === 'completed' && !forceRegenerate) {
				return {
					started: false,
					briefId: existing.id,
					message: 'Brief already exists for this date'
				};
			}

			// Update existing brief to processing
			const { data: updated, error } = await this.supabase
				.from('ontology_daily_briefs')
				.update({
					generation_status: 'processing',
					generation_started_at: new Date().toISOString(),
					generation_error: null,
					generation_completed_at: null
				})
				.eq('id', existing.id)
				.select()
				.single();

			if (error) throw error;

			return {
				started: true,
				briefId: updated.id,
				message: 'Brief regeneration started'
			};
		}

		// Create new brief
		const { data: newBrief, error } = await this.supabase
			.from('ontology_daily_briefs')
			.insert({
				user_id: userId,
				actor_id: actorId,
				brief_date: briefDate,
				executive_summary: '',
				generation_status: 'processing',
				generation_started_at: new Date().toISOString(),
				metadata: { generatedVia: 'ontology_v1' }
			})
			.select()
			.single();

		if (error) throw error;

		return {
			started: true,
			briefId: newBrief.id,
			message: 'Brief generation started'
		};
	}

	/**
	 * Update brief with generation results
	 */
	async updateBriefContent(
		briefId: string,
		content: {
			executiveSummary: string;
			llmAnalysis: string | null;
			priorityActions: string[];
			metadata: OntologyBriefMetadata;
		}
	): Promise<OntologyDailyBrief> {
		const { data, error } = await this.supabase
			.from('ontology_daily_briefs')
			.update({
				executive_summary: content.executiveSummary,
				llm_analysis: content.llmAnalysis,
				priority_actions: content.priorityActions,
				metadata: content.metadata as unknown as Record<string, unknown>,
				generation_status: 'completed',
				generation_completed_at: new Date().toISOString()
			})
			.eq('id', briefId)
			.select()
			.single();

		if (error) throw error;

		return data as unknown as OntologyDailyBrief;
	}

	/**
	 * Mark generation as failed
	 */
	async markGenerationFailed(briefId: string, errorMessage: string): Promise<void> {
		await this.supabase
			.from('ontology_daily_briefs')
			.update({
				generation_status: 'failed',
				generation_error: errorMessage,
				generation_completed_at: new Date().toISOString()
			})
			.eq('id', briefId);
	}

	// ============================================================================
	// PROJECT BRIEF OPERATIONS
	// ============================================================================

	/**
	 * Save a project brief
	 */
	async saveProjectBrief(
		dailyBriefId: string,
		projectId: string,
		content: string,
		metadata: Record<string, unknown>
	): Promise<OntologyProjectBrief> {
		const { data, error } = await this.supabase
			.from('ontology_project_briefs')
			.upsert(
				{
					daily_brief_id: dailyBriefId,
					project_id: projectId,
					brief_content: content,
					metadata: metadata as unknown as Record<string, unknown>
				},
				{
					onConflict: 'daily_brief_id,project_id'
				}
			)
			.select()
			.single();

		if (error) throw error;

		return data as OntologyProjectBrief;
	}

	/**
	 * Get project briefs for a daily brief
	 */
	async getProjectBriefs(dailyBriefId: string): Promise<OntologyProjectBrief[]> {
		const { data, error } = await this.supabase
			.from('ontology_project_briefs')
			.select('*')
			.eq('daily_brief_id', dailyBriefId);

		if (error) throw error;

		return (data || []) as OntologyProjectBrief[];
	}

	/**
	 * Get a project brief by project ID and daily brief ID
	 */
	async getProjectBrief(
		dailyBriefId: string,
		projectId: string
	): Promise<OntologyProjectBrief | null> {
		const { data, error } = await this.supabase
			.from('ontology_project_briefs')
			.select('*')
			.eq('daily_brief_id', dailyBriefId)
			.eq('project_id', projectId)
			.single();

		if (error) {
			if (error.code === 'PGRST116') return null;
			throw error;
		}

		return data as OntologyProjectBrief;
	}

	// ============================================================================
	// ENTITY TRACKING OPERATIONS
	// ============================================================================

	/**
	 * Record entities included in a brief
	 */
	async recordBriefEntities(
		dailyBriefId: string,
		entities: Array<{
			projectId: string | null;
			entityKind: string;
			entityId: string;
			role: string;
		}>
	): Promise<void> {
		if (entities.length === 0) return;

		const records = entities.map((e) => ({
			daily_brief_id: dailyBriefId,
			project_id: e.projectId,
			entity_kind: e.entityKind,
			entity_id: e.entityId,
			role: e.role
		}));

		const { error } = await this.supabase.from('ontology_brief_entities').insert(records);

		if (error) {
			console.warn('Failed to record brief entities:', error);
		}
	}

	/**
	 * Get entities included in a brief
	 */
	async getBriefEntities(dailyBriefId: string): Promise<OntologyBriefEntity[]> {
		const { data, error } = await this.supabase
			.from('ontology_brief_entities')
			.select('*')
			.eq('daily_brief_id', dailyBriefId);

		if (error) throw error;

		return (data || []) as OntologyBriefEntity[];
	}

	/**
	 * Get entity appearance history (for analytics)
	 */
	async getEntityAppearanceHistory(
		entityKind: string,
		entityId: string,
		limit: number = 10
	): Promise<Array<{ briefDate: string; role: string }>> {
		const { data, error } = await this.supabase
			.from('ontology_brief_entities')
			.select(
				`
				role,
				ontology_daily_briefs!inner (brief_date)
			`
			)
			.eq('entity_kind', entityKind)
			.eq('entity_id', entityId)
			.order('created_at', { ascending: false })
			.limit(limit);

		if (error) throw error;

		return (data || []).map((row: any) => ({
			briefDate: row.ontology_daily_briefs.brief_date,
			role: row.role
		}));
	}

	// ============================================================================
	// STATISTICS OPERATIONS
	// ============================================================================

	/**
	 * Get brief statistics for a user
	 */
	async getBriefStats(userId: string): Promise<{
		totalBriefs: number;
		completedBriefs: number;
		failedBriefs: number;
		lastBriefDate: string | null;
	}> {
		const { data: stats, error } = await this.supabase
			.from('ontology_daily_briefs')
			.select('generation_status, brief_date')
			.eq('user_id', userId)
			.order('brief_date', { ascending: false });

		if (error) throw error;

		const briefs = stats || [];
		return {
			totalBriefs: briefs.length,
			completedBriefs: briefs.filter((b) => b.generation_status === 'completed').length,
			failedBriefs: briefs.filter((b) => b.generation_status === 'failed').length,
			lastBriefDate: briefs.length > 0 ? (briefs[0]?.brief_date ?? null) : null
		};
	}

	/**
	 * Get goal tracking across briefs (for trend analysis)
	 */
	async getGoalTrends(
		userId: string,
		goalId: string,
		days: number = 30
	): Promise<Array<{ date: string; role: string }>> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - days);

		const { data, error } = await this.supabase
			.from('ontology_brief_entities')
			.select(
				`
				role,
				ontology_daily_briefs!inner (brief_date, user_id)
			`
			)
			.eq('entity_kind', 'goal')
			.eq('entity_id', goalId)
			.gte('created_at', cutoffDate.toISOString());

		if (error) throw error;

		return (data || [])
			.filter((row: any) => row.ontology_daily_briefs.user_id === userId)
			.map((row: any) => ({
				date: row.ontology_daily_briefs.brief_date,
				role: row.role
			}));
	}

	// ============================================================================
	// ACTOR OPERATIONS
	// ============================================================================

	/**
	 * Get actor ID for a user
	 */
	async getActorIdForUser(userId: string): Promise<string | null> {
		const { data, error } = await this.supabase
			.from('onto_actors')
			.select('id')
			.eq('user_id', userId)
			.eq('kind', 'human')
			.single();

		if (error) {
			if (error.code === 'PGRST116') return null;
			throw error;
		}

		return data?.id || null;
	}
}
