<!-- apps/web/src/lib/components/profile/BillingTab.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { CreditCard, CircleCheck, Settings } from '$lib/icons/lucide';
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

	// Stripe statuses arrive as keys like `past_due`; show them as plain words.
	function formatStatus(status: string | null | undefined): string {
		if (!status) return 'Unknown';
		const words = status.replace(/_/g, ' ');
		return words.charAt(0).toUpperCase() + words.slice(1);
	}

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
			title={subscriptionDetails.subscription.subscription_plans?.name || 'Pro plan'}
			description="Active subscription"
			icon={CircleCheck}
			labelledById="active-subscription-heading"
		>
			<div class="space-y-4">
				<div>
					<p class="text-2xl font-medium tabular-nums text-foreground">
						${(
							(subscriptionDetails.subscription.subscription_plans?.price_cents ??
								0) / 100
						).toFixed(2)}<span class="text-sm font-normal text-muted-foreground"
							>/{subscriptionDetails.subscription.subscription_plans
								?.billing_interval}</span
						>
					</p>
					<p class="text-xs text-muted-foreground mt-1">
						Next billing: {subscriptionDetails.subscription.current_period_end
							? new Date(
									subscriptionDetails.subscription.current_period_end
								).toLocaleDateString()
							: 'N/A'}
					</p>
				</div>

				<dl class="grid grid-cols-2 gap-4 pt-3 border-t border-border">
					<div>
						<dt class="text-xs text-muted-foreground mb-1">Status</dt>
						<dd class="flex items-center gap-2 text-sm text-foreground">
							<span
								class="h-1.5 w-1.5 rounded-full {subscriptionDetails.subscription
									.status === 'active'
									? 'bg-success'
									: 'bg-muted-foreground/60'}"
								aria-hidden="true"
							></span>
							{formatStatus(subscriptionDetails.subscription.status)}
						</dd>
					</div>
					<div>
						<dt class="text-xs text-muted-foreground mb-1">Member since</dt>
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
						class="pressable"
						icon={Settings}
					>
						Manage subscription
					</Button>
				</form>
			</div>
		</SettingsCard>

		<!-- Invoice Info -->
		<SettingsCard
			title="Invoices"
			description="How we deliver your billing documents."
			labelledById="invoice-information-heading"
		>
			<ul class="text-xs text-muted-foreground space-y-1 list-disc pl-4">
				<li>Invoices are emailed automatically</li>
				<li>Tax ID and business details can be updated in the billing portal</li>
				<li>All invoices include applicable taxes</li>
			</ul>
		</SettingsCard>

		<!-- Payment History -->
		{#if subscriptionDetails.invoices.length > 0}
			<SettingsCard
				title="Payment history"
				description="Recent invoices on this account."
				labelledById="payment-history-heading"
				bodyClass="p-0 sm:p-0"
			>
				<div class="divide-y divide-border">
					{#each subscriptionDetails.invoices as invoice (invoice.id)}
						<div class="flex items-center justify-between gap-3 px-4 py-3">
							<div class="min-w-0">
								<p class="text-sm font-medium tabular-nums text-foreground">
									${(invoice.amount_paid / 100).toFixed(2)}
								</p>
								<p class="text-xs text-muted-foreground">
									{invoice.created_at
										? new Date(invoice.created_at).toLocaleDateString()
										: 'N/A'}
								</p>
							</div>
							<div class="text-right flex-shrink-0">
								<p class="text-xs text-muted-foreground">
									{formatStatus(invoice.status)}
								</p>
								{#if invoice.invoice_pdf}
									<a
										href={invoice.invoice_pdf}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex items-center rounded-lg px-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset min-h-[44px]"
									>
										Download PDF
									</a>
								{:else if invoice.stripe_invoice_id}
									<button
										type="button"
										onclick={() => downloadInvoice(invoice.stripe_invoice_id)}
										class="inline-flex items-center rounded-lg px-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset min-h-[44px]"
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
		<div class="bg-card rounded-xl border border-border tx tx-bloom tx-weak">
			<div class="p-6 text-center">
				<div class="max-w-md mx-auto">
					<h3 class="text-lg sm:text-xl font-medium text-foreground mb-1">
						Upgrade to Pro
					</h3>
					<p class="text-sm text-muted-foreground mb-5">
						Unlock all features and take your productivity to the next level.
					</p>
					<div class="space-y-2 text-left max-w-sm mx-auto mb-5">
						<div class="flex items-start gap-2">
							<CircleCheck
								class="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0"
							/>
							<p class="text-sm text-foreground">
								Google Calendar integration for automatic task scheduling
							</p>
						</div>
						<div class="flex items-start gap-2">
							<CircleCheck
								class="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0"
							/>
							<p class="text-sm text-foreground">
								AI-powered daily briefs to keep you on track
							</p>
						</div>
						<div class="flex items-start gap-2">
							<CircleCheck
								class="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0"
							/>
							<p class="text-sm text-foreground">
								Advanced project phases and timeline management
							</p>
						</div>
						<div class="flex items-start gap-2">
							<CircleCheck
								class="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0"
							/>
							<p class="text-sm text-foreground">
								Priority support and early access to new features
							</p>
						</div>
					</div>
					<a
						href="/pricing"
						class="upgrade-link inline-flex items-center min-h-[44px] px-6 bg-accent hover:bg-accent/90 text-accent-foreground font-medium text-sm rounded-lg pressable transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
					>
						Get started · $20/month
					</a>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.upgrade-link {
		transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
	}
</style>
