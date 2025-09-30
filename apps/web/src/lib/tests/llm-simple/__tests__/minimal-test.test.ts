// apps/web/src/lib/tests/llm-simple/__tests__/minimal-test.test.ts

import { describe, it, expect } from 'vitest';
import { processNewProject } from '../helpers/simple-llm-runner';
import { validateBrainDumpResult } from '../schemas/loose-validation';

/**
 * Minimal test to verify the simplified LLM testing infrastructure works
 */
describe('Minimal LLM Test', () => {
	it('can process a simple brain dump', async () => {
		const result = await processNewProject(`
      Create a simple calculator app with basic math operations.
    `);

		// Basic validation
		expect(result).toBeTruthy();
		expect(result.operations).toBeInstanceOf(Array);
		expect(result.operations.length).toBeGreaterThan(0);

		validateBrainDumpResult(result);

		// Should have at least a project operation
		const projectOp = result.operations.find((op) => op.table === 'projects');
		expect(projectOp).toBeTruthy();
		expect(projectOp.data.name).toBeTruthy();
	}, 25000); // 25 second timeout for this one test
});
