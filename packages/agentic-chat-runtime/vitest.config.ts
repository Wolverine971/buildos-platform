// packages/agentic-chat-runtime/vitest.config.ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const sharedAgentOpsSrc = (sub: string) =>
	fileURLToPath(new URL(`../shared-agent-ops/src/${sub}`, import.meta.url));

export default defineConfig({
	resolve: {
		alias: [
			{
				find: /^@buildos\/shared-agent-ops$/,
				replacement: sharedAgentOpsSrc('index.ts')
			},
			{
				find: /^@buildos\/shared-agent-ops\/ops\/gateway-op-aliases$/,
				replacement: sharedAgentOpsSrc('ops/gateway-op-aliases.ts')
			},
			{
				find: /^@buildos\/shared-agent-ops\/ops\/update-value-validation$/,
				replacement: sharedAgentOpsSrc('ops/update-value-validation.ts')
			},
			{
				find: /^@buildos\/shared-agent-ops\/utils\/document-outline$/,
				replacement: sharedAgentOpsSrc('utils/document-outline.ts')
			},
			{
				find: /^@buildos\/shared-agent-ops\/utils\/search-filter$/,
				replacement: sharedAgentOpsSrc('utils/search-filter.ts')
			},
			{
				find: /^@buildos\/shared-agent-ops\/utils\/validation-utils$/,
				replacement: sharedAgentOpsSrc('utils/validation-utils.ts')
			},
			{
				find: /^@buildos\/shared-types$/,
				replacement: fileURLToPath(new URL('../shared-types/src/index.ts', import.meta.url))
			}
		]
	}
});
