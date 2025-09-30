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
	let taskReminders = $state(false);
	let dailyBriefSms = $state(false);
	let urgentAlerts = $state(true);
	let quietHoursStart = $state('21:00');
	let quietHoursEnd = $state('08:00');
	let timezone = $state('America/Los_Angeles');

	onMount(async () => {
		await loadPreferences();
	});

	async function loadPreferences() {
		isLoading = true;
		const result = await smsService.getSMSPreferences(userId);

		if (result.success && result.data?.preferences) {
			preferences = result.data.preferences;

			// Update state with loaded preferences
			taskReminders = preferences.task_reminders || false;
			dailyBriefSms = preferences.daily_brief_sms || false;
			urgentAlerts = preferences.urgent_alerts !== false; // Default to true
			quietHoursStart = preferences.quiet_hours_start || '21:00';
			quietHoursEnd = preferences.quiet_hours_end || '08:00';
			timezone = preferences.timezone || 'America/Los_Angeles';
		}

		isLoading = false;
	}

	async function savePreferences() {
		isSaving = true;

		const result = await smsService.updateSMSPreferences(userId, {
			task_reminders: taskReminders,
			daily_brief_sms: dailyBriefSms,
			urgent_alerts: urgentAlerts,
			quiet_hours_start: quietHoursStart,
			quiet_hours_end: quietHoursEnd,
			timezone
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
		<div class="flex justify-center py-8">
			<svg
				class="animate-spin h-6 w-6 text-primary"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
			>
				<circle
					class="opacity-25"
					cx="12"
					cy="12"
					r="10"
					stroke="currentColor"
					stroke-width="4"
				></circle>
				<path
					class="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
				></path>
			</svg>
		</div>
	{:else}
		<!-- Phone Verification Section -->
		<div
			class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg"
		>
			<div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
				<div class="flex items-center gap-3">
					<Phone class="w-5 h-5 text-blue-600 dark:text-blue-400" />
					<div>
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
							Phone Number
						</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">
							Verify your phone number to receive SMS notifications
						</p>
					</div>
				</div>
			</div>
			<div class="p-6">
				{#if !isPhoneVerified}
					<PhoneVerification />
				{:else}
					<div class="space-y-4">
						<div
							class="flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-lg p-4 border border-green-200 dark:border-green-800"
						>
							<div class="flex items-center gap-3">
								<Phone class="w-5 h-5 text-green-600 dark:text-green-400" />
								<div>
									<p class="font-medium text-gray-900 dark:text-white">
										Verified Phone
									</p>
									<p class="text-sm text-gray-600 dark:text-gray-400">
										{phoneNumber}
									</p>
								</div>
							</div>
							<div class="flex items-center gap-2 text-green-600 dark:text-green-400">
								<Check class="w-5 h-5" />
								<span class="font-medium">Verified</span>
							</div>
						</div>

						{#if isOptedOut}
							<div
								class="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800"
							>
								<AlertTriangle
									class="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
								/>
								<p class="text-sm text-amber-800 dark:text-amber-200">
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
			<div
				class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg"
			>
				<div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
					<div class="flex items-center gap-3">
						<Bell class="w-5 h-5 text-purple-600 dark:text-purple-400" />
						<div>
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								SMS Notifications
							</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Choose which notifications you want to receive via SMS
							</p>
						</div>
					</div>
				</div>
				<div class="p-6 space-y-6">
					<!-- Task Reminders -->
					<div
						class="flex items-start justify-between p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
					>
						<div class="flex items-start gap-3">
							<MessageSquare
								class="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5"
							/>
							<div>
								<label
									for="task-reminders"
									class="font-medium text-gray-900 dark:text-white cursor-pointer"
								>
									Task Reminders
								</label>
								<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
									Get SMS reminders for upcoming tasks
								</p>
							</div>
						</div>
						<label class="relative inline-flex items-center cursor-pointer">
							<input
								type="checkbox"
								id="task-reminders"
								class="sr-only peer"
								bind:checked={taskReminders}
								disabled={isOptedOut}
							/>
							<div
								class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"
							></div>
						</label>
					</div>

					<!-- Daily Brief -->
					<div
						class="flex items-start justify-between p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
					>
						<div class="flex items-start gap-3">
							<Sun class="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
							<div>
								<label
									for="daily-brief"
									class="font-medium text-gray-900 dark:text-white cursor-pointer"
								>
									Daily Brief Notifications
								</label>
								<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
									Get notified when your daily brief is ready
								</p>
							</div>
						</div>
						<label class="relative inline-flex items-center cursor-pointer">
							<input
								type="checkbox"
								id="daily-brief"
								class="sr-only peer"
								bind:checked={dailyBriefSms}
								disabled={isOptedOut}
							/>
							<div
								class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 dark:peer-focus:ring-amber-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-amber-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"
							></div>
						</label>
					</div>

					<!-- Urgent Alerts -->
					<div
						class="flex items-start justify-between p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
					>
						<div class="flex items-start gap-3">
							<AlertTriangle class="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
							<div>
								<label
									for="urgent-alerts"
									class="font-medium text-gray-900 dark:text-white cursor-pointer"
								>
									Urgent Alerts
								</label>
								<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
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
								class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 dark:peer-focus:ring-red-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-red-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"
							></div>
						</label>
					</div>

					<!-- Quiet Hours -->
					<div class="border-t border-gray-200 dark:border-gray-700 pt-6">
						<div class="flex items-start gap-3 mb-4">
							<Moon class="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5" />
							<div>
								<h4 class="font-medium text-gray-900 dark:text-white">
									Quiet Hours
								</h4>
								<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
									Set times when you don't want to receive non-urgent
									notifications
								</p>
							</div>
						</div>
						<div class="grid grid-cols-2 gap-4">
							<FormField label="Start Time" labelFor="quiet-start">
								<TextInput
									id="quiet-start"
									type="time"
									bind:value={quietHoursStart}
									disabled={isOptedOut}
								/>
							</FormField>
							<FormField label="End Time" labelFor="quiet-end">
								<TextInput
									id="quiet-end"
									type="time"
									bind:value={quietHoursEnd}
									disabled={isOptedOut}
								/>
							</FormField>
						</div>
					</div>

					<!-- Save Button -->
					<div
						class="flex justify-between items-center pt-6 border-t border-gray-200 dark:border-gray-700"
					>
						<Button
							on:click={savePreferences}
							disabled={isSaving || isOptedOut}
							variant="primary"
							loading={isSaving}
							icon={isSaving ? Loader : Check}
						>
							{isSaving ? 'Saving...' : 'Save Preferences'}
						</Button>

						{#if !isOptedOut}
							<Button
								on:click={handleOptOut}
								variant="outline"
								icon={XCircle}
								class="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
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
