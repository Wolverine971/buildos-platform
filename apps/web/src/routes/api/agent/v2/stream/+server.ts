// apps/web/src/routes/api/agent/v2/stream/+server.ts
/**
 * Public HTTP adapter for capability-only legacy Agentic Chat execution.
 *
 * Request parsing, admission, execution, SSE emission, and finalization belong
 * to the explicit legacy host. Keep this route thin so transport ownership is
 * obvious and worker-compatible behavior cannot drift back into the web route.
 */

import type { RequestHandler } from './$types';
import {
	handleLegacyAgentStream,
	handleLegacyAgentStreamWarmup,
	LEGACY_AGENT_STREAM_CONFIG
} from '$lib/services/agentic-chat/legacy-execution/http-stream/handler.server';

export const config = LEGACY_AGENT_STREAM_CONFIG;
export const GET: RequestHandler = handleLegacyAgentStreamWarmup;
export const POST: RequestHandler = handleLegacyAgentStream;
