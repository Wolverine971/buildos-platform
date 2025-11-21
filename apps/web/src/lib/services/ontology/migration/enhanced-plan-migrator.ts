// apps/web/src/lib/services/ontology/migration/enhanced-plan-migrator.ts
/**
 * Enhanced Plan Migrator
 *
 * Migrates phases to plans using intelligent template discovery and property extraction.
 * Replaces hardcoded 'plan.project_phase' with dynamic template selection.
 *
 * Key improvements over legacy migration:
 * - Uses TemplateDiscoveryEngine to discover appropriate plan templates
 * - Uses PropertyExtractorEngine for intelligent property extraction
 * - Supports diverse plan types (not just phase-based execution plans)
 * - Validates properties against template schema
 * - Context-aware plan type selection based on phase characteristics
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Json } from '@buildos/shared-types';
import type {
	LegacyPhase,
	MigrationContext,
	EnhancedPlanMigrationResult
} from './enhanced-migration.types';
import type { Facets } from '$lib/types/onto';
import { TemplateDiscoveryEngine } from './template-discovery-engine';
import { PropertyExtractorEngine } from './property-extractor-engine';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { upsertLegacyMapping } from '../legacy-mapping.service';
import { resolveTemplateWithClient } from '../template-resolver.service';

const TEMPLATE_MATCH_THRESHOLD = 0.7; // 70% match required

export class EnhancedPlanMigrator {
	private readonly discoveryEngine: TemplateDiscoveryEngine;
	private readonly extractorEngine: PropertyExtractorEngine;

	constructor(
		private readonly client: TypedSupabaseClient,
		private readonly llm: SmartLLMService
	) {
		this.discoveryEngine = new TemplateDiscoveryEngine(client, llm);
		this.extractorEngine = new PropertyExtractorEngine(llm);
	}

	/**
	 * Migrate a phase to plan using enhanced template discovery and property extraction
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
			// 1. Template Discovery
			const narrative = this.buildPhaseNarrative(phase, projectContext);
			const realm = this.inferRealm(phase);

			const templates = await this.discoveryEngine.listTemplates({
				scope: 'plan',
				realm,
				context: narrative,
				facets: projectContext.projectFacets,
				limit: 15
			});

			// Check for 70% match threshold
			const bestMatch = templates.find((t) => t.score >= TEMPLATE_MATCH_THRESHOLD);
			let templateResult: any;

			if (bestMatch) {
				// Use existing template
				templateResult = {
					template: bestMatch.template,
					created: false,
					suggestion: null
				};
			} else {
				// Suggest new template
				const suggestion = await this.discoveryEngine.suggestTemplate({
					scope: 'plan',
					narrative,
					existingTemplates: templates,
					userId: context.initiatedBy
				});

				if (context.dryRun) {
					return {
						status: 'pending_review',
						legacyPhaseId: phase.id,
						message: 'Plan template suggestion created for review (dry-run mode)'
					};
				}

				// Create template
				const ensureResult = await this.discoveryEngine.ensureTemplate({
					typeKey: suggestion.typeKey,
					suggestion,
					allowCreate: true,
					userId: context.initiatedBy
				});

				templateResult = ensureResult;
			}

			// 2. Resolve template with inheritance
			const resolvedTemplate = await resolveTemplateWithClient(
				this.client,
				templateResult.template.type_key,
				'plan'
			);

			if (!resolvedTemplate) {
				throw new Error(`Failed to resolve template ${templateResult.template.type_key}`);
			}

			// 3. Property Extraction
			const propResult = await this.extractorEngine.extractProperties({
				template: resolvedTemplate,
				legacyData: phase,
				context,
				userId: context.initiatedBy
			});

			// 4. Validation
			const validation = await this.extractorEngine.validateProperties(
				propResult.props,
				resolvedTemplate.schema
			);

			if (!validation.valid) {
				return {
					status: 'validation_failed',
					legacyPhaseId: phase.id,
					message: `Property validation failed: ${validation.errors.join(', ')}`
				};
			}

			// 5. Merge with defaults
			const finalProps = await this.extractorEngine.mergeWithDefaults(
				resolvedTemplate.default_props ?? {},
				propResult.props
			);

			// 6. If dry-run, return preview
			if (context.dryRun) {
				return {
					status: 'pending_review',
					legacyPhaseId: phase.id,
					templateUsed: templateResult.template.type_key,
					templateCreated: templateResult.created,
					message: 'Dry-run: plan migration preview ready'
				};
			}

			// 7. Create onto_plan
			const stateKey = this.determinePhaseState(phase);
			const facets = propResult.facets ?? {};

			const { data, error } = await this.client
				.from('onto_plans')
				.insert({
					name: phase.name,
					project_id: projectContext.ontoProjectId,
					type_key: templateResult.template.type_key,
					state_key: stateKey,
					props: finalProps as Json,
					facet_context: facets.context ?? projectContext.projectFacets?.context ?? null,
					facet_scale: facets.scale ?? projectContext.projectFacets?.scale ?? null,
					facet_stage: facets.stage ?? projectContext.projectFacets?.stage ?? null,
					start_at: phase.start_date,
					end_at: phase.end_date,
					created_by: projectContext.actorId
				})
				.select('id')
				.single();

			if (error || !data) {
				throw new Error(`Failed to create onto_plan for ${phase.id}: ${error?.message}`);
			}

			// 8. Update legacy mapping
			await upsertLegacyMapping(this.client, {
				legacyTable: 'phases',
				legacyId: phase.id,
				ontoTable: 'onto_plans',
				ontoId: data.id,
				record: phase,
				metadata: {
					run_id: context.runId,
					batch_id: context.batchId,
					template_used: templateResult.template.type_key,
					template_created: templateResult.created,
					props_confidence: propResult.confidence,
					enhanced_mode: true
				}
			});

			return {
				status: 'completed',
				legacyPhaseId: phase.id,
				ontoPlanId: data.id,
				templateUsed: templateResult.template.type_key,
				templateCreated: templateResult.created,
				message: 'Plan migrated successfully with enhanced mode'
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

	/**
	 * Clear template discovery cache
	 */
	clearCache(): void {
		this.discoveryEngine.clearCache();
	}

	// ============================================
	// PRIVATE HELPER METHODS
	// ============================================

	private buildPhaseNarrative(
		phase: LegacyPhase,
		projectContext: { projectFacets?: Facets }
	): string {
		const segments: string[] = [
			`Phase Name: ${phase.name}`,
			`Order: ${phase.order}`,
			phase.description ? `Description:\n${phase.description}` : '',
			phase.start_date ? `Start Date: ${phase.start_date}` : '',
			phase.end_date ? `End Date: ${phase.end_date}` : '',
			phase.scheduling_method ? `Scheduling Method: ${phase.scheduling_method}` : ''
		];

		// Add project context if available
		if (projectContext.projectFacets) {
			const facets = projectContext.projectFacets;
			const facetInfo = [
				facets.context ? `Project Context: ${facets.context}` : '',
				facets.scale ? `Project Scale: ${facets.scale}` : '',
				facets.stage ? `Project Stage: ${facets.stage}` : ''
			].filter(Boolean);

			if (facetInfo.length > 0) {
				segments.push(`\nProject Info:\n${facetInfo.join('\n')}`);
			}
		}

		return segments.filter(Boolean).join('\n\n');
	}

	private inferRealm(phase: LegacyPhase): string | undefined {
		const allText = [phase.name, phase.description ?? ''].join(' ').toLowerCase();

		// Simple heuristics based on phase name/description
		if (
			allText.includes('develop') ||
			allText.includes('code') ||
			allText.includes('implement')
		) {
			return 'developer';
		}

		if (
			allText.includes('design') ||
			allText.includes('mockup') ||
			allText.includes('prototype')
		) {
			return 'designer';
		}

		if (
			allText.includes('research') ||
			allText.includes('analysis') ||
			allText.includes('discovery')
		) {
			return 'research';
		}

		if (
			allText.includes('launch') ||
			allText.includes('release') ||
			allText.includes('deploy')
		) {
			return 'execution';
		}

		if (
			allText.includes('plan') ||
			allText.includes('strategy') ||
			allText.includes('roadmap')
		) {
			return 'planning';
		}

		if (
			allText.includes('market') ||
			allText.includes('promote') ||
			allText.includes('campaign')
		) {
			return 'marketing';
		}

		return undefined;
	}

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
