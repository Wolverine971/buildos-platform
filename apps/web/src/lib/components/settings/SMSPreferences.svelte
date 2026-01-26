<!-- apps/web/src/lib/components/settings/SMSPreferences.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { smsService } from '$lib/services/sms.service';
	import { toastService } from '$lib/stores/toast.store';
	import PhoneVerification from './PhoneVerification.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import {
		Phone,
		Check,
		Bell,
		MessageSquare,
		AlertTriangle,
		Moon,
		Sun,
		Loader,
		XCircle
	} from 'lucide-svelte';

	interface Props {
		userId: string;
	}

	let { userId }: Props = $props();

	let preferences = $state<any>(null);
	let isLoading = $state(true);
	let isSaving = $state(false);

	// Preference settings
	let eventRemindersEnabled = $state(false);
	let eventReminderLeadTime = $state(15);
	let morningKickoffEnabled = $state(false);
	let morningKickoffTime = $state('08:00');
	let eveningRecapEnabled = $state(false);
	let urgentAlerts = $state(true);
	let quietHoursStart = $state('22:00');
	let quietHoursEnd = $state('08:00');
	let timezone = $state(Intl.DateTimeFormat().resolvedOptions().timeZone);

	onMount(async () => {
		await loadPreferences();
	});

	async function loadPreferences() {
		isLoading = true;
		const result = await smsService.getSMSPreferences(userId);

		if (result.success && result.data?.preferences) {
			preferences = result.data.preferences;

			// Update state with loaded preferences
			eventRemindersEnabled = preferences.event_reminders_enabled || false;
			eventReminderLeadTime = preferences.event_reminder_lead_time_minutes || 15;
			morningKickoffEnabled = preferences.morning_kickoff_enabled || false;
			morningKickoffTime = preferences.morning_kickoff_time || '08:00';
			eveningRecapEnabled = preferences.evening_recap_enabled || false;
			urgentAlerts = preferences.urgent_alerts !== false; // Default to true
			quietHoursStart = preferences.quiet_hours_start || '22:00';
			quietHoursEnd = preferences.quiet_hours_end || '08:00';
			timezone = preferences.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
		}

		isLoading = false;
	}

	async function savePreferences() {
		isSaving = true;

		const result = await smsService.updateSMSPreferences(userId, {
			event_reminders_enabled: eventRemindersEnabled,
			event_reminder_lead_time_minutes: eventReminderLeadTime,
			morning_kickoff_enabled: morningKickoffEnabled,
			morning_kickoff_time: morningKickoffTime,
			evening_recap_enabled: eveningRecapEnabled,
			urgent_alerts: urgentAlerts,
			quiet_hours_start: quietHoursStart,
			quiet_hours_end: quietHoursEnd
			// Note: timezone removed - managed through user settings (ADR-002-timezone-centralization)
		});

		if (result.success) {
			toastService.success('SMS preferences saved successfully');
			await loadPreferences(); // Reload to get latest data
		} else {
			toastService.error(result.errors?.[0] || 'Failed to save preferences');
		}

		isSaving = false;
	}

	async function handleOptOut() {
		if (
			!confirm(
				'Are you sure you want to opt out of all SMS notifications? You can re-enable them at any time.'
			)
		) {
			return;
		}

		const result = await smsService.optOut(userId);

		if (result.success) {
			toastService.info('You have been opted out of SMS notifications');
			await loadPreferences();
		} else {
			toastService.error('Failed to opt out');
		}
	}

	let isPhoneVerified = $derived(preferences?.phone_verified === true);
	let phoneNumber = $derived(preferences?.phone_number || '');
	let isOptedOut = $derived(preferences?.opted_out === true);
</script>

<div class="space-y-6">
	{#if isLoading}
		<div class="flex flex-col items-center justify-center py-8 gap-2">
			<Loader class="animate-spin h-6 w-6 text-accent" />
			<p class="text-sm text-muted-foreground">Loading SMS preferences...</p>
		</div>
	{:else}
		<!-- Phone Verification Section -->
		<div class="bg-card rounded-lg border border-border shadow-ink tx tx-frame tx-weak">
			<div class="px-4 py-3 border-b border-border">
				<div class="flex items-center gap-3">
					<Phone class="w-5 h-5 text-blue-500" />
					<div>
						<h3 class="text-base font-semibold text-foreground">Phone Number</h3>
						<p class="text-sm text-muted-foreground">
							Verify your phone number to receive SMS notifications
						</p>
					</div>
				</div>
			</div>
			<div class="p-4">
				{#if !isPhoneVerified}
					<PhoneVerification />
				{:else}
					<div class="space-y-3">
						<div
							class="flex items-center justify-between rounded-lg p-3 bg-emerald-500/10 border border-emerald-500/30"
						>
							<div class="flex items-center gap-3">
								<Phone class="w-5 h-5 text-emerald-600" />
								<div>
									<p class="font-medium text-foreground">Verified Phone</p>
									<p class="text-sm text-muted-foreground">
										{phoneNumber}
									</p>
								</div>
							</div>
							<div class="flex items-center gap-2 text-emerald-600">
								<Check class="w-5 h-5" />
								<span class="font-medium">Verified</span>
							</div>
						</div>

						{#if isOptedOut}
							<div
								class="flex items-start gap-3 p-3 bg-amber-500/10 rounded-lg border border-amber-500/30"
							>
								<AlertTriangle
									class="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"
								/>
								<p class="text-sm text-foreground">
									You have opted out of SMS notifications. Re-enable notifications
									below to start receiving them again.
								</p>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- Notification Settings -->
		{#if isPhoneVerified}
			<div class="bg-card rounded-lg border border-border shadow-ink tx tx-frame tx-weak">
				<div class="px-4 py-3 border-b border-border">
					<div class="flex items-center gap-3">
						<Bell class="w-5 h-5 text-purple-500" />
						<div>
							<h3 class="text-base font-semibold text-foreground">
								SMS Notifications
							</h3>
							<p class="text-sm text-muted-foreground">
								Choose which notifications you want to receive via SMS
							</p>
						</div>
					</div>
				</div>
				<div class="p-4 space-y-4">
					<!-- Event Reminders -->
					<div class="space-y-2">
						<div
							class="flex items-start justify-between p-3 rounded-lg hover:bg-muted transition-colors"
						>
							<div class="flex items-start gap-3">
								<Bell class="w-5 h-5 text-blue-500 mt-0.5" />
								<div>
									<label
										for="event-reminders"
										class="font-medium text-foreground cursor-pointer"
									>
										Event Reminders
									</label>
									<p class="text-sm text-muted-foreground mt-0.5">
										Get SMS reminders before your calendar events
									</p>
								</div>
							</div>
							<label class="relative inline-flex items-center cursor-pointer">
								<input
									type="checkbox"
									id="event-reminders"
									class="sr-only peer"
									bind:checked={eventRemindersEnabled}
									disabled={isOptedOut}
								/>
								<div
									class="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"
								></div>
							</label>
						</div>
						{#if eventRemindersEnabled}
							<div class="ml-8 mr-4">
								<FormField label="Reminder Lead Time" labelFor="event-lead-time">
									<select
										id="event-lead-time"
										bind:value={eventReminderLeadTime}
										disabled={isOptedOut}
										class="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-accent disabled:opacity-50 shadow-ink-inner"
									>
										<option value={5}>5 minutes before</option>
										<option value={10}>10 minutes before</option>
										<option value={15}>15 minutes before</option>
										<option value={30}>30 minutes before</option>
										<option value={60}>1 hour before</option>
									</select>
								</FormField>
							</div>
						{/if}
					</div>

					<!-- Morning Kickoff -->
					<div class="space-y-2">
						<div
							class="flex items-start justify-between p-3 rounded-lg hover:bg-muted transition-colors"
						>
							<div class="flex items-start gap-3">
								<Sun class="w-5 h-5 text-amber-500 mt-0.5" />
								<div>
									<label
										for="morning-kickoff"
										class="font-medium text-foreground cursor-pointer"
									>
										Morning Kickoff
									</label>
									<p class="text-sm text-muted-foreground mt-0.5">
										Get a morning SMS about what you have going on for the day
									</p>
								</div>
							</div>
							<label class="relative inline-flex items-center cursor-pointer">
								<input
									type="checkbox"
									id="morning-kickoff"
									class="sr-only peer"
									bind:checked={morningKickoffEnabled}
									disabled={isOptedOut}
								/>
								<div
									class="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"
								></div>
							</label>
						</div>
						{#if morningKickoffEnabled}
							<div class="ml-8 mr-4">
								<FormField label="Send Time" labelFor="morning-time">
									<TextInput
										id="morning-time"
										type="time"
										inputmode="numeric"
										enterkeyhint="done"
										bind:value={morningKickoffTime}
										disabled={isOptedOut}
									/>
								</FormField>
							</div>
						{/if}
					</div>

					<!-- Evening Recap -->
					<div
						class="flex items-start justify-between p-3 rounded-lg hover:bg-muted transition-colors"
					>
						<div class="flex items-start gap-3">
							<Moon class="w-5 h-5 text-indigo-500 mt-0.5" />
							<div>
								<label
									for="evening-recap"
									class="font-medium text-foreground cursor-pointer"
								>
									Evening Recap
								</label>
								<p class="text-sm text-muted-foreground mt-0.5">
									Get an evening SMS recapping what happened during the day
								</p>
							</div>
						</div>
						<label class="relative inline-flex items-center cursor-pointer">
							<input
								type="checkbox"
								id="evening-recap"
								class="sr-only peer"
								bind:checked={eveningRecapEnabled}
								disabled={isOptedOut}
							/>
							<div
								class="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"
							></div>
						</label>
					</div>

					<!-- Urgent Alerts -->
					<div
						class="flex items-start justify-between p-3 rounded-lg hover:bg-muted transition-colors"
					>
						<div class="flex items-start gap-3">
							<AlertTriangle class="w-5 h-5 text-red-500 mt-0.5" />
							<div>
								<label
									for="urgent-alerts"
									class="font-medium text-foreground cursor-pointer"
								>
									Urgent Alerts
								</label>
								<p class="text-sm text-muted-foreground mt-0.5">
									Receive critical notifications even during quiet hours
								</p>
							</div>
						</div>
						<label class="relative inline-flex items-center cursor-pointer">
							<input
								type="checkbox"
								id="urgent-alerts"
								class="sr-only peer"
								bind:checked={urgentAlerts}
								disabled={isOptedOut}
							/>
							<div
								class="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"
							></div>
						</label>
					</div>

					<!-- Quiet Hours -->
					<div class="border-t border-border pt-4">
						<div class="flex items-start gap-3 mb-3">
							<Moon class="w-5 h-5 text-indigo-500 mt-0.5" />
							<div>
								<h4 class="font-medium text-foreground">Quiet Hours</h4>
								<p class="text-sm text-muted-foreground mt-0.5">
									Set times when you don't want to receive non-urgent
									notifications
								</p>
							</div>
						</div>
						<div class="grid grid-cols-2 gap-3 ml-8">
							<FormField label="Start Time" labelFor="quiet-start">
								<TextInput
									id="quiet-start"
									type="time"
									inputmode="numeric"
									enterkeyhint="next"
									bind:value={quietHoursStart}
									disabled={isOptedOut}
								/>
							</FormField>
							<FormField label="End Time" labelFor="quiet-end">
								<TextInput
									id="quiet-end"
									type="time"
									inputmode="numeric"
									enterkeyhint="done"
									bind:value={quietHoursEnd}
									disabled={isOptedOut}
								/>
							</FormField>
						</div>
					</div>

					<!-- Save Button -->
					<div class="flex justify-between items-center pt-4 border-t border-border">
						<Button
							onclick={savePreferences}
							disabled={isSaving || isOptedOut}
							variant="primary"
							loading={isSaving}
							icon={isSaving ? Loader : Check}
							class="shadow-ink pressable"
						>
							{isSaving ? 'Saving...' : 'Save Preferences'}
						</Button>

						{#if !isOptedOut}
							<Button
								onclick={handleOptOut}
								variant="outline"
								icon={XCircle}
								class="border-red-500/30 text-red-600 hover:bg-red-500/10 hover:text-red-700 hover:border-red-500/50 pressable"
							>
								Opt Out of SMS
							</Button>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>
