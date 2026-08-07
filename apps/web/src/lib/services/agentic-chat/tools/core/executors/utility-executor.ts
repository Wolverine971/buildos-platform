// apps/web/src/lib/services/agentic-chat/tools/core/executors/utility-executor.ts
/**
 * Utility Executor
 *
 * Handles utility tool operations:
 * - get_field_info: Schema information for entity types
 * - get_entity_relationships: Edge relationships for an entity
 * - get_linked_entities: Full linked entity details
 *
 * The overview/utility read tools (get_field_info, get_workspace_overview,
 * get_project_overview, change_chat_context) live in
 * @buildos/agentic-chat-runtime/tools (Phase 4 Slice 18 S3-T5) as free
 * functions over an injected context; this class delegates to them with its
 * RLS client + web access adapter (and the web gateway-surface resolver for
 * change_chat_context). get_user_profile_overview stays web-side untouched
 * (usage_scope filter decision pending), as do the contacts tools,
 * delegate_task, commit_change_set, and the entity relationship tools.
 */

import { BaseExecutor } from './base-executor';
import { getGatewayDirectToolNamesForContextType } from '../gateway-surface';
import { OntologyContextLoader } from '$lib/services/ontology-context-loader';
import {
	formatLinkedEntitiesFullDetail,
	getLinkedEntitiesSummary
} from '$lib/services/linked-entity-context-formatter';
import {
	createOrUpsertUserContact,
	createUserContactLink,
	insertUserContactAuditEvent,
	listUserContactMergeCandidates,
	resolveUserContactMergeCandidate,
	searchUserContacts
} from '$lib/server/user-contact.service';
import type { OntologyEntityType } from '$lib/types/agent-chat-enhancement';
import { validateAgentRunMetadata } from '@buildos/shared-types';
import { commitChangeSet } from '@buildos/shared-agent-ops';
import type {
	ExecutorContext,
	ChangeChatContextArgs,
	CommitChangeSetArgs,
	DelegateTaskArgs,
	GetFieldInfoArgs,
	GetProjectOverviewArgs,
	GetUserProfileOverviewArgs,
	GetWorkspaceOverviewArgs,
	GetEntityRelationshipsArgs,
	GetLinkedEntitiesArgs,
	LinkUserContactArgs,
	ListUserContactCandidatesArgs,
	ResolveUserContactCandidateArgs,
	SearchUserContactsArgs,
	UpsertUserContactArgs
} from './types';
import {
	type AgenticChatSharedReadContextV1,
	changeChatContext as sharedChangeChatContext,
	getEntityRelationships as sharedGetEntityRelationships,
	getFieldInfo as sharedGetFieldInfo,
	getProjectOverview as sharedGetProjectOverview,
	getReadableRelationshipEntityDisplayName,
	getWorkspaceOverview as sharedGetWorkspaceOverview
} from '@buildos/agentic-chat-runtime/tools';

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
const DEFAULT_DEEP_AGENT_COST_USD = 0.5;
const MAX_DELEGATED_AGENT_COST_USD = 1;
const MIN_DEEP_RESEARCH_COST_USD = 0.25;
const DEFAULT_DEEP_AGENT_TOOL_CALLS = 12;
const DEFAULT_DEEP_RESEARCH_TOOL_CALLS = 10;
const MIN_DEEP_RESEARCH_TOOL_CALLS = 4;
const MAX_DELEGATED_AGENT_TOOL_CALLS = 40;
const DEFAULT_DEEP_AGENT_TOKENS = 60_000;
const DEFAULT_DEEP_AGENT_WALL_CLOCK_MS = 10 * 60 * 1000;

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
	/** Context handed to the shared read tools: RLS client + web access port. */
	private readonly sharedReadContext: AgenticChatSharedReadContextV1;

	constructor(context: ExecutorContext) {
		super(context);
		this.sharedReadContext = {
			client: this.supabase as AgenticChatSharedReadContextV1['client'],
			access: this.accessAdapter
		};
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
		return sharedGetFieldInfo(args);
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

	async getWorkspaceOverview(args: GetWorkspaceOverviewArgs = {}): Promise<Record<string, any>> {
		return sharedGetWorkspaceOverview(this.sharedReadContext, args);
	}

	async getProjectOverview(args: GetProjectOverviewArgs = {}): Promise<Record<string, any>> {
		return sharedGetProjectOverview(this.sharedReadContext, args);
	}

	async changeChatContext(args: ChangeChatContextArgs): Promise<Record<string, any>> {
		return sharedChangeChatContext(this.sharedReadContext, args, {
			resolveDirectToolNames: (contextType) =>
				getGatewayDirectToolNamesForContextType(contextType)
		});
	}

	// ============================================
	// USER CONTACTS
	// ============================================

	private resolveSensitiveContactExposure(args: {
		include_sensitive_values?: boolean;
		user_confirmed_sensitive?: boolean;
		reason?: string;
	}): { exposeSensitive: boolean; warning?: string } {
		if (args.include_sensitive_values !== true) {
			return { exposeSensitive: false };
		}
		if (args.user_confirmed_sensitive === true) {
			const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
			if (reason.length >= 4) {
				return { exposeSensitive: true };
			}
		}
		return {
			exposeSensitive: false,
			warning:
				'Sensitive values remain redacted. To expose raw values, provide include_sensitive_values=true, user_confirmed_sensitive=true, and a short reason.'
		};
	}

	async searchUserContacts(args: SearchUserContactsArgs = {}): Promise<{
		contacts: Record<string, any>[];
		count: number;
		total_considered: number;
		sensitive_values_exposed: boolean;
		warning?: string;
		message: string;
	}> {
		const actorId = await this.getActorId();
		const includeMethods = args.include_methods !== false;
		const exposure = this.resolveSensitiveContactExposure({
			include_sensitive_values: args.include_sensitive_values,
			user_confirmed_sensitive: args.user_confirmed_sensitive,
			reason: args.reason
		});

		const { contacts, total_considered } = await searchUserContacts({
			supabase: this.supabase as any,
			userId: this.userId,
			query: args.query ?? null,
			methodType: args.method_type ?? null,
			relationshipLabel: args.relationship_label ?? null,
			includeArchived: args.include_archived === true,
			includeMethods,
			exposeSensitive: exposure.exposeSensitive,
			limit: args.limit ?? 20
		});

		await insertUserContactAuditEvent({
			supabase: this.supabase as any,
			userId: this.userId,
			actorId,
			accessType: includeMethods ? 'method_read' : 'search',
			contextType: 'chat',
			reason: 'tool:search_user_contacts',
			metadata: {
				session_id: this.sessionId ?? null,
				query: args.query ?? null,
				method_type: args.method_type ?? null,
				include_archived: args.include_archived === true,
				include_methods: includeMethods,
				requested_sensitive_values: args.include_sensitive_values === true,
				exposed_sensitive_values: exposure.exposeSensitive,
				returned_count: contacts.length
			}
		});

		return {
			contacts,
			count: contacts.length,
			total_considered,
			sensitive_values_exposed: exposure.exposeSensitive,
			...(exposure.warning ? { warning: exposure.warning } : {}),
			message: `Found ${contacts.length} contact(s).`
		};
	}

	async upsertUserContact(args: UpsertUserContactArgs): Promise<{
		contact: Record<string, any>;
		created: boolean;
		message: string;
	}> {
		const actorId = await this.getActorId();

		const { contact, created } = await createOrUpsertUserContact({
			supabase: this.supabase as any,
			userId: this.userId,
			input: {
				display_name: args.display_name,
				given_name: args.given_name,
				family_name: args.family_name,
				nickname: args.nickname,
				organization: args.organization,
				title: args.title,
				notes: args.notes,
				relationship_label: args.relationship_label,
				confidence: args.confidence,
				sensitivity: args.sensitivity,
				usage_scope: args.usage_scope,
				methods: args.methods
			},
			exposeSensitive: args.include_sensitive_values === true
		});

		await insertUserContactAuditEvent({
			supabase: this.supabase as any,
			userId: this.userId,
			contactId: String(contact.id),
			actorId,
			accessType: 'method_write',
			contextType: 'chat',
			reason: created ? 'tool:upsert_user_contact:create' : 'tool:upsert_user_contact:update',
			metadata: {
				session_id: this.sessionId ?? null,
				method_count: Array.isArray(args.methods) ? args.methods.length : 0
			}
		});

		return {
			contact,
			created,
			message: created ? 'Contact created.' : 'Contact updated.'
		};
	}

	async listUserContactCandidates(args: ListUserContactCandidatesArgs = {}): Promise<{
		candidates: Record<string, any>[];
		count: number;
		sensitive_values_exposed: boolean;
		warning?: string;
		message: string;
	}> {
		const actorId = await this.getActorId();
		const exposure = this.resolveSensitiveContactExposure({
			include_sensitive_values: args.include_sensitive_values,
			user_confirmed_sensitive: args.user_confirmed_sensitive,
			reason: args.reason
		});

		const { candidates } = await listUserContactMergeCandidates({
			supabase: this.supabase as any,
			userId: this.userId,
			status: args.status ?? 'pending',
			limit: args.limit ?? 20,
			exposeSensitive: exposure.exposeSensitive
		});

		await insertUserContactAuditEvent({
			supabase: this.supabase as any,
			userId: this.userId,
			actorId,
			accessType: exposure.exposeSensitive ? 'method_read' : 'search',
			contextType: 'chat',
			reason: 'tool:list_user_contact_candidates',
			metadata: {
				session_id: this.sessionId ?? null,
				status: args.status ?? 'pending',
				requested_sensitive_values: args.include_sensitive_values === true,
				exposed_sensitive_values: exposure.exposeSensitive,
				returned_count: candidates.length
			}
		});

		return {
			candidates,
			count: candidates.length,
			sensitive_values_exposed: exposure.exposeSensitive,
			...(exposure.warning ? { warning: exposure.warning } : {}),
			message: `Found ${candidates.length} merge candidate(s).`
		};
	}

	async resolveUserContactCandidate(args: ResolveUserContactCandidateArgs): Promise<{
		candidate: Record<string, any>;
		message: string;
	}> {
		const actorId = await this.getActorId();
		const { candidate } = await resolveUserContactMergeCandidate({
			supabase: this.supabase as any,
			userId: this.userId,
			candidateId: args.candidate_id,
			action: args.action,
			actorId,
			exposeSensitive: args.include_sensitive_values === true
		});

		await insertUserContactAuditEvent({
			supabase: this.supabase as any,
			userId: this.userId,
			contactId: String(candidate.primary_contact_id ?? ''),
			actorId,
			accessType: 'merge',
			contextType: 'chat',
			reason: `tool:resolve_user_contact_candidate:${args.action}`,
			metadata: {
				session_id: this.sessionId ?? null,
				candidate_id: args.candidate_id
			}
		});

		return {
			candidate,
			message: 'Contact candidate resolved.'
		};
	}

	async linkUserContact(args: LinkUserContactArgs): Promise<{
		link: Record<string, any>;
		message: string;
	}> {
		const actorId = await this.getActorId();
		const { link } = await createUserContactLink({
			supabase: this.supabase as any,
			userId: this.userId,
			contactId: args.contact_id,
			linkType: args.link_type,
			profileDocumentId: args.profile_document_id,
			profileFragmentId: args.profile_fragment_id,
			actorId: args.actor_id,
			projectId: args.project_id,
			entityType: args.entity_type,
			entityId: args.entity_id,
			props:
				args.props && typeof args.props === 'object' && !Array.isArray(args.props)
					? (args.props as Record<string, any>)
					: undefined,
			createdByActorId: actorId
		});

		await insertUserContactAuditEvent({
			supabase: this.supabase as any,
			userId: this.userId,
			contactId: args.contact_id,
			actorId,
			accessType: 'link',
			contextType: 'chat',
			reason: `tool:link_user_contact:${args.link_type}`,
			metadata: {
				session_id: this.sessionId ?? null,
				link_id: String(link.id ?? '')
			}
		});

		return {
			link,
			message: 'Contact link created.'
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
		return sharedGetEntityRelationships(this.sharedReadContext, args);
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
		const { displayName: entityName, projectId } =
			await getReadableRelationshipEntityDisplayName(this.sharedReadContext, {
				entityId: args.entity_id,
				entityKind: args.entity_kind
			});

		// Load linked entities with full details
		const ontologyLoader = new OntologyContextLoader(this.supabase, actorId);
		const linkedContext = await ontologyLoader.loadLinkedEntitiesContext(
			args.entity_id,
			args.entity_kind as OntologyEntityType,
			entityName,
			{
				maxPerType: 50, // Full mode - get all
				includeDescriptions: true,
				priorityOrder: 'active_first',
				projectId
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
	 * delegate_task — spawn a background Agent Run from this chat (Phase 3).
	 * Two-phase create (mirrors POST /api/agent-runs): insert the `agent_runs`
	 * row with trigger='chat' + parent_session_id, then enqueue the `agent_run`
	 * job. Returns immediately with { run_ids }; the worker posts the result back
	 * into this thread on completion (see injectChatCompletionMessage in the
	 * worker). Read-first by default.
	 */
	async delegateTask(args: DelegateTaskArgs): Promise<Record<string, any>> {
		const goal = (args.goal ?? '').trim();
		if (!goal) {
			throw new Error('A non-empty `goal` is required to delegate a task.');
		}

		const projectId =
			typeof args.project_id === 'string' && args.project_id.trim()
				? args.project_id.trim()
				: null;
		const contextType: 'project' | 'global' =
			args.context_type ?? (projectId ? 'project' : 'global');
		if (contextType === 'project' && !projectId) {
			throw new Error("`project_id` is required when context_type is 'project'.");
		}
		const scopeMode: 'read_only' | 'read_write' =
			args.scope_mode === 'read_write' ? 'read_write' : 'read_only';
		const runTemplate: 'agent' | 'deep_research' =
			args.run_template === 'deep_research' ? 'deep_research' : 'agent';
		const effort: 'standard' | 'deep' =
			runTemplate === 'deep_research' || args.effort === 'deep' ? 'deep' : 'standard';
		if (runTemplate === 'deep_research' && scopeMode !== 'read_only') {
			throw new Error('Deep research must use `scope_mode: "read_only"`.');
		}
		// Review-before-commit only applies to read_write runs (nothing to stage
		// on a read-only run). Silently ignore review on read-only.
		const reviewRequired = args.review === true && scopeMode === 'read_write';

		// Reuse the executor's own membership assertion for project-scoped runs.
		if (contextType === 'project' && projectId) {
			await this.assertProjectAccess(
				projectId,
				scopeMode === 'read_write' ? 'write' : 'read'
			);
		}

		const admin = this.getAdminSupabase();

		// Per-user active-run cap (mirrors the manual dispatch route + the
		// fan-out guardrail in 01 §8): bound runaway delegation.
		const MAX_CONCURRENT_RUNS = 3;
		const ACTIVE_STATUSES = ['queued', 'running', 'paused', 'needs_input', 'proposal_ready'];
		const { count, error: countError } = await admin
			.from('agent_runs')
			.select('id', { count: 'exact', head: true })
			.eq('user_id', this.userId)
			.in('status', ACTIVE_STATUSES as any);
		if (countError) {
			throw new Error(`Failed to check active runs: ${countError.message}`);
		}
		if (runTemplate === 'deep_research' && (count ?? 0) > 0) {
			return {
				ok: false,
				error: 'Deep research needs all three Agent Run slots free for its coordinator and two researchers.'
			};
		}
		if ((count ?? 0) >= MAX_CONCURRENT_RUNS) {
			return {
				ok: false,
				error: `You already have ${MAX_CONCURRENT_RUNS} active agent runs — wait for one to finish before delegating another.`
			};
		}

		const label =
			typeof args.label === 'string' && args.label.trim()
				? args.label.trim()
				: goal.slice(0, 80);
		const budgets: Record<string, number> = {};
		if (typeof args.max_tool_calls === 'number' && args.max_tool_calls > 0) {
			budgets.max_tool_calls = Math.min(
				Math.floor(args.max_tool_calls),
				MAX_DELEGATED_AGENT_TOOL_CALLS
			);
		}
		if (typeof args.max_cost_usd === 'number') {
			if (
				!Number.isFinite(args.max_cost_usd) ||
				args.max_cost_usd <= 0 ||
				args.max_cost_usd > MAX_DELEGATED_AGENT_COST_USD
			) {
				throw new Error(
					`\`max_cost_usd\` must be greater than 0 and no more than $${MAX_DELEGATED_AGENT_COST_USD}.`
				);
			}
			budgets.max_cost_usd = args.max_cost_usd;
		}
		if (effort === 'deep') {
			budgets.max_cost_usd ??= DEFAULT_DEEP_AGENT_COST_USD;
			budgets.max_tool_calls ??= DEFAULT_DEEP_AGENT_TOOL_CALLS;
			budgets.max_tokens = DEFAULT_DEEP_AGENT_TOKENS;
			budgets.wall_clock_ms = DEFAULT_DEEP_AGENT_WALL_CLOCK_MS;
		}
		if (
			runTemplate === 'deep_research' &&
			(budgets.max_cost_usd ?? 0) < MIN_DEEP_RESEARCH_COST_USD
		) {
			throw new Error(
				`Deep research requires \`max_cost_usd\` to be at least $${MIN_DEEP_RESEARCH_COST_USD}.`
			);
		}
		if (runTemplate === 'deep_research') {
			if (args.max_tool_calls === undefined) {
				budgets.max_tool_calls = DEFAULT_DEEP_RESEARCH_TOOL_CALLS;
			}
			if ((budgets.max_tool_calls ?? 0) < MIN_DEEP_RESEARCH_TOOL_CALLS) {
				throw new Error(
					`Deep research requires \`max_tool_calls\` to be at least ${MIN_DEEP_RESEARCH_TOOL_CALLS}.`
				);
			}
		}

		// Phase 1: insert the run row (trigger='chat', attached to this session).
		const { data: run, error: runError } = await admin
			.from('agent_runs')
			.insert({
				user_id: this.userId,
				trigger: 'chat',
				label,
				goal,
				instructions: typeof args.instructions === 'string' ? args.instructions : null,
				expected_output:
					typeof args.expected_output === 'string' ? args.expected_output : null,
				context_type: contextType,
				project_id: projectId,
				scope_mode: scopeMode,
				effort,
				run_template: runTemplate,
				review_required: reviewRequired,
				status: 'queued',
				budgets,
				parent_session_id: this.sessionId ?? null,
				// parent_message_id is set once the orchestrator turn id is threaded
				// through (follow-up); session linkage is sufficient for now.
				parent_message_id: null
			})
			.select('*')
			.single();

		if (runError || !run) {
			throw new Error(runError?.message ?? 'Failed to create the agent run.');
		}

		// Phase 2: enqueue the job (validate metadata up front).
		const metadata = {
			run_id: run.id,
			trigger: 'chat' as const,
			context_type: contextType,
			project_id: projectId,
			scope_mode: scopeMode,
			effort,
			run_template: runTemplate,
			allowed_ops: null,
			review_required: reviewRequired,
			budgets
		};
		try {
			validateAgentRunMetadata(metadata);
		} catch (e) {
			await admin
				.from('agent_runs')
				.update({ status: 'failed', error: 'Invalid job metadata' })
				.eq('id', run.id);
			throw new Error(e instanceof Error ? e.message : 'Invalid job metadata');
		}

		const { error: jobError } = await admin.rpc('add_queue_job', {
			p_user_id: this.userId,
			p_job_type: 'agent_run',
			p_metadata: metadata as any,
			p_priority: 7,
			p_scheduled_for: new Date().toISOString(),
			p_dedup_key: `agent-run:${run.id}`
		});

		if (jobError) {
			await admin
				.from('agent_runs')
				.update({ status: 'failed', error: `queue_error: ${jobError.message}` })
				.eq('id', run.id);
			throw new Error(`Failed to queue the agent run: ${jobError.message}`);
		}

		return {
			ok: true,
			run_ids: [run.id],
			label,
			status: 'queued',
			context_type: contextType,
			project_id: projectId,
			scope_mode: scopeMode,
			effort,
			run_template: runTemplate,
			max_cost_usd: budgets.max_cost_usd ?? null,
			review: reviewRequired,
			message: `Dispatched background agent "${label}".${reviewRequired ? ' It will STAGE its changes for your review (call commit_change_set after the user approves).' : ' It will work on this autonomously and post its result back into this conversation when done.'}`
		};
	}

	/**
	 * Apply a staged Change Set produced by a review run (02 approval flow #2).
	 * The orchestrator presents the proposal inline and, on the user's approval,
	 * calls this to commit. Delegates to the shared commitChangeSet (the same
	 * write path as direct commits).
	 */
	async commitChangeSet(args: CommitChangeSetArgs): Promise<Record<string, any>> {
		const runId = typeof args.run_id === 'string' ? args.run_id.trim() : '';
		if (!runId) {
			throw new Error('A `run_id` is required to commit a change set.');
		}

		const decisions = Array.isArray(args.decisions)
			? args.decisions
					.filter((d) => d && typeof d.change_id === 'string')
					.map((d) => ({
						change_id: d.change_id,
						decision:
							d.decision === 'rejected'
								? ('rejected' as const)
								: ('approved' as const)
					}))
			: [];
		const defaultDecision: 'approved' | 'rejected' =
			args.default_decision === 'rejected' ? 'rejected' : 'approved';

		const outcome = await commitChangeSet({
			admin: this.getAdminSupabase() as any,
			runId,
			userId: this.userId,
			decisions,
			defaultDecision
		});

		if (!outcome.ok) {
			return { ok: false, error: outcome.error.message };
		}
		return {
			ok: true,
			run_id: runId,
			applied: outcome.result.applied,
			rejected: outcome.result.rejected,
			failed: outcome.result.failed,
			run_status: outcome.result.run_status,
			change_set_status: outcome.result.change_set_status,
			entities_touched: outcome.result.entities_touched,
			message:
				outcome.result.failed > 0
					? `Applied ${outcome.result.applied}, ${outcome.result.failed} failed, ${outcome.result.rejected} rejected.`
					: `Applied ${outcome.result.applied} change(s)${outcome.result.rejected ? `, rejected ${outcome.result.rejected}` : ''}.`
		};
	}
}
