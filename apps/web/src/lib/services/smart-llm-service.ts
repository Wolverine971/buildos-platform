// apps/web/src/lib/services/smart-llm-service.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { PRIVATE_OPENROUTER_API_KEY } from '$env/static/private';
import { ErrorLoggerService } from './errorLogger.service';
import { SmartLLMService as SharedSmartLLMService, type SmartLLMConfig } from '@buildos/smart-llm';
import type { OpenRouterRequestProviderRouting } from './openrouter-v2/provider-routing';
import type { OpenRouterRouteObservation } from './openrouter-v2/types';

const DEFAULT_HTTP_REFERER = 'https://build-os.com';
const DEFAULT_APP_NAME = 'BuildOS Web';

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

type SharedStreamTextOptions = Parameters<SharedSmartLLMService['streamText']>[0];
type WebStreamTextOptions = SharedStreamTextOptions & {
	model?: string;
	models?: string[];
	providerRouting?: OpenRouterRequestProviderRouting;
	onRouteObserved?: (observation: OpenRouterRouteObservation) => void | Promise<void>;
};
type SharedStreamTextResult = ReturnType<SharedSmartLLMService['streamText']>;

export class SmartLLMService extends SharedSmartLLMService {
	constructor(config?: WebSmartLLMConfig) {
		const errorLogger = config?.supabase
			? ErrorLoggerService.getInstance(config.supabase)
			: undefined;
		super({
			apiKey: config?.apiKey || PRIVATE_OPENROUTER_API_KEY,
			httpReferer: config?.httpReferer || DEFAULT_HTTP_REFERER,
			appName: config?.appName || DEFAULT_APP_NAME,
			supabase: config?.supabase,
			errorLogger,
			enforceUserId: config?.enforceUserId,
			openrouter: config?.openrouter
		});
	}

	streamText(options: WebStreamTextOptions): SharedStreamTextResult {
		return super.streamText(options as SharedStreamTextOptions);
	}
}
