<!-- apps/web/src/routes/billing/activate/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { AlertCircle, CheckCircle2, LoaderCircle, Lock } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { requireApiData } from '$lib/utils/api-client-helpers';
	import Button from '$lib/components/ui/Button.svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';

	let { data }: { data: PageData } = $props();

	let isCheckoutLoading = $state(false);
	let isPolling = $state(false);
	let error = $state('');
	let statusMessage = $state('');
	let pollAttempts = $state(0);

	const MAX_POLL_ATTEMPTS = 15;
	const POLL_INTERVAL_MS = 2000;

	async function handleActivatePro() {
		isCheckoutLoading = true;
		error = '';
		statusMessage = '';

		try {
			const response = await fetch('/api/stripe/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					successPath: '/billing/activate?payment=success',
					cancelPath: '/billing/activate?payment=cancelled',
					source: 'consumption_activation'
				})
			});

			const result = await requireApiData<{ url?: string }>(
				response,
				'Failed to create checkout session'
			);

			if (result.url) {
				window.location.href = result.url;
				return;
			}

			error = 'Unable to start checkout. Please try again.';
			isCheckoutLoading = false;
		} catch (checkoutError) {
			error =
				checkoutError instanceof Error ? checkoutError.message : 'Failed to start checkout';
			isCheckoutLoading = false;
		}
	}

	async function pollForUnfreeze(): Promise<boolean> {
		try {
			const response = await fetch('/api/billing/context');
			const context = await requireApiData<any>(response, 'Failed to load billing context');
			const stillFrozen = Boolean(context?.consumptionGate?.is_frozen);

			if (!stillFrozen) {
				await goto('/projects?billing=activated', { replaceState: true });
				return true;
			}
		} catch (pollError) {
			console.error('Billing activation poll failed:', pollError);
		}

		return false;
	}

	onMount(() => {
		if (data.paymentState === 'cancelled') {
			statusMessage =
				'Checkout was cancelled. Your workspace remains read-only until activated.';
		}

		if (data.paymentState !== 'success') return;

		isPolling = true;
		statusMessage = 'Finalizing your subscription...';

		let cancelled = false;
		let intervalId: ReturnType<typeof setInterval> | null = null;

		const attemptPoll = async () => {
			if (cancelled) return;
			pollAttempts += 1;

			const completed = await pollForUnfreeze();
			if (completed || cancelled) {
				if (intervalId) clearInterval(intervalId);
				isPolling = false;
				return;
			}

			if (pollAttempts >= MAX_POLL_ATTEMPTS) {
				if (intervalId) clearInterval(intervalId);
				isPolling = false;
				statusMessage =
					'Subscription is processing. You can continue in read-only mode and refresh in a moment.';
			}
		};

		void attemptPoll();
		intervalId = setInterval(() => {
			void attemptPoll();
		}, POLL_INTERVAL_MS);

		return () => {
			cancelled = true;
			if (intervalId) clearInterval(intervalId);
		};
	});
</script>

<SEOHead
	title="Activate Billing - BuildOS"
	description="Activate billing to restore editing and AI generation."
	canonical="https://build-os.com/billing/activate"
/>

<div class="min-h-[70vh] flex items-center justify-center px-4 py-10">
	<section
		class="w-full max-w-2xl rounded-lg border border-border bg-card p-6 sm:p-8 shadow-ink tx tx-frame tx-weak"
		aria-labelledby="billing-activation-heading"
	>
		<div class="flex items-center gap-3 mb-4">
			<div class="rounded-full bg-warning/15 p-2 border border-warning/30">
				<Lock class="h-5 w-5 text-warning-foreground" />
			</div>
			<h1 id="billing-activation-heading" class="text-2xl font-semibold text-foreground">
				Activate Pro to Continue Editing
			</h1>
		</div>

		<p class="text-muted-foreground mb-6">
			Your workspace is safe and fully readable. Billing activation re-enables project edits
			and AI generation immediately.
		</p>

		<div class="rounded-md border border-border bg-muted/40 px-4 py-3 mb-6">
			<p class="text-sm text-muted-foreground">
				Plan: <span class="font-semibold text-foreground">$20/month Pro</span>
			</p>
			<p class="text-sm text-muted-foreground">
				Upgrades to higher tiers happen automatically with immediate proration when usage
				requires it.
			</p>
		</div>

		{#if statusMessage}
			<div class="mb-4 rounded-md border border-accent/30 bg-accent/10 px-4 py-3">
				<div class="flex items-start gap-2">
					{#if isPolling}
						<LoaderCircle class="h-4 w-4 mt-0.5 animate-spin text-accent" />
					{:else}
						<CheckCircle2 class="h-4 w-4 mt-0.5 text-accent" />
					{/if}
					<p class="text-sm text-foreground">{statusMessage}</p>
				</div>
			</div>
		{/if}

		{#if error}
			<div class="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3">
				<div class="flex items-start gap-2">
					<AlertCircle class="h-4 w-4 mt-0.5 text-destructive" />
					<p class="text-sm text-destructive">{error}</p>
				</div>
			</div>
		{/if}

		<div class="flex flex-col gap-3 sm:flex-row">
			{#if data.isConsumptionFrozen || !data.hasActiveSubscription}
				<Button
					onclick={handleActivatePro}
					disabled={isCheckoutLoading || isPolling}
					loading={isCheckoutLoading}
					variant="primary"
					size="lg"
				>
					Activate Pro
				</Button>
			{:else}
				<a
					href="/projects?billing=activated"
					class="inline-flex items-center justify-center rounded-md border border-accent bg-accent px-4 py-2.5 font-semibold text-accent-foreground shadow-ink hover:opacity-95"
				>
					Continue to Workspace
				</a>
			{/if}

			<a
				href="/projects"
				class="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2.5 font-semibold text-foreground shadow-ink hover:bg-muted"
			>
				View Workspace (Read-only)
			</a>
		</div>
	</section>
</div>
