import { readFile, readdir } from 'node:fs/promises';
import { relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = new URL('./src/', import.meta.url);
const SOURCE_EXTENSIONS = ['.cjs', '.js', '.mjs', '.svelte', '.ts'];
const LEGACY_MODULE_BASENAMES = new Set([
	'durable-text-validation',
	'entity-result-materialization',
	'gateway-surface',
	'project-create-args',
	'search-telemetry',
	'tool-definitions',
	'tool-registry',
	'tools.config'
]);
const MODULE_SPECIFIER_PATTERNS = [
	/(?:\bfrom\s+|\bimport\s*\(|\b(?:vi|jest)\.mock\s*\()\s*(['"])([^'"]+)\1/g,
	/\bimport\s+(['"])([^'"]+)\1/g
];

describe('Agentic Chat catalog import boundary', () => {
	it('prevents web consumers from recreating imports through deleted compatibility paths', async () => {
		const violations: string[] = [];
		for (const fileUrl of await listSourceFiles(SOURCE_ROOT)) {
			const source = await readFile(fileUrl, 'utf8');
			for (const pattern of MODULE_SPECIFIER_PATTERNS) {
				for (const match of source.matchAll(pattern)) {
					const specifier = match[2];
					if (specifier && isLegacyAgenticChatModule(fileUrl, specifier)) {
						violations.push(
							`${relative(SOURCE_ROOT.pathname, fileUrl.pathname)} -> ${specifier}`
						);
					}
				}
			}
		}

		expect(violations.sort()).toEqual([]);
	});
});

async function listSourceFiles(directory: URL): Promise<URL[]> {
	const files: URL[] = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
		if (entry.isDirectory()) {
			files.push(...(await listSourceFiles(child)));
		} else if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
			files.push(child);
		}
	}
	return files;
}

function isLegacyAgenticChatModule(sourceFile: URL, specifier: string): boolean {
	const normalized = specifier.replace(/\\/g, '/').replace(/\.(?:c|m)?js$|\.ts$/, '');
	const basename = normalized.split('/').at(-1);
	if (basename && LEGACY_MODULE_BASENAMES.has(basename)) return true;
	if (normalized.includes('agentic-chat/tools/core/definitions')) return true;

	return (
		sourceFile.pathname.includes('/services/agentic-chat/tools/core/') &&
		/^\.\/definitions(?:\/|$)/.test(normalized)
	);
}
