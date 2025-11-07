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

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Hero Section -->
	<section class="py-20 bg-white dark:bg-gray-800" aria-labelledby="pricing-heading">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="text-center mb-16">
				<div class="flex justify-center mb-6">
					<img src="/brain-bolt.png" alt="BuildOS Icon" class="w-16 h-16" />
				</div>
				<h1
					id="pricing-heading"
					class="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6"
				>
					Simple, <span class="text-primary-600">Transparent</span> Pricing
				</h1>
				<p class="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto mb-8">
					Start with a 14-day free trial. No credit card required, cancel anytime.
				</p>

				{#if error}
					<div class="max-w-md mx-auto mb-8" role="alert" aria-live="polite">
						<div
							class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
						>
							<div class="flex items-center">
								<AlertCircle class="h-5 w-5 text-red-600 mr-2" />
								<p class="text-red-800 dark:text-red-200">{error}</p>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Pricing Card -->
			<div class="max-w-md mx-auto" role="region" aria-label="Pricing plan">
				<!-- BuildOS Pro -->
				<article
					class="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-lg border-2 border-primary-500 relative"
					aria-labelledby="pro-plan-heading"
				>
					{#if data.trialStatus?.is_in_trial}
						<!-- Trial Badge -->
						<div class="absolute -top-3 left-1/2 transform -translate-x-1/2">
							<span
								class="bg-emerald-500 text-white px-4 py-1 rounded-full text-sm font-semibold"
							>
								{data.trialStatus.days_until_trial_end} Days Left in Trial
							</span>
						</div>
					{/if}

					<div class="text-center mb-8">
						<h3
							id="pro-plan-heading"
							class="text-2xl font-bold text-gray-900 dark:text-white mb-2"
						>
							BuildOS Pro
						</h3>
						<p class="text-gray-600 dark:text-gray-400 mb-6">
							Your personal productivity operating system
						</p>
						<div class="text-4xl font-bold text-gray-900 dark:text-white mb-2">
							$20
							<span class="text-lg font-normal text-gray-500">/month</span>
						</div>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Billed monthly • 14-day free trial
						</p>
					</div>

					<ul class="space-y-4 mb-8" role="list" aria-label="Plan features">
						<li class="flex items-center">
							<Check class="w-5 h-5 text-primary-500 mr-3 flex-shrink-0" />
							<span class="text-gray-600 dark:text-gray-400">Unlimited projects</span>
						</li>
						<li class="flex items-center">
							<Check class="w-5 h-5 text-primary-500 mr-3 flex-shrink-0" />
							<span class="text-gray-600 dark:text-gray-400"
								>AI-powered brain dump parsing</span
							>
						</li>
						<li class="flex items-center">
							<Check class="w-5 h-5 text-primary-500 mr-3 flex-shrink-0" />
							<span class="text-gray-600 dark:text-gray-400"
								>Advanced task automation</span
							>
						</li>
						<li class="flex items-center">
							<Check class="w-5 h-5 text-primary-500 mr-3 flex-shrink-0" />
							<span class="text-gray-600 dark:text-gray-400"
								>Daily AI insights & briefs</span
							>
						</li>
						<li class="flex items-center">
							<Check class="w-5 h-5 text-primary-500 mr-3 flex-shrink-0" />
							<span class="text-gray-600 dark:text-gray-400"
								>Goal-task alignment tracking</span
							>
						</li>
						<li class="flex items-center">
							<Check class="w-5 h-5 text-primary-500 mr-3 flex-shrink-0" />
							<span class="text-gray-600 dark:text-gray-400"
								>Priority email support</span
							>
						</li>
						<li class="flex items-center">
							<Check class="w-5 h-5 text-primary-500 mr-3 flex-shrink-0" />
							<span class="text-gray-600 dark:text-gray-400"
								>Calendar integrations</span
							>
						</li>
						<li class="flex items-center">
							<Check class="w-5 h-5 text-primary-500 mr-3 flex-shrink-0" />
							<span class="text-gray-600 dark:text-gray-400">Data export</span>
						</li>
					</ul>

					{#if !data.stripeEnabled}
						<Button disabled variant="secondary" size="lg" fullWidth>
							Coming Soon
						</Button>
					{:else if data.hasActiveSubscription}
						<a
							href="/profile?tab=billing"
							class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors text-center block"
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
	<section class="py-20 bg-white dark:bg-gray-800">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="text-center mb-16">
				<h2 class="text-4xl font-bold text-gray-900 dark:text-white mb-6">
					Frequently Asked <span class="text-primary-600">Questions</span>
				</h2>
			</div>

			<div class="space-y-8" role="region" aria-label="Frequently asked questions">
				<article class="bg-gray-50 dark:bg-gray-900 rounded-xl p-8">
					<h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
						What happens after my 14-day trial?
					</h3>
					<p class="text-gray-600 dark:text-gray-400">
						After your trial ends, you'll have a 7-day grace period to subscribe. During
						this time, your account will be in read-only mode - you can view all your
						data but cannot create or edit content. Subscribe anytime to regain full
						access.
					</p>
				</article>

				<article class="bg-gray-50 dark:bg-gray-900 rounded-xl p-8">
					<h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
						Do I need a credit card to start?
					</h3>
					<p class="text-gray-600 dark:text-gray-400">
						No! You can start your 14-day trial without entering any payment
						information. You'll only need to add a payment method when you're ready to
						subscribe.
					</p>
				</article>

				<article class="bg-gray-50 dark:bg-gray-900 rounded-xl p-8">
					<h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
						What happens to my data if I cancel?
					</h3>
					<p class="text-gray-600 dark:text-gray-400">
						You can export all your data at any time. After cancellation, your data
						remains accessible for 30 days before being permanently deleted.
					</p>
				</article>

				<article class="bg-gray-50 dark:bg-gray-900 rounded-xl p-8">
					<h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
						Can I cancel anytime?
					</h3>
					<p class="text-gray-600 dark:text-gray-400">
						Absolutely! You can cancel your subscription at any time from your profile
						settings. You'll continue to have access until the end of your billing
						period, then your account will switch to read-only mode.
					</p>
				</article>
			</div>
		</div>
	</section>

	<!-- Final CTA -->
	<section class="py-20 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
		<div class="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
			<h2 class="text-4xl font-bold mb-6">Ready to Transform Your Productivity?</h2>
			<p class="text-xl text-blue-100 mb-12">
				Start your 14-day free trial today. No credit card required.
			</p>

			<div class="flex justify-center">
				<a
					href="/auth/register"
					class="inline-flex items-center px-8 py-4 text-lg font-semibold text-blue-900 bg-white hover:bg-gray-100 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
				>
					<Brain class="w-5 h-5 mr-3" />
					Start Free Trial
				</a>
			</div>
		</div>
	</section>
</div>
