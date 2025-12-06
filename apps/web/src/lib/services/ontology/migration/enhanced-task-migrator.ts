// apps/web/src/lib/services/ontology/migration/enhanced-task-migrator.ts
/**
 * Enhanced Task Migrator
 *
 * Migrates tasks using intelligent template discovery and property extraction.
 * Replaces hardcoded 3-type classification with dynamic template selection.
 *
 * Key improvements over legacy migration:
 * - Uses FindOrCreateTemplateService (unified template discovery + creation)
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
import {
	FindOrCreateTemplateService,
	type FindOrCreateResult
} from '../find-or-create-template.service';
import { PropertyExtractorEngine } from './property-extractor-engine';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { upsertLegacyMapping } from '../legacy-mapping.service';

const TEMPLATE_MATCH_THRESHOLD = 0.7; // 70% match required

export class EnhancedTaskMigrator {
	private readonly templateService: FindOrCreateTemplateService;
	private readonly extractorEngine: PropertyExtractorEngine;

	constructor(
		private readonly client: TypedSupabaseClient,
		private readonly llm: SmartLLMService
	) {
		this.templateService = new FindOrCreateTemplateService(client, llm);
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
			// 1. Template Discovery + Creation (unified via FindOrCreateTemplateService)
			const narrative = this.buildTaskNarrative(task);
			const realm = this.inferRealm(task);

			let templateResult: FindOrCreateResult;
			try {
				templateResult = await this.templateService.findOrCreate({
					scope: 'task',
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
						legacyTaskId: task.id,
						message: `Task template suggestion created for review (dry-run mode): ${error instanceof Error ? error.message : 'Unknown error'}`
					};
				}
				throw error;
			}

			// If dry-run and a suggestion was generated (but not created)
			if (context.dryRun && templateResult.suggestion && !templateResult.created) {
				return {
					status: 'pending_review',
					legacyTaskId: task.id,
					message: 'Task template suggestion created for review (dry-run mode)'
				};
			}

			// 2. Use resolved template (already resolved by findOrCreate)
			const resolvedTemplate = templateResult.resolvedTemplate;

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
			// Note: LegacyTask uses start_date, not due_date
			const dueAt = task.start_date ?? task.completed_at ?? null;
			const facetScale = propResult.facets?.scale ?? this.inferScale(task);

			// Include description, type_key, and facets in props (facet_scale is a GENERATED column)
			const propsWithMetadata = {
				...(finalProps as Record<string, unknown>),
				description: task.description ?? null,
				type_key: templateResult.template.type_key,
				facets: { scale: facetScale }
			};

			const { data, error } = await this.client
				.from('onto_tasks')
				.insert({
					title: task.title,
					project_id: projectContext.ontoProjectId,
					type_key: templateResult.template.type_key,
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

			// 7a. Create plan relationship edges if plan exists
			if (projectContext.ontoPlanId) {
				await this.client.from('onto_edges').insert([
					{
						src_id: data.id,
						src_kind: 'task',
						dst_id: projectContext.ontoPlanId,
						dst_kind: 'plan',
						rel: 'belongs_to_plan'
					},
					{
						src_id: projectContext.ontoPlanId,
						src_kind: 'plan',
						dst_id: data.id,
						dst_kind: 'task',
						rel: 'has_task'
					}
				]);
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

	// Note: Template caching is handled internally by FindOrCreateTemplateService
	// No explicit cache clearing needed

	// ============================================
	// PRIVATE HELPER METHODS
	// ============================================

	private buildTaskNarrative(task: LegacyTask): string {
		const segments: string[] = [
			`Task Title: ${task.title}`,
			`Status: ${task.status}`,
			task.description ? `Description:\n${task.description}` : '',
			task.notes ? `Notes:\n${task.notes}` : '',
			task.start_date ? `Due Date: ${task.start_date}` : '',
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
