// apps/web/src/lib/services/smart-llm-service.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { PRIVATE_OPENROUTER_API_KEY } from '$env/static/private';
import { env as dynamicEnv } from '$env/dynamic/private';
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
	moonshot?: SmartLLMConfig['moonshot'];
};

export class SmartLLMService extends SharedSmartLLMService {
	constructor(config?: WebSmartLLMConfig) {
		const errorLogger = config?.supabase
			? ErrorLoggerService.getInstance(config.supabase)
			: undefined;
		const moonshotApiKey =
			config?.moonshot?.apiKey ||
			dynamicEnv.PRIVATE_MOONSHOT_API_KEY ||
			dynamicEnv.MOONSHOT_API_KEY;
		const moonshotApiUrl =
			config?.moonshot?.apiUrl || dynamicEnv.PRIVATE_MOONSHOT_API_URL || undefined;
		const moonshotRouteFlagRaw = dynamicEnv.PRIVATE_MOONSHOT_ROUTE_KIMI_DIRECT;
		const moonshotRouteFlag =
			typeof moonshotRouteFlagRaw === 'string' &&
			moonshotRouteFlagRaw.trim().toLowerCase() === 'true';
		const moonshotRouteKimiModelsDirect =
			config?.moonshot?.routeKimiModelsDirect ?? moonshotRouteFlag;
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
			apiKey: config?.apiKey || PRIVATE_OPENROUTER_API_KEY,
			httpReferer: config?.httpReferer,
			appName: config?.appName,
			supabase: config?.supabase,
			errorLogger,
			enforceUserId: config?.enforceUserId,
			openrouter: config?.openrouter,
			moonshot: moonshotConfig
		});
	}
}
