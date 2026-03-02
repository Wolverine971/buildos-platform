// apps/web/src/lib/services/agentic-chat/tools/core/executors/utility-executor.ts
/**
 * Utility Executor
 *
 * Handles utility tool operations:
 * - get_field_info: Schema information for entity types
 * - get_entity_relationships: Edge relationships for an entity
 * - get_linked_entities: Full linked entity details
 */

import { BaseExecutor } from './base-executor';
import { ENTITY_FIELD_INFO } from '../tools.config';
import { OntologyContextLoader } from '$lib/services/ontology-context-loader';
import {
	formatLinkedEntitiesFullDetail,
	getLinkedEntitiesSummary
} from '$lib/services/linked-entity-context-formatter';
import type { OntologyEntityType } from '$lib/types/agent-chat-enhancement';
import type {
	ExecutorContext,
	GetFieldInfoArgs,
	GetUserProfileOverviewArgs,
	GetEntityRelationshipsArgs,
	GetLinkedEntitiesArgs
} from './types';

type ProfileDocTreeNode = {
	id: string;
	order?: number;
	type?: 'doc' | 'folder';
	title?: string | null;
	children?: ProfileDocTreeNode[];
};

type ProfileDocStructure = {
	version: number;
	root: ProfileDocTreeNode[];
};

const PROFILE_SUMMARY_EXCERPT_MAX_CHARS = 180;

function truncateText(value: string | null | undefined, maxChars: number): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.length <= maxChars) return trimmed;
	return `${trimmed.slice(0, Math.max(0, maxChars - 3))}...`;
}

function normalizeDocStructureNode(value: unknown): ProfileDocTreeNode | null {
	if (!value || typeof value !== 'object') return null;
	const row = value as Record<string, unknown>;
	const id = typeof row.id === 'string' ? row.id : null;
	if (!id) return null;
	const type = row.type === 'folder' ? 'folder' : 'doc';
	const order = typeof row.order === 'number' && Number.isFinite(row.order) ? row.order : 0;
	const title = typeof row.title === 'string' ? row.title.trim() : null;
	const children = Array.isArray(row.children)
		? row.children
				.map((child) => normalizeDocStructureNode(child))
				.filter((child): child is ProfileDocTreeNode => Boolean(child))
		: [];

	return {
		id,
		type,
		order,
		...(title ? { title } : {}),
		...(children.length > 0 ? { children } : {})
	};
}

function normalizeDocStructure(value: unknown): ProfileDocStructure {
	if (!value || typeof value !== 'object') {
		return { version: 1, root: [] };
	}
	const row = value as Record<string, unknown>;
	const version =
		typeof row.version === 'number' && Number.isFinite(row.version) ? row.version : 1;
	const root = Array.isArray(row.root)
		? row.root
				.map((node) => normalizeDocStructureNode(node))
				.filter((node): node is ProfileDocTreeNode => Boolean(node))
		: [];
	return { version, root };
}

type ProfileSectionOverview = {
	id: string;
	title: string | null;
	type: 'doc' | 'folder';
	order: number;
	path: string[];
	depth: number;
	chapter: {
		id: string;
		title: string;
		type_key: string;
		sensitivity: 'standard' | 'sensitive';
		usage_scope: 'all_agents' | 'profile_only' | 'never_prompt';
		updated_at: string;
		summary_excerpt?: string | null;
	} | null;
};

function flattenSections(
	nodes: ProfileDocTreeNode[],
	chaptersById: Map<
		string,
		{
			id: string;
			title: string;
			type_key: string;
			sensitivity: 'standard' | 'sensitive';
			usage_scope: 'all_agents' | 'profile_only' | 'never_prompt';
			updated_at: string;
			summary_excerpt?: string | null;
		}
	>,
	ancestorPath: string[] = []
): ProfileSectionOverview[] {
	const sections: ProfileSectionOverview[] = [];
	for (const node of nodes) {
		const title = node.title?.trim() || null;
		const nextPath = title ? [...ancestorPath, title] : ancestorPath;
		const chapter = node.type === 'doc' ? (chaptersById.get(node.id) ?? null) : null;
		sections.push({
			id: node.id,
			title,
			type: node.type === 'folder' ? 'folder' : 'doc',
			order: typeof node.order === 'number' && Number.isFinite(node.order) ? node.order : 0,
			path: nextPath,
			depth: Math.max(0, nextPath.length - 1),
			chapter
		});
		if (Array.isArray(node.children) && node.children.length > 0) {
			sections.push(...flattenSections(node.children, chaptersById, nextPath));
		}
	}
	return sections;
}

/**
 * Executor for utility tool operations.
 *
 * Provides schema information and relationship queries.
 */
export class UtilityExecutor extends BaseExecutor {
	constructor(context: ExecutorContext) {
		super(context);
	}

	// ============================================
	// FIELD INFO
	// ============================================

	/**
	 * Get field schema information for an entity type.
	 */
	async getFieldInfo(args: GetFieldInfoArgs): Promise<{
		entity_type: string;
		fields: Record<string, unknown>;
		message: string;
	}> {
		const { entity_type, field_name } = args;

		// Validate entity_type is provided
		if (!entity_type || entity_type === 'undefined' || entity_type === 'null') {
			const validTypes = Object.keys(ENTITY_FIELD_INFO).join(', ');
			throw new Error(
				`The 'entity_type' parameter is required to specify which entity's field schema to return. ` +
					`This helps you understand what properties are available when creating or updating entities. ` +
					`Valid types: ${validTypes}. Example: get_field_info({ entity_type: "ontology_project" })`
			);
		}

		const schema = ENTITY_FIELD_INFO[entity_type];
		if (!schema) {
			throw new Error(
				`Unknown entity type: ${entity_type}. Valid types: ${Object.keys(ENTITY_FIELD_INFO).join(', ')}`
			);
		}

		if (field_name) {
			const field = schema[field_name];
			if (!field) {
				throw new Error(
					`Field "${field_name}" not found for entity "${entity_type}". Available fields: ${Object.keys(schema).join(', ')}`
				);
			}

			return {
				entity_type,
				fields: { [field_name]: field },
				message: `Field information for ${entity_type}.${field_name}`
			};
		}

		return {
			entity_type,
			fields: schema,
			message: `Commonly-used fields for ${entity_type}`
		};
	}

	// ============================================
	// USER PROFILE
	// ============================================

	/**
	 * Get profile chapter/section overview for on-demand personalization.
	 */
	async getUserProfileOverview(args: GetUserProfileOverviewArgs = {}): Promise<{
		profile_exists: boolean;
		profile: {
			id: string;
			extraction_enabled: boolean;
			summary_updated_at: string | null;
			chapter_count: number;
			pending_fragment_count: number;
			has_summary: boolean;
			has_safe_summary: boolean;
		} | null;
		doc_structure: ProfileDocStructure | null;
		chapters: Array<{
			id: string;
			title: string;
			type_key: string;
			sensitivity: 'standard' | 'sensitive';
			usage_scope: 'all_agents' | 'profile_only' | 'never_prompt';
			updated_at: string;
			summary_excerpt?: string | null;
		}>;
		sections: ProfileSectionOverview[];
		message: string;
	}> {
		const includeDocStructure = args.include_doc_structure !== false;
		const includeChapters = args.include_chapters !== false;
		const includeSummaries = args.include_summaries === true;
		const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 40)));
		const supabaseAny = this.supabase as any;

		const { data: profileData, error: profileError } = await supabaseAny
			.from('user_profiles')
			.select(
				'id, extraction_enabled, doc_structure, summary, safe_summary, summary_updated_at'
			)
			.eq('user_id', this.userId)
			.maybeSingle();

		if (profileError) {
			throw new Error(`Failed to load user profile overview: ${profileError.message}`);
		}
		if (!profileData) {
			return {
				profile_exists: false,
				profile: null,
				doc_structure: includeDocStructure ? { version: 1, root: [] } : null,
				chapters: [],
				sections: [],
				message: 'No user profile found yet.'
			};
		}

		const profileId = profileData.id as string;
		const [chapterCountRes, pendingCountRes, chapterRowsRes] = await Promise.all([
			supabaseAny
				.from('profile_documents')
				.select('id', { count: 'exact', head: true })
				.eq('profile_id', profileId)
				.is('deleted_at', null),
			supabaseAny
				.from('profile_fragments')
				.select('id', { count: 'exact', head: true })
				.eq('profile_id', profileId)
				.eq('status', 'pending'),
			includeChapters
				? supabaseAny
						.from('profile_documents')
						.select(
							'id, title, type_key, summary, sensitivity, usage_scope, updated_at'
						)
						.eq('profile_id', profileId)
						.is('deleted_at', null)
						.order('updated_at', { ascending: false })
						.limit(limit)
				: Promise.resolve({ data: [], error: null })
		]);

		if (chapterRowsRes.error) {
			throw new Error(
				`Failed to load user profile chapters: ${chapterRowsRes.error.message}`
			);
		}
		if (chapterCountRes.error) {
			throw new Error(
				`Failed to count user profile chapters: ${chapterCountRes.error.message}`
			);
		}
		if (pendingCountRes.error) {
			throw new Error(
				`Failed to count pending user profile fragments: ${pendingCountRes.error.message}`
			);
		}

		const chapters = ((chapterRowsRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
			id: String(row.id),
			title: String(row.title ?? ''),
			type_key: String(row.type_key ?? 'chapter.general'),
			sensitivity:
				row.sensitivity === 'sensitive' ? ('sensitive' as const) : ('standard' as const),
			usage_scope:
				row.usage_scope === 'profile_only' || row.usage_scope === 'never_prompt'
					? (row.usage_scope as 'profile_only' | 'never_prompt')
					: ('all_agents' as const),
			updated_at: String(row.updated_at ?? ''),
			...(includeSummaries
				? {
						summary_excerpt: truncateText(
							row.summary as string | null | undefined,
							PROFILE_SUMMARY_EXCERPT_MAX_CHARS
						)
					}
				: {})
		}));

		const chaptersById = new Map(chapters.map((chapter) => [chapter.id, chapter] as const));
		const docStructure = includeDocStructure
			? normalizeDocStructure(profileData.doc_structure)
			: null;
		const sections = docStructure ? flattenSections(docStructure.root, chaptersById) : [];

		void supabaseAny
			.from('profile_access_audit')
			.insert({
				profile_id: profileId,
				access_type: 'search',
				context_type: 'chat',
				reason: `tool:get_user_profile_overview:${this.sessionId ?? 'unknown'}`
			})
			.then(({ error }: { error?: { message?: string } | null }) => {
				if (error) {
					console.warn(
						'[UtilityExecutor] Failed to write profile access audit event:',
						error.message
					);
				}
			})
			.catch((error: unknown) => {
				console.warn(
					'[UtilityExecutor] Failed to write profile access audit event:',
					error
				);
			});

		return {
			profile_exists: true,
			profile: {
				id: profileId,
				extraction_enabled: Boolean(profileData.extraction_enabled),
				summary_updated_at:
					typeof profileData.summary_updated_at === 'string'
						? profileData.summary_updated_at
						: null,
				chapter_count: chapterCountRes.count ?? 0,
				pending_fragment_count: pendingCountRes.count ?? 0,
				has_summary:
					typeof profileData.summary === 'string' &&
					profileData.summary.trim().length > 0,
				has_safe_summary:
					typeof profileData.safe_summary === 'string' &&
					profileData.safe_summary.trim().length > 0
			},
			doc_structure: docStructure,
			chapters,
			sections,
			message: `Loaded user profile overview with ${chapters.length} chapter(s).`
		};
	}

	// ============================================
	// RELATIONSHIPS
	// ============================================

	/**
	 * Get edge relationships for an entity.
	 */
	async getEntityRelationships(args: GetEntityRelationshipsArgs): Promise<{
		relationships: any[];
		message: string;
	}> {
		await this.assertEntityOwnership(args.entity_id);
		const direction = args.direction ?? 'both';
		const relationships: any[] = [];

		if (direction === 'outgoing' || direction === 'both') {
			const { data } = await this.supabase
				.from('onto_edges')
				.select('*')
				.eq('src_id', args.entity_id)
				.limit(50);

			if (data) {
				relationships.push(
					...data.map((edge) => ({
						...edge,
						direction: 'outgoing'
					}))
				);
			}
		}

		if (direction === 'incoming' || direction === 'both') {
			const { data } = await this.supabase
				.from('onto_edges')
				.select('*')
				.eq('dst_id', args.entity_id)
				.limit(50);

			if (data) {
				relationships.push(
					...data.map((edge) => ({
						...edge,
						direction: 'incoming'
					}))
				);
			}
		}

		return {
			relationships,
			message: `Found ${relationships.length} relationships for entity ${args.entity_id}.`
		};
	}

	// ============================================
	// LINKED ENTITIES
	// ============================================

	/**
	 * Get detailed linked entities for a specific entity.
	 * Returns full information about all linked entities including descriptions.
	 */
	async getLinkedEntities(args: GetLinkedEntitiesArgs): Promise<{
		linked_entities: string;
		summary: string;
		counts: Record<string, number>;
		message: string;
	}> {
		const actorId = await this.getActorId();
		await this.assertEntityOwnership(args.entity_id);

		// Get entity name for context
		const entityName = await this.getEntityDisplayName(args.entity_id, args.entity_kind);

		// Load linked entities with full details
		const ontologyLoader = new OntologyContextLoader(this.supabase, actorId);
		const linkedContext = await ontologyLoader.loadLinkedEntitiesContext(
			args.entity_id,
			args.entity_kind as OntologyEntityType,
			entityName,
			{
				maxPerType: 50, // Full mode - get all
				includeDescriptions: true,
				priorityOrder: 'active_first'
			}
		);

		// Filter by kind if specified
		if (args.filter_kind && args.filter_kind !== 'all') {
			const kindKey = `${args.filter_kind}s` as keyof typeof linkedContext.linkedEntities;
			const filteredEntities = linkedContext.linkedEntities[kindKey] || [];
			const filteredContext = {
				...linkedContext,
				linkedEntities: {
					plans: kindKey === 'plans' ? filteredEntities : [],
					goals: kindKey === 'goals' ? filteredEntities : [],
					tasks: kindKey === 'tasks' ? filteredEntities : [],
					milestones: kindKey === 'milestones' ? filteredEntities : [],
					documents: kindKey === 'documents' ? filteredEntities : [],
					risks: kindKey === 'risks' ? filteredEntities : [],
					requirements: []
				},
				counts: {
					...linkedContext.counts,
					total: filteredEntities.length
				}
			};

			const formattedOutput = formatLinkedEntitiesFullDetail(filteredContext);
			const summary = `${filteredEntities.length} ${args.filter_kind}(s) linked`;

			return {
				linked_entities: formattedOutput,
				summary,
				counts: { [args.filter_kind]: filteredEntities.length },
				message: `Found ${filteredEntities.length} linked ${args.filter_kind}(s) for ${args.entity_kind} "${entityName}".`
			};
		}

		// Return all linked entities
		const formattedOutput = formatLinkedEntitiesFullDetail(linkedContext);
		const summary = getLinkedEntitiesSummary(linkedContext);

		return {
			linked_entities: formattedOutput,
			summary,
			counts: linkedContext.counts,
			message: `Found ${linkedContext.counts.total} linked entities for ${args.entity_kind} "${entityName}".`
		};
	}

	/**
	 * Get display name for an entity by its kind.
	 */
	private async getEntityDisplayName(entityId: string, entityKind: string): Promise<string> {
		const tableMap: Record<string, string> = {
			task: 'onto_tasks',
			plan: 'onto_plans',
			goal: 'onto_goals',
			milestone: 'onto_milestones',
			document: 'onto_documents',
			risk: 'onto_risks'
		};

		const table = tableMap[entityKind];
		if (!table) return entityId;

		const { data } = await this.supabase
			.from(table as any)
			.select('name, title, summary, text')
			.eq('id', entityId)
			.single();

		if (!data) return entityId;
		return (
			(data as any).name ||
			(data as any).title ||
			(data as any).summary ||
			(data as any).text ||
			entityId
		);
	}
}
