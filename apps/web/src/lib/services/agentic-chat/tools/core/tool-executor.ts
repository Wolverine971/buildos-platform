// apps/web/src/lib/services/agentic-chat/tools/core/tool-executor.ts
/**
 * Chat Tool Executor - Ontology-First Implementation
 *
 * Executes tool calls for the BuildOS agentic chat system using API endpoints and
 * ontology tables (onto_*). Legacy task/project/calendar tools have been removed
 * in favor of ontology-specific operations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import { getToolCategory, ENTITY_FIELD_INFO } from './tools.config';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import {
	getBuildosOverviewDocument,
	getBuildosUsageGuide
} from '$lib/services/agentic-chat/tools/buildos';
import { performWebSearch, type WebSearchArgs } from '$lib/services/agentic-chat/tools/websearch';
import { OntologyContextLoader } from '$lib/services/ontology-context-loader';
import {
	formatLinkedEntitiesFullDetail,
	getLinkedEntitiesSummary
} from '$lib/services/linked-entity-context-formatter';
import type { OntologyEntityType } from '$lib/types/agent-chat-enhancement';

interface ListOntoTasksArgs {
	project_id?: string;
	state_key?: string;
	limit?: number;
}

interface SearchOntoTasksArgs {
	search: string;
	project_id?: string;
	state_key?: string;
	limit?: number;
}

interface ListOntoGoalsArgs {
	project_id?: string;
	limit?: number;
}

interface ListOntoPlansArgs {
	project_id?: string;
	limit?: number;
}

interface ListOntoProjectsArgs {
	state_key?: string;
	type_key?: string;
	limit?: number;
}

interface SearchOntoProjectsArgs {
	search: string;
	state_key?: string;
	type_key?: string;
	limit?: number;
}

interface GetOntoProjectDetailsArgs {
	project_id: string;
}

interface GetOntoTaskDetailsArgs {
	task_id: string;
}

interface GetEntityRelationshipsArgs {
	entity_id: string;
	direction?: 'outgoing' | 'incoming' | 'both';
}

interface GetLinkedEntitiesArgs {
	entity_id: string;
	entity_kind: 'task' | 'plan' | 'goal' | 'milestone' | 'document' | 'output';
	filter_kind?: 'task' | 'plan' | 'goal' | 'milestone' | 'document' | 'output' | 'all';
}

interface CreateOntoTaskArgs {
	project_id: string;
	title: string;
	description?: string;
	type_key?: string;
	state_key?: string;
	priority?: number;
	plan_id?: string;
	due_at?: string;
	props?: Record<string, unknown>;
}

interface CreateOntoGoalArgs {
	project_id: string;
	name: string;
	description?: string;
	type_key?: string;
	props?: Record<string, unknown>;
}

interface CreateOntoPlanArgs {
	project_id: string;
	name: string;
	description?: string;
	type_key?: string;
	state_key?: string;
	props?: Record<string, unknown>;
}

interface UpdateOntoTaskArgs {
	task_id: string;
	title?: string;
	description?: string;
	update_strategy?: 'replace' | 'append' | 'merge_llm';
	merge_instructions?: string;
	type_key?: string;
	state_key?: string;
	priority?: number;
	plan_id?: string;
	due_at?: string;
	props?: Record<string, unknown>;
}

interface UpdateOntoProjectArgs {
	project_id: string;
	name?: string;
	description?: string;
	state_key?: string;
	props?: Record<string, unknown>;
}

interface DeleteOntoTaskArgs {
	task_id: string;
}

interface DeleteOntoGoalArgs {
	goal_id: string;
}

interface DeleteOntoPlanArgs {
	plan_id: string;
}

interface UpdateOntoGoalArgs {
	goal_id: string;
	name?: string;
	description?: string;
	update_strategy?: 'replace' | 'append' | 'merge_llm';
	merge_instructions?: string;
	priority?: number;
	target_date?: string;
	measurement_criteria?: string;
	props?: Record<string, unknown>;
}

interface UpdateOntoPlanArgs {
	plan_id: string;
	name?: string;
	description?: string;
	update_strategy?: 'replace' | 'append' | 'merge_llm';
	merge_instructions?: string;
	start_date?: string;
	end_date?: string;
	state_key?: string;
	props?: Record<string, unknown>;
}

interface ListOntoDocumentsArgs {
	project_id?: string;
	type_key?: string;
	state_key?: string;
	limit?: number;
}

interface SearchOntoDocumentsArgs {
	search: string;
	project_id?: string;
	type_key?: string;
	state_key?: string;
	limit?: number;
}

interface SearchOntologyArgs {
	query: string;
	project_id?: string;
	types?: string[];
	limit?: number;
}

interface GetOntoDocumentDetailsArgs {
	document_id: string;
}

interface GetOntoGoalDetailsArgs {
	goal_id: string;
}

interface GetOntoPlanDetailsArgs {
	plan_id: string;
}

interface CreateOntoDocumentArgs {
	project_id: string;
	title: string;
	type_key: string;
	state_key?: string;
	body_markdown?: string;
	props?: Record<string, unknown>;
}

interface UpdateOntoDocumentArgs {
	document_id: string;
	title?: string;
	type_key?: string;
	state_key?: string;
	body_markdown?: string;
	update_strategy?: 'replace' | 'append' | 'merge_llm';
	merge_instructions?: string;
	props?: Record<string, unknown>;
}

interface DeleteOntoDocumentArgs {
	document_id: string;
}

interface ListTaskDocumentsArgs {
	task_id: string;
}

interface CreateTaskDocumentArgs {
	task_id: string;
	document_id?: string;
	title?: string;
	type_key?: string;
	state_key?: string;
	role?: string;
	body_markdown?: string;
	props?: Record<string, unknown>;
}

interface CreateOntoProjectArgs {
	project: {
		name: string;
		type_key: string;
		description?: string;
		also_types?: string[];
		state_key?: string;
		props?: {
			facets?: {
				context?: string;
				scale?: string;
				stage?: string;
			};
			[key: string]: unknown;
		};
		start_at?: string;
		end_at?: string;
	};
	goals?: Array<{
		name: string;
		type_key?: string;
		description?: string;
		props?: Record<string, unknown>;
	}>;
	requirements?: Array<{
		text: string;
		type_key?: string;
		props?: Record<string, unknown>;
	}>;
	plans?: Array<{
		name: string;
		type_key: string;
		state_key?: string;
		props?: Record<string, unknown>;
	}>;
	tasks?: Array<{
		title: string;
		type_key?: string;
		plan_name?: string;
		state_key?: string;
		priority?: number;
		due_at?: string;
		props?: Record<string, unknown>;
	}>;
	outputs?: Array<{
		name: string;
		type_key: string;
		state_key?: string;
		props?: Record<string, unknown>;
	}>;
	documents?: Array<{
		title: string;
		type_key: string;
		state_key?: string;
		body_markdown?: string;
		props?: Record<string, unknown>;
	}>;
	context_document?: {
		title: string;
		body_markdown: string;
		type_key?: string;
		state_key?: string;
		props?: Record<string, unknown>;
	};
	clarifications?: Array<{
		key: string;
		question: string;
		required: boolean;
		choices?: string[];
		help_text?: string;
	}>;
	meta?: Record<string, unknown>;
}

function extractMetaString(
	meta: Record<string, unknown> | undefined,
	key: string
): string | undefined {
	if (!meta) return undefined;
	const value = meta[key];
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function buildContextDocumentSpec(
	args: CreateOntoProjectArgs
): CreateOntoProjectArgs['context_document'] {
	const provided = args.context_document;
	if (provided?.title?.trim() && provided?.body_markdown?.trim()) {
		return {
			...provided,
			type_key: provided.type_key ?? 'document.context.project',
			state_key: provided.state_key ?? 'active'
		};
	}

	const meta = (args.meta ?? {}) as Record<string, unknown>;
	const braindump = extractMetaString(meta, 'braindump');
	const summary =
		extractMetaString(meta, 'summary') ??
		(args.project.description ? args.project.description.trim() : '');

	const goalsSection = (args.goals ?? [])
		.map((goal) => `- ${goal.name}${goal.description ? ` — ${goal.description}` : ''}`)
		.join('\n');

	const tasksSection = (args.tasks ?? [])
		.map(
			(task) =>
				`- ${task.title}${task.plan_name ? ` (Plan: ${task.plan_name})` : ''}${
					task.state_key ? ` · ${task.state_key}` : ''
				}`
		)
		.join('\n');

	const body = [
		`# ${args.project.name} Context Document`,
		'## Vision & Summary',
		summary || 'Not provided yet.',
		'## Braindump / Spark',
		braindump || 'Not provided yet.',
		'## Initial Goals',
		goalsSection || 'No goals captured yet.',
		'## Initial Tasks / Threads',
		tasksSection || 'No starter tasks captured yet.'
	].join('\n\n');

	return {
		title: `${args.project.name} Context Document`,
		body_markdown: body,
		type_key: 'document.context.project',
		state_key: 'active',
		props: {
			source: 'agent_project_creation',
			generated_at: new Date().toISOString(),
			braindump: braindump || undefined
		}
	};
}

export class ChatToolExecutor {
	private sessionId?: string;
	private fetchFn: typeof fetch;
	private actorId?: string;
	private adminSupabase?: TypedSupabaseClient;
	private llmService?: SmartLLMService;

	constructor(
		private supabase: SupabaseClient,
		private userId: string,
		sessionId?: string,
		fetchFn?: typeof fetch,
		llmService?: SmartLLMService
	) {
		this.sessionId = sessionId;
		this.fetchFn = fetchFn || fetch;
		this.llmService = llmService;
	}

	setSessionId(sessionId: string): void {
		this.sessionId = sessionId;
	}

	private getAdminSupabase(): TypedSupabaseClient {
		if (!this.adminSupabase) {
			this.adminSupabase = createAdminSupabaseClient();
		}
		return this.adminSupabase;
	}

	private async getActorId(): Promise<string> {
		if (!this.actorId) {
			this.actorId = await ensureActorId(this.supabase as any, this.userId);
		}
		return this.actorId;
	}

	private async getAuthHeaders(): Promise<HeadersInit> {
		const {
			data: { session }
		} = await this.supabase.auth.getSession();

		return {
			'Content-Type': 'application/json',
			Authorization: session?.access_token ? `Bearer ${session.access_token}` : ''
		};
	}

	private async apiRequest<T = any>(path: string, options: RequestInit = {}): Promise<T> {
		const headers = await this.getAuthHeaders();
		const method = options.method || 'GET';

		const response = await this.fetchFn(path, {
			...options,
			headers: {
				...headers,
				...(options.headers || {})
			}
		});

		if (!response.ok) {
			let errorMessage = `${response.status} ${response.statusText}`;
			let errorDetails: any = null;

			// Try to extract error details from response body
			const contentType = response.headers.get('content-type');
			if (contentType?.includes('application/json')) {
				try {
					const errorPayload = await response.json();
					errorMessage = errorPayload.error || errorPayload.message || errorMessage;
					errorDetails = errorPayload.details;
				} catch (jsonError) {
					// Log JSON parse failure for debugging - don't silently swallow
					console.warn('[ChatToolExecutor] Failed to parse error response as JSON:', {
						path,
						status: response.status,
						contentType,
						parseError:
							jsonError instanceof Error ? jsonError.message : String(jsonError)
					});
				}
			} else {
				// Non-JSON error response, try to get text
				try {
					const textBody = await response.text();
					if (textBody.length > 0 && textBody.length < 500) {
						errorMessage = `${errorMessage}: ${textBody}`;
					}
				} catch {
					// Ignore text extraction failure
				}
			}

			throw new Error(
				`API ${method} ${path} failed: ${errorMessage}${
					errorDetails ? ` (${JSON.stringify(errorDetails)})` : ''
				}`
			);
		}

		// Validate Content-Type before parsing JSON response
		const responseContentType = response.headers.get('content-type');
		if (!responseContentType?.includes('application/json')) {
			console.warn('[ChatToolExecutor] Response is not JSON:', {
				path,
				contentType: responseContentType
			});
			// Try to return raw text if not JSON
			const text = await response.text();
			try {
				// Maybe it's JSON without proper content-type
				return JSON.parse(text);
			} catch {
				return { data: text };
			}
		}

		const payload = await response.json();
		return payload?.data ?? payload;
	}

	async execute(toolCall: ChatToolCall): Promise<ChatToolResult> {
		const startTime = Date.now();

		try {
			const rawArgs = toolCall.function.arguments || '{}';
			const args = rawArgs ? JSON.parse(rawArgs) : {};
			let result: any;

			switch (toolCall.function.name) {
				case 'get_field_info':
					result = await this.getFieldInfo(
						args as { entity_type: string; field_name?: string }
					);
					break;
				case 'get_buildos_overview':
					result = getBuildosOverviewDocument();
					break;
				case 'get_buildos_usage_guide':
					result = getBuildosUsageGuide();
					break;
				case 'web_search':
					result = await performWebSearch(args as WebSearchArgs, this.fetchFn);
					break;

				case 'list_onto_projects':
					result = await this.listOntoProjects(args as ListOntoProjectsArgs);
					break;

				case 'search_onto_projects':
					result = await this.searchOntoProjects(args as SearchOntoProjectsArgs);
					break;

				case 'list_onto_tasks':
					result = await this.listOntoTasks(args as ListOntoTasksArgs);
					break;

				case 'search_onto_tasks':
					result = await this.searchOntoTasks(args as SearchOntoTasksArgs);
					break;

				case 'list_onto_plans':
					result = await this.listOntoPlans(args as ListOntoPlansArgs);
					break;

				case 'list_onto_goals':
					result = await this.listOntoGoals(args as ListOntoGoalsArgs);
					break;

				case 'list_onto_documents':
					result = await this.listOntoDocuments(args as ListOntoDocumentsArgs);
					break;
				case 'search_onto_documents':
					result = await this.searchOntoDocuments(args as SearchOntoDocumentsArgs);
					break;
				case 'search_ontology':
					result = await this.searchOntology(args as SearchOntologyArgs);
					break;

				case 'get_onto_project_details':
					result = await this.getOntoProjectDetails(args as GetOntoProjectDetailsArgs);
					break;

				case 'get_onto_task_details':
					result = await this.getOntoTaskDetails(args as GetOntoTaskDetailsArgs);
					break;

				case 'get_onto_goal_details':
					result = await this.getOntoGoalDetails(args as GetOntoGoalDetailsArgs);
					break;

				case 'get_onto_plan_details':
					result = await this.getOntoPlanDetails(args as GetOntoPlanDetailsArgs);
					break;

				case 'get_onto_document_details':
					result = await this.getOntoDocumentDetails(args as GetOntoDocumentDetailsArgs);
					break;

				case 'list_task_documents':
					result = await this.listTaskDocuments(args as ListTaskDocumentsArgs);
					break;

				case 'create_task_document':
					result = await this.createTaskDocument(args as CreateTaskDocumentArgs);
					break;

				case 'get_entity_relationships':
					result = await this.getEntityRelationships(args as GetEntityRelationshipsArgs);
					break;

				case 'get_linked_entities':
					result = await this.getLinkedEntities(args as GetLinkedEntitiesArgs);
					break;

				case 'create_onto_project':
					result = await this.createOntoProject(args as CreateOntoProjectArgs);
					break;

				case 'create_onto_task':
					result = await this.createOntoTask(args as CreateOntoTaskArgs);
					break;

				case 'create_onto_goal':
					result = await this.createOntoGoal(args as CreateOntoGoalArgs);
					break;

				case 'create_onto_plan':
					result = await this.createOntoPlan(args as CreateOntoPlanArgs);
					break;
				case 'create_onto_document':
					result = await this.createOntoDocument(args as CreateOntoDocumentArgs);
					break;

				case 'update_onto_project':
					result = await this.updateOntoProject(args as UpdateOntoProjectArgs);
					break;

				case 'update_onto_task':
					result = await this.updateOntoTask(args as UpdateOntoTaskArgs);
					break;

				case 'update_onto_goal':
					result = await this.updateOntoGoal(args as UpdateOntoGoalArgs);
					break;

				case 'update_onto_plan':
					result = await this.updateOntoPlan(args as UpdateOntoPlanArgs);
					break;

				case 'update_onto_document':
					result = await this.updateOntoDocument(args as UpdateOntoDocumentArgs);
					break;

				case 'delete_onto_task':
					result = await this.deleteOntoTask(args as DeleteOntoTaskArgs);
					break;

				case 'delete_onto_goal':
					result = await this.deleteOntoGoal(args as DeleteOntoGoalArgs);
					break;

				case 'delete_onto_plan':
					result = await this.deleteOntoPlan(args as DeleteOntoPlanArgs);
					break;

				case 'delete_onto_document':
					result = await this.deleteOntoDocument(args as DeleteOntoDocumentArgs);
					break;

				default:
					throw new Error(`Unknown tool: ${toolCall.function.name}`);
			}

			const duration = Date.now() - startTime;
			const { payload, streamEvents } = this.extractStreamEvents(result);
			await this.logToolExecution(toolCall, payload, duration, true);

			return {
				tool_call_id: toolCall.id,
				result: payload,
				success: true,
				duration_ms: duration,
				stream_events: streamEvents
			};
		} catch (error: any) {
			const duration = Date.now() - startTime;
			let errorMessage = error?.message || 'Tool execution failed';
			const toolName = toolCall.function.name;

			if (!errorMessage.includes(toolName)) {
				errorMessage = `Tool '${toolName}' failed: ${errorMessage}`;
			}

			if (errorMessage.includes('401')) {
				errorMessage += ' (authentication required)';
			} else if (errorMessage.includes('404')) {
				errorMessage += ' (resource not found)';
			}

			await this.logToolExecution(toolCall, null, duration, false, errorMessage);

			console.error('[ChatToolExecutor] Tool execution failed:', {
				tool: toolName,
				error: errorMessage,
				duration_ms: duration
			});

			return {
				tool_call_id: toolCall.id,
				result: null,
				success: false,
				error: errorMessage
			};
		}
	}

	private extractStreamEvents(result: any): { payload: any; streamEvents?: any[] } {
		if (!result || typeof result !== 'object') {
			return { payload: result };
		}

		const maybe = result as Record<string, any>;
		if (!('_stream_events' in maybe)) {
			return { payload: result };
		}

		const events = Array.isArray(maybe._stream_events) ? maybe._stream_events : undefined;
		const payload = Array.isArray(result) ? [...(result as any[])] : { ...maybe };
		if (!Array.isArray(payload)) {
			delete (payload as Record<string, any>)._stream_events;
		}
		return { payload, streamEvents: events };
	}

	private async getFieldInfo(args: { entity_type: string; field_name?: string }): Promise<{
		entity_type: string;
		fields: Record<string, unknown>;
		message: string;
	}> {
		const { entity_type, field_name } = args;

		// Validate entity_type is provided
		// The entity_type specifies which ontology entity's field schema to return,
		// which is needed to know what properties are available for creation/update operations
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

	private async listOntoProjects(args: ListOntoProjectsArgs): Promise<{
		projects: any[];
		total: number;
		message: string;
	}> {
		const actorId = await this.getActorId();
		let query = this.supabase
			.from('onto_projects')
			.select(
				`
					id,
					name,
					description,
					type_key,
					state_key,
					props,
					facet_context,
					facet_scale,
					facet_stage,
					created_at,
					updated_at
				`,
				{ count: 'exact' }
			)
			.eq('created_by', actorId)
			.order('updated_at', { ascending: false });

		if (args.state_key) {
			query = query.eq('state_key', args.state_key);
		}

		if (args.type_key) {
			query = query.eq('type_key', args.type_key);
		}

		const limit = Math.min(args.limit ?? 20, 50);
		query = query.limit(limit);

		const { data, count, error } = await query;
		if (error) throw error;

		return {
			projects: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} ontology projects. Use get_onto_project_details for full context.`
		};
	}

	private async searchOntoProjects(args: SearchOntoProjectsArgs): Promise<{
		projects: any[];
		total: number;
		message: string;
	}> {
		const searchTerm = this.prepareSearchTerm(args.search);
		if (!searchTerm) {
			throw new Error('Search term is required for search_onto_projects');
		}

		const actorId = await this.getActorId();
		const likePattern = `%${searchTerm}%`;

		let query = this.supabase
			.from('onto_projects')
			.select(
				`
					id,
					name,
					description,
					type_key,
					state_key,
					facet_context,
					facet_scale,
					facet_stage,
					created_at,
					updated_at
				`,
				{ count: 'exact' }
			)
			.eq('created_by', actorId)
			.order('updated_at', { ascending: false })
			.or(`name.ilike.${likePattern},description.ilike.${likePattern}`);

		if (args.state_key) {
			query = query.eq('state_key', args.state_key);
		}

		if (args.type_key) {
			query = query.eq('type_key', args.type_key);
		}

		const limit = Math.min(args.limit ?? 10, 30);
		query = query.limit(limit);

		const { data, count, error } = await query;
		if (error) throw error;

		return {
			projects: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} projects matching "${args.search}".`
		};
	}

	private async listOntoTasks(args: ListOntoTasksArgs): Promise<{
		tasks: any[];
		total: number;
		message: string;
	}> {
		const actorId = await this.getActorId();
		// Note: plan_id is no longer a column on onto_tasks - relationships are stored in onto_edges
		let query = this.supabase
			.from('onto_tasks')
			.select(
				`
					id,
					project_id,
					title,
					type_key,
					state_key,
					priority,
					due_at,
					props,
					project:onto_projects(name)
				`,
				{ count: 'exact' }
			)
			.eq('created_by', actorId)
			.order('updated_at', { ascending: false });

		if (args.project_id) {
			await this.assertProjectOwnership(args.project_id, actorId);
			query = query.eq('project_id', args.project_id);
		}

		if (args.state_key) {
			query = query.eq('state_key', args.state_key);
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

	private async searchOntoTasks(args: SearchOntoTasksArgs): Promise<{
		tasks: any[];
		total: number;
		message: string;
	}> {
		const searchTerm = this.prepareSearchTerm(args.search);
		if (!searchTerm) {
			throw new Error('Search term is required for search_onto_tasks');
		}

		const actorId = await this.getActorId();
		// Note: plan_id is no longer a column on onto_tasks - relationships are stored in onto_edges
		let query = this.supabase
			.from('onto_tasks')
			.select(
				`
					id,
					project_id,
					title,
					type_key,
					state_key,
					priority,
					due_at,
					props,
					project:onto_projects(name)
				`,
				{ count: 'exact' }
			)
			.eq('created_by', actorId)
			.order('updated_at', { ascending: false })
			.ilike('title', `%${searchTerm}%`);

		if (args.project_id) {
			await this.assertProjectOwnership(args.project_id, actorId);
			query = query.eq('project_id', args.project_id);
		}

		if (args.state_key) {
			query = query.eq('state_key', args.state_key);
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
			message: `Found ${normalized.length} tasks matching "${args.search}".`
		};
	}

	private async listOntoPlans(args: ListOntoPlansArgs): Promise<{
		plans: any[];
		total: number;
		message: string;
	}> {
		const actorId = await this.getActorId();
		let query = this.supabase
			.from('onto_plans')
			.select('id, project_id, name, state_key, type_key, props, created_at, updated_at', {
				count: 'exact'
			})
			.eq('created_by', actorId)
			.order('updated_at', { ascending: false });

		if (args.project_id) {
			await this.assertProjectOwnership(args.project_id, actorId);
			query = query.eq('project_id', args.project_id);
		}

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

	private async listOntoGoals(args: ListOntoGoalsArgs): Promise<{
		goals: any[];
		total: number;
		message: string;
	}> {
		const actorId = await this.getActorId();
		let query = this.supabase
			.from('onto_goals')
			.select('id, project_id, name, type_key, props, created_at', { count: 'exact' })
			.eq('created_by', actorId)
			.order('created_at', { ascending: false });

		if (args.project_id) {
			await this.assertProjectOwnership(args.project_id, actorId);
			query = query.eq('project_id', args.project_id);
		}

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

	private async listOntoDocuments(args: ListOntoDocumentsArgs): Promise<{
		documents: any[];
		total: number;
		message: string;
	}> {
		const actorId = await this.getActorId();
		let query = this.supabase
			.from('onto_documents')
			.select('id, project_id, title, type_key, state_key, props, created_at, updated_at', {
				count: 'exact'
			})
			.eq('created_by', actorId)
			.order('updated_at', { ascending: false });

		if (args.project_id) {
			await this.assertProjectOwnership(args.project_id, actorId);
			query = query.eq('project_id', args.project_id);
		}

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

		return {
			documents: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} ontology documents.`
		};
	}

	private async searchOntoDocuments(args: SearchOntoDocumentsArgs): Promise<{
		documents: any[];
		total: number;
		message: string;
	}> {
		const searchTerm = this.prepareSearchTerm(args.search);
		if (!searchTerm) {
			throw new Error('Search term is required for search_onto_documents');
		}

		const actorId = await this.getActorId();
		const likePattern = `%${searchTerm}%`;

		let query = this.supabase
			.from('onto_documents')
			.select('id, project_id, title, type_key, state_key, props, created_at, updated_at', {
				count: 'exact'
			})
			.eq('created_by', actorId)
			.order('updated_at', { ascending: false })
			.ilike('title', likePattern);

		if (args.project_id) {
			await this.assertProjectOwnership(args.project_id, actorId);
			query = query.eq('project_id', args.project_id);
		}

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

		return {
			documents: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} documents matching "${args.search}".`
		};
	}

	private async searchOntology(args: SearchOntologyArgs): Promise<{
		results: any[];
		total: number;
		message: string;
	}> {
		const query = this.prepareSearchTerm(args.query);
		if (!query) {
			throw new Error('Query is required for search_ontology');
		}

		const limit = Math.min(args.limit ?? 50, 50);

		const data = await this.apiRequest('/api/onto/search', {
			method: 'POST',
			body: JSON.stringify({
				query,
				project_id: args.project_id,
				types: args.types,
				limit
			})
		});

		const results = Array.isArray((data as any)?.results)
			? (data as any).results
			: Array.isArray(data)
				? (data as any[])
				: [];

		const total = (data as any)?.total ?? results.length ?? 0;

		return {
			results,
			total,
			message:
				(data as any)?.message ??
				`Found ${results.length} ontology matches. Use get_onto_*_details to load full records.`
		};
	}

	private async getOntoProjectDetails(args: GetOntoProjectDetailsArgs): Promise<any> {
		const details = await this.apiRequest(`/api/onto/projects/${args.project_id}`);
		if (!details?.project) {
			throw new Error('Ontology project not found');
		}

		return {
			...details,
			message: 'Complete ontology project details loaded.'
		};
	}

	private async getOntoTaskDetails(args: GetOntoTaskDetailsArgs): Promise<any> {
		const details = await this.apiRequest(`/api/onto/tasks/${args.task_id}`);
		if (!details?.task) {
			throw new Error('Ontology task not found');
		}

		return {
			...details,
			message: 'Complete ontology task details loaded.'
		};
	}

	private async getOntoGoalDetails(args: GetOntoGoalDetailsArgs): Promise<any> {
		const details = await this.apiRequest(`/api/onto/goals/${args.goal_id}`);
		if (!details?.goal) {
			throw new Error('Ontology goal not found');
		}

		return {
			...details,
			message: 'Complete ontology goal details loaded.'
		};
	}

	private async getOntoPlanDetails(args: GetOntoPlanDetailsArgs): Promise<any> {
		const details = await this.apiRequest(`/api/onto/plans/${args.plan_id}`);
		if (!details?.plan) {
			throw new Error('Ontology plan not found');
		}

		return {
			...details,
			message: 'Complete ontology plan details loaded.'
		};
	}

	private async getOntoDocumentDetails(args: GetOntoDocumentDetailsArgs): Promise<any> {
		const details = await this.apiRequest(`/api/onto/documents/${args.document_id}`);
		if (!details?.document) {
			throw new Error('Ontology document not found');
		}

		return {
			...details,
			message: 'Complete ontology document details loaded.'
		};
	}

	private async getEntityRelationships(args: GetEntityRelationshipsArgs): Promise<{
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

	/**
	 * Get detailed linked entities for a specific entity.
	 * Returns full information about all linked entities including descriptions.
	 */
	private async getLinkedEntities(args: GetLinkedEntitiesArgs): Promise<{
		linked_entities: string;
		summary: string;
		counts: Record<string, number>;
		message: string;
	}> {
		await this.assertEntityOwnership(args.entity_id);

		// Get entity name for context
		const entityName = await this.getEntityDisplayName(args.entity_id, args.entity_kind);

		// Load linked entities with full details
		const ontologyLoader = new OntologyContextLoader(this.supabase);
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
					outputs: kindKey === 'outputs' ? filteredEntities : []
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
	 * Get display name for an entity by its kind
	 */
	private async getEntityDisplayName(entityId: string, entityKind: string): Promise<string> {
		const tableMap: Record<string, string> = {
			task: 'onto_tasks',
			plan: 'onto_plans',
			goal: 'onto_goals',
			milestone: 'onto_milestones',
			document: 'onto_documents',
			output: 'onto_outputs'
		};

		const table = tableMap[entityKind];
		if (!table) return entityId;

		const { data } = await this.supabase
			.from(table as any)
			.select('name, title, summary')
			.eq('id', entityId)
			.single();

		if (!data) return entityId;
		return (data as any).name || (data as any).title || (data as any).summary || entityId;
	}

	private async createOntoProject(args: CreateOntoProjectArgs): Promise<{
		project_id: string;
		counts: Record<string, number | undefined>;
		clarifications?: CreateOntoProjectArgs['clarifications'];
		message: string;
		context_shift?: {
			new_context: 'project';
			entity_id: string;
			entity_name: string;
			entity_type: 'project';
		};
	}> {
		if (args.clarifications?.length) {
			return {
				project_id: '',
				counts: {},
				clarifications: args.clarifications,
				message: 'Additional information is required before creating the project.'
			};
		}

		const contextDocument = buildContextDocumentSpec(args);

		const additionalDocuments =
			args.documents?.filter((doc) => doc.type_key !== 'document.context.project') ?? [];

		const spec = {
			project: args.project,
			...(args.goals?.length ? { goals: args.goals } : {}),
			...(args.requirements?.length ? { requirements: args.requirements } : {}),
			...(args.plans?.length ? { plans: args.plans } : {}),
			...(args.tasks?.length ? { tasks: args.tasks } : {}),
			...(args.outputs?.length ? { outputs: args.outputs } : {}),
			...(additionalDocuments.length ? { documents: additionalDocuments } : {}),
			context_document: contextDocument
		};

		const data = await this.apiRequest('/api/onto/projects/instantiate', {
			method: 'POST',
			body: JSON.stringify(spec)
		});

		const counts = data.counts ?? {};
		const summary = Object.entries(counts)
			.filter(([, value]) => typeof value === 'number' && value > 0)
			.map(([entity, value]) => `${value} ${entity.replace(/_/g, ' ')}`)
			.join(', ');

		const message =
			`Created project "${args.project.name}" (ID: ${data.project_id})` +
			(summary ? ` with ${summary}` : '');

		return {
			project_id: data.project_id,
			counts,
			message,
			context_shift: {
				new_context: 'project',
				entity_id: data.project_id,
				entity_name: args.project.name,
				entity_type: 'project'
			}
		};
	}

	private async createOntoTask(args: CreateOntoTaskArgs): Promise<{
		task: any;
		message: string;
	}> {
		const payload = {
			project_id: args.project_id,
			title: args.title,
			description: args.description ?? null,
			type_key: args.type_key ?? 'task.execute',
			state_key: args.state_key ?? 'todo',
			priority: args.priority ?? 3,
			plan_id: args.plan_id ?? null,
			due_at: args.due_at ?? null,
			props: args.props ?? {}
		};

		const data = await this.apiRequest('/api/onto/tasks/create', {
			method: 'POST',
			body: JSON.stringify(payload)
		});

		return {
			task: data.task,
			message: `Created ontology task "${data.task?.title ?? 'Task'}"`
		};
	}

	private async createOntoGoal(args: CreateOntoGoalArgs): Promise<{
		goal: any;
		message: string;
	}> {
		const payload = {
			project_id: args.project_id,
			name: args.name,
			description: args.description ?? null,
			type_key: args.type_key ?? 'goal.outcome.project',
			props: args.props ?? {}
		};

		const data = await this.apiRequest('/api/onto/goals/create', {
			method: 'POST',
			body: JSON.stringify(payload)
		});

		return {
			goal: data.goal,
			message: `Created ontology goal "${data.goal?.name ?? 'Goal'}"`
		};
	}

	private async createOntoPlan(args: CreateOntoPlanArgs): Promise<{
		plan: any;
		message: string;
	}> {
		const payload = {
			project_id: args.project_id,
			name: args.name,
			description: args.description ?? null,
			type_key: args.type_key ?? 'plan.phase.base',
			state_key: args.state_key ?? 'draft',
			props: args.props ?? {}
		};

		const data = await this.apiRequest('/api/onto/plans/create', {
			method: 'POST',
			body: JSON.stringify(payload)
		});

		return {
			plan: data.plan,
			message: `Created ontology plan "${data.plan?.name ?? 'Plan'}"`
		};
	}

	private async createOntoDocument(args: CreateOntoDocumentArgs): Promise<{
		document: any;
		message: string;
	}> {
		const payload = {
			project_id: args.project_id,
			title: args.title,
			type_key: args.type_key,
			state_key: args.state_key ?? 'draft',
			body_markdown: args.body_markdown ?? '',
			props: args.props ?? {}
		};

		const data = await this.apiRequest('/api/onto/documents/create', {
			method: 'POST',
			body: JSON.stringify(payload)
		});

		return {
			document: data.document,
			message: `Created ontology document "${data.document?.title ?? 'Document'}"`
		};
	}

	private async updateOntoTask(args: UpdateOntoTaskArgs): Promise<{
		task: any;
		message: string;
	}> {
		const updateData: Record<string, unknown> = {};
		const strategy = args.update_strategy ?? 'replace';

		if (args.title !== undefined) updateData.title = args.title;
		if (args.description !== undefined) {
			updateData.description = await this.resolveTextWithStrategy({
				strategy,
				newContent: args.description ?? '',
				instructions: args.merge_instructions,
				entityLabel: `task:${args.task_id}`,
				existingLoader: async () => {
					const details = await this.getOntoTaskDetails({ task_id: args.task_id });
					const props = (details?.task?.props as Record<string, unknown>) || {};
					const raw = props.description;
					return typeof raw === 'string' ? raw : '';
				}
			});
		}
		if (args.type_key !== undefined) updateData.type_key = args.type_key;
		if (args.state_key !== undefined) updateData.state_key = args.state_key;
		if (args.priority !== undefined) updateData.priority = args.priority;
		if (args.plan_id !== undefined) updateData.plan_id = args.plan_id;
		if (args.due_at !== undefined) updateData.due_at = args.due_at;
		if (args.props !== undefined) updateData.props = args.props;

		if (Object.keys(updateData).length === 0) {
			throw new Error('No updates provided for ontology task');
		}

		const data = await this.apiRequest(`/api/onto/tasks/${args.task_id}`, {
			method: 'PATCH',
			body: JSON.stringify(updateData)
		});

		return {
			task: data.task,
			message: `Updated ontology task "${data.task?.title ?? args.task_id}"`
		};
	}

	private async updateOntoProject(args: UpdateOntoProjectArgs): Promise<{
		project: any;
		message: string;
	}> {
		const updateData: Record<string, unknown> = {};

		if (args.name !== undefined) updateData.name = args.name;
		if (args.description !== undefined) updateData.description = args.description;
		if (args.state_key !== undefined) updateData.state_key = args.state_key;
		if (args.props !== undefined) updateData.props = args.props;

		if (Object.keys(updateData).length === 0) {
			throw new Error('No updates provided for ontology project');
		}

		const data = await this.apiRequest(`/api/onto/projects/${args.project_id}`, {
			method: 'PATCH',
			body: JSON.stringify(updateData)
		});

		return {
			project: data.project,
			message: `Updated ontology project "${data.project?.name ?? args.project_id}"`
		};
	}

	private async updateOntoGoal(args: UpdateOntoGoalArgs): Promise<{
		goal: any;
		message: string;
	}> {
		const updateData: Record<string, unknown> = {};
		const strategy = args.update_strategy ?? 'replace';

		if (args.name !== undefined) updateData.name = args.name;
		if (args.description !== undefined) {
			updateData.description = await this.resolveTextWithStrategy({
				strategy,
				newContent: args.description ?? '',
				instructions: args.merge_instructions,
				entityLabel: `goal:${args.goal_id}`,
				existingLoader: async () => {
					const details = await this.getOntoGoalDetails({ goal_id: args.goal_id });
					const props = (details?.goal?.props as Record<string, unknown>) || {};
					const raw = props.description;
					return typeof raw === 'string' ? raw : '';
				}
			});
		}
		if (args.priority !== undefined) updateData.priority = args.priority;
		if (args.target_date !== undefined) updateData.target_date = args.target_date;
		if (args.measurement_criteria !== undefined)
			updateData.measurement_criteria = args.measurement_criteria;
		if (args.props !== undefined) updateData.props = args.props;

		if (Object.keys(updateData).length === 0) {
			throw new Error('No updates provided for ontology goal');
		}

		const data = await this.apiRequest(`/api/onto/goals/${args.goal_id}`, {
			method: 'PATCH',
			body: JSON.stringify(updateData)
		});

		return {
			goal: data.goal,
			message: `Updated ontology goal "${data.goal?.name ?? args.goal_id}"`
		};
	}

	private async updateOntoPlan(args: UpdateOntoPlanArgs): Promise<{
		plan: any;
		message: string;
	}> {
		const updateData: Record<string, unknown> = {};
		const strategy = args.update_strategy ?? 'replace';

		if (args.name !== undefined) updateData.name = args.name;
		if (args.description !== undefined) {
			updateData.description = await this.resolveTextWithStrategy({
				strategy,
				newContent: args.description ?? '',
				instructions: args.merge_instructions,
				entityLabel: `plan:${args.plan_id}`,
				existingLoader: async () => {
					const details = await this.getOntoPlanDetails({ plan_id: args.plan_id });
					const props = (details?.plan?.props as Record<string, unknown>) || {};
					const raw = props.description;
					return typeof raw === 'string' ? raw : '';
				}
			});
		}
		if (args.start_date !== undefined) updateData.start_date = args.start_date;
		if (args.end_date !== undefined) updateData.end_date = args.end_date;
		if (args.state_key !== undefined) updateData.state_key = args.state_key;
		if (args.props !== undefined) updateData.props = args.props;

		if (Object.keys(updateData).length === 0) {
			throw new Error('No updates provided for ontology plan');
		}

		const data = await this.apiRequest(`/api/onto/plans/${args.plan_id}`, {
			method: 'PATCH',
			body: JSON.stringify(updateData)
		});

		return {
			plan: data.plan,
			message: `Updated ontology plan "${data.plan?.name ?? args.plan_id}"`
		};
	}

	private async updateOntoDocument(args: UpdateOntoDocumentArgs): Promise<{
		document: any;
		message: string;
	}> {
		const updateData: Record<string, unknown> = {};

		if (args.title !== undefined) updateData.title = args.title;
		if (args.type_key !== undefined) updateData.type_key = args.type_key;
		if (args.state_key !== undefined) updateData.state_key = args.state_key;
		if (args.body_markdown !== undefined) {
			const strategy = args.update_strategy ?? 'replace';
			updateData.body_markdown = await this.resolveDocumentBodyContent({
				documentId: args.document_id,
				newContent: args.body_markdown ?? '',
				strategy,
				instructions: args.merge_instructions
			});
		}
		if (args.props !== undefined) updateData.props = args.props;

		if (Object.keys(updateData).length === 0) {
			throw new Error('No updates provided for ontology document');
		}

		const data = await this.apiRequest(`/api/onto/documents/${args.document_id}`, {
			method: 'PATCH',
			body: JSON.stringify(updateData)
		});

		return {
			document: data.document,
			message: `Updated ontology document "${data.document?.title ?? args.document_id}"`
		};
	}

	private async resolveDocumentBodyContent(params: {
		documentId: string;
		newContent: string;
		strategy: 'replace' | 'append' | 'merge_llm';
		instructions?: string;
	}): Promise<string> {
		const { documentId, newContent, strategy, instructions } = params;
		return this.resolveTextWithStrategy({
			strategy,
			newContent,
			instructions,
			entityLabel: `document:${documentId}`,
			existingLoader: async () => {
				const existing = await this.getOntoDocumentDetails({ document_id: documentId });
				return (
					(existing?.document?.props?.body_markdown as string) ||
					(existing?.document?.body_markdown as string) ||
					''
				);
			}
		});
	}

	private async composeContentUpdateWithLLM(params: {
		existingContent: string;
		newContent: string;
		instructions?: string;
	}): Promise<string> {
		if (!this.llmService) {
			throw new Error('LLM service unavailable for merge');
		}

		const systemPrompt =
			'You are a careful editor. Merge new content into existing markdown, preserving structure, headers, tables, and important details. Do not drop existing material unless it conflicts with explicit instructions.';

		const instructions =
			params.instructions?.trim() ||
			'Preserve existing sections and weave in new content naturally. Keep markdown clean and concise.';

		const prompt = [
			'## Goal',
			'Produce the final markdown after applying the new content.',
			'## Instructions',
			instructions,
			'## Existing content',
			params.existingContent || '(none)',
			'## New content to apply',
			params.newContent || '(none)',
			'## Output requirements',
			'- Return only the merged markdown (no explanations).',
			'- Keep existing structure when possible.',
			'- Integrate new details; avoid duplicating sections.'
		].join('\n\n');

		const result = await this.llmService.generateTextDetailed({
			prompt,
			systemPrompt,
			userId: this.userId,
			profile: 'balanced',
			maxTokens: 2000,
			temperature: 0.4,
			operationType: 'agentic_chat_content_merge'
		});

		return result.text.trim();
	}

	private async resolveTextWithStrategy(params: {
		strategy: 'replace' | 'append' | 'merge_llm';
		newContent: string;
		instructions?: string;
		entityLabel?: string;
		existingLoader: () => Promise<string>;
	}): Promise<string> {
		const { strategy, newContent, instructions, entityLabel, existingLoader } = params;
		const sanitizedNew = newContent ?? '';

		if (strategy === 'replace') {
			return sanitizedNew;
		}

		let existingText = '';
		try {
			existingText = (await existingLoader()) || '';
		} catch (error) {
			console.warn(
				`[ChatToolExecutor] Failed to load existing content for ${entityLabel || 'entity'}, using provided content`,
				error
			);
			return sanitizedNew;
		}

		const hasNewContent = sanitizedNew.trim().length > 0;
		if (!hasNewContent) {
			return existingText;
		}

		if (strategy === 'append') {
			return existingText ? `${existingText}\n\n${sanitizedNew}` : sanitizedNew;
		}

		if (this.llmService) {
			try {
				return await this.composeContentUpdateWithLLM({
					existingContent: existingText,
					newContent: sanitizedNew,
					instructions
				});
			} catch (error) {
				console.warn(
					`[ChatToolExecutor] LLM merge failed for ${entityLabel || 'entity'}, falling back to append`,
					error
				);
			}
		} else {
			console.warn(
				`[ChatToolExecutor] LLM service not available for ${entityLabel || 'entity'}, falling back to append`
			);
		}

		return existingText ? `${existingText}\n\n${sanitizedNew}` : sanitizedNew;
	}

	private async listTaskDocuments(args: ListTaskDocumentsArgs): Promise<{
		documents: Array<{ document: any; edge: any }>;
		scratch_pad: { document: any; edge: any } | null;
		message: string;
	}> {
		if (!args.task_id) {
			throw new Error('task_id is required for list_task_documents');
		}

		const data = await this.apiRequest(`/api/onto/tasks/${args.task_id}/documents`, {
			method: 'GET'
		});

		return {
			documents: data.documents ?? [],
			scratch_pad: data.scratch_pad ?? null,
			message: `Found ${data.documents?.length ?? 0} documents linked to this task.`
		};
	}

	private async createTaskDocument(args: CreateTaskDocumentArgs): Promise<{
		document: any;
		edge: any;
		message: string;
	}> {
		if (!args.task_id) {
			throw new Error('task_id is required for create_task_document');
		}

		const payload: Record<string, unknown> = {
			document_id: args.document_id,
			title: args.title,
			type_key: args.type_key,
			state_key: args.state_key,
			role: args.role,
			body_markdown: args.body_markdown,
			props: args.props
		};

		const data = await this.apiRequest(`/api/onto/tasks/${args.task_id}/documents`, {
			method: 'POST',
			body: JSON.stringify(payload)
		});

		return {
			document: data.document,
			edge: data.edge,
			message: `Linked document "${data.document?.title ?? 'Document'}" to task.`
		};
	}

	private async deleteOntoTask(args: DeleteOntoTaskArgs): Promise<{
		success: boolean;
		message: string;
	}> {
		const data = await this.apiRequest(`/api/onto/tasks/${args.task_id}`, {
			method: 'DELETE'
		});

		return {
			success: true,
			message: data.message ?? 'Ontology task deleted successfully'
		};
	}

	private async deleteOntoGoal(args: DeleteOntoGoalArgs): Promise<{
		success: boolean;
		message: string;
	}> {
		const data = await this.apiRequest(`/api/onto/goals/${args.goal_id}`, {
			method: 'DELETE'
		});

		return {
			success: true,
			message: data.message ?? 'Ontology goal deleted successfully'
		};
	}

	private async deleteOntoPlan(args: DeleteOntoPlanArgs): Promise<{
		success: boolean;
		message: string;
	}> {
		const data = await this.apiRequest(`/api/onto/plans/${args.plan_id}`, {
			method: 'DELETE'
		});

		return {
			success: true,
			message: data.message ?? 'Ontology plan deleted successfully'
		};
	}

	private async deleteOntoDocument(args: DeleteOntoDocumentArgs): Promise<{
		success: boolean;
		message: string;
	}> {
		const data = await this.apiRequest(`/api/onto/documents/${args.document_id}`, {
			method: 'DELETE'
		});

		return {
			success: true,
			message: data.message ?? 'Ontology document deleted successfully'
		};
	}

	private prepareSearchTerm(term?: string): string {
		if (!term) return '';
		return term.replace(/[%]/g, '').replace(/,/g, ' ').trim();
	}

	private async logToolExecution(
		toolCall: ChatToolCall,
		result: any,
		duration: number,
		success: boolean,
		errorMessage?: string
	): Promise<void> {
		if (!this.sessionId) {
			console.warn(
				`Cannot log tool execution for ${toolCall.function.name}: session_id not set. Call setSessionId() first.`
			);
			return;
		}

		const category = getToolCategory(toolCall.function.name);

		try {
			const { error: insertError } = await this.supabase.from('chat_tool_executions').insert({
				session_id: this.sessionId,
				tool_name: toolCall.function.name,
				tool_category: category,
				arguments: JSON.parse(toolCall.function.arguments || '{}'),
				result: success ? result : null,
				execution_time_ms: duration,
				success,
				error_message: errorMessage ?? null
			});

			// Log Supabase errors explicitly (not silent failures)
			if (insertError) {
				console.error('[ChatToolExecutor] Failed to log tool execution (DB error):', {
					toolName: toolCall.function.name,
					sessionId: this.sessionId,
					error: insertError.message,
					code: insertError.code,
					hint: insertError.hint
				});
			}
		} catch (error) {
			// Log unexpected errors with full context
			console.error('[ChatToolExecutor] Failed to log tool execution (exception):', {
				toolName: toolCall.function.name,
				sessionId: this.sessionId,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
			});
		}
	}

	private async assertProjectOwnership(projectId: string, actorId?: string): Promise<void> {
		const owner = actorId ?? (await this.getActorId());
		const { data, error } = await this.supabase
			.from('onto_projects')
			.select('id')
			.eq('id', projectId)
			.eq('created_by', owner)
			.maybeSingle();

		if (error) throw error;
		if (!data) {
			throw new Error('Project not found or access denied');
		}
	}

	private async assertEntityOwnership(entityId: string): Promise<void> {
		const actorId = await this.getActorId();

		const { data: project, error: projectError } = await this.supabase
			.from('onto_projects')
			.select('id')
			.eq('id', entityId)
			.eq('created_by', actorId)
			.maybeSingle();

		if (projectError) throw projectError;
		if (project) {
			return;
		}

		const tables = ['onto_tasks', 'onto_plans', 'onto_goals', 'onto_outputs', 'onto_documents'];

		for (const table of tables) {
			const { data, error } = await this.supabase
				.from(table)
				.select('project_id')
				.eq('id', entityId)
				.maybeSingle();

			if (error) throw error;
			if (data?.project_id) {
				await this.assertProjectOwnership(data.project_id, actorId);
				return;
			}
		}

		throw new Error('Entity not found or access denied');
	}
}
