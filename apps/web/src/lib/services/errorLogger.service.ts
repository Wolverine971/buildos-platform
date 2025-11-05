// apps/web/src/lib/services/errorLogger.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type {
	ErrorLogEntry,
	ErrorContext,
	ErrorType,
	ErrorSeverity,
	LLMMetadata
} from '$lib/types/error-logging';
import { browser } from '$app/environment';

export class ErrorLoggerService {
	private static instance: ErrorLoggerService;
	private supabase: SupabaseClient<Database>;
	private environment: 'development' | 'staging' | 'production';
	private appVersion: string = '1.0.0'; // You can update this from package.json

	private constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
		this.environment = this.detectEnvironment();
	}

	public static getInstance(supabase: SupabaseClient<Database>): ErrorLoggerService {
		if (!ErrorLoggerService.instance) {
			ErrorLoggerService.instance = new ErrorLoggerService(supabase);
		}
		return ErrorLoggerService.instance;
	}

	private detectEnvironment(): 'development' | 'staging' | 'production' {
		if (typeof window !== 'undefined' && window.location) {
			const hostname = window.location.hostname;
			if (hostname === 'localhost' || hostname === '127.0.0.1') {
				return 'development';
			} else if (hostname.includes('staging')) {
				return 'staging';
			}
			return 'production';
		}
		return process.env.NODE_ENV === 'production' ? 'production' : 'development';
	}

	private getBrowserInfo(): Record<string, any> | undefined {
		if (!browser) return undefined;

		return {
			userAgent: navigator.userAgent,
			platform: navigator.platform,
			language: navigator.language,
			screenResolution: `${window.screen.width}x${window.screen.height}`,
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			viewport: `${window.innerWidth}x${window.innerHeight}`,
			colorDepth: window.screen.colorDepth,
			cookieEnabled: navigator.cookieEnabled,
			onLine: navigator.onLine
		};
	}

	private extractErrorInfo(error: any): {
		message: string;
		stack?: string;
		code?: string;
	} {
		if (error instanceof Error) {
			return {
				message: error.message,
				stack: error.stack,
				code: (error as any).code
			};
		} else if (typeof error === 'string') {
			return { message: error };
		} else if (error && typeof error === 'object') {
			return {
				message: error.message || JSON.stringify(error),
				stack: error.stack,
				code: error.code || error.error_code
			};
		}
		return { message: String(error) };
	}

	private determineErrorType(error: any, context?: ErrorContext): ErrorType {
		const errorMessage = typeof error === 'string' ? error : error?.message || '';
		const errorCode = error?.code || '';

		if (
			context?.brainDumpId ||
			errorMessage.toLowerCase().includes('brain') ||
			errorMessage.toLowerCase().includes('dump')
		) {
			return 'brain_dump_processing';
		}
		if (
			context?.llmMetadata ||
			errorMessage.toLowerCase().includes('llm') ||
			errorMessage.toLowerCase().includes('openai') ||
			errorMessage.toLowerCase().includes('token')
		) {
			return 'llm_error';
		}
		if (
			errorCode?.startsWith('22') ||
			errorCode?.startsWith('23') ||
			errorMessage.toLowerCase().includes('database') ||
			errorMessage.toLowerCase().includes('sql')
		) {
			return 'database_error';
		}
		if (
			errorMessage.toLowerCase().includes('validation') ||
			errorMessage.toLowerCase().includes('invalid')
		) {
			return 'validation_error';
		}
		if (
			errorMessage.toLowerCase().includes('api') ||
			errorMessage.toLowerCase().includes('fetch') ||
			errorMessage.toLowerCase().includes('network')
		) {
			return 'api_error';
		}
		return 'unknown';
	}

	private determineSeverity(error: any, errorType: ErrorType): ErrorSeverity {
		const errorMessage = typeof error === 'string' ? error : error?.message || '';

		if (
			errorType === 'database_error' ||
			errorMessage.toLowerCase().includes('critical') ||
			errorMessage.toLowerCase().includes('fatal')
		) {
			return 'critical';
		}
		if (errorType === 'validation_error' || errorMessage.toLowerCase().includes('warning')) {
			return 'warning';
		}
		if (errorMessage.toLowerCase().includes('info')) {
			return 'info';
		}
		return 'error';
	}

	public async logError(
		error: any,
		context?: ErrorContext,
		severity?: ErrorSeverity
	): Promise<string | null> {
		try {
			const errorInfo = this.extractErrorInfo(error);
			const errorType = this.determineErrorType(error, context);
			const finalSeverity = severity || this.determineSeverity(error, errorType);

			const errorEntry = {
				error_type: errorType,
				error_code: errorInfo.code,
				error_message: errorInfo.message,
				error_stack: errorInfo.stack,
				severity: finalSeverity,

				user_id: context?.userId,
				project_id: context?.projectId,
				brain_dump_id: context?.brainDumpId,

				endpoint: context?.endpoint,
				http_method: context?.httpMethod,
				request_id: context?.requestId || this.generateRequestId(),
				user_agent: browser ? navigator.userAgent : undefined,
				ip_address: null, // We'll add this later if needed

				llm_provider: context?.llmMetadata?.provider,
				llm_model: context?.llmMetadata?.model,
				prompt_tokens: context?.llmMetadata?.promptTokens,
				completion_tokens: context?.llmMetadata?.completionTokens,
				total_tokens: context?.llmMetadata?.totalTokens,
				response_time_ms: context?.llmMetadata?.responseTimeMs,
				llm_temperature: context?.llmMetadata?.temperature,
				llm_max_tokens: context?.llmMetadata?.maxTokens,

				operation_type: context?.operationType,
				table_name: context?.tableName,
				record_id: context?.recordId,
				operation_payload: context?.operationPayload,

				metadata: {
					...context?.metadata,
					originalError: error,
					timestamp: new Date().toISOString()
				},
				environment: this.environment,
				app_version: this.appVersion,
				browser_info: browser ? this.getBrowserInfo() : context?.browserInfo
			};

			const { data, error: insertError } = await this.supabase
				.from('error_logs')
				.insert(errorEntry as any)
				.select('id')
				.single();

			if (insertError) {
				console.error('Failed to log error to database:', insertError);
				this.logToConsole(errorEntry, error);
				return null;
			}

			if (data && data.id) {
				console.log(`Error logged with ID: ${data.id}`);
				return data.id;
			}

			return null;
		} catch (loggingError) {
			console.error('Error logger failed:', loggingError);
			this.logToConsole({ error, context }, error);
			return null;
		}
	}

	public async logBrainDumpError(
		error: any,
		brainDumpId: string,
		llmMetadata?: LLMMetadata,
		additionalContext?: Partial<ErrorContext>
	): Promise<string | null> {
		const context: ErrorContext = {
			brainDumpId,
			llmMetadata,
			...additionalContext,
			metadata: {
				...additionalContext?.metadata,
				errorSource: 'brain_dump_processing'
			}
		};

		return this.logError(error, context);
	}

	public async logDatabaseError(
		error: any,
		operation: string,
		tableName: string,
		recordId?: string,
		payload?: any
	): Promise<string | null> {
		const context: ErrorContext = {
			operationType: operation,
			tableName,
			recordId,
			operationPayload: payload,
			metadata: {
				errorSource: 'database_operation'
			}
		};

		return this.logError(error, context, 'critical');
	}

	public async logAPIError(
		error: any,
		endpoint: string,
		method: string,
		userId?: string,
		payload?: any
	): Promise<string | null> {
		const context: ErrorContext = {
			endpoint,
			httpMethod: method,
			userId,
			operationPayload: payload,
			metadata: {
				errorSource: 'api_request'
			}
		};

		return this.logError(error, context);
	}

	public async logCalendarError(
		error: any,
		operation: 'delete' | 'update' | 'create' | 'sync',
		taskId: string,
		userId?: string,
		additionalContext?: {
			calendarEventId?: string;
			calendarId?: string;
			projectId?: string;
			reason?: string;
			taskStatus?: string;
			taskStartDate?: string;
			[key: string]: any; // Allow additional properties for extensibility
		}
	): Promise<string | null> {
		const errorType: ErrorType =
			operation === 'delete'
				? 'calendar_delete_error'
				: operation === 'update'
					? 'calendar_update_error'
					: 'calendar_sync_error';

		const context: ErrorContext = {
			userId,
			projectId: additionalContext?.projectId,
			operationType: `calendar_${operation}`,
			tableName: 'task_calendar_events',
			recordId: taskId,
			operationPayload: {
				calendarEventId: additionalContext?.calendarEventId,
				calendarId: additionalContext?.calendarId,
				reason: additionalContext?.reason,
				taskStatus: additionalContext?.taskStatus,
				taskStartDate: additionalContext?.taskStartDate
			},
			metadata: {
				errorSource: 'calendar_operation',
				operation,
				...additionalContext
			}
		};

		// Force the error type
		const errorInfo = this.extractErrorInfo(error);
		const finalSeverity = operation === 'delete' ? 'warning' : 'error';

		try {
			const errorEntry = {
				error_type: errorType,
				error_code: errorInfo.code,
				error_message: errorInfo.message,
				error_stack: errorInfo.stack,
				severity: finalSeverity,

				user_id: context.userId,
				project_id: context.projectId,

				endpoint: context.endpoint,
				http_method: context.httpMethod,
				request_id: this.generateRequestId(),
				user_agent: browser ? navigator.userAgent : undefined,

				operation_type: context.operationType,
				table_name: context.tableName,
				record_id: context.recordId,
				operation_payload: context.operationPayload,

				metadata: context.metadata,
				environment: this.environment,
				app_version: this.appVersion,
				browser_info: browser ? this.getBrowserInfo() : undefined
			};

			const { data, error: insertError } = await this.supabase
				.from('error_logs')
				.insert(errorEntry as any)
				.select('id')
				.single();

			if (insertError) {
				console.error('Failed to log calendar error to database:', insertError);
				this.logToConsole(errorEntry, error);
				return null;
			}

			if (data && data.id) {
				console.log(`Calendar error logged with ID: ${data.id}`);
				return data.id;
			}

			return null;
		} catch (loggingError) {
			console.error('Calendar error logger failed:', loggingError);
			this.logToConsole({ error, context }, error);
			return null;
		}
	}

	public async getRecentErrors(
		limit: number = 50,
		filters?: {
			userId?: string;
			projectId?: string;
			errorType?: ErrorType;
			severity?: ErrorSeverity;
			resolved?: boolean;
		}
	): Promise<ErrorLogEntry[]> {
		// If userId looks like an email, first get the user ID
		let actualUserId = filters?.userId;
		if (filters?.userId && filters.userId.includes('@')) {
			const { data: userData } = await this.supabase
				.from('users')
				.select('id')
				.eq('email', filters.userId)
				.single();

			if (userData) {
				actualUserId = userData.id;
			} else {
				// No user with this email, return empty array
				return [];
			}
		}

		let query = this.supabase
			.from('error_logs')
			.select('*')
			.order('created_at', { ascending: false })
			.limit(limit);

		if (actualUserId) {
			query = query.eq('user_id', actualUserId);
		}
		if (filters?.projectId) {
			query = query.eq('project_id', filters.projectId);
		}
		if (filters?.errorType) {
			query = query.eq('error_type', filters.errorType);
		}
		if (filters?.severity) {
			query = query.eq('severity', filters.severity);
		}
		if (filters?.resolved !== undefined) {
			query = query.eq('resolved', filters.resolved);
		}

		const { data: errors, error } = await query;

		if (error) {
			console.error('Failed to fetch error logs:', error);
			return [];
		}

		if (!errors || errors.length === 0) {
			return [];
		}

		// Extract unique user IDs from the errors
		const userIds = [...new Set(errors.filter((e) => e.user_id).map((e) => e.user_id!))];

		// Fetch user data for all unique user IDs
		let usersMap: Record<string, any> = {};
		if (userIds.length > 0) {
			const { data: users } = await this.supabase
				.from('users')
				.select('id, email, name')
				.in('id', userIds);

			if (users) {
				usersMap = users.reduce(
					(acc, user) => {
						acc[user.id] = user;
						return acc;
					},
					{} as Record<string, any>
				);
			}
		}

		// Attach user data to each error
		const enrichedErrors = errors.map((error) => ({
			...error,
			user: error.user_id ? usersMap[error.user_id] : undefined
		}));

		return enrichedErrors as ErrorLogEntry[];
	}

	public async resolveError(
		errorId: string,
		resolvedBy: string,
		resolutionNotes?: string
	): Promise<boolean> {
		const { error } = await this.supabase
			.from('error_logs')
			.update({
				resolved: true,
				resolved_at: new Date().toISOString(),
				resolved_by: resolvedBy,
				resolution_notes: resolutionNotes
			} as any)
			.eq('id', errorId);

		if (error) {
			console.error('Failed to resolve error:', error);
			return false;
		}

		return true;
	}

	public async getErrorSummary(): Promise<any> {
		try {
			// Get aggregated data from error_logs
			const now = new Date();
			const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

			// Get total errors
			const { count: totalErrors } = await this.supabase
				.from('error_logs')
				.select('*', { count: 'exact', head: true });

			// Get unresolved errors
			const { count: unresolvedErrors } = await this.supabase
				.from('error_logs')
				.select('*', { count: 'exact', head: true })
				.eq('resolved', false);

			// Get critical errors
			const { count: criticalErrors } = await this.supabase
				.from('error_logs')
				.select('*', { count: 'exact', head: true })
				.eq('severity', 'critical')
				.eq('resolved', false);

			// Get errors in last 24 hours
			const { count: errorsLast24h } = await this.supabase
				.from('error_logs')
				.select('*', { count: 'exact', head: true })
				.gte('created_at', yesterday.toISOString());

			// Get errors in last 7 days (for trend)
			const { count: errorsLastWeek } = await this.supabase
				.from('error_logs')
				.select('*', { count: 'exact', head: true })
				.gte('created_at', lastWeek.toISOString())
				.lt('created_at', yesterday.toISOString());

			// Calculate error trend (comparing last 24h to previous week average)
			const weeklyAverage = (errorsLastWeek || 0) / 7;
			const errorTrend =
				weeklyAverage > 0
					? (((errorsLast24h || 0) - weeklyAverage) / weeklyAverage) * 100
					: 0;

			return [
				{
					total_errors: totalErrors || 0,
					unresolved_errors: unresolvedErrors || 0,
					critical_errors: criticalErrors || 0,
					errors_last_24h: errorsLast24h || 0,
					error_trend: Math.round(errorTrend)
				}
			];
		} catch (error) {
			console.error('Failed to fetch error summary:', error);
			return [
				{
					total_errors: 0,
					unresolved_errors: 0,
					critical_errors: 0,
					errors_last_24h: 0,
					error_trend: 0
				}
			];
		}
	}

	private generateRequestId(): string {
		return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	private logToConsole(data: any, originalError: any): void {
		console.group('🔴 Error Logger Fallback (Database logging failed)');
		console.error('Original Error:', originalError);
		console.log('Error Context:', data);
		console.log('Timestamp:', new Date().toISOString());
		console.groupEnd();
	}
}
