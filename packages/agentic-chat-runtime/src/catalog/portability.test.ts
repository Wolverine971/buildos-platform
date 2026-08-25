// packages/agentic-chat-runtime/src/catalog/portability.test.ts
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const catalogDirectory = dirname(fileURLToPath(import.meta.url));
const forbiddenCatalogImports = [
	'$app/',
	'$env/',
	'$lib/',
	'@sveltejs/kit',
	'apps/web/',
	'apps/worker/',
	'@buildos/web',
	'@buildos/worker',
	'vercel',
	'railway',
	'process.env'
];

describe('catalog portability', () => {
	it('stays free of application, host-framework, and deployment imports', async () => {
		const entries = await readdir(catalogDirectory, { recursive: true });
		const sourceFiles = entries.filter(
			(file) => file.endsWith('.ts') && !file.endsWith('.test.ts')
		);
		const productionSource = (
			await Promise.all(
				sourceFiles.map((file) => readFile(join(catalogDirectory, file), 'utf8'))
			)
		).join('\n');

		for (const forbiddenImport of forbiddenCatalogImports) {
			expect(productionSource).not.toContain(forbiddenImport);
		}
	});
});
