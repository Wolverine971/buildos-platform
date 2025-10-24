// apps/web/src/lib/stores/brain-dump-v2.store.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({ browser: false }));

import { brainDumpV2Store } from './brain-dump-v2.store';

describe('brainDumpV2Store project selection', () => {
	beforeEach(() => {
		brainDumpV2Store.reset();
	});

	it('selectProject sets selected project and recording view', () => {
		const project = { id: 'project-123', name: 'Test Project' };

		brainDumpV2Store.selectProject(project);

		const state = get(brainDumpV2Store);
		expect(state.core.selectedProject).toEqual(project);
		expect(state.core.isNewProject).toBe(false);
		expect(state.ui.modal.currentView).toBe('recording');
	});

	it('selectProject marks id "new" as new project', () => {
		const project = { id: 'new', name: 'New Project / Note', isProject: false };

		brainDumpV2Store.selectProject(project);

		const state = get(brainDumpV2Store);
		expect(state.core.selectedProject).toEqual(project);
		expect(state.core.isNewProject).toBe(true);
	});

	it('openModal with resetSelection clears project and shows selection view', () => {
		brainDumpV2Store.selectProject({ id: 'existing', name: 'Existing Project' });

		brainDumpV2Store.openModal({ resetSelection: true });

		const state = get(brainDumpV2Store);
		expect(state.core.selectedProject).toBeNull();
		expect(state.core.isNewProject).toBe(true);
		expect(state.ui.modal.isOpen).toBe(true);
		expect(state.ui.modal.currentView).toBe('project-selection');
	});

	it('openModal with project sets selection and recording view', () => {
		const project = { id: 'target', name: 'Target Project' };

		brainDumpV2Store.openModal({ project });

		const state = get(brainDumpV2Store);
		expect(state.core.selectedProject).toEqual(project);
		expect(state.core.isNewProject).toBe(false);
		expect(state.ui.modal.currentView).toBe('recording');
	});
});
