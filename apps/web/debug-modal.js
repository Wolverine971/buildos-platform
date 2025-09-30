// apps/web/debug-modal.js
import { modalStore } from './src/lib/stores/modal.store.ts';

console.log('Testing modal store...');

// Subscribe to modal store changes
modalStore.subscribe((state) => {
	console.log('Modal store state changed:', state);
});

// Test opening projectHistory modal
console.log('Opening projectHistory modal...');
modalStore.open('projectHistory');

// Check if the modal is open after a delay
setTimeout(() => {
	console.log('Checking modal state after open...');
	const currentState = $modalStore;
	console.log('Current modal state:', currentState);
	console.log('Project history modal state:', currentState.projectHistory);
}, 100);
