<!-- apps/web/src/routes/beta/thank-you/+page.svelte -->
<script lang="ts">
	import {
		CheckCircle,
		Users,
		MessageCircle,
		Calendar,
		Mail,
		Clock,
		Twitter,
		Heart,
		Star,
		Gift
	} from 'lucide-svelte';
	import { onMount } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let email = '';
	let animateIn = false;

	onMount(() => {
		// Get email from URL params if passed
		const urlParams = new URLSearchParams(window.location.search);
		const emailParam = urlParams.get('email');
		if (emailParam) {
			email = emailParam;
		}

		// Trigger entrance animation
		setTimeout(() => {
			animateIn = true;
		}, 100);
	});

	function shareOnTwitter() {
		const text =
			'Just joined the BuildOS beta! Excited to help shape the future of AI-powered productivity 🚀';
		const url = window.location.origin + '/beta';
		window.open(
			`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
			'_blank'
		);
	}
</script>

<svelte:head>
	<title>Welcome to BuildOS Beta - Thank You</title>
	<meta
		name="description"
		content="Thank you for joining the BuildOS beta program! Here's what happens next."
	/>
	<meta name="robots" content="noindex" />
</svelte:head>

<main
	class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800"
>
	<!-- Hero Section -->
	<section class="pt-12 pb-16 px-4 sm:px-6 lg:px-8">
		<div class="max-w-4xl mx-auto">
			<!-- Success Animation -->
			<div class="text-center mb-12">
				<div class="flex justify-center mb-8">
					<div class="relative {animateIn ? 'animate-bounce' : ''}">
						<div
							class="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center"
						>
							<CheckCircle
								class="w-16 h-16 text-green-600 dark:text-green-400"
								aria-hidden="true"
							/>
						</div>
						<div
							class="absolute -top-2 -right-2 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse"
						>
							BETA
						</div>
					</div>
				</div>

				<div class="space-y-4 {animateIn ? 'animate-fade-in' : 'opacity-0'}">
					<h1 class="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white">
						🎉 You're In!
					</h1>
					<p class="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
						Welcome to the BuildOS beta program. I'm personally excited to work with you
						to build the future of AI-powered productivity.
					</p>
					{#if email}
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Confirmation sent to <span
								class="font-medium text-blue-600 dark:text-blue-400">{email}</span
							>
						</p>
					{/if}
				</div>
			</div>

			<!-- What Happens Next -->
			<div
				class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-12 {animateIn
					? 'animate-slide-up'
					: 'opacity-0 translate-y-8'}"
			>
				<header class="text-center mb-8">
					<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
						What Happens Next?
					</h2>
					<p class="text-gray-600 dark:text-gray-400">
						Here's your roadmap to getting started with BuildOS
					</p>
				</header>

				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
					<div class="text-center">
						<div
							class="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4"
						>
							<Clock class="w-6 h-6 text-blue-600 dark:text-blue-400" />
						</div>
						<h3 class="font-semibold text-gray-900 dark:text-white mb-2">
							Within 24 Hours
						</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">
							Personal welcome email with beta access details
						</p>
					</div>

					<div class="text-center">
						<div
							class="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4"
						>
							<Mail class="w-6 h-6 text-green-600 dark:text-green-400" />
						</div>
						<h3 class="font-semibold text-gray-900 dark:text-white mb-2">
							Setup Instructions
						</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">
							Step-by-step guide to get BuildOS running
						</p>
					</div>

					<div class="text-center">
						<div
							class="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4"
						>
							<Calendar class="w-6 h-6 text-purple-600 dark:text-purple-400" />
						</div>
						<h3 class="font-semibold text-gray-900 dark:text-white mb-2">
							Feedback Sessions
						</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">
							Optional calls to share your experience directly
						</p>
					</div>

					<div class="text-center">
						<div
							class="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4"
						>
							<Users class="w-6 h-6 text-orange-600 dark:text-orange-400" />
						</div>
						<h3 class="font-semibold text-gray-900 dark:text-white mb-2">
							Beta Community
						</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">
							Connect with other beta users and share insights
						</p>
					</div>
				</div>
			</div>

			<!-- Beta Benefits Reminder -->
			<div
				class="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white mb-12 {animateIn
					? 'animate-slide-up animation-delay-200'
					: 'opacity-0 translate-y-8'}"
			>
				<div class="text-center mb-6">
					<h2 class="text-2xl font-bold mb-2">Your Beta Benefits</h2>
					<p class="text-blue-100">
						As a beta member, you get exclusive access and perks
					</p>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
					<div class="text-center">
						<div
							class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mx-auto mb-3"
						>
							<Gift class="w-5 h-5" />
						</div>
						<h3 class="font-semibold mb-1">Free Premium Access</h3>
						<p class="text-sm text-blue-100">All features unlocked during beta</p>
					</div>

					<div class="text-center">
						<div
							class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mx-auto mb-3"
						>
							<Star class="w-5 h-5" />
						</div>
						<h3 class="font-semibold mb-1">Special Launch Pricing</h3>
						<p class="text-sm text-blue-100">Lock in exclusive beta member rates</p>
					</div>

					<div class="text-center">
						<div
							class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mx-auto mb-3"
						>
							<MessageCircle class="w-5 h-5" />
						</div>
						<h3 class="font-semibold mb-1">Direct Founder Access</h3>
						<p class="text-sm text-blue-100">Your feedback shapes the product</p>
					</div>
				</div>
			</div>

			<!-- Action Items -->
			<div
				class="text-center space-y-6 {animateIn
					? 'animate-fade-in animation-delay-400'
					: 'opacity-0'}"
			>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white">While You Wait...</h2>

				<div class="flex flex-col sm:flex-row gap-4 justify-center">
					<Button
						on:click={shareOnTwitter}
						variant="primary"
						size="lg"
						icon={Twitter}
						aria-label="Share BuildOS beta on Twitter"
					>
						Share on Twitter
					</Button>
					<a
						href="/beta"
						class="inline-flex items-center px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
						aria-label="Return to beta signup page"
					>
						<Users class="w-5 h-5 mr-2" aria-hidden="true" />
						Invite Others
					</a>
				</div>

				<p class="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
					Know someone who'd love BuildOS? Beta spots are limited, but great minds think
					alike.
				</p>
			</div>

			<!-- Personal Note -->
			<div
				class="mt-16 bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-8 text-center {animateIn
					? 'animate-fade-in animation-delay-600'
					: 'opacity-0'}"
			>
				<div class="flex justify-center mb-4">
					<div
						class="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center"
					>
						<Heart class="w-6 h-6 text-white" />
					</div>
				</div>
				<blockquote class="text-lg text-gray-700 dark:text-gray-300 italic mb-4">
					"I'm building BuildOS because I believe AI should amplify human creativity, not
					replace it. Your perspective as a beta user will be invaluable in making this
					vision a reality."
				</blockquote>
				<footer class="text-sm text-gray-600 dark:text-gray-400">— Founder, BuildOS</footer>
			</div>
		</div>
	</section>
</main>

<style>
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes slide-up {
		from {
			opacity: 0;
			transform: translateY(2rem);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-fade-in {
		animation: fade-in 0.6s ease-out;
	}

	.animate-slide-up {
		animation: slide-up 0.6s ease-out;
	}

	.animation-delay-200 {
		animation-delay: 0.2s;
	}

	.animation-delay-400 {
		animation-delay: 0.4s;
	}

	.animation-delay-600 {
		animation-delay: 0.6s;
	}
</style>
