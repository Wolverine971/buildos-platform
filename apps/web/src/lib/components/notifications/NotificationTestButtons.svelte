<!-- apps/web/src/lib/components/notifications/NotificationTestButtons.svelte -->
<script lang="ts">
	/**
	 * Notification Test Buttons
	 *
	 * Simple component to test the notification system.
	 * Add this to any page to create test notifications.
	 *
	 * 📚 Usage Documentation: /NOTIFICATION_SYSTEM_IMPLEMENTATION.md#manual-test-interface
	 * ⚠️ IMPORTANT: Remove this component before production deployment
	 *
	 * Test Scenarios:
	 * 1. Brain Dump - Simulates dual processing with streaming progress
	 * 2. Calendar Analysis - Indeterminate progress
	 * 3. Error State - Error with retry action
	 * 4. Clear All - Tests cleanup logic
	 */

	import { onDestroy } from 'svelte';
	import { notificationStore } from '$lib/stores/notification.store';

	// Track active timers for cleanup
	let activeTimers: Set<ReturnType<typeof setTimeout | typeof setInterval>> = new Set();

	// Cleanup on component destroy
	onDestroy(() => {
		activeTimers.forEach((timer) => {
			clearTimeout(timer);
			clearInterval(timer);
		});
		activeTimers.clear();
	});

	function createBrainDumpNotification() {
		const id = notificationStore.add({
			type: 'brain-dump',
			status: 'processing',
			isMinimized: true,
			isPersistent: false, // Don't persist test notifications across refreshes
			autoCloseMs: null, // Manual close
			data: {
				brainDumpId: `test_${Date.now()}`,
				inputText: 'This is a test brain dump...',
				processingType: 'dual',
				selectedProject: {
					id: 'project-1',
					name: 'Test Project'
				}
			},
			progress: {
				type: 'streaming',
				message: 'Analyzing content...'
			},
			actions: {
				view: () => console.log('View clicked'),
				retry: () => console.log('Retry clicked'),
				dismiss: () => notificationStore.remove(id)
			}
		});

		// Simulate progress updates
		const timer1 = setTimeout(() => {
			notificationStore.setProgress(id, {
				type: 'streaming',
				message: 'Extracting tasks...',
				percentage: 50
			});
		}, 2000);
		activeTimers.add(timer1);

		// Simulate completion
		const timer2 = setTimeout(() => {
			notificationStore.setStatus(id, 'success');
			notificationStore.setProgress(id, {
				type: 'streaming',
				message: 'Brain dump processed successfully!'
			});
			activeTimers.delete(timer1);
			activeTimers.delete(timer2);
		}, 4000);
		activeTimers.add(timer2);
	}

	function createCalendarNotification() {
		const id = notificationStore.add({
			type: 'calendar-analysis',
			status: 'processing',
			isMinimized: true,
			isPersistent: true,
			autoCloseMs: null,
			data: {
				daysBack: 7,
				daysForward: 60
			},
			progress: {
				type: 'indeterminate',
				message: 'Analyzing calendar events...'
			},
			actions: {
				viewResults: () => console.log('View results clicked'),
				retry: () => console.log('Retry clicked'),
				dismiss: () => notificationStore.remove(id)
			}
		});

		// Simulate completion
		const timer = setTimeout(() => {
			notificationStore.setStatus(id, 'success');
			notificationStore.update(id, {
				data: {
					daysBack: 7,
					daysForward: 60,
					eventCount: 42,
					suggestions: []
				}
			});
			activeTimers.delete(timer);
		}, 3000);
		activeTimers.add(timer);
	}

	function createErrorNotification() {
		notificationStore.add({
			type: 'generic',
			status: 'error',
			isMinimized: true,
			isPersistent: true,
			autoCloseMs: null,
			data: {
				title: 'Test Error',
				message: 'Something went wrong!',
				error: 'This is a simulated error message for testing purposes.'
			},
			progress: {
				type: 'binary'
			},
			actions: {
				retry: () => console.log('Retry clicked'),
				dismiss: () => console.log('Dismiss clicked')
			}
		});
	}

	function clearAll() {
		// Clear all active timers first
		activeTimers.forEach((timer) => {
			clearTimeout(timer);
			clearInterval(timer);
		});
		activeTimers.clear();

		// Then clear notifications
		notificationStore.clear();
	}
</script>

<div class="fixed bottom-20 left-4 z-40 bg-card p-4 rounded-lg shadow-ink-strong border">
	<h3 class="text-sm font-bold mb-3 text-foreground">Notification Tests</h3>
	<div class="flex flex-col gap-2">
		<button
			onclick={createBrainDumpNotification}
			class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
		>
			+ Brain Dump
		</button>
		<button
			onclick={createCalendarNotification}
			class="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
		>
			+ Calendar
		</button>
		<button
			onclick={createErrorNotification}
			class="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
		>
			+ Error
		</button>
		<button
			onclick={clearAll}
			class="px-3 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
		>
			Clear All
		</button>
	</div>
</div>
