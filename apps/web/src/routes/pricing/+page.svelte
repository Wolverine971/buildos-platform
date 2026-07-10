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
	<section class="py-20 bg-muted" aria-labelledby="pricing-heading">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="text-center mb-16">
				<div class="flex justify-center mb-6">
					<div
						class="flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-card shadow-ink"
					>
						<img
							src={DEFAULT_APP_ICON_URL}
							alt="BuildOS Icon"
							class="w-12 h-12"
							width="48"
							height="48"
							decoding="async"
						/>
					</div>
				</div>
				<h1
					id="pricing-heading"
					class="text-4xl md:text-5xl font-bold text-foreground mb-6"
				>
					Simple, <span class="text-accent">Transparent</span> Pricing
				</h1>
				<p class="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
					{billingIsLive
						? 'Start with a 14-day free trial. No credit card required, cancel anytime.'
						: 'Planned Pro pricing for when paid billing launches. You can create an account today without being charged.'}
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
			<div class="max-w-md mx-auto" role="region" aria-label="Pricing plan">
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

					<div class="text-center mb-8">
						<h2 id="pro-plan-heading" class="text-2xl font-bold text-foreground mb-2">
							BuildOS Pro
						</h2>
						<p class="text-muted-foreground mb-6">
							{billingIsLive
								? 'Your thinking environment for complex work'
								: 'Planned pricing for the future paid plan'}
						</p>
						{#if !billingIsLive}
							<p class="micro-label mb-2 text-info">Planned price</p>
						{/if}
						<div class="text-4xl font-bold text-foreground mb-2">
							$20
							<span class="text-lg font-normal text-muted-foreground">/month</span>
						</div>
						<p class="text-sm text-muted-foreground">
							{billingIsLive
								? 'Billed monthly • 14-day free trial'
								: 'No billing or automatic charges today'}
						</p>
					</div>

					<ul class="space-y-3 mb-8" role="list" aria-label="Plan features">
						<li class="flex items-center">
							<Check
								class="w-5 h-5 text-accent mr-3 flex-shrink-0"
								aria-hidden="true"
							/>
							<span class="text-muted-foreground">Unlimited projects</span>
						</li>
						<li class="flex items-center">
							<Check
								class="w-5 h-5 text-accent mr-3 flex-shrink-0"
								aria-hidden="true"
							/>
							<span class="text-muted-foreground">Persistent project context</span>
						</li>
						<li class="flex items-center">
							<Check
								class="w-5 h-5 text-accent mr-3 flex-shrink-0"
								aria-hidden="true"
							/>
							<span class="text-muted-foreground">Structured tasks and plans</span>
						</li>
						<li class="flex items-center">
							<Check
								class="w-5 h-5 text-accent mr-3 flex-shrink-0"
								aria-hidden="true"
							/>
							<span class="text-muted-foreground">Daily project-aware briefs</span>
						</li>
						<li class="flex items-center">
							<Check
								class="w-5 h-5 text-accent mr-3 flex-shrink-0"
								aria-hidden="true"
							/>
							<span class="text-muted-foreground">Goal-task alignment tracking</span>
						</li>
						<li class="flex items-center">
							<Check
								class="w-5 h-5 text-accent mr-3 flex-shrink-0"
								aria-hidden="true"
							/>
							<span class="text-muted-foreground">Priority email support</span>
						</li>
						<li class="flex items-center">
							<Check
								class="w-5 h-5 text-accent mr-3 flex-shrink-0"
								aria-hidden="true"
							/>
							<span class="text-muted-foreground">Calendar integrations</span>
						</li>
						<li class="flex items-center">
							<Check
								class="w-5 h-5 text-accent mr-3 flex-shrink-0"
								aria-hidden="true"
							/>
							<span class="text-muted-foreground">Data export</span>
						</li>
					</ul>

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
	<section class="py-20 bg-card">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="text-center mb-16">
				<h2 class="text-4xl font-bold text-foreground mb-6">
					Frequently Asked <span class="text-accent">Questions</span>
				</h2>
			</div>

			<div class="space-y-8" role="region" aria-label="Frequently asked questions">
				{#if billingIsLive}
					<article
						class="bg-muted rounded-lg p-8 border border-border tx tx-frame tx-weak"
					>
						<h3 class="text-xl font-semibold text-foreground mb-4">
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
						class="bg-muted rounded-lg p-8 border border-border tx tx-frame tx-weak"
					>
						<h3 class="text-xl font-semibold text-foreground mb-4">
							Do I need a credit card to start?
						</h3>
						<p class="text-muted-foreground">
							No. You can start your 14-day trial without entering payment
							information. You'll only need to add a payment method when you're ready
							to subscribe.
						</p>
					</article>

					<article
						class="bg-muted rounded-lg p-8 border border-border tx tx-frame tx-weak"
					>
						<h3 class="text-xl font-semibold text-foreground mb-4">
							What happens to my data if I cancel?
						</h3>
						<p class="text-muted-foreground">
							You can export all your data at any time. After cancellation, your data
							remains accessible for 30 days before being permanently deleted.
						</p>
					</article>

					<article
						class="bg-muted rounded-lg p-8 border border-border tx tx-frame tx-weak"
					>
						<h3 class="text-xl font-semibold text-foreground mb-4">
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
						class="bg-muted rounded-lg p-8 border border-border tx tx-frame tx-weak"
					>
						<h3 class="text-xl font-semibold text-foreground mb-4">
							Are you charging for BuildOS today?
						</h3>
						<p class="text-muted-foreground">
							No. Paid billing is not active, and creating an account will not charge
							you.
						</p>
					</article>

					<article
						class="bg-muted rounded-lg p-8 border border-border tx tx-frame tx-weak"
					>
						<h3 class="text-xl font-semibold text-foreground mb-4">
							What will BuildOS Pro cost?
						</h3>
						<p class="text-muted-foreground">
							The planned price is $20 per month when paid billing launches. This page
							is the current reference for that future plan.
						</p>
					</article>

					<article
						class="bg-muted rounded-lg p-8 border border-border tx tx-frame tx-weak"
					>
						<h3 class="text-xl font-semibold text-foreground mb-4">
							Will BuildOS start charging me automatically later?
						</h3>
						<p class="text-muted-foreground">
							No. Paid access will require clear notice and an explicit checkout step.
							An account alone does not create a paid subscription.
						</p>
					</article>

					<article
						class="bg-muted rounded-lg p-8 border border-border tx tx-frame tx-weak"
					>
						<h3 class="text-xl font-semibold text-foreground mb-4">
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
	<section class="py-20 bg-accent text-accent-foreground">
		<div class="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
			<h2 class="text-4xl font-bold mb-6">
				{billingIsLive
					? 'Ready to turn messy thinking into structured work?'
					: 'Start building before paid billing begins.'}
			</h2>
			<p class="text-xl opacity-90 mb-12">
				{billingIsLive
					? 'Start your 14-day free trial today. No credit card required.'
					: 'Create an account today. There is no active subscription or automatic charge.'}
			</p>

			<div class="flex justify-center">
				<a
					href="/auth/register"
					class="inline-flex items-center px-8 py-4 text-lg font-semibold bg-card text-foreground hover:opacity-90 rounded-lg shadow-ink transform hover:scale-105 motion-reduce:hover:scale-100 transition-all duration-200 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-accent"
				>
					<Brain class="w-5 h-5 mr-3" aria-hidden="true" />
					{billingIsLive ? 'Start Free Trial' : 'Create free account'}
				</a>
			</div>
		</div>
	</section>
</div>
