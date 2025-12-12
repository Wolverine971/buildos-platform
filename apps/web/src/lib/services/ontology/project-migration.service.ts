// apps/web/src/lib/services/ontology/project-migration.service.ts
/**
 * Project Migration Service
 *
 * Handles migration of legacy projects to the ontology system.
 *
 * NOTE: As of December 2025, this service exclusively uses the EnhancedProjectMigrator
 * which integrates with FindOrCreateTemplateService for template operations.
 * The legacy migration path using ProjectTemplateInferenceService has been removed.
 *
 * @see /thoughts/shared/research/2025-12-10_migration-system-design.md
 *      For comprehensive system design documentation including architecture diagrams,
 *      data flow, component details, and error handling strategies.
 */
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database, Json } from '@buildos/shared-types';
import type { Facets } from '$lib/types/onto';
import { ensureActorId } from './ontology-projects.service';
import type {
	MigrationServiceContext,
	MigrationStatus,
	TemplateCreationPlan
} from './migration.types';
import { getLegacyMapping } from './legacy-mapping.service';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { EnhancedProjectMigrator } from './migration/enhanced-project-migrator';
import type { MigrationContext } from './migration/enhanced-migration.types';

export type LegacyProjectRow = Database['public']['Tables']['projects']['Row'];

export interface ProjectMigrationAnalysis {
	project: LegacyProjectRow;
	phaseCount: number;
	taskCount: number;
	calendarCount: number;
	existingOntoProjectId: string | null;
	calendarSyncEnabled: boolean;
}

export interface ProjectMigrationResult {
	legacyProjectId: string;
	ontoProjectId: string | null;
	typeKey: string;
	actorId: string;
	status: MigrationStatus;
	analysis: ProjectMigrationAnalysis;
	message: string;
	projectFacets: Facets;
	contextDocumentId: string | null;
	contextMarkdown: string | null;
	coreValues: Record<string, string | null>;
	template?: TemplateClassificationSummary | null;
	templateProps?: ProjectPropsLLMSummary | null;
}

export interface TemplateClassificationSummary {
	typeKey: string;
	templateId: string | null;
	realm: string | null;
	domain: string | null;
	deliverable: string | null;
	variant: string | null;
	confidence?: number | null;
	rationale?: string | null;
	matchLevel?: string | null;
	created: boolean;
	creationPlanned?: TemplateCreationPlan | null;
}

export interface ProjectPropsLLMSummary {
	props: Record<string, unknown> | null;
	facets?: Facets | null;
	confidence?: number | null;
	notes?: string | null;
}

const DEFAULT_PROJECT_TYPE = 'project.migration.generic';
const CONTEXT_DOCUMENT_TYPE = 'document.context.project';

export class ProjectMigrationService {
	private readonly enhancedMigrator: EnhancedProjectMigrator;

	constructor(
		private readonly client: TypedSupabaseClient,
		llmService: SmartLLMService
	) {
		this.enhancedMigrator = new EnhancedProjectMigrator(client, llmService);
	}

	async fetchCandidates(options: {
		projectIds?: string[];
		includeArchived?: boolean;
		limit?: number;
		offset?: number;
	}): Promise<LegacyProjectRow[]> {
		let query = this.client
			.from('projects')
			.select('*')
			.order('updated_at', { ascending: false });

		if (options.projectIds?.length) {
			query = query.in('id', options.projectIds);
		}

		if (!options.includeArchived) {
			query = query.neq('status', 'archived');
		}

		if (typeof options.limit === 'number') {
			query = query.limit(options.limit);
		}

		if (typeof options.offset === 'number') {
			query = query.range(options.offset, (options.offset ?? 0) + (options.limit ?? 100) - 1);
		}

		const { data, error } = await query;
		if (error) {
			throw new Error(
				`[ProjectMigration] Failed to fetch candidate projects: ${error.message}`
			);
		}

		return data ?? [];
	}

	async analyzeProjects(options: {
		projectIds?: string[];
		includeArchived?: boolean;
		limit?: number;
	}): Promise<ProjectMigrationAnalysis[]> {
		const projects = await this.fetchCandidates(options);
		return Promise.all(projects.map((project) => this.buildAnalysis(project)));
	}

	async migrateProject(
		project: LegacyProjectRow,
		context: MigrationServiceContext
	): Promise<ProjectMigrationResult> {
		// NOTE: As of December 2025, all migrations use the enhanced path
		// which integrates with FindOrCreateTemplateService.
		// The legacy migration flow has been removed.
		console.info(
			`[ProjectMigration] Start ${project.id} (dryRun=${context.dryRun}, run=${context.runId})`
		);

		return await this.migrateProjectEnhanced(project, context);
	}

	// NOTE: Legacy migration flow removed in December 2025 cleanup.
	// All migrations now use migrateProjectEnhanced which integrates with
	// FindOrCreateTemplateService. See FIND_OR_CREATE_TEMPLATE_SPEC.md.

	private async buildAnalysis(project: LegacyProjectRow): Promise<ProjectMigrationAnalysis> {
		const [phaseCount, taskCount, calendarCount, mapping] = await Promise.all([
			this.countPhases(project.id),
			this.countTasks(project.id),
			this.countCalendars(project.id),
			getLegacyMapping(this.client, 'projects', project.id)
		]);

		return {
			project,
			phaseCount,
			taskCount,
			calendarCount,
			existingOntoProjectId: mapping?.onto_id ?? null,
			calendarSyncEnabled: !!project.calendar_sync_enabled
		};
	}

	private async countPhases(projectId: string): Promise<number> {
		const { count, error } = await this.client
			.from('phases')
			.select('id', { head: true, count: 'exact' })
			.eq('project_id', projectId);

		if (error) {
			throw new Error(
				`[ProjectMigration] Failed to count phases for ${projectId}: ${error.message}`
			);
		}

		return count ?? 0;
	}

	private async countTasks(projectId: string): Promise<number> {
		const { count, error } = await this.client
			.from('tasks')
			.select('id', { head: true, count: 'exact' })
			.eq('project_id', projectId)
			.is('deleted_at', null);

		if (error) {
			throw new Error(
				`[ProjectMigration] Failed to count tasks for ${projectId}: ${error.message}`
			);
		}

		return count ?? 0;
	}

	private async countCalendars(projectId: string): Promise<number> {
		const { count, error } = await this.client
			.from('project_calendars')
			.select('id', { head: true, count: 'exact' })
			.eq('project_id', projectId);

		if (error) {
			throw new Error(
				`[ProjectMigration] Failed to count calendars for ${projectId}: ${error.message}`
			);
		}

		return count ?? 0;
	}

	private resolveProjectTypeKey(project: LegacyProjectRow): string {
		// Use domain-based naming: project.{domain}.{deliverable}[.{variant}]
		if (project.tags?.some((tag) => tag.toLowerCase().includes('write'))) {
			return 'project.writer.general';
		}

		if (project.tags?.some((tag) => tag.toLowerCase().includes('app'))) {
			return 'project.developer.app';
		}

		if (project.context?.toLowerCase().includes('client')) {
			return 'project.coach.client';
		}

		return DEFAULT_PROJECT_TYPE;
	}

	private deriveProjectFacets(
		project: LegacyProjectRow,
		analysis: ProjectMigrationAnalysis
	): Facets {
		const facets: Facets = {};

		if (project.context?.includes('client')) {
			facets.context = 'client';
		} else if (project.context?.includes('work')) {
			facets.context = 'commercial';
		} else {
			facets.context = 'personal';
		}

		if (analysis.taskCount > 50) facets.scale = 'epic';
		else if (analysis.taskCount > 20) facets.scale = 'large';
		else if (analysis.taskCount > 5) facets.scale = 'medium';
		else facets.scale = 'small';

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

	private buildProjectProps(
		project: LegacyProjectRow,
		facets: Facets,
		context: MigrationServiceContext,
		coreValues: Record<string, string | null>,
		template?: TemplateClassificationSummary | null,
		templateProps?: ProjectPropsLLMSummary | null
	): Json {
		const templateSummary = template
			? {
					...template,
					creationPlanned: template.creationPlanned ?? null
				}
			: null;

		return {
			legacy_project_id: project.id,
			legacy_slug: project.slug,
			legacy_status: project.status,
			tags: project.tags ?? [],
			executive_summary: project.executive_summary,
			context: project.context,
			core_values: coreValues,
			calendar: {
				color_id: project.calendar_color_id,
				settings: project.calendar_settings,
				sync_enabled: project.calendar_sync_enabled
			},
			source: project.source,
			source_metadata: project.source_metadata,
			migration: {
				run_id: context.runId,
				batch_id: context.batchId,
				dry_run: context.dryRun,
				migrated_at: context.now
			},
			facets,
			template_summary: templateSummary,
			template_fields: templateProps?.props ?? null,
			template_notes: templateProps?.notes ?? null,
			template_confidence: templateProps?.confidence ?? null,
			template_facets: templateProps?.facets ?? null,
			legacy_snapshot: {
				name: project.name,
				description: project.description,
				executive_summary: project.executive_summary,
				tags: project.tags ?? [],
				status: project.status
			}
		};
	}

	private extractCoreValues(project: LegacyProjectRow): Record<string, string | null> {
		return {
			core_goals_momentum: project.core_goals_momentum,
			core_harmony_integration: project.core_harmony_integration,
			core_integrity_ideals: project.core_integrity_ideals,
			core_meaning_identity: project.core_meaning_identity,
			core_opportunity_freedom: project.core_opportunity_freedom,
			core_people_bonds: project.core_people_bonds,
			core_power_resources: project.core_power_resources,
			core_reality_understanding: project.core_reality_understanding,
			core_trust_safeguards: project.core_trust_safeguards
		};
	}

	private async createContextDocument(params: {
		project: LegacyProjectRow;
		ontoProjectId: string;
		actorId: string;
		context: MigrationServiceContext;
		coreValues: Record<string, string | null>;
	}): Promise<{ documentId: string | null; contextMarkdown: string | null }> {
		const markdown = params.project.context?.trim();
		if (!markdown) {
			return { documentId: null, contextMarkdown: null };
		}

		if (params.context.dryRun) {
			return { documentId: null, contextMarkdown: markdown };
		}

		const { data, error } = await this.client
			.from('onto_documents')
			.insert({
				project_id: params.ontoProjectId,
				title: `${params.project.name} – Legacy Context`,
				type_key: CONTEXT_DOCUMENT_TYPE,
				state_key: 'published',
				props: {
					source: 'legacy_project_context',
					body_markdown: markdown,
					legacy_project_id: params.project.id,
					migration_run_id: params.context.runId,
					migrated_at: params.context.now,
					core_values: params.coreValues
				},
				created_by: params.actorId
			})
			.select('id')
			.single();

		if (error || !data) {
			console.error('[ProjectMigration] Failed to persist context document', error);
			return { documentId: null, contextMarkdown: markdown };
		}

		return { documentId: data.id, contextMarkdown: markdown };
	}

	private mapStatusToState(status: LegacyProjectRow['status']): string {
		switch (status) {
			case 'active':
				return 'execution';
			case 'completed':
				return 'complete';
			case 'planning':
				return 'planning';
			default:
				return 'discovery';
		}
	}

	/**
	 * Enhanced migration flow using new engines
	 * Bridges between EnhancedProjectMigrationResult and ProjectMigrationResult
	 */
	private async migrateProjectEnhanced(
		project: LegacyProjectRow,
		context: MigrationServiceContext
	): Promise<ProjectMigrationResult> {
		console.info(
			`[ProjectMigration][Enhanced] Start ${project.id} (dryRun=${context.dryRun}, run=${context.runId})`
		);
		// Build migration context for enhanced migrator
		const migrationContext: MigrationContext = {
			...context,
			enhancedMode: true,
			propsConfidenceThreshold: 0.6,
			cacheEnabled: true
		};

		// Run enhanced migration
		const enhancedResult = await this.enhancedMigrator.migrate(project, migrationContext);

		// Build analysis for result
		const analysis = await this.buildAnalysis(project);
		const actorId = enhancedResult.ontoProjectId
			? await ensureActorId(this.client, project.user_id)
			: '';
		const coreValues = this.extractCoreValues(project);
		const typeKey = enhancedResult.typeKeyUsed ?? this.resolveProjectTypeKey(project);

		console.info(
			`[ProjectMigration][Enhanced] Result for ${project.id}: status=${enhancedResult.status}, ontoProjectId=${enhancedResult.ontoProjectId ?? 'none'}, typeKey=${typeKey}` +
				(enhancedResult.errors?.length
					? ` | errors: ${enhancedResult.errors.join('; ')}`
					: '') +
				(enhancedResult.message ? ` | msg: ${enhancedResult.message}` : '')
		);

		// Map enhanced result to legacy result format
		return {
			legacyProjectId: project.id,
			ontoProjectId: enhancedResult.ontoProjectId ?? null,
			typeKey,
			actorId,
			status: this.mapEnhancedStatus(enhancedResult.status),
			analysis,
			message: enhancedResult.message,
			projectFacets: this.deriveProjectFacets(project, analysis),
			contextDocumentId: null, // Enhanced mode doesn't create context docs yet
			contextMarkdown: project.context?.trim() || null,
			coreValues,
			template: enhancedResult.typeKeyUsed
				? {
						typeKey: enhancedResult.typeKeyUsed,
						templateId: null,
						realm: null,
						domain: null,
						deliverable: null,
						variant: null,
						confidence: enhancedResult.propsConfidence ?? null,
						created: false
					}
				: null,
			templateProps: enhancedResult.propsExtracted
				? {
						props: enhancedResult.propsExtracted,
						confidence: enhancedResult.propsConfidence ?? null
					}
				: null
		};
	}

	private mapEnhancedStatus(enhancedStatus: string): MigrationStatus {
		switch (enhancedStatus) {
			case 'completed':
				return 'completed';
			case 'pending_review':
				return 'pending';
			case 'validation_failed':
			case 'failed':
				return 'failed';
			default:
				return 'pending';
		}
	}
}
