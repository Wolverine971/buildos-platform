// apps/web/src/lib/services/ontology/migration/enhanced-task-migrator.ts
/**
 * Enhanced Task Migrator
 *
 * Migrates individual tasks to onto_tasks with minimal properties.
 * Templates have been removed (Dec 2025) - uses fixed type_key only.
 *
 * NOTE: For batch operations (5+ tasks), use BatchTaskMigrationService instead,
 * which provides LLM-powered classification into work modes.
 *
 * This single-task migrator uses a fixed default type_key ('task.execute')
 * for simplicity and is primarily used as a fallback.
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Json } from '@buildos/shared-types';
import type {
	LegacyTask,
	MigrationContext,
	EnhancedTaskMigrationResult
} from './enhanced-migration.types';
import { upsertLegacyMapping } from '../legacy-mapping.service';

export class EnhancedTaskMigrator {
	constructor(private readonly client: TypedSupabaseClient) {}

	/**
	 * Migrate a single task with fixed type_key.
	 * For batch operations with LLM classification, use BatchTaskMigrationService.
	 */
	async migrate(
		task: LegacyTask,
		context: MigrationContext,
		projectContext: {
			ontoProjectId: string;
			ontoPlanId?: string | null;
			actorId: string;
		}
	): Promise<EnhancedTaskMigrationResult> {
		try {
			// Template discovery and property extraction removed
			// Tasks are now migrated with minimal properties only
			const typeKey = 'task.execute'; // Default type key

			if (context.dryRun) {
				return {
					status: 'pending_review',
					legacyTaskId: task.id,
					typeKeyUsed: typeKey,
					message: 'Dry-run: task migration preview ready (template discovery removed)'
				};
			}

			// Create onto_task with minimal properties
			const stateKey = this.mapStatusToState(task.status);
			const priority = this.mapPriority(task.priority);
			const dueAt = task.start_date ?? task.completed_at ?? null;
			const facetScale = this.inferScale(task);

			const propsWithMetadata = {
				title: task.title,
				description: task.description ?? null,
				type_key: typeKey,
				facets: { scale: facetScale }
			};

			const { data, error } = await this.client
				.from('onto_tasks')
				.insert({
					title: task.title,
					project_id: projectContext.ontoProjectId,
					type_key: typeKey,
					state_key: stateKey,
					priority,
					due_at: dueAt,
					props: propsWithMetadata as Json,
					created_by: projectContext.actorId
				})
				.select('id')
				.single();

			if (error || !data) {
				throw new Error(`Failed to create onto_task for ${task.id}: ${error?.message}`);
			}

			// Create plan relationship edge if plan exists
			// Convention: Store directionally (plan → task), query bidirectionally
			if (projectContext.ontoPlanId) {
				const { error: edgeError } = await this.client.from('onto_edges').insert({
					src_id: projectContext.ontoPlanId,
					src_kind: 'plan',
					dst_id: data.id,
					dst_kind: 'task',
					rel: 'has_task'
				});

				if (edgeError) {
					console.error(
						`[EnhancedTaskMigrator] Failed to create task-plan edge for task ${task.id} → plan ${projectContext.ontoPlanId}: ${edgeError.message}`
					);
					throw new Error(`Failed to create task-plan edge: ${edgeError.message}`);
				}
			}

			// Update legacy mapping
			await upsertLegacyMapping(this.client, {
				legacyTable: 'tasks',
				legacyId: task.id,
				ontoTable: 'onto_tasks',
				ontoId: data.id,
				record: task,
				metadata: {
					run_id: context.runId,
					batch_id: context.batchId,
					type_key_used: typeKey,
					props_confidence: 0.5,
					enhanced_mode: false // Template features removed
				}
			});

			return {
				status: 'completed',
				legacyTaskId: task.id,
				ontoTaskId: data.id,
				typeKeyUsed: typeKey,
				message: 'Task migrated successfully (template discovery removed)'
			};
		} catch (error) {
			console.error('[EnhancedTaskMigrator] Migration failed:', error);
			return {
				status: 'failed',
				legacyTaskId: task.id,
				message: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			};
		}
	}

	// ============================================
	// PRIVATE HELPER METHODS
	// ============================================

	private mapStatusToState(status: LegacyTask['status']): string {
		switch (status) {
			case 'completed':
				return 'done';
			case 'in_progress':
				return 'in_progress';
			case 'pending':
				return 'todo';
			case 'blocked':
				return 'blocked';
			default:
				return 'todo';
		}
	}

	private mapPriority(priority: number | null): number {
		if (priority === null) return 3; // Default medium priority
		// Clamp to 1-5 range
		return Math.max(1, Math.min(5, Math.round(priority)));
	}

	private inferScale(task: LegacyTask): 'micro' | 'small' | 'medium' | 'large' | 'epic' {
		const descLength = (task.description ?? '').length;
		const notesLength = (task.notes ?? '').length;
		const totalLength = descLength + notesLength;

		if (totalLength > 1000) return 'large';
		if (totalLength > 500) return 'medium';
		if (totalLength > 100) return 'small';
		return 'micro';
	}
}
