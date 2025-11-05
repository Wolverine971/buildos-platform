<!-- apps/web/src/lib/components/layout/Footer.svelte -->
<script lang="ts">
	import Button from '$components/ui/Button.svelte';
	import {
		Brain,
		Target,
		FolderOpen,
		Calendar,
		StickyNote,
		Mail,
		Linkedin,
		Twitter,
		Shield,
		Heart,
		Users,
		TrendingUp,
		FileText,
		BookOpen,
		HelpCircle,
		Info,
		DollarSign,
		MessageSquare
	} from 'lucide-svelte';

	export let user: any | null = null;

	const CURRENT_YEAR = new Date().getFullYear();

	// Streamlined navigation for authenticated users
	const AUTH_LINKS = [
		{ href: '/projects', label: 'Projects', icon: FolderOpen },
		{ href: '/history', label: 'History', icon: StickyNote }
	];

	const SUPPORT_LINKS = [
		{ href: '/help', label: 'Help', icon: HelpCircle },
		{ href: '/docs', label: 'Docs', icon: BookOpen },
		{ href: '/feedback', label: 'Feedback', icon: MessageSquare }
	];

	// Guest links - organized in sections
	const GUEST_SECTIONS = [
		{
			title: 'Product',
			links: [
				{ href: '/about', label: 'About', icon: Info },
				{ href: '/pricing', label: 'Pricing', icon: DollarSign },
				{ href: '/beta', label: 'Join Beta', icon: Users }
			]
		},
		{
			title: 'Resources',
			links: [
				{ href: '/blogs', label: 'Blog', icon: FileText },
				{ href: '/help', label: 'Help', icon: HelpCircle },
				{ href: '/docs', label: 'Docs', icon: BookOpen }
			]
		},
		{
			title: 'Company',
			links: [
				{ href: '/contact', label: 'Contact', icon: Mail },
				{ href: '/investors', label: 'Investors', icon: TrendingUp },
				{ href: '/feedback', label: 'Feedback', icon: MessageSquare }
			]
		}
	];

	// Legal links - always shown
	const LEGAL_LINKS = [
		{ href: '/privacy', label: 'Privacy' },
		{ href: '/terms', label: 'Terms' }
	];

	const SOCIAL_LINKS = [
		{ href: 'https://x.com/build_os', icon: Twitter, label: 'Twitter' },
		{
			href: 'https://www.linkedin.com/company/build-os-app',
			icon: Linkedin,
			label: 'LinkedIn'
		}
	];

	$: isAuthenticated = !!user;
</script>

<footer
	class="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-auto no-print"
>
	<div class="max-w-7xl mx-auto">
		{#if isAuthenticated}
			<!-- Authenticated User Footer -->
			<div class="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
				<!-- Mobile Layout -->
				<div class="lg:hidden space-y-6">
					<!-- Brand Section -->
					<div class="flex items-center justify-between">
						<a href="/" class="flex items-center space-x-2">
							<img
								src="/brain-bolt.png"
								alt="BuildOS"
								class="w-6 h-6"
								loading="lazy"
							/>
							<span class="text-lg font-bold text-gray-900 dark:text-white"
								>BuildOS</span
							>
						</a>
						{#if user?.is_admin}
							<span
								class="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full dark:bg-red-900 dark:text-red-300"
							>
								Admin
							</span>
						{/if}
					</div>

					<!-- Quick Links Grid -->
					<div class="grid grid-cols-2 gap-3">
						{#each AUTH_LINKS as link}
							{@const LinkIcon = link.icon}
							<a
								href={link.href}
								class="flex items-center space-x-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50
									hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
							>
								<LinkIcon
									class="w-5 h-5 text-gray-600 dark:text-gray-400
									group-hover:text-gray-900 dark:group-hover:text-white transition-colors"
								/>
								<span
									class="text-sm font-medium text-gray-700 dark:text-gray-300
									group-hover:text-gray-900 dark:group-hover:text-white">{link.label}</span
								>
							</a>
						{/each}
					</div>

					<!-- Support Links -->
					<div class="flex flex-wrap gap-x-4 gap-y-2 justify-center">
						{#each SUPPORT_LINKS as link}
							<a
								href={link.href}
								class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900
									dark:hover:text-white transition-colors"
							>
								{link.label}
							</a>
						{/each}
					</div>

					<!-- Social & Legal -->
					<div class="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
						<!-- Social Icons -->
						<div class="flex justify-center space-x-4">
							{#each SOCIAL_LINKS as social}
								{@const SocialIcon = social.icon}
								<a
									href={social.href}
									class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
										transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
									aria-label={social.label}
								>
									<SocialIcon class="w-5 h-5" />
								</a>
							{/each}
						</div>

						<!-- Legal Links -->
						<div class="flex justify-center space-x-4 text-sm">
							{#each LEGAL_LINKS as link}
								<a
									href={link.href}
									class="text-gray-500 dark:text-gray-400 hover:text-gray-900
										dark:hover:text-white transition-colors"
								>
									{link.label}
								</a>
							{/each}
						</div>
					</div>

					<!-- Admin Link -->
					{#if user?.is_admin}
						<div class="pt-4 border-t border-gray-200 dark:border-gray-800">
							<a
								href="/admin"
								class="flex items-center justify-center space-x-2 p-3 text-red-600 dark:text-red-400
									bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30
									rounded-lg transition-colors"
							>
								<Shield class="w-5 h-5" />
								<span class="font-medium">Admin Dashboard</span>
							</a>
						</div>
					{/if}
				</div>

				<!-- Desktop Layout -->
				<div class="hidden lg:block space-y-6">
					<div class="flex items-center justify-between">
						<!-- Left: Brand and Navigation -->
						<div class="flex items-center space-x-8">
							<a href="/" class="flex items-center space-x-2">
								<img
									src="/brain-bolt.png"
									alt="BuildOS"
									class="w-6 h-6"
									loading="lazy"
								/>
								<span class="text-lg font-bold text-gray-900 dark:text-white"
									>BuildOS</span
								>
							</a>

							<!-- Navigation Links -->
							<nav class="flex items-center space-x-1">
								{#each [...AUTH_LINKS, ...SUPPORT_LINKS] as link}
									<a
										href={link.href}
										class="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600
											dark:text-gray-300 hover:text-gray-900 dark:hover:text-white
											hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md transition-colors"
									>
										{#if link.icon}
											{@const Icon = link.icon}
											<Icon class="w-4 h-4 mr-2" />
										{/if}
										{link.label}
									</a>
								{/each}
								{#if user?.is_admin}
									<a
										href="/admin"
										class="inline-flex items-center px-3 py-2 text-sm font-medium text-red-600
											dark:text-red-400 hover:text-red-700 dark:hover:text-red-300
											hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors ml-2"
									>
										<Shield class="w-4 h-4 mr-2" />
										Admin
									</a>
								{/if}
							</nav>
						</div>

						<!-- Right: Legal and Social -->
						<div class="flex items-center space-x-6">
							<nav class="flex space-x-4">
								{#each LEGAL_LINKS as link}
									<a
										href={link.href}
										class="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900
											dark:hover:text-white transition-colors"
									>
										{link.label}
									</a>
								{/each}
							</nav>
							<div class="flex space-x-2">
								{#each SOCIAL_LINKS as social}
									{@const SocialIcon = social.icon}
									<a
										href={social.href}
										class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
											transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
										aria-label={social.label}
									>
										<SocialIcon class="w-4 h-4" />
									</a>
								{/each}
							</div>
						</div>
					</div>
				</div>

				<!-- Copyright -->
				<div
					class="flex items-center justify-center space-x-1 text-xs text-gray-500 dark:text-gray-400
					mt-6 pt-6 border-t border-gray-200 dark:border-gray-800"
				>
					<span>© {CURRENT_YEAR} BuildOS</span>
					<span>•</span>
					<span>Made with</span>
					<Heart class="w-3 h-3 text-red-500 fill-red-500 mx-1" />
					<span>for productivity</span>
				</div>
			</div>
		{:else}
			<!-- Non-authenticated User Footer -->
			<div class="px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
				<!-- Mobile Layout -->
				<div class="lg:hidden space-y-8">
					<!-- Brand & CTA -->
					<div class="text-center space-y-4">
						<a href="/" class="inline-flex items-center space-x-2">
							<img
								src="/brain-bolt.png"
								alt="BuildOS"
								class="w-8 h-8"
								loading="lazy"
							/>
							<span class="text-xl font-bold text-gray-900 dark:text-white"
								>BuildOS</span
							>
						</a>
						<p class="text-sm text-gray-600 dark:text-gray-400 max-w-xs mx-auto">
							Transform thoughts into structured productivity with AI-powered
							organization.
						</p>

						<!-- CTA Buttons -->
						<div class="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
							<a
								href="/auth/register"
								class="flex-1 inline-flex items-center justify-center px-6 py-3 text-sm font-medium
									text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700
									hover:to-purple-700 rounded-lg transition-all transform hover:scale-105 shadow-md"
							>
								<Brain class="w-4 h-4 mr-2" />
								Start Free
							</a>
							<a
								href="/beta"
								class="flex-1 inline-flex items-center justify-center px-6 py-3 text-sm font-medium
									text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20
									hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
							>
								<Users class="w-4 h-4 mr-2" />
								Join Beta
							</a>
						</div>
					</div>

					<!-- Links Sections -->
					<div class="grid grid-cols-2 gap-8">
						{#each GUEST_SECTIONS.slice(0, 2) as section}
							<div>
								<h4
									class="text-sm font-semibold text-gray-900 dark:text-white mb-3"
								>
									{section.title}
								</h4>
								<ul class="space-y-2">
									{#each section.links as link}
										<li>
											<a
												href={link.href}
												class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900
													dark:hover:text-white transition-colors"
											>
												{link.label}
											</a>
										</li>
									{/each}
								</ul>
							</div>
						{/each}
					</div>

					<!-- Company Links -->
					<div class="text-center">
						<h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">
							Company
						</h4>
						<div class="flex flex-wrap justify-center gap-x-4 gap-y-2">
							{#each GUEST_SECTIONS[2].links as link}
								<a
									href={link.href}
									class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900
										dark:hover:text-white transition-colors"
								>
									{link.label}
								</a>
							{/each}
						</div>
					</div>

					<!-- Social & Legal -->
					<div class="space-y-4 pt-8 border-t border-gray-200 dark:border-gray-800">
						<!-- Social Icons -->
						<div class="flex justify-center space-x-4">
							{#each SOCIAL_LINKS as social}
								{@const SocialIcon = social.icon}
								<a
									href={social.href}
									class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
										transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
									aria-label={social.label}
								>
									<SocialIcon class="w-5 h-5" />
								</a>
							{/each}
						</div>

						<!-- Legal Links -->
						<div class="flex justify-center space-x-4 text-sm">
							{#each LEGAL_LINKS as link}
								<a
									href={link.href}
									class="text-gray-500 dark:text-gray-400 hover:text-gray-900
										dark:hover:text-white transition-colors"
								>
									{link.label}
								</a>
							{/each}
						</div>
					</div>
				</div>

				<!-- Desktop Layout -->
				<div class="hidden lg:block space-y-8">
					<!-- Top Section -->
					<div class="flex items-start justify-between">
						<!-- Brand & Description -->
						<div class="max-w-sm space-y-4">
							<a href="/" class="inline-flex items-center space-x-2">
								<img
									src="/brain-bolt.png"
									alt="BuildOS"
									class="w-8 h-8"
									loading="lazy"
								/>
								<span class="text-xl font-bold text-gray-900 dark:text-white"
									>BuildOS</span
								>
							</a>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Transform thoughts into structured productivity with AI-powered
								organization. Capture ideas, manage projects, and stay organized
								effortlessly.
							</p>
							<!-- CTA Buttons -->
							<div class="flex gap-3 pt-2">
								<a href="/auth/register">
									<Button icon={Brain} variant="primary">Start Free</Button>
								</a>
								<a href="/beta">
									<Button icon={Users} variant="outline">Join Beta</Button>
								</a>
							</div>
						</div>

						<!-- Links Grid -->
						<div class="grid grid-cols-3 gap-8">
							{#each GUEST_SECTIONS as section}
								<div>
									<h4
										class="text-sm font-semibold text-gray-900 dark:text-white mb-4"
									>
										{section.title}
									</h4>
									<ul class="space-y-3">
										{#each section.links as link}
											<li>
												<a
													href={link.href}
													class="inline-flex items-center text-sm text-gray-600 dark:text-gray-400
														hover:text-gray-900 dark:hover:text-white transition-colors group"
												>
													{#if link.icon}
														{@const Icon = link.icon}
														<Icon
															class="w-4 h-4 mr-2 text-gray-400 group-hover:text-gray-600
																dark:group-hover:text-gray-300 transition-colors"
														/>
													{/if}
													{link.label}
												</a>
											</li>
										{/each}
									</ul>
								</div>
							{/each}
						</div>
					</div>

					<!-- Bottom Section -->
					<div
						class="flex items-center justify-between pt-8 border-t border-gray-200 dark:border-gray-800"
					>
						<!-- Legal Links -->
						<nav class="flex space-x-4">
							{#each LEGAL_LINKS as link}
								<a
									href={link.href}
									class="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900
										dark:hover:text-white transition-colors"
								>
									{link.label}
								</a>
							{/each}
						</nav>

						<!-- Social Icons -->
						<div class="flex space-x-2">
							{#each SOCIAL_LINKS as social}
								{@const SocialIcon = social.icon}
								<a
									href={social.href}
									class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
										transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
									aria-label={social.label}
								>
									<SocialIcon class="w-4 h-4" />
								</a>
							{/each}
						</div>
					</div>
				</div>

				<!-- Copyright -->
				<div
					class="flex items-center justify-center space-x-1 text-xs text-gray-500 dark:text-gray-400
					mt-8 pt-8 border-t border-gray-200 dark:border-gray-800"
				>
					<span>© {CURRENT_YEAR} BuildOS</span>
					<span>•</span>
					<span>Made with</span>
					<Heart class="w-3 h-3 text-red-500 fill-red-500 mx-1" />
					<span>for productivity</span>
				</div>
			</div>
		{/if}
	</div>
</footer>

<style>
	/* Enhanced focus states */
	a:focus-visible {
		outline: 2px solid rgb(59 130 246);
		outline-offset: 2px;
		border-radius: 4px;
	}

	/* Smooth transitions */
	a {
		transition: all 0.2s ease;
	}

	/* Better touch targets for mobile */
	@media (max-width: 768px) {
		a {
			-webkit-tap-highlight-color: transparent;
		}
	}
</style>
