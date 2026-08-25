import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { sanitizeLogData } from '$lib/utils/logging-helpers';

export type FastChatErrorLogParams = {
	error: unknown;
	operationType: string;
	projectId?: string;
	tableName?: string;
	recordId?: string;
	metadata?: Record<string, unknown>;
};

type Logger = {
	warn(message: string, data?: Record<string, unknown>): void;
};

type ErrorReporterOptions = {
	errorLogger: Pick<ErrorLoggerService, 'logError'>;
	internalSupabase: SupabaseClient<Database>;
	logger: Logger;
	userId: string;
	endpoint: string;
	httpMethod: string;
	requestId?: string | null;
	userAgent?: string | null;
	ipAddress?: string | null;
};

/** Centralizes request metadata, sanitization, and recoverable error bookkeeping. */
export class FastChatErrorReporter {
	private readonly recoverableProjectCreateErrors: Array<{
		failedToolCallId: string;
		errorLogId: Promise<string | null>;
	}> = [];

	constructor(private readonly options: ErrorReporterOptions) {}

	readonly persist = (params: FastChatErrorLogParams): Promise<string | null> => {
		const sanitizedMetadata = params.metadata ? sanitizeLogData(params.metadata) : undefined;
		const metadata =
			sanitizedMetadata &&
			typeof sanitizedMetadata === 'object' &&
			!Array.isArray(sanitizedMetadata)
				? (sanitizedMetadata as Record<string, unknown>)
				: sanitizedMetadata !== undefined
					? { value: sanitizedMetadata }
					: undefined;

		return this.options.errorLogger
			.logError(params.error, {
				userId: this.options.userId,
				projectId: params.projectId,
				endpoint: this.options.endpoint,
				httpMethod: this.options.httpMethod,
				requestId: this.options.requestId ?? undefined,
				userAgent: this.options.userAgent ?? undefined,
				ipAddress: this.options.ipAddress ?? undefined,
				operationType: params.operationType,
				tableName: params.tableName,
				recordId: params.recordId,
				metadata
			})
			.catch((loggingError) => {
				this.options.logger.warn('FastChat error-log persistence failed', {
					loggingError,
					operationType: params.operationType
				});
				return null;
			});
	};

	readonly log = (params: FastChatErrorLogParams): void => {
		void this.persist(params);
	};

	trackRecoverableProjectCreateError(
		failedToolCallId: string,
		errorLogId: Promise<string | null>
	): void {
		this.recoverableProjectCreateErrors.push({ failedToolCallId, errorLogId });
	}

	async resolveRecoveredProjectCreateErrors(successfulToolCallId: string): Promise<void> {
		if (this.recoverableProjectCreateErrors.length === 0) return;

		const pending = this.recoverableProjectCreateErrors.splice(
			0,
			this.recoverableProjectCreateErrors.length
		);
		const logResults = await Promise.allSettled(pending.map((entry) => entry.errorLogId));
		const errorLogIds = logResults.flatMap((result) =>
			result.status === 'fulfilled' && result.value ? [result.value] : []
		);
		const rejectedLogCount = logResults.filter((result) => result.status === 'rejected').length;
		if (rejectedLogCount > 0) {
			this.options.logger.warn(
				'Project-create validation error logging failed before retry recovery',
				{ rejectedLogCount, successfulToolCallId }
			);
		}
		if (errorLogIds.length === 0) return;

		const failedToolCallIds = pending.map((entry) => entry.failedToolCallId).join(', ');
		const { error } = await this.options.internalSupabase
			.from('error_logs')
			.update({
				resolved: true,
				resolved_at: new Date().toISOString(),
				resolution_notes:
					`Automatically resolved after create_onto_project succeeded on retry ${successfulToolCallId} in the same turn. ` +
					`Recovered validation call(s): ${failedToolCallIds}.`
			})
			.in('id', errorLogIds)
			.eq('resolved', false);

		if (error) {
			this.options.logger.warn(
				'Failed to resolve recovered project-create validation errors',
				{
					error,
					errorLogIds,
					successfulToolCallId
				}
			);
		}
	}
}
