<!-- apps/web/src/lib/components/project/TaskMoveConfirmationModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Calendar, AlertTriangle, Edit3 } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import { formatDateForInput } from '$lib/utils/dateValidation';

	export let isOpen = false;
	export let task: {
		id: string;
		title: string;
		start_date: string | null;
	} | null = null;
	export let targetPhase: {
		id: string;
		name: string;
		start_date: string;
		end_date: string;
	} | null = null;
	export let suggestedDate: string | null = null;

	const dispatch = createEventDispatcher();

	// Local state for the editable date
	let editableDate: string = '';
	let editableTime: string = '09:00';
	let isEditingDate = false;
	let dateError: string | null = null;

	// Update local state when props change
	$: if (isOpen && task && targetPhase && suggestedDate) {
		const suggested = new Date(suggestedDate);
		editableDate = formatDateForInput(suggested);
		// Use local time for display
		const hours = suggested.getHours().toString().padStart(2, '0');
		const minutes = suggested.getMinutes().toString().padStart(2, '0');
		editableTime = `${hours}:${minutes}`; // HH:MM format in local time
		isEditingDate = false;
		dateError = null;
	}

	// Helper function to format date properly in user's local timezone
	function formatDateDisplay(dateStr: string): string {
		try {
			const date = new Date(dateStr);
			// Display in user's local timezone
			return date.toLocaleDateString('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				year: 'numeric',
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
			});
		} catch (error) {
			console.warn('Failed to format date:', dateStr, error);
			return 'Invalid date';
		}
	}

	function validateEditableDate(): boolean {
		if (!editableDate || !targetPhase) return false;

		try {
			// Create date in local timezone
			const combinedDateTime = new Date(`${editableDate}T${editableTime}`);
			const phaseStart = new Date(targetPhase.start_date);
			const phaseEnd = new Date(targetPhase.end_date);

			// Compare dates directly without modifying phase end
			// The phase end date already represents the end of that day in UTC
			if (combinedDateTime < phaseStart) {
				dateError = `Date cannot be before phase start (${formatDateDisplay(targetPhase.start_date)})`;
				return false;
			}

			if (combinedDateTime > phaseEnd) {
				dateError = `Date cannot be after phase end (${formatDateDisplay(targetPhase.end_date)})`;
				return false;
			}

			dateError = null;
			return true;
		} catch (error) {
			dateError = 'Invalid date format';
			return false;
		}
	}

	function getFinalDateTime(): string | null {
		if (isEditingDate && validateEditableDate()) {
			// Create date in local timezone, then convert to ISO string
			const localDateTime = new Date(`${editableDate}T${editableTime}`);
			return localDateTime.toISOString();
		}
		return null;
	}

	function handleConfirm() {
		const isValid = !isEditingDate || validateEditableDate();

		if (!isValid) return;

		dispatch('confirm', {
			task,
			targetPhaseId: targetPhase?.id,
			newStartDate: getFinalDateTime()
		});
		close();
	}

	function handleCancel() {
		dispatch('cancel');
		close();
	}

	function close() {
		isOpen = false;
		isEditingDate = false;
		dateError = null;
	}

	// Reactive validation
	$: if (isEditingDate) {
		validateEditableDate();
	}
</script>

<Modal {isOpen} onClose={handleCancel} size="md" closeOnBackdrop={true} closeOnEscape={true}>
	{#snippet header()}
		<div class="flex items-center space-x-3 p-3 sm:p-4">
			<div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex-shrink-0">
				<Calendar class="w-5 h-5 sm:w-6 sm:h-6 text-primary-600 dark:text-primary-400" />
			</div>
			<div class="min-w-0">
				<h2 class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
					Move Task to Phase
					<!-- here -->
				</h2>
				<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
					Task date will be updated to fit the target phase
				</p>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="space-y-4 sm:space-y-6">
			<!-- Task Info -->
			{#if task}
				<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 sm:p-4">
					<h3 class="text-sm sm:text-base font-medium text-gray-900 dark:text-white mb-2">
						Task
					</h3>
					<p class="text-xs sm:text-sm text-gray-700 dark:text-gray-300">{task.title}</p>
					{#if task.start_date}
						<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
							Current date: {formatDateDisplay(task.start_date)}
						</p>
					{:else}
						<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
							No current date set
						</p>
					{/if}
				</div>
			{/if}

			<!-- Target Phase Info -->
			{#if targetPhase}
				<div class="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-3 sm:p-4">
					<h3 class="text-sm sm:text-base font-medium text-gray-900 dark:text-white mb-2">
						Target Phase
					</h3>
					<p class="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
						{targetPhase.name}
					</p>
					<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
						{formatDateDisplay(targetPhase.start_date)} - {formatDateDisplay(
							targetPhase.end_date
						)}
					</p>
				</div>
			{/if}

			<!-- Date Assignment -->
			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
						New Task Date
					</h3>
					<Button
						onclick={() => (isEditingDate = !isEditingDate)}
						variant="outline"
						size="sm"
					>
						<Edit3 class="w-3 h-3 mr-1" />
						{isEditingDate ? 'Cancel Edit' : 'Edit Date'}
					</Button>
				</div>

				{#if isEditingDate}
					<div class="space-y-3">
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<FormField label="Date" labelFor="editable-date" size="sm">
								<TextInput
									id="editable-date"
									type="date"
									bind:value={editableDate}
									min={formatDateForInput(targetPhase?.start_date || '')}
									max={formatDateForInput(targetPhase?.end_date || '')}
									size="sm"
								/>
							</FormField>
							<FormField label="Time" labelFor="editable-time" size="sm">
								<TextInput
									id="editable-time"
									type="time"
									bind:value={editableTime}
									size="sm"
								/>
							</FormField>
						</div>

						{#if dateError}
							<div
								class="flex items-start gap-2 text-sm text-red-600 dark:text-red-400"
							>
								<AlertTriangle class="w-4 h-4 flex-shrink-0 mt-0.5" />
								<span>{dateError}</span>
							</div>
						{/if}
					</div>
				{:else if suggestedDate}
					<div class="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2 sm:p-3">
						<p class="text-xs sm:text-sm text-emerald-800 dark:text-emerald-200">
							<span class="font-medium">Suggested date:</span>
							{formatDateDisplay(suggestedDate)}
							at {(() => {
								const date = new Date(suggestedDate);
								let hours = date.getHours();
								const minutes = date.getMinutes();
								const ampm = hours >= 12 ? 'PM' : 'AM';
								hours = hours % 12 || 12;
								return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
							})()}
						</p>
					</div>
				{/if}
			</div>

			<!-- Warning message -->
			{#if task?.start_date}
				<div
					class="flex items-start gap-2 p-2 sm:p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg"
				>
					<AlertTriangle
						class="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
					/>
					<div class="text-xs sm:text-sm text-amber-800 dark:text-amber-200">
						<p class="font-medium">Task date will be updated</p>
						<p class="mt-1">
							The task's start date will be changed to fit within the target phase
							timeline. Any existing calendar events for this task will be
							automatically updated.
						</p>
					</div>
				</div>
			{:else}
				<div
					class="flex items-start gap-2 p-2 sm:p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg"
				>
					<Calendar
						class="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5"
					/>
					<div class="text-xs sm:text-sm text-primary-800 dark:text-primary-200">
						<p class="font-medium">Task date will be set</p>
						<p class="mt-1">
							This task doesn't have a start date yet. It will be assigned the
							suggested date.
						</p>
					</div>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<div class="flex flex-col sm:flex-row items-center justify-end gap-3 p-3 sm:p-4">
			<Button
				onclick={handleCancel}
				variant="outline"
				size="md"
				class="order-2 sm:order-1 w-full sm:w-auto"
			>
				Cancel
			</Button>
			<Button
				onclick={handleConfirm}
				disabled={isEditingDate && !validateEditableDate()}
				variant="primary"
				size="md"
				class="order-1 sm:order-2 w-full sm:w-auto"
			>
				<Calendar class="w-4 h-4 mr-2" />
				Move Task
			</Button>
		</div>
	{/snippet}
</Modal>
