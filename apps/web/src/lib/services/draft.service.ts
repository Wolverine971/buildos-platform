// apps/web/src/lib/services/draft.service.ts
/**
 * DraftService - Manages draft projects and tasks for the conversational agent
 */

import type { SupabaseClient } from '@supabase/supabase-js';
// import type { Database } from '$lib/types/database.types';
import type { ProjectDraft, DraftTask, Database } from '@buildos/shared-types';

// Helper to generate IDs
const generateId = () => crypto.randomUUID();

export class DraftService {
	constructor(private supabase: SupabaseClient<Database>) {}

	/**
	 * Get or create a draft for a chat session
	 * One draft per session constraint
	 */
	async getOrCreateDraft(sessionId: string, userId: string): Promise<ProjectDraft> {
		// Check for existing draft linked to this session
		const { data: existing, error: fetchError } = await this.supabase
			.from('project_drafts')
			.select(
				`
        *,
        draft_tasks(*)
      `
			)
			.eq('chat_session_id', sessionId)
			.single();

		if (existing) {
			return existing as unknown as ProjectDraft;
		}

		// Create new draft
		const { data: newDraft, error: createError } = await this.supabase
			.from('project_drafts')
			.insert({
				user_id: userId,
				chat_session_id: sessionId,
				dimensions_covered: [],
				question_count: 0
			})
			.select()
			.single();

		if (createError) {
			console.error('Error creating draft:', createError);
			throw new Error(`Failed to create draft: ${createError.message}`);
		}

		return newDraft as unknown as ProjectDraft;
	}

	/**
	 * Get draft by ID
	 */
	async getDraft(draftId: string): Promise<ProjectDraft | null> {
		const { data, error } = await this.supabase
			.from('project_drafts')
			.select(
				`
        *,
        draft_tasks(*)
      `
			)
			.eq('id', draftId)
			.single();

		if (error) {
			console.error('Error fetching draft:', error);
			return null;
		}

		return data as unknown as ProjectDraft;
	}

	/**
	 * Get all active drafts for a user
	 */
	async getUserDrafts(userId: string): Promise<ProjectDraft[]> {
		const { data, error } = await this.supabase
			.from('project_drafts')
			.select(
				`
        *,
        draft_tasks(*)
      `
			)
			.eq('user_id', userId)
			.is('completed_at', null)
			.order('updated_at', { ascending: false });

		if (error) {
			console.error('Error fetching user drafts:', error);
			return [];
		}

		return data as unknown as ProjectDraft[];
	}

	/**
	 * Update a specific dimension of the draft
	 */
	async updateDimension(draftId: string, dimension: string, content: string): Promise<void> {
		// Get current dimensions_covered
		const { data: current } = await this.supabase
			.from('project_drafts')
			.select('dimensions_covered')
			.eq('id', draftId)
			.single();

		const dimensionsCovered = current?.dimensions_covered || [];
		if (!dimensionsCovered.includes(dimension)) {
			dimensionsCovered.push(dimension);
		}

		// Update the draft with the dimension content and metadata
		const { error } = await this.supabase
			.from('project_drafts')
			.update({
				[dimension]: content,
				dimensions_covered: dimensionsCovered,
				updated_at: new Date().toISOString()
			})
			.eq('id', draftId);

		if (error) {
			console.error('Error updating dimension:', error);
			throw new Error(`Failed to update dimension: ${error.message}`);
		}
	}

	/**
	 * Update multiple fields of the draft
	 */
	async updateDraft(draftId: string, updates: Partial<ProjectDraft>): Promise<void> {
		const { error } = await this.supabase
			.from('project_drafts')
			.update({
				...updates,
				updated_at: new Date().toISOString()
			})
			.eq('id', draftId);

		if (error) {
			console.error('Error updating draft:', error);
			throw new Error(`Failed to update draft: ${error.message}`);
		}
	}

	/**
	 * Increment question count
	 */
	async incrementQuestionCount(draftId: string): Promise<void> {
		const { data: current } = await this.supabase
			.from('project_drafts')
			.select('question_count')
			.eq('id', draftId)
			.single();

		const newCount = (current?.question_count || 0) + 1;

		await this.supabase
			.from('project_drafts')
			.update({
				question_count: newCount,
				updated_at: new Date().toISOString()
			})
			.eq('id', draftId);
	}

	/**
	 * Add a draft task to the draft project
	 */
	async addDraftTask(
		draftProjectId: string,
		task: Omit<DraftTask, 'id' | 'created_at' | 'updated_at'>
	): Promise<DraftTask> {
		const { data, error } = await this.supabase
			.from('draft_tasks')
			.insert({
				...task,
				draft_project_id: draftProjectId
			})
			.select()
			.single();

		if (error) {
			console.error('Error adding draft task:', error);
			throw new Error(`Failed to add draft task: ${error.message}`);
		}

		return data as unknown as DraftTask;
	}

	/**
	 * Update a draft task
	 */
	async updateDraftTask(taskId: string, updates: Partial<DraftTask>): Promise<void> {
		const { error } = await this.supabase
			.from('draft_tasks')
			.update({
				...updates,
				updated_at: new Date().toISOString()
			})
			.eq('id', taskId);

		if (error) {
			console.error('Error updating draft task:', error);
			throw new Error(`Failed to update draft task: ${error.message}`);
		}
	}

	/**
	 * Delete a draft task
	 */
	async deleteDraftTask(taskId: string): Promise<void> {
		const { error } = await this.supabase.from('draft_tasks').delete().eq('id', taskId);

		if (error) {
			console.error('Error deleting draft task:', error);
			throw new Error(`Failed to delete draft task: ${error.message}`);
		}
	}

	/**
	 * Finalize a draft into a real project
	 * Calls the database function that handles the transaction
	 */
	async finalizeDraft(draftId: string, userId: string): Promise<string> {
		const { data, error } = await this.supabase.rpc('finalize_draft_project', {
			p_draft_id: draftId,
			p_user_id: userId
		});

		if (error) {
			console.error('Error finalizing draft:', error);
			throw new Error(`Failed to finalize draft: ${error.message}`);
		}

		return data as string; // Returns the new project ID
	}

	/**
	 * Delete a draft (cascades to draft_tasks)
	 */
	async deleteDraft(draftId: string): Promise<void> {
		const { error } = await this.supabase.from('project_drafts').delete().eq('id', draftId);

		if (error) {
			console.error('Error deleting draft:', error);
			throw new Error(`Failed to delete draft: ${error.message}`);
		}
	}

	/**
	 * Check if a draft is complete enough to finalize
	 */
	async isDraftReadyToFinalize(draftId: string): Promise<boolean> {
		const { data } = await this.supabase
			.from('project_drafts')
			.select('name, description, dimensions_covered')
			.eq('id', draftId)
			.single();

		if (!data) return false;

		// Minimum requirements:
		// - Has a name
		// - Has a description
		// - Has at least 2 dimensions covered
		return !!(
			data.name &&
			data.description &&
			data.dimensions_covered &&
			data.dimensions_covered.length >= 2
		);
	}

	/**
	 * Generate a slug from the project name
	 */
	generateSlug(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.substring(0, 50); // Limit length
	}

	/**
	 * Prepare draft for finalization by filling in missing required fields
	 */
	async prepareDraftForFinalization(draftId: string): Promise<void> {
		const draft = await this.getDraft(draftId);
		if (!draft) throw new Error('Draft not found');

		const updates: Partial<ProjectDraft> = {};

		// Generate slug if missing
		if (!draft.slug && draft.name) {
			updates.slug = this.generateSlug(draft.name);
		}

		// Set default status if missing
		if (!draft.status) {
			updates.status = 'active';
		}

		// Set default dates if missing
		if (!draft.start_date) {
			updates.start_date = new Date().toISOString();
		}

		if (Object.keys(updates).length > 0) {
			await this.updateDraft(draftId, updates);
		}
	}

	/**
	 * Get draft by session ID
	 */
	async getDraftBySessionId(sessionId: string): Promise<ProjectDraft | null> {
		const { data, error } = await this.supabase
			.from('project_drafts')
			.select(
				`
        *,
        draft_tasks(*)
      `
			)
			.eq('chat_session_id', sessionId)
			.single();

		if (error) {
			console.error('Error fetching draft by session:', error);
			return null;
		}

		return data as unknown as ProjectDraft;
	}

	/**
	 * Check if user has any incomplete drafts
	 */
	async hasIncompleteDrafts(userId: string): Promise<boolean> {
		const { count } = await this.supabase
			.from('project_drafts')
			.select('*', { count: 'exact', head: true })
			.eq('user_id', userId)
			.is('completed_at', null);

		return (count || 0) > 0;
	}

	/**
	 * Get most recent incomplete draft for resuming
	 */
	async getMostRecentDraft(userId: string): Promise<ProjectDraft | null> {
		const { data } = await this.supabase
			.from('project_drafts')
			.select(
				`
        *,
        draft_tasks(*)
      `
			)
			.eq('user_id', userId)
			.is('completed_at', null)
			.order('updated_at', { ascending: false })
			.limit(1)
			.single();

		if (!data) return null;

		return data as unknown as ProjectDraft;
	}
}
