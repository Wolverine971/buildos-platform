<!-- apps/web/src/lib/components/briefs/BriefsSettingsModal.svelte -->
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import PhoneVerificationModal from '$lib/components/settings/PhoneVerificationModal.svelte';
	import { briefPreferencesStore } from '$lib/stores/briefPreferences';
	import { notificationPreferencesStore } from '$lib/stores/notificationPreferences';
	import type { BriefPreferences } from '$lib/stores/briefPreferences';
	import { smsService } from '$lib/services/sms.service';
	import {
		Bell,
		Save,
		X,
		RotateCcw,
		Clock,
		AlertCircle,
		RefreshCw,
		Mail,
		MessageSquare
	} from 'lucide-svelte';
	import { toastService } from '$lib/stores/toast.store';

	// Props
	export let isOpen = false;
	export let user;
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

	// Notification preferences state
	let dailyBriefEmailEnabled = false;
	let dailyBriefSmsEnabled = false;
	let phoneVerified = false;
	let phoneNumber: string | null = null;
	let showPhoneVerificationModal = false;

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
	onMount(async () => {
		await Promise.all([
			loadBriefPreferences(),
			loadNotificationPreferences(),
			checkPhoneVerification()
		]);
	});

	// Load notification preferences
	async function loadNotificationPreferences() {
		try {
			await notificationPreferencesStore.load();
			const state = $notificationPreferencesStore;
			if (state.preferences) {
				dailyBriefEmailEnabled = state.preferences.should_email_daily_brief;
				dailyBriefSmsEnabled = state.preferences.should_sms_daily_brief;
			}
		} catch (error) {
			console.error('Failed to load notification preferences:', error);
		}
	}

	// Check phone verification status
	async function checkPhoneVerification() {
		try {
			const smsPrefs = await smsService.getSMSPreferences(user.id);
			if (smsPrefs.success && smsPrefs.data?.preferences) {
				phoneVerified = smsPrefs.data.preferences.phone_verified || false;
				phoneNumber = smsPrefs.data.preferences.phone_number || null;
			}
		} catch (error) {
			console.error('Failed to check phone verification:', error);
		}
	}

	// Brief preferences functions
	async function startEditing() {
		isEditing = true;
		briefPreferencesForm = briefPreferences
			? { ...briefPreferences }
			: briefPreferencesStore.getDefaults();
		timeInputValue = convertTimeToHHMM(briefPreferencesForm.time_of_day);

		// Reload notification preferences to ensure we have latest
		await loadNotificationPreferences();
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

			// Save both brief and notification preferences
			await Promise.all([
				briefPreferencesStore.save(formToSave),
				notificationPreferencesStore.save({
					should_email_daily_brief: dailyBriefEmailEnabled,
					should_sms_daily_brief: dailyBriefSmsEnabled
				})
			]);

			isEditing = false;
			toastService.success('Settings saved successfully');
			dispatch('save');
		} catch (error) {
			toastService.error(
				`Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	// Handle SMS toggle with phone verification check
	async function handleSmsToggle(enabled: boolean) {
		if (enabled && !phoneVerified) {
			// Show phone verification modal
			showPhoneVerificationModal = true;
			// Keep toggle off until verification completes
			dailyBriefSmsEnabled = false;
			return;
		}

		// If disabling or phone already verified, just update
		dailyBriefSmsEnabled = enabled;
	}

	// Handle phone verification completion
	async function handlePhoneVerified() {
		// Reload phone verification status
		await checkPhoneVerification();
		// Enable SMS now that phone is verified
		dailyBriefSmsEnabled = true;
		toastService.success('Phone verified! SMS notifications enabled.');
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
	<div class="space-y-3 sm:space-y-4 px-4 sm:px-6 py-4">
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
			<div class="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 lg:gap-5">
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
					<div class="space-y-3">
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

						{#if briefPreferences.is_active}
							<!-- Show notification settings -->
							<div
								class="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
							>
								<h4
									class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2"
								>
									Notification Settings
								</h4>
								<div class="flex flex-col gap-1.5">
									<div class="flex items-center gap-2 text-sm">
										<Mail
											class={`w-4 h-4 ${dailyBriefEmailEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}
										/>
										<span class="text-gray-700 dark:text-gray-300">
											Email: {dailyBriefEmailEnabled ? 'Enabled' : 'Disabled'}
										</span>
									</div>
									<div class="flex items-center gap-2 text-sm">
										<MessageSquare
											class={`w-4 h-4 ${dailyBriefSmsEnabled ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400'}`}
										/>
										<span class="text-gray-700 dark:text-gray-300">
											SMS: {dailyBriefSmsEnabled ? 'Enabled' : 'Disabled'}
											{#if dailyBriefSmsEnabled && phoneNumber}
												<span class="text-xs text-gray-500"
													>({phoneNumber})</span
												>
											{/if}
										</span>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{:else}
			<!-- Edit Mode -->
			<div class="space-y-3 sm:space-y-4">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 lg:gap-5">
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

					<div class="md:col-span-2 space-y-4">
						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								bind:checked={briefPreferencesForm.is_active}
								class="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer dark:bg-gray-700 dark:checked:bg-primary-600"
							/>
							<span class="text-sm font-medium text-gray-700 dark:text-gray-300">
								Enable daily brief generation
							</span>
						</label>

						{#if briefPreferencesForm.is_active}
							<!-- Notification Settings Section -->
							<div
								class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3"
							>
								<h4
									class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"
								>
									<Bell class="w-4 h-4" />
									Notification Settings
								</h4>
								<p class="text-xs text-gray-600 dark:text-gray-400">
									Choose how you want to be notified when your brief is ready
								</p>

								<!-- Email Toggle -->
								<label class="flex items-start space-x-3 cursor-pointer group">
									<div class="flex items-center h-5">
										<input
											type="checkbox"
											bind:checked={dailyBriefEmailEnabled}
											class="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer dark:bg-gray-700 dark:checked:bg-blue-600"
										/>
									</div>
									<div class="flex-1">
										<div class="flex items-center gap-2">
											<Mail
												class="w-4 h-4 text-blue-600 dark:text-blue-400"
											/>
											<span
												class="text-sm font-medium text-gray-700 dark:text-gray-300"
											>
												Email Notifications
											</span>
										</div>
										<p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
											Get your daily brief via email
										</p>
									</div>
								</label>

								<!-- SMS Toggle -->
								<label class="flex items-start space-x-3 cursor-pointer group">
									<div class="flex items-center h-5">
										<input
											type="checkbox"
											checked={dailyBriefSmsEnabled}
											onchange={(e) =>
												handleSmsToggle(e.currentTarget.checked)}
											class="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-orange-600 focus:ring-orange-500 cursor-pointer dark:bg-gray-700 dark:checked:bg-orange-600"
										/>
									</div>
									<div class="flex-1">
										<div class="flex items-center gap-2">
											<MessageSquare
												class="w-4 h-4 text-orange-600 dark:text-orange-400"
											/>
											<span
												class="text-sm font-medium text-gray-700 dark:text-gray-300"
											>
												SMS Notifications
											</span>
										</div>
										<p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
											Receive text messages when your brief is ready
										</p>
										{#if !phoneVerified}
											<div
												class="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-1"
											>
												<AlertCircle class="w-3 h-3" />
												<span>Phone verification required</span>
											</div>
										{:else if phoneNumber}
											<div
												class="text-xs text-green-600 dark:text-green-400 mt-1"
											>
												✓ Verified: {phoneNumber}
											</div>
										{/if}
									</div>
								</label>
							</div>
						{/if}
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

<!-- Phone Verification Modal -->
<PhoneVerificationModal
	bind:isOpen={showPhoneVerificationModal}
	onClose={() => (showPhoneVerificationModal = false)}
	onVerified={handlePhoneVerified}
/>
