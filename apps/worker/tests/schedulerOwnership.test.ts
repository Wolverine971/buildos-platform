// apps/worker/tests/schedulerOwnership.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schedulerSource = readSource('../src/scheduler.ts');
const operativeSource = readSource('../src/scheduler/agentOperatives.ts');

describe('scheduler domain ownership', () => {
	it('keeps Saved Operative persistence and queue admission out of the cron composition root', () => {
		expect(lineCount(schedulerSource)).toBeLessThanOrEqual(1_300);
		expect(schedulerSource).toContain("from './scheduler/agentOperatives'");
		expect(schedulerSource).not.toContain("from('agent_operatives')");
		expect(schedulerSource).not.toContain('validateAgentRunMetadata');
	});

	it('keeps the Saved Operative domain focused and free of cron registration', () => {
		expect(lineCount(operativeSource)).toBeLessThanOrEqual(350);
		expect(operativeSource).toContain("from('agent_operatives')");
		expect(operativeSource).toContain('validateAgentRunMetadata');
		expect(operativeSource).not.toMatch(/cron\.schedule|startScheduler/);
	});
});

function readSource(relativePath: string): string {
	return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function lineCount(source: string): number {
	return source.split(/\r?\n/).length;
}
