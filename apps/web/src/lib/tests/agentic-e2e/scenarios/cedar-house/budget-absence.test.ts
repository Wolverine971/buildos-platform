// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/budget-absence.test.ts
import { describe, expect, it } from 'vitest';
import { findRecordedBudgetAbsence } from './case-14-grounded-status.scenario';

describe('recorded budget absence oracle', () => {
	it.each([
		'No budget cap is recorded.',
		'The budget cap is not saved.',
		'The budget is currently not specified.',
		'**Budget cap:** not recorded.',
		'The cap isn’t recorded.',
		'There is no recorded budget limit.'
	])('rejects an explicit false absence: %s', (text) => {
		expect(findRecordedBudgetAbsence(text)).not.toBeNull();
	});

	it.each([
		'Budget cap: $85,000, including $10,000 contingency. Spend against budget is therefore unknown (not zero, just not recorded).',
		'The cap is $85,000. Actual spending is not recorded.',
		'Budget cap: $85,000. Invoices and payments are not recorded.',
		'Budget cap: $85,000.\nPermit status is not recorded.',
		'Budget cap: $85,000. No budget changes are recorded.'
	])('accepts a recorded cap alongside a different unknown: %s', (text) => {
		expect(findRecordedBudgetAbsence(text)).toBeNull();
	});
});
