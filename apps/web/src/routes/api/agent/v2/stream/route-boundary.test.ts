// apps/web/src/routes/api/agent/v2/stream/route-boundary.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routePath = fileURLToPath(new URL('./+server.ts', import.meta.url));
const routeSource = readFileSync(routePath, 'utf8');

describe('/api/agent/v2/stream ownership boundary', () => {
	it('keeps the SvelteKit route as a thin adapter over the legacy execution host', () => {
		expect(routeSource.split('\n').length).toBeLessThanOrEqual(30);
		expect(routeSource).toContain(
			'$lib/services/agentic-chat/legacy-execution/http-stream/handler.server'
		);
		expect(routeSource).not.toMatch(
			/ToolExecutionService|OpenRouterV2Service|createAdminSupabaseClient|streamFastChat/
		);
	});
});
