// apps/web/src/routes/api/admin/chat/evals/replay/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

const RETIRED_MESSAGE = 'Replay retired with the legacy engine; use the agentic e2e battery';

/**
 * Scenario replay drove the deleted POST /api/agent/v2/stream route directly,
 * so it could only ever exercise the legacy engine (one-engine stage S8). The
 * worker path is covered by `pnpm test:agentic`.
 */
export const POST: RequestHandler = async () =>
	ApiResponse.error(RETIRED_MESSAGE, 410, 'REPLAY_RETIRED');
