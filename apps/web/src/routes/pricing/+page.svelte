<!-- apps/web/src/routes/pricing/+page.svelte -->
<script lang="ts">
	import { Check, Brain, AlertCircle } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import Button from '$lib/components/ui/Button.svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import { requireApiData } from '$lib/utils/api-client-helpers';

	export let data: PageData;

	let isAnnual = false; // Currently only monthly is supported
	let showComparison = false;
	let isLoading = false;
	let error = '';

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
	title="Pricing - BuildOS | AI-Powered Productivity Plans"
	description="Choose the perfect BuildOS plan. Start free or unlock unlimited AI-powered organization for $12/month. 14-day free trial, no credit card required."
	canonical="https://build-os.com/pricing"
	keywords="BuildOS pricing, productivity app pricing, AI task management cost, project management pricing, brain dump app plans"
	jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'Product',
		name: 'BuildOS Pro',
		description: 'AI-powered project organization platform',
		offers: {
			'@type': 'Offer',
			price: '12.00',
			priceCurrency: 'USD',
			availability: 'https://schema.org/InStock'
		}
	}}
/>

<div class="min-h-screen bg-background">
	<!-- Hero Section -->
	<section class="py-20 bg-muted" aria-labelledby="pricing-heading">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="text-center mb-16">
				<div class="flex justify-center mb-6">
					<div
						class="rounded-lg border border-border bg-card shadow-ink w-16 h-16 rounded-sm flex items-center justify-center"
					>
						<img src="/brain-bolt.png" alt="BuildOS Icon" class="w-12 h-12" />
					</div>
				</div>
				<h1
					id="pricing-heading"
					class="text-4xl md:text-5xl font-bold text-foreground mb-6"
				>
					Simple, <span class="text-accent">Transparent</span> Pricing
				</h1>
				<p class="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
					Start with a 14-day free trial. No credit card required, cancel anytime.
				</p>

				{#if error}
					<div class="max-w-md mx-auto mb-8" role="alert" aria-live="polite">
						<div class="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
							<div class="flex items-center">
								<AlertCircle
									class="h-5 w-5 text-destructive mr-2"
									aria-hidden="true"
								/>
								<p class="text-destructive">{error}</p>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Pricing Card -->
			<div class="max-w-md mx-auto" role="region" aria-label="Pricing plan">
				<!-- BuildOS Pro -->
				<article
					class="rounded-lg border border-border bg-card shadow-ink p-6 sm:p-8 relative tx tx-frame tx-weak wt-card"
					aria-labelledby="pro-plan-heading"
				>
					{#if data.trialStatus?.is_in_trial}
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
							Your personal productivity operating system
						</p>
						<div class="text-4xl font-bold text-foreground mb-2">
							$20
							<span class="text-lg font-normal text-muted-foreground">/month</span>
						</div>
						<p class="text-sm text-muted-foreground">
							Billed monthly • 14-day free trial
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
							<span class="text-muted-foreground">AI-powered brain dump parsing</span>
						</li>
						<li class="flex items-center">
							<Check
								class="w-5 h-5 text-accent mr-3 flex-shrink-0"
								aria-hidden="true"
							/>
							<span class="text-muted-foreground">Advanced task automation</span>
						</li>
						<li class="flex items-center">
							<Check
								class="w-5 h-5 text-accent mr-3 flex-shrink-0"
								aria-hidden="true"
							/>
							<span class="text-muted-foreground">Daily AI insights & briefs</span>
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
						<Button disabled variant="secondary" size="lg" fullWidth>
							Coming Soon
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
				<article class="bg-muted rounded-lg p-8 border border-border tx tx-frame tx-weak">
					<h3 class="text-xl font-semibold text-foreground mb-4">
						What happens after my 14-day trial?
					</h3>
					<p class="text-muted-foreground">
						After your trial ends, you'll have a 7-day grace period to subscribe. During
						this time, your account will be in read-only mode - you can view all your
						data but cannot create or edit content. Subscribe anytime to regain full
						access.
					</p>
				</article>

				<article class="bg-muted rounded-lg p-8 border border-border tx tx-frame tx-weak">
					<h3 class="text-xl font-semibold text-foreground mb-4">
						Do I need a credit card to start?
					</h3>
					<p class="text-muted-foreground">
						No! You can start your 14-day trial without entering any payment
						information. You'll only need to add a payment method when you're ready to
						subscribe.
					</p>
				</article>

				<article class="bg-muted rounded-lg p-8 border border-border tx tx-frame tx-weak">
					<h3 class="text-xl font-semibold text-foreground mb-4">
						What happens to my data if I cancel?
					</h3>
					<p class="text-muted-foreground">
						You can export all your data at any time. After cancellation, your data
						remains accessible for 30 days before being permanently deleted.
					</p>
				</article>

				<article class="bg-muted rounded-lg p-8 border border-border tx tx-frame tx-weak">
					<h3 class="text-xl font-semibold text-foreground mb-4">
						Can I cancel anytime?
					</h3>
					<p class="text-muted-foreground">
						Absolutely! You can cancel your subscription at any time from your profile
						settings. You'll continue to have access until the end of your billing
						period, then your account will switch to read-only mode.
					</p>
				</article>
			</div>
		</div>
	</section>

	<!-- Final CTA -->
	<section class="py-20 bg-accent text-accent-foreground">
		<div class="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
			<h2 class="text-4xl font-bold mb-6">Ready to Transform Your Productivity?</h2>
			<p class="text-xl opacity-90 mb-12">
				Start your 14-day free trial today. No credit card required.
			</p>

			<div class="flex justify-center">
				<a
					href="/auth/register"
					class="inline-flex items-center px-8 py-4 text-lg font-semibold bg-card text-foreground hover:opacity-90 rounded-lg shadow-ink transform hover:scale-105 motion-reduce:hover:scale-100 transition-all duration-200 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-accent"
				>
					<Brain class="w-5 h-5 mr-3" aria-hidden="true" />
					Start Free Trial
				</a>
			</div>
		</div>
	</section>
</div>
