import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const AGENTIC_CHAT_ROOT = fileURLToPath(
	new URL('../src/workers/agentic-chat/', import.meta.url)
);

const RETIRED_MODULE_PATHS = [
	'phase3Bootstrap.ts',
	'phase3Config.ts',
	'phase3Assembly.ts',
	'fixtureTurnExecutor.ts',
	'fixtureMutationExecutor.ts',
	'openRouterReadOnlyClient.ts',
	'readOnlyProvider.ts',
	'readOnlyTool.ts',
	'fixtureConsumer.ts'
] as const;

const RETIRED_PRODUCTION_IDENTIFIERS = [
	/AgenticChatPhase3/,
	/AgenticChatFixture(?:Consumer|Execution|Mutation|Mutating|Provider|ReadTool|Turn|Usage)/,
	/AgenticChatOpenRouterReadOnlyClient/,
	/AgenticChatReadOnlyProvider/,
	/AgenticChatReadOnlyTool/
] as const;

describe('Agentic Chat production naming', () => {
	it('keeps retired migration modules and production identifiers out of worker source', () => {
		for (const relativePath of RETIRED_MODULE_PATHS) {
			expect(existsSync(join(AGENTIC_CHAT_ROOT, relativePath)), relativePath).toBe(false);
		}

		for (const filePath of typescriptFiles(AGENTIC_CHAT_ROOT)) {
			const source = readFileSync(filePath, 'utf8');
			for (const retiredIdentifier of RETIRED_PRODUCTION_IDENTIFIERS) {
				expect(source, `${filePath} contains ${retiredIdentifier}`).not.toMatch(retiredIdentifier);
			}
		}
	});
});

function typescriptFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return typescriptFiles(path);
		return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
	});
}
