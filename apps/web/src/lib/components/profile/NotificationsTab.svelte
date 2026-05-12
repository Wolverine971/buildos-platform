<!-- apps/web/src/lib/components/profile/NotificationsTab.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Bell } from 'lucide-svelte';
	import NotificationPreferences from '$lib/components/settings/NotificationPreferences.svelte';
	import SMSPreferences from '$lib/components/settings/SMSPreferences.svelte';
	import ScheduledSMSList from '$lib/components/profile/ScheduledSMSList.svelte';
	import TabHeader from './_shared/TabHeader.svelte';
	import SettingsCard from './_shared/SettingsCard.svelte';
	import { toastService } from '$lib/stores/toast.store';

	interface Props {
		userId: string;
	}

	let { userId }: Props = $props();

	// Shared SMS preferences — fetched once here and passed down to children.
	// Previously NotificationsTab, NotificationPreferences, and SMSPreferences
	// each fetched this row independently on mount.
	let smsPreferences = $state<any>(null);
	let loadingSmsPreferences = $state(true);
	let userTimezone = $derived(smsPreferences?.timezone || 'UTC');

	onMount(() => {
		loadSmsPreferences();
	});

	async function loadSmsPreferences() {
		try {
			loadingSmsPreferences = true;
			const response = await fetch('/api/sms/preferences');
			const result = await response.json();

			if (!result?.success) {
				throw new Error(result?.error?.[0] || 'Failed to load preferences');
			}

			smsPreferences = result.data?.preferences ?? null;
		} catch (error) {
			console.error('Error loading SMS preferences:', error);
			toastService.error('Failed to load notification preferences');
		} finally {
			loadingSmsPreferences = false;
		}
	}
</script>

<div class="space-y-4 sm:space-y-5">
	<TabHeader
		icon={Bell}
		title="Notifications"
		description="Manage how you receive notifications across email, SMS, push, and in-app."
	/>

	<!-- Notification Preferences Component -->
	<NotificationPreferences
		{userId}
		{smsPreferences}
		smsPreferencesLoading={loadingSmsPreferences}
		onSmsPreferencesRefresh={loadSmsPreferences}
	/>

	<!-- SMS Preferences Component (includes all SMS notification settings) -->
	<SMSPreferences
		{userId}
		{smsPreferences}
		smsPreferencesLoading={loadingSmsPreferences}
		onSmsPreferencesRefresh={loadSmsPreferences}
	/>

	<!-- Scheduled Messages List -->
	{#if !loadingSmsPreferences && smsPreferences?.event_reminders_enabled}
		<SettingsCard
			title="Scheduled SMS"
			description="Upcoming and recent SMS jobs."
			labelledById="scheduled-sms-heading"
		>
			<ScheduledSMSList timezone={userTimezone} />
		</SettingsCard>
	{/if}
</div>
