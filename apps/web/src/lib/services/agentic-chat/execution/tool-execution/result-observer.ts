// apps/web/src/lib/services/agentic-chat/execution/tool-execution/result-observer.ts
import type { ErrorLoggerService } from '$lib/services/errorLogger.service';
import type { ErrorContext } from '$lib/types/error-logging';
import { sanitizeLogData } from '$lib/utils/logging-helpers';
import { createLogger } from '$lib/utils/logger';
import type { ServiceContext, ToolExecutionResult } from '../../shared/types';
import { TOOL_METADATA } from '../../tools/core/definitions';
import type { ToolArguments } from './argument-values';
import { isToolCancellationResult } from './result-adapter';

const logger = createLogger('ToolExecutionService');

export interface ToolExecutionTelemetry {
	toolName: string;
	durationMs: number;
	virtual: boolean;
}

export type ToolExecutionTelemetryHook = (
	result: ToolExecutionResult,
	telemetry: ToolExecutionTelemetry
) => void | Promise<void>;

export interface ToolResultFinalizationDetails {
	args?: ToolArguments;
	timeoutMs?: number;
}

export type ToolResultFinalizer = (
	result: ToolExecutionResult,
	details?: ToolResultFinalizationDetails
) => ToolExecutionResult;

export function createToolResultFinalizer({
	toolName,
	virtual,
	context,
	telemetryHook,
	errorLogger,
	getDetails,
	startedAt = getToolExecutionTimeMs()
}: {
	toolName: string;
	virtual: boolean;
	context: ServiceContext;
	telemetryHook?: ToolExecutionTelemetryHook;
	errorLogger?: Pick<ErrorLoggerService, 'logError'>;
	getDetails?: () => ToolResultFinalizationDetails;
	startedAt?: number;
}): ToolResultFinalizer {
	return (result, details = getDetails?.() ?? {}) => {
		const durationMs = getToolExecutionTimeMs() - startedAt;
		emitTelemetry(result, { toolName, durationMs, virtual }, telemetryHook);
		if (!result.success && !isToolCancellationResult(result)) {
			logToolExecutionError({
				result,
				context,
				toolName,
				virtual,
				durationMs,
				args: details.args,
				timeoutMs: details.timeoutMs,
				errorLogger
			});
		}
		return result;
	};
}

export function getToolExecutionTimeMs(): number {
	return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function emitTelemetry(
	result: ToolExecutionResult,
	telemetry: ToolExecutionTelemetry,
	telemetryHook: ToolExecutionTelemetryHook | undefined
): void {
	if (!telemetryHook) return;
	try {
		const maybePromise = telemetryHook(result, telemetry);
		Promise.resolve(maybePromise).catch((error) =>
			logTelemetryFailure(telemetry.toolName, error)
		);
	} catch (error) {
		logTelemetryFailure(telemetry.toolName, error);
	}
}

function logTelemetryFailure(toolName: string, error: unknown): void {
	logger.warn('Telemetry hook failed', {
		toolName,
		error: error instanceof Error ? error.message : String(error)
	});
}

function logToolExecutionError({
	result,
	context,
	toolName,
	virtual,
	durationMs,
	args,
	timeoutMs,
	errorLogger
}: {
	result: ToolExecutionResult;
	context: ServiceContext;
	toolName: string;
	virtual: boolean;
	durationMs: number;
	args?: ToolArguments;
	timeoutMs?: number;
	errorLogger?: Pick<ErrorLoggerService, 'logError'>;
}): void {
	if (!errorLogger) return;
	const sanitizedArgs = args ? sanitizeLogData(args) : undefined;
	const operationPayload = isRecord(sanitizedArgs) ? sanitizedArgs : undefined;
	const logContext: ErrorContext = {
		userId: context.userId,
		projectId: context.contextScope?.projectId ?? context.entityId,
		operationType: 'tool_execution',
		operationPayload,
		metadata: {
			toolName,
			toolCategory: TOOL_METADATA[toolName]?.category,
			toolCallId: result.toolCallId,
			sessionId: context.sessionId,
			contextType: context.contextType,
			entityId: context.entityId,
			args: sanitizedArgs,
			argsSummary: buildArgsSummary(args, toolName),
			errorType: result.errorType,
			virtual,
			timeoutMs,
			durationMs
		}
	};
	void errorLogger.logError(result.error ?? 'Tool execution failed', logContext);
}

function buildArgsSummary(
	args: ToolArguments | undefined,
	toolName: string
): Record<string, unknown> | undefined {
	if (!args) return undefined;
	const argKeys = Object.keys(args);
	const summary: Record<string, unknown> = {
		argCount: argKeys.length,
		argKeys: argKeys.slice(0, 12)
	};
	if (argKeys.length > 12) summary.argKeysTruncated = argKeys.length - 12;

	if (toolName === 'create_onto_project') {
		summary.hasProject = 'project' in args;
		summary.hasEntities = Array.isArray(args.entities);
		summary.hasRelationships = Array.isArray(args.relationships);
		summary.hasClarifications = Array.isArray(args.clarifications);
	}
	return summary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
