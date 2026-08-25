// packages/agentic-chat-runtime/source-entrypoints.ts
import { fileURLToPath } from 'node:url';

export const AGENTIC_CHAT_RUNTIME_SOURCE_ENTRYPOINTS = {
	'@buildos/agentic-chat-runtime': './src/index.ts',
	'@buildos/agentic-chat-runtime/catalog': './src/catalog/index.ts',
	'@buildos/agentic-chat-runtime/context': './src/context/index.ts',
	'@buildos/agentic-chat-runtime/loop': './src/loop/index.ts',
	'@buildos/agentic-chat-runtime/supervisor': './src/supervisor/index.ts',
	'@buildos/agentic-chat-runtime/tools': './src/tools/index.ts',
	'@buildos/agentic-chat-runtime/tools/milestone-state': './src/tools/milestone-state.ts'
} as const;

export type AgenticChatRuntimeSourceAlias = {
	find: RegExp;
	replacement: string;
};

export function createAgenticChatRuntimeSourceAliases(
	packageRootUrl: URL
): AgenticChatRuntimeSourceAlias[] {
	return Object.entries(AGENTIC_CHAT_RUNTIME_SOURCE_ENTRYPOINTS).map(
		([specifier, sourcePath]) => ({
			find: new RegExp(`^${escapeRegExp(specifier)}$`),
			replacement: fileURLToPath(new URL(sourcePath, packageRootUrl))
		})
	);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
