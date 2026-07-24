// apps/web/scripts/lib/codebase-inventory.test.ts
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	analyzeCodebase,
	renderDuplicateReportMarkdown,
	renderInventoryMarkdown
} from './codebase-inventory';

describe('codebase inventory', () => {
	it('indexes function declarations, arrows, methods, nesting, imports, and exports', async () => {
		const projectRoot = await makeProject({
			'src/lib/dependency.ts': 'export function helper(value: number) { return value + 1; }',
			'src/lib/example.ts': `
import { helper } from './dependency';

export const transformValue = (value: number): number => {
	return helper(value);
};

export class ExampleService {
	run(value: number): number {
		function nested(input: number) {
			return input * 2;
		}
		return nested(value);
	}
}
`
		});

		const inventory = await analyzeCodebase({ projectRoot, sourceRoots: ['src/lib'] });
		const example = inventory.files.find((file) => file.path === 'src/lib/example.ts');

		expect(inventory.summary.files).toBe(2);
		expect(example?.imports[0]?.resolvedPath).toBe('src/lib/dependency.ts');
		expect(example?.exports).toEqual(['ExampleService', 'transformValue']);
		expect(example?.functions.map((fn) => fn.qualifiedName)).toEqual([
			'transformValue',
			'ExampleService.run',
			'ExampleService.run.nested'
		]);
		expect(example?.functions[2]?.nestingDepth).toBe(1);
		expect(example?.functions[0]?.exported).toBe(true);
		expect(example?.functions[1]?.exported).toBe(true);
		expect(example?.functions[2]?.exported).toBe(false);
		expect(inventory.files[0]?.importedBy).toEqual(['src/lib/example.ts']);
	});

	it('groups renamed structural clones without repeating them in the near-match queue', async () => {
		const projectRoot = await makeProject({
			'src/lib/first.ts': `
export function normalizeProjectName(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) throw new Error('Missing project name');
	return trimmed.toLowerCase().replace(/\\s+/g, '-');
}
`,
			'src/lib/second.ts': `
export function prepareWorkspaceSlug(value: string): string {
	const clean = value.trim();
	if (!clean) throw new Error('Missing workspace name');
	return clean.toLowerCase().replace(/\\s+/g, '-');
}
`
		});

		const inventory = await analyzeCodebase({
			projectRoot,
			sourceRoots: ['src/lib'],
			minSimilarityScore: 0.5
		});
		expect(inventory.cloneGroups[0]?.kind).toBe('normalized-structure');
		expect(inventory.cloneGroups[0]?.functions).toHaveLength(2);
		expect(inventory.duplicateCandidates).toHaveLength(0);
	});

	it('keeps structurally similar non-clones in the ranked near-match queue', async () => {
		const projectRoot = await makeProject({
			'src/lib/first.ts': `
export function normalizeProjectInput(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	return trimmed.toLowerCase();
}
`,
			'src/lib/second.ts': `
export function normalizeWorkspaceInput(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	const normalized = trimmed.toLowerCase();
	return normalized;
}
`
		});

		const inventory = await analyzeCodebase({
			projectRoot,
			sourceRoots: ['src/lib'],
			minSimilarityScore: 0.5
		});
		const candidate = inventory.duplicateCandidates[0];

		expect(candidate?.left.file).toBe('src/lib/first.ts');
		expect(candidate?.right.file).toBe('src/lib/second.ts');
		expect(candidate?.signals.structure).toBeGreaterThan(0.5);
		expect(candidate?.signals.structure).toBeLessThan(1);
	});

	it('indexes tests while excluding them from candidates and renders both reports', async () => {
		const implementation = `
export function calculateThing(value: number): number {
	const adjusted = value + 2;
	return adjusted * adjusted;
}
`;
		const projectRoot = await makeProject({
			'src/lib/one.test.ts': implementation,
			'src/lib/two.test.ts': implementation
		});

		const inventory = await analyzeCodebase({ projectRoot, sourceRoots: ['src/lib'] });

		expect(inventory.summary.filesByKind.test).toBe(2);
		expect(inventory.duplicateCandidates).toHaveLength(0);
		expect(renderInventoryMarkdown(inventory)).toContain('calculateThing');
		expect(renderDuplicateReportMarkdown(inventory)).toContain(
			'Tests and generated files are indexed but excluded'
		);
	});
});

async function makeProject(files: Record<string, string>): Promise<string> {
	const projectRoot = await mkdtemp(join(tmpdir(), 'buildos-codebase-inventory-'));
	for (const [relativePath, contents] of Object.entries(files)) {
		const filePath = join(projectRoot, relativePath);
		await mkdir(join(filePath, '..'), { recursive: true });
		await writeFile(filePath, contents, 'utf8');
	}
	return projectRoot;
}
