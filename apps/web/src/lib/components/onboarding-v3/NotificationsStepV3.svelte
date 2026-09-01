<!-- apps/web/src/lib/components/onboarding-v3/NotificationsStepV3.svelte -->
<script lang="ts">
	import { Bell, Mail, MessageSquare, CheckCircle2 } from '$lib/icons/lucide';
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
				class="flex h-14 w-14 items-center justify-center rounded-lg bg-muted shadow-ink tx tx-bloom tx-weak"
			>
				<Bell class="w-7 h-7 text-accent" />
			</div>
		</div>
		<h1 class="text-3xl sm:text-4xl font-bold text-foreground mb-3">Want daily check-ins?</h1>
		<p class="text-lg text-muted-foreground">
			One brief each morning with what actually matters today — so nothing falls through.
			Change this anytime.
		</p>
	</div>

	<div class="space-y-4 mb-8">
		<!-- Email toggle -->
		<label
			class="relative flex cursor-pointer items-center gap-4 overflow-hidden rounded-lg border-2 p-5 tx tx-frame tx-weak pressable
				{wantEmail
				? 'border-accent bg-accent/5 shadow-ink-strong'
				: 'border-border bg-card shadow-ink hover:border-accent/50'}"
		>
			<div
				class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
					{wantEmail ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground'}"
			>
				<Mail class="w-5 h-5" />
			</div>
			<div class="relative min-w-0 flex-1">
				<div class="font-semibold text-foreground">Email Daily Brief</div>
				<p class="text-sm text-muted-foreground">
					A morning email with what matters today — even on the projects you forgot about
				</p>
			</div>
			<input
				type="checkbox"
				bind:checked={wantEmail}
				class="relative h-5 w-5 shrink-0 rounded border-border text-accent focus:ring-2 focus:ring-ring"
			/>
		</label>

		<!-- SMS toggle -->
		<label
			class="relative flex cursor-pointer items-center gap-4 overflow-hidden rounded-lg border-2 p-5 tx tx-frame tx-weak pressable
				{wantSMS
				? 'border-accent bg-accent/5 shadow-ink-strong'
				: 'border-border bg-card shadow-ink hover:border-accent/50'}"
		>
			<div
				class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
					{wantSMS ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground'}"
			>
				<MessageSquare class="w-5 h-5" />
			</div>
			<div class="relative min-w-0 flex-1">
				<div class="font-semibold text-foreground">SMS Notifications</div>
				<p class="text-sm text-muted-foreground">
					Text message reminders for events and morning check-ins
				</p>
			</div>
			<input
				type="checkbox"
				bind:checked={wantSMS}
				class="relative h-5 w-5 shrink-0 rounded border-border text-accent focus:ring-2 focus:ring-ring"
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
		<div class="mb-8 rounded-lg border border-success/30 bg-success/10 p-4">
			<p class="flex items-center gap-2 text-sm text-foreground">
				<CheckCircle2 class="h-4 w-4 shrink-0 text-success" />
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
				class="order-1 flex-1 shadow-ink-strong sm:order-2 sm:min-w-[200px] sm:flex-initial"
			>
				{isSaving ? 'Saving...' : 'Continue'}
			</Button>
		{:else}
			<Button
				variant="primary"
				size="lg"
				onclick={skip}
				class="order-1 flex-1 shadow-ink-strong sm:order-2 sm:min-w-[200px] sm:flex-initial"
			>
				Continue
			</Button>
		{/if}
	</div>
</div>
