// apps/web/src/lib/services/ontology/migration/enhanced-project-migrator.ts
/**
 * Enhanced Project Migrator
 *
 * Migrates legacy projects to onto_projects with minimal properties.
 * Templates have been removed (Dec 2025) - uses fixed type_key only.
 *
 * Behavior:
 * - Fixed type_key: 'project.base'
 * - Derives facets heuristically from legacy data (context, scale, stage)
 * - No template lookup or property extraction
 * - Creates onto_project with name, description, state_key, props
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Json } from '@buildos/shared-types';
import type {
	LegacyProject,
	MigrationContext,
	EnhancedProjectMigrationResult
} from './enhanced-migration.types';
import type { Facets, ProjectState } from '$lib/types/onto';
import { ensureActorId } from '../ontology-projects.service';
import { upsertLegacyMapping } from '../legacy-mapping.service';

export class EnhancedProjectMigrator {
	constructor(private readonly client: TypedSupabaseClient) {}

	/**
	 * Migrate a project with fixed type_key and derived facets.
	 */
	async migrate(
		project: LegacyProject,
		context: MigrationContext
	): Promise<EnhancedProjectMigrationResult> {
		try {
			// Template discovery and property extraction removed
			// Projects are now migrated with minimal properties only
			const typeKey = 'project.base'; // Default type key

			if (context.dryRun) {
				return {
					status: 'pending_review',
					legacyProjectId: project.id,
					typeKeyUsed: typeKey,
					propsExtracted: {},
					propsConfidence: 0.5,
					message: 'Dry-run: migration preview ready (template-free classification)'
				};
			}

			// Create onto_project with minimal properties
			const actorId = await ensureActorId(this.client, project.user_id);
			const stateKey = this.mapStatusToState(project.status);
			const facets = this.deriveProjectFacets(project);

			const propsWithFacets = {
				facets: {
					context: facets.context ?? null,
					scale: facets.scale ?? null,
					stage: facets.stage ?? null
				}
			};

			const { data, error } = await this.client
				.from('onto_projects')
				.insert({
					name: project.name,
					description: project.description,
					type_key: typeKey,
					state_key: stateKey,
					props: propsWithFacets as Json,
					start_at: project.start_date,
					end_at: project.end_date,
					created_by: actorId,
					org_id: null
				})
				.select('id')
				.single();

			if (error || !data) {
				throw new Error(
					`Failed to create onto_project for ${project.id}: ${error?.message}`
				);
			}
			console.info(
				`[EnhancedProjectMigrator] Created onto_project ${data.id} for legacy ${project.id} (typeKey=${typeKey})`
			);

			// Update legacy mapping
			await upsertLegacyMapping(this.client, {
				legacyTable: 'projects',
				legacyId: project.id,
				ontoTable: 'onto_projects',
				ontoId: data.id,
				record: project,
				metadata: {
					run_id: context.runId,
					batch_id: context.batchId,
					type_key_used: typeKey,
					props_confidence: 0.5,
					enhanced_mode: false // Template features removed
				}
			});
			console.info(
				`[EnhancedProjectMigrator] Legacy mapping recorded for ${project.id} -> ${data.id} (run=${context.runId})`
			);

			return {
				status: 'completed',
				legacyProjectId: project.id,
				ontoProjectId: data.id,
				typeKeyUsed: typeKey,
				propsExtracted: propsWithFacets,
				propsConfidence: 0.5,
				message: 'Project migrated successfully (template-free classification)'
			};
		} catch (error) {
			console.error('[EnhancedProjectMigrator] Migration failed:', error);
			return {
				status: 'failed',
				legacyProjectId: project.id,
				message: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				errors: [error instanceof Error ? error.message : 'Unknown error']
			};
		}
	}

	// ============================================
	// PRIVATE HELPER METHODS
	// ============================================

	private deriveProjectFacets(project: LegacyProject): Facets {
		const facets: Facets = {};

		// Context
		const contextText = (project.context ?? '').toLowerCase();
		if (contextText.includes('client')) {
			facets.context = 'client';
		} else if (contextText.includes('work') || contextText.includes('commercial')) {
			facets.context = 'commercial';
		} else if (contextText.includes('startup')) {
			facets.context = 'startup';
		} else if (contextText.includes('academic') || contextText.includes('research')) {
			facets.context = 'academic';
		} else {
			facets.context = 'personal';
		}

		// Scale (estimate from description length + tags)
		const descLength = (project.description ?? '').length;
		const tagCount = (project.tags ?? []).length;
		const complexity = descLength + tagCount * 50;

		if (complexity > 1000) facets.scale = 'large';
		else if (complexity > 500) facets.scale = 'medium';
		else if (complexity > 200) facets.scale = 'small';
		else facets.scale = 'micro';

		// Stage
		switch (project.status) {
			case 'completed':
				facets.stage = 'complete';
				break;
			case 'active':
				facets.stage = 'execution';
				break;
			case 'planning':
				facets.stage = 'planning';
				break;
			default:
				facets.stage = 'discovery';
				break;
		}

		return facets;
	}

	private mapStatusToState(status: LegacyProject['status']): ProjectState {
		switch (status) {
			case 'active':
				return 'active';
			case 'completed':
				return 'completed';
			case 'planning':
				return 'planning';
			case 'execution':
				return 'active';
			case 'archived':
				return 'cancelled';
			case 'cancelled':
				return 'cancelled';
			case 'complete':
				return 'completed';
			default:
				return 'planning';
		}
	}
}
