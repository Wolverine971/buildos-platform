<!-- apps/web/src/lib/components/calendar/CalendarDisconnectModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { AlertTriangle, Calendar, Clock, Unlink, X, CheckCircle } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { CalendarDependencies } from '$lib/services/calendar-disconnect-service';

	// Props
	let {
		isOpen = $bindable(false),
		calendarData = null as CalendarDependencies['breakdown'] | null,
		loading = false
	}: {
		isOpen?: boolean;
		calendarData?: CalendarDependencies['breakdown'] | null;
		loading?: boolean;
	} = $props();

	// State
	let selectedAction = $state<'keep' | 'remove' | null>('keep');

	const dispatch = createEventDispatcher();

	function handleConfirm() {
		if (!selectedAction) {
			console.warn('No action selected for calendar disconnect');
			return;
		}

		dispatch('confirm', { action: selectedAction });
	}

	function handleCancel() {
		selectedAction = 'keep'; // Reset to default
		dispatch('cancel');
	}

	// Computed values
	const hasAnyData = $derived(
		calendarData && (calendarData.scheduledTasks > 0 || calendarData.timeBlocks > 0)
	);

	const totalItems = $derived(
		calendarData ? calendarData.scheduledTasks + calendarData.timeBlocks : 0
	);

	const getActionButtonText = () => {
		if (loading) return 'Disconnecting...';
		if (selectedAction === 'remove') return 'Remove & Disconnect';
		return 'Keep & Disconnect';
	};

	const getActionButtonVariant = () => {
		if (selectedAction === 'remove') return 'danger';
		return 'primary';
	};
</script>

<Modal
	bind:isOpen
	onClose={handleCancel}
	size="md"
	title=""
	closeOnBackdrop={!loading}
	closeOnEscape={!loading}
>
	<div class="px-4 sm:px-6 py-4">
		<!-- Header with warning icon -->
		<div class="flex items-start gap-3 mb-6">
			<div class="p-2 bg-amber-100 dark:bg-amber-900 rounded-lg flex-shrink-0">
				<AlertTriangle class="w-5 h-5 text-amber-600 dark:text-amber-400" />
			</div>
			<div class="flex-1">
				<h2 class="text-xl font-semibold text-foreground">Disconnect Google Calendar?</h2>
				{#if hasAnyData}
					<p class="text-sm text-muted-foreground mt-1">
						You have {totalItems} item{totalItems !== 1 ? 's' : ''} connected to your Google
						Calendar
					</p>
				{:else}
					<p class="text-sm text-muted-foreground mt-1">
						Are you sure you want to disconnect your Google Calendar?
					</p>
				{/if}
			</div>
		</div>

		<!-- Data Summary (only show if there's data) -->
		{#if hasAnyData && calendarData}
			<div class="bg-muted rounded-lg p-4 mb-6">
				<h3 class="text-sm font-medium text-foreground mb-3">Connected items:</h3>
				<div class="space-y-2">
					{#if calendarData.scheduledTasks > 0}
						<div class="flex items-center gap-2">
							<Calendar class="w-4 h-4 text-blue-500 flex-shrink-0" />
							<span class="text-sm text-foreground">
								{calendarData.scheduledTasks} scheduled task{calendarData.scheduledTasks !==
								1
									? 's'
									: ''}
							</span>
						</div>
					{/if}

					{#if calendarData.timeBlocks > 0}
						<div class="flex items-center gap-2">
							<Clock class="w-4 h-4 text-purple-500 flex-shrink-0" />
							<span class="text-sm text-foreground">
								{calendarData.timeBlocks} time block{calendarData.timeBlocks !== 1
									? 's'
									: ''}
							</span>
						</div>
					{/if}

					{#if calendarData.calendarTasks > 0}
						<div class="flex items-center gap-2">
							<CheckCircle class="w-4 h-4 text-green-500 flex-shrink-0" />
							<span class="text-sm text-foreground">
								{calendarData.calendarTasks} task{calendarData.calendarTasks !== 1
									? 's'
									: ''} from calendar analysis
							</span>
						</div>
					{/if}
				</div>
			</div>

			<!-- Options -->
			<div class="space-y-3 mb-6">
				<h3 class="text-sm font-medium text-foreground">
					What would you like to do with these items?
				</h3>

				<!-- Keep option -->
				<label
					class="flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all
							hover:bg-muted
							{selectedAction === 'keep' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900' : 'border-border'}"
				>
					<input
						type="radio"
						bind:group={selectedAction}
						value="keep"
						disabled={loading}
						class="mt-1 text-blue-600 focus:ring-blue-500"
					/>
					<div class="flex-1">
						<div class="font-medium text-foreground">Keep tasks and time blocks</div>
						<div class="text-sm text-muted-foreground mt-1">
							Disconnect calendar but preserve all scheduled items in BuildOS
						</div>
					</div>
				</label>

				<!-- Remove option -->
				<label
					class="flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all
							hover:bg-muted
							{selectedAction === 'remove' ? 'border-red-500 bg-red-50 dark:bg-red-900' : 'border-border'}"
				>
					<input
						type="radio"
						bind:group={selectedAction}
						value="remove"
						disabled={loading}
						class="mt-1 text-red-600 focus:ring-red-500"
					/>
					<div class="flex-1">
						<div class="font-medium text-foreground">Remove all calendar data</div>
						<div class="text-sm text-muted-foreground mt-1">
							Delete all scheduled tasks and time blocks from BuildOS
						</div>
						{#if selectedAction === 'remove'}
							<div
								class="mt-2 p-2 bg-red-100 dark:bg-red-900 rounded text-xs text-red-700 dark:text-red-300 flex items-center gap-1"
							>
								<AlertTriangle class="w-3 h-3" />
								<span>This action cannot be undone</span>
							</div>
						{/if}
					</div>
				</label>
			</div>
		{:else}
			<!-- No data message -->
			<div
				class="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6"
			>
				<p class="text-sm text-blue-800 dark:text-blue-200">
					You don't have any scheduled tasks or time blocks. You can safely disconnect
					your calendar.
				</p>
			</div>
		{/if}

		<!-- Actions -->
		<div class="flex gap-3 justify-end border-t border-border pt-4">
			<Button onclick={handleCancel} variant="outline" disabled={loading}>Cancel</Button>
			<Button
				onclick={handleConfirm}
				variant={getActionButtonVariant()}
				disabled={loading || !selectedAction}
				{loading}
				icon={Unlink}
			>
				{getActionButtonText()}
			</Button>
		</div>
	</div>
</Modal>
