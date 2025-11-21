// apps/web/src/lib/services/ontology/migration/enhanced-task-migrator.ts
/**
 * Enhanced Task Migrator
 *
 * Migrates tasks using intelligent template discovery and property extraction.
 * Replaces hardcoded 3-type classification with dynamic template selection.
 *
 * Key improvements over legacy migration:
 * - Uses TemplateDiscoveryEngine for task template selection
 * - Uses PropertyExtractorEngine for intelligent property extraction
 * - Supports diverse task types beyond (simple, deep_work, recurring)
 * - Validates properties against template schema
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Json } from '@buildos/shared-types';
import type {
	LegacyTask,
	MigrationContext,
	EnhancedTaskMigrationResult
} from './enhanced-migration.types';
import { TemplateDiscoveryEngine } from './template-discovery-engine';
import { PropertyExtractorEngine } from './property-extractor-engine';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { upsertLegacyMapping } from '../legacy-mapping.service';
import { resolveTemplateWithClient } from '../template-resolver.service';

const TEMPLATE_MATCH_THRESHOLD = 0.7; // 70% match required

export class EnhancedTaskMigrator {
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
	 * Migrate a task using enhanced template discovery and property extraction
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
			// 1. Template Discovery
			const narrative = this.buildTaskNarrative(task);
			const realm = this.inferRealm(task);

			const templates = await this.discoveryEngine.listTemplates({
				scope: 'task',
				realm,
				context: narrative,
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
					scope: 'task',
					narrative,
					existingTemplates: templates,
					userId: context.initiatedBy
				});

				if (context.dryRun) {
					return {
						status: 'pending_review',
						legacyTaskId: task.id,
						message: 'Task template suggestion created for review (dry-run mode)'
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
				'task'
			);

			if (!resolvedTemplate) {
				throw new Error(`Failed to resolve template ${templateResult.template.type_key}`);
			}

			// 3. Property Extraction
			const propResult = await this.extractorEngine.extractProperties({
				template: resolvedTemplate,
				legacyData: task,
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
					legacyTaskId: task.id,
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
					legacyTaskId: task.id,
					templateUsed: templateResult.template.type_key,
					templateCreated: templateResult.created,
					message: 'Dry-run: task migration preview ready'
				};
			}

			// 7. Create onto_task
			const stateKey = this.mapStatusToState(task.status);
			const priority = this.mapPriority(task.priority);
			const dueAt = task.due_date ?? null;
			const facetScale = propResult.facets?.scale ?? this.inferScale(task);

			const { data, error } = await this.client
				.from('onto_tasks')
				.insert({
					title: task.title,
					description: task.description,
					project_id: projectContext.ontoProjectId,
					plan_id: projectContext.ontoPlanId ?? null,
					type_key: templateResult.template.type_key,
					state_key: stateKey,
					priority,
					due_at: dueAt,
					facet_scale: facetScale,
					props: finalProps as Json,
					created_by: projectContext.actorId
				})
				.select('id')
				.single();

			if (error || !data) {
				throw new Error(`Failed to create onto_task for ${task.id}: ${error?.message}`);
			}

			// 8. Update legacy mapping
			await upsertLegacyMapping(this.client, {
				legacyTable: 'tasks',
				legacyId: task.id,
				ontoTable: 'onto_tasks',
				ontoId: data.id,
				record: task,
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
				legacyTaskId: task.id,
				ontoTaskId: data.id,
				templateUsed: templateResult.template.type_key,
				templateCreated: templateResult.created,
				message: 'Task migrated successfully with enhanced mode'
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

	/**
	 * Clear template discovery cache
	 */
	clearCache(): void {
		this.discoveryEngine.clearCache();
	}

	// ============================================
	// PRIVATE HELPER METHODS
	// ============================================

	private buildTaskNarrative(task: LegacyTask): string {
		const segments: string[] = [
			`Task Title: ${task.title}`,
			`Status: ${task.status}`,
			task.description ? `Description:\n${task.description}` : '',
			task.notes ? `Notes:\n${task.notes}` : '',
			task.due_date ? `Due Date: ${task.due_date}` : '',
			task.priority ? `Priority: ${task.priority}` : ''
		];

		return segments.filter(Boolean).join('\n\n');
	}

	private inferRealm(task: LegacyTask): string | undefined {
		const allText = [task.title, task.description ?? '', task.notes ?? '']
			.join(' ')
			.toLowerCase();

		// Simple heuristics
		if (
			allText.includes('code') ||
			allText.includes('develop') ||
			allText.includes('implement')
		) {
			return 'developer';
		}

		if (allText.includes('write') || allText.includes('draft') || allText.includes('article')) {
			return 'writer';
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
			allText.includes('analyze') ||
			allText.includes('study')
		) {
			return 'research';
		}

		if (
			allText.includes('marketing') ||
			allText.includes('campaign') ||
			allText.includes('promote')
		) {
			return 'marketing';
		}

		return undefined;
	}

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
