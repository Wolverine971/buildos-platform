<!-- apps/web/src/lib/components/admin/notifications/SMSInsightsCard.svelte -->
<script lang="ts">
	import { Smartphone, CheckCircle, Check, UserCheck, UserX, Clock } from 'lucide-svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import type { SMSStats } from '$lib/services/notification-analytics.service';

	interface Props {
		data: SMSStats | null;
		loading?: boolean;
		timeframeLabel?: string;
	}

	let { data, loading = false, timeframeLabel = '24h' }: Props = $props();

	function formatNumber(num: number): string {
		return new Intl.NumberFormat().format(num);
	}

	function formatPercentage(num: number | null | undefined): string {
		if (num == null) return '0.0%';
		return `${num.toFixed(1)}%`;
	}

	function formatTime(seconds: number | null | undefined): string {
		if (seconds == null || seconds === 0) return 'N/A';
		if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
		return `${seconds.toFixed(2)}s`;
	}

	function getRateColor(rate: number | null | undefined): string {
		if (rate == null) return 'text-muted-foreground';
		if (rate >= 90) return 'text-success';
		if (rate >= 70) return 'text-warning';
		return 'text-destructive';
	}
</script>

<Card variant="elevated">
	<CardHeader variant="accent">
		<div class="flex items-center">
			<Smartphone class="h-6 w-6 text-accent mr-2" />
			<h3 class="text-lg font-semibold text-foreground">SMS Notification Insights</h3>
		</div>
	</CardHeader>

	<CardBody padding="lg">
		{#if loading}
			<div class="space-y-4">
				{#each Array(3) as _}
					<div class="animate-pulse motion-reduce:animate-none">
						<div class="h-20 bg-muted rounded-md"></div>
					</div>
				{/each}
			</div>
		{:else if !data}
			<div class="text-center text-muted-foreground">No SMS data available</div>
		{:else}
			<div class="space-y-6">
				<!-- Phone Verification Stats -->
				<div>
					<h4 class="text-sm font-medium text-foreground mb-3">Phone Verification</h4>
					<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
						<!-- Total with Phone -->
						<div class="bg-muted rounded-lg p-4 border border-border">
							<div class="flex items-center justify-between">
								<div>
									<p class="text-xs text-muted-foreground">Users with Phone</p>
									<p class="text-2xl font-bold text-foreground mt-1">
										{formatNumber(data.total_users_with_phone)}
									</p>
								</div>
								<Smartphone class="h-8 w-8 text-muted-foreground" />
							</div>
						</div>

						<!-- Verified -->
						<div class="bg-success/10 rounded-lg p-4 border border-success/30">
							<div class="flex items-center justify-between">
								<div>
									<p class="text-xs text-muted-foreground">Verified</p>
									<p class="text-2xl font-bold text-success mt-1">
										{formatNumber(data.users_phone_verified)}
									</p>
									<p class="text-xs text-success mt-1">
										{formatPercentage(data.phone_verification_rate)}
									</p>
								</div>
								<CheckCircle class="h-8 w-8 text-success" />
							</div>
						</div>

						<!-- Opted Out -->
						<div class="bg-destructive/10 rounded-lg p-4 border border-destructive/30">
							<div class="flex items-center justify-between">
								<div>
									<p class="text-xs text-muted-foreground">Opted Out</p>
									<p class="text-2xl font-bold text-destructive mt-1">
										{formatNumber(data.users_opted_out)}
									</p>
									<p class="text-xs text-destructive mt-1">
										{formatPercentage(data.opt_out_rate)} of verified
									</p>
								</div>
								<UserX class="h-8 w-8 text-destructive" />
							</div>
						</div>
					</div>
				</div>

				<!-- SMS Adoption -->
				<div>
					<h4 class="text-sm font-medium text-foreground mb-3">SMS Notifications</h4>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<!-- Users with SMS Enabled -->
						<div class="bg-muted rounded-lg p-4 border border-border">
							<div class="flex items-center justify-between">
								<div class="flex-1">
									<p class="text-xs text-muted-foreground mb-2">
										SMS Notifications Enabled
									</p>
									<div class="flex items-baseline gap-2">
										<p class="text-2xl font-bold text-foreground">
											{formatNumber(data.users_sms_enabled)}
										</p>
										<p class="text-sm text-muted-foreground">users</p>
									</div>
									<div class="mt-2">
										<div class="flex items-center justify-between text-xs mb-1">
											<span class="text-muted-foreground">Adoption Rate</span>
											<span
												class="font-medium {getRateColor(
													data.sms_adoption_rate
												)}">{formatPercentage(data.sms_adoption_rate)}</span
											>
										</div>
										<div class="w-full bg-muted rounded-full h-2">
											<div
												class="bg-info h-2 rounded-full transition-all motion-reduce:transition-none"
												style="width: {data.sms_adoption_rate ?? 0}%"
											></div>
										</div>
										<p class="text-xs text-muted-foreground mt-1">
											of {formatNumber(data.users_phone_verified)} verified users
										</p>
									</div>
								</div>
								<UserCheck class="h-8 w-8 text-muted-foreground ml-4" />
							</div>
						</div>

						<!-- Recent Performance -->
						<div class="bg-muted rounded-lg p-4 border border-border">
							<div class="flex items-center justify-between">
								<div class="flex-1">
									<p class="text-xs text-muted-foreground mb-2">
										Selected Period ({timeframeLabel})
									</p>
									<div class="flex items-baseline gap-2 mb-3">
										<p class="text-2xl font-bold text-foreground">
											{formatNumber(data.total_sms_sent_24h)}
										</p>
										<p class="text-sm text-muted-foreground">sent</p>
									</div>
									<div class="space-y-2">
										<div class="flex items-center justify-between text-xs">
											<span class="text-muted-foreground">Delivery Rate</span>
											<span
												class="font-medium {getRateColor(
													data.sms_delivery_rate_24h
												)}"
												>{formatPercentage(
													data.sms_delivery_rate_24h
												)}</span
											>
										</div>
										<div class="flex items-center justify-between text-xs">
											<span class="text-muted-foreground"
												>Avg Delivery Time</span
											>
											<span class="font-medium text-foreground"
												>{formatTime(
													data.avg_sms_delivery_time_seconds
												)}</span
											>
										</div>
									</div>
								</div>
								<Clock class="h-8 w-8 text-muted-foreground ml-4" />
							</div>
						</div>
					</div>
				</div>

				<!-- Insights Summary -->
				{#if data.users_phone_verified > 0}
					<div class="bg-muted rounded-lg p-4 border border-border">
						<h4 class="text-sm font-semibold text-foreground mb-2">Key Insights</h4>
						<ul class="space-y-1 text-sm text-foreground">
							{#if data.sms_adoption_rate < 50}
								<li class="flex items-start">
									<span class="mr-2">•</span>
									<span
										>Only {formatPercentage(data.sms_adoption_rate)} of verified
										users have enabled SMS. Consider promoting SMS notifications
										in onboarding.</span
									>
								</li>
							{/if}
							{#if data.opt_out_rate > 10}
								<li class="flex items-start">
									<span class="mr-2">•</span>
									<span
										>High opt-out rate ({formatPercentage(data.opt_out_rate)}).
										Review message frequency and content relevance.</span
									>
								</li>
							{/if}
							{#if data.sms_delivery_rate_24h < 90}
								<li class="flex items-start">
									<span class="mr-2">•</span>
									<span
										>SMS delivery rate is {formatPercentage(
											data.sms_delivery_rate_24h
										)} for {timeframeLabel}. Check for invalid phone numbers or
										carrier issues.</span
									>
								</li>
							{/if}
							{#if data.sms_adoption_rate >= 70 && data.sms_delivery_rate_24h >= 95}
								<li class="flex items-start">
									<Check class="h-4 w-4 mr-2 mt-0.5 flex-shrink-0 text-success" />
									<span class="text-success"
										>SMS channel is performing well with {formatPercentage(
											data.sms_adoption_rate
										)} adoption and {formatPercentage(
											data.sms_delivery_rate_24h
										)} delivery rate.</span
									>
								</li>
							{/if}
						</ul>
					</div>
				{/if}
			</div>
		{/if}
	</CardBody>
</Card>
