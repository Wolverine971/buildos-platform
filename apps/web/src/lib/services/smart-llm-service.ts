// apps/web/src/lib/services/smart-llm-service.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { PRIVATE_OPENROUTER_API_KEY } from '$env/static/private';
import { ErrorLoggerService } from './errorLogger.service';
import { SmartLLMService as SharedSmartLLMService, type SmartLLMConfig } from '@buildos/smart-llm';

export type {
	AudioInput,
	ErrorLogger,
	JSONProfile,
	JSONRequestOptions,
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

export type WebSmartLLMConfig = {
	httpReferer?: string;
	appName?: string;
	supabase?: SupabaseClient<Database>;
	apiKey?: string;
	enforceUserId?: boolean;
	openrouter?: SmartLLMConfig['openrouter'];
};

export class SmartLLMService extends SharedSmartLLMService {
	constructor(config?: WebSmartLLMConfig) {
		const errorLogger = config?.supabase
			? ErrorLoggerService.getInstance(config.supabase)
			: undefined;
		super({
			apiKey: config?.apiKey || PRIVATE_OPENROUTER_API_KEY,
			httpReferer: config?.httpReferer,
			appName: config?.appName,
			supabase: config?.supabase,
			errorLogger,
			enforceUserId: config?.enforceUserId,
			openrouter: config?.openrouter
		});
	}
}
