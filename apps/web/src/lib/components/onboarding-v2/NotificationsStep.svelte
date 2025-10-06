<!-- apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte -->
<script lang="ts">
	import { Bell, Mail, Smartphone, Sun, Moon, Info } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import PhoneVerificationCard from './PhoneVerificationCard.svelte';
	import { onboardingV2Service } from '$lib/services/onboarding-v2.service';
	import { toastService } from '$lib/stores/toast.store';
	import { ONBOARDING_V2_CONFIG } from '$lib/config/onboarding.config';

	interface Props {
		userId: string;
		onNext: () => void;
		onSMSEnabled?: (enabled: boolean) => void;
		onEmailEnabled?: (enabled: boolean) => void;
	}

	let { userId, onNext, onSMSEnabled, onEmailEnabled }: Props = $props();

	// SMS preferences state
	let smsPreferences = $state({
		phoneVerified: false,
		phoneNumber: '',
		eventReminders: false,
		nextUpNotifications: false,
		morningKickoff: false,
		eveningRecap: false
	});

	// Email preferences state
	let emailPreferences = $state({
		dailyBrief: false
	});

	let isSaving = $state(false);
	let showSMSOptions = $derived(smsPreferences.phoneVerified);

	// Handle phone verification success
	function handlePhoneVerified(phoneNumber: string) {
		smsPreferences.phoneVerified = true;
		smsPreferences.phoneNumber = phoneNumber;

		// Enable recommended SMS options by default
		smsPreferences.eventReminders = true;
		smsPreferences.morningKickoff = true;

		toastService.success('Great! Now choose your notification preferences.');
	}

	// Handle skip SMS setup
	async function handleSkipSMS() {
		try {
			await onboardingV2Service.markSMSSkipped(userId, true);
			onNext();
		} catch (error) {
			console.error('Failed to mark SMS as skipped:', error);
			onNext(); // Continue anyway
		}
	}

	// Save preferences and continue
	async function saveAndContinue() {
		isSaving = true;

		try {
			// Save SMS preferences if phone is verified
			if (smsPreferences.phoneVerified) {
				const response = await fetch('/api/sms/preferences', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						event_reminders_enabled: smsPreferences.eventReminders,
						next_up_enabled: smsPreferences.nextUpNotifications,
						morning_kickoff_enabled: smsPreferences.morningKickoff,
						evening_recap_enabled: smsPreferences.eveningRecap
					})
				});

				if (!response.ok) {
					throw new Error('Failed to save SMS preferences');
				}

				// Also enable SMS for brief.completed notification if any SMS options are enabled
				if (
					smsPreferences.eventReminders ||
					smsPreferences.nextUpNotifications ||
					smsPreferences.morningKickoff ||
					smsPreferences.eveningRecap
				) {
					const notifResponse = await fetch('/api/notification-preferences', {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							event_type: 'brief.completed',
							sms_enabled: true
						})
					});

					if (!notifResponse.ok) {
						console.error('Failed to enable SMS for brief.completed notifications');
						// Don't throw - this is non-critical
					}
				}

				// Notify parent
				if (onSMSEnabled) {
					onSMSEnabled(true);
				}
			}

			// Save email preferences
			const emailResponse = await fetch('/api/brief-preferences', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email_daily_brief: emailPreferences.dailyBrief
				})
			});

			if (!emailResponse.ok) {
				console.error('Failed to save email preferences');
				// Don't throw - this is non-critical
			}

			// Notify parent
			if (onEmailEnabled) {
				onEmailEnabled(emailPreferences.dailyBrief);
			}

			toastService.success('Notification preferences saved!');
			onNext();
		} catch (error) {
			console.error('Failed to save preferences:', error);
			toastService.error('Failed to save preferences. Please try again.');
		} finally {
			isSaving = false;
		}
	}

	// Icon mapping for notification types
	const iconMap = {
		event_reminders: Bell,
		next_up: Smartphone,
		morning_kickoff: Sun,
		evening_recap: Moon
	};
</script>

<div class="max-w-3xl mx-auto px-4">
	<!-- Header -->
	<div class="mb-8 text-center">
		<div class="flex justify-center mb-6">
			<div
				class="w-16 h-16 bg-gradient-to-br from-green-100 to-blue-100 dark:from-green-900/30 dark:to-blue-900/30 rounded-2xl flex items-center justify-center shadow-lg"
			>
				<Bell class="w-8 h-8 text-green-600 dark:text-green-400" />
			</div>
		</div>

		<h2 class="text-3xl sm:text-4xl font-bold mb-3 text-gray-900 dark:text-white">
			Stay Accountable
		</h2>
		<p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
			How do you want BuildOS to keep you on track? (This step is optional)
		</p>
	</div>

	<!-- SMS Notification Demo Placeholder -->
	<div
		class="mb-6 p-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-xl border-2 border-blue-200 dark:border-blue-800"
	>
		<div class="flex items-start gap-3 mb-3">
			<Info class="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
			<h3 class="font-semibold text-gray-900 dark:text-white">
				See SMS Notifications in Action
			</h3>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-600"
		>
			<p class="text-gray-400 text-sm mb-2">
				🎥 [Demo video: Phone receiving SMS notifications - 10 seconds]
			</p>
			<p class="text-xs text-gray-500">
				Examples: Morning kickoff, task reminder, evening recap
			</p>
		</div>
	</div>

	<div class="space-y-6">
		<!-- Phone Verification Card -->
		<PhoneVerificationCard onVerified={handlePhoneVerified} onSkip={handleSkipSMS} />

		<!-- SMS Options (only show if phone verified) -->
		{#if showSMSOptions}
			<div
				class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300"
			>
				<h4 class="font-semibold text-lg mb-4 text-gray-900 dark:text-white">
					Choose Your SMS Notifications
				</h4>
				<p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
					Select which types of text messages you'd like to receive
				</p>

				<div class="space-y-4">
					<!-- Event Reminders -->
					<label class="flex items-start gap-3 cursor-pointer group">
						<input
							type="checkbox"
							bind:checked={smsPreferences.eventReminders}
							class="mt-1 w-5 h-5 text-blue-600 dark:text-blue-500 rounded border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-0"
						/>
						<div class="flex-1">
							<div
								class="font-medium flex items-center gap-2 text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
							>
								<Bell class="w-4 h-4" />
								Event Reminders
							</div>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Get notified about upcoming events and meetings
							</p>
						</div>
					</label>

					<!-- Next Up Notifications -->
					<label class="flex items-start gap-3 cursor-pointer group">
						<input
							type="checkbox"
							bind:checked={smsPreferences.nextUpNotifications}
							class="mt-1 w-5 h-5 text-blue-600 dark:text-blue-500 rounded border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-0"
						/>
						<div class="flex-1">
							<div
								class="font-medium flex items-center gap-2 text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
							>
								<Smartphone class="w-4 h-4" />
								Next Up Notifications
							</div>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								See what's next on your schedule
							</p>
						</div>
					</label>

					<!-- Morning Kickoff -->
					<label class="flex items-start gap-3 cursor-pointer group">
						<input
							type="checkbox"
							bind:checked={smsPreferences.morningKickoff}
							class="mt-1 w-5 h-5 text-blue-600 dark:text-blue-500 rounded border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-0"
						/>
						<div class="flex-1">
							<div
								class="font-medium flex items-center gap-2 text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
							>
								<Sun class="w-4 h-4" />
								Morning Kickoff
							</div>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Start your day with focus and priorities (8 AM daily)
							</p>
						</div>
					</label>

					<!-- Evening Recap -->
					<label class="flex items-start gap-3 cursor-pointer group">
						<input
							type="checkbox"
							bind:checked={smsPreferences.eveningRecap}
							class="mt-1 w-5 h-5 text-blue-600 dark:text-blue-500 rounded border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-0"
						/>
						<div class="flex-1">
							<div
								class="font-medium flex items-center gap-2 text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
							>
								<Moon class="w-4 h-4" />
								Evening Recap
							</div>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Reflect on your day and plan tomorrow (8 PM daily)
							</p>
						</div>
					</label>
				</div>

				{#if smsPreferences.eventReminders || smsPreferences.nextUpNotifications || smsPreferences.morningKickoff || smsPreferences.eveningRecap}
					<div
						class="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
					>
						<p class="text-sm text-blue-700 dark:text-blue-300">
							✓ {[
								smsPreferences.eventReminders,
								smsPreferences.nextUpNotifications,
								smsPreferences.morningKickoff,
								smsPreferences.eveningRecap
							].filter(Boolean).length} notification type{[
								smsPreferences.eventReminders,
								smsPreferences.nextUpNotifications,
								smsPreferences.morningKickoff,
								smsPreferences.eveningRecap
							].filter(Boolean).length !== 1
								? 's'
								: ''} enabled
						</p>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Email Preferences -->
		<div
			class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm"
		>
			<div class="flex items-start gap-4">
				<div
					class="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-lg flex items-center justify-center"
				>
					<Mail class="w-6 h-6 text-purple-600 dark:text-purple-400" />
				</div>

				<div class="flex-1">
					<h4 class="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
						Email Notifications
					</h4>

					<label class="flex items-start gap-3 cursor-pointer mt-4 group">
						<input
							type="checkbox"
							bind:checked={emailPreferences.dailyBrief}
							class="mt-1 w-5 h-5 text-purple-600 dark:text-purple-500 rounded border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:ring-offset-0"
						/>
						<div class="flex-1">
							<div
								class="font-medium text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors"
							>
								Daily Brief Emails
							</div>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Morning digest with your upcoming projects, tasks, and calendar
								events
							</p>
						</div>
					</label>
				</div>
			</div>
		</div>

		<!-- Info Box -->
		<div
			class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
		>
			<div class="flex gap-3">
				<Info class="w-5 h-5 text-gray-500 dark:text-gray-400 mt-0.5 flex-shrink-0" />
				<div class="text-sm text-gray-600 dark:text-gray-400">
					<p class="font-medium text-gray-900 dark:text-white mb-1">
						You can change these anytime
					</p>
					<p>Update your notification preferences in Settings whenever you need.</p>
				</div>
			</div>
		</div>
	</div>

	<!-- Actions -->
	<div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mt-8">
		<Button
			variant="ghost"
			on:click={handleSkipSMS}
			disabled={isSaving}
			class="order-2 sm:order-1"
		>
			I'll set this up later
		</Button>

		<Button
			variant="primary"
			size="lg"
			on:click={saveAndContinue}
			loading={isSaving}
			class="flex-1 sm:flex-initial min-w-[200px] order-1 sm:order-2"
		>
			{#if isSaving}
				Saving...
			{:else}
				Continue
			{/if}
		</Button>
	</div>
</div>
