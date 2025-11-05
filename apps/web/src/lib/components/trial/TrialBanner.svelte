<!-- apps/web/src/lib/components/trial/TrialBanner.svelte -->
<script lang="ts">
	import { AlertTriangle, Clock, CreditCard, X } from 'lucide-svelte';
	import { createEventDispatcher } from 'svelte';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		TRIAL_CONFIG,
		getDaysUntilTrialEnd,
		isInTrial,
		isInGracePeriod
	} from '$lib/config/trial';

	interface Props {
		user: {
			trial_ends_at?: string | null;
			subscription_status?: string;
		};
	}

	let { user }: Props = $props();

	const dispatch = createEventDispatcher();

	// Check if previously dismissed this session
	let dismissed = $state(
		typeof window !== 'undefined'
			? sessionStorage.getItem('trial_banner_dismissed') === 'true'
			: false
	);

	let trialEndDate = $derived(user.trial_ends_at ? new Date(user.trial_ends_at) : null);
	let daysLeft = $derived(trialEndDate ? getDaysUntilTrialEnd(trialEndDate) : 0);
	let inTrial = $derived(isInTrial(user));
	let inGracePeriod = $derived(isInGracePeriod(user));
	let showBanner = $derived(
		!dismissed && (inTrial || inGracePeriod) && user.subscription_status !== 'active'
	);

	let bannerClass = $derived({
		warning: daysLeft <= 3 || inGracePeriod,
		info: daysLeft > 3 && daysLeft <= 7,
		normal: daysLeft > 7
	});

	let message = $derived(
		inGracePeriod
			? TRIAL_CONFIG.MESSAGES.gracePeriod(daysLeft)
			: daysLeft <= 3
				? TRIAL_CONFIG.MESSAGES.trialExpiringSoon(daysLeft)
				: TRIAL_CONFIG.MESSAGES.trialActive(daysLeft)
	);

	function handleSubscribe() {
		goto('/pricing');
	}

	function dismiss() {
		dismissed = true;
		// Store dismissal in session storage for this session only
		if (typeof window !== 'undefined') {
			sessionStorage.setItem('trial_banner_dismissed', 'true');
		}
	}
</script>

{#if showBanner}
	<div
		class="relative {bannerClass.warning
			? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
			: bannerClass.info
				? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
				: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'} border-b"
	>
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex items-center justify-between py-3">
				<div class="flex items-center flex-1">
					<div class="flex-shrink-0">
						{#if bannerClass.warning}
							<AlertTriangle class="h-5 w-5 text-red-600 dark:text-red-400" />
						{:else}
							<Clock class="h-5 w-5 text-blue-600 dark:text-blue-400" />
						{/if}
					</div>
					<div class="ml-3 flex-1">
						<p
							class="text-sm font-medium {bannerClass.warning
								? 'text-red-800 dark:text-red-200'
								: bannerClass.info
									? 'text-yellow-800 dark:text-yellow-200'
									: 'text-blue-800 dark:text-blue-200'}"
						>
							{message}
						</p>
					</div>
					<div class="ml-4 flex-shrink-0 flex items-center space-x-4">
						<Button
							onclick={handleSubscribe}
							variant={bannerClass.warning ? 'danger' : 'primary'}
							size="sm"
							icon={CreditCard}
							iconPosition="left"
						>
							Subscribe Now
						</Button>
						<Button
							onclick={dismiss}
							variant="ghost"
							size="sm"
							icon={X}
							class="text-gray-400 hover:text-gray-500 p-1 min-h-0"
							aria-label="Dismiss"
						></Button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
