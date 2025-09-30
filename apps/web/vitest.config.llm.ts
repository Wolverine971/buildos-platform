// apps/web/vitest.config.llm.ts
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

/**
 * Vitest configuration specifically for LLM tests
 *
 * These tests make real API calls to LLMs and cost money.
 * Run with: pnpm test:llm
 */
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		globals: true,
		environment: 'node',
		setupFiles: ['./vitest.setup.ts'],
		// Only include LLM test files
		include: ['**/lib/tests/llm/**/*.test.ts'],
		// Longer timeout for LLM API calls
		testTimeout: 20000,
		// Don't run in parallel to avoid rate limiting
		maxConcurrency: 1,
		// Clear output for LLM tests
		reporters: ['default'],
		silent: false
	}
});
