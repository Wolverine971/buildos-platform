// apps/worker/src/workers/agent-run/workerWebContentCheck.ts
//
// The web-content check for background workers (agent runs), built once per process from the
// worker's own OpenRouter key and database client. Chat builds its own in bootstrap.ts with
// the turn's credential. See webContentCheck.ts for what the check is and what it measured.
import { JevClient, LLMUsageLogger } from '@buildos/smart-llm';
import { logSecurityEventAsync } from '@buildos/shared-agent-ops/ops/security-event-logger';
import { supabase } from '../../lib/supabase';
import {
	type WebContentCheck,
	createWebContentCheck,
	webContentFlagEvent
} from './webContentCheck';

let shared: WebContentCheck | null | undefined;

/** Null without an OpenRouter key: web results are then returned unchecked. */
export function getWorkerWebContentCheck(): WebContentCheck | null {
	if (shared !== undefined) return shared;
	const apiKey = process.env.PRIVATE_OPENROUTER_API_KEY?.trim();
	shared = apiKey
		? createWebContentCheck({
				jev: new JevClient({
					apiKey,
					timeoutMs: 2_500,
					retryOnce: false,
					// Jev latency is bimodal; one hedge rescues most slow calls.
					hedgeAfterMs: 800,
					title: 'BuildOS Web Content Check',
					usage: new LLMUsageLogger({ supabase: supabase as never })
				}),
				onFlag: (verdict, context) =>
					logSecurityEventAsync(webContentFlagEvent(verdict, context), {
						supabase: supabase as never
					})
			})
		: null;
	return shared;
}
