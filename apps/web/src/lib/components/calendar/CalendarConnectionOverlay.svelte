<!-- apps/web/src/lib/components/calendar/CalendarConnectionOverlay.svelte -->
<script lang="ts">
	import { fade } from 'svelte/transition';
	import { Calendar, ArrowRight, Shield, Clock } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { portal } from '$lib/actions/portal';

	let {
		onConnect = () => {}
	}: {
		onConnect?: () => void;
	} = $props();

	let isConnecting = $state(false);
	let hasError = $state(false);
	let errorMessage = $state('');

	async function handleConnect() {
		if (isConnecting) return;

		isConnecting = true;
		hasError = false;
		errorMessage = '';

		try {
			// Fetch the calendar auth URL with redirect back to time-blocks
			const response = await fetch('/profile/calendar?redirect=/time-blocks');

			if (!response.ok) {
				throw new Error('Failed to get calendar authorization URL');
			}

			const data = await response.json();

			if (!data.calendarAuthUrl) {
				throw new Error('No authorization URL received');
			}

			// Redirect to Google OAuth
			window.location.href = data.calendarAuthUrl;
		} catch (error) {
			console.error('Calendar connection error:', error);
			hasError = true;
			errorMessage = error instanceof Error ? error.message : 'Failed to connect calendar';
			isConnecting = false;
		}
	}
</script>

<div
	use:portal
	class="calendar-overlay-root"
	transition:fade={{ duration: 200 }}
	role="dialog"
	aria-modal="true"
	aria-labelledby="calendar-overlay-title"
	aria-describedby="calendar-overlay-description"
>
	<!-- Backdrop with elegant blur -->
	<div
		class="fixed inset-0 bg-white/60 dark:bg-black/60 backdrop-blur-xl z-[100]"
		aria-hidden="true"
	/>

	<!-- Content Container -->
	<div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
		<div
			class="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
			transition:fade={{ duration: 300, delay: 100 }}
		>
			<!-- Decorative gradient top bar -->
			<div class="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

			<!-- Content -->
			<div class="px-8 py-10 sm:px-10 sm:py-12 text-center">
				<!-- Icon Container with subtle animation -->
				<div class="flex justify-center mb-6">
					<div class="relative">
						<!-- Animated rings -->
						<div class="absolute inset-0 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-950/50 dark:to-indigo-950/50 animate-ping opacity-20" />
						<div class="absolute inset-0 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-950/50 dark:to-indigo-950/50 animate-ping animation-delay-200 opacity-15" />

						<!-- Icon circle -->
						<div class="relative w-20 h-20 rounded-full bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border border-blue-200 dark:border-blue-800 flex items-center justify-center">
							<Calendar class="w-10 h-10 text-blue-600 dark:text-blue-400" strokeWidth={1.5} />
						</div>
					</div>
				</div>

				<!-- Title and Description -->
				<h2
					id="calendar-overlay-title"
					class="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight mb-3"
				>
					Calendar Connection Required
				</h2>

				<p
					id="calendar-overlay-description"
					class="text-base text-gray-600 dark:text-gray-400 mb-8 leading-relaxed"
				>
					Connect your Google Calendar to use time blocks. Your focus sessions will sync automatically, helping you protect deep work time and see your full schedule in one place.
				</p>

				<!-- Benefits List -->
				<div class="space-y-3 mb-8">
					<div class="flex items-center gap-3 text-left">
						<div class="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center">
							<Clock class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
						</div>
						<p class="text-sm text-gray-700 dark:text-gray-300">
							Blocks sync to your calendar automatically
						</p>
					</div>
					<div class="flex items-center gap-3 text-left">
						<div class="flex-shrink-0 w-8 h-8 rounded-full bg-purple-50 dark:bg-purple-950/50 flex items-center justify-center">
							<Shield class="w-4 h-4 text-purple-600 dark:text-purple-400" />
						</div>
						<p class="text-sm text-gray-700 dark:text-gray-300">
							See available time slots between events
						</p>
					</div>
				</div>

				<!-- Error Message -->
				{#if hasError}
					<div class="mb-6 px-4 py-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
						<p class="text-sm text-rose-700 dark:text-rose-400">
							{errorMessage}
						</p>
					</div>
				{/if}

				<!-- CTA Button -->
				<Button
					on:click={handleConnect}
					disabled={isConnecting}
					variant="primary"
					size="lg"
					class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium px-6 py-3 rounded-lg shadow-lg hover:shadow-xl transform transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
				>
					{#if isConnecting}
						<div class="flex items-center justify-center gap-2">
							<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
							<span>Connecting...</span>
						</div>
					{:else}
						<div class="flex items-center justify-center gap-2">
							<span>Connect Google Calendar</span>
							<ArrowRight class="w-4 h-4" />
						</div>
					{/if}
				</Button>

				<!-- Privacy Note -->
				<p class="mt-4 text-xs text-gray-500 dark:text-gray-500">
					Takes 30 seconds • We never read your private events
				</p>

				<!-- Navigation Notice -->
				<div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800">
					<p class="text-sm text-gray-600 dark:text-gray-400">
						You can navigate to other pages using the sidebar, but time blocks require calendar connection to function.
					</p>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	/* Ensure overlay is above everything */
	.calendar-overlay-root {
		will-change: opacity;
		z-index: 100;
	}

	/* Stagger animation for ping rings */
	@keyframes ping {
		75%, 100% {
			transform: scale(2);
			opacity: 0;
		}
	}

	:global(.animation-delay-200) {
		animation-delay: 200ms;
	}

	/* Smooth transitions */
	:global(.calendar-overlay-root *) {
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
	}
</style>