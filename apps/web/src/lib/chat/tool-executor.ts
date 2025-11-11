// apps/web/src/lib/chat/tool-executor.ts
/**
 * Chat Tool Executor - Ontology-First Implementation
 *
 * Executes tool calls for the BuildOS agentic chat system using API endpoints and
 * ontology tables (onto_*). Legacy task/project/calendar tools have been removed
 * in favor of ontology-specific operations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import { getToolCategory, ENTITY_FIELD_INFO } from './tools.config';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { TemplateCreationService } from '$lib/services/agentic-chat/template-creation/template-creation-service';

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

interface ListOntoTemplatesArgs {
	scope?: 'project' | 'plan' | 'task' | 'output' | 'document' | 'goal' | 'requirement';
	realm?: string;
	search?: string;
	context?: string;
	scale?: string;
	stage?: string;
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
		props?: Record<string, unknown>;
	}>;
	clarifications?: Array<{
		key: string;
		question: string;
		required: boolean;
		choices?: string[];
		help_text?: string;
	}>;
	meta?: Record<string, unknown>;
}

interface RequestTemplateCreationArgs {
	braindump: string;
	realm: string;
	template_hints?: string[];
	deliverables?: string[];
	template_suggestions?: string[];
	missing_information?: string[];
	facets?: {
		context?: string;
		scale?: string;
		stage?: string;
	};
	source_message_id?: string;
}

export class ChatToolExecutor {
	private sessionId?: string;
	private fetchFn: typeof fetch;
	private actorId?: string;
	private templateCreationService?: TemplateCreationService;

	constructor(
		private supabase: SupabaseClient,
		private userId: string,
		sessionId?: string,
		fetchFn?: typeof fetch
	) {
		this.sessionId = sessionId;
		this.fetchFn = fetchFn || fetch;
	}

	setSessionId(sessionId: string): void {
		this.sessionId = sessionId;
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
			try {
				const errorPayload = await response.json();
				errorMessage = errorPayload.error || errorPayload.message || errorMessage;
				errorDetails = errorPayload.details;
			} catch {
				// ignore JSON parse errors
			}

			throw new Error(
				`API ${method} ${path} failed: ${errorMessage}${
					errorDetails ? ` (${JSON.stringify(errorDetails)})` : ''
				}`
			);
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

				case 'get_onto_project_details':
					result = await this.getOntoProjectDetails(args as GetOntoProjectDetailsArgs);
					break;

				case 'get_onto_task_details':
					result = await this.getOntoTaskDetails(args as GetOntoTaskDetailsArgs);
					break;

				case 'get_entity_relationships':
					result = await this.getEntityRelationships(args as GetEntityRelationshipsArgs);
					break;

				case 'list_onto_templates':
					result = await this.listOntoTemplates(args as ListOntoTemplatesArgs);
					break;

				case 'create_onto_project':
					result = await this.createOntoProject(args as CreateOntoProjectArgs);
					break;
				case 'request_template_creation':
					result = await this.requestTemplateCreation(
						args as RequestTemplateCreationArgs
					);
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

				case 'update_onto_project':
					result = await this.updateOntoProject(args as UpdateOntoProjectArgs);
					break;

				case 'update_onto_task':
					result = await this.updateOntoTask(args as UpdateOntoTaskArgs);
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

	private getTemplateCreationService(): TemplateCreationService {
		if (!this.templateCreationService) {
			this.templateCreationService = new TemplateCreationService(this.supabase as any);
		}
		return this.templateCreationService;
	}

	private async requestTemplateCreation(args: RequestTemplateCreationArgs) {
		const braindump = args.braindump?.trim();
		const realm = args.realm?.trim();

		if (!braindump) {
			throw new Error('braindump is required for template creation');
		}
		if (!realm) {
			throw new Error('realm is required for template creation');
		}

		const creation = await this.getTemplateCreationService().requestTemplateCreation({
			userId: this.userId,
			sessionId: this.sessionId,
			braindump,
			realm,
			templateHints: args.template_hints,
			deliverables: args.deliverables,
			templateSuggestions: args.template_suggestions,
			missingInformation: args.missing_information,
			facets: args.facets
		});

		const events: any[] = [
			{
				type: 'template_creation_request',
				request: {
					request_id: creation.requestId,
					session_id: this.sessionId,
					user_id: this.userId,
					braindump,
					realm_suggestion: realm,
					template_hints: creation.templateHints ?? args.template_hints ?? [],
					missing_information: args.missing_information ?? [],
					source_message_id: args.source_message_id,
					created_at: new Date().toISOString()
				}
			}
		];

		if (creation.status === 'completed' && creation.templateResponse) {
			events.push({
				type: 'template_created',
				request_id: creation.requestId,
				template: creation.templateResponse
			});
		} else {
			events.push({
				type: 'template_creation_failed',
				request_id: creation.requestId,
				error: creation.error || 'Template creation failed',
				actionable: creation.actionable
			});
		}

		return {
			status: creation.status,
			request_id: creation.requestId,
			template: creation.templateResponse ?? null,
			message:
				creation.status === 'completed' && creation.templateResponse
					? `Created template "${creation.templateResponse.name}" (${creation.templateResponse.type_key}).`
					: `Template creation failed: ${creation.error ?? 'unknown error'}`,
			_stream_events: events
		};
	}

	private async getFieldInfo(args: { entity_type: string; field_name?: string }): Promise<{
		entity_type: string;
		fields: Record<string, unknown>;
		message: string;
	}> {
		const { entity_type, field_name } = args;

		// Validate entity_type is provided
		if (!entity_type || entity_type === 'undefined' || entity_type === 'null') {
			const validTypes = Object.keys(ENTITY_FIELD_INFO).join(', ');
			throw new Error(
				`The 'entity_type' parameter is required for get_field_info. Valid types: ${validTypes}. Example: get_field_info({ entity_type: "ontology_project" })`
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
		let query = this.supabase
			.from('onto_tasks')
			.select(
				`
					id,
					project_id,
					plan_id,
					title,
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
		let query = this.supabase
			.from('onto_tasks')
			.select(
				`
					id,
					project_id,
					plan_id,
					title,
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

	private async listOntoTemplates(args: ListOntoTemplatesArgs): Promise<{
		templates: any[];
		count: number;
		message: string;
	}> {
		const params = new URLSearchParams();
		if (args.scope) params.append('scope', args.scope);
		if (args.realm) params.append('realm', args.realm);
		if (args.search) params.append('search', args.search);
		if (args.context) params.append('context', args.context);
		if (args.scale) params.append('scale', args.scale);
		if (args.stage) params.append('stage', args.stage);

		const data = await this.apiRequest(`/api/onto/templates?${params.toString()}`);

		return {
			templates: data.templates ?? [],
			count: data.count ?? data.templates?.length ?? 0,
			message: `Found ${data.count ?? data.templates?.length ?? 0} templates${
				args.scope ? ` for ${args.scope}` : ''
			}${args.realm ? ` in ${args.realm}` : ''}.`
		};
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

		const spec = {
			project: args.project,
			...(args.goals?.length ? { goals: args.goals } : {}),
			...(args.requirements?.length ? { requirements: args.requirements } : {}),
			...(args.plans?.length ? { plans: args.plans } : {}),
			...(args.tasks?.length ? { tasks: args.tasks } : {}),
			...(args.outputs?.length ? { outputs: args.outputs } : {}),
			...(args.documents?.length ? { documents: args.documents } : {})
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
			type_key: args.type_key ?? 'task.basic',
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
			type_key: args.type_key ?? 'goal.basic',
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
			type_key: args.type_key ?? 'plan.basic',
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

	private async updateOntoTask(args: UpdateOntoTaskArgs): Promise<{
		task: any;
		message: string;
	}> {
		const updateData: Record<string, unknown> = {};

		if (args.title !== undefined) updateData.title = args.title;
		if (args.description !== undefined) updateData.description = args.description;
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
			await this.supabase.from('chat_tool_executions').insert({
				session_id: this.sessionId,
				tool_name: toolCall.function.name,
				tool_category: category,
				arguments: JSON.parse(toolCall.function.arguments || '{}'),
				result: success ? result : null,
				execution_time_ms: duration,
				success,
				error_message: errorMessage ?? null
			});
		} catch (error) {
			console.error('Failed to log tool execution:', error);
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
