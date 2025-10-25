<!-- apps/web/src/lib/components/profile/NotificationsTab.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Bell } from 'lucide-svelte';
	import NotificationPreferences from '$lib/components/settings/NotificationPreferences.svelte';
	import SMSPreferences from '$lib/components/settings/SMSPreferences.svelte';
	import ScheduledSMSList from '$lib/components/profile/ScheduledSMSList.svelte';

	interface Props {
		userId: string;
	}

	let { userId }: Props = $props();

	// SMS Preferences State
	let smsPreferences = $state<any>(null);
	let loadingPreferences = $state(true);
	let userTimezone = $state('UTC');

	onMount(() => {
		loadSMSPreferences();
	});

	async function loadSMSPreferences() {
		try {
			loadingPreferences = true;
			const response = await fetch('/api/sms/preferences');
			const result = await response.json();

			if (!result?.success) {
				throw new Error(result?.error?.[0] || 'Failed to load preferences');
			}

			smsPreferences = result.data?.preferences;

			// Set state from preferences
			userTimezone = smsPreferences?.timezone || 'UTC';
		} catch (error) {
			console.error('Error loading SMS preferences:', error);
		} finally {
			loadingPreferences = false;
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

	<!-- SMS Preferences Component (includes all SMS notification settings) -->
	<SMSPreferences {userId} />

	<!-- Scheduled Messages List -->
	{#if !loadingPreferences && smsPreferences?.event_reminders_enabled}
		<div
			class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 sm:p-6"
		>
			<ScheduledSMSList timezone={userTimezone} />
		</div>
	{/if}
</div>
