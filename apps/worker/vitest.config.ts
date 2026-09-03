// apps/worker/vitest.config.ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { coverageConfig } from '../../vitest.coverage';
import { createAgenticChatRuntimeSourceAliases } from '../../packages/agentic-chat-runtime/source-entrypoints';

export const agenticChatRuntimeSourceAliases = createAgenticChatRuntimeSourceAliases(
	new URL('../../packages/agentic-chat-runtime/', import.meta.url)
);

const workspacePackageAliases = [
	...agenticChatRuntimeSourceAliases,
	{
		find: /^@buildos\/shared-agent-ops\/calendar\/google-calendar-runtime$/,
		replacement: fileURLToPath(
			new URL(
				'../../packages/shared-agent-ops/src/calendar/google-calendar-runtime.ts',
				import.meta.url
			)
		)
	},
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
		find: /^@buildos\/shared-agent-ops\/ontology\/ontology-projects.service$/,
		replacement: fileURLToPath(
			new URL(
				'../../packages/shared-agent-ops/src/ontology/ontology-projects.service.ts',
				import.meta.url
			)
		)
	},
	{
		find: /^@buildos\/shared-agent-ops\/ontology\/task-move.service$/,
		replacement: fileURLToPath(
			new URL(
				'../../packages/shared-agent-ops/src/ontology/task-move.service.ts',
				import.meta.url
			)
		)
	},
	{
		find: /^@buildos\/shared-agent-ops\/ops\/entity-mention-ping.service$/,
		replacement: fileURLToPath(
			new URL(
				'../../packages/shared-agent-ops/src/ops/entity-mention-ping.service.ts',
				import.meta.url
			)
		)
	},
	{
		find: /^@buildos\/shared-agent-ops\/ops\/gateway-op-aliases$/,
		replacement: fileURLToPath(
			new URL(
				'../../packages/shared-agent-ops/src/ops/gateway-op-aliases.ts',
				import.meta.url
			)
		)
	},
	{
		find: /^@buildos\/shared-agent-ops\/ops\/update-value-validation$/,
		replacement: fileURLToPath(
			new URL(
				'../../packages/shared-agent-ops/src/ops/update-value-validation.ts',
				import.meta.url
			)
		)
	},
	{
		find: /^@buildos\/shared-agent-ops\/utils\/document-outline$/,
		replacement: fileURLToPath(
			new URL(
				'../../packages/shared-agent-ops/src/utils/document-outline.ts',
				import.meta.url
			)
		)
	},
	{
		find: /^@buildos\/shared-agent-ops\/utils\/search-filter$/,
		replacement: fileURLToPath(
			new URL('../../packages/shared-agent-ops/src/utils/search-filter.ts', import.meta.url)
		)
	},
	{
		find: /^@buildos\/shared-agent-ops\/utils\/validation-utils$/,
		replacement: fileURLToPath(
			new URL(
				'../../packages/shared-agent-ops/src/utils/validation-utils.ts',
				import.meta.url
			)
		)
	},
	{
		find: /^@buildos\/shared-agent-ops\/web\/safe-fetch$/,
		replacement: fileURLToPath(
			new URL('../../packages/shared-agent-ops/src/web/safe-fetch.ts', import.meta.url)
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
