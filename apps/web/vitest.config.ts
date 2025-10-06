// apps/web/vitest.config.ts
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
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
			'**/lib/tests/llm-simple/**'
		],
		// Suppress console output during tests for cleaner output
		silent: false, // Set to true to suppress all console output
		// Or use reporters for cleaner output
		reporters: process.env.CI ? ['default'] : ['default']
	}
});
