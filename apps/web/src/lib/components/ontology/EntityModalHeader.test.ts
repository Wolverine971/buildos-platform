// apps/web/src/lib/components/ontology/EntityModalHeader.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editModalCases = [
	'TaskEditModal.svelte',
	'GoalEditModal.svelte',
	'PlanEditModal.svelte',
	'RiskEditModal.svelte',
	'MilestoneEditModal.svelte',
	'EventEditModal.svelte',
	'OntologyProjectEditModal.svelte'
] as const;

describe('EntityModalHeader standardization', () => {
	it('keeps the shared header limited to identity and actions', () => {
		const source = readFileSync(new URL('./EntityModalHeader.svelte', import.meta.url), 'utf8');

		expect(source).toContain('title: string');
		expect(source).toContain('icon: Snippet');
		expect(source).toContain('actions?: Snippet');
		expect(source).toContain('px-2 py-1.5 sm:px-3 sm:py-2');
		expect(source).toContain('rounded-md bg-accent/10');
		expect(source).not.toMatch(/date|state|priority|status/i);
	});

	it.each(editModalCases)('uses the minimal shared header in %s', (fileName) => {
		const source = readFileSync(new URL(`./${fileName}`, import.meta.url), 'utf8');
		const headerStart = source.indexOf('{#snippet header()}');
		const headerEnd = source.indexOf('{/snippet}', headerStart);
		const headerSource = source.slice(headerStart, headerEnd);

		expect(source).toContain("import EntityModalHeader from './EntityModalHeader.svelte'");
		expect(source).toMatch(/ariaLabel=\{[^}]+\}/);
		expect(headerSource).toContain('<EntityModalHeader');
		expect(headerSource).toContain('icon={headerIcon}');
		expect(headerSource).toContain('actions={headerActions}');
		expect(headerSource).not.toMatch(/Badge|Created|Updated|Due|state|priority|impact/i);
	});

	it('leaves the document header independent so its extra context is preserved', () => {
		const source = readFileSync(new URL('./DocumentModal.svelte', import.meta.url), 'utf8');

		expect(source).not.toContain("import EntityModalHeader from './EntityModalHeader.svelte'");
		expect(source).toContain('class="document-modal-header');
		expect(source).toContain('{@render saveStatusIndicator()}');
	});
});
