<!-- apps/web/src/routes/beta/thank-you/+page.svelte -->
<script lang="ts">
	import {
		CheckCircle,
		Users,
		MessageCircle,
		Calendar,
		Mail,
		Clock,
		Heart,
		Star,
		Gift,
		X
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

	function shareOnX() {
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

<main class="min-h-screen bg-background">
	<!-- Hero Section -->
	<section class="pt-12 pb-16 px-4 sm:px-6 lg:px-8">
		<div class="max-w-4xl mx-auto">
			<!-- Success Animation -->
			<div class="text-center mb-12">
				<div class="flex justify-center mb-8">
					<div class="relative {animateIn ? 'animate-bounce' : ''}">
						<div
							class="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center"
						>
							<CheckCircle
								class="w-16 h-16 text-green-600 dark:text-green-400"
								aria-hidden="true"
							/>
						</div>
						<div
							class="absolute -top-2 -right-2 bg-accent text-accent-foreground text-xs font-bold px-2 py-1 rounded-full animate-pulse"
						>
							BETA
						</div>
					</div>
				</div>

				<div class="space-y-4 {animateIn ? 'animate-fade-in' : 'opacity-0'}">
					<h1 class="text-4xl md:text-5xl font-bold text-foreground">🎉 You're In!</h1>
					<p class="text-xl text-muted-foreground max-w-2xl mx-auto">
						Welcome to the BuildOS beta program. I'm personally excited to work with you
						to build the future of AI-powered productivity.
					</p>
					{#if email}
						<p class="text-sm text-muted-foreground">
							Confirmation sent to <span class="font-medium text-accent">{email}</span
							>
						</p>
					{/if}
				</div>
			</div>

			<!-- What Happens Next -->
			<div
				class="bg-card rounded-lg shadow-ink p-8 mb-12 {animateIn
					? 'animate-slide-up'
					: 'opacity-0 translate-y-8'}"
			>
				<header class="text-center mb-8">
					<h2 class="text-2xl font-bold text-foreground mb-2">What Happens Next?</h2>
					<p class="text-muted-foreground">
						Here's your roadmap to getting started with BuildOS
					</p>
				</header>

				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
					<div class="text-center">
						<div
							class="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4"
						>
							<Clock class="w-6 h-6 text-accent" />
						</div>
						<h3 class="font-semibold text-foreground mb-2">Within 24 Hours</h3>
						<p class="text-sm text-muted-foreground">
							Personal welcome email with beta access details
						</p>
					</div>

					<div class="text-center">
						<div
							class="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4"
						>
							<Mail class="w-6 h-6 text-green-600 dark:text-green-400" />
						</div>
						<h3 class="font-semibold text-foreground mb-2">Setup Instructions</h3>
						<p class="text-sm text-muted-foreground">
							Step-by-step guide to get BuildOS running
						</p>
					</div>

					<div class="text-center">
						<div
							class="w-12 h-12 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-4"
						>
							<Calendar class="w-6 h-6 text-purple-600 dark:text-purple-400" />
						</div>
						<h3 class="font-semibold text-foreground mb-2">Feedback Sessions</h3>
						<p class="text-sm text-muted-foreground">
							Optional calls to share your experience directly
						</p>
					</div>

					<div class="text-center">
						<div
							class="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-4"
						>
							<Users class="w-6 h-6 text-orange-600 dark:text-orange-400" />
						</div>
						<h3 class="font-semibold text-foreground mb-2">Beta Community</h3>
						<p class="text-sm text-muted-foreground">
							Connect with other beta users and share insights
						</p>
					</div>
				</div>
			</div>

			<!-- Beta Benefits Reminder -->
			<div
				class="bg-accent rounded-lg shadow-ink p-8 text-accent-foreground mb-12 {animateIn
					? 'animate-slide-up animation-delay-200'
					: 'opacity-0 translate-y-8'}"
			>
				<div class="text-center mb-6">
					<h2 class="text-2xl font-bold mb-2">Your Beta Benefits</h2>
					<p class="opacity-90">As a beta member, you get exclusive access and perks</p>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
					<div class="text-center">
						<div
							class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mx-auto mb-3"
						>
							<Gift class="w-5 h-5" />
						</div>
						<h3 class="font-semibold mb-1">Free Premium Access</h3>
						<p class="text-sm opacity-90">All features unlocked during beta</p>
					</div>

					<div class="text-center">
						<div
							class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mx-auto mb-3"
						>
							<Star class="w-5 h-5" />
						</div>
						<h3 class="font-semibold mb-1">Special Launch Pricing</h3>
						<p class="text-sm opacity-90">Lock in exclusive beta member rates</p>
					</div>

					<div class="text-center">
						<div
							class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mx-auto mb-3"
						>
							<MessageCircle class="w-5 h-5" />
						</div>
						<h3 class="font-semibold mb-1">Direct Founder Access</h3>
						<p class="text-sm opacity-90">Your feedback shapes the product</p>
					</div>
				</div>
			</div>

			<!-- Action Items -->
			<div
				class="text-center space-y-6 {animateIn
					? 'animate-fade-in animation-delay-400'
					: 'opacity-0'}"
			>
				<h2 class="text-2xl font-bold text-foreground">While You Wait...</h2>

				<div class="flex flex-col sm:flex-row gap-4 justify-center">
					<Button
						onclick={shareOnX}
						variant="primary"
						size="lg"
						icon={X}
						aria-label="Share BuildOS beta on X"
					>
						Share on X
					</Button>
					<a
						href="/beta"
						class="inline-flex items-center px-6 py-3 border border-border text-foreground font-semibold rounded-lg hover:bg-accent/10 transition-colors"
						aria-label="Return to beta signup page"
					>
						<Users class="w-5 h-5 mr-2" aria-hidden="true" />
						Invite Others
					</a>
				</div>

				<p class="text-sm text-muted-foreground max-w-md mx-auto">
					Know someone who'd love BuildOS? Beta spots are limited, but great minds think
					alike.
				</p>
			</div>

			<!-- Personal Note -->
			<div
				class="mt-16 bg-card rounded-lg shadow-ink p-8 text-center {animateIn
					? 'animate-fade-in animation-delay-600'
					: 'opacity-0'}"
			>
				<div class="flex justify-center mb-4">
					<div class="w-12 h-12 bg-accent rounded-full flex items-center justify-center">
						<Heart class="w-6 h-6 text-accent-foreground" />
					</div>
				</div>
				<blockquote class="text-lg text-foreground italic mb-4">
					"I'm building BuildOS because I believe AI should amplify human creativity, not
					replace it. Your perspective as a beta user will be invaluable in making this
					vision a reality."
				</blockquote>
				<footer class="text-sm text-muted-foreground">— Founder, BuildOS</footer>
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
