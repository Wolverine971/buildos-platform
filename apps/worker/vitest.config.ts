// apps/worker/vitest.config.ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { coverageConfig } from '../../vitest.coverage';

const workspacePackageAliases = [
	{
		find: /^@buildos\/shared-agent-ops$/,
		replacement: fileURLToPath(
			new URL('../../packages/shared-agent-ops/src/index.ts', import.meta.url)
		)
	},
	{
		find: /^@buildos\/shared-agent-ops\/inbox-index$/,
		replacement: fileURLToPath(
			new URL('../../packages/shared-agent-ops/src/inbox-index.ts', import.meta.url)
		)
	},
	{
		find: /^@buildos\/shared-types$/,
		replacement: fileURLToPath(
			new URL('../../packages/shared-types/src/index.ts', import.meta.url)
		)
	},
	{
		find: /^@buildos\/shared-utils$/,
		replacement: fileURLToPath(
			new URL('../../packages/shared-utils/src/index.ts', import.meta.url)
		)
	},
	{
		find: /^@buildos\/supabase-client$/,
		replacement: fileURLToPath(
			new URL('../../packages/supabase-client/src/index.ts', import.meta.url)
		)
	}
];

export default defineConfig({
	test: {
		environment: 'node',
		globals: true,
		setupFiles: ['./tests/setup.ts'],
		// Exclude integration tests by default (require database credentials)
		// Run with: pnpm test:integration or pnpm test tests/integration
		exclude: [
			'**/node_modules/**',
			'**/dist/**',
			'**/tests/integration/**' // Skip integration tests by default
		],
		coverage: coverageConfig(['src/**/*.ts'])
	},
	resolve: {
		alias: [{ find: '@', replacement: './src' }, ...workspacePackageAliases]
	}
});
