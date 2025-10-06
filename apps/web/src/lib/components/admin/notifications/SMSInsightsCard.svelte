<!-- apps/web/src/lib/components/admin/notifications/SMSInsightsCard.svelte -->
<script lang="ts">
	import { Smartphone, CheckCircle, UserCheck, UserX, Clock } from 'lucide-svelte';
	import type { SMSStats } from '$lib/services/notification-analytics.service';

	interface Props {
		data: SMSStats | null;
		loading?: boolean;
	}

	let { data, loading = false }: Props = $props();

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
		if (rate == null) return 'text-gray-500';
		if (rate >= 90) return 'text-green-600';
		if (rate >= 70) return 'text-yellow-600';
		return 'text-red-600';
	}
</script>

<div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
	<div
		class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20"
	>
		<div class="flex items-center">
			<Smartphone class="h-6 w-6 text-purple-600 dark:text-purple-400 mr-2" />
			<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
				SMS Notification Insights
			</h3>
		</div>
	</div>

	{#if loading}
		<div class="p-6 space-y-4">
			{#each Array(3) as _}
				<div class="animate-pulse">
					<div class="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
				</div>
			{/each}
		</div>
	{:else if !data}
		<div class="p-6 text-center text-gray-500">No SMS data available</div>
	{:else}
		<div class="p-6 space-y-6">
			<!-- Phone Verification Stats -->
			<div>
				<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
					Phone Verification
				</h4>
				<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
					<!-- Total with Phone -->
					<div
						class="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
					>
						<div class="flex items-center justify-between">
							<div>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									Users with Phone
								</p>
								<p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">
									{formatNumber(data.total_users_with_phone)}
								</p>
							</div>
							<Smartphone class="h-8 w-8 text-gray-400" />
						</div>
					</div>

					<!-- Verified -->
					<div
						class="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800"
					>
						<div class="flex items-center justify-between">
							<div>
								<p class="text-xs text-gray-500 dark:text-gray-400">Verified</p>
								<p
									class="text-2xl font-bold text-green-600 dark:text-green-400 mt-1"
								>
									{formatNumber(data.users_phone_verified)}
								</p>
								<p class="text-xs text-green-600 dark:text-green-400 mt-1">
									{formatPercentage(data.phone_verification_rate)}
								</p>
							</div>
							<CheckCircle class="h-8 w-8 text-green-400" />
						</div>
					</div>

					<!-- Opted Out -->
					<div
						class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800"
					>
						<div class="flex items-center justify-between">
							<div>
								<p class="text-xs text-gray-500 dark:text-gray-400">Opted Out</p>
								<p class="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
									{formatNumber(data.users_opted_out)}
								</p>
								<p class="text-xs text-red-600 dark:text-red-400 mt-1">
									{formatPercentage(data.opt_out_rate)} of verified
								</p>
							</div>
							<UserX class="h-8 w-8 text-red-400" />
						</div>
					</div>
				</div>
			</div>

			<!-- SMS Adoption -->
			<div>
				<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
					SMS Notifications
				</h4>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<!-- Users with SMS Enabled -->
					<div
						class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800"
					>
						<div class="flex items-center justify-between">
							<div class="flex-1">
								<p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
									SMS Notifications Enabled
								</p>
								<div class="flex items-baseline gap-2">
									<p class="text-2xl font-bold text-blue-600 dark:text-blue-400">
										{formatNumber(data.users_sms_enabled)}
									</p>
									<p class="text-sm text-gray-600 dark:text-gray-400">users</p>
								</div>
								<div class="mt-2">
									<div class="flex items-center justify-between text-xs mb-1">
										<span class="text-gray-600 dark:text-gray-400"
											>Adoption Rate</span
										>
										<span
											class="font-medium {getRateColor(
												data.sms_adoption_rate
											)}">{formatPercentage(data.sms_adoption_rate)}</span
										>
									</div>
									<div class="w-full bg-gray-200 rounded-full h-2">
										<div
											class="bg-blue-600 h-2 rounded-full transition-all"
											style="width: {data.sms_adoption_rate ?? 0}%"
										></div>
									</div>
									<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
										of {formatNumber(data.users_phone_verified)} verified users
									</p>
								</div>
							</div>
							<UserCheck class="h-8 w-8 text-blue-400 ml-4" />
						</div>
					</div>

					<!-- Recent Performance -->
					<div
						class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800"
					>
						<div class="flex items-center justify-between">
							<div class="flex-1">
								<p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
									Last 24 Hours
								</p>
								<div class="flex items-baseline gap-2 mb-3">
									<p
										class="text-2xl font-bold text-purple-600 dark:text-purple-400"
									>
										{formatNumber(data.total_sms_sent_24h)}
									</p>
									<p class="text-sm text-gray-600 dark:text-gray-400">sent</p>
								</div>
								<div class="space-y-2">
									<div class="flex items-center justify-between text-xs">
										<span class="text-gray-600 dark:text-gray-400"
											>Delivery Rate</span
										>
										<span
											class="font-medium {getRateColor(
												data.sms_delivery_rate_24h
											)}">{formatPercentage(data.sms_delivery_rate_24h)}</span
										>
									</div>
									<div class="flex items-center justify-between text-xs">
										<span class="text-gray-600 dark:text-gray-400"
											>Avg Delivery Time</span
										>
										<span class="font-medium text-gray-900 dark:text-white"
											>{formatTime(data.avg_sms_delivery_time_seconds)}</span
										>
									</div>
								</div>
							</div>
							<Clock class="h-8 w-8 text-purple-400 ml-4" />
						</div>
					</div>
				</div>
			</div>

			<!-- Insights Summary -->
			{#if data.users_phone_verified > 0}
				<div
					class="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/10 dark:to-purple-900/10 rounded-lg p-4 border border-blue-200 dark:border-blue-800"
				>
					<h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-2">
						Key Insights
					</h4>
					<ul class="space-y-1 text-sm text-gray-700 dark:text-gray-300">
						{#if data.sms_adoption_rate < 50}
							<li class="flex items-start">
								<span class="mr-2">•</span>
								<span
									>Only {formatPercentage(data.sms_adoption_rate)} of verified users
									have enabled SMS. Consider promoting SMS notifications in onboarding.</span
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
									)}. Check for invalid phone numbers or carrier issues.</span
								>
							</li>
						{/if}
						{#if data.sms_adoption_rate >= 70 && data.sms_delivery_rate_24h >= 95}
							<li class="flex items-start">
								<span class="mr-2 text-green-600">✓</span>
								<span class="text-green-700 dark:text-green-400"
									>SMS channel is performing well with {formatPercentage(
										data.sms_adoption_rate
									)} adoption and {formatPercentage(data.sms_delivery_rate_24h)} delivery
									rate.</span
								>
							</li>
						{/if}
					</ul>
				</div>
			{/if}
		</div>
	{/if}
</div>
