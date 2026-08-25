// packages/agentic-chat-runtime/source-entrypoints.test.ts
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	AGENTIC_CHAT_RUNTIME_SOURCE_ENTRYPOINTS,
	createAgenticChatRuntimeSourceAliases
} from './source-entrypoints';

type PackageExport = {
	types: string;
	development: string;
	import: string;
	require: string;
};

type RuntimePackageJson = {
	name: string;
	exports: Record<string, PackageExport>;
};

const packageRootUrl = new URL('./', import.meta.url);
const packageJson = JSON.parse(
	readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as RuntimePackageJson;

describe('runtime package entry points', () => {
	it('keeps public exports, development sources, and source files in sync', () => {
		const exportedSpecifiers = Object.keys(packageJson.exports)
			.map((subpath) => toPackageSpecifier(packageJson.name, subpath))
			.sort();
		const sourceSpecifiers = Object.keys(AGENTIC_CHAT_RUNTIME_SOURCE_ENTRYPOINTS).sort();

		expect(sourceSpecifiers).toEqual(exportedSpecifiers);

		for (const [specifier, sourcePath] of Object.entries(
			AGENTIC_CHAT_RUNTIME_SOURCE_ENTRYPOINTS
		)) {
			const subpath = toPackageSubpath(packageJson.name, specifier);
			const packageExport = packageJson.exports[subpath];

			expect(packageExport, `missing export for ${specifier}`).toBeDefined();
			expect(packageExport?.development).toBe(sourcePath);
			expect(packageExport?.types.endsWith('.d.ts')).toBe(true);
			expect(packageExport?.import.endsWith('.mjs')).toBe(true);
			expect(packageExport?.require.endsWith('.js')).toBe(true);
			expect(existsSync(new URL(sourcePath, packageRootUrl))).toBe(true);
		}
	});

	it('creates one exact source alias for every public export', () => {
		const aliases = createAgenticChatRuntimeSourceAliases(packageRootUrl);
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
	});
});

function expectedSpecifierForAlias(pattern: RegExp, expectedSpecifiers: string[]): string {
	const matches = expectedSpecifiers.filter((specifier) => pattern.test(specifier));
	expect(matches).toHaveLength(1);
	return matches[0]!;
}

function toPackageSpecifier(packageName: string, subpath: string): string {
	return subpath === '.' ? packageName : `${packageName}${subpath.slice(1)}`;
}

function toPackageSubpath(packageName: string, specifier: string): string {
	return specifier === packageName ? '.' : `.${specifier.slice(packageName.length)}`;
}
