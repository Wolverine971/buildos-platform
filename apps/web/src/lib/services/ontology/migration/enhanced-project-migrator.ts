// apps/web/src/lib/services/ontology/migration/enhanced-project-migrator.ts
/**
 * Enhanced Project Migrator
 *
 * Migration service aligned with agentic chat template discovery and property extraction patterns.
 *
 * Key improvements over legacy migration:
 * - Uses FindOrCreateTemplateService (unified template discovery + creation)
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
import {
	FindOrCreateTemplateService,
	type FindOrCreateResult
} from '../find-or-create-template.service';
import { PropertyExtractorEngine } from './property-extractor-engine';
import { SchemaAutoRepairService } from './schema-auto-repair.service';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { ensureActorId } from '../ontology-projects.service';
import { upsertLegacyMapping } from '../legacy-mapping.service';

const TEMPLATE_MATCH_THRESHOLD = 0.7; // 70% match required

export class EnhancedProjectMigrator {
	private readonly templateService: FindOrCreateTemplateService;
	private readonly extractorEngine: PropertyExtractorEngine;
	private readonly schemaRepairService: SchemaAutoRepairService;

	constructor(
		private readonly client: TypedSupabaseClient,
		private readonly llm: SmartLLMService
	) {
		this.templateService = new FindOrCreateTemplateService(client, llm);
		this.extractorEngine = new PropertyExtractorEngine(llm);
		this.schemaRepairService = new SchemaAutoRepairService(client, llm);
	}

	/**
	 * Migrate a project using enhanced template discovery and property extraction
	 */
	async migrate(
		project: LegacyProject,
		context: MigrationContext
	): Promise<EnhancedProjectMigrationResult> {
		try {
			// 1. Template Discovery + Creation (unified via FindOrCreateTemplateService)
			const narrative = this.buildProjectNarrative(project);
			const realm = this.inferRealm(project);

			let templateResult: FindOrCreateResult;
			try {
				templateResult = await this.templateService.findOrCreate({
					scope: 'project',
					context: narrative,
					userId: context.initiatedBy,
					realm,
					matchThreshold: TEMPLATE_MATCH_THRESHOLD,
					allowCreate: !context.dryRun
				});
			} catch (error) {
				// If creation is disabled and no template found, return pending_review
				if (context.dryRun) {
					return {
						status: 'pending_review',
						legacyProjectId: project.id,
						templateSuggestion: undefined,
						message: `No matching template found (dry-run mode): ${error instanceof Error ? error.message : 'Unknown error'}`
					};
				}
				throw error;
			}

			// If dry-run and a suggestion was generated (but not created)
			if (context.dryRun && templateResult.suggestion && !templateResult.created) {
				return {
					status: 'pending_review',
					legacyProjectId: project.id,
					templateSuggestion: {
						typeKey: templateResult.suggestion.typeKey,
						name: templateResult.suggestion.name,
						description: templateResult.suggestion.description,
						parentTypeKey: templateResult.suggestion.parentTypeKey ?? null,
						matchScore: templateResult.suggestion.matchScore,
						rationale: templateResult.suggestion.rationale,
						properties: templateResult.suggestion.properties,
						workflowStates: templateResult.suggestion.workflowStates
					},
					message: 'Template suggestion created for review (dry-run mode)'
				};
			}

			// 2. Use resolved template (already resolved by findOrCreate)
			const resolvedTemplate = templateResult.resolvedTemplate;

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

			// 4. Merge with defaults FIRST (before validation)
			// This ensures template defaults fill in missing required fields
			// before validation rejects them. The user-extracted props override defaults.
			const mergedProps = await this.extractorEngine.mergeWithDefaults(
				resolvedTemplate.default_props ?? {},
				propResult.props
			);

			// 5. Fill null required fields with schema defaults if available
			// This handles cases where extraction returns null for required fields
			// that have default values defined in the schema
			const finalProps = this.fillSchemaDefaults(mergedProps, resolvedTemplate.schema);

			// 6. Validation (now runs on merged props with defaults applied)
			let validation = await this.extractorEngine.validateProperties(
				finalProps,
				resolvedTemplate.schema
			);

			// 6b. If validation fails, attempt auto-repair of schema/default mismatches
			let repairedProps = finalProps;
			if (!validation.valid) {
				console.warn(
					`[EnhancedProjectMigrator] Initial validation failed for ${project.id}:`,
					'\n  Template:',
					templateResult.template.type_key,
					'\n  Errors:',
					validation.errors,
					'\n  Attempting auto-repair...'
				);

				// Attempt LLM-powered schema auto-repair
				const repairResult = await this.schemaRepairService.attemptRepair({
					templateId: templateResult.template.id,
					typeKey: templateResult.template.type_key,
					schema: resolvedTemplate.schema,
					defaultProps: resolvedTemplate.default_props ?? {},
					extractedProps: finalProps,
					validationErrors: validation.errors,
					userId: context.initiatedBy,
					persistChanges: !context.dryRun // Only persist repairs in live mode
				});

				if (repairResult.success && repairResult.repairs.length > 0) {
					console.info(
						`[EnhancedProjectMigrator] Schema auto-repair successful for ${project.id}:`,
						'\n  Repairs:',
						repairResult.repairs.map((r) => `${r.field}: ${JSON.stringify(r.originalDefault)} -> ${JSON.stringify(r.newDefault)} (${r.rationale})`)
					);

					// Re-apply repaired defaults to props
					repairedProps = this.schemaRepairService.repairExtractedProps(
						finalProps,
						repairResult.repairedSchema
					);

					// Re-validate with repaired schema
					validation = await this.extractorEngine.validateProperties(
						repairedProps,
						repairResult.repairedSchema
					);

					if (validation.valid) {
						console.info(
							`[EnhancedProjectMigrator] Validation passed after auto-repair for ${project.id}`
						);
					}
				}
			}

			if (!validation.valid) {
				console.warn(
					`[EnhancedProjectMigrator] Validation failed for ${project.id} (after repair attempt):`,
					'\n  Template:',
					templateResult.template.type_key,
					'\n  Errors:',
					validation.errors,
					'\n  Warnings:',
					validation.warnings,
					'\n  Props extracted:',
					JSON.stringify(propResult.props, null, 2),
					'\n  Props after defaults:',
					JSON.stringify(repairedProps, null, 2),
					'\n  Schema required:',
					resolvedTemplate.schema?.required ?? [],
					'\n  Schema properties:',
					Object.keys(resolvedTemplate.schema?.properties ?? {})
				);
				return {
					status: 'validation_failed',
					legacyProjectId: project.id,
					message: `Property validation failed: ${validation.errors.join(', ')}`,
					errors: validation.errors
				};
			}

			// 7. If dry-run, return preview
			if (context.dryRun) {
				return {
					status: 'pending_review',
					legacyProjectId: project.id,
					templateUsed: templateResult.template.type_key,
					templateCreated: templateResult.created,
					propsExtracted: repairedProps,
					propsConfidence: propResult.confidence,
					message: 'Dry-run: migration preview ready'
				};
			}

			// 8. Create onto_project
			const actorId = await ensureActorId(this.client, project.user_id);
			const stateKey = this.mapStatusToState(project.status);
			const facets = propResult.facets ?? this.deriveProjectFacets(project);

			// Build props with facets (facet_* columns are GENERATED from props->'facets')
			const propsWithFacets = {
				...(repairedProps as Record<string, unknown>),
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
					type_key: templateResult.template.type_key,
					state_key: stateKey,
					also_types: [],
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
				`[EnhancedProjectMigrator] Created onto_project ${data.id} for legacy ${project.id} (typeKey=${templateResult.template.type_key})`
			);

			// 9. Update legacy mapping
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
			console.info(
				`[EnhancedProjectMigrator] Legacy mapping recorded for ${project.id} -> ${data.id} (run=${context.runId})`
			);

			return {
				status: 'completed',
				legacyProjectId: project.id,
				ontoProjectId: data.id,
				templateUsed: templateResult.template.type_key,
				templateCreated: templateResult.created,
				propsExtracted: repairedProps,
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

	// Note: Template caching is handled internally by FindOrCreateTemplateService
	// No explicit cache clearing needed

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

	/**
	 * Fill null values for required fields using schema-defined defaults.
	 *
	 * This handles the case where:
	 * 1. A field is marked as required in the schema
	 * 2. The LLM extraction returned null (no value found in legacy data)
	 * 3. The schema defines a default value for the field
	 *
	 * In this case, we use the schema default to satisfy the required constraint.
	 * This allows migration to succeed when legacy data is incomplete but the
	 * template provides sensible defaults.
	 *
	 * For fields without a schema default, we use type-appropriate fallbacks:
	 * - number/integer: 0
	 * - string: "" (empty string)
	 * - boolean: false
	 * - array: []
	 * - object: {}
	 */
	private fillSchemaDefaults(
		props: Record<string, unknown>,
		schema: any
	): Record<string, unknown> {
		if (!schema?.properties) {
			return props;
		}

		const result = { ...props };
		const requiredFields: string[] = Array.isArray(schema.required) ? schema.required : [];
		const properties = schema.properties ?? {};

		for (const field of requiredFields) {
			const fieldValue = result[field];
			const fieldSchema = properties[field];

			// Skip if field already has a non-null value
			if (fieldValue !== null && fieldValue !== undefined) {
				continue;
			}

			// Try schema default first
			if (fieldSchema?.default !== undefined) {
				result[field] = fieldSchema.default;
				console.info(
					`[EnhancedProjectMigrator] Filled required field '${field}' with schema default: ${JSON.stringify(fieldSchema.default)}`
				);
				continue;
			}

			// Fallback to type-appropriate defaults for migration compatibility
			const fieldType = fieldSchema?.type;
			const fallbackDefault = this.getTypeFallbackDefault(fieldType);

			if (fallbackDefault !== undefined) {
				result[field] = fallbackDefault;
				console.warn(
					`[EnhancedProjectMigrator] Filled required field '${field}' with type fallback (${fieldType}): ${JSON.stringify(fallbackDefault)}. ` +
						`Consider adding a schema default for this field in the template.`
				);
			}
		}

		return result;
	}

	/**
	 * Get a type-appropriate fallback default value for migration compatibility.
	 * Used when a required field has no schema default and the extracted value is null.
	 */
	private getTypeFallbackDefault(fieldType: string | undefined): unknown {
		switch (fieldType) {
			case 'number':
			case 'integer':
				return 0;
			case 'string':
				return '';
			case 'boolean':
				return false;
			case 'array':
				return [];
			case 'object':
				return {};
			default:
				// Unknown type - don't provide a fallback
				return undefined;
		}
	}
}
