// apps/web/src/lib/stores/modal.store.ts
import { writable, derived } from 'svelte/store';

interface ModalState {
	[key: string]: {
		isOpen: boolean;
		data?: any;
		phaseId?: string | null;
		phase?: any;
	};
}

function createModalStore() {
	const { subscribe, update } = writable<ModalState>({
		// Project modals
		projectEdit: { isOpen: false },
		projectContext: { isOpen: false },
		projectHistory: { isOpen: false },
		projectDelete: { isOpen: false },
		projectCalendarSettings: { isOpen: false },
		projectCalendarConnect: { isOpen: false },

		// Content modals
		brief: { isOpen: false },
		task: { isOpen: false },
		note: { isOpen: false },

		// Calendar modals
		calendarRefresh: { isOpen: false },
		markDeleted: { isOpen: false },
		scheduling: { isOpen: false },
		calendarAnalysis: { isOpen: false },
		calendarAnalysisResults: { isOpen: false },

		// Phase modals
		projectDates: { isOpen: false },
		phaseGenerationConfirmation: { isOpen: false },
		unscheduleConfirmation: { isOpen: false },
		deletePhase: { isOpen: false },
		deletePhaseTask: { isOpen: false }, // Separate from main task delete
		assignBacklogTasks: { isOpen: false },
		rescheduleOverdueTasks: { isOpen: false },
		scheduleAllPhases: { isOpen: false }
	});

	return {
		subscribe,

		open(modalName: string, data?: any, extra?: any) {
			update((state) => ({
				...state,
				[modalName]: {
					isOpen: true,
					data: data || null,
					// Handle special cases
					...(modalName === 'task' && extra?.phaseId ? { phaseId: extra.phaseId } : {}),
					...(modalName === 'scheduling' && data ? { phase: data } : {}),
					...(modalName === 'deletePhase' && data ? { phase: data } : {}),
					...(modalName === 'deletePhaseTask' && data ? { taskId: data } : {})
				}
			}));
		},

		close(modalName: string) {
			update((state) => ({
				...state,
				[modalName]: { isOpen: false, data: null, phaseId: null, phase: null }
			}));
		},

		closeAll() {
			update((state) => {
				const newState = {};
				Object.keys(state).forEach((key) => {
					newState[key] = { isOpen: false, data: null, phaseId: null, phase: null };
				});
				return newState;
			});
		},

		// Derived store for easy access to individual modal states
		getModal: (modalName: string) =>
			derived({ subscribe }, ($modals) => $modals[modalName] || { isOpen: false })
	};
}

export const modalStore = createModalStore();
