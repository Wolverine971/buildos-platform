// apps/worker/src/lib/services/smart-llm-service.ts

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { SmartLLMService as SharedSmartLLMService, type SmartLLMConfig } from '@buildos/smart-llm';
export { LLMSpendLimitError } from '@buildos/smart-llm';
import type { Json } from '@buildos/shared-types';
import { supabase as defaultSupabase } from '../supabase';
import { logWorkerError } from '../errorLogger';

const DEFAULT_HTTP_REFERER = 'https://build-os.com';
const DEFAULT_APP_NAME = 'BuildOS Worker';

export type {
	AudioInput,
	ErrorLogger,
	JSONProfile,
	JSONRequestOptions,
	JSONSpendReservationEvent,
	JSONUsageEvent,
	ModelProfile,
	OpenRouterResponse,
	TextGenerationOptions,
	TextGenerationResult,
	TextGenerationUsage,
	TextProfile,
	TranscriptionOptions,
	TranscriptionProvider,
	TranscriptionResult
} from '@buildos/smart-llm';

export type WorkerSmartLLMConfig = {
	httpReferer?: string;
	appName?: string;
	supabase?: TypedSupabaseClient;
	apiKey?: string;
	enforceUserId?: boolean;
	errorLogger?: SmartLLMConfig['errorLogger'];
	openrouter?: SmartLLMConfig['openrouter'];
	moonshot?: SmartLLMConfig['moonshot'];
};

function metadataString(
	metadata: Record<string, unknown> | undefined,
	key: string
): string | undefined {
	const value = metadata?.[key];
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function metadataNumber(
	metadata: Record<string, unknown> | undefined,
	key: string
): number | undefined {
	const value = metadata?.[key];
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function jsonPayload(value: unknown): Json | null {
	return value === null || value === undefined ? null : (value as Json);
}

function createWorkerSmartLlmErrorLogger(): NonNullable<SmartLLMConfig['errorLogger']> {
	return {
		async logAPIError(error, url, method, userId, metadata) {
			await logWorkerError(error, {
				userId,
				endpoint: url,
				httpMethod: method,
				operationType:
					metadataString(metadata, 'operationType') ||
					metadataString(metadata, 'operation') ||
					'llm_api_request',
				projectId: metadataString(metadata, 'projectId'),
				llmProvider:
					metadataString(metadata, 'openrouterProvider') ||
					metadataString(metadata, 'provider'),
				llmModel:
					metadataString(metadata, 'lastModel') ||
					metadataString(metadata, 'modelUsed') ||
					metadataString(metadata, 'modelRequested'),
				responseTimeMs: metadataNumber(metadata, 'responseTimeMs'),
				errorType: 'llm_error',
				operationPayload: jsonPayload(metadata),
				metadata: {
					errorSource: 'smart_llm_api_request',
					...(metadata ?? {})
				}
			});
		},
		async logDatabaseError(error, operation, tableName, recordId, payload) {
			await logWorkerError(error, {
				operationType: operation,
				tableName,
				recordId,
				operationPayload: jsonPayload(payload),
				errorType: 'database_error',
				severity: 'critical',
				metadata: {
					errorSource: 'smart_llm_database_operation'
				}
			});
		}
	};
}

export class SmartLLMService extends SharedSmartLLMService {
	constructor(config?: WorkerSmartLLMConfig) {
		const apiKey = config?.apiKey || process.env.PRIVATE_OPENROUTER_API_KEY || '';
		const supabase = config?.supabase ?? defaultSupabase;
		const errorLogger = config?.errorLogger ?? createWorkerSmartLlmErrorLogger();
		const moonshotApiKey =
			config?.moonshot?.apiKey ||
			process.env.PRIVATE_MOONSHOT_API_KEY ||
			process.env.MOONSHOT_API_KEY;
		const moonshotApiUrl =
			config?.moonshot?.apiUrl || process.env.PRIVATE_MOONSHOT_API_URL || undefined;
		const moonshotRouteKimiModelsDirect =
			config?.moonshot?.routeKimiModelsDirect ??
			(process.env.PRIVATE_MOONSHOT_ROUTE_KIMI_DIRECT || '').trim().toLowerCase() === 'true';
		const moonshotConfig: SmartLLMConfig['moonshot'] | undefined =
			moonshotApiKey || moonshotApiUrl || moonshotRouteKimiModelsDirect || config?.moonshot
				? {
						...config?.moonshot,
						apiKey: moonshotApiKey || undefined,
						apiUrl: moonshotApiUrl,
						routeKimiModelsDirect: moonshotRouteKimiModelsDirect
					}
				: undefined;
		super({
			apiKey,
			httpReferer: config?.httpReferer || DEFAULT_HTTP_REFERER,
			appName: config?.appName || DEFAULT_APP_NAME,
			supabase: supabase as SmartLLMConfig['supabase'],
			errorLogger,
			enforceUserId: config?.enforceUserId ?? true,
			openrouter: config?.openrouter,
			moonshot: moonshotConfig
		});
	}
}
