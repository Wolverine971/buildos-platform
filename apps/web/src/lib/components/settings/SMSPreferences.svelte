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
		Bell,
		AlertTriangle,
		Moon,
		Sun,
		Loader,
		MessageSquare
	} from '$lib/icons/lucide';

	interface Props {
		userId: string;
		// Optional shared SMS preferences from parent. When provided, we skip
		// the initial direct fetch and stay in sync with the parent's row.
		smsPreferences?: any;
		smsPreferencesLoading?: boolean;
		onSmsPreferencesRefresh?: () => void | Promise<void>;
	}

	let {
		userId,
		smsPreferences = undefined,
		smsPreferencesLoading = false,
		onSmsPreferencesRefresh
	}: Props = $props();

	let preferences = $state<any>(null);
	let localPreferencesLoading = $state(true);
	let isSaving = $state(false);
	let isLoading = $derived(
		smsPreferences === undefined
			? localPreferencesLoading
			: Boolean(smsPreferencesLoading) && !smsPreferences
	);

	// Preference settings
	let eventRemindersEnabled = $state(false);
	let eventReminderLeadTime = $state(15);
	let morningKickoffEnabled = $state(false);
	let morningKickoffTime = $state('08:00');
	let eveningRecapEnabled = $state(false);
	let urgentAlerts = $state(true);
	let quietHoursStart = $state('22:00');
	let quietHoursEnd = $state('08:00');

	onMount(async () => {
		if (smsPreferences === undefined) {
			await loadPreferences();
		}
	});

	// When the parent provides smsPreferences as a prop, hydrate our form
	// state from it and stay in sync as it refreshes.
	$effect(() => {
		if (smsPreferences !== undefined) {
			applyPreferences(smsPreferences);
		}
	});

	function applyPreferences(prefs: any) {
		preferences = prefs;
		if (!prefs) return;
		eventRemindersEnabled = prefs.event_reminders_enabled || false;
		eventReminderLeadTime = prefs.event_reminder_lead_time_minutes || 15;
		morningKickoffEnabled = prefs.morning_kickoff_enabled || false;
		morningKickoffTime = prefs.morning_kickoff_time || '08:00';
		eveningRecapEnabled = prefs.evening_recap_enabled || false;
		urgentAlerts = prefs.urgent_alerts !== false; // Default to true
		quietHoursStart = prefs.quiet_hours_start || '22:00';
		quietHoursEnd = prefs.quiet_hours_end || '08:00';
	}

	async function loadPreferences() {
		localPreferencesLoading = true;
		const result = await smsService.getSMSPreferences(userId);
		if (result.success && result.data?.preferences) {
			applyPreferences(result.data.preferences);
		}
		localPreferencesLoading = false;
	}

	async function refreshPreferences() {
		if (onSmsPreferencesRefresh) {
			await onSmsPreferencesRefresh();
		} else {
			await loadPreferences();
		}
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
			await refreshPreferences();
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
			await refreshPreferences();
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
			<Loader class="animate-spin motion-reduce:animate-none h-5 w-5 text-muted-foreground" />
			<p class="text-sm text-muted-foreground">Loading SMS preferences…</p>
		</div>
	{:else}
		<!-- Phone Verification Section -->
		<div class="bg-card rounded-xl border border-border tx tx-frame tx-weak">
			<div class="px-4 py-3 border-b border-border">
				<h3
					class="text-sm sm:text-base font-medium text-foreground flex items-center gap-2"
				>
					<Phone class="w-4 h-4 text-muted-foreground flex-shrink-0" />
					Phone number
				</h3>
				<p class="text-xs text-muted-foreground mt-1">
					Verify your phone number to get SMS notifications
				</p>
			</div>
			<div class="p-4">
				{#if !isPhoneVerified}
					<PhoneVerification onVerified={refreshPreferences} />
				{:else}
					<div class="space-y-3">
						<div
							class="flex items-center justify-between gap-3 rounded-lg p-3 border border-border"
						>
							<div class="min-w-0">
								<p class="font-medium text-foreground font-mono tabular-nums">
									{phoneNumber}
								</p>
							</div>
							<div
								class="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0"
							>
								<span class="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true"
								></span>
								Verified
							</div>
						</div>

						{#if isOptedOut}
							<div
								class="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border border-border"
							>
								<AlertTriangle class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
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
			<div class="bg-card rounded-xl border border-border tx tx-frame tx-weak">
				<div class="px-4 py-3 border-b border-border">
					<h3
						class="text-sm sm:text-base font-medium text-foreground flex items-center gap-2"
					>
						<MessageSquare class="w-4 h-4 text-muted-foreground flex-shrink-0" />
						SMS notifications
					</h3>
					<p class="text-xs text-muted-foreground mt-1">
						Choose which notifications you get by text
					</p>
				</div>
				<div class="p-4 space-y-4">
					<!-- Event Reminders -->
					<div class="space-y-2">
						<div
							class="flex items-start justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
						>
							<div class="flex items-start gap-3">
								<Bell class="w-4 h-4 text-muted-foreground mt-1" />
								<div>
									<label
										for="event-reminders"
										class="font-medium text-foreground cursor-pointer"
									>
										Event reminders
									</label>
									<p class="text-sm text-muted-foreground mt-0.5">
										Get SMS reminders before your calendar events
									</p>
								</div>
							</div>
							<label
								class="relative inline-flex items-center cursor-pointer min-h-[44px]"
							>
								<input
									type="checkbox"
									id="event-reminders"
									class="sr-only peer"
									bind:checked={eventRemindersEnabled}
									disabled={isOptedOut}
								/>
								<div
									class="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"
								></div>
							</label>
						</div>
						{#if eventRemindersEnabled}
							<div class="ml-8 mr-4">
								<FormField
									label="Reminder lead time"
									labelFor="event-lead-time"
									uppercase={false}
									showOptional={false}
								>
									<select
										id="event-lead-time"
										bind:value={eventReminderLeadTime}
										disabled={isOptedOut}
										class="w-full px-3 py-2.5 min-h-[44px] text-sm border border-border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-ring disabled:opacity-50"
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
							class="flex items-start justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
						>
							<div class="flex items-start gap-3">
								<Sun class="w-4 h-4 text-muted-foreground mt-1" />
								<div>
									<label
										for="morning-kickoff"
										class="font-medium text-foreground cursor-pointer"
									>
										Morning kickoff
									</label>
									<p class="text-sm text-muted-foreground mt-0.5">
										Get a morning SMS about what you have going on for the day
									</p>
								</div>
							</div>
							<label
								class="relative inline-flex items-center cursor-pointer min-h-[44px]"
							>
								<input
									type="checkbox"
									id="morning-kickoff"
									class="sr-only peer"
									bind:checked={morningKickoffEnabled}
									disabled={isOptedOut}
								/>
								<div
									class="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"
								></div>
							</label>
						</div>
						{#if morningKickoffEnabled}
							<div class="ml-8 mr-4">
								<FormField
									label="Send time"
									labelFor="morning-time"
									uppercase={false}
									showOptional={false}
								>
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
						class="flex items-start justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
					>
						<div class="flex items-start gap-3">
							<Moon class="w-4 h-4 text-muted-foreground mt-1" />
							<div>
								<label
									for="evening-recap"
									class="font-medium text-foreground cursor-pointer"
								>
									Evening recap
								</label>
								<p class="text-sm text-muted-foreground mt-0.5">
									Get an evening SMS recapping what happened during the day
								</p>
							</div>
						</div>
						<label
							class="relative inline-flex items-center cursor-pointer min-h-[44px]"
						>
							<input
								type="checkbox"
								id="evening-recap"
								class="sr-only peer"
								bind:checked={eveningRecapEnabled}
								disabled={isOptedOut}
							/>
							<div
								class="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"
							></div>
						</label>
					</div>

					<!-- Urgent Alerts -->
					<div
						class="flex items-start justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
					>
						<div class="flex items-start gap-3">
							<AlertTriangle class="w-4 h-4 text-muted-foreground mt-1" />
							<div>
								<label
									for="urgent-alerts"
									class="font-medium text-foreground cursor-pointer"
								>
									Urgent alerts
								</label>
								<p class="text-sm text-muted-foreground mt-0.5">
									Receive critical notifications even during quiet hours
								</p>
							</div>
						</div>
						<label
							class="relative inline-flex items-center cursor-pointer min-h-[44px]"
						>
							<input
								type="checkbox"
								id="urgent-alerts"
								class="sr-only peer"
								bind:checked={urgentAlerts}
								disabled={isOptedOut}
							/>
							<div
								class="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"
							></div>
						</label>
					</div>

					<!-- Quiet Hours -->
					<div class="border-t border-border pt-4">
						<div class="flex items-start gap-3 mb-3">
							<Moon class="w-4 h-4 text-muted-foreground mt-1" />
							<div>
								<h4 class="font-medium text-foreground">Quiet hours</h4>
								<p class="text-sm text-muted-foreground mt-0.5">
									Set times when you don't want to receive non-urgent
									notifications
								</p>
							</div>
						</div>
						<div class="grid grid-cols-2 gap-3 ml-8">
							<FormField
								label="Start time"
								labelFor="sms-quiet-start"
								uppercase={false}
								showOptional={false}
							>
								<TextInput
									id="sms-quiet-start"
									type="time"
									inputmode="numeric"
									enterkeyhint="next"
									bind:value={quietHoursStart}
									disabled={isOptedOut}
								/>
							</FormField>
							<FormField
								label="End time"
								labelFor="sms-quiet-end"
								uppercase={false}
								showOptional={false}
							>
								<TextInput
									id="sms-quiet-end"
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
					<div
						class="flex flex-wrap gap-3 justify-between items-center pt-4 border-t border-border"
					>
						<Button
							onclick={savePreferences}
							disabled={isSaving || isOptedOut}
							variant="primary"
							loading={isSaving}
							class="pressable"
						>
							{isSaving ? 'Saving…' : 'Save preferences'}
						</Button>

						{#if !isOptedOut}
							<Button
								onclick={handleOptOut}
								variant="ghost"
								class="text-destructive hover:text-destructive hover:bg-destructive/10 pressable"
							>
								Opt out of SMS
							</Button>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>
