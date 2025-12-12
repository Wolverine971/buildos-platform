// apps/web/src/lib/services/ontology/migration/enhanced-plan-migrator.ts
/**
 * Enhanced Plan Migrator
 *
 * Migrates legacy phases to onto_plans with minimal properties.
 * Templates have been removed (Dec 2025) - uses fixed type_key only.
 *
 * Behavior:
 * - Fixed type_key: 'plan.base'
 * - Preserves phase ordering
 * - Creates project→plan edges
 * - No template lookup or property extraction
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Json } from '@buildos/shared-types';
import type {
	LegacyPhase,
	MigrationContext,
	EnhancedPlanMigrationResult
} from './enhanced-migration.types';
import type { Facets } from '$lib/types/onto';
import { upsertLegacyMapping } from '../legacy-mapping.service';

export class EnhancedPlanMigrator {
	constructor(private readonly client: TypedSupabaseClient) {}

	/**
	 * Migrate a phase to plan with fixed type_key.
	 */
	async migrate(
		phase: LegacyPhase,
		context: MigrationContext,
		projectContext: {
			ontoProjectId: string;
			actorId: string;
			projectFacets?: Facets;
		}
	): Promise<EnhancedPlanMigrationResult> {
		try {
			// Template discovery and property extraction removed
			// Plans are now migrated with minimal properties only
			const typeKey = 'plan.base'; // Default type key

			if (context.dryRun) {
				return {
					status: 'pending_review',
					legacyPhaseId: phase.id,
					typeKeyUsed: typeKey,
					message: 'Dry-run: plan migration preview ready (template discovery removed)'
				};
			}

			// Create onto_plan with minimal properties
			const stateKey = this.determinePhaseState(phase);

			const propsWithFacets = {
				description: phase.description ?? null,
				facets: {
					context: projectContext.projectFacets?.context ?? null,
					scale: projectContext.projectFacets?.scale ?? null,
					stage: projectContext.projectFacets?.stage ?? null
				},
				schedule: {
					start_date: phase.start_date ?? null,
					end_date: phase.end_date ?? null
				}
			};

			const { data, error } = await this.client
				.from('onto_plans')
				.insert({
					name: phase.name,
					project_id: projectContext.ontoProjectId,
					type_key: typeKey,
					state_key: stateKey,
					props: propsWithFacets as Json,
					created_by: projectContext.actorId
				})
				.select('id')
				.single();

			if (error || !data) {
				throw new Error(`Failed to create onto_plan for ${phase.id}: ${error?.message}`);
			}

			// Create has_plan edge to link plan to project
			const { error: edgeError } = await this.client.from('onto_edges').insert({
				src_kind: 'project',
				src_id: projectContext.ontoProjectId,
				rel: 'has_plan',
				dst_kind: 'plan',
				dst_id: data.id
			});

			if (edgeError) {
				console.error(
					`[EnhancedPlanMigrator] Failed to create has_plan edge for plan ${phase.id} → project ${projectContext.ontoProjectId}: ${edgeError.message}`
				);
				throw new Error(`Failed to create project-plan edge: ${edgeError.message}`);
			}

			// Update legacy mapping
			await upsertLegacyMapping(this.client, {
				legacyTable: 'phases',
				legacyId: phase.id,
				ontoTable: 'onto_plans',
				ontoId: data.id,
				record: phase,
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
				legacyPhaseId: phase.id,
				ontoPlanId: data.id,
				typeKeyUsed: typeKey,
				message: 'Plan migrated successfully (template discovery removed)'
			};
		} catch (error) {
			console.error('[EnhancedPlanMigrator] Migration failed:', error);
			return {
				status: 'failed',
				legacyPhaseId: phase.id,
				message: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			};
		}
	}

	// ============================================
	// PRIVATE HELPER METHODS
	// ============================================

	private determinePhaseState(phase: LegacyPhase): string {
		// Infer state from dates
		const now = new Date();
		const startDate = phase.start_date ? new Date(phase.start_date) : null;
		const endDate = phase.end_date ? new Date(phase.end_date) : null;

		// If we have dates, use them to determine state
		if (startDate && endDate) {
			if (now < startDate) {
				return 'draft'; // Future phase
			} else if (now >= startDate && now <= endDate) {
				return 'active'; // Current phase
			} else {
				return 'complete'; // Past phase
			}
		}

		// If no dates, check order
		// Assume lower order = earlier phases that might be complete
		if (phase.order === 1) {
			return 'active'; // First phase typically active
		}

		return 'draft'; // Default to draft for planning
	}
}
