<!-- apps/web/src/lib/components/briefs/BriefsSettingsModal.svelte -->
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import { briefPreferencesStore } from '$lib/stores/briefPreferences';
	import type { BriefPreferences } from '$lib/stores/briefPreferences';
	import { Bell, Save, X, RotateCcw, Clock, AlertCircle, RefreshCw } from 'lucide-svelte';
	import { toastService } from '$lib/stores/toast.store';

	// Props
	export let isOpen = false;
	export let onClose: () => void;

	// Create event dispatcher for parent communication
	const dispatch = createEventDispatcher();

	// State
	let isEditing = false;
	let briefPreferences: BriefPreferences | null = null;
	let briefPreferencesForm: BriefPreferences = {
		frequency: 'daily',
		day_of_week: 1,
		time_of_day: '09:00:00',
		timezone: 'UTC',
		is_active: true
	};

	// For the time input, we need to handle HH:MM format
	let timeInputValue = '09:00';

	// Timezone options
	const TIMEZONE_OPTIONS = [
		{ value: 'UTC', label: 'UTC' },
		{ value: 'America/New_York', label: 'Eastern Time (ET)' },
		{ value: 'America/Chicago', label: 'Central Time (CT)' },
		{ value: 'America/Denver', label: 'Mountain Time (MT)' },
		{ value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
		{ value: 'Europe/London', label: 'London (GMT/BST)' },
		{ value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
		{ value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
		{ value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
		{ value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' }
	];

	// Day of week options
	const DAY_OPTIONS = [
		{ value: 0, label: 'Sunday' },
		{ value: 1, label: 'Monday' },
		{ value: 2, label: 'Tuesday' },
		{ value: 3, label: 'Wednesday' },
		{ value: 4, label: 'Thursday' },
		{ value: 5, label: 'Friday' },
		{ value: 6, label: 'Saturday' }
	];

	// Helper functions for time format conversion
	function convertTimeToHHMMSS(timeHHMM: string): string {
		if (!timeHHMM) return '09:00:00';
		if (timeHHMM.includes(':') && timeHHMM.split(':').length === 2) {
			return `${timeHHMM}:00`;
		}
		return timeHHMM;
	}

	function convertTimeToHHMM(timeHHMMSS: string): string {
		if (!timeHHMMSS) return '09:00';
		const parts = timeHHMMSS.split(':');
		if (parts.length >= 2) {
			return `${parts[0]}:${parts[1]}`;
		}
		return timeHHMMSS;
	}

	// Store subscription
	$: briefPreferencesState = $briefPreferencesStore;
	$: if (briefPreferencesState.preferences) {
		briefPreferences = briefPreferencesState.preferences;
		if (!isEditing) {
			briefPreferencesForm = { ...briefPreferences };
			timeInputValue = convertTimeToHHMM(briefPreferences.time_of_day);
		}
	}

	// Handle store errors
	$: if (briefPreferencesState.error) {
		toastService.error(briefPreferencesState.error);
		briefPreferencesStore.clearError();
	}

	// Update form when time input changes
	$: if (timeInputValue && briefPreferencesForm) {
		briefPreferencesForm.time_of_day = convertTimeToHHMMSS(timeInputValue);
	}

	// Load brief preferences on mount
	async function loadBriefPreferences() {
		if (!briefPreferencesState?.preferences) {
			try {
				await briefPreferencesStore.load();
			} catch (error) {
				toastService.error('Failed to load brief preferences');
			}
		}
	}

	// Initialize on component load
	onMount(() => {
		loadBriefPreferences();
	});

	// Brief preferences functions
	function startEditing() {
		isEditing = true;
		briefPreferencesForm = briefPreferences
			? { ...briefPreferences }
			: briefPreferencesStore.getDefaults();
		timeInputValue = convertTimeToHHMM(briefPreferencesForm.time_of_day);
	}

	function cancelEditing() {
		isEditing = false;
		briefPreferencesForm = briefPreferences
			? { ...briefPreferences }
			: briefPreferencesStore.getDefaults();
		timeInputValue = convertTimeToHHMM(briefPreferencesForm.time_of_day);
	}

	async function saveBriefPreferences() {
		try {
			// Ensure time is in HH:MM:SS format before saving
			const formToSave = {
				...briefPreferencesForm,
				time_of_day: convertTimeToHHMMSS(timeInputValue)
			};

			await briefPreferencesStore.save(formToSave);
			isEditing = false;
			toastService.success('Brief preferences saved successfully');
			dispatch('save');
		} catch (error) {
			toastService.error(
				`Failed to save brief preferences: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	async function resetBriefPreferences() {
		if (confirm('Are you sure you want to reset to default preferences?')) {
			try {
				await briefPreferencesStore.resetToDefaults();
				isEditing = false;
				toastService.success('Brief preferences reset to defaults');
				dispatch('reset');
			} catch (error) {
				toastService.error(
					`Failed to reset preferences: ${error instanceof Error ? error.message : 'Unknown error'}`
				);
			}
		}
	}

	function formatDateTime(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<Modal {isOpen} {onClose} title="Brief Settings" size="md">
	<div class="space-y-6">
		{#if briefPreferencesState.isLoading}
			<div class="text-center py-8">
				<div
					class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"
				></div>
				<p class="text-gray-500 dark:text-gray-400 mt-4">Loading preferences...</p>
			</div>
		{:else if briefPreferencesState.error && !briefPreferences}
			<div class="text-center py-8">
				<AlertCircle class="w-12 h-12 text-rose-400 mx-auto mb-4" />
				<p class="text-gray-500 dark:text-gray-400 mb-4">
					Failed to load brief preferences
				</p>
				<Button on:click={loadBriefPreferences} variant="primary" size="sm">
					<RefreshCw class="w-4 h-4 mr-2" />
					Retry
				</Button>
			</div>
		{:else if !isEditing && briefPreferences}
			<!-- Display Mode -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<div>
					<p class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
						Frequency
					</p>
					<div class="px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
						{briefPreferences.frequency === 'daily' ? 'Daily' : 'Weekly'}
					</div>
				</div>

				{#if briefPreferences.frequency === 'weekly'}
					<div>
						<p class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
							Day of Week
						</p>
						<div class="px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
							{DAY_OPTIONS.find((d) => d.value === briefPreferences?.day_of_week)
								?.label || 'Monday'}
						</div>
					</div>
				{/if}

				<div>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
						Time
					</label>
					<div class="px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
						{convertTimeToHHMM(briefPreferences?.time_of_day)}
					</div>
				</div>

				<div>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
						Timezone
					</label>
					<div class="px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
						{TIMEZONE_OPTIONS.find((tz) => tz.value === briefPreferences?.timezone)
							?.label || briefPreferences?.timezone}
					</div>
				</div>

				<div class="md:col-span-2">
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
						Status
					</label>
					<div class="flex items-center space-x-2">
						<div
							class={`px-3 py-1 rounded-full text-sm font-medium ${briefPreferences.is_active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}
						>
							{briefPreferences.is_active ? 'Active' : 'Inactive'}
						</div>
						{#if briefPreferencesState.nextScheduledBrief}
							<span class="text-sm text-gray-500 dark:text-gray-400">
								Next: {formatDateTime(
									briefPreferencesState.nextScheduledBrief.toISOString()
								)}
							</span>
						{/if}
					</div>
				</div>
			</div>
		{:else}
			<!-- Edit Mode -->
			<div class="space-y-6">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<FormField label="Frequency" labelFor="brief-frequency">
						<Select
							id="brief-frequency"
							bind:value={briefPreferencesForm.frequency}
							on:change={(e) => (briefPreferencesForm.frequency = e.detail)}
							size="md"
						>
							<option value="daily">Daily</option>
							<option value="weekly">Weekly</option>
						</Select>
					</FormField>

					{#if briefPreferencesForm.frequency === 'weekly'}
						<FormField label="Day of Week" labelFor="brief-day-of-week">
							<Select
								id="brief-day-of-week"
								bind:value={briefPreferencesForm.day_of_week}
								on:change={(e) => (briefPreferencesForm.day_of_week = e.detail)}
								size="md"
							>
								{#each DAY_OPTIONS as day}
									<option value={day.value}>{day.label}</option>
								{/each}
							</Select>
						</FormField>
					{/if}

					<FormField label="Time" labelFor="briefTime" size="md">
						<TextInput
							id="briefTime"
							type="time"
							bind:value={timeInputValue}
							size="md"
						/>
					</FormField>

					<FormField label="Timezone" labelFor="briefTimezone" size="md">
						<Select
							id="briefTimezone"
							bind:value={briefPreferencesForm.timezone}
							on:change={(e) => (briefPreferencesForm.timezone = e.detail)}
							size="md"
						>
							{#each TIMEZONE_OPTIONS as tz}
								<option value={tz.value}>{tz.label}</option>
							{/each}
						</Select>
					</FormField>

					<div class="md:col-span-2">
						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								bind:checked={briefPreferencesForm.is_active}
								class="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer dark:bg-gray-700 dark:checked:bg-primary-600"
							/>
							<span class="text-sm font-medium text-gray-700 dark:text-gray-300">
								Enable daily briefs
							</span>
						</label>
					</div>
				</div>

				{#if briefPreferencesForm.is_active}
					<div
						class="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4"
					>
						<div class="flex items-center">
							<Clock class="w-5 h-5 text-primary-600 dark:text-primary-400 mr-2" />
							<p class="text-sm text-primary-700 dark:text-primary-300">
								<strong>Preview:</strong> Next brief will be scheduled for {briefPreferencesForm.frequency ===
								'daily'
									? 'daily'
									: DAY_OPTIONS.find(
											(d) => d.value === briefPreferencesForm.day_of_week
										)?.label} at {convertTimeToHHMM(
									briefPreferencesForm.time_of_day
								)}
								({TIMEZONE_OPTIONS.find(
									(tz) => tz.value === briefPreferencesForm.timezone
								)?.label})
							</p>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<div
		slot="footer"
		class="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
	>
		<div class="flex justify-end space-x-2">
			{#if !isEditing}
				<Button on:click={onClose} variant="ghost" size="md">Close</Button>
				<Button on:click={startEditing} variant="primary" size="md">
					<Bell class="w-4 h-4 mr-2" />
					Edit Settings
				</Button>
			{:else}
				<Button on:click={resetBriefPreferences} variant="ghost" size="md">
					<RotateCcw class="w-4 h-4 mr-2" />
					Reset
				</Button>
				<Button on:click={cancelEditing} variant="ghost" size="md">
					<X class="w-4 h-4 mr-2" />
					Cancel
				</Button>
				<Button
					on:click={saveBriefPreferences}
					disabled={briefPreferencesState.isSaving}
					variant="primary"
					size="md"
					loading={briefPreferencesState.isSaving}
				>
					<Save class="w-4 h-4 mr-2" />
					Save
				</Button>
			{/if}
		</div>
	</div>
</Modal>
