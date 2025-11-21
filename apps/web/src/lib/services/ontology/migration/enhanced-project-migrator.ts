// apps/web/src/lib/services/ontology/migration/enhanced-project-migrator.ts
/**
 * Enhanced Project Migrator
 *
 * Migration service aligned with agentic chat template discovery and property extraction patterns.
 *
 * Key improvements over legacy migration:
 * - Uses TemplateDiscoveryEngine (list + score + suggest pattern from agentic chat)
 * - Uses PropertyExtractorEngine (intelligent type inference, detailed examples)
 * - 70% match threshold for template selection
 * - Validation pipeline for extracted properties
 * - Deep merging with template defaults
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Json } from '@buildos/shared-types';
import type {
	LegacyProject,
	MigrationContext,
	EnhancedProjectMigrationResult
} from './enhanced-migration.types';
import type { Facets } from '$lib/types/onto';
import { TemplateDiscoveryEngine } from './template-discovery-engine';
import { PropertyExtractorEngine } from './property-extractor-engine';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { ensureActorId } from '../ontology-projects.service';
import { upsertLegacyMapping } from '../legacy-mapping.service';
import { resolveTemplateWithClient } from '../template-resolver.service';

const TEMPLATE_MATCH_THRESHOLD = 0.7; // 70% match required

export class EnhancedProjectMigrator {
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
	 * Migrate a project using enhanced template discovery and property extraction
	 */
	async migrate(
		project: LegacyProject,
		context: MigrationContext
	): Promise<EnhancedProjectMigrationResult> {
		try {
			// 1. Template Discovery (agentic-chat-aligned)
			const narrative = this.buildProjectNarrative(project);
			const realm = this.inferRealm(project);

			const templates = await this.discoveryEngine.listTemplates({
				scope: 'project',
				realm,
				context: narrative,
				limit: 20
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
					scope: 'project',
					narrative,
					existingTemplates: templates,
					userId: context.initiatedBy
				});

				if (context.dryRun) {
					// Dry-run: return suggestion without creating
					return {
						status: 'pending_review',
						legacyProjectId: project.id,
						templateSuggestion: suggestion,
						message: 'Template suggestion created for review (dry-run mode)'
					};
				}

				// Create template (allowCreate = true for non-dry-run)
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
				'project'
			);

			if (!resolvedTemplate) {
				throw new Error(`Failed to resolve template ${templateResult.template.type_key}`);
			}

			// 3. Property Extraction (agentic-chat-aligned)
			const propResult = await this.extractorEngine.extractProperties({
				template: resolvedTemplate,
				legacyData: project,
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
					legacyProjectId: project.id,
					message: `Property validation failed: ${validation.errors.join(', ')}`,
					errors: validation.errors
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
					legacyProjectId: project.id,
					templateUsed: templateResult.template.type_key,
					templateCreated: templateResult.created,
					propsExtracted: finalProps,
					propsConfidence: propResult.confidence,
					message: 'Dry-run: migration preview ready'
				};
			}

			// 7. Create onto_project
			const actorId = await ensureActorId(this.client, project.user_id);
			const stateKey = this.mapStatusToState(project.status);
			const facets = propResult.facets ?? this.deriveProjectFacets(project);

			const { data, error } = await this.client
				.from('onto_projects')
				.insert({
					name: project.name,
					description: project.description,
					type_key: templateResult.template.type_key,
					state_key: stateKey,
					also_types: [],
					props: finalProps as Json,
					start_at: project.start_date,
					end_at: project.end_date,
					created_by: actorId,
					org_id: null,
					facet_context: facets.context ?? null,
					facet_scale: facets.scale ?? null,
					facet_stage: facets.stage ?? null
				})
				.select('id')
				.single();

			if (error || !data) {
				throw new Error(
					`Failed to create onto_project for ${project.id}: ${error?.message}`
				);
			}

			// 8. Update legacy mapping
			await upsertLegacyMapping(this.client, {
				legacyTable: 'projects',
				legacyId: project.id,
				ontoTable: 'onto_projects',
				ontoId: data.id,
				record: project,
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
				legacyProjectId: project.id,
				ontoProjectId: data.id,
				templateUsed: templateResult.template.type_key,
				templateCreated: templateResult.created,
				propsExtracted: finalProps,
				propsConfidence: propResult.confidence,
				message: 'Project migrated successfully with enhanced mode'
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

	/**
	 * Clear template discovery cache
	 * Useful between migration runs or when template catalog changes
	 */
	clearCache(): void {
		this.discoveryEngine.clearCache();
	}

	// ============================================
	// PRIVATE HELPER METHODS
	// ============================================

	private buildProjectNarrative(project: LegacyProject): string {
		const coreDimensionEntries = [
			['Goals Momentum', project.core_goals_momentum],
			['Harmony Integration', project.core_harmony_integration],
			['Integrity Ideals', project.core_integrity_ideals],
			['Meaning Identity', project.core_meaning_identity],
			['Opportunity Freedom', project.core_opportunity_freedom],
			['People Bonds', project.core_people_bonds],
			['Power Resources', project.core_power_resources],
			['Reality Understanding', project.core_reality_understanding],
			['Trust Safeguards', project.core_trust_safeguards]
		]
			.filter(([, value]) => typeof value === 'string' && value.length > 0)
			.map(([label, value]) => `- ${label}: ${value}`)
			.join('\n');

		const segments: string[] = [
			`Project Name: ${project.name}`,
			`Status: ${project.status}`,
			project.description ? `Description:\n${project.description}` : '',
			project.context ? `Context:\n${project.context}` : '',
			project.tags?.length ? `Tags: ${project.tags.join(', ')}` : '',
			project.executive_summary ? `Executive Summary:\n${project.executive_summary}` : '',
			coreDimensionEntries ? `Core Values:\n${coreDimensionEntries}` : ''
		];

		return segments.filter(Boolean).join('\n\n');
	}

	private inferRealm(project: LegacyProject): string | undefined {
		// Simple heuristics to infer realm from tags/context
		const allText = [
			project.name,
			project.description ?? '',
			...(project.tags ?? []),
			project.context ?? ''
		]
			.join(' ')
			.toLowerCase();

		if (allText.includes('write') || allText.includes('book') || allText.includes('article')) {
			return 'writer';
		}

		if (allText.includes('code') || allText.includes('app') || allText.includes('software')) {
			return 'developer';
		}

		if (
			allText.includes('event') ||
			allText.includes('wedding') ||
			allText.includes('conference')
		) {
			return 'event';
		}

		if (
			allText.includes('research') ||
			allText.includes('study') ||
			allText.includes('experiment')
		) {
			return 'research';
		}

		if (
			allText.includes('client') ||
			allText.includes('business') ||
			allText.includes('startup')
		) {
			return 'business';
		}

		// No clear realm
		return undefined;
	}

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

	private mapStatusToState(status: LegacyProject['status']): string {
		switch (status) {
			case 'active':
				return 'execution';
			case 'completed':
				return 'complete';
			case 'planning':
				return 'planning';
			case 'archived':
				return 'archived';
			default:
				return 'discovery';
		}
	}
}
