<!-- apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte -->
<script lang="ts">
	import { Bell, Mail, Sun, Moon, Info, CheckCircle2 } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import PhoneVerificationCard from './PhoneVerificationCard.svelte';
	import { onboardingV2Service } from '$lib/services/onboarding-v2.service';
	import { toastService } from '$lib/stores/toast.store';

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
		morningKickoff: false,
		eveningRecap: false
	});

	// Email preferences state
	let emailPreferences = $state({
		dailyBrief: false
	});

	let isSaving = $state(false);
	let wantsToEnableSMS = $state(false);

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
						morning_kickoff_enabled: smsPreferences.morningKickoff,
						evening_recap_enabled: smsPreferences.eveningRecap
					})
				});

				const result = await response.json();

				if (!result?.success) {
					throw new Error(result?.error?.[0] || 'Failed to save SMS preferences');
				}

				// Also enable daily brief SMS if any SMS options are enabled
				if (
					smsPreferences.eventReminders ||
					smsPreferences.morningKickoff ||
					smsPreferences.eveningRecap
				) {
					const notifResponse = await fetch('/api/notification-preferences', {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							should_sms_daily_brief: true
						})
					});

					if (!notifResponse.ok) {
						console.error('Failed to enable daily brief SMS notifications');
						// Don't throw - this is non-critical (might fail if brief generation not active yet)
					}
				}

				// Notify parent
				if (onSMSEnabled) {
					onSMSEnabled(true);
				}
			}

			// Save email preferences for daily brief
			if (emailPreferences.dailyBrief) {
				const emailResponse = await fetch('/api/notification-preferences', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						should_email_daily_brief: true
					})
				});

				if (!emailResponse.ok) {
					console.error('Failed to save email preferences');
					// Don't throw - this is non-critical (might fail if brief generation not active yet)
				}
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
</script>

<div class="max-w-3xl mx-auto px-4">
	<!-- Header -->
	<div class="mb-8 text-center">
		<div class="flex justify-center mb-6">
			<div
				class="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center shadow-ink tx tx-bloom tx-weak"
			>
				<CheckCircle2 class="w-8 h-8 text-emerald-600" />
			</div>
		</div>

		<h2 class="text-3xl sm:text-4xl font-bold mb-3 text-foreground">
			Step 2: Focus - Reminders & Calendar Integration
		</h2>
		<p class="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-4">
			You've got <strong class="text-foreground">clarity</strong> from brain dumping your
			projects. Now you need
			<strong class="text-foreground">focus</strong> to actually get things done.
		</p>
		<p class="text-base text-muted-foreground leading-relaxed max-w-2xl mx-auto">
			BuildOS helps you maintain focus through smart reminders, calendar integration, daily
			check-ins, and contextual notifications that keep you moving forward on what matters
			most.
		</p>
	</div>

	<!-- BuildOS Way Reminder -->
	<div class="mb-8">
		<div class="bg-card rounded-xl border border-border p-6 shadow-ink tx tx-frame tx-weak">
			<div class="flex items-start gap-4">
				<div
					class="flex-shrink-0 w-10 h-10 bg-accent rounded-full flex items-center justify-center text-accent-foreground font-bold shadow-ink pressable"
				>
					2
				</div>
				<div class="flex-1">
					<h3 class="font-bold text-lg mb-2 text-foreground">
						The BuildOS Way: Clarity → Focus → Results
					</h3>
					<p class="text-sm text-muted-foreground leading-relaxed">
						You've already taken the first step by getting <strong
							class="text-foreground">clarity</strong
						>
						through brain dumping your projects. Now BuildOS offers several ways to help
						you maintain <strong class="text-foreground">focus</strong> — choose what works
						best for your workflow.
					</p>
				</div>
			</div>
		</div>
	</div>

	<div class="space-y-6">
		<!-- Daily Brief Email Section -->
		<div class="bg-card rounded-xl border border-border p-6 shadow-ink tx tx-frame tx-weak">
			<div class="flex items-start gap-4 mb-4">
				<div
					class="flex-shrink-0 w-12 h-12 bg-muted rounded-lg flex items-center justify-center shadow-ink"
				>
					<Mail class="w-6 h-6 text-accent" />
				</div>

				<div class="flex-1">
					<h3 class="font-semibold text-xl mb-2 text-foreground">Daily Brief Email</h3>
					<p class="text-sm text-muted-foreground mb-4">
						Start each morning with clarity. Get a comprehensive email digest that
						brings everything together in one place.
					</p>

					<!-- Benefits list -->
					<div class="space-y-2 mb-4">
						<div class="flex items-start gap-2 text-sm text-muted-foreground">
							<CheckCircle2 class="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
							<span>All your active projects and what needs attention</span>
						</div>
						<div class="flex items-start gap-2 text-sm text-muted-foreground">
							<CheckCircle2 class="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
							<span>Today's tasks and upcoming deadlines</span>
						</div>
						<div class="flex items-start gap-2 text-sm text-muted-foreground">
							<CheckCircle2 class="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
							<span>Your calendar events with context</span>
						</div>
					</div>

					<!-- Toggle -->
					<label
						class="flex items-center gap-3 cursor-pointer group p-3 bg-muted rounded-lg hover:bg-accent/10 transition-colors"
					>
						<input
							type="checkbox"
							bind:checked={emailPreferences.dailyBrief}
							class="w-5 h-5 text-accent rounded border-border focus:ring-2 focus:ring-ring focus:ring-offset-0"
						/>
						<div class="flex-1">
							<div class="font-medium text-foreground">
								Yes, send me the Daily Brief
							</div>
							<p class="text-xs text-muted-foreground">
								Delivered to your inbox every morning
							</p>
						</div>
					</label>
				</div>
			</div>
		</div>

		<!-- SMS Notifications Section -->
		<div class="bg-card rounded-xl border border-border p-6 shadow-ink tx tx-frame tx-weak">
			<div class="flex items-start gap-4 mb-4">
				<div
					class="flex-shrink-0 w-12 h-12 bg-muted rounded-lg flex items-center justify-center shadow-ink"
				>
					<Bell class="w-6 h-6 text-emerald-600" />
				</div>

				<div class="flex-1">
					<h3 class="font-semibold text-xl mb-2 text-foreground">SMS Text Messages</h3>
					<p class="text-sm text-muted-foreground mb-4">
						Get timely nudges throughout the day to keep you on track. Choose the
						messages that work best for you.
					</p>

					<!-- SMS Options -->
					<div class="space-y-3">
						<!-- Event Reminders -->
						<div class="p-4 bg-muted rounded-lg border border-border">
							<div class="flex items-start gap-3">
								<Bell class="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
								<div class="flex-1">
									<h4 class="font-semibold text-foreground mb-1">
										Event Reminders
									</h4>
									<p class="text-sm text-muted-foreground mb-2">
										Never walk into a meeting unprepared. Get a heads up text 15
										minutes before events with helpful context, attendee info,
										and what you need to bring.
									</p>
									<p class="text-xs text-muted-foreground/70 italic">
										"Meeting in 15 mins: Project Sync with Sarah. Agenda: Q4
										roadmap review."
									</p>
								</div>
							</div>
						</div>

						<!-- Morning Kickoff -->
						<div class="p-4 bg-muted rounded-lg border border-border">
							<div class="flex items-start gap-3">
								<Sun class="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
								<div class="flex-1">
									<h4 class="font-semibold text-foreground mb-1">
										Morning Kickoff
									</h4>
									<p class="text-sm text-muted-foreground mb-2">
										Know what you're committing to today. Get a morning text (8
										AM) with your schedule, priority tasks, and what needs your
										attention first.
									</p>
									<p class="text-xs text-muted-foreground/70 italic">
										"Good morning! 3 meetings today, 5 tasks due. Start with:
										Finish proposal draft."
									</p>
								</div>
							</div>
						</div>

						<!-- Evening Recap -->
						<div class="p-4 bg-muted rounded-lg border border-border">
							<div class="flex items-start gap-3">
								<Moon class="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
								<div class="flex-1">
									<h4 class="font-semibold text-foreground mb-1">
										Evening Recap
									</h4>
									<p class="text-sm text-muted-foreground mb-2">
										Celebrate progress and prepare for tomorrow. Get an evening
										text (8 PM) with what you accomplished today and what's on
										deck for tomorrow.
									</p>
									<p class="text-xs text-muted-foreground/70 italic">
										"You completed 7 tasks today! Tomorrow: Design review at 10
										AM, 4 tasks pending."
									</p>
								</div>
							</div>
						</div>
					</div>

					<!-- Call to action for SMS -->
					{#if !smsPreferences.phoneVerified && !wantsToEnableSMS}
						<div class="mt-4 p-4 bg-muted rounded-lg">
							<p class="text-sm text-muted-foreground mb-3">
								Ready to enable SMS notifications? You'll need to verify your phone
								number first.
							</p>
							<Button
								variant="primary"
								onclick={() => (wantsToEnableSMS = true)}
								class="w-full shadow-ink pressable"
							>
								Enable SMS Notifications
							</Button>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Phone Verification Card (show when user wants SMS) -->
		{#if wantsToEnableSMS && !smsPreferences.phoneVerified}
			<div class="animate-in fade-in slide-in-from-top-2 duration-300">
				<PhoneVerificationCard
					{userId}
					onVerified={handlePhoneVerified}
					onSkip={() => (wantsToEnableSMS = false)}
				/>
			</div>
		{/if}

		<!-- SMS Preference Selection (after verification) -->
		{#if smsPreferences.phoneVerified}
			<div
				class="bg-card rounded-xl border border-border p-6 shadow-ink animate-in fade-in slide-in-from-top-2 duration-300 tx tx-grain tx-weak"
			>
				<h4 class="font-semibold text-lg mb-4 text-foreground flex items-center gap-2">
					<CheckCircle2 class="w-5 h-5 text-emerald-600" />
					Choose Your Text Messages
				</h4>
				<p class="text-sm text-muted-foreground mb-4">
					Select which types of text messages you'd like to receive
				</p>

				<div class="space-y-3">
					<!-- Event Reminders Toggle -->
					<label
						class="flex items-start gap-3 cursor-pointer group p-3 bg-muted rounded-lg hover:bg-accent/10 transition-colors"
					>
						<input
							type="checkbox"
							bind:checked={smsPreferences.eventReminders}
							class="mt-1 w-5 h-5 text-accent rounded border-border focus:ring-2 focus:ring-ring focus:ring-offset-0"
						/>
						<div class="flex-1">
							<div class="font-medium flex items-center gap-2 text-foreground">
								<Bell class="w-4 h-4" />
								Event Reminders
							</div>
							<p class="text-xs text-muted-foreground">15 minutes before events</p>
						</div>
					</label>

					<!-- Morning Kickoff Toggle -->
					<label
						class="flex items-start gap-3 cursor-pointer group p-3 bg-muted rounded-lg hover:bg-accent/10 transition-colors"
					>
						<input
							type="checkbox"
							bind:checked={smsPreferences.morningKickoff}
							class="mt-1 w-5 h-5 text-amber-600 rounded border-border focus:ring-2 focus:ring-ring focus:ring-offset-0"
						/>
						<div class="flex-1">
							<div class="font-medium flex items-center gap-2 text-foreground">
								<Sun class="w-4 h-4" />
								Morning Kickoff
							</div>
							<p class="text-xs text-muted-foreground">Daily at 8:00 AM</p>
						</div>
					</label>

					<!-- Evening Recap Toggle -->
					<label
						class="flex items-start gap-3 cursor-pointer group p-3 bg-muted rounded-lg hover:bg-accent/10 transition-colors"
					>
						<input
							type="checkbox"
							bind:checked={smsPreferences.eveningRecap}
							class="mt-1 w-5 h-5 text-indigo-600 rounded border-border focus:ring-2 focus:ring-ring focus:ring-offset-0"
						/>
						<div class="flex-1">
							<div class="font-medium flex items-center gap-2 text-foreground">
								<Moon class="w-4 h-4" />
								Evening Recap
							</div>
							<p class="text-xs text-muted-foreground">Daily at 8:00 PM</p>
						</div>
					</label>
				</div>

				{#if smsPreferences.eventReminders || smsPreferences.morningKickoff || smsPreferences.eveningRecap}
					<div
						class="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800"
					>
						<p
							class="text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2"
						>
							<CheckCircle2 class="w-4 h-4" />
							{[
								smsPreferences.eventReminders,
								smsPreferences.morningKickoff,
								smsPreferences.eveningRecap
							].filter(Boolean).length} notification type{[
								smsPreferences.eventReminders,
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

		<!-- Info Box -->
		<div class="p-4 bg-muted rounded-lg border border-border">
			<div class="flex gap-3">
				<Info class="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
				<div class="text-sm text-muted-foreground">
					<p class="font-medium text-foreground mb-1">You can change these anytime</p>
					<p>
						Update your notification preferences in Settings whenever you need. This
						step is completely optional.
					</p>
				</div>
			</div>
		</div>
	</div>

	<!-- Actions -->
	<div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mt-8">
		<Button
			variant="ghost"
			onclick={handleSkipSMS}
			disabled={isSaving}
			class="order-2 sm:order-1"
		>
			I'll set this up later
		</Button>

		<Button
			variant="primary"
			size="lg"
			onclick={saveAndContinue}
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
