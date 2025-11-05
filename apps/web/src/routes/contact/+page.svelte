<!-- apps/web/src/routes/contact/+page.svelte -->
<script lang="ts">
	import { Mail, Linkedin, Twitter, MessageCircle, Lightbulb, TrendingUp } from 'lucide-svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';

	const contactMethods = [
		{
			href: 'https://www.linkedin.com/company/build-os-app',
			icon: Linkedin,
			title: 'BuildOS LinkedIn',
			description: 'Company updates, product launches, and professional insights',
			bgColor: 'bg-blue-100 dark:bg-blue-900/30',
			iconColor: 'text-blue-600 dark:text-blue-400',
			external: true
		},
		{
			href: 'https://x.com/build_os',
			icon: Twitter,
			title: '@build_os',
			description: 'Building in public, product updates, AI productivity tips',
			bgColor: 'bg-sky-100 dark:bg-sky-900/30',
			iconColor: 'text-sky-600 dark:text-sky-400',
			external: true
		},
		{
			href: 'mailto:team@build-os.com',
			icon: Mail,
			title: 'Direct Email',
			description: 'Partnerships, investment, strategic discussions',
			bgColor: 'bg-purple-100 dark:bg-purple-900/30',
			iconColor: 'text-purple-600 dark:text-purple-400',
			external: false
		}
	];

	const founderContacts = [
		{
			href: 'https://linkedin.com/in/djwayne',
			icon: Linkedin,
			title: 'DJ Wayne',
			subtitle: '',
			bgColor: 'bg-blue-50 dark:bg-blue-900/20',
			iconColor: 'text-blue-600 dark:text-blue-400',
			external: true
		}
	];

	const actionCards = [
		{
			href: '/beta',
			icon: MessageCircle,
			title: 'Join Beta',
			description: 'Early access to BuildOS - AI that organizes your brain dumps',
			gradient: 'from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20',
			border: 'border-blue-200 dark:border-blue-800',
			iconColor: 'text-blue-600 dark:text-blue-400',
			badge: 'Limited Access'
		},
		{
			href: '/feedback',
			icon: Lightbulb,
			title: 'Give Feedback',
			description: 'Help shape the future of AI-native productivity',
			gradient: 'from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20',
			border: 'border-amber-200 dark:border-amber-800',
			iconColor: 'text-amber-600 dark:text-amber-400',
			badge: 'Valued'
		},
		{
			href: '/investors',
			icon: TrendingUp,
			title: 'Investment Info',
			description: '$250K pre-seed - Building the LLM productivity platform',
			gradient: 'from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20',
			border: 'border-green-200 dark:border-green-800',
			iconColor: 'text-green-600 dark:text-green-400',
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

<main class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
		<!-- Header -->
		<header class="text-center mb-12">
			<div class="flex justify-center mb-6">
				<video
					src="/onboarding-assets/animations/brain-bolt-electric.mp4"
					class="w-14 h-14 rounded-md"
					autoplay
					loop
					muted
					playsinline
					aria-label="BuildOS"
				></video>
			</div>
			<h1 class="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
				Building BuildOS
			</h1>
			<p class="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-6">
				AI that organizes your brain dumps into structured projects and tasks. Never lose
				information, build context as you go.
			</p>

			<!-- Founder credibility -->
			<div
				class="flex justify-center items-center space-x-6 text-sm text-gray-500 dark:text-gray-400"
			>
				<span class="flex items-center">
					<div class="w-2 h-2 bg-orange-500 rounded-full mr-2"></div>
					Veteran Founder
				</span>
				<span class="flex items-center">
					<div class="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
					YC-backed startup experience
				</span>
				<span class="flex items-center">
					<div class="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
					USMC Veteran
				</span>
			</div>
		</header>

		<!-- Primary Actions -->
		<section class="mb-12">
			<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
				{#each actionCards as card}
					<a
						href={card.href}
						class="relative block bg-gradient-to-r {card.gradient} border {card.border} rounded-xl p-6 hover:shadow-lg transition-all duration-300 group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
					>
						{#if card.badge}
							<div
								class="absolute -top-2 -right-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs px-2 py-1 rounded-full font-medium"
							>
								{card.badge}
							</div>
						{/if}
						<div class="flex items-start space-x-4">
							<div class="flex-shrink-0">
								<svelte:component
									this={card.icon}
									class="w-8 h-8 {card.iconColor} group-hover:scale-110 transition-transform"
								/>
							</div>
							<div>
								<h3 class="font-bold text-gray-900 dark:text-white mb-1">
									{card.title}
								</h3>
								<p class="text-sm text-gray-600 dark:text-gray-400">
									{card.description}
								</p>
							</div>
						</div>
					</a>
				{/each}
			</div>
		</section>

		<!-- Why BuildOS -->
		<section class="bg-white dark:bg-gray-800 rounded-xl p-8 mb-12 shadow-sm">
			<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">
				The Problem We're Solving
			</h2>
			<div class="grid md:grid-cols-2 gap-8">
				<div>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-3">
						Scattered Information
					</h3>
					<p class="text-gray-600 dark:text-gray-400 mb-4">
						Thoughts spread across Notion, Obsidian, Apple Notes, random text files.
						Brilliant ideas lost in daily chaos.
					</p>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-3">
						LLM Context Loss
					</h3>
					<p class="text-gray-600 dark:text-gray-400">
						Constantly repeating project context to Claude/ChatGPT instead of building
						on previous conversations.
					</p>
				</div>
				<div>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-3">
						BuildOS Solution
					</h3>
					<ul class="space-y-2 text-gray-600 dark:text-gray-400">
						<li class="flex items-center">
							<div class="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
							Brain dump → AI organizes automatically
						</li>
						<li class="flex items-center">
							<div class="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
							Build rich project context over time
						</li>
						<li class="flex items-center">
							<div class="w-2 h-2 bg-purple-500 rounded-full mr-3"></div>
							Copy/paste context to any LLM
						</li>
						<li class="flex items-center">
							<div class="w-2 h-2 bg-orange-500 rounded-full mr-3"></div>
							Smart scheduling bridges thoughts to action
						</li>
					</ul>
				</div>
			</div>
		</section>

		<!-- Meet the Founders -->
		<section class="bg-gray-100 dark:bg-gray-800 rounded-xl p-8 mb-12">
			<h2 class="text-2xl font-bold text-gray-900 dark:text-white text-center mb-8">
				Meet the Founder
			</h2>

			<!-- DJ Wayne -->
			<div class="flex items-start space-x-6">
				<img
					src="/s-dj-wayne-profile.webp"
					alt="DJ Wayne"
					class="w-20 h-20 rounded-full object-cover"
					width="80"
					height="80"
					loading="lazy"
				/>
				<div class="flex-1">
					<h3 class="text-xl font-bold text-gray-900 dark:text-white mb-1">DJ Wayne</h3>
					<p class="text-gray-600 dark:text-gray-400 mb-2">
						Dad, former USMC Scout Sniper, creator of <a
							href="https://9takes.com"
							target="_blank"
							class="text-blue-600 hover:underline">9takes</a
						>, Tiny Tibe Adventures, The Cadre Training. Software engineer with
						YC-backed startup experience (Curri).
					</p>
					<p class="text-sm text-gray-500 dark:text-gray-400">
						Brings technical depth and product vision to BuildOS.
					</p>
				</div>
			</div>
		</section>

		<!-- Contact Methods -->
		<section class="mb-12">
			<h3 class="text-1xl font-bold text-gray-900 dark:text-white text-center mb-8">
				Connect With BuildOS
			</h3>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
				{#each contactMethods as method}
					{@const MethodIcon = method.icon}
					<a
						href={method.href}
						{...method.external ? { target: '_blank', rel: 'noopener noreferrer' } : {}}
						class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300 group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
					>
						<div
							class="flex items-center justify-center w-12 h-12 {method.bgColor} rounded-xl mb-4 mx-auto group-hover:scale-110 transition-transform"
						>
							<MethodIcon
								class="w-6 h-6 {method.iconColor}"
							/>
						</div>
						<h3 class="font-semibold text-gray-900 dark:text-white text-center mb-2">
							{method.title}
						</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400 text-center">
							{method.description}
						</p>
					</a>
				{/each}
			</div>

			<!-- Founder Links -->
			<div class="text-center mb-6">
				<p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
					Connect with the founder directly:
				</p>
				<div class="flex justify-center space-x-4">
					{#each founderContacts as founder}
						{@const FounderIcon = founder.icon}
						<a
							href={founder.href}
							{...founder.external
								? { target: '_blank', rel: 'noopener noreferrer' }
								: {}}
							class="inline-flex items-center space-x-2 px-4 py-2 {founder.bgColor} rounded-lg hover:shadow-md transition-all duration-300"
						>
							<FounderIcon
								class="w-4 h-4 {founder.iconColor}"
							/>
							<div class="text-left">
								<span
									class="block text-sm font-medium text-gray-900 dark:text-white"
									>{founder.title}</span
								>
								{#if founder.subtitle}
									<span class="block text-xs text-gray-500 dark:text-gray-400"
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
				class="inline-flex items-center space-x-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-full"
			>
				<div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
				<span class="text-sm font-medium">Response within 24 hours</span>
			</div>
		</footer>
	</div>
</main>
