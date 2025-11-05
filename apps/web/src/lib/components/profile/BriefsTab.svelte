<!-- apps/web/src/lib/components/profile/BriefsTab.svelte -->
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { briefPreferencesStore } from '$lib/stores/briefPreferences';
	import { notificationPreferencesStore } from '$lib/stores/notificationPreferences';
	import type { BriefPreferences } from '$lib/stores/briefPreferences';
	import {
		Bell,
		Calendar,
		Clock,
		Edit3,
		Save,
		X,
		RotateCcw,
		ExternalLink,
		XCircle,
		RefreshCw,
		AlertCircle,
		Mail
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';

	// Props
	export let saveSuccess = false;

	// Create event dispatcher for parent communication
	const dispatch = createEventDispatcher();

	// State
	let editingBriefPreferences = false;
	let briefPreferences: BriefPreferences | null = null;
	let briefPreferencesForm: BriefPreferences = {
		frequency: 'daily',
		day_of_week: 1,
		time_of_day: '09:00:00',
		is_active: true
	};
	let refreshingJobs = false;

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

	// Store subscriptions
	$: briefPreferencesState = $briefPreferencesStore;
	$: notificationPreferencesState = $notificationPreferencesStore;
	$: if (briefPreferencesState.preferences) {
		briefPreferences = briefPreferencesState.preferences;
	}
	$: hasEmailOptIn = notificationPreferencesState.preferences?.should_email_daily_brief || false;

	// Handle store errors
	$: if (briefPreferencesState.error) {
		dispatch('error', { message: briefPreferencesState.error });
		briefPreferencesStore.clearError();
	}

	// Reactive update for time input
	$: if (briefPreferencesForm?.time_of_day) {
		timeInputValue = convertTimeToHHMM(briefPreferencesForm.time_of_day);
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
				dispatch('error', { message: 'Failed to load brief preferences' });
			}
		}
	}

	// Refresh brief jobs
	async function refreshBriefJobs() {
		if (refreshingJobs) return;

		refreshingJobs = true;
		try {
			await briefPreferencesStore.refreshJobs();
		} catch (error) {
			dispatch('error', { message: 'Failed to refresh brief jobs' });
		} finally {
			refreshingJobs = false;
		}
	}

	// Initialize on component load
	onMount(() => {
		loadBriefPreferences();
		// Also load notification preferences to show email opt-in status
		if (!notificationPreferencesState?.preferences) {
			notificationPreferencesStore.load();
		}
	});

	// Brief preferences functions
	function startEditingBriefPreferences() {
		editingBriefPreferences = true;
		briefPreferencesForm = briefPreferences
			? { ...briefPreferences }
			: briefPreferencesStore.getDefaults();

		// Set the time input value from the form
		timeInputValue = convertTimeToHHMM(briefPreferencesForm.time_of_day);
	}

	function cancelEditingBriefPreferences() {
		editingBriefPreferences = false;
		briefPreferencesForm = briefPreferences
			? { ...briefPreferences }
			: briefPreferencesStore.getDefaults();

		// Reset the time input value
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
			editingBriefPreferences = false;
			dispatch('success', { message: 'Brief preferences saved successfully' });
		} catch (error) {
			dispatch('error', {
				message: `Failed to save brief preferences: ${error instanceof Error ? error.message : 'Unknown error'}`
			});
		}
	}

	async function resetBriefPreferences() {
		if (confirm('Are you sure you want to reset to default preferences?')) {
			try {
				await briefPreferencesStore.resetToDefaults();
				editingBriefPreferences = false;
				dispatch('success', { message: 'Brief preferences reset to defaults' });
			} catch (error) {
				dispatch('error', {
					message: `Failed to reset preferences: ${error instanceof Error ? error.message : 'Unknown error'}`
				});
			}
		}
	}

	async function cancelBriefJob(job: any) {
		if (confirm('Are you sure you want to cancel this scheduled brief?')) {
			try {
				const briefDate = job.scheduled_for.split('T')[0];
				await briefPreferencesStore.cancelJob(briefDate);
				dispatch('success', { message: 'Brief job cancelled successfully' });
			} catch (error) {
				dispatch('error', {
					message: `Failed to cancel brief job: ${error instanceof Error ? error.message : 'Unknown error'}`
				});
			}
		}
	}

	function formatJobStatus(status: string) {
		const statusMap = {
			pending: { text: 'Pending', color: 'text-yellow-600 bg-yellow-100' },
			generating: { text: 'Generating', color: 'text-blue-600 bg-blue-100' },
			completed: { text: 'Completed', color: 'text-green-600 bg-green-100' },
			failed: { text: 'Failed', color: 'text-red-600 bg-red-100' },
			cancelled: { text: 'Cancelled', color: 'text-gray-600 bg-gray-100' }
		};
		return statusMap[status] || { text: status, color: 'text-gray-600 bg-gray-100' };
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

	function getUpcomingJobs() {
		const now = new Date();
		return briefPreferencesState.jobs.filter((job) => new Date(job.scheduled_for) > now);
	}

	function getRecentJobs() {
		const now = new Date();
		return briefPreferencesState.jobs
			.filter((job) => new Date(job.scheduled_for) <= now)
			.slice(0, 2);
	}
</script>

<div class="space-y-4 sm:space-y-6">
	<!-- Brief Preferences -->
	<div
		class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
	>
		<div class="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
			<div
				class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0"
			>
				<div class="flex-1">
					<h3
						class="text-base sm:text-lg font-medium text-gray-900 dark:text-white flex items-center"
					>
						<Bell class="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-blue-600 dark:text-blue-400" />
						Brief Preferences
					</h3>
					<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
						Configure when you receive briefs
					</p>
				</div>
				<div class="flex items-center gap-2 flex-wrap">
					{#if !editingBriefPreferences}
						<Button
							onclick={() => startEditingBriefPreferences()}
							variant="primary"
							size="sm"
							class="flex-1 sm:flex-initial"
						>
							<Edit3 class="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
							Edit
						</Button>
					{:else}
						<Button
							onclick={() => resetBriefPreferences()}
							variant="ghost"
							size="sm"
							class="text-xs sm:text-sm"
						>
							<RotateCcw class="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
							<span class="hidden sm:inline">Reset</span>
						</Button>
						<Button
							onclick={() => cancelEditingBriefPreferences()}
							variant="ghost"
							size="sm"
							class="text-xs sm:text-sm"
						>
							<X class="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
							<span class="hidden sm:inline">Cancel</span>
						</Button>
						<Button
							onclick={() => saveBriefPreferences()}
							disabled={briefPreferencesState.isSaving}
							variant="primary"
							size="sm"
							loading={briefPreferencesState.isSaving}
							class="text-xs sm:text-sm"
						>
							<Save class="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
							Save
						</Button>
					{/if}
				</div>
			</div>
		</div>

		<div class="p-4 sm:p-6">
			{#if briefPreferencesState.isLoading}
				<div class="text-center py-8">
					<div
						class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"
					></div>
					<p class="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-4">
						Loading preferences...
					</p>
				</div>
			{:else if briefPreferencesState.error}
				<div class="text-center py-8">
					<AlertCircle class="w-12 h-12 text-red-400 mx-auto mb-4" />
					<p class="text-sm sm:text-base text-gray-500 dark:text-gray-400 mb-4">
						Failed to load brief preferences
					</p>
					<Button onclick={loadBriefPreferences} variant="primary" size="sm">
						<RefreshCw class="w-4 h-4 mr-2" />
						Retry
					</Button>
				</div>
			{:else if !editingBriefPreferences && briefPreferences}
				<!-- Display Mode -->
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
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
							<p
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
							>
								Day of Week
							</p>
							<div class="px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
								{DAY_OPTIONS.find((d) => d.value === briefPreferences?.day_of_week)
									?.label || 'Monday'}
							</div>
						</div>
					{/if}

					<div>
						<label
							class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
						>
							Time
						</label>
						<div class="px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
							{convertTimeToHHMM(briefPreferences?.time_of_day)}
						</div>
					</div>

					<div class="sm:col-span-2">
						<label
							class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
						>
							Status
						</label>
						<div class="space-y-2">
							<div class="flex flex-col sm:flex-row sm:items-center gap-2">
								<div
									class={`px-3 py-1 rounded-full text-xs sm:text-sm font-medium w-fit ${briefPreferences.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}
								>
									{briefPreferences.is_active ? 'Active' : 'Inactive'}
								</div>
								{#if briefPreferencesState.nextScheduledBrief}
									<span
										class="text-xs sm:text-sm text-gray-500 dark:text-gray-400"
									>
										Next: {formatDateTime(
											briefPreferencesState.nextScheduledBrief.toISOString()
										)}
									</span>
								{/if}
							</div>
							{#if briefPreferences.is_active && hasEmailOptIn}
								<div class="flex items-center space-x-2">
									<Mail class="w-4 h-4 text-blue-600 dark:text-blue-400" />
									<span class="text-sm text-gray-600 dark:text-gray-400">
										Email delivery enabled
									</span>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{:else if editingBriefPreferences}
				<!-- Edit Mode -->
				<div class="space-y-4 sm:space-y-6">
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
						<FormField label="Frequency" labelFor="brief-frequency">
							<Select
								id="brief-frequency"
								bind:value={briefPreferencesForm.frequency}
								onchange={(e) => (briefPreferencesForm.frequency = e.detail)}
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
									onchange={(e) => (briefPreferencesForm.day_of_week = e.detail)}
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

						<div class="sm:col-span-2 space-y-3">
							<label class="flex items-start sm:items-center gap-2">
								<input
									type="checkbox"
									bind:checked={briefPreferencesForm.is_active}
									class="h-4 w-4 mt-0.5 sm:mt-0 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer dark:bg-gray-700 dark:checked:bg-blue-600 flex-shrink-0"
								/>
								<span class="text-sm font-medium text-gray-700 dark:text-gray-300">
									Enable daily brief generation
								</span>
							</label>

							{#if briefPreferencesForm.is_active}
								<div
									class="ml-6 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
								>
									<p class="text-xs text-gray-600 dark:text-gray-400">
										<strong>Note:</strong> To receive briefs via email or SMS,
										visit the
										<a
											href="/settings?tab=notifications"
											class="text-blue-600 dark:text-blue-400 hover:underline"
											>Notifications</a
										> tab.
									</p>
								</div>
							{/if}
						</div>
					</div>

					{#if briefPreferencesForm.is_active}
						<div
							class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4"
						>
							<div class="flex items-center">
								<Clock class="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2" />
								<p class="text-sm text-blue-700 dark:text-blue-300">
									<strong>Preview:</strong> Next brief will be scheduled for {briefPreferencesForm.frequency ===
									'daily'
										? 'daily'
										: DAY_OPTIONS.find(
												(d) => d.value === briefPreferencesForm.day_of_week
											)?.label} at {convertTimeToHHMM(
										briefPreferencesForm.time_of_day
									)} (in your timezone)
								</p>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Scheduled Briefs -->
	<div
		class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
	>
		<div class="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
			<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
				<div class="flex-1">
					<h3
						class="text-base sm:text-lg font-medium text-gray-900 dark:text-white flex items-center"
					>
						<Calendar
							class="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-green-600 dark:text-green-400"
						/>
						Scheduled Briefs
					</h3>
					<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
						Upcoming and recent jobs
					</p>
				</div>
				<div class="flex items-center gap-2">
					<Button
						onclick={refreshBriefJobs}
						disabled={refreshingJobs}
						variant="ghost"
						size="sm"
						title="Refresh brief jobs"
					>
						<RefreshCw class={`w-4 h-4 ${refreshingJobs ? 'animate-spin' : ''}`} />
					</Button>
					<a
						href="/projects?tab=briefs"
						class="inline-flex items-center px-3 sm:px-4 py-2 text-xs sm:text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
					>
						<span class="hidden sm:inline">View All Briefs</span>
						<span class="sm:hidden">View All</span>
						<ExternalLink class="w-3 h-3 sm:w-4 sm:h-4 ml-1 sm:ml-2" />
					</a>
				</div>
			</div>
		</div>

		<div class="p-4 sm:p-6">
			{#if briefPreferencesState.isLoading}
				<div class="text-center py-8">
					<div
						class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"
					></div>
					<p class="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-4">
						Loading scheduled briefs...
					</p>
				</div>
			{:else if briefPreferencesState.jobs.length === 0}
				<div class="text-center py-8">
					<Calendar class="w-12 h-12 text-gray-400 mx-auto mb-4" />
					<p class="text-sm sm:text-base text-gray-500 dark:text-gray-400 mb-4">
						No scheduled briefs found
					</p>
					<p class="text-xs sm:text-sm text-gray-400 dark:text-gray-500">
						Enable brief preferences above to start scheduling
					</p>
				</div>
			{:else}
				<div class="space-y-3 sm:space-y-4">
					<!-- Upcoming Briefs -->
					{#each getUpcomingJobs() as job}
						<div
							class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
							transition:slide
						>
							<div class="flex items-center gap-2 sm:gap-3 min-w-0">
								<div class="flex-shrink-0">
									<Clock
										class="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400"
									/>
								</div>
								<div class="min-w-0">
									<p
										class="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate"
									>
										{formatDateTime(job.scheduled_for)}
									</p>
									<p class="text-xs text-gray-500 dark:text-gray-400">
										{job.job_type || 'Daily Brief'}
									</p>
								</div>
							</div>
							<div class="flex items-center gap-2 ml-6 sm:ml-0">
								<span
									class={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${formatJobStatus(job.status).color}`}
								>
									{formatJobStatus(job.status).text}
								</span>
								{#if job.status === 'pending'}
									<Button
										onclick={() => cancelBriefJob(job)}
										variant="ghost"
										size="sm"
										class="p-1 text-red-400 hover:text-red-600 dark:hover:text-red-300 rounded"
										title="Cancel job"
									>
										<XCircle class="w-4 h-4" />
									</Button>
								{/if}
							</div>
						</div>
					{/each}

					<!-- Recent Briefs -->
					{#each getRecentJobs() as job}
						<div
							class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
							transition:slide
						>
							<div class="flex items-center gap-2 sm:gap-3 min-w-0">
								<div class="flex-shrink-0">
									<Calendar class="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
								</div>
								<div class="min-w-0">
									<p
										class="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate"
									>
										{formatDateTime(job.scheduled_for)}
									</p>
									<p class="text-xs text-gray-500 dark:text-gray-400">
										{job.job_type || 'Daily Brief'}
									</p>
								</div>
							</div>
							<div class="flex items-center gap-2 ml-6 sm:ml-0">
								<span
									class={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${formatJobStatus(job.status).color}`}
								>
									{formatJobStatus(job.status).text}
								</span>
								{#if job.error_message}
									<span
										class="text-xs text-red-500 dark:text-red-400 truncate"
										title={job.error_message}
									>
										Error
									</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
