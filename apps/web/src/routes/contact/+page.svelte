<!-- apps/web/src/routes/contact/+page.svelte -->
<script lang="ts">
	import { Mail, Linkedin, Twitter, MessageCircle, Lightbulb, TrendingUp } from 'lucide-svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import { onMount } from 'svelte';

	let prefersReducedMotion = $state(false);

	onMount(() => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = mediaQuery.matches;

		// Listen for changes
		const handleChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};
		mediaQuery.addEventListener('change', handleChange);

		return () => mediaQuery.removeEventListener('change', handleChange);
	});

	const contactMethods = [
		{
			href: 'https://www.linkedin.com/company/build-os-app',
			icon: Linkedin,
			title: 'BuildOS LinkedIn',
			description: 'Company updates, product launches, and professional insights',
			external: true
		},
		{
			href: 'https://x.com/build_os',
			icon: Twitter,
			title: '@build_os',
			description: 'Building in public, product updates, AI productivity tips',
			external: true
		},
		{
			href: 'mailto:team@build-os.com',
			icon: Mail,
			title: 'Direct Email',
			description: 'Partnerships, investment, strategic discussions',
			external: false
		}
	];

	const founderContacts = [
		{
			href: 'https://linkedin.com/in/djwayne',
			icon: Linkedin,
			title: 'DJ Wayne',
			subtitle: '',
			external: true
		}
	];

	const actionCards = [
		{
			href: '/beta',
			icon: MessageCircle,
			title: 'Join Beta',
			description: 'Early access to BuildOS - AI that organizes your brain dumps',
			badge: 'Limited Access'
		},
		{
			href: '/feedback',
			icon: Lightbulb,
			title: 'Give Feedback',
			description: 'Help shape the future of AI-native productivity',
			badge: 'Valued'
		},
		{
			href: '/investors',
			icon: TrendingUp,
			title: 'Investment Info',
			description: '$250K pre-seed - Building the LLM productivity platform',
			badge: 'Active'
		}
	];
</script>

<SEOHead
	title="Contact BuildOS - Founded by DJ Wayne | AI Productivity Platform"
	description="Contact BuildOS founder DJ Wayne. Building AI that organizes brain dumps into projects. A veteran solving productivity chaos."
	canonical="https://build-os.com/contact"
	keywords="BuildOS contact, DJ Wayne, AI productivity, brain dump organization, productivity platform, veteran founder"
	author="DJ Wayne"
/>

<main class="min-h-screen bg-background">
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
		<!-- Header -->
		<header class="text-center mb-12">
			<div class="flex justify-center mb-6">
				<div
					class="rounded-lg border border-border bg-card shadow-ink w-14 h-14 rounded-sm flex items-center justify-center"
				>
					<video
						src="/onboarding-assets/animations/brain-bolt-electric.mp4"
						class="w-10 h-10"
						autoplay={!prefersReducedMotion}
						loop
						muted
						playsinline
						aria-hidden="true"
					></video>
				</div>
			</div>
			<h1 class="text-4xl md:text-5xl font-bold text-foreground mb-4">Building BuildOS</h1>
			<p class="text-xl text-muted-foreground max-w-2xl mx-auto mb-6">
				AI that organizes your brain dumps into structured projects and tasks. Never lose
				information, build context as you go.
			</p>

			<!-- Founder credibility -->
			<div class="flex justify-center items-center space-x-6 text-sm">
				<span
					class="flex items-center rounded-lg border border-border bg-muted px-2 py-1 text-sm text-muted-foreground"
				>
					<div class="w-2 h-2 bg-accent rounded-full mr-2" aria-hidden="true"></div>
					Veteran Founder
				</span>
				<span
					class="flex items-center rounded-lg border border-border bg-muted px-2 py-1 text-sm text-muted-foreground"
				>
					<div class="w-2 h-2 bg-accent rounded-full mr-2" aria-hidden="true"></div>
					YC-backed startup experience
				</span>
				<span
					class="flex items-center rounded-lg border border-border bg-muted px-2 py-1 text-sm text-muted-foreground"
				>
					<div class="w-2 h-2 bg-accent rounded-full mr-2" aria-hidden="true"></div>
					USMC Veteran
				</span>
			</div>
		</header>

		<!-- Primary Actions -->
		<section class="mb-12" aria-labelledby="primary-actions-heading">
			<h2 id="primary-actions-heading" class="sr-only">Get Started with BuildOS</h2>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
				{#each actionCards as card}
					{@const Icon = card.icon}
					<a
						href={card.href}
						class="relative rounded-lg border border-border bg-card shadow-ink p-6 hover:brightness-105 hover:border-accent transition-all group tx tx-bloom tx-weak pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						{#if card.badge}
							<div
								class="absolute -top-2 -right-2 rounded-full bg-accent text-accent-foreground text-xs font-bold px-2 py-1"
							>
								{card.badge}
							</div>
						{/if}
						<div class="flex items-start space-x-4">
							<div class="flex-shrink-0">
								<div
									class="rounded-lg border border-border bg-card shadow-ink w-12 h-12 rounded-sm flex items-center justify-center"
								>
									<Icon
										class="w-6 h-6 text-foreground group-hover:scale-110 transition-transform"
										aria-hidden="true"
									/>
								</div>
							</div>
							<div>
								<h3 class="font-bold text-foreground mb-1">
									{card.title}
								</h3>
								<p class="text-sm text-muted-foreground">
									{card.description}
								</p>
							</div>
						</div>
					</a>
				{/each}
			</div>
		</section>

		<!-- Why BuildOS -->
		<section
			class="rounded-lg border border-border bg-card shadow-ink p-6 sm:p-8 mb-12 relative tx tx-frame tx-weak"
		>
			<h2 class="text-2xl font-bold text-foreground mb-6">The Problem We're Solving</h2>
			<div class="grid md:grid-cols-2 gap-8">
				<div>
					<h3 class="font-semibold text-foreground mb-3">Scattered Information</h3>
					<p class="text-muted-foreground mb-4">
						Thoughts spread across Notion, Obsidian, Apple Notes, random text files.
						Brilliant ideas lost in daily chaos.
					</p>
					<h3 class="font-semibold text-foreground mb-3">LLM Context Loss</h3>
					<p class="text-muted-foreground">
						Constantly repeating project context to Claude/ChatGPT instead of building
						on previous conversations.
					</p>
				</div>
				<div>
					<h3 class="font-semibold text-foreground mb-3">BuildOS Solution</h3>
					<ul class="space-y-2 text-muted-foreground">
						<li class="flex items-center">
							<div
								class="w-2 h-2 bg-accent rounded-full mr-3"
								aria-hidden="true"
							></div>
							Brain dump → AI organizes automatically
						</li>
						<li class="flex items-center">
							<div
								class="w-2 h-2 bg-accent rounded-full mr-3"
								aria-hidden="true"
							></div>
							Build rich project context over time
						</li>
						<li class="flex items-center">
							<div
								class="w-2 h-2 bg-accent rounded-full mr-3"
								aria-hidden="true"
							></div>
							Copy/paste context to any LLM
						</li>
						<li class="flex items-center">
							<div
								class="w-2 h-2 bg-accent rounded-full mr-3"
								aria-hidden="true"
							></div>
							Smart scheduling bridges thoughts to action
						</li>
					</ul>
				</div>
			</div>
		</section>

		<!-- Meet the Founder -->
		<section
			class="rounded-lg border border-border bg-card shadow-ink p-6 sm:p-8 mb-12 tx tx-frame tx-weak"
		>
			<h2 class="text-2xl font-bold text-foreground text-center mb-8">Meet the Founder</h2>

			<!-- DJ Wayne -->
			<div class="flex items-start space-x-6">
				<img
					src="/s-dj-wayne-profile.webp"
					alt="DJ Wayne"
					class="w-20 h-20 rounded-sm object-cover"
					width="80"
					height="80"
					loading="lazy"
				/>
				<div class="flex-1">
					<h3 class="text-xl font-bold text-foreground mb-1">DJ Wayne</h3>
					<p class="text-muted-foreground mb-2">
						Dad, former USMC Scout Sniper, creator of <a
							href="https://9takes.com"
							target="_blank"
							rel="noopener noreferrer"
							class="text-accent hover:text-accent/80"
							aria-label="9takes personality insights website (opens in new tab)"
							>9takes</a
						>, Tiny Tibe Adventures, The Cadre Training. Software engineer with
						YC-backed startup experience (Curri).
					</p>
					<p class="text-sm text-muted-foreground">
						Brings technical depth and product vision to BuildOS.
					</p>
				</div>
			</div>
		</section>

		<!-- Contact Methods -->
		<section class="mb-12">
			<h2 class="text-xl font-bold text-foreground text-center mb-8">Connect With BuildOS</h2>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
				{#each contactMethods as method}
					{@const MethodIcon = method.icon}
					<a
						href={method.href}
						{...method.external ? { target: '_blank', rel: 'noopener noreferrer' } : {}}
						aria-label="{method.title}{method.external ? ' (opens in new tab)' : ''}"
						class="rounded-lg border border-border bg-card shadow-ink p-6 hover:brightness-105 hover:border-accent transition-all group tx tx-frame tx-weak pressable"
					>
						<div
							class="rounded-lg border border-border bg-card shadow-ink w-12 h-12 rounded-sm flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform"
						>
							<MethodIcon class="w-6 h-6 text-foreground" aria-hidden="true" />
						</div>
						<h3 class="font-semibold text-foreground text-center mb-2">
							{method.title}
						</h3>
						<p class="text-sm text-muted-foreground text-center">
							{method.description}
						</p>
					</a>
				{/each}
			</div>

			<!-- Founder Links -->
			<div class="text-center mb-6">
				<p class="text-sm text-muted-foreground mb-4">Connect with the founder directly:</p>
				<div class="flex justify-center space-x-4">
					{#each founderContacts as founder}
						{@const FounderIcon = founder.icon}
						<a
							href={founder.href}
							{...founder.external
								? { target: '_blank', rel: 'noopener noreferrer' }
								: {}}
							aria-label="{founder.title}{founder.external
								? ' on LinkedIn (opens in new tab)'
								: ''}"
							class="inline-flex items-center space-x-2 px-4 py-3 min-h-[44px] rounded-lg border border-border bg-card shadow-ink hover:brightness-105 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						>
							<FounderIcon class="w-4 h-4 text-foreground" aria-hidden="true" />
							<div class="text-left">
								<span class="block text-sm font-medium text-foreground"
									>{founder.title}</span
								>
								{#if founder.subtitle}
									<span class="block text-xs text-muted-foreground"
										>{founder.subtitle}</span
									>
								{/if}
							</div>
						</a>
					{/each}
				</div>
			</div>
		</section>

		<!-- Response Notice -->
		<footer class="text-center">
			<div
				class="inline-flex items-center space-x-2 rounded-full bg-accent text-accent-foreground text-xs font-bold px-2 py-1"
			>
				<div class="w-2 h-2 bg-accent rounded-full animate-pulse" aria-hidden="true"></div>
				<span class="text-sm font-medium">Response within 24 hours</span>
			</div>
		</footer>
	</div>
</main>
