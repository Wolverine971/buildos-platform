import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const forbiddenProductionImports = [
	'$app/',
	'$env/',
	'$lib/',
	'@sveltejs/kit',
	'vercel',
	'railway',
	'supabase/admin',
	'process.env'
];

describe('runtime package portability', () => {
	it('keeps production modules free of host-framework and deployment imports', async () => {
		const entries = await readdir(sourceDirectory, { recursive: true });
		const sourceFiles = entries.filter(
			(file) => file.endsWith('.ts') && !file.endsWith('.test.ts')
		);
		const productionSource = (
			await Promise.all(
				sourceFiles.map((file) => readFile(join(sourceDirectory, file), 'utf8'))
			)
		).join('\n');

		for (const forbiddenImport of forbiddenProductionImports) {
			expect(productionSource).not.toContain(forbiddenImport);
		}
	});
});
