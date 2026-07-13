// apps/web/vitest.config.agentic.ts
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { fileURLToPath } from 'node:url';

// Redirect the shared-agent-ops subpaths the harness uses (directly or via the
// $lib re-export shims) to package SOURCE, so the suite runs without a prior
// `dist` build — mirrors vitest.config.ts.
const sharedAgentOpsSrc = (sub: string) =>
	fileURLToPath(new URL(`../../packages/shared-agent-ops/src/${sub}`, import.meta.url));

const sharedAgentOpsTestAliases = [
	'ontology/instantiation.service',
	'ontology/ontology-projects.service',
	'ontology/doc-structure.service',
	'ontology/versioning.service',
	'ops/async-activity-logger',
	'ops/entity-mention-notification.service',
	'inbox-index'
].map((sub) => ({
	find: `@buildos/shared-agent-ops/${sub}`,
	replacement: sharedAgentOpsSrc(`${sub}.ts`)
}));

/**
 * Vitest configuration for the agentic-chat end-to-end stress harness.
 *
 * These tests drive the REAL `POST /api/agent/v2/stream` endpoint against a
 * running dev server, exercise the production weak-model path, execute tools,
 * write to the hosted database, and call a strong LLM judge on fuzzy scenarios.
 * They cost money and require:
 *   1. `pnpm dev --filter=@buildos/web` running (default http://localhost:5173)
 *   2. A dedicated test user (AGENTIC_TEST_USER_EMAIL / _PASSWORD in apps/web/.env)
 *   3. PRIVATE_SUPABASE_SERVICE_KEY + PRIVATE_OPENROUTER_API_KEY in apps/web/.env
 *
 * Run explicitly with: pnpm --filter @buildos/web test:agentic
 * Excluded from `pnpm test` (see vitest.config.ts exclude list).
 */
export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: sharedAgentOpsTestAliases
	},
	test: {
		globals: true,
		environment: 'node',
		setupFiles: ['./vitest.setup.ts'],
		// Only include the agentic e2e harness
		include: ['**/lib/tests/agentic-e2e/**/*.test.ts'],
		// Full multi-round turns (LLM + tool execution + DB writes) are much
		// slower than the single-pass llm smoke tests.
		testTimeout: 120000,
		hookTimeout: 60000,
		// One retry: a single flaky provider/network response should not fail the run.
		retry: 1,
		// Serial: turns mutate shared per-user state and we want deterministic
		// seed/teardown ordering + no provider rate-limiting.
		maxConcurrency: 1,
		fileParallelism: false,
		reporters: ['default'],
		silent: false
	}
});
