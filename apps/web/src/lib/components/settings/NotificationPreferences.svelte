<!-- apps/web/src/lib/components/settings/NotificationPreferences.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { notificationPreferencesService } from '$lib/services/notification-preferences.service';
	import { notificationPreferencesStore } from '$lib/stores/notificationPreferences';
	import { browserPushService } from '$lib/services/browser-push.service';
	import { smsService } from '$lib/services/sms.service';
	import { toastService } from '$lib/stores/toast.store';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import PhoneVerificationModal from './PhoneVerificationModal.svelte';
	import {
		Bell,
		Mail,
		Smartphone,
		MessageSquare,
		Check,
		Loader,
		Moon,
		AlertCircle
	} from 'lucide-svelte';
	import type { UserNotificationPreferences } from '@buildos/shared-types';

	interface Props {
		userId: string;
	}

	let { userId }: Props = $props();

	let preferences = $state<UserNotificationPreferences | null>(null);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let loadError = $state<string | null>(null);
	let showPhoneVerificationModal = $state(false);
	let phoneVerified = $state(false);
	let phoneNumber = $state<string | null>(null);
	let isChannelSaving = $state(false);

	// Daily brief notification preferences
	let dailyBriefEmailEnabled = $state(false);
	let dailyBriefSmsEnabled = $state(false);
	let dailyBriefPrefsLoaded = $state(false);

	// Push notification state
	let pushSupported = $state(false);
	let pushSubscribed = $state(false);
	let pushPermissionStatus = $state<NotificationPermission>('default');
	let pushSubscriptionError = $state<string | null>(null);

	// Preference settings for brief.completed (with defaults)
	let pushEnabled = $state(false);
	let emailEnabled = $state(false);
	let smsEnabled = $state(false);
	let inAppEnabled = $state(false);
	let quietHoursEnabled = $state(false);
	let quietHoursStart = $state('22:00');
	let quietHoursEnd = $state('08:00');

	onMount(async () => {
		await Promise.all([
			loadPreferences(),
			loadDailyBriefPreferences(),
			checkPushSubscriptionStatus()
		]);
	});

	async function loadDailyBriefPreferences() {
		try {
			await notificationPreferencesStore.load();
			const state = $notificationPreferencesStore;
			if (state.preferences) {
				dailyBriefEmailEnabled = state.preferences.should_email_daily_brief;
				dailyBriefSmsEnabled = state.preferences.should_sms_daily_brief;
				dailyBriefPrefsLoaded = true;
			}
		} catch (error) {
			console.error('Failed to load daily brief notification preferences:', error);
		}
	}

	async function loadPreferences() {
		isLoading = true;
		loadError = null;
		try {
			const prefs = await notificationPreferencesService.get();

			if (prefs) {
				preferences = prefs;

				// Update state with loaded preferences
				pushEnabled = prefs.push_enabled;
				emailEnabled = prefs.email_enabled;
				smsEnabled = prefs.sms_enabled;
				inAppEnabled = prefs.in_app_enabled;
				quietHoursEnabled = prefs.quiet_hours_enabled;
				quietHoursStart = prefs.quiet_hours_start;
				quietHoursEnd = prefs.quiet_hours_end;
			}

			// Check phone verification status
			const smsPrefs = await smsService.getSMSPreferences(userId);
			if (smsPrefs.success && smsPrefs.data?.preferences) {
				phoneVerified = smsPrefs.data.preferences.phone_verified || false;
				phoneNumber = smsPrefs.data.preferences.phone_number || null;
			}
		} catch (error) {
			console.error('Failed to load notification preferences:', error);
			loadError = error instanceof Error ? error.message : 'Failed to load preferences';
			// Don't show toast on initial load failure - we'll show inline error
		} finally {
			isLoading = false;
		}
	}

	async function saveDailyBriefPreferences() {
		try {
			await notificationPreferencesStore.save({
				should_email_daily_brief: dailyBriefEmailEnabled,
				should_sms_daily_brief: dailyBriefSmsEnabled
			});
			toastService.success('Daily brief notification preferences saved');
		} catch (error) {
			console.error('Failed to save daily brief preferences:', error);
			// Store already sets error, but show toast for visibility
			toastService.error(
				error instanceof Error ? error.message : 'Failed to save preferences'
			);
			// Reload to reset state
			await loadDailyBriefPreferences();
		}
	}

	async function handleDailyBriefEmailToggle(enabled: boolean) {
		dailyBriefEmailEnabled = enabled;
		await saveDailyBriefPreferences();
	}

	async function handleDailyBriefSmsToggle(enabled: boolean) {
		if (enabled && !phoneVerified) {
			// Show phone verification modal
			showPhoneVerificationModal = true;
			// Revert toggle state until verification is complete
			dailyBriefSmsEnabled = false;
			return;
		}

		dailyBriefSmsEnabled = enabled;
		await saveDailyBriefPreferences();
	}

	async function handleSMSToggle(enabled: boolean) {
		if (enabled && !phoneVerified) {
			// Show phone verification modal
			showPhoneVerificationModal = true;
			// Revert toggle state until verification is complete
			smsEnabled = false;
			return;
		}

		// If disabled or phone is already verified, update immediately
		smsEnabled = enabled;
	}

	async function saveChannelPreferences(
		updates: Partial<UserNotificationPreferences>
	): Promise<void> {
		isChannelSaving = true;
		try {
			await notificationPreferencesService.update(updates);
		} catch (error) {
			console.error('Failed to save notification channel preferences:', error);
			toastService.error('Failed to save notification preferences');
			await loadPreferences();
		} finally {
			isChannelSaving = false;
		}
	}

	async function handlePhoneVerified() {
		// Reload preferences to get updated phone status
		await loadPreferences();
		// Enable SMS now that phone is verified
		smsEnabled = true;
		toastService.success('Phone verified! SMS notifications enabled.');
	}

	async function checkPushSubscriptionStatus() {
		try {
			pushSupported = browserPushService.isSupported();
			if (pushSupported) {
				pushSubscribed = await browserPushService.isSubscribed();
				pushPermissionStatus = Notification.permission;
			}
		} catch (error) {
			console.error('Failed to check push subscription status:', error);
		}
	}

	async function handlePushToggle(enabled: boolean) {
		let nextValue = enabled;
		if (enabled) {
			// User wants to enable push notifications
			pushSubscriptionError = null;

			try {
				if (!browserPushService.isSupported()) {
					throw new Error(
						'Push notifications are not supported in this browser. Please try Chrome, Firefox, or Safari.'
					);
				}

				// Request permission from browser
				const hasPermission = await browserPushService.requestPermission();
				if (!hasPermission) {
					nextValue = false;
					pushSubscriptionError =
						'Notification permission was denied. Please enable notifications in your browser settings and try again.';
					await saveChannelPreferences({ push_enabled: nextValue });
					return;
				}

				// Subscribe to push service
				await browserPushService.subscribe();
				pushSubscribed = true;
				pushPermissionStatus = 'granted';

				toastService.success('Push notifications enabled!');
			} catch (error) {
				nextValue = false;
				pushSubscriptionError =
					error instanceof Error ? error.message : 'Failed to enable push notifications';
				console.error('Failed to subscribe to push notifications:', error);
				toastService.error('Failed to enable push notifications');
			}
		} else {
			// User wants to disable push notifications
			try {
				await browserPushService.unsubscribe();
				pushSubscribed = false;
				toastService.success('Push notifications disabled');
			} catch (error) {
				console.error('Failed to unsubscribe from push notifications:', error);
			}
		}

		// Update the toggle state
		pushEnabled = nextValue;
		await saveChannelPreferences({ push_enabled: nextValue });
	}

	async function handleInAppToggle(enabled: boolean) {
		inAppEnabled = enabled;
		await saveChannelPreferences({ in_app_enabled: enabled });
	}

	async function savePreferences() {
		isSaving = true;
		try {
			await notificationPreferencesService.update({
				push_enabled: pushEnabled,
				in_app_enabled: inAppEnabled,
				quiet_hours_enabled: quietHoursEnabled,
				quiet_hours_start: quietHoursStart,
				quiet_hours_end: quietHoursEnd
			});

			toastService.success('Notification preferences saved successfully');
			await loadPreferences(); // Reload to get latest data
		} catch (error) {
			console.error('Failed to save notification preferences:', error);
			toastService.error('Failed to save notification preferences');
		} finally {
			isSaving = false;
		}
	}

	let hasAnyChannelEnabled = $derived(
		pushEnabled || inAppEnabled || dailyBriefEmailEnabled || dailyBriefSmsEnabled
	);
</script>

<div class="space-y-6">
	{#if isLoading}
		<div class="flex flex-col items-center justify-center py-8 gap-2">
			<Loader class="animate-spin h-6 w-6 text-accent" />
			<p class="text-sm text-muted-foreground">Loading notification preferences...</p>
		</div>
	{:else if loadError}
		<div class="bg-card rounded-lg border border-red-500/30 shadow-ink tx tx-static tx-weak">
			<div class="p-4">
				<div class="flex items-start gap-3">
					<AlertCircle class="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
					<div class="flex-1">
						<h3 class="text-base font-semibold text-foreground mb-1">
							Unable to Load Preferences
						</h3>
						<p class="text-sm text-muted-foreground mb-3">
							{loadError}
						</p>
						<Button
							onclick={loadPreferences}
							variant="outline"
							size="sm"
							class="pressable"
						>
							Try Again
						</Button>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<!-- Daily Brief Notification Settings (User-Level Preferences) -->
		<div class="bg-card rounded-lg border border-border shadow-ink tx tx-frame tx-weak">
			<div class="px-4 py-3 border-b border-border">
				<div class="flex items-center gap-3">
					<Bell class="w-5 h-5 text-purple-500" />
					<div>
						<h3 class="text-base font-semibold text-foreground">
							Daily Brief Notifications
						</h3>
						<p class="text-sm text-muted-foreground">
							Choose how you want to be notified when your daily brief is ready
						</p>
					</div>
				</div>
			</div>
			<div class="p-4 space-y-3">
				<!-- Daily Brief Email -->
				<div
					class="flex items-start justify-between p-3 rounded-lg hover:bg-muted transition-colors"
				>
					<div class="flex items-start gap-3">
						<Mail class="w-5 h-5 text-blue-500 mt-0.5" />
						<div>
							<label
								for="daily-brief-email"
								class="font-medium text-foreground cursor-pointer"
							>
								Email Daily Brief
							</label>
							<p class="text-sm text-muted-foreground mt-0.5">
								Get your daily brief via email when it's ready
							</p>
						</div>
					</div>
					<label class="relative inline-flex items-center cursor-pointer">
						<input
							type="checkbox"
							id="daily-brief-email"
							class="sr-only peer"
							checked={dailyBriefEmailEnabled}
							onchange={(e) => handleDailyBriefEmailToggle(e.currentTarget.checked)}
						/>
						<div
							class="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"
						></div>
					</label>
				</div>

				<!-- Daily Brief SMS -->
				<div
					class="flex items-start justify-between p-3 rounded-lg hover:bg-muted transition-colors"
				>
					<div class="flex items-start gap-3">
						<MessageSquare class="w-5 h-5 text-orange-500 mt-0.5" />
						<div class="flex-1">
							<label
								for="daily-brief-sms"
								class="font-medium text-foreground cursor-pointer"
							>
								SMS Daily Brief
							</label>
							<p class="text-sm text-muted-foreground mt-0.5">
								Receive text messages when your brief is ready
							</p>
							{#if !phoneVerified}
								<div
									class="mt-1.5 flex items-center gap-1.5 text-xs text-amber-600"
								>
									<AlertCircle class="w-3.5 h-3.5" />
									<span>Phone verification required</span>
								</div>
							{:else if phoneNumber}
								<div class="mt-1 text-xs text-muted-foreground">
									Verified: {phoneNumber}
								</div>
							{/if}
						</div>
					</div>
					<label class="relative inline-flex items-center cursor-pointer">
						<input
							type="checkbox"
							id="daily-brief-sms"
							class="sr-only peer"
							checked={dailyBriefSmsEnabled}
							onchange={(e) => handleDailyBriefSmsToggle(e.currentTarget.checked)}
						/>
						<div
							class="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"
						></div>
					</label>
				</div>
			</div>
		</div>

		<!-- Additional Notification Channels -->
		<div class="bg-card rounded-lg border border-border shadow-ink tx tx-frame tx-weak">
			<div class="px-4 py-3 border-b border-border">
				<div class="flex items-center gap-3">
					<Bell class="w-5 h-5 text-purple-500" />
					<div>
						<h3 class="text-base font-semibold text-foreground">
							Additional Notification Channels
						</h3>
						<p class="text-sm text-muted-foreground">
							Configure push and in-app notifications for your daily briefs
						</p>
					</div>
				</div>
			</div>
			<div class="p-4 space-y-4">
				<!-- Push Notifications -->
				<div
					class="flex items-start justify-between p-3 rounded-lg hover:bg-muted transition-colors"
				>
					<div class="flex items-start gap-3">
						<Smartphone class="w-5 h-5 text-green-500 mt-0.5" />
						<div class="flex-1">
							<label
								for="push-notifications"
								class="font-medium text-foreground cursor-pointer"
							>
								Push Notifications
							</label>
							<p class="text-sm text-muted-foreground mt-0.5">
								Get instant browser notifications
							</p>
							{#if !pushSupported}
								<div
									class="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"
								>
									<AlertCircle class="w-3.5 h-3.5" />
									<span>Not supported in this browser</span>
								</div>
							{:else if pushEnabled && !pushSubscribed}
								<div
									class="mt-1.5 flex items-center gap-1.5 text-xs text-amber-600"
								>
									<AlertCircle class="w-3.5 h-3.5" />
									<span>Browser permission required</span>
								</div>
							{:else if pushEnabled && pushSubscribed}
								<div class="mt-1 text-xs text-green-600">✓ Active subscription</div>
							{:else if pushPermissionStatus === 'denied'}
								<div class="mt-1.5 flex items-center gap-1.5 text-xs text-red-500">
									<AlertCircle class="w-3.5 h-3.5" />
									<span>Permission denied - check browser settings</span>
								</div>
							{/if}
							{#if pushSubscriptionError}
								<div class="mt-1.5 flex items-start gap-1.5 text-xs text-red-500">
									<AlertCircle class="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
									<span>{pushSubscriptionError}</span>
								</div>
							{/if}
						</div>
					</div>
					<label class="relative inline-flex items-center cursor-pointer">
						<input
							type="checkbox"
							id="push-notifications"
							class="sr-only peer"
							checked={pushEnabled}
							onchange={(e) => handlePushToggle(e.currentTarget.checked)}
							disabled={!pushSupported}
						/>
						<div
							class="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"
						></div>
					</label>
				</div>

				<!-- In-App Notifications -->
				<div
					class="flex items-start justify-between p-3 rounded-lg hover:bg-muted transition-colors"
				>
					<div class="flex items-start gap-3">
						<Bell class="w-5 h-5 text-purple-500 mt-0.5" />
						<div>
							<label
								for="in-app-notifications"
								class="font-medium text-foreground cursor-pointer"
							>
								In-App Notifications
							</label>
							<p class="text-sm text-muted-foreground mt-0.5">
								See notifications within the BuildOS app
							</p>
						</div>
					</div>
					<label class="relative inline-flex items-center cursor-pointer">
						<input
							type="checkbox"
							id="in-app-notifications"
							class="sr-only peer"
							bind:checked={inAppEnabled}
							onchange={(e) => handleInAppToggle(e.currentTarget.checked)}
						/>
						<div
							class="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"
						></div>
					</label>
				</div>

				{#if !hasAnyChannelEnabled}
					<div
						class="flex items-start gap-3 p-3 bg-amber-500/10 rounded-lg border border-amber-500/30"
					>
						<Moon class="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
						<p class="text-sm text-foreground">
							All notification channels are disabled. Enable at least one channel
							above to receive daily brief notifications.
						</p>
					</div>
				{/if}

				<!-- Quiet Hours -->
				<div class="border-t border-border pt-4">
					<div class="flex items-start gap-3 mb-3">
						<Moon class="w-5 h-5 text-indigo-500 mt-0.5" />
						<div class="flex-1">
							<div class="flex items-center justify-between">
								<div>
									<h4 class="font-medium text-foreground">Quiet Hours</h4>
									<p class="text-sm text-muted-foreground mt-0.5">
										Don't send push notifications during these hours
									</p>
								</div>
								<label class="relative inline-flex items-center cursor-pointer">
									<input
										type="checkbox"
										id="quiet-hours-enabled"
										class="sr-only peer"
										bind:checked={quietHoursEnabled}
									/>
									<div
										class="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"
									></div>
								</label>
							</div>
						</div>
					</div>
					{#if quietHoursEnabled}
						<div class="grid grid-cols-2 gap-3 ml-8">
							<FormField label="Start Time" labelFor="quiet-start">
								<TextInput
									id="quiet-start"
									type="time"
									bind:value={quietHoursStart}
								/>
							</FormField>
							<FormField label="End Time" labelFor="quiet-end">
								<TextInput id="quiet-end" type="time" bind:value={quietHoursEnd} />
							</FormField>
						</div>
					{/if}
				</div>

				<!-- Save Button -->
				<div class="flex justify-end pt-4 border-t border-border">
					<Button
						onclick={savePreferences}
						disabled={isSaving}
						variant="primary"
						loading={isSaving}
						icon={isSaving ? Loader : Check}
						class="shadow-ink pressable"
					>
						{isSaving ? 'Saving...' : 'Save Preferences'}
					</Button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Phone Verification Modal -->
	<PhoneVerificationModal
		bind:isOpen={showPhoneVerificationModal}
		onClose={() => (showPhoneVerificationModal = false)}
		onVerified={handlePhoneVerified}
	/>
</div>
