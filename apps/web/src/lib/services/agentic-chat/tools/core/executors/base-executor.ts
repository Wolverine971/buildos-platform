// apps/web/src/lib/services/agentic-chat/tools/core/executors/base-executor.ts
/**
 * Base Executor - Common Infrastructure for Tool Executors
 *
 * Provides shared functionality for all domain-specific executors:
 * - Authentication and authorization
 * - API request handling
 * - Error normalization
 * - Ownership assertions
 * - Search term preparation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { ExecutorContext } from './types';

/**
 * Base class providing common infrastructure for all tool executors.
 *
 * Responsibilities:
 * - Actor ID resolution and caching
 * - Admin Supabase client management
 * - Auth header generation
 * - API request helper with error handling
 * - Ownership assertions for projects and entities
 * - Search term sanitization
 */
export class BaseExecutor {
	protected readonly supabase: SupabaseClient;
	protected readonly userId: string;
	protected readonly sessionId?: string;
	protected readonly fetchFn: typeof fetch;
	protected readonly llmService?: SmartLLMService;

	private _actorId?: string;
	private _adminSupabase?: TypedSupabaseClient;

	constructor(context: ExecutorContext) {
		this.supabase = context.supabase;
		this.userId = context.userId;
		this.sessionId = context.sessionId;
		this.fetchFn = context.fetchFn;
		this.llmService = context.llmService;
	}

	// ============================================
	// ACTOR & AUTH
	// ============================================

	/**
	 * Get or resolve the actor ID for the current user.
	 * Cached after first resolution.
	 */
	protected async getActorId(): Promise<string> {
		if (!this._actorId) {
			this._actorId = await ensureActorId(this.supabase as any, this.userId);
		}
		return this._actorId;
	}

	/**
	 * Get or create the admin Supabase client.
	 * Used for privileged operations.
	 */
	protected getAdminSupabase(): TypedSupabaseClient {
		if (!this._adminSupabase) {
			this._adminSupabase = createAdminSupabaseClient();
		}
		return this._adminSupabase;
	}

	/**
	 * Get authorization headers for API requests.
	 * Includes X-Change-Source header to identify agentic chat operations.
	 */
	protected async getAuthHeaders(): Promise<HeadersInit> {
		const {
			data: { session }
		} = await this.supabase.auth.getSession();

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
			'X-Change-Source': 'chat'
		};

		if (this.sessionId) {
			headers['X-Chat-Session-Id'] = this.sessionId;
		}

		return headers;
	}

	// ============================================
	// API REQUEST
	// ============================================

	/**
	 * Make an authenticated API request with standardized error handling.
	 *
	 * @param path - API endpoint path
	 * @param options - Fetch options
	 * @returns Parsed response data
	 * @throws Error with detailed message on failure
	 */
	protected async apiRequest<T = any>(path: string, options: RequestInit = {}): Promise<T> {
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

			const contentType = response.headers.get('content-type');
			if (contentType?.includes('application/json')) {
				try {
					const errorPayload = await response.json();
					errorMessage = errorPayload.error || errorPayload.message || errorMessage;
					errorDetails = errorPayload.details;
				} catch (jsonError) {
					console.warn('[BaseExecutor] Failed to parse error response as JSON:', {
						path,
						status: response.status,
						contentType,
						parseError:
							jsonError instanceof Error ? jsonError.message : String(jsonError)
					});
				}
			} else {
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
			console.warn('[BaseExecutor] Response is not JSON:', {
				path,
				contentType: responseContentType
			});
			const text = await response.text();
			try {
				return JSON.parse(text);
			} catch {
				return { data: text } as T;
			}
		}

		const payload = await response.json();
		return payload?.data ?? payload;
	}

	// ============================================
	// OWNERSHIP ASSERTIONS
	// ============================================

	/**
	 * Assert that the current user owns the specified project.
	 *
	 * @param projectId - Project ID to check
	 * @param actorId - Optional pre-resolved actor ID
	 * @throws Error if project not found or access denied
	 */
	protected async assertProjectOwnership(projectId: string, actorId?: string): Promise<void> {
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

	/**
	 * Assert that the current user owns the specified entity.
	 * Checks projects first, then searches through entity tables.
	 *
	 * @param entityId - Entity ID to check
	 * @throws Error if entity not found or access denied
	 */
	protected async assertEntityOwnership(entityId: string): Promise<void> {
		const actorId = await this.getActorId();

		// Check if it's a project
		const { data: project, error: projectError } = await this.supabase
			.from('onto_projects')
			.select('id')
			.eq('id', entityId)
			.eq('created_by', actorId)
			.maybeSingle();

		if (projectError) throw projectError;
		if (project) return;

		// Check other entity tables
		const tables = [
			'onto_tasks',
			'onto_plans',
			'onto_goals',
			'onto_outputs',
			'onto_documents',
			'onto_milestones',
			'onto_risks',
			'onto_decisions',
			'onto_requirements'
		];

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

	// ============================================
	// UTILITIES
	// ============================================

	/**
	 * Prepare a search term by removing special characters.
	 *
	 * @param term - Raw search term
	 * @returns Sanitized search term
	 */
	protected prepareSearchTerm(term?: string): string {
		if (!term) return '';
		return term.replace(/[%]/g, '').replace(/,/g, ' ').trim();
	}

	protected normalizeTaskState(state?: string | null): string | undefined {
		if (!state) return undefined;

		const normalized = state
			.trim()
			.toLowerCase()
			.replace(/[\s-]+/g, '_');
		if (!normalized) return undefined;

		const stateMap: Record<string, string> = {
			pending: 'todo',
			not_started: 'todo',
			backlog: 'todo',
			inprogress: 'in_progress',
			started: 'in_progress',
			working: 'in_progress',
			active: 'in_progress',
			completed: 'done',
			complete: 'done'
		};

		const candidate = stateMap[normalized] ?? normalized;
		return ['todo', 'in_progress', 'blocked', 'done'].includes(candidate) ? candidate : state;
	}

	protected normalizeProjectState(state?: string | null): string | undefined {
		if (!state) return undefined;

		const normalized = state
			.trim()
			.toLowerCase()
			.replace(/[\s-]+/g, '_');
		if (!normalized) return undefined;

		const stateMap: Record<string, string> = {
			in_progress: 'active',
			inprogress: 'active',
			started: 'active',
			working: 'active',
			ongoing: 'active',
			paused: 'active',
			on_hold: 'active',
			hold: 'active',
			pending: 'planning',
			planned: 'planning',
			backlog: 'planning',
			todo: 'planning',
			draft: 'planning',
			complete: 'completed',
			completed: 'completed',
			done: 'completed',
			finished: 'completed',
			shipped: 'completed',
			cancelled: 'cancelled',
			canceled: 'cancelled',
			aborted: 'cancelled',
			abandoned: 'cancelled',
			archived: 'cancelled'
		};

		const candidate = stateMap[normalized] ?? normalized;
		return ['planning', 'active', 'completed', 'cancelled'].includes(candidate)
			? candidate
			: state;
	}
}
