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
			class="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-accent shadow-ink flex-shrink-0"
		>
			<Bell class="w-5 h-5 sm:w-6 sm:h-6 text-accent-foreground" />
		</div>
		<div class="flex-1 min-w-0">
			<h2 class="text-lg sm:text-2xl font-bold text-foreground">Notification Settings</h2>
			<p class="text-xs sm:text-base text-muted-foreground mt-1">
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
			class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak p-4 sm:p-6"
		>
			<ScheduledSMSList timezone={userTimezone} />
		</div>
	{/if}
</div>
