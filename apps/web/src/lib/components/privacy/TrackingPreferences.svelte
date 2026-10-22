<!-- apps/web/src/lib/components/privacy/TrackingPreferences.svelte -->
<!--
  First visit shows a one-line bar so the page stays readable on a phone. "Choices" (or the
  footer's Privacy choices link) opens the full panel with per-tool switches.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		getBrowserPrivacySignal,
		getStoredTrackingPreferences,
		saveTrackingPreferences,
		TRACKING_PREFERENCES_OPEN_EVENT,
		type BrowserPrivacySignal
	} from '$lib/services/tracking-consent';

	let isOpen = $state(false);
	let showDetails = $state(false);
	let analytics = $state(false);
	let marketing = $state(false);
	let privacySignal = $state<BrowserPrivacySignal>(null);
	let panel = $state<HTMLElement | null>(null);

	const privacySignalLabel = $derived(
		privacySignal === 'global-privacy-control' ? 'Global Privacy Control' : 'Do Not Track'
	);

	function loadCurrentPreferences(): void {
		const stored = getStoredTrackingPreferences();
		privacySignal = getBrowserPrivacySignal();
		analytics = stored?.analytics ?? false;
		marketing = stored?.marketing ?? false;
	}

	async function openPreferences(event?: Event): Promise<void> {
		loadCurrentPreferences();
		showDetails = true;
		isOpen = true;

		if (event) {
			await tick();
			panel?.focus();
		}
	}

	async function showChoices(): Promise<void> {
		loadCurrentPreferences();
		showDetails = true;
		await tick();
		panel?.focus();
	}

	function persistPreferences(nextAnalytics: boolean, nextMarketing: boolean): void {
		if (privacySignal) {
			isOpen = false;
			return;
		}

		const saved = saveTrackingPreferences({
			analytics: nextAnalytics,
			marketing: nextMarketing
		});
		analytics = saved.analytics;
		marketing = saved.marketing;
		isOpen = false;
	}

	onMount(() => {
		loadCurrentPreferences();
		showDetails = false;
		isOpen = !getStoredTrackingPreferences() && !privacySignal;

		const handleOpen = (event: Event) => {
			void openPreferences(event);
		};
		window.addEventListener(TRACKING_PREFERENCES_OPEN_EVENT, handleOpen);

		return () => {
			window.removeEventListener(TRACKING_PREFERENCES_OPEN_EVENT, handleOpen);
		};
	});
</script>

{#if isOpen}
	<aside
		bind:this={panel}
		tabindex="-1"
		aria-label={showDetails ? undefined : 'Privacy choices'}
		aria-labelledby={showDetails ? 'tracking-preferences-title' : undefined}
		class="fixed inset-x-2 bottom-2 z-[10002] mx-auto max-h-[calc(100dvh-1rem)] max-w-3xl overflow-y-auto rounded-lg border border-border-strong bg-card shadow-ink-strong tx tx-frame tx-weak sm:inset-x-4 sm:bottom-4 {showDetails
			? 'p-4 sm:p-5'
			: 'px-3 pt-3 sm:px-4'}"
		style:padding-bottom={showDetails
			? 'max(1rem, env(safe-area-inset-bottom))'
			: 'max(0.75rem, env(safe-area-inset-bottom))'}
	>
		{#if !showDetails}
			<div
				class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
			>
				<p class="text-sm leading-snug text-muted-foreground">
					Optional analytics and ad measurement stay off until you choose.
					<a
						href="/privacy"
						class="whitespace-nowrap font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						Privacy policy
					</a>
				</p>
				<div class="flex shrink-0 items-center justify-end gap-2">
					<Button variant="ghost" size="sm" onclick={showChoices}>Choices</Button>
					<Button
						variant="outline"
						size="sm"
						onclick={() => persistPreferences(false, false)}
					>
						Necessary only
					</Button>
					<Button size="sm" onclick={() => persistPreferences(true, true)}>
						Accept all
					</Button>
				</div>
			</div>
		{:else}
			<div class="flex flex-col gap-4">
				<div class="min-w-0">
					<h2
						id="tracking-preferences-title"
						class="text-lg font-semibold text-foreground"
					>
						Choose what BuildOS can measure
					</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						BuildOS always uses essential storage for sign-in and preferences.
						Cookie-free, anonymous Vercel traffic and performance measurement also stays
						on. Optional tools load only after your choice.
					</p>
				</div>

				{#if privacySignal}
					<div class="rounded-md border border-info/30 bg-info/10 p-3">
						<p class="text-sm font-medium text-foreground">
							{privacySignalLabel} is active
						</p>
						<p class="mt-1 text-sm text-muted-foreground">
							Optional analytics and marketing tracking remain off while this browser
							signal is enabled.
						</p>
					</div>
				{:else}
					<div class="grid gap-2 sm:grid-cols-2">
						<label
							class="flex min-h-[72px] cursor-pointer items-start gap-3 rounded-md border border-border-strong bg-background p-3"
						>
							<input
								type="checkbox"
								bind:checked={analytics}
								class="mt-1 h-5 w-5 shrink-0 accent-[hsl(var(--accent))]"
							/>
							<span class="min-w-0">
								<span class="block text-sm font-semibold text-foreground"
									>Product analytics</span
								>
								<span class="mt-0.5 block text-xs text-muted-foreground">
									PostHog funnel events and one first-party daily visitor count.
								</span>
							</span>
						</label>

						<label
							class="flex min-h-[72px] cursor-pointer items-start gap-3 rounded-md border border-border-strong bg-background p-3"
						>
							<input
								type="checkbox"
								bind:checked={marketing}
								class="mt-1 h-5 w-5 shrink-0 accent-[hsl(var(--accent))]"
							/>
							<span class="min-w-0">
								<span class="block text-sm font-semibold text-foreground"
									>Marketing measurement</span
								>
								<span class="mt-0.5 block text-xs text-muted-foreground">
									Meta Pixel page views for ad attribution and campaign
									measurement.
								</span>
							</span>
						</label>
					</div>
				{/if}

				<div
					class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between"
				>
					<a
						href="/privacy"
						class="inline-flex min-h-[44px] items-center text-sm font-semibold text-muted-foreground underline decoration-border-strong underline-offset-4 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						Read the privacy policy
					</a>

					<div class="flex flex-col gap-2 sm:flex-row">
						{#if privacySignal}
							<Button variant="outline" size="sm" onclick={() => (isOpen = false)}
								>Done</Button
							>
						{:else}
							<Button
								variant="outline"
								size="sm"
								onclick={() => persistPreferences(false, false)}
							>
								Necessary only
							</Button>
							<Button
								variant="outline"
								size="sm"
								onclick={() => persistPreferences(analytics, marketing)}
							>
								Save choices
							</Button>
							<Button size="sm" onclick={() => persistPreferences(true, true)}
								>Accept all</Button
							>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</aside>
{/if}
