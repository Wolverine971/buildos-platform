<!-- apps/web/src/lib/components/profile/BillingTab.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { CreditCard, CircleCheck, Settings, Rocket, Sparkles } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TabHeader from './_shared/TabHeader.svelte';
	import SettingsCard from './_shared/SettingsCard.svelte';
	import { requireApiData } from '$lib/utils/api-client-helpers';
	import { toastService } from '$lib/stores/toast.store';
	import type { PageData } from '../../../routes/profile/$types';

	interface Props {
		subscriptionDetails: PageData['subscriptionDetails'];
	}

	let { subscriptionDetails }: Props = $props();

	async function downloadInvoice(invoiceId: string) {
		try {
			const response = await fetch(`/api/stripe/invoice/${invoiceId}/download`);
			const { url } = await requireApiData<{ url?: string }>(
				response,
				'Failed to get invoice'
			);
			if (url) {
				window.open(url, '_blank');
			}
		} catch (err) {
			console.error('Error downloading invoice:', err);
			toastService.error('Failed to download invoice');
		}
	}
</script>

<div class="space-y-4 sm:space-y-5">
	<TabHeader
		icon={CreditCard}
		title="Billing"
		description="Manage your subscription and payment history."
	/>

	{#if subscriptionDetails?.subscription}
		<!-- Active Subscription -->
		<SettingsCard
			title={subscriptionDetails.subscription.subscription_plans?.name || 'Pro Plan'}
			description="Active subscription"
			icon={CircleCheck}
			labelledById="active-subscription-heading"
		>
			<div class="space-y-4">
				<div>
					<p class="text-2xl font-bold text-foreground">
						${(
							(subscriptionDetails.subscription.subscription_plans?.price_cents ??
								0) / 100
						).toFixed(2)}<span class="text-sm font-normal text-muted-foreground"
							>/{subscriptionDetails.subscription.subscription_plans
								?.billing_interval}</span
						>
					</p>
					<p class="text-xs text-muted-foreground mt-0.5">
						Next billing: {subscriptionDetails.subscription.current_period_end
							? new Date(
									subscriptionDetails.subscription.current_period_end
								).toLocaleDateString()
							: 'N/A'}
					</p>
				</div>

				<dl class="grid grid-cols-2 gap-4 pt-3 border-t border-border">
					<div>
						<dt class="text-xs font-medium text-muted-foreground mb-0.5">Status</dt>
						<dd class="text-sm text-foreground capitalize">
							{subscriptionDetails.subscription.status}
						</dd>
					</div>
					<div>
						<dt class="text-xs font-medium text-muted-foreground mb-0.5">
							Member Since
						</dt>
						<dd class="text-sm text-foreground">
							{subscriptionDetails.subscription.created_at
								? new Date(
										subscriptionDetails.subscription.created_at
									).toLocaleDateString()
								: 'N/A'}
						</dd>
					</div>
				</dl>

				<form method="POST" action="/api/stripe/portal" use:enhance>
					<Button
						type="submit"
						variant="secondary"
						size="sm"
						class="shadow-ink pressable"
						icon={Settings}
					>
						Manage Subscription
					</Button>
				</form>
			</div>
		</SettingsCard>

		<!-- Invoice Info -->
		<SettingsCard
			title="Invoice Information"
			description="How we deliver your billing documents."
			labelledById="invoice-information-heading"
		>
			<ul class="text-xs text-muted-foreground space-y-1">
				<li>• Invoices are emailed automatically</li>
				<li>• Tax ID and business details can be updated in the billing portal</li>
				<li>• All invoices include applicable taxes</li>
			</ul>
		</SettingsCard>

		<!-- Payment History -->
		{#if subscriptionDetails.invoices.length > 0}
			<SettingsCard
				title="Payment History"
				description="Recent invoices on this account."
				labelledById="payment-history-heading"
				bodyClass="p-0 sm:p-0"
			>
				<div class="divide-y divide-border">
					{#each subscriptionDetails.invoices as invoice}
						<div class="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5">
							<div class="min-w-0">
								<p class="text-sm font-medium text-foreground">
									${(invoice.amount_paid / 100).toFixed(2)}
								</p>
								<p class="text-xs text-muted-foreground">
									{invoice.created_at
										? new Date(invoice.created_at).toLocaleDateString()
										: 'N/A'}
								</p>
							</div>
							<div class="text-right flex-shrink-0">
								<p class="text-xs font-medium capitalize text-foreground">
									{invoice.status}
								</p>
								{#if invoice.invoice_pdf}
									<a
										href={invoice.invoice_pdf}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex items-center rounded-md px-2 py-1.5 text-xs font-medium text-accent hover:text-accent/80 hover:bg-accent/10 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
									>
										Download PDF
									</a>
								{:else if invoice.stripe_invoice_id}
									<button
										type="button"
										onclick={() => downloadInvoice(invoice.stripe_invoice_id)}
										class="inline-flex items-center rounded-md px-2 py-1.5 text-xs font-medium text-accent hover:text-accent/80 hover:bg-accent/10 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
									>
										Generate PDF
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</SettingsCard>
		{/if}
	{:else}
		<!-- No Subscription -->
		<div class="bg-card rounded-lg shadow-ink border border-border tx tx-bloom tx-weak">
			<div class="p-5 sm:p-6 text-center">
				<div class="max-w-md mx-auto">
					<div
						class="p-2.5 bg-accent/10 rounded-full w-12 h-12 mx-auto mb-3 flex items-center justify-center"
					>
						<Sparkles class="w-6 h-6 text-accent" />
					</div>
					<h3 class="text-lg sm:text-xl font-bold text-foreground mb-1">
						Upgrade to Pro
					</h3>
					<p class="text-sm text-muted-foreground mb-5">
						Unlock all features and take your productivity to the next level.
					</p>
					<div class="space-y-2 text-left max-w-sm mx-auto mb-5">
						<div class="flex items-start gap-2">
							<CircleCheck class="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
							<p class="text-sm text-foreground">
								Google Calendar integration for automatic task scheduling
							</p>
						</div>
						<div class="flex items-start gap-2">
							<CircleCheck class="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
							<p class="text-sm text-foreground">
								AI-powered daily briefs to keep you on track
							</p>
						</div>
						<div class="flex items-start gap-2">
							<CircleCheck class="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
							<p class="text-sm text-foreground">
								Advanced project phases and timeline management
							</p>
						</div>
						<div class="flex items-start gap-2">
							<CircleCheck class="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
							<p class="text-sm text-foreground">
								Priority support and early access to new features
							</p>
						</div>
					</div>
					<a
						href="/pricing"
						class="inline-flex items-center px-5 py-2.5 bg-accent hover:bg-accent/90 text-accent-foreground font-medium text-sm rounded-lg shadow-ink pressable transition-all duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
					>
						<Rocket class="w-4 h-4 mr-2" />
						Get Started — $20/month
					</a>
				</div>
			</div>
		</div>
	{/if}
</div>
