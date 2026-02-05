// apps/worker/src/lib/services/smart-llm-service.ts

import type { TypedSupabaseClient } from '@buildos/supabase-client';
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

export type WorkerSmartLLMConfig = {
	httpReferer?: string;
	appName?: string;
	supabase?: TypedSupabaseClient;
	apiKey?: string;
	enforceUserId?: boolean;
	openrouter?: SmartLLMConfig['openrouter'];
};

export class SmartLLMService extends SharedSmartLLMService {
	constructor(config?: WorkerSmartLLMConfig) {
		const apiKey = config?.apiKey || process.env.PRIVATE_OPENROUTER_API_KEY || '';
		super({
			apiKey,
			httpReferer: config?.httpReferer,
			appName: config?.appName,
			supabase: config?.supabase as SmartLLMConfig['supabase'],
			enforceUserId: config?.enforceUserId ?? true,
			openrouter: config?.openrouter
		});
	}
}
