// packages/agentic-chat-runtime/src/tools/ontology-reads.ts
//
// Shared direct-Supabase read tools (Phase 4 Slice 18 S3-T4). These are the 18
// ontology read/search tools extracted from the legacy web
// apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts
// as free functions over an injected context, so web (RLS user client) and the
// worker (service-role client + explicit actor scoping via the access port)
// produce byte-identical payloads. HTTP-hop tools (agentic search, detail GETs
// that funnel through web routes, doc-tree) intentionally stay on the web
// executor class until their routes' logic is ported in later tranches.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { normalizeTaskStateInput } from '@buildos/shared-agent-ops/ontology/task-state';
import { buildSearchFilter } from '@buildos/shared-agent-ops/utils/search-filter';
import {
	collectOutlineAnchors,
	countOutlineNodes,
	extractOutline,
	getSectionByAnchor
} from '@buildos/shared-agent-ops/utils/document-outline';
import {
	AGENTIC_CHAT_NO_READABLE_PROJECTS_SENTINEL,
	readableProjectIdsFromSummaries,
	type AgenticChatToolAccessPortV1
} from './access-port';
import { pickStartHereDocument } from './start-here-selector';
import { prepareAgenticChatSearchTerm } from './search-term';
import { normalizeAgenticChatProjectStateV1 } from '../loop/project-semantics';

// ============================================
// CONTEXT
// ============================================

/**
 * Host-injected context for the shared read tools: the Supabase client the
 * host reads with (web: RLS user client; worker: service-role client) plus the
 * access port that carries the host's actor/membership semantics.
 */
export type AgenticChatSharedReadContextV1 = {
	client: SupabaseClient<Database>;
	access: AgenticChatToolAccessPortV1;
};

// ============================================
// ARG TYPES (mirrors the legacy web executor args)
// ============================================

export interface SharedListOntoProjectsArgs {
	state_key?: string;
	type_key?: string;
	archived?: boolean;
	limit?: number;
}

export interface SharedSearchOntoProjectsArgs {
	query: string;
	/** @deprecated Legacy alias. Use query. */
	search?: string;
	state_key?: string;
	type_key?: string;
	archived?: boolean;
	limit?: number;
}

export interface SharedListOntoTasksArgs {
	project_id?: string;
	state_key?: string;
	archived?: boolean;
	limit?: number;
}

export interface SharedSearchOntoTasksArgs {
	query: string;
	/** @deprecated Legacy alias. Use query. */
	search?: string;
	project_id?: string;
	state_key?: string;
	archived?: boolean;
	limit?: number;
}

export interface SharedListOntoGoalsArgs {
	project_id?: string;
	archived?: boolean;
	limit?: number;
}

export interface SharedSearchOntoGoalsArgs {
	query: string;
	/** @deprecated Legacy alias. Use query. */
	search?: string;
	project_id?: string;
	archived?: boolean;
	limit?: number;
}

export interface SharedListOntoPlansArgs {
	project_id?: string;
	archived?: boolean;
	limit?: number;
}

export interface SharedSearchOntoPlansArgs {
	query: string;
	/** @deprecated Legacy alias. Use query. */
	search?: string;
	project_id?: string;
	archived?: boolean;
	limit?: number;
}

export interface SharedListOntoDocumentsArgs {
	project_id?: string;
	type_key?: string;
	state_key?: string;
	archived?: boolean;
	limit?: number;
}

export interface SharedSearchOntoDocumentsArgs {
	query: string;
	/** @deprecated Legacy alias. Use query. */
	search?: string;
	project_id?: string;
	type_key?: string;
	state_key?: string;
	archived?: boolean;
	limit?: number;
}

export interface SharedListOntoMilestonesArgs {
	project_id?: string;
	state_key?: string;
	archived?: boolean;
	limit?: number;
}

export interface SharedSearchOntoMilestonesArgs {
	query: string;
	/** @deprecated Legacy alias. Use query. */
	search?: string;
	project_id?: string;
	state_key?: string;
	archived?: boolean;
	limit?: number;
}

export interface SharedListOntoRisksArgs {
	project_id?: string;
	state_key?: string;
	impact?: string;
	archived?: boolean;
	limit?: number;
}

export interface SharedSearchOntoRisksArgs {
	query: string;
	/** @deprecated Legacy alias. Use query. */
	search?: string;
	project_id?: string;
	state_key?: string;
	impact?: string;
	archived?: boolean;
	limit?: number;
}

export interface SharedGetOntoProjectDetailsArgs {
	project_id: string;
}

export interface SharedGetOntoDocumentDetailsArgs {
	document_id: string;
}

export interface SharedGetDocumentOutlineArgs {
	document_id: string;
}

export interface SharedReadDocumentSectionArgs {
	document_id: string;
	/** Heading anchor (slug) of the section to read, e.g. from get_document_outline. */
	anchor: string;
}

// ============================================
// SEARCH-TERM HELPERS (transcribed from the legacy web BaseExecutor;
// the web class keeps its own copies for the executors that stay web-side)
// ============================================

function normalizeProjectState(state?: string | null): string | undefined {
	return normalizeAgenticChatProjectStateV1(state) ?? undefined;
}

function resolveSearchTerm(args: { query?: string; search?: string }): string {
	return prepareAgenticChatSearchTerm(args.query ?? args.search);
}

function expandBooleanSearchTerms(term: string): string[] {
	const normalized = term.trim();
	if (!normalized) return [];

	const hasExplicitOr = /\s+\bOR\b\s+/i.test(normalized) || normalized.includes('|');
	if (!hasExplicitOr) {
		return [normalized];
	}

	return Array.from(
		new Set(
			normalized
				.split(/\s+\bOR\b\s+|\s*\|\s*/i)
				.map((part) => prepareAgenticChatSearchTerm(part))
				.filter(Boolean)
		)
	).slice(0, 12);
}

function buildMultiTermSearchFilter(term: string, fields: string[]): string | null {
	const filters = expandBooleanSearchTerms(term)
		.map((part) => buildSearchFilter(part, fields))
		.filter((filter): filter is string => Boolean(filter));

	return filters.length > 0 ? filters.join(',') : null;
}

// Very common English words that, when AND-ed across tokens, would only hurt
// recall (Postgres full-text strips these too). Kept tiny and conservative.
const SEARCH_STOPWORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'at',
	'be',
	'by',
	'for',
	'from',
	'in',
	'is',
	'it',
	'me',
	'my',
	'of',
	'on',
	'or',
	'the',
	'to',
	'with'
]);

/**
 * Split a plain (non-boolean) query into significant tokens for AND matching.
 * Drops stopwords and single characters; de-dupes; caps the token count.
 */
function tokenizeForKeywordSearch(term: string): string[] {
	return Array.from(
		new Set(
			term
				.split(/\s+/)
				.map((part) => prepareAgenticChatSearchTerm(part))
				.filter((part) => part.length >= 2 && !SEARCH_STOPWORDS.has(part.toLowerCase()))
		)
	).slice(0, 12);
}

/**
 * Apply keyword matching to a Supabase query so multi-word phrases match
 * regardless of word order. ILIKE `%a b c%` only matches the contiguous
 * phrase, so "ideas for blog posts" would miss a task titled "blog post
 * ideas". Instead:
 *   - Explicit boolean queries ("blog OR instagram", "a|b") keep OR semantics:
 *     any alternative may match any field.
 *   - Plain queries require every significant token to appear in some field
 *     (AND across tokens, OR across fields) — chaining multiple `.or()` calls,
 *     which PostgREST combines with AND.
 */
export function applyKeywordSearch<Q>(query: Q, term: string, fields: string[]): Q {
	const normalized = term.trim();
	if (!normalized) return query;

	const hasExplicitOr = /\s+\bOR\b\s+/i.test(normalized) || normalized.includes('|');
	if (hasExplicitOr) {
		const filter = buildMultiTermSearchFilter(normalized, fields);
		return filter ? (query as any).or(filter) : query;
	}

	const tokens = tokenizeForKeywordSearch(normalized);
	if (tokens.length === 0) {
		const filter = buildSearchFilter(normalized, fields);
		return filter ? (query as any).or(filter) : query;
	}

	let next = query;
	for (const token of tokens) {
		const filter = buildSearchFilter(token, fields);
		if (filter) next = (next as any).or(filter);
	}
	return next;
}

/**
 * In-memory counterpart of applyKeywordSearch for the project-summary search
 * (project access is resolved by loading accessible summaries, so matching is
 * done in JS rather than SQL). Same semantics: OR across explicit alternatives,
 * otherwise every token must appear somewhere in the combined fields.
 */
function matchesKeywordSearch(
	haystackParts: Array<string | null | undefined>,
	term: string
): boolean {
	const haystack = haystackParts
		.map((part) => (typeof part === 'string' ? part.toLowerCase() : ''))
		.join(' ');
	if (!haystack.trim()) return false;

	const normalized = term.trim();
	const hasExplicitOr = /\s+\bOR\b\s+/i.test(normalized) || normalized.includes('|');
	if (hasExplicitOr) {
		const alternatives = expandBooleanSearchTerms(normalized).map((part) => part.toLowerCase());
		return alternatives.some((alt) => alt && haystack.includes(alt));
	}

	const tokens = tokenizeForKeywordSearch(normalized);
	if (tokens.length === 0) {
		return haystack.includes(normalized.toLowerCase());
	}
	return tokens.every((token) => haystack.includes(token.toLowerCase()));
}

function isPlainSearchTermTooBroad(term: string): boolean {
	const normalized = term.trim();
	if (!normalized) return true;
	const hasExplicitOr = /\s+\bOR\b\s+/i.test(normalized) || normalized.includes('|');
	if (hasExplicitOr) return false;
	return tokenizeForKeywordSearch(normalized).length === 0;
}

// ============================================
// QUERY / PAYLOAD HELPERS
// ============================================

const INTERNAL_PAYLOAD_KEYS = new Set(['search_vector']);

export function stripInternalPayloadFields<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map((item) => stripInternalPayloadFields(item)) as T;
	}

	if (!value || typeof value !== 'object') {
		return value;
	}

	const output: Record<string, unknown> = {};
	let changed = false;

	for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
		if (INTERNAL_PAYLOAD_KEYS.has(key)) {
			changed = true;
			continue;
		}

		const sanitized = stripInternalPayloadFields(raw);
		output[key] = sanitized;
		if (sanitized !== raw) {
			changed = true;
		}
	}

	return changed ? (output as T) : value;
}

/**
 * Apply project-scope filters to a Postgrest query.
 *
 * The result is wrapped in `{ q }` because Postgrest builders are thenables
 * (their `.then()` triggers the HTTP request). Returning the builder directly
 * from an `async` function would let JavaScript's Promise resolution adopt the
 * thenable, executing the query and yielding `{ data, error }` to the caller —
 * then any subsequent `.limit()` / `.eq()` chain would explode with
 * `t.limit is not a function`. The wrapper prevents that adoption.
 */
async function scopeEntityQueryToReadableProject(
	context: AgenticChatSharedReadContextV1,
	query: any,
	projectId?: string | null
): Promise<{ q: any }> {
	const normalizedProjectId =
		typeof projectId === 'string' && projectId.trim().length > 0 ? projectId.trim() : null;

	if (normalizedProjectId) {
		await context.access.assertProjectAccess(normalizedProjectId, 'read');
		return { q: query.eq('project_id', normalizedProjectId) };
	}

	const summaries = await context.access.resolveProjectSummaries();
	const readableProjectIds = readableProjectIdsFromSummaries(summaries);

	if (readableProjectIds.length === 0) {
		return { q: query.eq('project_id', AGENTIC_CHAT_NO_READABLE_PROJECTS_SENTINEL) };
	}

	return { q: query.in('project_id', readableProjectIds) };
}

function applyArchivedReadFilter(query: any, args: { archived?: boolean }): any {
	const withoutDeleted = query.is('deleted_at', null);
	return args.archived === true
		? withoutDeleted.not('archived_at', 'is', null)
		: withoutDeleted.is('archived_at', null);
}

function getCountedRows<T>(result: { data?: T[] | null }): T[] {
	return Array.isArray(result.data) ? result.data : [];
}

function getResultCount(result: { data?: unknown[] | null; count?: number | null }): number {
	return typeof result.count === 'number' ? result.count : (result.data?.length ?? 0);
}

function throwFirstQueryError(results: Array<{ label: string; error?: unknown }>): void {
	const failed = results.find((result) => result.error);
	if (!failed) return;
	const error =
		failed.error instanceof Error ? failed.error : new Error(`Failed to load ${failed.label}`);
	throw error;
}

export function buildDetailNotFoundPayload(
	args: {
		entityType: string;
		idKey: string;
		id: string;
		searchTool?: string;
		listTool?: string;
	},
	options: { reason?: string } = {}
): Record<string, any> {
	const entityLabel = args.entityType[0]?.toUpperCase() + args.entityType.slice(1);
	const recoveryTools = [args.listTool, args.searchTool].filter(Boolean).join(' or ');
	const recoveryMessage = recoveryTools
		? ` Use ${recoveryTools} to find a current ${args.entityType}.`
		: '';
	const reason =
		options.reason ??
		`${entityLabel} not found. The ${args.entityType} may have been deleted, archived, inaccessible, or the ID may be stale.`;

	return {
		status: 'not_found',
		found: false,
		[args.idKey]: args.id,
		[args.entityType]: null,
		message: `${reason}${recoveryMessage}`
	};
}

function summarizeDocumentForList(document: Record<string, any>): Record<string, any> {
	const outline =
		document.markdown_outline && typeof document.markdown_outline === 'object'
			? document.markdown_outline
			: null;
	const contentLength =
		typeof document.content_length === 'number' ? document.content_length : null;

	return {
		id: typeof document.id === 'string' ? document.id : null,
		project_id: typeof document.project_id === 'string' ? document.project_id : null,
		title: typeof document.title === 'string' ? document.title : null,
		type_key: typeof document.type_key === 'string' ? document.type_key : null,
		state_key: typeof document.state_key === 'string' ? document.state_key : null,
		description: typeof document.description === 'string' ? document.description : null,
		created_at: typeof document.created_at === 'string' ? document.created_at : null,
		updated_at: typeof document.updated_at === 'string' ? document.updated_at : null,
		content_length: contentLength,
		markdown_outline: outline
	};
}

async function loadAccessibleProjectSummaries(
	context: AgenticChatSharedReadContextV1
): Promise<any[]> {
	const summaries = await context.access.resolveProjectSummaries();
	return summaries
		.map((project: any) => ({
			id: project.id,
			name: project.name,
			description: project.description,
			type_key: project.type_key,
			state_key: project.state_key,
			props: project.props,
			facet_context: project.facet_context,
			facet_scale: project.facet_scale,
			facet_stage: project.facet_stage,
			created_at: project.created_at,
			updated_at: project.updated_at,
			access_role: project.access_role,
			access_level: project.access_level,
			is_shared: project.is_shared,
			task_count: project.task_count,
			goal_count: project.goal_count,
			plan_count: project.plan_count,
			document_count: project.document_count,
			next_step_short: project.next_step_short,
			next_step_long: project.next_step_long,
			next_step_source: project.next_step_source,
			next_step_updated_at: project.next_step_updated_at
		}))
		.sort((a, b) => {
			const aTime = Date.parse(a.updated_at ?? a.created_at ?? '');
			const bTime = Date.parse(b.updated_at ?? b.created_at ?? '');
			return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
		});
}

async function loadCompactProjectDetails(
	context: AgenticChatSharedReadContextV1,
	projectId: string
): Promise<Record<string, any> | null> {
	await context.access.assertProjectAccess(projectId, 'read');
	const supabase = context.client as any;

	const [
		projectResult,
		goalsResult,
		requirementsResult,
		plansResult,
		tasksResult,
		documentsResult,
		milestonesResult,
		risksResult,
		contextDocResult
	] = await Promise.all([
		supabase
			.from('onto_projects')
			.select(
				'id, name, description, type_key, state_key, created_at, updated_at, next_step_short, next_step_long'
			)
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle(),
		supabase
			.from('onto_goals')
			.select(
				'id, project_id, name, description, type_key, state_key, target_date, completed_at, updated_at',
				{ count: 'exact' }
			)
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(8),
		supabase
			.from('onto_requirements')
			.select('id, project_id, text, type_key, priority, created_at, updated_at', {
				count: 'exact'
			})
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.order('priority', { ascending: false, nullsFirst: false })
			.order('updated_at', { ascending: false, nullsFirst: false })
			.limit(8),
		supabase
			.from('onto_plans')
			.select('id, project_id, name, description, type_key, state_key, updated_at', {
				count: 'exact'
			})
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(8),
		supabase
			.from('onto_tasks')
			.select(
				'id, project_id, title, description, type_key, state_key, priority, due_at, completed_at, updated_at, archived_at',
				{ count: 'exact' }
			)
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.is('archived_at', null)
			.order('updated_at', { ascending: false })
			.limit(12),
		supabase
			.from('onto_documents')
			.select(
				'id, project_id, title, description, type_key, state_key, created_at, updated_at, archived_at',
				{ count: 'exact' }
			)
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.is('archived_at', null)
			.order('updated_at', { ascending: false })
			.limit(12),
		supabase
			.from('onto_milestones')
			.select(
				'id, project_id, title, description, type_key, state_key, due_at, completed_at, updated_at',
				{ count: 'exact' }
			)
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.order('due_at', { ascending: true, nullsFirst: false })
			.limit(8),
		supabase
			.from('onto_risks')
			.select('id, project_id, title, type_key, state_key, impact, probability, updated_at', {
				count: 'exact'
			})
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.is('archived_at', null)
			.order('updated_at', { ascending: false })
			.limit(8),
		supabase
			.from('onto_documents')
			.select(
				'id, project_id, title, description, type_key, state_key, props, created_at, updated_at, archived_at'
			)
			.eq('project_id', projectId)
			.eq('type_key', 'document.context.project')
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(20)
	]);

	throwFirstQueryError([
		{ label: 'project', error: projectResult.error },
		{ label: 'goals', error: goalsResult.error },
		{ label: 'requirements', error: requirementsResult.error },
		{ label: 'plans', error: plansResult.error },
		{ label: 'tasks', error: tasksResult.error },
		{ label: 'documents', error: documentsResult.error },
		{ label: 'milestones', error: milestonesResult.error },
		{ label: 'risks', error: risksResult.error },
		{ label: 'context document', error: contextDocResult.error }
	]);

	const project = projectResult.data;
	if (!project) {
		return null;
	}

	const contextDocumentRaw = contextDocResult.data ?? null;
	const contextDocument = Array.isArray(contextDocumentRaw)
		? pickStartHereDocument(contextDocumentRaw)
		: contextDocumentRaw;

	return stripInternalPayloadFields({
		project,
		counts: {
			goals: getResultCount(goalsResult),
			requirements: getResultCount(requirementsResult),
			plans: getResultCount(plansResult),
			tasks: getResultCount(tasksResult),
			documents: getResultCount(documentsResult),
			milestones: getResultCount(milestonesResult),
			risks: getResultCount(risksResult)
		},
		limits: {
			goals: 8,
			requirements: 8,
			plans: 8,
			tasks: 12,
			documents: 12,
			milestones: 8,
			risks: 8
		},
		goals: getCountedRows(goalsResult),
		requirements: getCountedRows(requirementsResult),
		plans: getCountedRows(plansResult),
		tasks: getCountedRows(tasksResult),
		documents: getCountedRows(documentsResult),
		milestones: getCountedRows(milestonesResult),
		risks: getCountedRows(risksResult),
		context_document: contextDocument,
		source: 'compact_agent_project_context'
	});
}

async function loadAgentDocumentDetails(
	context: AgenticChatSharedReadContextV1,
	documentId: string
): Promise<Record<string, any> | null> {
	const supabase = context.client as any;

	// SECURITY (S3 extraction map, correction 2): resolve the document's project
	// and assert access BEFORE fetching the full body, so a service-role host
	// never pulls content the actor cannot read. The legacy web executor fetched
	// the body first and only then checked access (harmless under RLS, fail-open
	// under a service-role client).
	const { data: documentRef, error: refError } = await supabase
		.from('onto_documents')
		.select('id, project_id')
		.eq('id', documentId)
		.is('deleted_at', null)
		.maybeSingle();

	if (refError) throw refError;
	if (!documentRef) return null;

	await context.access.assertProjectAccess(documentRef.project_id, 'read');

	const { data: document, error } = await supabase
		.from('onto_documents')
		.select(
			'id, project_id, title, description, type_key, state_key, content, props, children, created_at, updated_at, archived_at'
		)
		.eq('id', documentId)
		.is('deleted_at', null)
		.maybeSingle();

	if (error) throw error;
	if (!document) return null;

	return stripInternalPayloadFields({
		document,
		source: 'agent_document_detail_projection'
	});
}

// ============================================
// LIST OPERATIONS
// ============================================

export async function listOntoProjects(
	context: AgenticChatSharedReadContextV1,
	args: SharedListOntoProjectsArgs
): Promise<{
	projects: any[];
	total: number;
	message: string;
}> {
	let projects = await loadAccessibleProjectSummaries(context);
	const normalizedState = normalizeProjectState(args.state_key);
	if (normalizedState) {
		projects = projects.filter((project) => project.state_key === normalizedState);
	} else {
		projects = projects.filter((project) => project.state_key !== 'paused');
	}

	if (args.type_key) {
		projects = projects.filter((project) => project.type_key === args.type_key);
	}

	const limit = Math.min(args.limit ?? 20, 50);
	const limited = projects.slice(0, limit);

	return {
		projects: limited,
		total: projects.length,
		message: `Found ${limited.length} ontology projects. Use get_onto_project_details for full context.`
	};
}

export async function listOntoTasks(
	context: AgenticChatSharedReadContextV1,
	args: SharedListOntoTasksArgs
): Promise<{
	tasks: any[];
	total: number;
	message: string;
}> {
	let query = (context.client as any)
		.from('onto_tasks')
		.select(
			`
				id,
				project_id,
				title,
				description,
				type_key,
				state_key,
				priority,
				start_at,
				due_at,
				completed_at,
				props,
				project:onto_projects(name)
			`,
			{ count: 'exact' }
		)
		.order('updated_at', { ascending: false });

	query = applyArchivedReadFilter(query, args);
	({ q: query } = await scopeEntityQueryToReadableProject(context, query, args.project_id));

	const normalizedState = normalizeTaskStateInput(args.state_key);
	if (normalizedState) {
		query = query.eq('state_key', normalizedState);
	}

	const limit = Math.min(args.limit ?? 20, 50);
	query = query.limit(limit);

	const { data, count, error } = await query;
	if (error) throw error;

	const normalized = (data ?? []).map((task: any) => {
		const projectName = Array.isArray(task.project)
			? task.project[0]?.name
			: task.project?.name;
		const { project, ...rest } = task;
		return {
			...rest,
			project_name: projectName ?? null
		};
	});

	return {
		tasks: normalized,
		total: count ?? normalized.length,
		message: `Found ${normalized.length} ontology tasks. Use get_onto_task_details for full information.`
	};
}

export async function listOntoGoals(
	context: AgenticChatSharedReadContextV1,
	args: SharedListOntoGoalsArgs
): Promise<{
	goals: any[];
	total: number;
	message: string;
}> {
	let query = (context.client as any)
		.from('onto_goals')
		.select(
			'id, project_id, name, type_key, description, target_date, state_key, props, created_at, updated_at',
			{ count: 'exact' }
		)
		.order('created_at', { ascending: false });

	query = applyArchivedReadFilter(query, args);
	({ q: query } = await scopeEntityQueryToReadableProject(context, query, args.project_id));

	const limit = Math.min(args.limit ?? 20, 50);
	query = query.limit(limit);

	const { data, count, error } = await query;
	if (error) throw error;

	return {
		goals: data ?? [],
		total: count ?? data?.length ?? 0,
		message: `Found ${data?.length ?? 0} ontology goals.`
	};
}

export async function listOntoPlans(
	context: AgenticChatSharedReadContextV1,
	args: SharedListOntoPlansArgs
): Promise<{
	plans: any[];
	total: number;
	message: string;
}> {
	let query = (context.client as any)
		.from('onto_plans')
		.select(
			'id, project_id, name, state_key, type_key, description, props, created_at, updated_at',
			{
				count: 'exact'
			}
		)
		.order('updated_at', { ascending: false });

	query = applyArchivedReadFilter(query, args);
	({ q: query } = await scopeEntityQueryToReadableProject(context, query, args.project_id));

	const limit = Math.min(args.limit ?? 20, 50);
	query = query.limit(limit);

	const { data, count, error } = await query;
	if (error) throw error;

	return {
		plans: data ?? [],
		total: count ?? data?.length ?? 0,
		message: `Found ${data?.length ?? 0} ontology plans.`
	};
}

export async function listOntoDocuments(
	context: AgenticChatSharedReadContextV1,
	args: SharedListOntoDocumentsArgs
): Promise<{
	documents: any[];
	total: number;
	message: string;
}> {
	let query = (context.client as any)
		.from('onto_documents')
		.select('id, project_id, title, type_key, state_key, description, created_at, updated_at', {
			count: 'exact'
		})
		.order('updated_at', { ascending: false });

	query = applyArchivedReadFilter(query, args);
	({ q: query } = await scopeEntityQueryToReadableProject(context, query, args.project_id));

	if (args.type_key) {
		query = query.eq('type_key', args.type_key);
	}

	if (args.state_key) {
		query = query.eq('state_key', args.state_key);
	}

	const limit = Math.min(args.limit ?? 20, 50);
	query = query.limit(limit);

	const { data, count, error } = await query;
	if (error) throw error;
	const documents = (data ?? []).map((document: any) => summarizeDocumentForList(document));

	return {
		documents,
		total: count ?? documents.length,
		message: `Found ${documents.length} ontology documents. Use get_onto_document_details for full document content.`
	};
}

export async function listOntoMilestones(
	context: AgenticChatSharedReadContextV1,
	args: SharedListOntoMilestonesArgs
): Promise<{
	milestones: any[];
	total: number;
	message: string;
}> {
	let query = (context.client as any)
		.from('onto_milestones')
		.select(
			'id, project_id, title, due_at, state_key, description, type_key, props, created_at, updated_at',
			{ count: 'exact' }
		)
		.order('due_at', { ascending: true, nullsFirst: true });

	query = applyArchivedReadFilter(query, args);
	({ q: query } = await scopeEntityQueryToReadableProject(context, query, args.project_id));

	if (args.state_key) {
		query = query.eq('state_key', args.state_key);
	}

	const limit = Math.min(args.limit ?? 20, 50);
	query = query.limit(limit);

	const { data, count, error } = await query;
	if (error) throw error;

	return {
		milestones: data ?? [],
		total: count ?? data?.length ?? 0,
		message: `Found ${data?.length ?? 0} ontology milestones.`
	};
}

export async function listOntoRisks(
	context: AgenticChatSharedReadContextV1,
	args: SharedListOntoRisksArgs
): Promise<{
	risks: any[];
	total: number;
	message: string;
}> {
	let query = (context.client as any)
		.from('onto_risks')
		.select(
			'id, project_id, title, impact, probability, state_key, content, type_key, props, created_at, updated_at',
			{ count: 'exact' }
		)
		.order('updated_at', { ascending: false });

	query = applyArchivedReadFilter(query, args);
	({ q: query } = await scopeEntityQueryToReadableProject(context, query, args.project_id));

	if (args.state_key) {
		query = query.eq('state_key', args.state_key);
	}

	if (args.impact) {
		query = query.eq('impact', args.impact);
	}

	const limit = Math.min(args.limit ?? 20, 50);
	query = query.limit(limit);

	const { data, count, error } = await query;
	if (error) throw error;

	return {
		risks: data ?? [],
		total: count ?? data?.length ?? 0,
		message: `Found ${data?.length ?? 0} ontology risks.`
	};
}

// ============================================
// SEARCH OPERATIONS
// ============================================

export async function searchOntoProjects(
	context: AgenticChatSharedReadContextV1,
	args: SharedSearchOntoProjectsArgs
): Promise<{
	projects: any[];
	total: number;
	message: string;
	rejected_query?: boolean;
	materialized_tools?: string[];
}> {
	const searchTerm = resolveSearchTerm(args);
	if (!searchTerm) {
		throw new Error('Search term is required for search_onto_projects');
	}
	if (isPlainSearchTermTooBroad(searchTerm)) {
		return {
			projects: [],
			total: 0,
			rejected_query: true,
			materialized_tools: ['get_workspace_overview'],
			message: `Project search query "${searchTerm}" is too broad. Use get_workspace_overview for project inventory/status, or search with a specific project keyword of at least two non-stopword characters.`
		};
	}

	let projects = (await loadAccessibleProjectSummaries(context)).filter((project) =>
		matchesKeywordSearch([project.name, project.description], searchTerm)
	);

	if (args.state_key) {
		projects = projects.filter((project) => project.state_key === args.state_key);
	} else {
		projects = projects.filter((project) => project.state_key !== 'paused');
	}

	if (args.type_key) {
		projects = projects.filter((project) => project.type_key === args.type_key);
	}

	const limit = Math.min(args.limit ?? 10, 30);
	const limited = projects.slice(0, limit);

	return {
		projects: limited,
		total: projects.length,
		message: `Found ${limited.length} projects matching "${searchTerm}".`
	};
}

export async function searchOntoTasks(
	context: AgenticChatSharedReadContextV1,
	args: SharedSearchOntoTasksArgs
): Promise<{
	tasks: any[];
	total: number;
	message: string;
}> {
	const searchTerm = resolveSearchTerm(args);
	if (!searchTerm) {
		throw new Error('Search term is required for search_onto_tasks');
	}

	let query = (context.client as any)
		.from('onto_tasks')
		.select(
			`
				id,
				project_id,
				title,
				description,
				type_key,
				state_key,
				priority,
				start_at,
				due_at,
				completed_at,
				props,
				project:onto_projects(name)
			`,
			{ count: 'exact' }
		)
		.order('updated_at', { ascending: false });

	query = applyKeywordSearch(query, searchTerm, ['title', 'description']);

	query = applyArchivedReadFilter(query, args);
	({ q: query } = await scopeEntityQueryToReadableProject(context, query, args.project_id));

	const normalizedState = normalizeTaskStateInput(args.state_key);
	if (normalizedState) {
		query = query.eq('state_key', normalizedState);
	}

	const limit = Math.min(args.limit ?? 20, 50);
	query = query.limit(limit);

	const { data, count, error } = await query;
	if (error) throw error;

	const normalized = (data ?? []).map((task: any) => {
		const projectName = Array.isArray(task.project)
			? task.project[0]?.name
			: task.project?.name;
		const { project, ...rest } = task;
		return {
			...rest,
			project_name: projectName ?? null
		};
	});

	return {
		tasks: normalized,
		total: count ?? normalized.length,
		message: `Found ${normalized.length} tasks matching "${searchTerm}".`
	};
}

export async function searchOntoGoals(
	context: AgenticChatSharedReadContextV1,
	args: SharedSearchOntoGoalsArgs
): Promise<{
	goals: any[];
	total: number;
	message: string;
}> {
	const searchTerm = resolveSearchTerm(args);
	if (!searchTerm) {
		throw new Error('Search term is required for search_onto_goals');
	}

	let query = (context.client as any)
		.from('onto_goals')
		.select(
			'id, project_id, name, type_key, description, target_date, state_key, props, created_at, updated_at',
			{ count: 'exact' }
		)
		.order('updated_at', { ascending: false });

	query = applyKeywordSearch(query, searchTerm, ['name', 'description']);

	query = applyArchivedReadFilter(query, args);
	({ q: query } = await scopeEntityQueryToReadableProject(context, query, args.project_id));

	const limit = Math.min(args.limit ?? 20, 50);
	query = query.limit(limit);

	const { data, count, error } = await query;
	if (error) throw error;

	return {
		goals: data ?? [],
		total: count ?? data?.length ?? 0,
		message: `Found ${data?.length ?? 0} goals matching "${searchTerm}".`
	};
}

export async function searchOntoPlans(
	context: AgenticChatSharedReadContextV1,
	args: SharedSearchOntoPlansArgs
): Promise<{
	plans: any[];
	total: number;
	message: string;
}> {
	const searchTerm = resolveSearchTerm(args);
	if (!searchTerm) {
		throw new Error('Search term is required for search_onto_plans');
	}

	let query = (context.client as any)
		.from('onto_plans')
		.select(
			'id, project_id, name, state_key, type_key, description, props, created_at, updated_at',
			{ count: 'exact' }
		)
		.order('updated_at', { ascending: false });

	query = applyKeywordSearch(query, searchTerm, ['name', 'description']);

	query = applyArchivedReadFilter(query, args);
	({ q: query } = await scopeEntityQueryToReadableProject(context, query, args.project_id));

	const limit = Math.min(args.limit ?? 20, 50);
	query = query.limit(limit);

	const { data, count, error } = await query;
	if (error) throw error;

	return {
		plans: data ?? [],
		total: count ?? data?.length ?? 0,
		message: `Found ${data?.length ?? 0} plans matching "${searchTerm}".`
	};
}

export async function searchOntoDocuments(
	context: AgenticChatSharedReadContextV1,
	args: SharedSearchOntoDocumentsArgs
): Promise<{
	documents: any[];
	total: number;
	message: string;
}> {
	const searchTerm = resolveSearchTerm(args);
	if (!searchTerm) {
		throw new Error('Search term is required for search_onto_documents');
	}

	let query = (context.client as any)
		.from('onto_documents')
		.select('id, project_id, title, type_key, state_key, description, created_at, updated_at', {
			count: 'exact'
		})
		.order('updated_at', { ascending: false });

	// Match title, description, and body content (the body is matched but not
	// selected, so large documents are still summarized for the list payload).
	query = applyKeywordSearch(query, searchTerm, ['title', 'description', 'content']);

	query = applyArchivedReadFilter(query, args);
	({ q: query } = await scopeEntityQueryToReadableProject(context, query, args.project_id));

	if (args.type_key) {
		query = query.eq('type_key', args.type_key);
	}

	if (args.state_key) {
		query = query.eq('state_key', args.state_key);
	}

	const limit = Math.min(args.limit ?? 20, 50);
	query = query.limit(limit);

	const { data, count, error } = await query;
	if (error) throw error;
	const documents = (data ?? []).map((document: any) => summarizeDocumentForList(document));

	return {
		documents,
		total: count ?? documents.length,
		message: `Found ${documents.length} documents matching "${searchTerm}". Use get_onto_document_details for full document content.`
	};
}

export async function searchOntoMilestones(
	context: AgenticChatSharedReadContextV1,
	args: SharedSearchOntoMilestonesArgs
): Promise<{
	milestones: any[];
	total: number;
	message: string;
}> {
	const searchTerm = resolveSearchTerm(args);
	if (!searchTerm) {
		throw new Error('Search term is required for search_onto_milestones');
	}

	let query = (context.client as any)
		.from('onto_milestones')
		.select(
			'id, project_id, title, due_at, state_key, description, type_key, props, created_at, updated_at',
			{ count: 'exact' }
		)
		.order('due_at', { ascending: true, nullsFirst: true });

	query = applyKeywordSearch(query, searchTerm, ['title', 'description']);

	query = applyArchivedReadFilter(query, args);
	({ q: query } = await scopeEntityQueryToReadableProject(context, query, args.project_id));

	if (args.state_key) {
		query = query.eq('state_key', args.state_key);
	}

	const limit = Math.min(args.limit ?? 20, 50);
	query = query.limit(limit);

	const { data, count, error } = await query;
	if (error) throw error;

	return {
		milestones: data ?? [],
		total: count ?? data?.length ?? 0,
		message: `Found ${data?.length ?? 0} milestones matching "${searchTerm}".`
	};
}

export async function searchOntoRisks(
	context: AgenticChatSharedReadContextV1,
	args: SharedSearchOntoRisksArgs
): Promise<{
	risks: any[];
	total: number;
	message: string;
}> {
	const searchTerm = resolveSearchTerm(args);
	if (!searchTerm) {
		throw new Error('Search term is required for search_onto_risks');
	}

	let query = (context.client as any)
		.from('onto_risks')
		.select(
			'id, project_id, title, impact, probability, state_key, content, type_key, props, created_at, updated_at',
			{ count: 'exact' }
		)
		.order('updated_at', { ascending: false });

	query = applyKeywordSearch(query, searchTerm, ['title', 'content']);

	query = applyArchivedReadFilter(query, args);
	({ q: query } = await scopeEntityQueryToReadableProject(context, query, args.project_id));

	if (args.state_key) {
		query = query.eq('state_key', args.state_key);
	}

	if (args.impact) {
		query = query.eq('impact', args.impact);
	}

	const limit = Math.min(args.limit ?? 20, 50);
	query = query.limit(limit);

	const { data, count, error } = await query;
	if (error) throw error;

	return {
		risks: data ?? [],
		total: count ?? data?.length ?? 0,
		message: `Found ${data?.length ?? 0} risks matching "${searchTerm}".`
	};
}

// ============================================
// GET DETAILS OPERATIONS
// ============================================

export async function getOntoProjectDetails(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetOntoProjectDetailsArgs
): Promise<any> {
	const details = await loadCompactProjectDetails(context, args.project_id);
	if (!details) {
		return buildDetailNotFoundPayload({
			entityType: 'project',
			idKey: 'project_id',
			id: args.project_id,
			listTool: 'list_onto_projects',
			searchTool: 'search_onto_projects'
		});
	}

	return {
		...details,
		message: 'Compact ontology project details loaded.'
	};
}

export async function getOntoDocumentDetails(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetOntoDocumentDetailsArgs
): Promise<any> {
	const details = await loadAgentDocumentDetails(context, args.document_id);
	if (!details?.document) {
		return buildDetailNotFoundPayload({
			entityType: 'document',
			idKey: 'document_id',
			id: args.document_id,
			listTool: 'list_onto_documents',
			searchTool: 'search_onto_documents'
		});
	}

	return {
		...details,
		message: 'Complete ontology document details loaded.'
	};
}

/**
 * Project Knowledge Layer (L2): return just the heading outline of a document.
 * Cheap "what is this doc about" scan — lets the agent decide relevance and pick
 * a section to read without pulling the full body. Computed live from content.
 */
export async function getDocumentOutline(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetDocumentOutlineArgs
): Promise<any> {
	const details = await loadAgentDocumentDetails(context, args.document_id);
	const document = details?.document as Record<string, any> | undefined;
	if (!document) {
		return buildDetailNotFoundPayload({
			entityType: 'document',
			idKey: 'document_id',
			id: args.document_id,
			listTool: 'list_onto_documents',
			searchTool: 'search_onto_documents'
		});
	}

	const outline = extractOutline(typeof document.content === 'string' ? document.content : '');
	const headingCount = countOutlineNodes(outline.nodes);

	return {
		document_id: document.id,
		project_id: document.project_id,
		title: document.title ?? null,
		outline: outline.nodes,
		message:
			headingCount > 0
				? `Outline loaded: ${headingCount} headings. Use read_document_section with an anchor to read a specific section.`
				: 'This document has no markdown headings. Use get_onto_document_details to read the full body.'
	};
}

/**
 * Project Knowledge Layer (L2): return the body of one section by heading anchor.
 * Re-parses live content, so the slice is always correct even after edits. Lets
 * the agent zoom into the relevant part instead of loading the whole document.
 */
export async function readDocumentSection(
	context: AgenticChatSharedReadContextV1,
	args: SharedReadDocumentSectionArgs
): Promise<any> {
	const details = await loadAgentDocumentDetails(context, args.document_id);
	const document = details?.document as Record<string, any> | undefined;
	if (!document) {
		return buildDetailNotFoundPayload({
			entityType: 'document',
			idKey: 'document_id',
			id: args.document_id,
			listTool: 'list_onto_documents',
			searchTool: 'search_onto_documents'
		});
	}

	const content = typeof document.content === 'string' ? document.content : '';
	const anchor = typeof args.anchor === 'string' ? args.anchor.trim() : '';
	const section = getSectionByAnchor(content, anchor);

	if (!section.found) {
		const outline = extractOutline(content);
		const available = collectOutlineAnchors(outline.nodes);
		return {
			document_id: document.id,
			project_id: document.project_id,
			anchor,
			found: false,
			available_anchors: available,
			message:
				available.length > 0
					? `No section with anchor "${anchor}". Available anchors: ${available.join(', ')}. Call get_document_outline for the full structure.`
					: `No section with anchor "${anchor}". This document has no headings; use get_onto_document_details for the full body.`
		};
	}

	return {
		document_id: document.id,
		project_id: document.project_id,
		title: document.title ?? null,
		anchor: section.anchor,
		heading: section.heading,
		level: section.level,
		content: section.content,
		message: `Section "${section.heading}" loaded.`
	};
}
