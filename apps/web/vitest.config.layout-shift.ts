// apps/web/vitest.config.layout-shift.ts
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { localWorkerLimits } from '../../vitest.workers';
import { sharedAgentOpsTestAliases } from './vitest.config.agentic';

loadDotenv({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true });

/**
 * The layout-shift harness: drives a real browser against a running dev server,
 * as the dedicated test user, on a throwaway project, with every write answered
 * by a shadow server (nothing reaches the database but the fixture itself).
 * Free: no model calls. Run with `pnpm --filter @buildos/web test:layout-shift`.
 * See src/lib/tests/layout-shift/README.md.
 */
export default defineConfig({
	plugins: [sveltekit()],
	resolve: { alias: sharedAgentOpsTestAliases },
	test: {
		...localWorkerLimits(),
		globals: true,
		environment: 'node',
		setupFiles: ['./vitest.setup.ts'],
		include: ['**/lib/tests/layout-shift/**/*.live.test.ts'],
		testTimeout: 420_000,
		hookTimeout: 120_000,
		retry: 0,
		fileParallelism: false,
		reporters: ['default']
	}
});
