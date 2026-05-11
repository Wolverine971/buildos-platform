<!-- apps/web/src/lib/components/onboarding-v3/NotificationsStepV3.svelte -->
<script lang="ts">
	import { Bell, Mail, MessageSquare, CheckCircle2 } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import PhoneVerificationCard from '$lib/components/onboarding-v2/PhoneVerificationCard.svelte';
	import { toastService } from '$lib/stores/toast.store';

	interface Props {
		userId: string;
		onNext: () => void;
		onSMSEnabled?: (enabled: boolean) => void;
		onEmailEnabled?: (enabled: boolean) => void;
	}

	let { userId, onNext, onSMSEnabled, onEmailEnabled }: Props = $props();

	let wantEmail = $state(false);
	let wantSMS = $state(false);
	let phoneVerified = $state(false);
	let isSaving = $state(false);

	const hasAnySelection = $derived(wantEmail || wantSMS);

	function handlePhoneVerified(_phoneNumber: string) {
		phoneVerified = true;
		toastService.success('Phone verified!');
	}

	async function skip() {
		onSMSEnabled?.(false);
		onEmailEnabled?.(false);
		onNext();
	}

	async function saveAndContinue() {
		isSaving = true;

		try {
			// Save email preferences
			if (wantEmail) {
				const emailResponse = await fetch('/api/notification-preferences', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ should_email_daily_brief: true })
				});
				if (!emailResponse.ok) {
					console.error('Failed to save email preferences');
				}
			}

			// Save SMS preferences (if verified)
			if (wantSMS && phoneVerified) {
				// Enable default SMS options: event reminders + morning kickoff
				const smsResponse = await fetch('/api/sms/preferences', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						event_reminders_enabled: true,
						morning_kickoff_enabled: true,
						evening_recap_enabled: false
					})
				});

				const smsResult = await smsResponse.json();
				if (!smsResult?.success) {
					console.error('Failed to save SMS preferences');
				}

				// Enable daily brief SMS
				await fetch('/api/notification-preferences', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ should_sms_daily_brief: true })
				});
			}

			onEmailEnabled?.(wantEmail);
			onSMSEnabled?.(wantSMS && phoneVerified);
			onNext();
		} catch (error) {
			console.error('Failed to save notification preferences:', error);
			toastService.error('Failed to save preferences. Continuing anyway.');
			onEmailEnabled?.(false);
			onSMSEnabled?.(false);
			onNext();
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="max-w-xl mx-auto px-4 py-8 sm:py-12">
	<div class="text-center mb-10">
		<div class="flex justify-center mb-5">
			<div
				class="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center shadow-ink tx tx-bloom tx-weak"
			>
				<Bell class="w-7 h-7 text-accent" />
			</div>
		</div>
		<h1 class="text-3xl sm:text-4xl font-bold text-foreground mb-3">Want daily check-ins?</h1>
		<p class="text-lg text-muted-foreground">
			Stay on track with a morning summary. You can change this anytime.
		</p>
	</div>

	<div class="space-y-4 mb-8">
		<!-- Email toggle -->
		<label
			class="flex items-center gap-4 p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 pressable
				{wantEmail
				? 'border-accent bg-accent/5 shadow-ink-strong'
				: 'border-border bg-card shadow-ink hover:border-accent/50'}"
		>
			<div class="tx tx-frame tx-weak rounded-xl absolute inset-0 pointer-events-none"></div>
			<div
				class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
					{wantEmail ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground'}"
			>
				<Mail class="w-5 h-5" />
			</div>
			<div class="flex-1">
				<div class="font-semibold text-foreground">Email Daily Brief</div>
				<p class="text-sm text-muted-foreground">
					A morning email with your tasks, events, and priorities
				</p>
			</div>
			<input
				type="checkbox"
				bind:checked={wantEmail}
				class="w-5 h-5 text-accent rounded border-border focus:ring-2 focus:ring-ring"
			/>
		</label>

		<!-- SMS toggle -->
		<label
			class="flex items-center gap-4 p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 pressable
				{wantSMS
				? 'border-accent bg-accent/5 shadow-ink-strong'
				: 'border-border bg-card shadow-ink hover:border-accent/50'}"
		>
			<div class="tx tx-frame tx-weak rounded-xl absolute inset-0 pointer-events-none"></div>
			<div
				class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
					{wantSMS ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground'}"
			>
				<MessageSquare class="w-5 h-5" />
			</div>
			<div class="flex-1">
				<div class="font-semibold text-foreground">SMS Notifications</div>
				<p class="text-sm text-muted-foreground">
					Text message reminders for events and morning check-ins
				</p>
			</div>
			<input
				type="checkbox"
				bind:checked={wantSMS}
				class="w-5 h-5 text-accent rounded border-border focus:ring-2 focus:ring-ring"
			/>
		</label>
	</div>

	<!-- Phone verification (inline when SMS selected) -->
	{#if wantSMS && !phoneVerified}
		<div class="mb-8">
			<PhoneVerificationCard
				{userId}
				onVerified={handlePhoneVerified}
				onSkip={() => (wantSMS = false)}
			/>
		</div>
	{/if}

	{#if wantSMS && phoneVerified}
		<div class="mb-8 p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
			<p class="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
				<CheckCircle2 class="w-4 h-4" />
				Phone verified — you'll get event reminders and morning check-ins by text
			</p>
		</div>
	{/if}

	<!-- Actions -->
	<div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
		<Button variant="ghost" onclick={skip} disabled={isSaving} class="order-2 sm:order-1">
			Skip for now
		</Button>

		{#if hasAnySelection}
			<Button
				variant="primary"
				size="lg"
				onclick={saveAndContinue}
				loading={isSaving}
				disabled={isSaving || (wantSMS && !phoneVerified)}
				class="flex-1 sm:flex-initial min-w-[200px] order-1 sm:order-2 shadow-ink-strong pressable"
			>
				{isSaving ? 'Saving...' : 'Continue'}
			</Button>
		{:else}
			<Button
				variant="primary"
				size="lg"
				onclick={skip}
				class="flex-1 sm:flex-initial min-w-[200px] order-1 sm:order-2 shadow-ink-strong pressable"
			>
				Continue
			</Button>
		{/if}
	</div>
</div>
