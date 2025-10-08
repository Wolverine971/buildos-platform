<!-- apps/web/src/lib/components/profile/NotificationsTab.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Bell, MessageSquare, Clock } from 'lucide-svelte';
	import NotificationPreferences from '$lib/components/settings/NotificationPreferences.svelte';
	import ScheduledSMSList from '$lib/components/profile/ScheduledSMSList.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		userId: string;
	}

	let { userId }: Props = $props();

	// SMS Preferences State
	let smsPreferences = $state<any>(null);
	let loadingPreferences = $state(true);
	let savingPreferences = $state(false);
	let eventRemindersEnabled = $state(false);
	let leadTimeMinutes = $state(15);
	let userTimezone = $state('UTC');

	const leadTimeOptions = [
		{ value: 5, label: '5 minutes before' },
		{ value: 10, label: '10 minutes before' },
		{ value: 15, label: '15 minutes before' },
		{ value: 30, label: '30 minutes before' },
		{ value: 60, label: '1 hour before' }
	];

	onMount(() => {
		loadSMSPreferences();
	});

	async function loadSMSPreferences() {
		try {
			loadingPreferences = true;
			const response = await fetch('/api/sms/preferences');
			if (!response.ok) throw new Error('Failed to load preferences');

			const result = await response.json();
			smsPreferences = result.preferences;

			// Set state from preferences
			eventRemindersEnabled = smsPreferences?.event_reminders_enabled || false;
			leadTimeMinutes = smsPreferences?.event_reminder_lead_time_minutes || 15;
			userTimezone = smsPreferences?.timezone || 'UTC';
		} catch (error) {
			console.error('Error loading SMS preferences:', error);
		} finally {
			loadingPreferences = false;
		}
	}

	async function saveSMSPreferences() {
		try {
			savingPreferences = true;

			const response = await fetch('/api/sms/preferences', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					event_reminders_enabled: eventRemindersEnabled,
					event_reminder_lead_time_minutes: leadTimeMinutes
				})
			});

			if (!response.ok) throw new Error('Failed to save preferences');

			const result = await response.json();
			smsPreferences = result.preferences;
		} catch (error) {
			console.error('Error saving SMS preferences:', error);
			alert('Failed to save preferences');
		} finally {
			savingPreferences = false;
		}
	}
</script>

<div class="space-y-4 sm:space-y-6">
	<!-- Header -->
	<div class="flex items-start gap-3 sm:gap-4">
		<div
			class="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700 shadow-lg flex-shrink-0"
		>
			<Bell class="w-5 h-5 sm:w-6 sm:h-6 text-white" />
		</div>
		<div class="flex-1 min-w-0">
			<h2 class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				Notification Settings
			</h2>
			<p class="text-xs sm:text-base text-gray-600 dark:text-gray-400 mt-1">
				Manage how you receive notifications
			</p>
		</div>
	</div>

	<!-- Notification Preferences Component -->
	<NotificationPreferences {userId} />

	<!-- SMS Event Reminders Section -->
	<div
		class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 sm:p-6"
	>
		<div class="flex items-start gap-3 mb-4">
			<div
				class="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex-shrink-0"
			>
				<MessageSquare class="w-5 h-5 text-blue-600 dark:text-blue-400" />
			</div>
			<div class="flex-1">
				<h3 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
					SMS Event Reminders
				</h3>
				<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
					Get SMS reminders before your calendar events
				</p>
			</div>
		</div>

		{#if !loadingPreferences}
			<div class="space-y-4">
				<!-- Enable/Disable Toggle -->
				<div
					class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
				>
					<div class="flex-1">
						<label
							for="event-reminders-toggle"
							class="text-sm font-medium text-gray-900 dark:text-white"
						>
							Event Reminders
						</label>
						<p class="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
							Receive SMS notifications before events
						</p>
					</div>
					<button
						id="event-reminders-toggle"
						type="button"
						role="switch"
						aria-checked={eventRemindersEnabled}
						onclick={() => {
							eventRemindersEnabled = !eventRemindersEnabled;
							saveSMSPreferences();
						}}
						class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 {eventRemindersEnabled
							? 'bg-blue-600'
							: 'bg-gray-300 dark:bg-gray-700'}"
					>
						<span
							class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {eventRemindersEnabled
								? 'translate-x-5'
								: 'translate-x-0'}"
						/>
					</button>
				</div>

				<!-- Lead Time Selection -->
				{#if eventRemindersEnabled}
					<div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
						<label
							for="lead-time"
							class="block text-sm font-medium text-gray-900 dark:text-white mb-2"
						>
							<Clock class="w-4 h-4 inline mr-1.5" />
							Send reminder
						</label>
						<select
							id="lead-time"
							bind:value={leadTimeMinutes}
							onchange={saveSMSPreferences}
							disabled={savingPreferences}
							class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
						>
							{#each leadTimeOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
						<p class="text-xs text-gray-500 dark:text-gray-500 mt-2">
							You'll receive SMS notifications {leadTimeMinutes} minutes before each event
						</p>
					</div>
				{/if}

				<!-- Phone Verification Notice -->
				{#if !smsPreferences?.phone_verified}
					<div
						class="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3"
					>
						<p class="text-sm text-yellow-800 dark:text-yellow-200">
							⚠️ Please verify your phone number in Settings to receive SMS reminders
						</p>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Scheduled Messages List -->
	{#if eventRemindersEnabled}
		<div
			class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 sm:p-6"
		>
			<ScheduledSMSList timezone={userTimezone} />
		</div>
	{/if}
</div>
