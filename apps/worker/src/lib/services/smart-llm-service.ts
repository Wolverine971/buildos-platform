// apps/worker/src/lib/services/smart-llm-service.ts

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { SmartLLMService as SharedSmartLLMService, type SmartLLMConfig } from '@buildos/smart-llm';
import { supabase as defaultSupabase } from '../supabase';

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

export type WorkerSmartLLMConfig = {
	httpReferer?: string;
	appName?: string;
	supabase?: TypedSupabaseClient;
	apiKey?: string;
	enforceUserId?: boolean;
	openrouter?: SmartLLMConfig['openrouter'];
	moonshot?: SmartLLMConfig['moonshot'];
};

export class SmartLLMService extends SharedSmartLLMService {
	constructor(config?: WorkerSmartLLMConfig) {
		const apiKey = config?.apiKey || process.env.PRIVATE_OPENROUTER_API_KEY || '';
		const supabase = config?.supabase ?? defaultSupabase;
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
			httpReferer: config?.httpReferer,
			appName: config?.appName,
			supabase: supabase as SmartLLMConfig['supabase'],
			enforceUserId: config?.enforceUserId ?? true,
			openrouter: config?.openrouter,
			moonshot: moonshotConfig
		});
	}
}
