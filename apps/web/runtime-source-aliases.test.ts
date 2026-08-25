// apps/web/runtime-source-aliases.test.ts
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	AGENTIC_CHAT_RUNTIME_SOURCE_ENTRYPOINTS,
	type AgenticChatRuntimeSourceAlias
} from '../../packages/agentic-chat-runtime/source-entrypoints';
import { agenticChatRuntimeSourceAliases as viteAliases } from './vite.config';
import { agenticChatRuntimeSourceAliases as vitestAliases } from './vitest.config';

const packageRootUrl = new URL('../../packages/agentic-chat-runtime/', import.meta.url);

describe('web runtime source aliases', () => {
	it('keeps development and test aliases aligned with every public runtime entry point', () => {
		assertAliasTable(viteAliases);
		assertAliasTable(vitestAliases);
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
