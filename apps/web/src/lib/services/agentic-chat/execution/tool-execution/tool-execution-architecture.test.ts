// apps/web/src/lib/services/agentic-chat/execution/tool-execution/tool-execution-architecture.test.ts
import { readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const executionDirectory = resolve(
	process.cwd(),
	'src/lib/services/agentic-chat/execution/tool-execution'
);
const facadePath = resolve(
	process.cwd(),
	'src/lib/services/agentic-chat/execution/tool-execution-service.ts'
);
const productionFiles = [
	facadePath,
	...readdirSync(executionDirectory)
		.filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
		.map((file) => resolve(executionDirectory, file))
];

const readSource = (file: string): string => readFileSync(file, 'utf8');
const lineCount = (source: string): number => source.trimEnd().split(/\r?\n/).length;

describe('tool execution architecture ratchets', () => {
	it('keeps the compatibility facade at or below 500 lines', () => {
		expect(lineCount(readSource(facadePath))).toBeLessThanOrEqual(500);
	});

	it('keeps every extracted production module at or below 600 lines', () => {
		const oversized = productionFiles
			.filter((file) => file !== facadePath)
			.map((file) => ({ file: basename(file), lines: lineCount(readSource(file)) }))
			.filter(({ lines }) => lines > 600);
		expect(oversized).toEqual([]);
	});

	it('does not reintroduce explicit any into the execution package', () => {
		const violations = productionFiles.flatMap((file) => {
			const matches = readSource(file).match(/\bany\b/g);
			return matches ? [{ file: basename(file), count: matches.length }] : [];
		});
		expect(violations).toEqual([]);
	});
});
