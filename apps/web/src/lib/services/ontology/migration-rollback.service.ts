// apps/web/src/lib/services/ontology/migration-rollback.service.ts
// Migration Rollback Service - Handles actual data rollback with soft/hard modes

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

export type RollbackMode = 'soft' | 'hard';
export type RollbackEntityType = 'project' | 'task' | 'phase' | 'calendar';

export interface RollbackRequest {
	runId: string;
	mode: RollbackMode;
	entityTypes?: RollbackEntityType[];
	fromTimestamp?: string;
	confirmationCode: string;
}

export interface RollbackResult {
	runId: string;
	mode: RollbackMode;
	deletedCounts: {
		projects: number;
		plans: number;
		tasks: number;
		events: number;
		edges: number;
		documents: number;
	};
	mappingsRemoved: number;
	logsUpdated: number;
	recoverable: boolean;
	recoverableUntil?: string;
}

export interface RollbackValidation {
	safe: boolean;
	warnings: string[];
	blockers: string[];
	entityCounts: {
		projects: number;
		plans: number;
		tasks: number;
		events: number;
	};
}

// Soft delete recovery window (30 days)
const SOFT_DELETE_RECOVERY_DAYS = 30;

export class MigrationRollbackService {
	constructor(private readonly supabase: SupabaseClient<Database>) {}

	/**
	 * Validate that rollback is safe to perform
	 */
	async validateRollback(runId: string): Promise<RollbackValidation> {
		const warnings: string[] = [];
		const blockers: string[] = [];

		// Get all mappings for this run
		const { data: mappings, error: mappingsError } = await this.supabase
			.from('legacy_entity_mappings')
			.select('onto_id, onto_table, legacy_table')
			.eq('run_id', runId);

		if (mappingsError) {
			throw new Error(`Failed to fetch mappings: ${mappingsError.message}`);
		}

		if (!mappings || mappings.length === 0) {
			return {
				safe: true,
				warnings: ['No mappings found for this run. Nothing to rollback.'],
				blockers: [],
				entityCounts: { projects: 0, plans: 0, tasks: 0, events: 0 }
			};
		}

		// Count entities by type
		const entityCounts = {
			projects: mappings.filter((m) => m.onto_table === 'onto_projects').length,
			plans: mappings.filter((m) => m.onto_table === 'onto_plans').length,
			tasks: mappings.filter((m) => m.onto_table === 'onto_tasks').length,
			events: mappings.filter((m) => m.onto_table === 'onto_events').length
		};

		// Get project IDs for further checks
		const projectOntoIds = mappings
			.filter((m) => m.onto_table === 'onto_projects')
			.map((m) => m.onto_id);

		if (projectOntoIds.length > 0) {
			// Check if any migrated projects have been modified after creation
			const { data: modifiedProjects } = await this.supabase
				.from('onto_projects')
				.select('id, updated_at, created_at')
				.in('id', projectOntoIds)
				.filter('updated_at', 'gt', 'created_at');

			if (modifiedProjects && modifiedProjects.length > 0) {
				warnings.push(
					`${modifiedProjects.length} project(s) have been modified after migration. User changes may be lost.`
				);
			}

			// Check for edges created outside migration (no run_id in metadata)
			const allOntoIds = mappings.map((m) => m.onto_id);
			const { data: externalEdges } = await this.supabase
				.from('onto_edges')
				.select('id')
				.or(`src_id.in.(${allOntoIds.join(',')}),dst_id.in.(${allOntoIds.join(',')})`)
				.is('run_id', null);

			if (externalEdges && externalEdges.length > 0) {
				warnings.push(
					`${externalEdges.length} relationship(s) were created outside migration. These will also be affected.`
				);
			}
		}

		return {
			safe: blockers.length === 0,
			warnings,
			blockers,
			entityCounts
		};
	}

	/**
	 * Perform rollback of migration run
	 */
	async rollback(request: RollbackRequest): Promise<RollbackResult> {
		const { runId, mode, entityTypes, fromTimestamp, confirmationCode } = request;

		// Validate confirmation code (must be first 8 chars of runId)
		const expectedCode = runId.slice(0, 8).toLowerCase();
		if (confirmationCode.toLowerCase() !== expectedCode) {
			throw new Error(
				`Invalid confirmation code. Expected first 8 characters of run ID: ${expectedCode}`
			);
		}

		// Get mappings for this run
		let mappingsQuery = this.supabase
			.from('legacy_entity_mappings')
			.select('id, onto_id, onto_table, legacy_table, legacy_id')
			.eq('run_id', runId);

		if (fromTimestamp) {
			mappingsQuery = mappingsQuery.gte('migrated_at', fromTimestamp);
		}

		const { data: mappings, error: mappingsError } = await mappingsQuery;

		if (mappingsError) {
			throw new Error(`Failed to fetch mappings: ${mappingsError.message}`);
		}

		if (!mappings || mappings.length === 0) {
			return {
				runId,
				mode,
				deletedCounts: {
					projects: 0,
					plans: 0,
					tasks: 0,
					events: 0,
					edges: 0,
					documents: 0
				},
				mappingsRemoved: 0,
				logsUpdated: 0,
				recoverable: mode === 'soft',
				recoverableUntil: mode === 'soft' ? this.getRecoveryDeadline() : undefined
			};
		}

		// Filter by entity types if specified
		let filteredMappings = mappings;
		if (entityTypes && entityTypes.length > 0) {
			const tableMapping: Record<RollbackEntityType, string> = {
				project: 'onto_projects',
				task: 'onto_tasks',
				phase: 'onto_plans',
				calendar: 'onto_events'
			};
			const allowedTables = entityTypes.map((t) => tableMapping[t]);
			filteredMappings = mappings.filter((m) => allowedTables.includes(m.onto_table));
		}

		// Group by table
		const projectMappings = filteredMappings.filter((m) => m.onto_table === 'onto_projects');
		const planMappings = filteredMappings.filter((m) => m.onto_table === 'onto_plans');
		const taskMappings = filteredMappings.filter((m) => m.onto_table === 'onto_tasks');
		const eventMappings = filteredMappings.filter((m) => m.onto_table === 'onto_events');

		const deletedCounts = {
			projects: 0,
			plans: 0,
			tasks: 0,
			events: 0,
			edges: 0,
			documents: 0
		};

		if (mode === 'soft') {
			// Soft rollback: set deleted_at on entities
			deletedCounts.projects = await this.softDeleteEntities(
				'onto_projects',
				projectMappings
			);
			deletedCounts.plans = await this.softDeleteEntities('onto_plans', planMappings);
			deletedCounts.tasks = await this.softDeleteEntities('onto_tasks', taskMappings);
			deletedCounts.events = await this.softDeleteEntities('onto_events', eventMappings);

			// Soft delete related edges
			const allOntoIds = filteredMappings.map((m) => m.onto_id);
			deletedCounts.edges = await this.softDeleteRelatedEdges(allOntoIds);

			// Soft delete related documents
			deletedCounts.documents = await this.softDeleteRelatedDocuments(allOntoIds);
		} else {
			// Hard rollback: permanently delete entities
			// Delete in order: events, tasks, plans, projects (due to FK constraints)
			deletedCounts.events = await this.hardDeleteEntities('onto_events', eventMappings);
			deletedCounts.tasks = await this.hardDeleteEntities('onto_tasks', taskMappings);
			deletedCounts.plans = await this.hardDeleteEntities('onto_plans', planMappings);
			deletedCounts.projects = await this.hardDeleteProjects(projectMappings);
		}

		// Remove mappings
		const mappingsRemoved = await this.removeMappings(filteredMappings.map((m) => m.id));

		// Update migration log
		const logsUpdated = await this.updateMigrationLogs(runId, mode, entityTypes, fromTimestamp);

		return {
			runId,
			mode,
			deletedCounts,
			mappingsRemoved,
			logsUpdated,
			recoverable: mode === 'soft',
			recoverableUntil: mode === 'soft' ? this.getRecoveryDeadline() : undefined
		};
	}

	/**
	 * Soft delete entities (set deleted_at)
	 */
	private async softDeleteEntities(
		table: string,
		mappings: Array<{ onto_id: string }>
	): Promise<number> {
		if (mappings.length === 0) return 0;

		const ids = mappings.map((m) => m.onto_id);
		const now = new Date().toISOString();

		const { count, error } = await this.supabase
			.from(table as 'onto_projects' | 'onto_plans' | 'onto_tasks' | 'onto_events')
			.update({ deleted_at: now }, { count: 'exact' })
			.in('id', ids)
			.is('deleted_at', null);

		if (error) {
			console.error(`Failed to soft delete ${table}:`, error);
			return 0;
		}

		return count ?? 0;
	}

	/**
	 * Hard delete entities (permanent deletion)
	 */
	private async hardDeleteEntities(
		table: string,
		mappings: Array<{ onto_id: string }>
	): Promise<number> {
		if (mappings.length === 0) return 0;

		const ids = mappings.map((m) => m.onto_id);

		const { count, error } = await this.supabase
			.from(table as 'onto_projects' | 'onto_plans' | 'onto_tasks' | 'onto_events')
			.delete({ count: 'exact' })
			.in('id', ids);

		if (error) {
			console.error(`Failed to hard delete ${table}:`, error);
			return 0;
		}

		return count ?? 0;
	}

	/**
	 * Hard delete projects using the delete_onto_project RPC for cascade
	 */
	private async hardDeleteProjects(mappings: Array<{ onto_id: string }>): Promise<number> {
		if (mappings.length === 0) return 0;

		let deleted = 0;
		for (const mapping of mappings) {
			try {
				// Try using the cascade delete function if it exists
				const { error } = await this.supabase.rpc('delete_onto_project', {
					project_id: mapping.onto_id
				});

				if (error) {
					// Fall back to direct delete if RPC doesn't exist
					const { error: deleteError } = await this.supabase
						.from('onto_projects')
						.delete()
						.eq('id', mapping.onto_id);

					if (!deleteError) {
						deleted++;
					} else {
						console.error(`Failed to delete project ${mapping.onto_id}:`, deleteError);
					}
				} else {
					deleted++;
				}
			} catch (e) {
				console.error(`Error deleting project ${mapping.onto_id}:`, e);
			}
		}

		return deleted;
	}

	/**
	 * Soft delete related edges
	 */
	private async softDeleteRelatedEdges(ontoIds: string[]): Promise<number> {
		if (ontoIds.length === 0) return 0;

		const now = new Date().toISOString();

		// Delete edges where either src or dst is in the list
		const { count, error } = await this.supabase
			.from('onto_edges')
			.update({ deleted_at: now }, { count: 'exact' })
			.or(`src_id.in.(${ontoIds.join(',')}),dst_id.in.(${ontoIds.join(',')})`)
			.is('deleted_at', null);

		if (error) {
			console.error('Failed to soft delete edges:', error);
			return 0;
		}

		return count ?? 0;
	}

	/**
	 * Soft delete related documents
	 */
	private async softDeleteRelatedDocuments(ontoIds: string[]): Promise<number> {
		if (ontoIds.length === 0) return 0;

		const now = new Date().toISOString();

		// Delete documents that belong to these entities
		const { count, error } = await this.supabase
			.from('onto_documents')
			.update({ deleted_at: now }, { count: 'exact' })
			.in('owner_id', ontoIds)
			.is('deleted_at', null);

		if (error) {
			console.error('Failed to soft delete documents:', error);
			return 0;
		}

		return count ?? 0;
	}

	/**
	 * Remove legacy entity mappings
	 */
	private async removeMappings(mappingIds: number[]): Promise<number> {
		if (mappingIds.length === 0) return 0;

		const { count, error } = await this.supabase
			.from('legacy_entity_mappings')
			.delete({ count: 'exact' })
			.in('id', mappingIds);

		if (error) {
			console.error('Failed to remove mappings:', error);
			return 0;
		}

		return count ?? 0;
	}

	/**
	 * Update migration log entries
	 */
	private async updateMigrationLogs(
		runId: string,
		mode: RollbackMode,
		entityTypes?: RollbackEntityType[],
		fromTimestamp?: string
	): Promise<number> {
		let query = this.supabase
			.from('migration_log')
			.update(
				{
					status: 'rolled_back',
					metadata: {
						rolledBackAt: new Date().toISOString(),
						rollbackMode: mode
					}
				},
				{ count: 'exact' }
			)
			.eq('run_id', runId)
			.neq('entity_type', 'run');

		if (entityTypes && entityTypes.length > 0) {
			query = query.in('entity_type', entityTypes);
		}

		if (fromTimestamp) {
			query = query.gte('created_at', fromTimestamp);
		}

		const { count, error } = await query;

		if (error) {
			console.error('Failed to update migration logs:', error);
			return 0;
		}

		// Also update the run entry
		await this.supabase
			.from('migration_log')
			.update({
				status: 'rolled_back',
				metadata: {
					rolledBackAt: new Date().toISOString(),
					rollbackMode: mode,
					entityTypesRolledBack: entityTypes ?? 'all'
				}
			})
			.eq('run_id', runId)
			.eq('entity_type', 'run');

		return count ?? 0;
	}

	/**
	 * Calculate recovery deadline for soft deletes
	 */
	private getRecoveryDeadline(): string {
		const deadline = new Date();
		deadline.setDate(deadline.getDate() + SOFT_DELETE_RECOVERY_DAYS);
		return deadline.toISOString();
	}

	/**
	 * Recover soft-deleted entities (undo soft rollback)
	 */
	async recoverSoftDeleted(runId: string): Promise<{
		recovered: number;
		mappingsRestored: number;
	}> {
		// This would restore soft-deleted entities by clearing deleted_at
		// For now, return a placeholder - full implementation would need to:
		// 1. Find entities that were soft-deleted as part of this run
		// 2. Clear their deleted_at
		// 3. Restore mappings if needed

		throw new Error('Recovery from soft delete not yet implemented. Contact support.');
	}
}
