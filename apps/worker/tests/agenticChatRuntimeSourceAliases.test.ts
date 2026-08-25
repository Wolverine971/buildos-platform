// apps/worker/tests/agenticChatRuntimeSourceAliases.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	AGENTIC_CHAT_RUNTIME_SOURCE_ENTRYPOINTS,
	type AgenticChatRuntimeSourceAlias
} from '../../../packages/agentic-chat-runtime/source-entrypoints';
import { agenticChatRuntimeSourceAliases as vitestAliases } from '../vitest.config';

const packageRootUrl = new URL('../../../packages/agentic-chat-runtime/', import.meta.url);

describe('worker runtime source resolution', () => {
	it('keeps test aliases aligned with every public runtime entry point', () => {
		assertAliasTable(vitestAliases);
	});

	it('opts development processes into the package development exports', () => {
		const workerPackageJson = JSON.parse(
			readFileSync(new URL('../package.json', import.meta.url), 'utf8')
		) as { scripts: Record<string, string> };

		for (const scriptName of ['dev', 'dev:chat', 'worker']) {
			expect(workerPackageJson.scripts[scriptName]).toContain('--conditions=development');
		}
	});
});

function assertAliasTable(aliases: AgenticChatRuntimeSourceAlias[]): void {
	const expectedSpecifiers = Object.keys(AGENTIC_CHAT_RUNTIME_SOURCE_ENTRYPOINTS).sort();
	const aliasedSpecifiers = aliases
		.map((alias) => expectedSpecifierForAlias(alias.find, expectedSpecifiers))
		.sort();

	expect(aliasedSpecifiers).toEqual(expectedSpecifiers);

	for (const alias of aliases) {
		const specifier = expectedSpecifierForAlias(alias.find, expectedSpecifiers);
		const sourcePath =
			AGENTIC_CHAT_RUNTIME_SOURCE_ENTRYPOINTS[
				specifier as keyof typeof AGENTIC_CHAT_RUNTIME_SOURCE_ENTRYPOINTS
			];
		expect(alias.replacement).toBe(fileURLToPath(new URL(sourcePath, packageRootUrl)));
	}
}

function expectedSpecifierForAlias(pattern: RegExp, expectedSpecifiers: string[]): string {
	const matches = expectedSpecifiers.filter((specifier) => pattern.test(specifier));
	expect(matches).toHaveLength(1);
	return matches[0]!;
}
