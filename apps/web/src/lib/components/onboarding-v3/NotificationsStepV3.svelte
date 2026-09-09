<!-- apps/web/src/lib/components/onboarding-v3/NotificationsStepV3.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Bell, Mail, MessageSquare, CheckCircle2 } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import PhoneVerificationCard from '$lib/components/onboarding-v2/PhoneVerificationCard.svelte';
	import {
		loadOnboardingNotifications,
		saveOnboardingNotifications,
		type OnboardingNotifications
	} from '$lib/services/onboarding-notifications';

	interface Props {
		userId: string;
		onNext: () => void | Promise<void>;
		onSMSEnabled?: (enabled: boolean) => void;
		onEmailEnabled?: (enabled: boolean) => void;
	}
	let { userId, onNext, onSMSEnabled, onEmailEnabled }: Props = $props();
	let wantEmail = $state(false);
	let wantSMS = $state(false);
	let phoneVerified = $state(false);
	let isSaving = $state(false);
	let isLoading = $state(true);
	let loadError = $state(false);
	let errors = $state<string[]>([]);
	let saved = $state<OnboardingNotifications | null>(null);
	let savedConfirmed = $state(true);
	const hasAnySelection = $derived(wantEmail || wantSMS);

	onMount(() => {
		void loadPreferences();
	});

	async function loadPreferences() {
		isLoading = true;
		loadError = false;
		try {
			saved = await loadOnboardingNotifications();
			wantEmail = saved.emailEnabled;
			wantSMS = saved.smsEnabled;
			phoneVerified = saved.phoneVerified;
		} catch {
			loadError = true;
		} finally {
			isLoading = false;
		}
	}

	function handlePhoneVerified(_phoneNumber: string) {
		phoneVerified = true;
		if (saved) saved.phoneVerified = true;
	}

	async function continueWithSaved() {
		if (!saved || !savedConfirmed || isSaving) return;
		isSaving = true;
		try {
			onEmailEnabled?.(saved.emailEnabled);
			onSMSEnabled?.(saved.smsEnabled);
			await onNext();
		} finally {
			isSaving = false;
		}
	}

	async function saveAndContinue() {
		if (!saved || isSaving || (wantSMS && !phoneVerified)) return;
		if (!errors.length && !wantEmail && !wantSMS && !saved.emailEnabled && !saved.smsEnabled) {
			await continueWithSaved();
			return;
		}
		isSaving = true;
		errors = [];
		try {
			const result = await saveOnboardingNotifications(
				{ email: wantEmail, sms: wantSMS },
				saved
			);
			saved = result.saved;
			savedConfirmed = result.confirmed;
			errors = result.errors;
			if (errors.length) return;
			onEmailEnabled?.(saved.emailEnabled);
			onSMSEnabled?.(saved.smsEnabled);
			await onNext();
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

	{#if isLoading}
		<p class="py-8 text-center text-sm text-muted-foreground" role="status">
			Loading your saved preferences…
		</p>
	{:else if loadError}
		<div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4" role="alert">
			<p class="mb-3 text-sm text-foreground">
				Your notification settings couldn’t be loaded. Retry to keep your existing choices.
			</p>
			<Button variant="outline" onclick={loadPreferences}>Retry</Button>
		</div>
	{:else}
		<fieldset disabled={isSaving} class="space-y-4 mb-8">
			<legend class="sr-only">Optional notifications</legend>
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
						A morning email with what matters today — even on the projects you forgot
						about
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
		</fieldset>

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
					Phone verified — save below to confirm your text preferences.
				</p>
			</div>
		{/if}

		{#if errors.length > 0}
			<div
				class="mb-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm"
				role="alert"
			>
				<p class="font-semibold text-foreground">Some preferences still need attention</p>
				<ul class="mt-2 space-y-1 text-foreground">
					{#each errors as message (message)}<li>{message}</li>{/each}
				</ul>
				<p class="mt-3 text-muted-foreground">
					{savedConfirmed ? 'Saved' : 'Last confirmed'}: email {saved?.emailEnabled
						? 'on'
						: 'off'} · text reminders {saved?.smsRemindersEnabled ? 'on' : 'off'} · brief
					texts {saved?.smsBriefEnabled ? 'on' : 'off'}.
				</p>
			</div>
		{/if}
		<div class="flex flex-col items-stretch gap-3 sm:items-center">
			<Button
				variant="primary"
				size="lg"
				onclick={saveAndContinue}
				loading={isSaving}
				disabled={isSaving || (wantSMS && !phoneVerified)}
				class="w-full sm:w-auto sm:min-w-[240px]"
			>
				{isSaving
					? 'Saving your choices…'
					: errors.length
						? 'Retry saving preferences'
						: hasAnySelection
							? 'Save and continue'
							: 'Continue without notifications'}
			</Button>
			{#if hasAnySelection || errors.length}
				<Button
					variant="ghost"
					onclick={continueWithSaved}
					disabled={isSaving || !savedConfirmed}>Continue with saved settings</Button
				>
			{/if}
		</div>
	{/if}
</div>
