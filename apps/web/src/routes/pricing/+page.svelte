<!-- apps/web/src/routes/pricing/+page.svelte -->
<script lang="ts">
	import { AlertCircle, Brain, Check } from '$lib/icons/lucide';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import Button from '$lib/components/ui/Button.svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import {
		DEFAULT_APP_ICON_URL,
		DEFAULT_ORGANIZATION_ID,
		DEFAULT_SOCIAL_IMAGE_OBJECT,
		SITE_NAME,
		SITE_URL
	} from '$lib/constants/seo';
	import { requireApiData } from '$lib/utils/api-client-helpers';

	let { data }: { data: PageData } = $props();

	let isLoading = $state(false);
	let error = $state('');
	let billingIsLive = $derived(Boolean(data.stripeEnabled));
	let pricingDescription = $derived(
		billingIsLive
			? 'Choose the BuildOS plan. Start with a 14-day free trial, then keep turning messy thinking into structured projects with memory for $20/month.'
			: 'Review the planned BuildOS Pro price. Billing is not active yet, and creating an account will not charge you.'
	);

	const coreFeatures = [
		'Persistent project context',
		'Unlimited projects',
		'Structured tasks and plans',
		'Daily project-aware briefs',
		'Goal-task alignment tracking'
	] as const;

	const includedFeatures = [
		'Calendar integrations',
		'Data export',
		'Priority email support'
	] as const;

	async function handleSubscribe() {
		if (!data.user) {
			goto('/auth/register');
			return;
		}

		if (data.hasActiveSubscription) {
			goto('/profile?tab=billing');
			return;
		}

		isLoading = true;
		error = '';

		try {
			const response = await fetch('/api/stripe/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			const result = await requireApiData<{ url?: string }>(
				response,
				'Failed to create checkout session'
			);

			if (result.url) {
				window.location.href = result.url;
			}
		} catch (err) {
			// Subscription error
			error = err instanceof Error ? err.message : 'Failed to start subscription';
			isLoading = false;
		}
	}
</script>

<SEOHead
	title="Pricing - BuildOS | Thinking Environment for Complex Work"
	description={pricingDescription}
	canonical="https://build-os.com/pricing"
	keywords="BuildOS pricing, thinking environment pricing, project memory, structured work, project organization"
	jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'Product',
		name: 'BuildOS Pro',
		description: billingIsLive
			? 'Thinking environment for complex work with a 14-day free trial.'
			: 'Thinking environment for complex work. Paid billing is not active yet.',
		url: `${SITE_URL}/pricing`,
		image: DEFAULT_SOCIAL_IMAGE_OBJECT,
		brand: {
			'@type': 'Organization',
			'@id': DEFAULT_ORGANIZATION_ID,
			name: SITE_NAME,
			url: SITE_URL
		},
		...(billingIsLive
			? {
					offers: {
						'@type': 'Offer',
						price: '20.00',
						priceCurrency: 'USD',
						url: `${SITE_URL}/pricing`,
						availability: 'https://schema.org/InStock'
					}
				}
			: {})
	}}
/>

<div class="min-h-screen bg-background">
	<!-- Hero Section -->
	<section
		class="border-b border-border bg-muted py-12 sm:py-16"
		aria-labelledby="pricing-heading"
	>
		<div class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6">
			<div class="mx-auto mb-10 max-w-3xl text-center sm:mb-12">
				<div class="mb-5 flex justify-center">
					<div
						class="flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-card shadow-ink"
					>
						<img
							src={DEFAULT_APP_ICON_URL}
							alt=""
							class="h-10 w-10"
							width="40"
							height="40"
							decoding="async"
						/>
					</div>
				</div>
				<h1
					id="pricing-heading"
					class="mb-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
				>
					Simple, transparent pricing
				</h1>
				<p
					class="mx-auto max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
				>
					{billingIsLive
						? 'Start with a 14-day free trial. No credit card required, cancel anytime.'
						: 'Review the planned Pro plan before paid billing launches.'}
				</p>

				{#if error}
					<div class="max-w-md mx-auto mb-8" role="alert" aria-live="polite">
						<div class="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
							<div class="flex min-w-0 items-center gap-2">
								<AlertCircle
									class="h-5 w-5 shrink-0 text-destructive"
									aria-hidden="true"
								/>
								<p class="min-w-0 break-words text-destructive">{error}</p>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Pricing Card -->
			<div class="mx-auto max-w-md" role="region" aria-label="Pricing plan">
				<!-- BuildOS Pro -->
				<article
					class="border border-border bg-card shadow-ink p-6 sm:p-8 relative tx tx-frame tx-weak wt-card"
					aria-labelledby="pro-plan-heading"
				>
					{#if !billingIsLive}
						<div class="absolute -top-3 left-1/2 -translate-x-1/2">
							<span
								class="whitespace-nowrap rounded-full border border-info/30 bg-card px-3 py-1 text-sm font-semibold text-info shadow-ink"
							>
								Billing not live yet
							</span>
						</div>
					{:else if data.trialStatus?.is_in_trial}
						<!-- Trial Badge -->
						<div class="absolute -top-3 left-1/2 transform -translate-x-1/2">
							<span
								class="bg-accent text-accent-foreground px-3 py-1 rounded-full text-sm font-semibold shadow-ink"
							>
								{data.trialStatus.days_until_trial_end} Days Left in Trial
							</span>
						</div>
					{/if}

					<div class="mb-7 text-center">
						<h2 id="pro-plan-heading" class="text-2xl font-bold text-foreground mb-2">
							BuildOS Pro
						</h2>
						<p class="mb-5 text-muted-foreground">
							Your thinking environment for complex work
						</p>
						<div class="text-4xl font-bold text-foreground mb-2">
							$20
							<span class="text-lg font-normal text-muted-foreground">/month</span>
						</div>
						<p class="text-sm text-muted-foreground">
							{billingIsLive
								? 'Billed monthly • 14-day free trial'
								: 'Planned price • no billing or automatic charges today'}
						</p>
					</div>

					<ul class="mb-6 space-y-3" role="list" aria-label="Core plan features">
						{#each coreFeatures as feature (feature)}
							<li class="flex min-w-0 items-center gap-3">
								<Check class="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
								<span class="min-w-0 text-foreground">{feature}</span>
							</li>
						{/each}
					</ul>

					<div class="mb-7 border-t border-border pt-5">
						<p class="micro-label mb-3">Also included</p>
						<p class="text-sm leading-relaxed text-muted-foreground">
							{includedFeatures.join(' · ')}
						</p>
					</div>

					{#if !data.stripeEnabled}
						<Button
							onclick={() => goto('/auth/register')}
							variant="primary"
							size="lg"
							fullWidth
						>
							Create free account
						</Button>
					{:else if data.hasActiveSubscription}
						<a
							href="/profile?tab=billing"
							class="w-full bg-accent hover:opacity-90 text-accent-foreground py-3 px-6 rounded-lg font-semibold transition-colors text-center block shadow-ink pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						>
							Manage Subscription
						</a>
					{:else}
						<Button
							onclick={handleSubscribe}
							disabled={isLoading}
							loading={isLoading}
							variant="primary"
							size="lg"
							fullWidth
						>
							{#if isLoading}
								Processing...
							{:else if data.user}
								{data.trialStatus?.is_in_trial
									? 'Subscribe Now'
									: 'Start Free Trial'}
							{:else}
								Start 14-Day Free Trial
							{/if}
						</Button>
					{/if}
				</article>
			</div>
		</div>
	</section>

	<!-- FAQ -->
	<section class="border-b border-border bg-card py-12 sm:py-16">
		<div class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6">
			<div class="mb-8 text-center sm:mb-10">
				<h2 class="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
					Frequently asked questions
				</h2>
			</div>

			<div
				class="mx-auto grid max-w-5xl gap-4 md:grid-cols-2"
				role="region"
				aria-label="Frequently asked questions"
			>
				{#if billingIsLive}
					<article
						class="rounded-lg border border-border bg-muted p-5 tx tx-frame tx-weak sm:p-6"
					>
						<h3 class="mb-2 text-lg font-semibold text-foreground">
							What happens after my 14-day trial?
						</h3>
						<p class="text-muted-foreground">
							After your trial ends, you'll have a 7-day grace period to subscribe.
							During this time, your account will be in read-only mode — you can view
							all your data but cannot create or edit content. Subscribe anytime to
							regain full access.
						</p>
					</article>

					<article
						class="rounded-lg border border-border bg-muted p-5 tx tx-frame tx-weak sm:p-6"
					>
						<h3 class="mb-2 text-lg font-semibold text-foreground">
							Do I need a credit card to start?
						</h3>
						<p class="text-muted-foreground">
							No. You can start your 14-day trial without entering payment
							information. You'll only need to add a payment method when you're ready
							to subscribe.
						</p>
					</article>

					<article
						class="rounded-lg border border-border bg-muted p-5 tx tx-frame tx-weak sm:p-6"
					>
						<h3 class="mb-2 text-lg font-semibold text-foreground">
							What happens to my data if I cancel?
						</h3>
						<p class="text-muted-foreground">
							Canceling a subscription stops renewal but does not delete your account;
							the account switches to read-only after paid access ends. If you
							separately choose Delete Account, access ends immediately and
							active-system account data is permanently deleted within 30 days.
						</p>
					</article>

					<article
						class="rounded-lg border border-border bg-muted p-5 tx tx-frame tx-weak sm:p-6"
					>
						<h3 class="mb-2 text-lg font-semibold text-foreground">
							Can I cancel anytime?
						</h3>
						<p class="text-muted-foreground">
							Yes. You can cancel from your profile settings and keep access through
							the end of the billing period. Your account then switches to read-only
							mode.
						</p>
					</article>
				{:else}
					<article
						class="rounded-lg border border-border bg-muted p-5 tx tx-frame tx-weak sm:p-6"
					>
						<h3 class="mb-2 text-lg font-semibold text-foreground">
							Are you charging for BuildOS today?
						</h3>
						<p class="text-muted-foreground">
							No. Paid billing is not active, and creating an account will not charge
							you.
						</p>
					</article>

					<article
						class="rounded-lg border border-border bg-muted p-5 tx tx-frame tx-weak sm:p-6"
					>
						<h3 class="mb-2 text-lg font-semibold text-foreground">
							What will BuildOS Pro cost?
						</h3>
						<p class="text-muted-foreground">
							The planned price is $20 per month when paid billing launches. This page
							is the current reference for that future plan.
						</p>
					</article>

					<article
						class="rounded-lg border border-border bg-muted p-5 tx tx-frame tx-weak sm:p-6"
					>
						<h3 class="mb-2 text-lg font-semibold text-foreground">
							Will BuildOS start charging me automatically later?
						</h3>
						<p class="text-muted-foreground">
							No. Paid access will require clear notice and an explicit checkout step.
							An account alone does not create a paid subscription.
						</p>
					</article>

					<article
						class="rounded-lg border border-border bg-muted p-5 tx tx-frame tx-weak sm:p-6"
					>
						<h3 class="mb-2 text-lg font-semibold text-foreground">
							Can I start using BuildOS now?
						</h3>
						<p class="text-muted-foreground">
							Yes. Create an account and start building projects now. We'll
							communicate before paid billing becomes part of the product.
						</p>
					</article>
				{/if}
			</div>
		</div>
	</section>

	<!-- Final CTA -->
	<section class="bg-muted py-12 sm:py-16">
		<div class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6">
			<div class="mx-auto max-w-4xl text-center">
				<h2 class="mb-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
					{billingIsLive
						? 'Ready to turn messy thinking into structured work?'
						: 'Start building before paid billing begins.'}
				</h2>
				<p
					class="mx-auto mb-7 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
				>
					{billingIsLive
						? 'Start your 14-day free trial today. No credit card required.'
						: 'Create an account today. There is no active subscription or automatic charge.'}
				</p>

				<div class="flex justify-center">
					<a
						href="/auth/register"
						class="pressable inline-flex min-h-12 items-center rounded-lg border border-accent bg-accent px-6 py-3 text-base font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
					>
						<Brain class="w-5 h-5 mr-3" aria-hidden="true" />
						{billingIsLive ? 'Start Free Trial' : 'Create free account'}
					</a>
				</div>
			</div>
		</div>
	</section>
</div>
