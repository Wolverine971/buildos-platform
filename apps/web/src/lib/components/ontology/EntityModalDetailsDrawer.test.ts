// apps/web/src/lib/components/ontology/EntityModalDetailsDrawer.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const modalCases = [
	['TaskEditModal.svelte', 'Task details'],
	['GoalEditModal.svelte', 'Goal details'],
	['MilestoneEditModal.svelte', 'Milestone details'],
	['PlanEditModal.svelte', 'Plan details'],
	['EventEditModal.svelte', 'Event details'],
	['RiskEditModal.svelte', 'Risk details'],
	['OntologyProjectEditModal.svelte', 'Project details'],
	['PlanCreateModal.svelte', 'Plan guidance'],
	['../time-blocks/TimeBlockDetailModal.svelte', 'Time block details']
] as const;

const denseReviewedCases = [
	['TaskEditModal.svelte', 'Task details'],
	['PlanEditModal.svelte', 'Plan details'],
	['GoalEditModal.svelte', 'Goal details']
] as const;

describe('EntityModalDetailsDrawer rollout', () => {
	it('keeps the shared desktop drawer closed by default and anchored to the right', () => {
		const source = readFileSync(
			new URL('./EntityModalDetailsDrawer.svelte', import.meta.url),
			'utf8'
		);

		expect(source).toContain('let open = $state(false)');
		expect(source).toContain("? 'right-80 xl:right-96'");
		expect(source).toContain(": 'right-0'");
		expect(source).toContain('[writing-mode:vertical-rl]');
		expect(source).toContain("new MediaQuery('(min-width: 1024px)', false)");
		expect(source).toContain('lg:col-start-2 lg:row-start-1 lg:block lg:w-80');
		expect(source).toContain('lg:absolute lg:inset-y-0 lg:right-0');
		expect(source).toContain('lg:sticky lg:top-0 lg:flex');
		expect(source).toContain('lg:h-[calc(85dvh-10.125rem)]');
		expect(source).toContain('lg:max-h-full lg:min-h-0 lg:flex-col lg:overflow-hidden');
		expect(source).toContain('showDesktopHeader?: boolean');
		expect(source).toContain('lg:min-h-0 lg:flex-1 lg:overflow-y-auto');
		expect(source).toContain('lg:overscroll-contain');
		expect(source).toContain('lg:[scrollbar-gutter:stable]');
	});

	it.each(modalCases)('uses the shared drawer in %s', (fileName, panelLabel) => {
		const source = readFileSync(new URL(`./${fileName}`, import.meta.url), 'utf8');

		expect(source).toContain('import EntityModalDetailsDrawer from');
		expect(source).toContain(`panelLabel="${panelLabel}"`);
		expect(source).toContain('lg:grid-cols-[minmax(0,1fr)_auto]');
		expect(source).toContain('lg:overflow-x-clip');
		expect(source).not.toContain('grid-cols-1 lg:grid-cols-3');
	});

	it.each(denseReviewedCases)(
		'keeps %s dense, labeled, and progressively disclosed',
		(fileName, panelLabel) => {
			const source = readFileSync(new URL(`./${fileName}`, import.meta.url), 'utf8');

			expect(source).toContain(`panelLabel="${panelLabel}"`);
			expect(source).toContain('showDesktopHeader={true}');
			expect(source).toContain('let showLinkedEntities = $state(false)');
			expect(source).toContain('class="w-full py-2 flex items-center');
			expect(source).toContain('transition:slide={slideMotion()}');
			expect(source).not.toContain('Plan operations');
			expect(source).not.toContain('Goal operations');
		}
	);

	it('mounts project edit modals conditionally so each open gets fresh drawer state', () => {
		const projectHost = readFileSync(
			new URL('../project/ProjectModalsHost.svelte', import.meta.url),
			'utf8'
		);
		const workspaceHost = readFileSync(
			new URL(
				'../../../routes/projects/[id]/ProjectWorkspaceEntityModals.svelte',
				import.meta.url
			),
			'utf8'
		);

		expect(projectHost).toContain('{#if showProjectEditModal}');
		expect(projectHost).toContain('<OntologyProjectEditModal');
		expect(workspaceHost).toContain("{:else if editTarget?.kind === 'project'}");
		expect(workspaceHost).toContain('<OntologyProjectEditModal');
	});
});
