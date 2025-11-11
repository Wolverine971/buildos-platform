// apps/web/src/lib/services/ontology/project-migration.service.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database, Json } from '@buildos/shared-types';
import type { Facets } from '$lib/types/onto';
import { ensureActorId } from './ontology-projects.service';
import type {
	MigrationServiceContext,
	MigrationStatus,
	TemplateCreationPlan
} from './migration.types';
import { getLegacyMapping, upsertLegacyMapping } from './legacy-mapping.service';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { ProjectTemplateInferenceService } from './project-template-inference.service';
import { ProjectPropsGenerationService } from './project-props-generation.service';

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
const CONTEXT_DOCUMENT_TYPE = 'document.project.context';

export class ProjectMigrationService {
	private readonly templateInference: ProjectTemplateInferenceService;
	private readonly propsGenerator: ProjectPropsGenerationService;

	constructor(
		private readonly client: TypedSupabaseClient,
		llmService: SmartLLMService
	) {
		this.templateInference = new ProjectTemplateInferenceService(client, llmService);
		this.propsGenerator = new ProjectPropsGenerationService(llmService);
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
		const actorId = await ensureActorId(this.client, project.user_id);
		const analysis = await this.buildAnalysis(project);
		const existingMapping = await getLegacyMapping(this.client, 'projects', project.id);
		const coreValues = this.extractCoreValues(project);
		const contextMarkdown = project.context?.trim() || null;
		let templateSummary: TemplateClassificationSummary | null = null;
		let templatePropsSummary: ProjectPropsLLMSummary | null = null;

		if (existingMapping?.onto_id) {
			return {
				legacyProjectId: project.id,
				ontoProjectId: existingMapping.onto_id,
				actorId,
				status: 'completed',
				analysis,
				message: 'Project already migrated; skipping duplicate work.',
				projectFacets: this.deriveProjectFacets(project, analysis),
				contextDocumentId: null,
				contextMarkdown,
				coreValues
			};
		}

		try {
			const inference = await this.templateInference.inferTemplate({
				project,
				userId: context.initiatedBy,
				dryRun: context.dryRun
			});

			if (inference) {
				templateSummary = {
					typeKey: inference.typeKey,
					templateId: inference.templateId,
					realm: inference.realm,
					domain: inference.domain,
					deliverable: inference.deliverable,
					variant: inference.variant,
					confidence: inference.confidence ?? null,
					rationale: inference.rationale ?? null,
					matchLevel: inference.matchLevel ?? null,
					created: inference.created,
					creationPlanned: inference.creationPlanned ?? null
				};

				if (inference.resolvedTemplate) {
					const propsResult = await this.propsGenerator.generate({
						project,
						template: inference.resolvedTemplate,
						structuredPlan: inference.structuredPlan,
						coreValues,
						userId: context.initiatedBy,
						dryRun: context.dryRun
					});

					if (propsResult) {
						templatePropsSummary = {
							props: propsResult.props ?? null,
							facets: propsResult.facets ?? null,
							confidence: propsResult.confidence ?? null,
							notes: propsResult.notes ?? null
						};
					}
				}
			}
		} catch (error) {
			console.error('[ProjectMigration] Template inference failed', error);
		}

		const fallbackFacets = this.deriveProjectFacets(project, analysis);
		const facets = templatePropsSummary?.facets ?? fallbackFacets;
		const typeKey = templateSummary?.typeKey ?? this.resolveProjectTypeKey(project);
		let projectProps = this.buildProjectProps(
			project,
			facets,
			context,
			coreValues,
			templateSummary,
			templatePropsSummary
		);

		if (context.dryRun) {
			return {
				legacyProjectId: project.id,
				ontoProjectId: null,
				actorId,
				status: 'pending',
				analysis,
				message: 'Dry-run mode: project migration is queued but not executed.',
				projectFacets: facets,
				contextDocumentId: null,
				contextMarkdown,
				coreValues,
				template: templateSummary,
				templateProps: templatePropsSummary
			};
		}

		const stateKey = this.mapStatusToState(project.status);

		const { data, error } = await this.client
			.from('onto_projects')
			.insert({
				name: project.name,
				description: project.description,
				type_key: typeKey,
				state_key: stateKey,
				also_types: [],
				props: projectProps,
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
				`[ProjectMigration] Failed to insert ontology project for ${project.id}: ${error?.message}`
			);
		}

		await upsertLegacyMapping(this.client, {
			legacyTable: 'projects',
			legacyId: project.id,
			ontoTable: 'onto_projects',
			ontoId: data.id,
			record: project,
			metadata: {
				run_id: context.runId,
				batch_id: context.batchId,
				dry_run: context.dryRun
			}
		});

		const contextDocument = await this.createContextDocument({
			project,
			ontoProjectId: data.id,
			actorId,
			context,
			coreValues
		});

		if (contextDocument.documentId) {
			projectProps = {
				...(projectProps as Record<string, unknown>),
				context_document_id: contextDocument.documentId
			} as Json;

			await this.client
				.from('onto_projects')
				.update({
					context_document_id: contextDocument.documentId,
					props: projectProps
				})
				.eq('id', data.id);
		}

		return {
			legacyProjectId: project.id,
			ontoProjectId: data.id,
			actorId,
			status: 'completed',
			analysis,
			message: 'Ontology project created successfully.',
			projectFacets: facets,
			contextDocumentId: contextDocument.documentId,
			contextMarkdown: contextDocument.contextMarkdown,
			coreValues,
			template: templateSummary,
			templateProps: templatePropsSummary
		};
	}

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
		if (project.tags?.some((tag) => tag.toLowerCase().includes('write'))) {
			return 'project.writing.general';
		}

		if (project.tags?.some((tag) => tag.toLowerCase().includes('app'))) {
			return 'project.software.build';
		}

		if (project.context?.toLowerCase().includes('client')) {
			return 'project.client_services';
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
}
