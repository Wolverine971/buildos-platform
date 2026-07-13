// apps/web/vitest.config.ts
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { fileURLToPath } from 'node:url';
import { coverageConfig } from '../../vitest.coverage';

const sharedAgentOpsSrc = (sub: string) =>
	fileURLToPath(new URL(`../../packages/shared-agent-ops/src/${sub}`, import.meta.url));

// Resolve the shared op-execution gateway and the dependency modules it imports
// to @buildos/shared-agent-ops SOURCE (not the bundled dist). This lets the
// agent-call gateway guardrail tests intercept those dependencies via vi.mock
// of the canonical `@buildos/shared-agent-ops/...` specifiers, since the source
// gateway's relative imports and the mocked subpaths dedupe to the same files.
const sharedAgentOpsTestAliases = [
	'gateway/op-execution-gateway',
	'ontology/ontology-projects.service',
	'ontology/doc-structure.service',
	'ontology/versioning.service',
	'ontology/instantiation.service',
	'ops/async-activity-logger',
	'ops/entity-mention-notification.service',
	'inbox-index'
].map((sub) => ({
	find: `@buildos/shared-agent-ops/${sub}`,
	replacement: sharedAgentOpsSrc(`${sub}.ts`)
}));

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: sharedAgentOpsTestAliases,
		// Ensure Svelte uses browser/client exports in tests (not SSR)
		conditions: ['browser']
	},
	test: {
		globals: true,
		environment: 'node', // Use node for server-side tests by default
		setupFiles: ['./vitest.setup.ts'],
		include: ['**/*.{test,spec}.{js,ts}'],
		// IMPORTANT: Exclude LLM tests from regular test runs to avoid API costs
		exclude: [
			'**/node_modules/**',
			'**/dist/**',
			'**/.{idea,git,cache,output,temp}/**',
			'**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
			// Exclude LLM tests - they cost money and should be run separately
			'**/lib/tests/llm/**',
			'**/lib/tests/llm-simple/**',
			// Exclude the agentic e2e harness - real turns, real DB writes, real
			// judge calls; run separately via `pnpm test:agentic` against a dev server
			'**/lib/tests/agentic-e2e/**'
		],
		// Suppress console output during tests for cleaner output
		silent: false, // Set to true to suppress all console output
		// Or use reporters for cleaner output
		reporters: process.env.CI ? ['default'] : ['default'],
		coverage: coverageConfig(['src/**/*.{js,ts,svelte}'])
	}
});
